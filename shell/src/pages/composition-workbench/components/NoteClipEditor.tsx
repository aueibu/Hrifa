import { Fragment, useCallback, useMemo, useState } from 'react';
import { Badge, Button, Menu, Text, Title } from '@mantine/core';
import type { EditorAction, EditorTool } from '../../../components/EditorPalette';
import {
  defaultPianoRollView,
  gridDensity,
  PianoRoll,
  VelocityLane,
  VelocityLaneToggle,
  type PianoRollGridSource,
  type PianoRollNewNote,
  type PianoRollRange,
  type PianoRollViewState,
} from '../../../components/PianoRoll';
import { freezeClipProperties, readClipProperties } from '../clipProperties';
import { registerClipEditor, type ClipEditorProps } from '../clipTypes';
import { useCompositionSettings } from '../compositionSettings';
import { useDesk } from '../desk';
import type { DataPacket } from '../model';
import { rationalToNumber } from '../musicalTime';
import {
  addNote,
  addNotes,
  changeVelocity,
  clipExtent,
  clipRollDuration,
  deleteNotes,
  moveNotes,
  newNoteItemId,
  NOTE_EDIT_OPERATION,
  packetRollNotes,
  resizeNotes,
  splitNote,
} from '../noteClipEdits';
import { GRID_OPTIONS, useNoteEditorPreferences } from '../noteEditorPreferences';
import {
  clearTimeSelection,
  emptyNoteSelection,
  extendRange,
  followEdit,
  itemsBand,
  pruneSelection,
  selectIds,
  selectTime,
  type NoteSelection,
} from '../noteSelection';
import { scaleDegreeColor } from '../scaleDegreeColor';
import { jsonEqual } from '../snippet';
import { parseMeter } from '../transport';
import classes from './NoteClipEditor.module.css';

/** The editor id the Notes clip type names (clipTypes.ts). */
export const NOTE_EDITOR_ID = 'note-roll';

const VELOCITY_STEP = 0.1;

/**
 * The tools, in Bitwig's order. The digit is the shortcut, matched only while the roll has focus
 * (the roll handles the key, so a digit typed into a text field is never taken).
 */
const tools: EditorTool[] = [
  { id: 'pointer', label: 'Pointer', shortcut: '1' },
  { id: 'time', label: 'Time', shortcut: '2' },
  { id: 'pencil', label: 'Pencil', shortcut: '3' },
  { id: 'paint', label: 'Paint', shortcut: '4' },
  { id: 'knife', label: 'Knife', shortcut: '5' },
  { id: 'eraser', label: 'Eraser', shortcut: '6' },
];

/**
 * The editor's time zoom, in pixels per quarter note. The roll's own range stops at 16, which is a
 * few bars wide; a note clip can be 72000 bars, so this one zooms out to a quarter of a pixel per
 * quarter note (a 1500 px view then shows 1500 bars, the far levels of the grid's bar thinning).
 */
export const NOTE_EDITOR_TIME_ZOOM = { min: 0.25, max: 192 };

/**
 * The grid of a meter and grid unit for the time range the roll asks for (quarter notes): every
 * decision (which lines exist, which bar numbers print) is gridDensity.ts's, shared by the roll, the
 * velocity lane and the ruler. The count is bounded by the width on screen, never by the length.
 */
export function gridSourceFor(meter: string, gridUnit?: number): PianoRollGridSource {
  const { numerator, denominator } = parseMeter(meter);
  return (from, to, pixelsPerQuarter, extent) =>
    gridDensity({
      meter: { numerator, denominator },
      gridUnit,
      pixelsPerQuarter,
      from,
      to,
      extent,
    });
}

/** A blank clip opens centered on middle C; a clip with notes is fitted to them by the roll. */
function openingView(packet: DataPacket): PianoRollViewState {
  if (packet.items.length > 0) {
    return defaultPianoRollView;
  }
  return {
    ...defaultPianoRollView,
    framed: true,
    scrollTop: (127 - 72) * defaultPianoRollView.pixelsPerSemitone,
  };
}

interface SelectionState {
  selection: NoteSelection;
  /** The packet the selection's range was computed against. */
  basis: DataPacket;
}

