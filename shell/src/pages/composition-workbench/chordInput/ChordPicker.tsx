import { useEffect, useId, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Button, Chip, Group, Select, Text, Tooltip } from '@mantine/core';
import { projectPitchSetFromPreset, type ProjectPitchSet } from '../compositionSettings';
import { pitchClassName } from '../pitch';
import { pitchLabel } from '../routeTreatments';
import { chordsOnRoot, chordsWithCommonTone, type Chord } from './chords';
import type { ChordRole, ChordTier } from './chordTemplates';
import { stepChordKey } from './navigation';
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

const INVERSION_LABELS = [
  'Root pos.',
  '1st inv.',
  '2nd inv.',
  '3rd inv.',
  '4th inv.',
  '5th inv.',
  '6th inv.',
];

/** Roles are scale degrees; the extension name of the degree is a tooltip on the column header. */
const ROLE_TITLES: Partial<Record<ChordRole, string>> = {
  '2nd': '2nd (also the 9th, b9 or #9 of a ninth chord)',
  '4th': '4th (also the 11th, #11 or b11 of an eleventh chord)',
  '6th': '6th (also the 13th of a thirteenth chord)',
};

const presetLabel = (preset: string) =>
  preset.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** Root mode: chords built on the clicked pitch. Common-tone mode: chords that contain it. */
export type ChordPickerMode = 'root' | 'common';

/**
 * What the picker lets its owner do with the keyboard while focus is elsewhere (the roll): the same
 * navigation the picker's own arrow keys use, so there is one implementation.
 */
export interface ChordPickerControl {
  /** Move the current chord, from `fromKey` (the focused button's `data-chord-key`) when given (Up/Down within a column, Left/Right across; the grid in root mode) and pin it. */
  navigate(dx: number, dy: number, fromKey?: string | null, audition?: boolean): void;
  /** The chord the picker is on (the last one reached or focused), else the first; null when none. */
  current(): Chord | null;
  /** How many inversions the buttons offer (at least 1). */
  inversions(): number;
}

/** The shortcut map, shown in the '?' tooltip and kept in step with the editor's key handler. */
export const CHORD_SHORTCUTS: readonly [string, string][] = [
  ['Arrow keys', 'browse the chords'],
  ['Enter', 'insert the chord'],
  ['Alt+Down / Up', 'inversion: next / previous'],
  ['Alt+Left / Right', 'spread: previous / next'],
  ['Shift+arrows', 'move the anchor on the roll'],
  ['I', 'continuous insert on / off'],
  ['Esc', 'close the picker'],
];

