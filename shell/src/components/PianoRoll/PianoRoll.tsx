import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ActionIcon, Button, Group, Switch, Text } from '@mantine/core';
import {
  actionEnabled,
  EditorContextMenu,
  EditorPalette,
  shortcutMatch,
  type EditorAction,
  type EditorTool,
} from '../EditorPalette';
import { useInfoBarActive } from '../InfoBar';
import {
  DEFAULT_ENTRY_VELOCITY,
  MIN_NOTE_QUARTERS,
  type PianoRollGridLine,
  type PianoRollNewNote,
  type PianoRollNote,
  type PianoRollRange,
  type PianoRollViewState,
} from './model';
import {
  clickSelection,
  marqueeSelection,
  noteRect,
  notesInRect,
  rectFromCorners,
  selectionId,
  type PixelRect,
} from './selection';
import classes from './PianoRoll.module.css';

const KEYBOARD_WIDTH = 4.5 * 16;
const RULER_HEIGHT = 2 * 16;
const MIN_TIME_ZOOM = 16;
const MAX_TIME_ZOOM = 192;
const MIN_PITCH_ZOOM = 12;
const MAX_PITCH_ZOOM = 36;

export interface PianoRollProps {
  notes: PianoRollNote[];
  duration: number;
  gridLines: PianoRollGridLine[];
  view: PianoRollViewState;
  onViewChange(view: PianoRollViewState): void;
  playhead?: number;
  isPlaying?: boolean;
  height?: number;
  ariaLabel?: string;
  /** Hide the zoom and follow controls, for a compact roll whose view is set by its owner. */
  showToolbar?: boolean;
  /**
   * Note selection is on when `onSelectionChange` is given: click a note, shift/ctrl-click to toggle,
   * drag on empty space to marquee-select, and Escape or a click on empty space to clear. The owner
   * holds the selection, so it can act on it (capture to the desk, for example).
   */
  selectedIds?: string[];
  onSelectionChange?(ids: string[]): void;
  /** Mutually exclusive modes, shown on the palette at the roll's right edge. */
  tools?: EditorTool[];
  activeTool?: string;
  onToolChange?(id: string): void;
  /** One-shot actions on the selection: palette buttons, right-click menu items and key shortcuts. */
  actions?: EditorAction[];
  /**
   * Editing. Each callback is optional and a roll with none behaves as a viewer with selection. The
   * roll holds no edit state beyond a gesture in progress: it previews a drag and reports it once, on
   * release, so one drag is one call (and one undo step for an owner that records edits). Ids are
   * selection ids (a chord is one id). Times are quarter notes snapped to the grid; pitches are whole
   * semitones in midicents.
   *
   * - `onAddNote`: with the tool `pencil` active, a click on empty space (a drag sideways sets the
   *   note's length, a drag up or down its velocity, shown as a percentage), and a double-click on
   *   empty space with the tool `pointer`.
   * - `onMoveNotes`: dragging a note moves the whole selection by the deltas.
   * - `onResizeNotes`: dragging a note's right edge changes the selection's durations by the delta.
   * - `onDeleteNotes`: with the tool `eraser` active, the notes swept over while the button was
   *   held, reported once on release (Escape cancels); with the tool `pointer`, a double-click on
   *   a note.
   * - `onVelocityChange`: Alt-dragging a note up or down changes the selection's velocity by the delta
   *   (a fraction of the 0 to 1 range).
   */
  onAddNote?(note: PianoRollNewNote): void;
  onMoveNotes?(ids: string[], delta: { start: number; pitchMidicents: number }): void;
  onResizeNotes?(ids: string[], deltaDuration: number): void;
  onDeleteNotes?(ids: string[]): void;
  onVelocityChange?(ids: string[], delta: number): void;
  /**
   * Reported when a marquee ends: the time span it covered, snapped to the grid. A selection can
   * reach over empty space, so the owner may keep this range beside the selected ids.
   */
  onMarqueeRange?(range: PianoRollRange): void;
  /** A band drawn behind the notes over this time span, for the owner's selected range. */
  selectedRange?: PianoRollRange | null;
  /**
   * Ghost drag (opt-in): while a note is dragged to move or resize it, the real note stays where it
   * is and a ghost follows the pointer, labelled with the pitch under it. The edit commits on
   * release and Escape cancels the drag. Without it the notes themselves follow the pointer.
   */
  ghostDrag?: boolean;
  /**
   * The end of the playback area, in quarter notes (opt-in). Drawn as bracket markers on the ruler
   * and a line through the roll, with the stretch after it dimmed. Notes may extend past it; the
   * roll only marks where playback stops.
   */
  endMarker?: number;
  /**
   * Fill mode (opt-in): the roll takes the full width and height its parent gives it (the parent
   * must have a definite height) instead of a fixed `height`, so it resizes with its panel, and the
   * timeline is at least as wide as the view so the grid runs to the right edge.
   */
  fill?: boolean;
  /**
   * Wheel zoom (opt-in): Ctrl/Cmd and the wheel zooms time around the pointer, Ctrl/Cmd+Alt zooms
   * pitch, and Shift or Alt and the wheel scrolls sideways. The plain wheel always scrolls the keys up and
   * down. Zoom and scroll are the owner's view state, never an edit.
   */
  wheelZoom?: boolean;
  /**
   * The grid subdivision, in quarter notes (opt-in): drives snapping, the paint can, the knife and
   * the dotted grid lines. Without it the grid adapts to the zoom.
   */
  gridUnit?: number;
  /**
   * The length a note entered by a click or double-click gets, in quarter notes; the grid unit when
   * unset. Dragging sideways with the pencil sets a new one and reports it here, so the owner can
   * remember it for the next note.
   */
  entryLength?: number;
  onEntryLengthChange?(length: number): void;
  /** With the tool `paint`: one note per grid step swept over, at the pitch under the pointer, on release. */
  onPaintNotes?(notes: PianoRollNewNote[]): void;
  /** With the tool `knife`: a click on a note, with the grid line nearest the pointer (quarter notes). */
  onSplitNote?(id: string, at: number): void;
}