/** The selection against the packet on screen: pruned, and re-ranged if the packet is not its basis. */
function currentSelection(state: SelectionState, packet: DataPacket): NoteSelection {
  const pruned = pruneSelection(state.selection, packet);
  // A change that leaves the notes alone (the clip's length, loop, ...) keeps the range too.
  // Identity first: a packet that only changed its length or loop shares its item list.
  return state.basis === packet ||
    state.basis.items === packet.items ||
    jsonEqual(state.basis.items, packet.items)
    ? pruned
    : selectIds(packet, pruned.ids);
}

function NoteClipEditorBody({ snippet }: ClipEditorProps) {
  const { commitSnippetEditById, latestSnippetById, loading, locked } = useDesk();
  const { settings } = useCompositionSettings();
  const { packet } = snippet;
  // Transient view state: tool, selection (events and the time they occupy), zoom and scroll live in
  // this component only. They are never recorded in the history and never written to the packet.
  const [view, setView] = useState(() => openingView(packet));
  // Pencil on an empty clip, Pointer otherwise.
  const [tool, setTool] = useState(() => (packet.items.length > 0 ? 'pointer' : 'pencil'));
  // Per-viewer: the remembered entry length and the grid. Neither is history or part of a project.
  const [preferences, updatePreferences] = useNoteEditorPreferences();
  const gridOption =
    GRID_OPTIONS.find((option) => option.id === preferences.grid) ?? GRID_OPTIONS[0];
  // The selection remembers the packet it was last computed against (`basis`). When the packet is
  // something else (an undo of a move, another tab's change), the range falls back to the time the
  // selected notes now occupy instead of showing a stale band.
  const [selectionState, setSelectionState] = useState<SelectionState>(() => ({
    selection: emptyNoteSelection,
    basis: packet,
  }));
  const [notice, setNotice] = useState<string | null>(null);
  const selection = useMemo(
    () => currentSelection(selectionState, packet),
    [selectionState, packet]
  );

  // One band at a time: the cyan time band for a time selection, otherwise the faint neutral band
  // over the span the selected notes occupy.
  const timeBand = selection.kind === 'time' ? selection.range : null;
  const notesBand = itemsBand(selection);

  // Functional, because one roll event can change the selection twice (a marquee sets the ids, then
  // widens the range).
  function setSelection(change: (current: NoteSelection) => NoteSelection) {
    setSelectionState((state) => ({
      selection: change(currentSelection(state, packet)),
      basis: packet,
    }));
  }

  // Optionally coloured by scale degree (a setting); otherwise the roll's single note color.
  const { colorByScaleDegree, edo } = settings;
  const notes = useMemo(() => {
    const plain = packetRollNotes(packet);
    return colorByScaleDegree
      ? plain.map((note) => ({ ...note, color: scaleDegreeColor(note.pitchMidicents, edo) }))
      : plain;
  }, [packet, colorByScaleDegree, edo]);
  // Previews (entry, paint, ghosts) wear the color of the pitch under the pointer, same function.
  const pitchColor = useCallback(
    (pitchMidicents: number) =>
      colorByScaleDegree ? scaleDegreeColor(pitchMidicents, edo) : undefined,
    [colorByScaleDegree, edo]
  );
  const clipProperties = useMemo(() => readClipProperties(packet), [packet]);
  const extent = clipExtent(packet);
  const loopBand = clipProperties.loopOn
    ? {
        start: rationalToNumber(clipProperties.loopStart),
        end: rationalToNumber(clipProperties.loopEnd),
      }
    : undefined;
  const clipMeter = clipProperties.timeSignature;
  const { numerator, denominator } = parseMeter(clipMeter);
  const barLength = (numerator * 4) / denominator;
  // The roll shows the clip and any note past its end, plus a bar of room to draw into.
  const duration = useMemo(() => clipRollDuration(packet) + barLength, [packet, barLength]);
  const gridUnit = gridOption.quarters ?? undefined;
  const gridLines = useMemo(() => gridSourceFor(clipMeter, gridUnit), [clipMeter, gridUnit]);
  const refusal = loading
    ? 'The desk is still loading, so the clip cannot be edited yet.'
    : locked
      ? 'The saved desk could not be read, so changes to it are turned off.'
      : null;

  /**
   * Applies one edit through the desk as a hand edit: the clip keeps its id, a run of edits is one
   * version, and each call is one undo step (the roll reports a drag once, on release).
   */
  function commit(
    edit: (current: DataPacket) => DataPacket,
    after?: (next: DataPacket) => NoteSelection
  ) {
    if (refusal) {
      setNotice(refusal);
      return;
    }
    // The single choke point for note edits: an old clip with no stored properties gets its full
    // default set written as part of its FIRST edit (length from the content as it is now), in the
    // same packet, so one version and one undo step, and its length never drifts as notes move.
    // Built from the desk's packet as it is now (not the last render), so an edit that landed
    // since, such as a property change from the inspector, is never reverted.
    const current = latestSnippetById(snippet.id)?.packet ?? packet;
    const base = freezeClipProperties(current);
    const next = edit(base);
    if (next === base) {
      return;
    }
    const result = commitSnippetEditById(snippet.id, next, NOTE_EDIT_OPERATION, { handEdit: true });
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    setNotice(null);
    setSelectionState({
      selection: after ? after(next) : followEdit(selection, packet, next),
      basis: result.snippet.packet,
    });
  }

  function draw(note: PianoRollNewNote) {
    const id = newNoteItemId(snippet.id);
    commit(
      (current) => addNote(current, note, id, note.velocity),
      (next) => selectIds(next, [id])
    );
  }

  function paint(painted: PianoRollNewNote[]) {
    const ids = painted.map(() => newNoteItemId(snippet.id));
    commit(
      (current) => addNotes(current, painted, ids),
      (next) => selectIds(next, ids)
    );
  }

  function split(id: string, at: number) {
    const right = newNoteItemId(snippet.id);
    commit((current) => splitNote(current, id, at, right));
  }

  function remove(ids: string[]) {
    commit(
      (current) => deleteNotes(current, ids),
      (next) => pruneSelection(selection, next)
    );
  }

  /** One offset for every id, each clamped on its own; a roll or lane drag reports it once. */
  function changeSelectionVelocity(ids: string[], delta: number) {
    commit((current) => changeVelocity(current, ids, delta));
  }

  const actions: EditorAction[] = [
    {
      id: 'delete',
      label: 'Delete',
      shortcut: 'Delete',
      run: ({ selectedIds }) => remove(selectedIds),
    },
    {
      id: 'louder',
      label: 'Louder',
      shortcut: ']',
      run: ({ selectedIds }) =>
        commit((current) => changeVelocity(current, selectedIds, VELOCITY_STEP)),
    },
    {
      id: 'softer',
      label: 'Softer',
      shortcut: '[',
      run: ({ selectedIds }) =>
        commit((current) => changeVelocity(current, selectedIds, -VELOCITY_STEP)),
    },
  ];

  return (
    <div className={classes.editor}>
      <div className={classes.header}>
        <div className={classes.title}>
          <Title order={2} size="xs">
            {snippet.name}
          </Title>
          <Badge variant="outline">{packet.items.length} notes</Badge>
        </div>
        <Text size="xs" c="dimmed" aria-live="polite">
          {notice ??
            (packet.items.length === 0
              ? 'Empty clip. Enter notes on the grid with the Pencil tool.'
              : '')}
        </Text>
        <div className={classes.controls}>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <Button size="compact-xs" variant="default">
                Tool: {tools.find((entry) => entry.id === tool)?.label}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {tools.map((entry) => (
                <Menu.Item
                  key={entry.id}
                  leftSection={entry.id === tool ? '✓' : undefined}
                  rightSection={entry.shortcut}
                  onClick={() => setTool(entry.id)}
                >
                  {entry.label}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <Button size="compact-xs" variant="default">
                Grid: {gridOption.label}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {GRID_OPTIONS.map((option, index) => (
                <Fragment key={option.id}>
                  {(index === 1 || option.id === '1/2T') && <Menu.Divider />}
                  <Menu.Item
                    leftSection={option.id === gridOption.id ? '✓' : undefined}
                    onClick={() => updatePreferences({ grid: option.id })}
                  >
                    {option.label}
                  </Menu.Item>
                </Fragment>
              ))}
            </Menu.Dropdown>
          </Menu>
        </div>
      </div>
      {/* One unified panel: the roll, the velocity lane and the single scrollbar, the palette beside all three. */}
      <div
        className={classes.rollArea}
        onPointerDownCapture={() => {
          // The next press anywhere in the panel (roll or lane) clears a time selection before the
          // new gesture starts. K5c hook: a press inside the band (to move it) must keep it; decide
          // here, from the press position, before clearing.
          if (selection.kind === 'time') {
            setSelection(clearTimeSelection);
          }
        }}
      >
        <PianoRoll
          ariaLabel="Note clip piano roll"
          fill
          ghostDrag
          wheelZoom
          timeZoomRange={NOTE_EDITOR_TIME_ZOOM}
          gridUnit={gridUnit}
          entryLength={preferences.entryLength ?? undefined}
          velocityFill
          detachedScroll
          pitchColor={pitchColor}
          lane={(metrics) =>
            preferences.velocityLaneCollapsed ? null : (
              <VelocityLane
                notes={notes}
                pixelsPerQuarter={view.pixelsPerQuarter}
                scrollLeft={view.scrollLeft}
                duration={duration}
                selectedIds={selection.ids}
                selectedRange={timeBand}
                onCollapsedChange={(velocityLaneCollapsed) =>
                  updatePreferences({ velocityLaneCollapsed })
                }
                onVelocityChange={changeSelectionVelocity}
                height={preferences.laneHeight ?? undefined}
                onHeightChange={(laneHeight) => updatePreferences({ laneHeight })}
                availableHeight={metrics.panelHeight}
                gridLines={gridLines}
                gridUnit={gridUnit}
                viewWidth={metrics.viewWidth}
                velocityFill
              />
            )
          }
          barGutter={
            preferences.velocityLaneCollapsed ? (
              <VelocityLaneToggle
                collapsed
                onCollapsedChange={(velocityLaneCollapsed) =>
                  updatePreferences({ velocityLaneCollapsed })
                }
              />
            ) : null
          }
          keyActions={[
            {
              shortcut: 'v',
              run: () =>
                updatePreferences({ velocityLaneCollapsed: !preferences.velocityLaneCollapsed }),
            },
          ]}
          onEntryLengthChange={(length) => updatePreferences({ entryLength: length })}
          entryVelocity={preferences.entryVelocity ?? undefined}
          onEntryVelocityChange={(velocity) => updatePreferences({ entryVelocity: velocity })}
          endMarker={extent > 0 ? extent : undefined}
          loopBand={loopBand}
          notes={notes}
          duration={duration}
          gridLines={gridLines}
          view={view}
          onViewChange={setView}
          selectedIds={selection.ids}
          onSelectionChange={(ids) => setSelection(() => selectIds(packet, ids))}
          onMarqueeRange={(range: PianoRollRange, timeOnly) =>
            setSelection((current) =>
              timeOnly ? selectTime(current, range) : extendRange(current, range)
            )
          }
          selectedRange={timeBand}
          selectedItemsRange={notesBand}
          tools={tools}
          activeTool={tool}
          onToolChange={setTool}
          actions={actions}
          onAddNote={draw}
          onPaintNotes={paint}
          onSplitNote={split}
          onMoveNotes={(ids, delta) => commit((current) => moveNotes(current, ids, delta))}
          onResizeNotes={(ids, delta) => commit((current) => resizeNotes(current, ids, delta))}
          onDeleteNotes={remove}
          onVelocityChange={changeSelectionVelocity}
        />
      </div>
    </div>
  );
}

/** The piano-roll editor for note clips. Keyed by clip, so switching clips resets the view state. */
export function NoteClipEditor({ snippet }: ClipEditorProps) {
  return <NoteClipEditorBody key={snippet.id} snippet={snippet} />;
}

registerClipEditor(NOTE_EDITOR_ID, NoteClipEditor);
