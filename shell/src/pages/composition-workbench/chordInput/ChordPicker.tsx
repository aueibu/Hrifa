import { useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Button, Chip, Group, Select, Text } from '@mantine/core';
import { projectPitchSetFromPreset, type ProjectPitchSet } from '../compositionSettings';
import { pitchClassName } from '../pitch';
import { pitchLabel } from '../routeTreatments';
import { chordsOnRoot, chordsWithCommonTone, type Chord } from './chords';
import type { ChordRole } from './chordTemplates';
import { PITCH_SET_PRESETS, chromaticSet, togglePitch, type PitchSetPreset } from './pitchSet';
import { inversionCount, pitchClassOf } from './placement';
import type { SpreadStyle, VoicingSpec } from './voicing';
import classes from './ChordPicker.module.css';

const SPREADS: { id: SpreadStyle; label: string }[] = [
  { id: 'close', label: 'Close' },
  { id: 'open', label: 'Open' },
  { id: 'drop2', label: 'Drop 2' },
  { id: 'drop3', label: 'Drop 3' },
];

const INVERSION_LABELS = ['Root pos.', '1st inv.', '2nd inv.', '3rd inv.', '4th inv.'];

const presetLabel = (preset: string) =>
  preset.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** Root mode: chords built on the clicked pitch. Common-tone mode: chords that contain it. */
export type ChordPickerMode = 'root' | 'common';

export interface ChordPickerProps {
  /** Default `root`. State of the editor (Ctrl+click opens `common`), switched by the buttons at the top. */
  mode?: ChordPickerMode;
  /** Without it the Common tone button stays disabled. */
  onModeChange?(next: ChordPickerMode): void;
  /**
   * Common-tone mode only: offer chords over every pitch of the EDO instead of the scale. Tool state
   * like the override, never written to the project.
   */
  allPitches?: boolean;
  onAllPitchesChange?(next: boolean): void;
  /** Common-tone mode: a role was picked; the owner drops the ghosts of the old list. */
  onRoleChange?(next: ChordRole): void;
  /**
   * The clicked pitch (midicents on the roll's 12-row grid). Root mode: the chord's root tone.
   * Common-tone mode: a tone the chord contains, in the role picked.
   */
  anchor: { pitchMidicents: number };
  /** The project's pitch set; used unless `override` is set. Never written by the picker. */
  pitchSet: ProjectPitchSet;
  /** The chord tool's own scale, or null to use the project's. State of the tool, kept by the owner. */
  override: ProjectPitchSet | null;
  onOverrideChange(next: ProjectPitchSet | null): void;
  voicing: VoicingSpec;
  /**
   * A spread or inversion was chosen. `audition` is the gate's verdict for the click; `fallback` is
   * the first chord offered, which the owner uses when no chord is pinned or hovered.
   */
  onVoicingChange(next: VoicingSpec, options: { audition: boolean; fallback: Chord | null }): void;
  /** The chord under the pointer or focus, or null when it left (preview only: silent). */
  onHover(chord: Chord | null): void;
  /**
   * A click on a chord: pin it (its ghost). `audition` says whether the click should also sound,
   * decided by `previewGate`; the owner does the sounding.
   */
  onPin(chord: Chord, options: { audition: boolean }): void;
  /** `click` (default): any click auditions. `ctrl-click`: only Ctrl/Cmd+click does. */
  previewGate?: 'click' | 'ctrl-click';
  /** Double-click or Enter: place the chord. */
  onInsert(chord: Chord): void;
  onClose(): void;
}

/**
 * The chord picker body (root mode). It is the same in every host (dock, takeover): it only
 * knows its props and its container's width (container queries), never where it sits.
 */