export interface ChordPickerProps {
  /** The owner's handle on the picker's keyboard navigation (see `ChordPickerControl`). */
  controlRef?: MutableRefObject<ChordPickerControl | null>;
  /** Continuous insert: after an insert the owner moves the anchor on, so Enter places the next chord. */
  continuous?: boolean;
  onContinuousChange?(next: boolean): void;
  /** Default `root`. State of the editor (Ctrl+click opens `common`), switched by the buttons at the top. */
  mode?: ChordPickerMode;
  /** Without it the Common tone button stays disabled. */
  onModeChange?(next: ChordPickerMode): void;
  /** Simple (default) lists simple chords only; Extended adds the extended ones. Tool state of the owner. */
  tier?: ChordTier;
  onTierChange?(next: ChordTier): void;
  /**
   * Common-tone mode only: offer chords over every pitch of the EDO instead of the scale. Tool state
   * like the override, never written to the project.
   */
  allPitches?: boolean;
  onAllPitchesChange?(next: boolean): void;
  /**
   * The clicked pitch (midicents on the roll's 12-row grid). Root mode: the chord's root tone.
   * Common-tone mode: a tone the chord contains, in the role picked.
   */
  anchor: { pitchMidicents: number };
  /** The anchor is an existing note the chord is stacked on (M7): the header says so. */
  onNote?: boolean;
  /** For a note anchor: the note's real pitch minus the snapped anchor, in midicents (shown above 1). */
  noteOffsetCents?: number;
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
  onNote = false,
  noteOffsetCents = 0,
  pitchSet,
  override,
  onOverrideChange,
  mode = 'root',
  onModeChange,
  allPitches = false,
  onAllPitchesChange,
  tier = 'simple',
  onTierChange,
  voicing,
  onVoicingChange,
  onHover,
  onPin,
  previewGate = 'click',
  onInsert,
  onClose,
  controlRef,
  continuous = false,
  onContinuousChange,
}: ChordPickerProps) {
  const headerPrefix = useId();
  const [scaleOpen, setScaleOpen] = useState(false);
  // Roving tabindex: the chord button last focused (by key) is the only Tab stop of the chord area.
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const { edo } = pitchSet;
  const overridden = override !== null && override.edo === edo;
  const common = mode === 'common';
  const scale = overridden ? override : pitchSet;
  // The set the chords come from: all pitches (common-tone toggle) or the override / project scale.
  const chromatic = useMemo(() => chromaticSet(edo), [edo]);
  const active = common && allPitches ? chromatic : scale;
  const rootPc = pitchClassOf(anchor.pitchMidicents, edo);
  // Common tone: the engine's columns, one per role the clicked pitch can play, all shown at once.
  const columns = useMemo(
    () => (common && active.pcs.length > 0 ? chordsWithCommonTone(active, rootPc, { tier }) : []),
    [common, active, rootPc, tier]
  );
  const chords = useMemo(
    () =>
      common
        ? columns.flatMap((column) => column.chords)
        : active.pcs.length === 0
          ? []
          : chordsOnRoot(active, rootPc, { tier }),
    [common, columns, active, rootPc, tier]
  );
  const inversions = Math.min(INVERSION_LABELS.length, Math.max(1, inversionCount(chords)));
  const gated = (event: { ctrlKey: boolean; metaKey: boolean }) =>
    previewGate === 'click' || event.ctrlKey || event.metaKey;
  const pcs = Array.from({ length: edo }, (_unused, pc) => pc);

  const chordKey = (chord: Chord, role?: string) => (role ? `${role}:${chord.name}` : chord.name);
  const allKeys = common
    ? columns.flatMap((column) => column.chords.map((chord) => chordKey(chord, column.role)))
    : chords.map((chord) => chordKey(chord));
  // A key that is gone (the list changed) falls back to the first chord.
  const tabbableKey = currentKey !== null && allKeys.includes(currentKey) ? currentKey : allKeys[0];
  const keyColumns = common
    ? columns.map((column) => column.chords.map((chord) => chordKey(chord, column.role)))
    : [allKeys];
  const chordByKey = new Map<string, Chord>();
  if (common) {
    columns.forEach((column) =>
      column.chords.forEach((chord) => chordByKey.set(chordKey(chord, column.role), chord))
    );
  } else {
    chords.forEach((chord) => chordByKey.set(chordKey(chord), chord));
  }
  const rootRef = useRef<HTMLDivElement>(null);

  /**
   * One implementation of arrow navigation: moves the current chord, follows it with DOM focus when
   * focus is in the picker (and scrolls it into view), and pins it. A key press counts as a click
   * for the preview gate, so it sounds only in `click` mode.
   */
  function navigate(dx: number, dy: number, fromKey: string | null = null, allowAudition = true) {
    const next = stepChordKey(
      keyColumns,
      common ? 'common' : 'root',
      fromKey ?? tabbableKey ?? null,
      dx,
      dy
    );
    const chord = next === null ? undefined : chordByKey.get(next);
    if (next === null || !chord) {
      return;
    }
    setCurrentKey(next);
    const button = [
      ...(rootRef.current?.querySelectorAll<HTMLElement>('[data-chord-key]') ?? []),
    ].find((candidate) => candidate.dataset.chordKey === next);
    if (button && rootRef.current?.contains(document.activeElement)) {
      button.focus();
    }
    onPin(chord, { audition: allowAudition && previewGate === 'click' });
  }
  // The owner's handle, refreshed every render so it never reads a stale list. It is not cleared
  // between renders (a key landing in that gap would find nothing), only when the picker goes.
  useEffect(() => {
    if (controlRef) {
      controlRef.current = {
        navigate: (dx, dy, fromKey, audition) =>
          navigate(dx, dy, fromKey ?? null, audition ?? true),
        current: () => (tabbableKey !== undefined ? (chordByKey.get(tabbableKey) ?? null) : null),
        inversions: () => inversions,
      };
    }
  });
  useEffect(
    () => () => {
      if (controlRef) {
        controlRef.current = null;
      }
    },
    [controlRef]
  );
  // The current chord stays in view however it was reached (keys from the roll, a click, a new
  // list). Nearest edge only, and the sticky role header is cleared by the area's scroll-padding.
  useEffect(() => {
    if (tabbableKey === undefined) {
      return;
    }
    [...(rootRef.current?.querySelectorAll<HTMLElement>('[data-chord-key]') ?? [])]
      .find((candidate) => candidate.dataset.chordKey === tabbableKey)
      ?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [tabbableKey]);

  const chordButton = (chord: Chord, role?: string) => (
    <button
      key={chord.name}
      type="button"
      tabIndex={chordKey(chord, role) === tabbableKey ? 0 : -1}
      // The current chord (the one Enter inserts and the ghost shows), whatever has DOM focus.
      data-current={chordKey(chord, role) === tabbableKey ? '' : undefined}
      aria-current={chordKey(chord, role) === tabbableKey ? 'true' : undefined}
      data-chord-button=""
      data-chord-key={chordKey(chord, role)}
      title={chord.name}
      className={classes.chord}
      onMouseEnter={() => onHover(chord)}
      onFocus={() => {
        setCurrentKey(chordKey(chord, role));
        onHover(chord);
      }}
      onBlur={() => onHover(null)}
      onClick={(event) => {
        setCurrentKey(chordKey(chord, role));
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
  );

  return (
    // The key handlers are for keys bubbling up from the buttons inside (Escape, arrows).
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={rootRef}
      className={classes.picker}
      data-chord-picker=""
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
        <Group gap={4} className={classes.modes} wrap="wrap">
          <Button.Group>
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
          </Button.Group>
          <Button.Group>
            <Button
              size="compact-xs"
              variant={tier === 'simple' ? 'filled' : 'default'}
              aria-pressed={tier === 'simple'}
              disabled={!onTierChange}
              title="Simple chords only"
              onClick={() => onTierChange?.('simple')}
            >
              Simple
            </Button>
            <Button
              size="compact-xs"
              variant={tier === 'extended' ? 'filled' : 'default'}
              aria-pressed={tier === 'extended'}
              disabled={!onTierChange}
              title="Simple and extended chords"
              onClick={() => onTierChange?.('extended')}
            >
              Extended
            </Button>
          </Button.Group>
          <Button
            size="compact-xs"
            variant={continuous ? 'filled' : 'default'}
            aria-pressed={continuous}
            disabled={!onContinuousChange}
            title="Continuous insert (I): after an insert the anchor moves on by the chord length"
            onClick={() => onContinuousChange?.(!continuous)}
          >
            Continuous
          </Button>
          <Tooltip
            events={{ hover: true, focus: true, touch: true }}
            multiline
            w={260}
            withArrow
            label={
              <>
                {CHORD_SHORTCUTS.map(([keys, what]) => (
                  <div key={keys}>
                    {keys}: {what}
                  </div>
                ))}
              </>
            }
          >
            <Button size="compact-xs" variant="subtle" aria-label="Keyboard shortcuts">
              ?
            </Button>
          </Tooltip>
        </Group>

        <Text size="xs" className={`${classes.anchorLine} ${classes.muted}`}>
          {onNote
            ? `On ${pitchLabel(anchor.pitchMidicents)}${
                Math.abs(noteOffsetCents) > 1
                  ? ` ${noteOffsetCents > 0 ? '+' : '-'}${Math.round(Math.abs(noteOffsetCents))}c`
                  : ''
              } (note): ${common ? 'chords containing' : 'chords on'} ${pitchClassName(rootPc, edo)}`
            : common
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
                <Text size="xs" className={`${classes.muted} ${classes.roleLine}`}>
                  {pitchClassName(rootPc, edo)} is the ...
                </Text>
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
              className={common ? classes.columnsScroll : classes.chords}
              role="group"
              aria-label="Chords"
              onMouseLeave={() => onHover(null)}
              onKeyDown={(event) => {
                const vertical = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
                const horizontal =
                  event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
                // Modified arrows belong to the editor's key map (voicing, moving the anchor).
                if (
                  (!vertical && !horizontal) ||
                  event.altKey ||
                  event.shiftKey ||
                  event.ctrlKey ||
                  event.metaKey
                ) {
                  return;
                }
                event.preventDefault();
                const from = (event.target as HTMLElement).closest<HTMLElement>('[data-chord-key]');
                navigate(horizontal, vertical, from?.dataset.chordKey ?? null);
              }}
            >
              {common ? (
                <div className={classes.columns}>
                  {columns.map((column) => (
                    <div
                      key={column.role}
                      className={classes.roleColumn}
                      role="group"
                      aria-labelledby={`${headerPrefix}-${column.role}`}
                      data-role-column=""
                      data-role={column.role}
                    >
                      <div
                        id={`${headerPrefix}-${column.role}`}
                        className={classes.roleHeader}
                        title={ROLE_TITLES[column.role]}
                      >
                        {column.role}
                      </div>
                      {column.chords.map((chord) => chordButton(chord, column.role))}
                    </div>
                  ))}
                </div>
              ) : (
                chords.map((chord) => chordButton(chord))
              )}
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

        <div className={classes.hint}>
          <Text size="xs">
            {previewGate === 'click'
              ? 'Hover previews. Click auditions. Double-click or Enter inserts.'
              : 'Hover previews. Click pins, Ctrl+click auditions. Double-click or Enter inserts.'}
            {common && columns.length > 0
              ? ' Scroll the columns, or use the takeover for more room.'
              : ''}
          </Text>
          <Text size="xs">
            Keys: arrows browse, Enter inserts, Alt+arrows voicing, Shift+arrows move the anchor, I
            continuous.
          </Text>
        </div>
      </div>
    </div>
  );
}
