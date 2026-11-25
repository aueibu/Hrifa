import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Badge, Menu, Text, Title, VisuallyHidden } from '@mantine/core';
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
  type PianoRollNote,
  type PianoRollRange,
  type PianoRollViewState,
  type VelocityRamp,
} from '../../../components/PianoRoll';
import { Button } from '../../../ui';
import type {
  ChordCell,
  ChordClaim,
  ChordInsertRequest,
  ChordNoteHit,
  ChordTarget,
} from '../chordInput/chordSession';
import {
  ChordSessionProvider,
  useChordSession,
  useOptionalChordSession,
} from '../chordInput/ChordSessionProvider';
import { mergeChordInserts } from '../chordInput/placeChords';
import { useChordGhosts, useSelectionGhosts } from '../chordInput/useChordGhosts';
import { useCompositionSettings } from '../compositionSettings';
import { jsonEqual } from '../dataBlock';
import { DATA_BLOCK_SLOT, nextReveal, type RevealRequest } from '../dataBlockEditorSession';
import {
  DataBlockEditorSessionProvider,
  useDataBlockAttachment,
  useDataBlockEditorSession,
  useDataBlockSlot,
  useCommand,
  useOptionalDataBlockEditorSession,
} from '../DataBlockEditorSessionProvider';
import { runOperator } from '../dataBlockOperatorRunner';
import { registerDataBlockEditor, type DataBlockEditorProps } from '../dataBlockTypes';
import { useDesk } from '../desk';
import { inInputScope, isTyping } from '../inputScope';
import { useInputScope } from '../InputScopeProvider';
import type { DataPacket } from '../model';
import { rationalToNumber } from '../musicalTime';
import { publishNoteEditor, withdrawNoteEditor, type PickPitchRequest } from '../noteEditorChannel';
import { GRID_OPTIONS, useNoteEditorPreferences } from '../noteEditorPreferences';
import {
  moveNotesInPitch,
  moveNotesInTime,
  navigateSelection,
  navigationOrder,
  noteKeyEdit,
  resizeNotesByGrid,
} from '../noteKeyboard';
import {
  addNote,
  addNotes,
  changeVelocity,
  notesExtent,
  notesRollDuration,
  deleteNotes,
  isNoteItem,
  mapMergedIds,
  moveNotes,
  copyNotes,
  newNoteItemId,
  NOTE_EDIT_OPERATION,
  notesOverlapping,
  packetRollNotes,
  resizeNotes,
  resizeNotesStart,
  resolveSamePitchOverlaps,
  setVelocities,
  splitNote,
  timeMoveDelta,
  timeMoveResult,
  type TimeMoveOptions,
} from '../notesEdits';
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
import { freezeNotesProperties, readNotesProperties } from '../notesProperties';
import { barBeatText } from '../positionWording';
import { selectionKeyOf, type RotationSessionCore } from '../rotationSession';
import { pitchLabel } from '../routeTreatments';
import { scaleDegreeColor } from '../scaleDegreeColor';
import { parseMeter } from '../transport';
import classes from './NotesEditor.module.css';

/** The editor id the Notes data-block type names (dataBlockTypes.ts). */
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
  { id: 'chords', label: 'Chords', shortcut: '7' },
];

/**
 * The editor's time zoom, in pixels per quarter note. The roll's own range stops at 16, which is a
 * few bars wide; a notes data-block can be 72000 bars, so this one zooms out to a quarter of a pixel per
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

/** A blank data-block opens centered on middle C; a data-block with notes is fitted to them by the roll. */
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

/**
 * The selection once same-pitch overlaps were resolved: merged-away ids become their survivors (each once), notes an edit covered completely drop out, split pieces are never added. A
 * time selection keeps its span; a note selection's span is recomputed from the survivors.
 */
