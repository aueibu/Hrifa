import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Menu, Text, Title } from '@mantine/core';
import type { EditorAction, EditorTool } from '../../../components/EditorPalette';
import {
  adaptiveSubdivision,
  defaultPianoRollView,
  gridDensity,
  PianoRoll,
  VelocityLane,
  VelocityLaneToggle,
  type PianoRollGridSource,
  type PianoRollNewNote,
  type PianoRollRange,
  type PianoRollViewState,
  type VelocityRamp,
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
  copyNotes,
  newNoteItemId,
  NOTE_EDIT_OPERATION,
  notesOverlapping,
  packetRollNotes,
  resizeNotes,
  setVelocities,
  splitNote,
  timeMoveDelta,
  timeMoveResult,
  type TimeMoveOptions,
} from '../noteClipEdits';
import { publishNoteEditor, withdrawNoteEditor } from '../noteEditorChannel';
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
  type TimeRange,
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

/**
 * One committed time-selection move: the note lists either side of it and the band either side of it.
 * Editor-side only (never in the packet or the history): an undo or redo that lands on one of these
 * packets puts the band where it was then.
 */
interface BandMove {
  beforeItems: DataPacket['items'];
  afterItems: DataPacket['items'];
  before: TimeRange;
  after: TimeRange;
}

const MAX_BAND_MOVES = 50;

interface SelectionState {
  selection: NoteSelection;
  /** The packet the selection's range was computed against. */
  basis: DataPacket;
  /** Recent time-selection moves, newest last. */
  moves: BandMove[];
}

function sameRange(a: TimeRange, b: TimeRange): boolean {
  return Math.abs(a.start - b.start) < 1e-9 && Math.abs(a.end - b.end) < 1e-9;
}

/**
 * Where the band belongs when the packet changed under it: an undo of a recorded move (the packet is
 * the move's "before" while the band still sits at its "after") returns it to the move's start, a
 * redo (the packet is the "after" while the band sits at the "before") to its destination. Both the
 * notes and the band must match, so any other edit leaves a stale record unused.
 */
function bandAfterHistory(moves: BandMove[], packet: DataPacket, band: TimeRange): TimeRange {
  for (let index = moves.length - 1; index >= 0; index -= 1) {
    const move = moves[index];
    if (sameRange(band, move.after) && jsonEqual(move.beforeItems, packet.items)) {
      return move.before;
    }
    if (sameRange(band, move.before) && jsonEqual(move.afterItems, packet.items)) {
      return move.after;
    }
  }
  return band;
}

/** The furthest a time selection may reach: what the roll shows (the clip, any note past it, a bar). */
function selectionLimit(packet: DataPacket): number {
  const { numerator, denominator } = parseMeter(readClipProperties(packet).timeSignature);
  return clipRollDuration(packet) + (numerator * 4) / denominator;
}

/**
 * The selection against the packet on screen: pruned, and re-ranged if the packet is not its basis.
 * A time selection keeps its kind and its span through any change (undo, redo, deletes, outside
 * edits), held to the clip; when the notes changed, the notes it holds are the ones now overlapping
 * the span, and an undo or redo of a band move puts the band back with it.
 */
function currentSelection(state: SelectionState, packet: DataPacket): NoteSelection {
  const pruned = pruneSelection(state.selection, packet, selectionLimit(packet));
  // A change that leaves the notes alone (the clip's length, loop, ...) keeps the range too.
  // Identity first: a packet that only changed its length or loop shares its item list.
  const sameNotes =
    state.basis === packet ||
    state.basis.items === packet.items ||
    jsonEqual(state.basis.items, packet.items);
  if (sameNotes) {
    return pruned;
  }
  if (pruned.kind === 'time' && pruned.range) {
    const range = bandAfterHistory(state.moves, packet, pruned.range);
    return { ids: notesOverlapping(packet, range), range, kind: 'time' };
  }
  return selectIds(packet, pruned.ids);
}

/**
 * Whether a press on `pressed` (the roll, ruler or lane element it landed in) starts moving the time
 * band's content: it is on the roll, inside the drawn band, with the Time tool, or the Pointer tool
 * on empty space (a note is its own press). Decided from the press x against the drawn band, so the
 * window origin of a huge clip is already accounted for.
 */
function startsBandMove(pressed: Element, target: Element, clientX: number, tool: string): boolean {
  if (!pressed.hasAttribute('data-tool')) {
    // The lane: only the Time tool moves the band from here, and only from the track's own area
    // (the header sits left of the track and must not be tested against the scrolled band).
    if (tool !== 'time' || !target.closest('[data-tool]')) {
      return false;
    }
    const laneBand = pressed.querySelector<HTMLElement>('[data-testid="velocity-range"]');
    const content = laneBand?.parentElement;
    if (!laneBand || !content) {
      return false;
    }
    const at = clientX - content.getBoundingClientRect().left;
    const from = parseFloat(laneBand.style.left);
    return at >= from && at <= from + parseFloat(laneBand.style.width);
  }
  if (tool !== 'time' && tool !== 'pointer') {
    return false;
  }
  if (tool === 'pointer' && target.closest('[data-info]')) {
    return false;
  }
  const band = pressed.querySelector<HTMLElement>('[data-testid="roll-range"]');
  if (!band) {
    return false;
  }
  const x = clientX - pressed.getBoundingClientRect().left;
  const left = parseFloat(band.style.left);
  return x >= left && x <= left + parseFloat(band.style.width);
}