/** A gesture in progress, kept by reference so the pointer math never reads a stale render. */
type Gesture =
  | {
      kind: 'move' | 'resize' | 'velocity';
      ids: string[];
      x: number;
      y: number;
      moved: boolean;
      /** A plain click on an already-selected note selects only it, but only if it was not a drag. */
      collapseTo?: string;
    }
  | {
      kind: 'draw';
      start: number;
      pitchMidicents: number;
      x: number;
      y: number;
      /** The length a plain click gives the note. */
      length: number;
    }
  | {
      kind: 'paint';
      /** Grid step index to the keyboard row (midi) painted there. */
      cells: Map<number, number>;
      last: number;
    }
  | { kind: 'erase'; ids: Set<string>; x: number; y: number }
  | { kind: 'time'; x: number; moved: boolean; additive: boolean };

const MAX_MIDICENTS = 12700;

/** What the roll draws while a gesture runs. */
interface GesturePreview {
  kind: Gesture['kind'];
  ids: ReadonlySet<string>;
  dStart: number;
  dPitch: number;
  dDuration: number;
  dVelocity: number;
  drawn?: PianoRollNewNote;
  /** The pencil's drag changed the length (so it is remembered). */
  lengthSet?: boolean;
  /** A percentage that follows the pointer while a note's velocity is set. */
  readout?: { text: string; x: number; y: number };
  painted?: PianoRollNewNote[];
  /** Notes the eraser has swept over. */
  erasing?: ReadonlySet<string>;
  timeRange?: PianoRollRange;
}

/** A drag shorter than this is a click. */
const DRAG_PIXELS = 4;

