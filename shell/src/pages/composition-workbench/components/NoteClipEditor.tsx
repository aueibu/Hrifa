import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Badge, Button, Menu, Text, Title, VisuallyHidden } from '@mantine/core';
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
import { runClipAction } from '../clipActionRunner';
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
} from '../noteClipEdits';
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
import { selectionKeyOf, type RotationSessionCore } from '../rotationSession';
import { pitchLabel } from '../routeTreatments';
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
  { id: 'chords', label: 'Chords', shortcut: '7' },
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

/** Marks the editor's root and the clip actions panel: the scope of the editor's window-level keys. */
const EDITOR_SCOPE = '[data-note-editor-scope]';

/**
 * Whether a key event's target is in the editor's scope: inside the editor or the actions panel, or
 * (with `orBody`) nowhere in particular (the page body or the window).
 */
function inEditorScope(target: EventTarget | null, orBody = false): boolean {
  if (!(target instanceof Element)) {
    return orBody;
  }
  return (
    !!target.closest(EDITOR_SCOPE) ||
    (orBody && (target === document.body || target === document.documentElement))
  );
}

/**
 * What a screen reader hears when Alt+arrow lands on a note: its pitch name, where it starts (bar
 * and beat in the clip's meter), and its place in the navigation order.
 */
function describeNote(packet: DataPacket, id: string, meter: string): string {
  const item = packet.items.find((entry) => entry.id === id);
  if (!item || !isNoteItem(item)) {
    return '';
  }
  const { numerator, denominator } = parseMeter(meter);
  const barLength = (numerator * 4) / denominator;
  const beatLength = 4 / denominator;
  const onset = rationalToNumber(item.value.onset.quarterNotes);
  const bar = Math.floor(onset / barLength + 1e-9);
  const beat = (onset - bar * barLength) / beatLength + 1;
  const order = navigationOrder(packet);
  const name = item.value.pitches.map((midicents) => pitchLabel(midicents)).join(' ');
  return `${name} at bar ${bar + 1} beat ${Number(beat.toFixed(2))}, selected, ${order.indexOf(id) + 1} of ${order.length}`;
}