function mergedSelection(
  selection: NoteSelection,
  merged: DataPacket,
  survivorOf: ReadonlyMap<string, string>
): NoteSelection {
  const present = new Set(merged.items.map((item) => item.id));
  const ids = [...mapMergedIds(selection.ids, survivorOf)].filter((id) => present.has(id));
  return selection.kind === 'time' ? { ...selection, ids } : selectIds(merged, ids);
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

/** The furthest a time selection may reach: what the roll shows (the data-block, any note past it, a bar). */
function selectionLimit(packet: DataPacket): number {
  const { numerator, denominator } = parseMeter(readNotesProperties(packet).timeSignature);
  return notesRollDuration(packet) + (numerator * 4) / denominator;
}

/**
 * The selection against the packet on screen: pruned, and re-ranged if the packet is not its basis.
 * A time selection keeps its kind and its span through any change (undo, redo, deletes, outside
 * edits), held to the data-block; when the notes changed, the notes it holds are the ones now overlapping
 * the span, and an undo or redo of a band move puts the band back with it.
 */
function currentSelection(state: SelectionState, packet: DataPacket): NoteSelection {
  const pruned = pruneSelection(state.selection, packet, selectionLimit(packet));
  // A change that leaves the notes alone (the data-block's length, loop, ...) keeps the range too.
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
 * window origin of a huge data-block is already accounted for.
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
 * The rotation session kept after a "rotate in time" press (rotationSession.ts). Editor-side
 * transient state only. It is live while the packet still holds the items the press committed and
 * the selection is the one it left.
 */
interface ActiveRotation {
  core: RotationSessionCore;
  items: DataPacket['items'];
  selectionKey: string;
}

/**
 * The velocity ramp kept after a Paint-can edit, as a secondary selection. Editor-side transient
 * state only (never in the packet or the history). It is live while the packet still holds the notes
 * the ramp wrote (`items`), the Paint tool is active and the selection is the one it was made under.
 * A left press in the lane in Paint ends it at once (a new ramp starts from scratch).
 */
interface ActiveRamp {
  ramp: VelocityRamp;
  items: DataPacket['items'];
  selectionKey: string;
}

/**
 * What a screen reader hears when Alt+arrow lands on a note: its pitch name, where it starts (bar
 * and beat in the data-block's meter), and its place in the navigation order.
 */
function describeNote(packet: DataPacket, id: string, meter: string): string {
  const item = packet.items.find((entry) => entry.id === id);
  if (!item || !isNoteItem(item)) {
    return '';
  }
  const onset = rationalToNumber(item.value.onset.quarterNotes);
  const order = navigationOrder(packet);
  const name = item.value.pitches.map((midicents) => pitchLabel(midicents)).join(' ');
  return `${name} at ${barBeatText(onset, meter)}, selected, ${order.indexOf(id) + 1} of ${order.length}`;
}

/**
 * The note a click on a grid cell means: among notes within 50 midicents of the cell's row whose
 * span overlaps the cell, the one starting nearest the cell (the one with the smaller start on a
 * tie, whatever the packet order).
 */
export function noteAtCell(
  notes: readonly PianoRollNote[],
  cell: { pitchMidicents: number; start: number; step: number }
): PianoRollNote | undefined {
  let best: PianoRollNote | undefined;
  for (const note of notes) {
    if (
      Math.abs(note.pitchMidicents - cell.pitchMidicents) <= 50 &&
      note.start < cell.start + cell.step - 1e-9 &&
      note.start + note.duration > cell.start + 1e-9 &&
      (!best ||
        Math.abs(note.start - cell.start) < Math.abs(best.start - cell.start) - 1e-9 ||
        (Math.abs(Math.abs(note.start - cell.start) - Math.abs(best.start - cell.start)) <= 1e-9 &&
          note.start < best.start))
    ) {
      best = note;
    }
  }
  return best;
}

function NotesEditorBody({ dataBlock, onChordAnchor }: DataBlockEditorProps) {
  const { commitDataBlockEditById, latestDataBlockById, loading, locked } = useDesk();
  const { settings } = useCompositionSettings();
  const { packet } = dataBlock.payload;
  // Transient view state: tool, selection (events and the time they occupy), zoom and scroll live in
  // this component only. They are never recorded in the history and never written to the packet.
  const dataBlockSession = useDataBlockEditorSession();
  const dataBlockId = dataBlock.id;
  useDataBlockAttachment(dataBlockSession, dataBlockId);
  const [view, setView] = useDataBlockSlot(
    dataBlockSession,
    dataBlockId,
    DATA_BLOCK_SLOT.view,
    () => openingView(packet)
  );
  // Pencil on an empty data-block, Pointer otherwise.
  const [tool, setToolState] = useDataBlockSlot<string>(
    dataBlockSession,
    dataBlockId,
    DATA_BLOCK_SLOT.tool,
    () => (packet.items.length > 0 ? 'pointer' : 'pencil')
  );
  // The tool to go back to when the picker's Stage strip closes it (that is leaving the Chords tool).
  const toolBeforeChords = useMemo(
    () => dataBlockSession.peek(dataBlockId, DATA_BLOCK_SLOT.toolBeforeChords, () => 'pointer'),
    [dataBlockSession, dataBlockId]
  );
  const [rampState, setRampState] = useDataBlockSlot<ActiveRamp | null>(
    dataBlockSession,
    dataBlockId,
    DATA_BLOCK_SLOT.ramp,
    () => null
  );
  // The pick-pitch mode the inspector's Invert / Make equal > Pitch put the editor in (the second part
  // of a two-part action). Editor-side only, like the selection: never in the packet or the history.
  const [pick, setPick] = useDataBlockSlot<PickPitchRequest | null>(
    dataBlockSession,
    dataBlockId,
    DATA_BLOCK_SLOT.pick,
    () => null
  );
  const [rotationState, setRotationState] = useDataBlockSlot<ActiveRotation | null>(
    dataBlockSession,
    dataBlockId,
    DATA_BLOCK_SLOT.rotation,
    () => null
  );
  const session = useChordSession();
  // The chord session (page level, or private when no WorkbenchSessions is above): the anchor, the
  // picker's values, the hover cell and the W-20 keys live there. This editor is a HOST of it: it
  // claims it while this data-block is open (below) and reads the anchor, hover cell and ghosts.
  // Any tool change ends the ramp (it is a Paint-tool secondary selection) and a waiting pick.
  function setTool(next: string) {
    if (next === 'chords' && tool !== 'chords') {
      toolBeforeChords.current = tool;
    }
    setToolState(next);
    setRampState(null);
    setPick(null);
    session.leaveTool();
  }
  // Per-viewer: the remembered entry length and the grid. Neither is history or part of a project.
  const [preferences, updatePreferences] = useNoteEditorPreferences();
  const gridOption =
    GRID_OPTIONS.find((option) => option.id === preferences.grid) ?? GRID_OPTIONS[0];
  // The selection remembers the packet it was last computed against (`basis`). When the packet is
  // something else (an undo of a move, another tab's change), the range falls back to the time the
  // selected notes now occupy instead of showing a stale band.
  const [selectionState, setSelectionState] = useDataBlockSlot<SelectionState>(
    dataBlockSession,
    dataBlockId,
    DATA_BLOCK_SLOT.selection,
    () => ({
      selection: emptyNoteSelection,
      basis: packet,
      moves: [],
    })
  );
  const [notice, setNotice] = useState<string | null>(null);
  // Keyboard selection moves ask the roll to scroll the new note into view (token: once per press).
  const [reveal, setReveal] = useDataBlockSlot<RevealRequest | null>(
    dataBlockSession,
    dataBlockId,
    DATA_BLOCK_SLOT.reveal,
    () => null
  );
  const editorRoot = useRef<HTMLDivElement | null>(null);
  // Panel commands (design 7.3): the session routes a reveal (once per press; a repeat counts), a
  // clear of the chord anchor and a focus of the roll here.
  useCommand(dataBlockSession, 'reveal', (command) =>
    setReveal((current) => nextReveal(current, command.target))
  );
  useCommand(dataBlockSession, 'clearAnchor', () => session.closePicker());
  useCommand(dataBlockSession, 'focus', () => {
    editorRoot.current?.querySelector<HTMLElement>('[data-tool]')?.focus();
  });
  // The pointer tracker and the pointer-inside test are the input scope's (inputScope.ts), installed
  // by WorkbenchSessions or privately here when none is above.
  const inputScope = useInputScope();
  // An Alt+arrow was handled since Alt went down: its keyup must not reach the browser's menu bar.
  const altArrowHandled = useRef(false);
  const selection = useMemo(
    () => currentSelection(selectionState, packet),
    [selectionState, packet]
  );
  // The latest selection, kept in step synchronously by every writer (commit, adopt, navigation), so
  // a key press under auto-repeat that lands before the next render never reads a stale one.
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  // Published for the page's read-only selection chain, which must show what this editor shows (the
  // pruned, derived selection), not the raw stored slot. `selection` is memoized, so this only fires
  // on a real change.
  useEffect(() => {
    dataBlockSession.write(
      dataBlockId,
      DATA_BLOCK_SLOT.shownSelection,
      () => emptyNoteSelection,
      selection
    );
  }, [dataBlockSession, dataBlockId, selection]);
  // What assistive technology hears when Alt+arrow moves the selection.
  const [announcement, setAnnouncement] = useDataBlockSlot(
    dataBlockSession,
    dataBlockId,
    DATA_BLOCK_SLOT.announcement,
    () => ''
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
      const typing = isTyping(target);
      // Only while the focus or the pointer is in the editor: not from an unrelated control.
      if (event.key === 'Escape' && !typing && (inputScope.pointerInside || inInputScope(target))) {
        setRampState(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rampActive, inputScope]);

  // The rotation session is live while the notes and the selection are exactly what the last press
  // left; anything else (another edit, a selection change, an undo or redo) ends it for good.
  const currentSelectionKey = selectionKeyOf(selection);
  const rotation =
    rotationState &&
    rotationState.selectionKey === currentSelectionKey &&
    (rotationState.items === packet.items || jsonEqual(rotationState.items, packet.items))
      ? rotationState.core
      : null;
  const rotationEnded = rotationState !== null && rotation === null;
  useEffect(() => {
    if (rotationEnded) {
      setRotationState(null);
    }
  }, [rotationEnded]);

  // While a pick waits, Escape cancels it and Enter applies its default (inversion's middle axis),
  // when the focus is in the editor or the actions panel (or nowhere: the page body), never in a text
  // field or on an unrelated control such as a top-bar button. The selection is never touched.
  const picking = pick !== null;
  useEffect(() => {
    if (!picking) {
      return undefined;
    }
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (isTyping(target) || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setPick(null);
      } else if (event.key === 'Enter' && pick?.onDefault && inInputScope(target, true)) {
        event.preventDefault();
        const apply = pick.onDefault;
        setPick(null);
        apply();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picking, pick]);

  // One band at a time: the cyan time band for a time selection, otherwise the faint neutral band
  // over the span the selected notes occupy.
  const timeBand = selection.kind === 'time' ? selection.range : null;
  const notesBand = itemsBand(selection);

  // Functional, because one roll event can change the selection twice (a marquee sets the ids, then
  // widens the range).
  function setSelection(change: (current: NoteSelection) => NoteSelection) {
    const next = change(selectionRef.current);
    selectionRef.current = next;
    setSelectionState((state) => ({
      selection: next,
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
  const notesProperties = useMemo(() => readNotesProperties(packet), [packet]);
  const extent = notesExtent(packet);
  const loopBand = notesProperties.loopOn
    ? {
        start: rationalToNumber(notesProperties.loopStart),
        end: rationalToNumber(notesProperties.loopEnd),
      }
    : undefined;
  const blockMeter = notesProperties.timeSignature;
  const { numerator, denominator } = parseMeter(blockMeter);
  const barLength = (numerator * 4) / denominator;
  // The roll shows the data-block and any note past its end, plus a bar of room to draw into.
  const duration = useMemo(() => notesRollDuration(packet) + barLength, [packet, barLength]);
  const gridUnit = gridOption.quarters ?? undefined;
  const snapUnit = gridUnit ?? adaptiveSubdivision(view.pixelsPerQuarter);
  const gridLines = useMemo(() => gridSourceFor(blockMeter, gridUnit), [blockMeter, gridUnit]);
  // The inspector's actions panel reads the selection and grid from here when a button is pressed
  // (noteEditorChannel.ts), and hands back the selection a transform leaves (`adopt`).
  useEffect(() => {
    publishNoteEditor(dataBlock.id, {
      selection,
      gridUnit,
      snapUnit,
      rotation,
      picking: pick?.actionId ?? null,
      beginPick: setPick,
      cancelPick: () => setPick(null),
      adopt: (result, committed, survivorOf) => {
        const wanted = result.selection;
        // A note merged away as a duplicate hands its selection to the note that absorbed it, and a
        // note an overwrite covered completely is no longer there to select.
        const present = new Set(committed.items.map((item) => item.id));
        const survivors = (ids: readonly string[]) =>
          (survivorOf?.size ? [...mapMergedIds(ids, survivorOf)] : [...ids]).filter((id) =>
            present.has(id)
          );
        const adopted: NoteSelection = wanted
          ? {
              ids: survivors(wanted.ids),
              range: wanted.range,
              ...(wanted.kind ? { kind: wanted.kind } : {}),
            }
          : selection.kind === 'time' && selection.range
            ? {
                ids: notesOverlapping(committed, selection.range),
                range: selection.range,
                kind: 'time',
              }
            : selectIds(committed, survivors(selection.ids));
        selectionRef.current = adopted;
        setSelectionState((state) => ({
          selection: adopted,
          basis: committed,
          moves: state.moves,
        }));
        setRotationState(
          result.rotation
            ? {
                core: result.rotation,
                items: committed.items,
                selectionKey: selectionKeyOf(adopted),
              }
            : null
        );
      },
    });
  }, [dataBlock.id, selection, gridUnit, snapUnit, pick?.actionId, rotation]);
  useEffect(() => () => withdrawNoteEditor(dataBlock.id), [dataBlock.id]);
  const refusal = loading
    ? 'The desk is still loading, so the data-block cannot be edited yet.'
    : locked
      ? 'The saved desk could not be read, so changes to it are turned off.'
      : null;

  /**
   * Applies one edit through the desk as a hand edit: the data-block keeps its id, a run of edits is one
   * version, and each call is one undo step (the roll reports a drag once, on release).
   */
  function commit(
    edit: (current: DataPacket) => DataPacket,
    after?: (next: DataPacket) => NoteSelection,
    lineage?: ReadonlyMap<string, string>
  ): { base: DataPacket; committed: DataPacket; selection: NoteSelection } | null {
    if (refusal) {
      setNotice(refusal);
      return null;
    }
    // The single choke point for note edits: an old data-block with no stored properties gets its full
    // default set written as part of its FIRST edit (length from the content as it is now), in the
    // same packet, so one version and one undo step, and its length never drifts as notes move.
    // Built from the desk's packet as it is now (not the last render), so an edit that landed
    // since, such as a property change from the inspector, is never reverted.
    const current = latestDataBlockById(dataBlock.id)?.payload.packet ?? packet;
    const base = freezeNotesProperties(current);
    const edited = edit(base);
    if (edited === base) {
      return null;
    }
    // Same-pitch overlaps: a touched note overwrites the span it overlaps on a note of the same pitch
    // (identical notes merge), inside this same version and undo step, and only when something
    // changed. A merged-away note's selection goes to its survivor; split pieces are not selected.
    const resolved = resolveSamePitchOverlaps(
      edited,
      base,
      () => newNoteItemId(dataBlock.id),
      lineage
    );
    const next = resolved.packet;
    const survivorOf = resolved.survivorOf;
    const resolvedChange = next !== edited;
    if (resolvedChange && jsonEqual(next.items, base.items)) {
      // Everything the edit added was absorbed by notes that were already there.
      return null;
    }
    const result = commitDataBlockEditById(dataBlock.id, next, NOTE_EDIT_OPERATION, {
      handEdit: true,
    });
    if (!result.ok) {
      setNotice(result.error);
      return null;
    }
    setNotice(null);
    const wanted = after ? after(edited) : followEdit(selectionRef.current, current, edited);
    const nextSelection = resolvedChange ? mergedSelection(wanted, next, survivorOf) : wanted;
    selectionRef.current = nextSelection;
    setSelectionState((state) => ({
      selection: nextSelection,
      basis: result.dataBlock.payload.packet,
      moves: state.moves,
    }));
    return { base, committed: result.dataBlock.payload.packet, selection: nextSelection };
  }

  function draw(note: PianoRollNewNote) {
    const id = newNoteItemId(dataBlock.id);
    commit(
      (current) => addNote(current, note, id, note.velocity),
      (next) => selectIds(next, [id])
    );
  }

  function paint(painted: PianoRollNewNote[]) {
    const ids = painted.map(() => newNoteItemId(dataBlock.id));
    commit(
      (current) => addNotes(current, painted, ids),
      (next) => selectIds(next, ids)
    );
  }

  function split(id: string, at: number) {
    const right = newNoteItemId(dataBlock.id);
    commit((current) => splitNote(current, id, at, right), undefined, new Map([[right, id]]));
  }

  /**
   * Moves (or, with Ctrl/Cmd, copies) the content of the time selection by `delta` quarter notes: one
   * hand edit, one undo step, notes cut at the span's edges and, unless Alt (merge) was held, the
   * destination overwritten (notesEdits.timeMoveResult). The band moves with it and holds exactly
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
    const current = latestDataBlockById(dataBlock.id)?.payload.packet ?? packet;
    if (timeMoveResult(current, range, delta, () => '', undefined, options).packet === current) {
      setSelection(() => ({ ids: notesOverlapping(current, moved), range: moved, kind: 'time' }));
      return;
    }
    let movedIds: string[] = [];
    const lineage = new Map<string, string>();
    const done = commit(
      (base) => {
        const result = timeMoveResult(
          base,
          range,
          delta,
          () => newNoteItemId(dataBlock.id),
          undefined,
          options
        );
        movedIds = result.movedIds;
        result.pieceOf.forEach((source, piece) => lineage.set(piece, source));
        return result.packet;
      },
      () => ({ ids: movedIds, range: moved, kind: 'time' }),
      lineage
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
        const result = copyNotes(base, ids, delta, () => newNoteItemId(dataBlock.id));
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
    const latest = latestDataBlockById(dataBlock.id)?.payload.packet ?? packet;
    // Painting values the notes already hold writes nothing but is still a ramp worth keeping.
    const unchanged = setVelocities(latest, values) === latest;
    const done = commit((current) => setVelocities(current, values));
    if (!done && (!unchanged || refusal)) {
      // A refused or failed commit wrote nothing, so there is no ramp to keep active.
      return;
    }
    // The key of the selection the edit LEFT (not the one it began with), so the ramp is still valid
    // against the very next render.
    setRampState({
      ramp,
      items: done ? done.committed.items : latest.items,
      selectionKey: done ? done.selection.ids.join('\u0000') : selectionKey,
    });
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

  /** Copy / paste from the keyboard: the registry action through the same runner as the inspector. */
  function runKeyAction(actionId: 'copy' | 'paste') {
    const outcome = runOperator({
      dataBlockId: dataBlock.id,
      fallback: dataBlock,
      actionId,
      desk: { commitDataBlockEditById, latestDataBlockById },
    });
    setNotice(outcome.status === 'committed' ? (outcome.message ?? null) : outcome.message);
  }

  /**
   * The arrow keys, in the editor's focus scope: act on the selected notes (note noteKeyboard.ts).
   * Returns whether the key was taken. A time selection takes the key and does nothing.
   */
  function runArrowKey(event: ReactKeyboardEvent): boolean {
    const edit = noteKeyEdit(
      event.key,
      { shift: event.shiftKey, alt: event.altKey, mod: event.ctrlKey || event.metaKey },
      snapUnit
    );
    if (!edit) {
      return false;
    }
    if (edit.kind === 'navigate') {
      altArrowHandled.current = true;
    }
    const held = selectionRef.current;
    if (held.kind === 'time') {
      return true;
    }
    const ids = held.ids;
    if (edit.kind === 'navigate') {
      const latest = latestDataBlockById(dataBlock.id)?.payload.packet ?? packet;
      const chosen = navigateSelection(latest, ids, edit.direction);
      if (chosen !== null) {
        setSelection(() => selectIds(latest, [chosen]));
        setAnnouncement(describeNote(latest, chosen, blockMeter));
        dataBlockSession.dispatch({ type: 'reveal', target: { id: chosen } });
      }
      return true;
    }
    if (ids.length === 0) {
      return true;
    }
    if (edit.kind === 'move') {
      commit((current) => moveNotesInTime(current, ids, edit.quarters));
    } else if (edit.kind === 'pitch') {
      commit((current) => moveNotesInPitch(current, ids, edit.midicents));
    } else {
      commit((current) => resizeNotesByGrid(current, ids, edit.quarters, snapUnit));
    }
    return true;
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

  const chordsActive = tool === 'chords';
  const chordGhosts = useChordGhosts(chordsActive, edo, preferences.entryLength);

  /**
   * Places a chord (the session's default notes, one per voice) in one commit, so one undo step and one
   * history entry. Stacking on a note never alters an existing note: a tone that would overlap any
   * existing note of the same pitch (same onset, an earlier longer note, a later one inside the span)
   * is dropped, so nothing is split, trimmed or deleted. The new ones take the note's velocity.
   * Returns false when nothing was placed (the session then keeps its anchor and ghosts).
   */
  function insertChord(request: ChordInsertRequest): boolean {
    return insertChords([request]);
  }

  /**
   * One or several chords (selection mode puts one on each selected note) in ONE commit: the stack rule per request and
   * no pitch entered twice across requests (`placeChords.ts`); a single request is exactly the Chords tool's insert.
   */
  function insertChords(requests: ChordInsertRequest[]): boolean {
    const placed: PianoRollNewNote[] = mergeChordInserts(requests, notes, edo);
    if (placed.length === 0) {
      return false;
    }
    const entryVelocity = requests[0]?.entryVelocity;
    const ids = placed.map(() => newNoteItemId(dataBlock.id));
    commit(
      (current) => addNotes(current, placed, ids, entryVelocity),
      // Chords tool: the inserted notes become the selection. Selection mode (B2): the person's selection (the anchors)
      // stays, so the next insert stacks on the same notes again.
      chordsActive ? (next) => selectIds(next, ids) : undefined
    );
    return true;
  }

  // What this host gives the chord session (the ChordTarget below reads it through a ref, so the
  // claim is one stable object for as long as the data-block is open).
  const chordHost = {
    pitchSet: settings.pitchSet,
    edo,
    entryLength: preferences.entryLength,
    entryVelocity: preferences.entryVelocity,
    chordsActive,
    noteAt: (cell: ChordCell) => noteAtCell(notes, cell),
    insert: insertChord,
    insertMany: insertChords,
    // Selection mode: the notes of the selection this editor shows (pruned and derived, like the page's selection chain).
    selectedNotes: (): ChordNoteHit[] | null => {
      const shown = selectionRef.current;
      if (shown.ids.length === 0) {
        // A time selection with no notes is a range (a roll note needs a pitch): an empty list, not null.
        return shown.kind === 'time' && shown.range ? [] : null;
      }
      const ids = new Set(shown.ids);
      return notes.filter((note) => ids.has(note.sourceId ?? note.id));
    },
    onAnchor: (anchor: { pitchMidicents: number; onset: number }) => onChordAnchor?.(anchor),
    revealAnchor: (range: Parameters<NonNullable<ChordTarget['revealAnchor']>>[0]) =>
      dataBlockSession.dispatch({ type: 'reveal', target: range }),
    meter: blockMeter,
    onPickerClosed: () => setTool(toolBeforeChords.current),
  };
  const chordHostRef = useRef(chordHost);
  chordHostRef.current = chordHost;
  const [chordTarget] = useState<ChordTarget>(() => ({
    id: dataBlock.id,
    get pitchSet() {
      return chordHostRef.current.pitchSet;
    },
    get edo() {
      return chordHostRef.current.edo;
    },
    get entryLength() {
      return chordHostRef.current.entryLength;
    },
    get entryVelocity() {
      return chordHostRef.current.entryVelocity;
    },
    hint: "Click the roll where a chord should go. Its pitch becomes the chord's root; Ctrl/Cmd+click picks the role it plays in a chord. Click an existing note to stack a chord on it.",
    noteAt: (cell) => chordHostRef.current.noteAt(cell),
    insert: (request) => chordHostRef.current.insert(request),
    insertMany: (requests) => chordHostRef.current.insertMany(requests),
    selectedNotes: () => chordHostRef.current.selectedNotes(),
    onAnchor: (anchor) => chordHostRef.current.onAnchor(anchor),
    revealAnchor: (range) => chordHostRef.current.revealAnchor(range),
    // The pointer tracker and the scope helper are M4b: the session asks this editor for its root.
    scope: () => editorRoot.current,
    // The roll is hidden (another tab in front, a collapsed or other-workspace docker): the panel parks it
    // with `inert`, and the W-20 keys are not captured then (design 8.4).
    visible: () => !editorRoot.current?.closest('[inert]'),
    // The picker is a page panel (M6a): it is wanted while the Chords tool is on, and the page's
    // ChordPanelBridge shows the panel when that turns true.
    wantsPicker: () => chordHostRef.current.chordsActive,
    get meter() {
      return chordHostRef.current.meter;
    },
    onPickerClosed: () => chordHostRef.current.onPickerClosed(),
  }));
  // Selection mode: ghosts on every selected note, exactly what Insert would add (M6c).
  const selectionGhosts = useSelectionGhosts(chordTarget, edo, notes);
  // The claim lasts while this data-block is the open item (this body is keyed by data-block): it is taken on
  // mount and released on unmount, so another host's claim in between wins and a release here
  // hands the session back to it.
  const chordClaim = useRef<ChordClaim | null>(null);
  useEffect(() => {
    const claim = session.claimChordTarget(chordTarget);
    chordClaim.current = claim;
    return () => {
      chordClaim.current = null;
      claim();
    };
  }, [session, chordTarget]);
  useLayoutEffect(() => {
    chordClaim.current?.changed();
    // The selection is part of what the panel shows in selection mode (its ready line and the notes Insert acts on).
  }, [
    chordsActive,
    settings.pitchSet,
    edo,
    preferences.entryLength,
    preferences.entryVelocity,
    selection,
    notes,
  ]);

  // One unified panel: the roll, the velocity lane and the single scrollbar, the palette beside all three.
  const rollNode = (
    <div
      className={classes.rollArea}
      role="presentation"
      onKeyUp={(event) => {
        // The Alt of an Alt+arrow selection move must not go on to focus the browser's menu bar.
        if (event.key === 'Alt' && altArrowHandled.current) {
          altArrowHandled.current = false;
          event.preventDefault();
        }
      }}
      onKeyDown={(event) => {
        // Arrow keys edit the selected notes (never in a text field, during a pitch pick, under a
        // drag or lane gesture, or where a child already took the key, such as the lane splitter).
        const arrowTarget = event.target as HTMLElement;
        if (
          !event.defaultPrevented &&
          !arrowTarget.isContentEditable &&
          !['INPUT', 'TEXTAREA', 'SELECT'].includes(arrowTarget.tagName)
        ) {
          if (pick || inputScope.pointerHeld) {
            // Ignored while a pick waits or a gesture runs, but Alt+Left/Right is still the
            // browser's Back/Forward and must not navigate away mid-gesture.
            if (
              event.altKey &&
              !event.ctrlKey &&
              !event.metaKey &&
              (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
            ) {
              altArrowHandled.current = true;
              event.preventDefault();
            }
          } else if (runArrowKey(event)) {
            event.preventDefault();
            return;
          }
        }
        // Ctrl/Cmd+C and V anywhere in the editor's focus scope (roll, lane, panel body), never
        // while typing in a field and not while a pitch pick waits.
        const target = event.target as HTMLElement;
        if (
          pick ||
          target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
          !(event.ctrlKey || event.metaKey) ||
          event.altKey ||
          event.shiftKey
        ) {
          return;
        }
        const key = event.key.toLowerCase();
        if (key === 'c' || key === 'v') {
          event.preventDefault();
          // Holding the keys must not repeat the action (a paste per auto-repeat tick).
          if (event.repeat) {
            return;
          }
          runKeyAction(key === 'c' ? 'copy' : 'paste');
        }
      }}
      onPointerDownCapture={(event) => {
        if (pick) {
          // A pick is waiting: the roll and the keys take the press as the pick itself, so the time
          // band (and the selection) stay; presses on the lane and ruler are swallowed rather than
          // drawing or selecting behind the pick. The palette and scrollbar work as usual.
          const pressed = (event.target as Element).closest('[data-band-press]');
          if (pressed && !pressed.hasAttribute('data-tool')) {
            event.stopPropagation();
          }
          return;
        }
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
        // A right button on an active ramp curves it (plain right drag): the band is not part of that gesture.
        if (event.button === 2 && activeRamp) {
          return;
        }
        setSelection(clearTimeSelection);
      }}
    >
      <PianoRoll
        ariaLabel="Notes piano roll"
        fill
        ghostDrag
        toolCursors
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
              onRampStart={() => setRampState(null)}
              height={preferences.laneHeight ?? undefined}
              onHeightChange={(laneHeight) => updatePreferences({ laneHeight })}
              availableHeight={metrics.panelHeight}
              gridLines={gridLines}
              gridUnit={gridUnit}
              viewWidth={metrics.viewWidth}
              velocityFill
              toolCursors
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
        pickPitch={
          pick
            ? {
                hint: pick.hint,
                onPick: (midi) => {
                  setPick(null);
                  pick.onPick(midi);
                },
              }
            : null
        }
        reveal={reveal}
        ghostNotes={chordGhosts ?? selectionGhosts}
        onAnchorHover={session.hoverFromRoll}
        onAnchorClick={(anchor) => {
          // A plain click opens the stored mode; Ctrl (Cmd) opens common-tone mode for this click only.
          session.anchorFromRoll(anchor);
        }}
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
        onResizeNotesStart={(ids, delta) =>
          commit((current) => resizeNotesStart(current, ids, delta))
        }
        onDeleteNotes={remove}
        onVelocityChange={changeSelectionVelocity}
      />
    </div>
  );
  return (
    <div className={classes.editor} ref={editorRoot} data-note-editor-scope="">
      <div className={classes.header}>
        <div className={classes.title}>
          <Title order={2} size="xs">
            {dataBlock.name}
          </Title>
          <Badge variant="outline">{packet.items.length} notes</Badge>
        </div>
        <VisuallyHidden role="status" aria-live="polite" data-testid="note-announcement">
          {announcement}
        </VisuallyHidden>
        <Text c="dimmed" aria-live="polite">
          {notice ??
            (packet.items.length === 0
              ? 'Empty data-block. Enter notes on the grid with the Pencil tool.'
              : '')}
        </Text>
        <div className={classes.controls}>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <Button variant="default">
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
              <Button variant="default">Grid: {gridOption.label}</Button>
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
      <div className={classes.work}>{rollNode}</div>
    </div>
  );
}

/** The piano-roll editor for notes data-blocks. Keyed by data-block, so switching data-blocks resets the view state. */
export function NotesEditor({ dataBlock, onChordAnchor }: DataBlockEditorProps) {
  // The chord session of WorkbenchSessions when one is above; otherwise a private one (tests and hosts
  // outside the page; the page mounts WorkbenchSessions since M4c), so the editor works either way.
  const shared = useOptionalChordSession();
  const sharedSession = useOptionalDataBlockEditorSession();
  let body = (
    <NotesEditorBody key={dataBlock.id} dataBlock={dataBlock} onChordAnchor={onChordAnchor} />
  );
  // The same for the Notes editor session: a private one without WorkbenchSessions above.
  if (!sharedSession) {
    body = <DataBlockEditorSessionProvider>{body}</DataBlockEditorSessionProvider>;
  }
  return shared ? body : <ChordSessionProvider>{body}</ChordSessionProvider>;
}

registerDataBlockEditor(NOTE_EDITOR_ID, NotesEditor);