const RESIZE_HANDLE_PIXELS = 6;
const VELOCITY_RANGE_PIXELS = 120;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function midiPitchLabel(midi: number) {
  const pitchClasses = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  return `${pitchClasses[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function adaptiveSubdivision(pixelsPerQuarter: number) {
  if (pixelsPerQuarter >= 112) {
    return 0.25;
  }
  if (pixelsPerQuarter >= 56) {
    return 0.5;
  }
  return 1;
}

export function PianoRoll({
  notes,
  duration,
  gridLines,
  view,
  onViewChange,
  playhead,
  isPlaying = false,
  height = 440,
  ariaLabel = 'Piano roll',
  showToolbar = true,
  selectedIds,
  onSelectionChange,
  tools,
  activeTool,
  onToolChange,
  actions,
  onAddNote,
  onMoveNotes,
  onResizeNotes,
  onDeleteNotes,
  onVelocityChange,
  onMarqueeRange,
  selectedRange,
  ghostDrag = false,
  endMarker,
  fill = false,
  wheelZoom = false,
  gridUnit,
  entryLength,
  onEntryLengthChange,
  onPaintNotes,
  onSplitNote,
}: PianoRollProps) {
  const infoBar = useInfoBarActive();
  const selectable = onSelectionChange !== undefined;
  const selected = useMemo(() => new Set(selectedIds ?? []), [selectedIds]);
  const actionContext = useMemo(() => ({ selectedIds: selectedIds ?? [] }), [selectedIds]);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);

  function openMenu(event: ReactMouseEvent<HTMLDivElement>) {
    if (!selectable || !actions?.length) {
      return;
    }
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    const point = {
      left: event.clientX - box.left,
      top: event.clientY - box.top,
      width: 1,
      height: 1,
    };
    const [hit] = notesInRect(notes, view, point);
    // Right-clicking a note outside the selection selects it first, as editors usually do.
    if (hit !== undefined && !selected.has(hit)) {
      onSelectionChange?.([hit]);
    }
    setMenuAt({ x: event.clientX, y: event.clientY });
  }
  const [marquee, setMarquee] = useState<PixelRect | null>(null);
  // While a marquee is dragged: the selection it would make. Drawn as selected, committed on release.
  const [marqueeIds, setMarqueeIds] = useState<string[] | null>(null);
  const shown = useMemo(
    () => (marqueeIds ? new Set(marqueeIds) : selected),
    [marqueeIds, selected]
  );
  const drag = useRef<{ x: number; y: number; additive: boolean; moved: boolean } | null>(null);

  function rollPoint(event: ReactPointerEvent<HTMLElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  const rollRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [preview, setPreview] = useState<GesturePreview | null>(null);
  const editable = Boolean(onMoveNotes || onResizeNotes || onVelocityChange);
  const snapUnit = gridUnit ?? adaptiveSubdivision(view.pixelsPerQuarter);
  const entryDefault = entryLength ?? snapUnit;

  function snapped(quarters: number) {
    return Math.round(quarters / snapUnit) * snapUnit;
  }

  function rollPointAt(event: { clientX: number; clientY: number }) {
    const box = rollRef.current?.getBoundingClientRect();
    return { x: event.clientX - (box?.left ?? 0), y: event.clientY - (box?.top ?? 0) };
  }

  /** The grid step under an x position, and the keyboard row under a y position. */
  function cellAt(point: { x: number; y: number }) {
    return {
      index: Math.max(0, Math.floor(point.x / view.pixelsPerQuarter / snapUnit + 1e-9)),
      midi: clamp(127 - Math.floor(point.y / view.pixelsPerSemitone), 0, 127),
    };
  }

  function paintedNotes(cells: Map<number, number>): PianoRollNewNote[] {
    return [...cells.entries()]
      .sort(([left], [right]) => left - right)
      .map(([index, midi]) => ({
        start: index * snapUnit,
        duration: snapUnit,
        pitchMidicents: midi * 100,
      }));
  }

  /** Paints every step between the last one and the pointer, at the pitch under the pointer. */
  function advancePaint(
    current: Extract<Gesture, { kind: 'paint' }>,
    point: { x: number; y: number }
  ) {
    const { index, midi } = cellAt(point);
    const direction = index >= current.last ? 1 : -1;
    for (let step = current.last; step !== index; step += direction) {
      if (!current.cells.has(step + direction)) {
        current.cells.set(step + direction, midi);
      }
    }
    current.cells.set(index, midi);
    current.last = index;
  }

  /** Marks every note the pointer crossed since the last move, sampled so a fast sweep skips none. */
  function advanceErase(
    current: Extract<Gesture, { kind: 'erase' }>,
    point: { x: number; y: number }
  ) {
    const steps = Math.max(1, Math.ceil(Math.hypot(point.x - current.x, point.y - current.y) / 4));
    for (let step = 1; step <= steps; step += 1) {
      const x = current.x + ((point.x - current.x) * step) / steps;
      const y = current.y + ((point.y - current.y) * step) / steps;
      notesInRect(notes, view, { left: x, top: y, width: 1, height: 1 }).forEach((id) =>
        current.ids.add(id)
      );
    }
    current.x = point.x;
    current.y = point.y;
  }

  /** The time span a time-selection drag covers, snapped outward to the grid. */
  function timeRangeOf(fromX: number, toX: number): PianoRollRange {
    const start = Math.max(
      0,
      Math.floor(Math.min(fromX, toX) / view.pixelsPerQuarter / snapUnit + 1e-9) * snapUnit
    );
    const end =
      Math.ceil(Math.max(fromX, toX) / view.pixelsPerQuarter / snapUnit - 1e-9) * snapUnit;
    return { start, end: end > start ? end : start + snapUnit };
  }

  function previewFor(current: Gesture, point: { x: number; y: number }): GesturePreview {
    const blank = {
      kind: current.kind,
      ids: new Set<string>(),
      dStart: 0,
      dPitch: 0,
      dDuration: 0,
      dVelocity: 0,
    };
    if (current.kind === 'draw') {
      // The drag's dominant axis decides what it sets, so sideways jitter during a vertical
      // (loudness) drag cannot set the remembered length, nor the reverse.
      const dx = point.x - current.x;
      const dy = point.y - current.y;
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      const sized = horizontal && Math.abs(dx) >= DRAG_PIXELS;
      const end = snapped(point.x / view.pixelsPerQuarter);
      const velocity =
        !horizontal && Math.abs(dy) >= DRAG_PIXELS
          ? Math.round(clamp(DEFAULT_ENTRY_VELOCITY - dy / VELOCITY_RANGE_PIXELS, 0, 1) * 100) / 100
          : undefined;
      return {
        ...blank,
        lengthSet: sized,
        readout: {
          text: `${Math.round((velocity ?? DEFAULT_ENTRY_VELOCITY) * 100)}%`,
          x: point.x,
          y: point.y,
        },
        drawn: {
          start: current.start,
          duration: sized ? Math.max(snapUnit, end - current.start) : current.length,
          pitchMidicents: current.pitchMidicents,
          ...(velocity === undefined ? {} : { velocity }),
        },
      };
    }
    if (current.kind === 'paint') {
      return { ...blank, painted: paintedNotes(current.cells) };
    }
    if (current.kind === 'erase') {
      return { ...blank, erasing: new Set(current.ids) };
    }
    if (current.kind === 'time') {
      return { ...blank, timeRange: timeRangeOf(current.x, point.x) };
    }
    const dx = snapped((point.x - current.x) / view.pixelsPerQuarter);
    const dy = point.y - current.y;
    const ids = new Set(current.ids);
    let dStart = current.kind === 'move' ? dx : 0;
    let dPitch =
      current.kind === 'move' ? (-Math.round(dy / view.pixelsPerSemitone) || 0) * 100 : 0;
    if (current.kind === 'move') {
      // One delta for the whole group, clamped once (at the start of time and the keyboard's ends),
      // so a group keeps its shape and the preview is exactly what the owner will commit.
      const moving = notes.filter((note) => ids.has(selectionId(note)));
      if (moving.length) {
        const pitches = moving.map((note) => note.pitchMidicents);
        dStart = Math.max(dStart, -Math.min(...moving.map((note) => note.start)));
        dPitch = clamp(dPitch, -Math.min(...pitches), MAX_MIDICENTS - Math.max(...pitches));
      }
    }
    return {
      kind: current.kind,
      ids,
      dStart,
      dPitch,
      dDuration: current.kind === 'resize' ? dx : 0,
      dVelocity: current.kind === 'velocity' ? clamp(-dy / VELOCITY_RANGE_PIXELS, -1, 1) : 0,
    };
  }

  function moveGesture(event: ReactPointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current) {
      return;
    }
    const point = rollPointAt(event);
    if (current.kind === 'paint') {
      advancePaint(current, point);
    } else if (current.kind === 'erase') {
      advanceErase(current, point);
    } else if (current.kind === 'time') {
      if (!current.moved && Math.abs(point.x - current.x) < DRAG_PIXELS) {
        return;
      }
      current.moved = true;
    } else if (current.kind !== 'draw') {
      if (!current.moved && Math.hypot(point.x - current.x, point.y - current.y) < DRAG_PIXELS) {
        return;
      }
      current.moved = true;
    }
    setPreview(previewFor(current, point));
  }

  function endGesture(event: ReactPointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    gesture.current = null;
    setPreview(null);
    if (!current) {
      return;
    }
    const point = rollPointAt(event);
    if (current.kind === 'draw') {
      const result = previewFor(current, point);
      if (result.lengthSet) {
        onEntryLengthChange?.(result.drawn!.duration);
      }
      onAddNote?.(result.drawn!);
      return;
    }
    if (current.kind === 'paint') {
      advancePaint(current, point);
      onPaintNotes?.(paintedNotes(current.cells));
      return;
    }
    if (current.kind === 'erase') {
      advanceErase(current, point);
      if (current.ids.size) {
        onDeleteNotes?.([...current.ids]);
      }
      return;
    }
    if (current.kind === 'time') {
      if (!current.moved) {
        // A click without a drag clears, like a click on empty space with the pointer.
        if (!current.additive) {
          onSelectionChange?.([]);
        }
        return;
      }
      const range = timeRangeOf(current.x, point.x);
      const inside = notes
        .filter((note) => note.start >= range.start - 1e-9 && note.start < range.end - 1e-9)
        .map(selectionId);
      onSelectionChange?.(
        marqueeSelection(
          selectedIds ?? [],
          inside.filter((id, index) => inside.indexOf(id) === index),
          current.additive
        )
      );
      onMarqueeRange?.(range);
      return;
    }
    if (!current.moved) {
      if (current.collapseTo !== undefined) {
        onSelectionChange?.([current.collapseTo]);
      }
      return;
    }
    const result = previewFor(current, point);
    if (current.kind === 'move' && (result.dStart !== 0 || result.dPitch !== 0)) {
      onMoveNotes?.(current.ids, { start: result.dStart, pitchMidicents: result.dPitch });
    } else if (current.kind === 'resize' && result.dDuration !== 0) {
      onResizeNotes?.(current.ids, result.dDuration);
    } else if (current.kind === 'velocity' && Math.abs(result.dVelocity) >= 0.01) {
      onVelocityChange?.(current.ids, result.dVelocity);
    }
  }

  function cancelGesture() {
    gesture.current = null;
    setPreview(null);
  }

  // A gesture left running (the window loses focus mid-sweep) must not commit later.
  const gestureActive = preview !== null;
  useEffect(() => {
    if (!gestureActive) {
      return undefined;
    }
    const cancel = () => {
      gesture.current = null;
      setPreview(null);
    };
    window.addEventListener('blur', cancel);
    return () => window.removeEventListener('blur', cancel);
  }, [gestureActive]);

  /** A ghost drag leaves the real notes alone and draws ghosts instead. */
  const ghosting =
    ghostDrag && preview !== null && (preview.kind === 'move' || preview.kind === 'resize');

  /** What the roll draws: the notes, moved, resized or re-voiced by the gesture in progress. */
  const shownNotes = useMemo(() => {
    if (!preview || ghosting) {
      return notes;
    }
    const changed = notes.map((note) => {
      if (!preview.ids.has(selectionId(note))) {
        return note;
      }
      return {
        ...note,
        start: Math.max(0, note.start + preview.dStart),
        pitchMidicents: clamp(note.pitchMidicents + preview.dPitch, 0, 12700),
        duration: Math.max(MIN_NOTE_QUARTERS, note.duration + preview.dDuration),
        velocity: clamp((note.velocity ?? 1) + preview.dVelocity, 0, 1),
      };
    });
    const entered: PianoRollNote[] = [
      ...(preview.drawn ? [{ id: '\u0000drawing', label: '', velocity: 1, ...preview.drawn }] : []),
      ...(preview.painted ?? []).map((note, index) => ({
        id: `\u0000paint:${index}`,
        label: '',
        velocity: 1,
        ...note,
      })),
    ];
    return entered.length ? [...changed, ...entered] : changed;
  }, [notes, preview, ghosting]);

  /** Where the dragged notes would land, drawn as ghosts; a move's label is the pitch under it. */
  const ghostNotes = useMemo(() => {
    if (!preview || !ghosting) {
      return [];
    }
    return notes
      .filter((note) => preview.ids.has(selectionId(note)))
      .map((note) => {
        const pitchMidicents = clamp(note.pitchMidicents + preview.dPitch, 0, MAX_MIDICENTS);
        return {
          ...note,
          id: `ghost:${note.id}`,
          sourceId: selectionId(note),
          start: Math.max(0, note.start + preview.dStart),
          pitchMidicents,
          duration: Math.max(MIN_NOTE_QUARTERS, note.duration + preview.dDuration),
          label:
            preview.kind === 'move' ? midiPitchLabel(Math.round(pitchMidicents / 100)) : note.label,
        };
      });
  }, [notes, preview, ghosting]);

  function startGesture(event: ReactPointerEvent<HTMLDivElement>, current: Gesture) {
    gesture.current = current;
    setPreview(previewFor(current, rollPoint(event)));
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.currentTarget.focus();
  }

  function beginDraw(event: ReactPointerEvent<HTMLDivElement>) {
    const point = rollPoint(event);
    const { index, midi } = cellAt(point);
    startGesture(event, {
      kind: 'draw',
      start: index * snapUnit,
      pitchMidicents: midi * 100,
      x: point.x,
      y: point.y,
      length: entryDefault,
    });
  }

  function beginPaint(event: ReactPointerEvent<HTMLDivElement>) {
    const { index, midi } = cellAt(rollPoint(event));
    startGesture(event, { kind: 'paint', cells: new Map([[index, midi]]), last: index });
  }

  function beginErase(event: ReactPointerEvent<HTMLDivElement>) {
    const point = rollPoint(event);
    const current: Gesture = { kind: 'erase', ids: new Set(), x: point.x, y: point.y };
    advanceErase(current, point);
    startGesture(event, current);
  }

  function beginTime(event: ReactPointerEvent<HTMLDivElement>) {
    startGesture(event, {
      kind: 'time',
      x: rollPoint(event).x,
      moved: false,
      additive: event.shiftKey || event.ctrlKey || event.metaKey,
    });
  }

  function beginNoteGesture(note: PianoRollNote, event: ReactPointerEvent<HTMLElement>) {
    const id = selectionId(note);
    const toggle = event.shiftKey || event.ctrlKey || event.metaKey;
    // The knife splits at the grid line nearest the pointer and leaves the selection as it was.
    if (activeTool === 'knife' && onSplitNote) {
      const at = snapped(rollPointAt(event).x / view.pixelsPerQuarter);
      if (at > note.start + 1e-6 && at < note.start + note.duration - 1e-6) {
        onSplitNote(id, at);
      }
      return;
    }
    const alreadySelected = selected.has(id);
    // With editing on, pressing a selected note keeps the whole selection so it can be dragged
    // together; it collapses to this note on release if nothing was dragged.
    const keepSelection = editable && alreadySelected && !toggle;
    if (!keepSelection) {
      onSelectionChange?.(clickSelection(selectedIds ?? [], id, toggle));
    }
    event.currentTarget.parentElement?.focus();
    if (!editable || toggle) {
      return;
    }
    const point = rollPointAt(event);
    const rect = noteRect(note, view);
    const kind =
      event.altKey && onVelocityChange
        ? 'velocity'
        : onResizeNotes &&
            rect.width > 2 * RESIZE_HANDLE_PIXELS &&
            point.x >= rect.left + rect.width - RESIZE_HANDLE_PIXELS
          ? 'resize'
          : onMoveNotes
            ? 'move'
            : null;
    if (!kind) {
      return;
    }
    gesture.current = {
      kind,
      ids: alreadySelected ? [...(selectedIds ?? [])] : [id],
      x: point.x,
      y: point.y,
      moved: false,
      collapseTo: keepSelection ? id : undefined,
    };
    rollRef.current?.setPointerCapture?.(event.pointerId);
  }

  function beginMarquee(event: ReactPointerEvent<HTMLDivElement>) {
    if (!selectable || event.button !== 0) {
      return;
    }
    if (activeTool === 'pencil' && onAddNote) {
      beginDraw(event);
      return;
    }
    if (activeTool === 'paint' && onPaintNotes) {
      beginPaint(event);
      return;
    }
    if (activeTool === 'eraser' && onDeleteNotes) {
      beginErase(event);
      return;
    }
    if (activeTool === 'time') {
      beginTime(event);
      return;
    }
    if (activeTool === 'knife' && onSplitNote) {
      return;
    }
    const point = rollPoint(event);
    drag.current = {
      x: point.x,
      y: point.y,
      additive: event.shiftKey || event.ctrlKey || event.metaKey,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.currentTarget.focus();
  }

  /** Pointer tool: a double-click on empty space adds a note, on a note deletes it. */
  function doubleClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!selectable || activeTool !== 'pointer') {
      return;
    }
    const box = event.currentTarget.getBoundingClientRect();
    const point = { x: event.clientX - box.left, y: event.clientY - box.top };
    // Overlapping notes: a selected one is drawn on top (z-index), otherwise the one drawn last is.
    const hits = notesInRect(notes, view, { left: point.x, top: point.y, width: 1, height: 1 });
    const hit = hits.filter((id) => selected.has(id)).pop() ?? hits.pop();
    if (hit !== undefined) {
      onDeleteNotes?.([hit]);
      return;
    }
    if (onAddNote) {
      const { index, midi } = cellAt(point);
      onAddNote({ start: index * snapUnit, duration: entryDefault, pitchMidicents: midi * 100 });
    }
  }

  function moveMarquee(event: ReactPointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start) {
      return;
    }
    const point = rollPoint(event);
    if (!start.moved && Math.hypot(point.x - start.x, point.y - start.y) < 4) {
      return;
    }
    start.moved = true;
    const rect = rectFromCorners(start.x, start.y, point.x, point.y);
    setMarquee(rect);
    // Show what the marquee would select while it is dragged, not only after release.
    setMarqueeIds(
      marqueeSelection(selectedIds ?? [], notesInRect(notes, view, rect), start.additive)
    );
  }

  function endMarquee(event: ReactPointerEvent<HTMLDivElement>) {
    const start = drag.current;
    drag.current = null;
    setMarquee(null);
    setMarqueeIds(null);
    if (!start || !onSelectionChange) {
      return;
    }
    if (!start.moved) {
      // A plain click on empty space clears; with a modifier it leaves the selection alone.
      if (!start.additive) {
        onSelectionChange([]);
      }
      return;
    }
    const point = rollPoint(event);
    const box = rectFromCorners(start.x, start.y, point.x, point.y);
    const hit = notesInRect(notes, view, box);
    onSelectionChange(marqueeSelection(selectedIds ?? [], hit, start.additive));
    onMarqueeRange?.({
      start: Math.max(0, Math.floor(box.left / view.pixelsPerQuarter / snapUnit) * snapUnit),
      end: Math.ceil((box.left + box.width) / view.pixelsPerQuarter / snapUnit) * snapUnit,
    });
  }
  const scroller = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height });
  const safeDuration = Math.max(1, duration);
  // In fill mode the timeline runs at least to the right edge of the view.
  const visibleQuarters =
    fill && viewport.width
      ? Math.max(safeDuration, (viewport.width - KEYBOARD_WIDTH) / view.pixelsPerQuarter)
      : safeDuration;
  const timelineWidth = Math.max(1, visibleQuarters * view.pixelsPerQuarter);
  const pitchHeight = 128 * view.pixelsPerSemitone;
  const playheadX = playhead === undefined ? undefined : playhead * view.pixelsPerQuarter;
  const grid = useMemo(() => {
    const explicit = new Map(
      gridLines.map((line) => [Math.round(line.at * 1_000_000), line] as const)
    );
    // An owner's grid shows as lines while they are far enough apart to read.
    const subdivision =
      gridUnit !== undefined && gridUnit * view.pixelsPerQuarter >= 6
        ? gridUnit
        : adaptiveSubdivision(view.pixelsPerQuarter);
    const result: Array<PianoRollGridLine & { subdivision: boolean }> = [];
    for (let step = 0; step * subdivision <= visibleQuarters + subdivision / 2; step += 1) {
      const at = step * subdivision;
      const exact = explicit.get(Math.round(at * 1_000_000));
      result.push(
        exact ? { ...exact, subdivision: false } : { at, kind: 'beat', subdivision: true }
      );
    }
    gridLines.forEach((line) => {
      if (!result.some((candidate) => Math.abs(candidate.at - line.at) < 0.000001)) {
        result.push({ ...line, subdivision: false });
      }
    });
    return result.sort((left, right) => left.at - right.at);
  }, [gridLines, gridUnit, visibleQuarters, view.pixelsPerQuarter]);

  useEffect(() => {
    const element = scroller.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = scroller.current;
    if (!element) {
      return;
    }
    if (Math.abs(element.scrollLeft - view.scrollLeft) > 1) {
      element.scrollLeft = view.scrollLeft;
    }
    if (Math.abs(element.scrollTop - view.scrollTop) > 1) {
      element.scrollTop = view.scrollTop;
    }
  }, [view.scrollLeft, view.scrollTop, view.pixelsPerQuarter, view.pixelsPerSemitone]);

  function changeView(patch: Partial<PianoRollViewState>) {
    onViewChange({ ...view, ...patch });
  }

  function fitNotes() {
    if (!notes.length || !viewport.width || !viewport.height) {
      return;
    }
    const pitches = notes.map((note) => note.pitchMidicents / 100);
    const lowest = Math.min(...pitches);
    const highest = Math.max(...pitches);
    const pitchSpan = Math.max(5, highest - lowest + 3);
    const pixelsPerSemitone = clamp(
      (viewport.height - RULER_HEIGHT - 16) / pitchSpan,
      MIN_PITCH_ZOOM,
      MAX_PITCH_ZOOM
    );
    const pixelsPerQuarter = clamp(
      (viewport.width - KEYBOARD_WIDTH - 24) / safeDuration,
      MIN_TIME_ZOOM,
      MAX_TIME_ZOOM
    );
    const scrollTop = clamp(
      (127 - highest - 1.5) * pixelsPerSemitone,
      0,
      128 * pixelsPerSemitone - viewport.height + RULER_HEIGHT
    );
    changeView({
      pixelsPerQuarter,
      pixelsPerSemitone,
      scrollLeft: 0,
      scrollTop,
      framed: true,
    });
  }

  useEffect(() => {
    if (!view.framed && notes.length && viewport.width) {
      fitNotes();
    }
  });

  function centerPlayhead() {
    if (playheadX === undefined) {
      return;
    }
    changeView({
      scrollLeft: clamp(
        playheadX - (viewport.width - KEYBOARD_WIDTH) / 2,
        0,
        timelineWidth - viewport.width + KEYBOARD_WIDTH
      ),
    });
  }

  useEffect(() => {
    const element = scroller.current;
    if (!element || !view.followPlayback || playheadX === undefined) {
      return;
    }
    const visibleStart = element.scrollLeft;
    const visibleEnd = visibleStart + element.clientWidth - KEYBOARD_WIDTH;
    if (playheadX < visibleStart || playheadX > visibleEnd - 24) {
      changeView({ scrollLeft: clamp(playheadX, 0, timelineWidth) });
    }
  }, [playheadX, timelineWidth, view.followPlayback]);

  /** Zooms time. `anchor` is a pixel offset into the visible roll (default: its middle) that stays put. */
  function zoomTime(factor: number, anchor?: number) {
    const element = scroller.current;
    const visibleWidth = Math.max(0, (element?.clientWidth ?? viewport.width) - KEYBOARD_WIDTH);
    const at = anchor ?? visibleWidth / 2;
    const musicalAnchor = ((element?.scrollLeft ?? view.scrollLeft) + at) / view.pixelsPerQuarter;
    const pixelsPerQuarter = clamp(view.pixelsPerQuarter * factor, MIN_TIME_ZOOM, MAX_TIME_ZOOM);
    changeView({
      pixelsPerQuarter,
      scrollLeft: Math.max(0, musicalAnchor * pixelsPerQuarter - at),
      framed: true,
    });
  }

  /** Zooms pitch. `anchor` is a pixel offset below the ruler (default: the middle) that stays put. */
  function zoomPitch(factor: number, anchor?: number) {
    const element = scroller.current;
    const visibleHeight = Math.max(0, (element?.clientHeight ?? viewport.height) - RULER_HEIGHT);
    const at = anchor ?? visibleHeight / 2;
    const pitchAtAnchor =
      127 - ((element?.scrollTop ?? view.scrollTop) + at) / view.pixelsPerSemitone;
    const pixelsPerSemitone = clamp(
      view.pixelsPerSemitone * factor,
      MIN_PITCH_ZOOM,
      MAX_PITCH_ZOOM
    );
    changeView({
      pixelsPerSemitone,
      scrollTop: Math.max(0, (127 - pitchAtAnchor) * pixelsPerSemitone - at),
      framed: true,
    });
  }

  // The wheel needs a non-passive listener so Ctrl+wheel does not zoom the page. It reads the latest
  // handler through a ref, so the listener is attached once.
  const wheelHandler = useRef<(event: WheelEvent) => void>(() => undefined);
  wheelHandler.current = (event) => {
    const element = scroller.current;
    if (!wheelZoom || !element) {
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      // A sideways-only trackpad swipe has no zoom direction.
      if (event.deltaY === 0) {
        return;
      }
      const box = element.getBoundingClientRect();
      const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15;
      if (event.altKey) {
        zoomPitch(factor, Math.max(0, event.clientY - box.top - RULER_HEIGHT));
      } else {
        zoomTime(factor, Math.max(0, event.clientX - box.left - KEYBOARD_WIDTH));
      }
    } else if (event.shiftKey || event.altKey) {
      // Shift or Alt and the wheel scroll sideways (Ctrl, with or without Alt, zooms above).
      event.preventDefault();
      element.scrollLeft += event.deltaY || event.deltaX;
    }
  };
  useEffect(() => {
    const element = scroller.current;
    if (!element || !wheelZoom) {
      return undefined;
    }
    const listener = (event: WheelEvent) => wheelHandler.current(event);
    element.addEventListener('wheel', listener, { passive: false });
    return () => element.removeEventListener('wheel', listener);
  }, [wheelZoom]);

  return (
    <div className={classes.root} aria-label={ariaLabel} data-fill={fill || undefined}>
      {showToolbar && (
        <Group justify="space-between" gap="xs" className={classes.toolbar}>
          <Group gap={4} wrap="nowrap">
            <Button size="compact-xs" variant="default" onClick={fitNotes}>
              Fit notes
            </Button>
            <ActionIcon
              size="sm"
              variant="default"
              aria-label="Zoom out in time"
              onClick={() => zoomTime(0.8)}
            >
              −
            </ActionIcon>
            <Text size="xs" ff="monospace" className={classes.zoomReadout}>
              Time
            </Text>
            <ActionIcon
              size="sm"
              variant="default"
              aria-label="Zoom in in time"
              onClick={() => zoomTime(1.25)}
            >
              +
            </ActionIcon>
            <ActionIcon
              size="sm"
              variant="default"
              aria-label="Zoom out in pitch"
              onClick={() => zoomPitch(0.8)}
            >
              −
            </ActionIcon>
            <Text size="xs" ff="monospace" className={classes.zoomReadout}>
              Pitch
            </Text>
            <ActionIcon
              size="sm"
              variant="default"
              aria-label="Zoom in in pitch"
              onClick={() => zoomPitch(1.25)}
            >
              +
            </ActionIcon>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Button
              size="compact-xs"
              variant="subtle"
              disabled={playhead === undefined}
              onClick={centerPlayhead}
            >
              Center playhead
            </Button>
            <Switch
              size="xs"
              label="Follow playback"
              checked={view.followPlayback}
              onChange={(event) => changeView({ followPlayback: event.currentTarget.checked })}
            />
          </Group>
        </Group>
      )}

      <div className={classes.body}>
        <div
          ref={scroller}
          className={classes.scroller}
          style={fill ? undefined : { height }}
          onScroll={(event) => {
            const { scrollLeft, scrollTop } = event.currentTarget;
            if (
              Math.abs(scrollLeft - view.scrollLeft) > 1 ||
              Math.abs(scrollTop - view.scrollTop) > 1
            ) {
              changeView({ scrollLeft, scrollTop, framed: true });
            }
          }}
        >
          <div
            className={classes.content}
            style={{
              gridTemplateColumns: `${KEYBOARD_WIDTH}px ${timelineWidth}px`,
              gridTemplateRows: `${RULER_HEIGHT}px ${pitchHeight}px`,
            }}
          >
            <div className={classes.corner} aria-hidden="true" />
            <div className={classes.ruler} aria-hidden="true">
              {grid
                .filter((line) => line.kind === 'bar')
                .map((line) => (
                  <span key={`ruler:${line.at}`} style={{ left: line.at * view.pixelsPerQuarter }}>
                    {line.label}
                  </span>
                ))}
              {endMarker !== undefined && endMarker > 0 && (
                <span
                  className={classes.endBracket}
                  data-testid="roll-end-bracket"
                  style={{ left: endMarker * view.pixelsPerQuarter }}
                />
              )}
            </div>
            <div className={classes.keyboard} aria-hidden="true">
              {Array.from({ length: 128 }, (_, index) => 127 - index).map((midi) => {
                const pitchClass = midi % 12;
                const black = [1, 3, 6, 8, 10].includes(pitchClass);
                return (
                  <div
                    key={`key:${midi}`}
                    className={classes.key}
                    data-black={black || undefined}
                    data-c={pitchClass === 0 || undefined}
                    style={{
                      height: view.pixelsPerSemitone,
                      top: (127 - midi) * view.pixelsPerSemitone,
                    }}
                  >
                    {pitchClass === 0 ? midiPitchLabel(midi) : ''}
                  </div>
                );
              })}
            </div>
            <div
              ref={rollRef}
              className={classes.roll}
              role={selectable ? 'group' : 'img'}
              aria-label={`${ariaLabel}; ${notes.length} notes${selectable ? `, ${selected.size} selected` : ''}`}
              data-selectable={selectable || undefined}
              data-tool={selectable ? activeTool : undefined}
              tabIndex={selectable ? 0 : undefined}
              onPointerDown={beginMarquee}
              onPointerMove={(event) => {
                if (gesture.current) {
                  moveGesture(event);
                } else {
                  moveMarquee(event);
                }
              }}
              onPointerUp={(event) => {
                if (gesture.current) {
                  endGesture(event);
                } else {
                  endMarquee(event);
                }
              }}
              onLostPointerCapture={() => {
                // Capture released by the browser or the system: the release will never reach us.
                // After a normal pointerup the gesture is already finished, so this is a no-op.
                cancelGesture();
              }}
              onPointerCancel={() => {
                cancelGesture();
                drag.current = null;
                setMarquee(null);
                setMarqueeIds(null);
              }}
              onContextMenu={openMenu}
              onDoubleClick={doubleClick}
              onKeyDown={(event) => {
                if (!selectable) {
                  return;
                }
                if (event.key === 'Escape') {
                  // Escape first cancels a drag in progress (nothing is committed); only an idle
                  // roll clears the selection.
                  if (gesture.current) {
                    cancelGesture();
                  } else {
                    onSelectionChange?.([]);
                  }
                  return;
                }
                const tool = shortcutMatch(tools ?? [], event);
                if (tool) {
                  event.preventDefault();
                  onToolChange?.(tool.id);
                  return;
                }
                const action = shortcutMatch(actions ?? [], event);
                if (action && actionEnabled(action, actionContext)) {
                  event.preventDefault();
                  action.run(actionContext);
                }
              }}
            >
              {Array.from({ length: 129 }, (_, index) => (
                <span
                  key={`pitch-line:${index}`}
                  className={classes.pitchLine}
                  data-c={index < 128 && (127 - index) % 12 === 0 ? true : undefined}
                  style={{ top: index * view.pixelsPerSemitone }}
                />
              ))}
              {grid.map((line) => (
                <span
                  key={`grid:${line.at}:${line.kind}`}
                  className={classes.timeLine}
                  data-kind={line.kind}
                  data-subdivision={line.subdivision || undefined}
                  style={{ left: line.at * view.pixelsPerQuarter }}
                />
              ))}
              {endMarker !== undefined && endMarker > 0 && (
                <>
                  <span
                    className={classes.afterEnd}
                    style={{ left: endMarker * view.pixelsPerQuarter }}
                  />
                  <span
                    className={classes.endLine}
                    data-testid="roll-end-line"
                    style={{ left: endMarker * view.pixelsPerQuarter }}
                  />
                </>
              )}
              {selectedRange && selectedRange.end > selectedRange.start && (
                <span
                  className={classes.range}
                  data-testid="roll-range"
                  style={{
                    left: selectedRange.start * view.pixelsPerQuarter,
                    width: (selectedRange.end - selectedRange.start) * view.pixelsPerQuarter,
                  }}
                />
              )}
              {shownNotes.map((note) => {
                const rect = noteRect(note, view);
                const noteWidth = rect.width;
                const active =
                  isPlaying &&
                  playhead !== undefined &&
                  playhead >= note.start &&
                  playhead < note.start + note.duration;
                return (
                  <span
                    key={note.id}
                    className={classes.note}
                    data-active={active || undefined}
                    data-colored={note.color ? true : undefined}
                    data-selected={shown.has(selectionId(note)) || undefined}
                    data-erasing={preview?.erasing?.has(selectionId(note)) || undefined}
                    data-info={`${note.label} · ${note.start.toFixed(3)} qn · ${note.duration.toFixed(3)} qn`}
                    title={
                      infoBar
                        ? undefined
                        : `${note.label} · ${note.start.toFixed(3)} qn · ${note.duration.toFixed(3)} qn`
                    }
                    onPointerDown={
                      selectable
                        ? (event) => {
                            if (event.button !== 0) {
                              return;
                            }
                            // These tools sweep across notes, so the roll takes the press.
                            if (
                              activeTool === 'time' ||
                              (activeTool === 'paint' && onPaintNotes) ||
                              (activeTool === 'eraser' && onDeleteNotes)
                            ) {
                              return;
                            }
                            // Selecting a note must not start a marquee on the roll behind it.
                            event.stopPropagation();
                            beginNoteGesture(note, event);
                          }
                        : undefined
                    }
                    style={{
                      height: rect.height,
                      left: rect.left,
                      opacity: 0.62 + Math.min(1, Math.max(0, note.velocity ?? 1)) * 0.38,
                      top: rect.top,
                      width: noteWidth,
                      ...(note.color ? ({ '--note-color': note.color } as CSSProperties) : {}),
                    }}
                  >
                    {noteWidth > 34 ? note.label : ''}
                  </span>
                );
              })}
              {ghostNotes.map((note) => {
                const rect = noteRect(note, view);
                return (
                  <span
                    key={note.id}
                    className={`${classes.note} ${classes.ghost}`}
                    data-ghost={note.sourceId ?? note.id}
                    aria-hidden="true"
                    style={{
                      height: rect.height,
                      left: rect.left,
                      top: rect.top,
                      width: rect.width,
                    }}
                  >
                    {rect.width > 34 ? note.label : ''}
                  </span>
                );
              })}
              {preview?.timeRange && (
                <span
                  className={classes.range}
                  data-testid="roll-time-preview"
                  style={{
                    left: preview.timeRange.start * view.pixelsPerQuarter,
                    width:
                      (preview.timeRange.end - preview.timeRange.start) * view.pixelsPerQuarter,
                  }}
                />
              )}
              {preview?.readout && (
                <span
                  className={classes.readout}
                  data-testid="roll-velocity-readout"
                  style={{ left: preview.readout.x + 12, top: Math.max(0, preview.readout.y - 28) }}
                >
                  {preview.readout.text}
                </span>
              )}
              {marquee && (
                <span
                  className={classes.marquee}
                  style={{
                    left: marquee.left,
                    top: marquee.top,
                    width: marquee.width,
                    height: marquee.height,
                  }}
                />
              )}
              {playheadX !== undefined && (
                <span className={classes.playhead} style={{ left: playheadX }} />
              )}
            </div>
          </div>
        </div>
        {selectable && (
          <EditorPalette
            tools={tools}
            activeTool={activeTool}
            onToolChange={(id) => {
              onToolChange?.(id);
              // Back to the roll, so the number keys work without clicking it first.
              rollRef.current?.focus();
            }}
            actions={actions}
            context={actionContext}
          />
        )}
      </div>
      {selectable && actions && (
        <EditorContextMenu
          at={menuAt}
          onClose={() => setMenuAt(null)}
          actions={actions}
          context={actionContext}
        />
      )}
    </div>
  );
}