export function ChordPicker({
  anchor,
  pitchSet,
  override,
  onOverrideChange,
  mode = 'root',
  onModeChange,
  allPitches = false,
  onAllPitchesChange,
  onRoleChange,
  voicing,
  onVoicingChange,
  onHover,
  onPin,
  previewGate = 'click',
  onInsert,
  onClose,
}: ChordPickerProps) {
  const [scaleOpen, setScaleOpen] = useState(false);
  const { edo } = pitchSet;
  const overridden = override !== null && override.edo === edo;
  const common = mode === 'common';
  const scale = overridden ? override : pitchSet;
  // The set the chords come from: all pitches (common-tone toggle) or the override / project scale.
  const chromatic = useMemo(() => chromaticSet(edo), [edo]);
  const active = common && allPitches ? chromatic : scale;
  const rootPc = pitchClassOf(anchor.pitchMidicents, edo);
  const [pickedRole, setPickedRole] = useState<ChordRole | null>(null);
  // Common tone: the engine's columns (grouped by the role the clicked pitch plays); the list shown
  // is the picked role's, or the first role with chords when nothing is picked or it has none.
  const columns = useMemo(
    () => (common && active.pcs.length > 0 ? chordsWithCommonTone(active, rootPc) : []),
    [common, active, rootPc]
  );
  const role = columns.find((column) => column.role === pickedRole)?.role ?? columns[0]?.role;
  const chords = useMemo(
    () =>
      common
        ? (columns.find((column) => column.role === role)?.chords ?? [])
        : active.pcs.length === 0
          ? []
          : chordsOnRoot(active, rootPc),
    [common, columns, role, active, rootPc]
  );
  const inversions = Math.min(INVERSION_LABELS.length, Math.max(1, inversionCount(chords)));
  const gated = (event: { ctrlKey: boolean; metaKey: boolean }) =>
    previewGate === 'click' || event.ctrlKey || event.metaKey;
  const pcs = Array.from({ length: edo }, (_unused, pc) => pc);

  function moveFocus(event: ReactKeyboardEvent<HTMLElement>, delta: number) {
    const buttons = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-chord-button]'),
    ];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[Math.max(0, Math.min(buttons.length - 1, at + delta))]?.focus();
  }

  return (
    // The key handlers are for keys bubbling up from the buttons inside (Escape, arrows).
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className={classes.picker}
      role="group"
      aria-label="Chord picker"
      onKeyDown={(event) => {
        const target = event.target as HTMLElement | null;
        // Esc meant for a text field, a native select or a Mantine dropdown option is theirs.
        const theirs =
          target &&
          (target.isContentEditable ||
            ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
            target.closest('[role="combobox"], [role="listbox"], [role="option"]'));
        if (event.key === 'Escape' && !theirs) {
          event.preventDefault();
          // The editor's window-level Esc would close it a second time.
          event.stopPropagation();
          onClose();
        }
      }}
    >
      {/* data-layout-base: names the base (narrow default) layout, chords full width with voicing on a second row, not the live one; a wide container re-places the same children by CSS. */}
      <div className={classes.layout} data-layout-base="stacked">
        <Group gap={4} className={classes.modes} wrap="nowrap">
          <Button
            size="compact-xs"
            variant={common ? 'default' : 'filled'}
            aria-pressed={!common}
            onClick={() => onModeChange?.('root')}
          >
            Root
          </Button>
          <Button
            size="compact-xs"
            variant={common ? 'filled' : 'default'}
            aria-pressed={common}
            disabled={!onModeChange}
            onClick={() => onModeChange?.('common')}
          >
            Common tone
          </Button>
        </Group>

        <Text size="xs" className={`${classes.anchorLine} ${classes.muted}`}>
          {common
            ? `Chords containing ${pitchClassName(rootPc, edo)} (${pitchLabel(anchor.pitchMidicents)})`
            : `Chords on ${pitchClassName(rootPc, edo)} (${pitchLabel(anchor.pitchMidicents)})`}
        </Text>

        <div className={classes.chordArea} data-chord-mode={mode}>
          {common && (
            <>
              <Chip
                size="xs"
                variant="outline"
                checked={allPitches}
                onChange={(checked) => onAllPitchesChange?.(checked)}
              >
                All pitches
              </Chip>
              {columns.length > 0 && (
                <div role="group" aria-label="Role of the clicked pitch" className={classes.roles}>
                  <Text size="xs" className={classes.muted}>
                    {pitchClassName(rootPc, edo)} is the
                  </Text>
                  {columns.map((column) => (
                    <button
                      key={column.role}
                      type="button"
                      className={classes.option}
                      aria-pressed={column.role === role}
                      onClick={() => {
                        setPickedRole(column.role);
                        onRoleChange?.(column.role);
                      }}
                    >
                      {column.role}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {active.pcs.length === 0 ? (
            <Text size="xs" role="status" className={classes.empty}>
              No pitches in the scale, so there are no chords to offer. Turn some on under Scale.
            </Text>
          ) : chords.length === 0 ? (
            <Text size="xs" role="status" className={classes.empty}>
              {common
                ? `No chord contains ${pitchClassName(rootPc, edo)} in this scale. Try All pitches.`
                : `No chord on ${pitchClassName(rootPc, edo)} fits this scale.`}
            </Text>
          ) : (
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
            <div
              className={classes.chords}
              role="group"
              aria-label="Chords"
              onMouseLeave={() => onHover(null)}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
                  event.preventDefault();
                  moveFocus(event, 1);
                } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
                  event.preventDefault();
                  moveFocus(event, -1);
                }
              }}
            >
              {chords.map((chord) => (
                <button
                  key={chord.name}
                  type="button"
                  data-chord-button=""
                  className={classes.chord}
                  onMouseEnter={() => onHover(chord)}
                  onFocus={() => onHover(chord)}
                  onBlur={() => onHover(null)}
                  onClick={(event) => {
                    // The second click of a double-click belongs to the insert, not another audition.
                    if (event.detail < 2) {
                      onPin(chord, { audition: gated(event) });
                    }
                  }}
                  onDoubleClick={() => onInsert(chord)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      onInsert(chord);
                    }
                  }}
                >
                  {chord.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={classes.voicing}>
          <div role="group" aria-label="Spread" className={classes.column}>
            <Text size="xs" className={classes.muted}>
              Spread
            </Text>
            {SPREADS.map((spread) => (
              <button
                key={spread.id}
                type="button"
                className={classes.option}
                aria-pressed={voicing.spread === spread.id}
                onClick={(event) => {
                  if (event.detail < 2) {
                    onVoicingChange(
                      { ...voicing, spread: spread.id },
                      { audition: gated(event), fallback: chords[0] ?? null }
                    );
                  }
                }}
              >
                {spread.label}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Inversion" className={classes.column}>
            <Text size="xs" className={classes.muted}>
              Inversion
            </Text>
            {INVERSION_LABELS.slice(0, inversions).map((label, index) => (
              <button
                key={label}
                type="button"
                className={classes.option}
                aria-pressed={Math.min(voicing.inversion, inversions - 1) === index}
                onClick={(event) => {
                  if (event.detail < 2) {
                    onVoicingChange(
                      { ...voicing, inversion: index },
                      { audition: gated(event), fallback: chords[0] ?? null }
                    );
                  }
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className={classes.scale}>
          <button
            type="button"
            className={classes.fold}
            aria-expanded={scaleOpen}
            onClick={() => setScaleOpen((open) => !open)}
          >
            {scaleOpen ? '▾' : '▸'} Scale{' '}
            <span className={classes.muted}>{overridden ? '(custom)' : '(project)'}</span>
          </button>
          {scaleOpen && (
            <div className={classes.foldBody}>
              <Group gap="xs" grow wrap="nowrap" align="flex-end">
                <Select
                  size="xs"
                  label="Preset"
                  data={(edo === 12
                    ? PITCH_SET_PRESETS
                    : PITCH_SET_PRESETS.filter((preset) => preset === 'chromatic')
                  ).map((value) => ({ value, label: presetLabel(value) }))}
                  value={scale.preset}
                  allowDeselect={false}
                  onChange={(value) =>
                    value &&
                    onOverrideChange(
                      projectPitchSetFromPreset(value as PitchSetPreset, scale.tonic, edo)
                    )
                  }
                />
                <Select
                  size="xs"
                  label="Tonic"
                  data={pcs.map((pc) => ({ value: String(pc), label: pitchClassName(pc, edo) }))}
                  value={String(scale.tonic)}
                  allowDeselect={false}
                  disabled={edo !== 12}
                  onChange={(value) =>
                    value !== null &&
                    onOverrideChange(projectPitchSetFromPreset(scale.preset, Number(value), edo))
                  }
                />
              </Group>
              <Group gap={4} role="group" aria-label="Pitches in the scale">
                {pcs.map((pc) => (
                  <Chip
                    key={pc}
                    size="xs"
                    variant="outline"
                    checked={scale.pcs.includes(pc)}
                    onChange={() => onOverrideChange({ ...scale, ...togglePitch(scale, pc) })}
                  >
                    {pitchClassName(pc, edo)}
                  </Chip>
                ))}
              </Group>
              <Button
                size="compact-xs"
                variant="subtle"
                disabled={!overridden}
                onClick={() => onOverrideChange(null)}
              >
                Reset to the project scale
              </Button>
            </div>
          )}
        </div>

        <Text size="xs" className={classes.hint}>
          {previewGate === 'click'
            ? 'Hover previews. Click auditions. Double-click or Enter inserts.'
            : 'Hover previews. Click pins, Ctrl+click auditions. Double-click or Enter inserts.'}
        </Text>
      </div>
    </div>
  );
}