/**
 * The velocity ramp kept after a Paint-can edit, as a secondary selection. Editor-side transient
 * state only (never in the packet or the history). It is live while the packet still holds the notes
 * the ramp wrote (`items`), the Paint tool is active and the selection is the one it was made under.
 */
interface ActiveRamp {
  ramp: VelocityRamp;
  items: DataPacket['items'];
  selectionKey: string;
}

function NoteClipEditorBody({ snippet }: ClipEditorProps) {
  const { commitSnippetEditById, latestSnippetById, loading, locked } = useDesk();
  const { settings } = useCompositionSettings();
  const { packet } = snippet;
  // Transient view state: tool, selection (events and the time they occupy), zoom and scroll live in
  // this component only. They are never recorded in the history and never written to the packet.
  const [view, setView] = useState(() => openingView(packet));
  // Pencil on an empty clip, Pointer otherwise.
  const [tool, setToolState] = useState(() => (packet.items.length > 0 ? 'pointer' : 'pencil'));
  const [rampState, setRampState] = useState<ActiveRamp | null>(null);
  // Any tool change ends the ramp (it is a Paint-tool secondary selection).
  function setTool(next: string) {
    setToolState(next);
    setRampState(null);
  }
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
    moves: [],
  }));
  const [notice, setNotice] = useState<string | null>(null);
  const selection = useMemo(
    () => currentSelection(selectionState, packet),
    [selectionState, packet]
  );

  const selectionKey = selection.ids.join('\u0000');
  // The ramp stays active until another edit (the packet's notes are no longer the ones it wrote), a
  // tool change, a selection change or Escape.
  const activeRamp = useMemo(
    () =>
      rampState &&
      tool === 'paint' &&
      rampState.selectionKey === selectionKey &&
      (rampState.items === packet.items || jsonEqual(rampState.items, packet.items))
        ? rampState.ramp
        : null,
    [rampState, tool, selectionKey, packet.items]
  );
  const rampActive = activeRamp !== null;
  useEffect(() => {
    if (!rampActive) {
      return undefined;
    }
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (event.key === 'Escape' && !typing) {
        setRampState(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rampActive]);

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
      moves: state.moves,
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
  const snapUnit = gridUnit ?? adaptiveSubdivision(view.pixelsPerQuarter);
  const gridLines = useMemo(() => gridSourceFor(clipMeter, gridUnit), [clipMeter, gridUnit]);
  // The inspector's actions panel reads the selection and grid from here when a button is pressed
  // (noteEditorChannel.ts), and hands back the selection a transform leaves (`adopt`).
  useEffect(() => {
    publishNoteEditor(snippet.id, {
      selection,
      gridUnit,
      snapUnit,
      adopt: (result, committed) => {
        const wanted = result.selection;
        const next: NoteSelection = wanted
          ? { ids: wanted.ids, range: wanted.range, ...(wanted.kind ? { kind: wanted.kind } : {}) }
          : selection.kind === 'time' && selection.range
            ? {
                ids: notesOverlapping(committed, selection.range),
                range: selection.range,
                kind: 'time',
              }
            : selectIds(committed, selection.ids);
        setSelectionState((state) => ({ selection: next, basis: committed, moves: state.moves }));
      },
    });
  }, [snippet.id, selection, gridUnit, snapUnit]);
  useEffect(() => () => withdrawNoteEditor(snippet.id), [snippet.id]);
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
  ): { base: DataPacket; committed: DataPacket } | null {
    if (refusal) {
      setNotice(refusal);
      return null;
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
      return null;
    }
    const result = commitSnippetEditById(snippet.id, next, NOTE_EDIT_OPERATION, { handEdit: true });
    if (!result.ok) {
      setNotice(result.error);
      return null;
    }
    setNotice(null);
    setSelectionState((state) => ({
      selection: after ? after(next) : followEdit(selection, packet, next),
      basis: result.snippet.packet,
      moves: state.moves,
    }));
    return { base, committed: result.snippet.packet };
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

  /**
   * Moves (or, with Ctrl/Cmd, copies) the content of the time selection by `delta` quarter notes: one
   * hand edit, one undo step, notes cut at the span's edges and, unless Alt (merge) was held, the
   * destination overwritten (noteClipEdits.timeMoveResult). The band moves with it and holds exactly
   * the pieces that were moved or copied. An empty span just moves the band (nothing to edit, and
   * the notes now under it are selected). `delta` is the roll's, already snapped to the grid and held
   * at 0, so it is not rounded again here (the ghost and the commit must agree for an off-grid span).
   */
  function moveTime(
    range: { start: number; end: number },
    delta: number,
    options: TimeMoveOptions = {}
  ) {
    const shift = timeMoveDelta(range, delta);
    if (shift === 0) {
      return;
    }
    const moved = { start: range.start + shift, end: range.end + shift };
    const current = latestSnippetById(snippet.id)?.packet ?? packet;
    if (timeMoveResult(current, range, delta, () => '', undefined, options).packet === current) {
      setSelection(() => ({ ids: notesOverlapping(current, moved), range: moved, kind: 'time' }));
      return;
    }
    let movedIds: string[] = [];
    const done = commit(
      (base) => {
        const result = timeMoveResult(
          base,
          range,
          delta,
          () => newNoteItemId(snippet.id),
          undefined,
          options
        );
        movedIds = result.movedIds;
        return result.packet;
      },
      () => ({ ids: movedIds, range: moved, kind: 'time' })
    );
    if (done) {
      const record: BandMove = {
        beforeItems: done.base.items,
        afterItems: done.committed.items,
        before: { ...range },
        after: moved,
      };
      setSelectionState((state) => ({
        ...state,
        moves: [...state.moves, record].slice(-MAX_BAND_MOVES),
      }));
    }
  }

  /** Ctrl/Cmd-drag of notes: copies land at the destination, the originals stay, the copies are selected. */
  function copySelection(ids: string[], delta: { start: number; pitchMidicents: number }) {
    let copyIds: string[] = [];
    commit(
      (base) => {
        const result = copyNotes(base, ids, delta, () => newNoteItemId(snippet.id));
        copyIds = result.copyIds;
        return result.packet;
      },
      (next) => selectIds(next, copyIds)
    );
  }

  function remove(ids: string[]) {
    commit(
      (current) => deleteNotes(current, ids),
      (next) => pruneSelection(selection, next)
    );
  }

  /** Pencil in the lane: absolute velocities by note id, one hand edit and one undo step. */
  function drawVelocities(values: Record<string, number>) {
    commit((current) => setVelocities(current, values));
  }

  /**
   * Paint can in the lane: writes the ramp's values (a new ramp, or the same ramp re-applied with a
   * new curve from its original endpoints and heads) as one edit, then keeps the ramp active as a
   * secondary selection on the notes it wrote.
   */
  function applyRamp(ramp: VelocityRamp, values: Record<string, number>) {
    const latest = latestSnippetById(snippet.id)?.packet ?? packet;
    // Painting values the notes already hold writes nothing but is still a ramp worth keeping.
    const unchanged = setVelocities(latest, values) === latest;
    const done = commit((current) => setVelocities(current, values));
    if (!done && (!unchanged || refusal)) {
      // A refused or failed commit wrote nothing, so there is no ramp to keep active.
      return;
    }
    setRampState({ ramp, items: done ? done.committed.items : latest.items, selectionKey });
  }

  function marqueeRange(range: PianoRollRange, timeOnly: boolean, additive?: boolean) {
    setSelection((current) => {
      if (!timeOnly) {
        return extendRange(current, range);
      }
      // Every note overlapping the span (an edge touch included), whichever tool dragged it.
      const next = selectTime(current, range, additive);
      return next.range && next.kind === 'time'
        ? { ...next, ids: notesOverlapping(packet, next.range) }
        : next;
    });
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
        onPointerDownCapture={(event) => {
          // The next press on the roll, the ruler or the lane clears a time selection before the new
          // gesture starts. Presses elsewhere (the scrollbar, the tool palette, the keys) leave it,
          // and so does a press inside the band that starts moving its content.
          if (selection.kind !== 'time') {
            return;
          }
          const target = event.target as Element;
          const pressed = target.closest('[data-band-press]');
          if (!pressed || startsBandMove(pressed, target, event.clientX, tool)) {
            return;
          }
          // Alt + right button on an active ramp curves it: the band is not part of that gesture.
          if (event.button === 2 && event.altKey && activeRamp) {
            return;
          }
          setSelection(clearTimeSelection);
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
                tool={tool}
                onSelectionChange={(ids) => setSelection(() => selectIds(packet, ids))}
                onMarqueeRange={marqueeRange}
                onMoveTimeRange={moveTime}
                onSetVelocities={drawVelocities}
                ramp={activeRamp}
                onRamp={applyRamp}
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
          onMarqueeRange={marqueeRange}
          onMoveTimeRange={moveTime}
          selectedRange={timeBand}
          selectedItemsRange={notesBand}
          tools={tools}
          activeTool={tool}
          onToolChange={setTool}
          actions={actions}
          onAddNote={draw}
          onPaintNotes={paint}
          onSplitNote={split}
          onMoveNotes={(ids, delta, options) =>
            options?.copy
              ? copySelection(ids, delta)
              : commit((current) => moveNotes(current, ids, delta))
          }
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