function NoteClipEditorBody({ snippet, onChordAnchor }: ClipEditorProps) {
  const { commitSnippetEditById, latestSnippetById, loading, locked } = useDesk();
  const { settings } = useCompositionSettings();
  const { packet } = snippet;
  // Transient view state: tool, selection (events and the time they occupy), zoom and scroll live in
  // this component only. They are never recorded in the history and never written to the packet.
  const [view, setView] = useState(() => openingView(packet));
  // Pencil on an empty clip, Pointer otherwise.
  const [tool, setToolState] = useState(() => (packet.items.length > 0 ? 'pointer' : 'pencil'));
  const [rampState, setRampState] = useState<ActiveRamp | null>(null);
  // The pick-pitch mode the inspector's Invert / Make equal > Pitch put the editor in (the second part
  // of a two-part action). Editor-side only, like the selection: never in the packet or the history.
  const [pick, setPick] = useState<PickPitchRequest | null>(null);
  const [rotationState, setRotationState] = useState<ActiveRotation | null>(null);
  // The Chords tool's current anchor (editor-side only, like the selection); leaving the tool clears it.
  const [chordAnchor, setChordAnchor] = useState<{
    pitchMidicents: number;
    start: number;
    step: number;
  } | null>(null);
  // Any tool change ends the ramp (it is a Paint-tool secondary selection) and a waiting pick.
  function setTool(next: string) {
    setToolState(next);
    setRampState(null);
    setPick(null);
    setChordAnchor(null);
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
  // Keyboard selection moves ask the roll to scroll the new note into view (token: once per press).
  const [reveal, setReveal] = useState<{ id: string; token: number } | null>(null);
  // Whether a pointer button is down anywhere: any drag or lane gesture is one, and the arrow keys
  // must not edit under it. Window listeners so a release outside the roll still counts.
  const pointerHeld = useRef(false);
  // An Alt+arrow was handled since Alt went down: its keyup must not reach the browser's menu bar.
  const altArrowHandled = useRef(false);
  // Whether the pointer is over the editor (scopes the ramp's Escape together with the focus).
  const pointerInside = useRef(false);
  useEffect(() => {
    const down = () => {
      pointerHeld.current = true;
    };
    const up = () => {
      pointerHeld.current = false;
    };
    // A button that is no longer down (its release was lost, such as to a context menu) ends it too.
    const move = (event: PointerEvent) => {
      if (event.buttons === 0 && pointerHeld.current) {
        pointerHeld.current = false;
      }
    };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('lostpointercapture', up, true);
    window.addEventListener('blur', up);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('lostpointercapture', up, true);
      window.removeEventListener('blur', up);
    };
  }, []);
  const selection = useMemo(
    () => currentSelection(selectionState, packet),
    [selectionState, packet]
  );
  // The latest selection, kept in step synchronously by every writer (commit, adopt, navigation), so
  // a key press under auto-repeat that lands before the next render never reads a stale one.
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  // What assistive technology hears when Alt+arrow moves the selection.
  const [announcement, setAnnouncement] = useState('');

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
      // Only while the focus or the pointer is in the editor: not from an unrelated control.
      if (event.key === 'Escape' && !typing && (pointerInside.current || inEditorScope(target))) {
        setRampState(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rampActive]);

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
      const typing =
        target &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (typing || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setPick(null);
      } else if (event.key === 'Enter' && pick?.onDefault && inEditorScope(target, true)) {
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
  }, [snippet.id, selection, gridUnit, snapUnit, pick?.actionId, rotation]);
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
    after?: (next: DataPacket) => NoteSelection,
    lineage?: ReadonlyMap<string, string>
  ): { base: DataPacket; committed: DataPacket; selection: NoteSelection } | null {
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
      () => newNoteItemId(snippet.id),
      lineage
    );
    const next = resolved.packet;
    const survivorOf = resolved.survivorOf;
    const resolvedChange = next !== edited;
    if (resolvedChange && jsonEqual(next.items, base.items)) {
      // Everything the edit added was absorbed by notes that were already there.
      return null;
    }
    const result = commitSnippetEditById(snippet.id, next, NOTE_EDIT_OPERATION, { handEdit: true });
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
      basis: result.snippet.packet,
      moves: state.moves,
    }));
    return { base, committed: result.snippet.packet, selection: nextSelection };
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
    commit((current) => splitNote(current, id, at, right), undefined, new Map([[right, id]]));
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
    const lineage = new Map<string, string>();
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
    const outcome = runClipAction({
      snippetId: snippet.id,
      fallback: packet,
      actionId,
      desk: { commitSnippetEditById, latestSnippetById },
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
      const latest = latestSnippetById(snippet.id)?.packet ?? packet;
      const chosen = navigateSelection(latest, ids, edit.direction);
      if (chosen !== null) {
        setSelection(() => selectIds(latest, [chosen]));
        setAnnouncement(describeNote(latest, chosen, clipMeter));
        setReveal((current) => ({ id: chosen, token: (current?.token ?? 0) + 1 }));
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

  return (
    <div
      className={classes.editor}
      data-note-editor-scope=""
      onPointerEnter={() => {
        pointerInside.current = true;
      }}
      onPointerLeave={() => {
        pointerInside.current = false;
      }}
    >
      <div className={classes.header}>
        <div className={classes.title}>
          <Title order={2} size="xs">
            {snippet.name}
          </Title>
          <Badge variant="outline">{packet.items.length} notes</Badge>
        </div>
        <VisuallyHidden role="status" aria-live="polite" data-testid="note-announcement">
          {announcement}
        </VisuallyHidden>
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
            if (pick || pointerHeld.current) {
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
          ariaLabel="Note clip piano roll"
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
          ghostNotes={
            tool === 'chords' && chordAnchor
              ? [
                  {
                    pitchMidicents: chordAnchor.pitchMidicents,
                    start: chordAnchor.start,
                    duration: chordAnchor.step,
                    variant: 'anchor',
                  },
                ]
              : undefined
          }
          onAnchorClick={(anchor) => {
            setChordAnchor(anchor);
            onChordAnchor?.({ pitchMidicents: anchor.pitchMidicents, onset: anchor.start });
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
    </div>
  );
}

/** The piano-roll editor for note clips. Keyed by clip, so switching clips resets the view state. */
export function NoteClipEditor({ snippet, onChordAnchor }: ClipEditorProps) {
  return <NoteClipEditorBody key={snippet.id} snippet={snippet} onChordAnchor={onChordAnchor} />;
}

registerClipEditor(NOTE_EDITOR_ID, NoteClipEditor);
