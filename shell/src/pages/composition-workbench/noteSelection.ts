import type { DataPacket } from './model';
import { itemsSpan } from './noteClipEdits';

/** A span of clip time, in quarter notes. */
export interface TimeRange {
  start: number;
  end: number;
}

/**
 * What is selected in a note clip: the events, and the stretch of time they occupy. The range
 * covers the selected events but can reach further, over empty space (select a quarter note and two
 * quarters of silence after it, and a later duplicate copies all three beats). Transforms that work
 * on a selection (duplicate, scale, reverse; K5b) read the range, not just the ids; K5 itself only
 * acts on `ids`.
 *
 * Selection is transient view state: the editor holds it in component state, so it is never
 * recorded in the undo history and never written to the packet.
 */
export interface NoteSelection {
  /** Packet item ids (a chord is one event, one id). */
  ids: string[];
  /** Null when nothing is selected. A pure time selection has a range and no ids. */
  range: TimeRange | null;
  /**
   * 'time' when the selection is a time selection (the Time tool, or a Pointer marquee that caught
   * no notes): the roll and lane draw the band only then. Any other way of selecting leaves it unset.
   */
  kind?: 'time';
}

export const emptyNoteSelection: NoteSelection = { ids: [], range: null };

export function unionRange(a: TimeRange | null, b: TimeRange | null): TimeRange | null {
  if (!a || !b) {
    return a ?? b;
  }
  return { start: Math.min(a.start, b.start), end: Math.max(a.end, b.end) };
}

/** The selection of these events, its range exactly the time they occupy. */
export function selectIds(packet: DataPacket, ids: string[]): NoteSelection {
  const known = new Set(packet.items.map((item) => item.id));
  const present = ids.filter((id) => known.has(id));
  return { ids: present, range: itemsSpan(packet, present) };
}

/** Widens the range to also cover `range` (a marquee over empty space), keeping the events. */
export function extendRange(selection: NoteSelection, range: TimeRange): NoteSelection {
  return range.end > range.start
    ? { ids: selection.ids, range: unionRange(selection.range, range) }
    : selection;
}

/** A time selection: the events it caught and the span, drawn as a band. */
export function selectTime(selection: NoteSelection, range: TimeRange): NoteSelection {
  return range.end > range.start
    ? { ids: selection.ids, range: unionRange(selection.range, range), kind: 'time' }
    : selection;
}

/**
 * The selection after a press anywhere in the panel: a time selection (and the band it draws) is
 * cleared before the new gesture starts, so two bands are never visible at once. Any other selection
 * is untouched.
 */
export function clearTimeSelection(selection: NoteSelection): NoteSelection {
  return selection.kind === 'time' ? emptyNoteSelection : selection;
}

/** The span the selected notes occupy, for the neutral band: only for a note selection, never a time one. */
export function itemsBand(selection: NoteSelection): TimeRange | null {
  return selection.kind !== 'time' && selection.ids.length > 0 ? selection.range : null;
}

/**
 * The selection once the packet changed under it. Events that are gone drop out; if any did, the
 * range falls back to what the rest occupy (a range reaching over empty space that no event backs
 * is kept only while every selected event is still there).
 */
export function pruneSelection(selection: NoteSelection, packet: DataPacket): NoteSelection {
  const known = new Set(packet.items.map((item) => item.id));
  const present = selection.ids.filter((id) => known.has(id));
  if (present.length === selection.ids.length) {
    return selection;
  }
  return selectIds(packet, present);
}

/**
 * The selection after an edit moved or resized its events: the range follows them (shifted by how
 * far the events' first start moved) and still covers where they are now.
 */
export function followEdit(
  selection: NoteSelection,
  before: DataPacket,
  after: DataPacket
): NoteSelection {
  const was = itemsSpan(before, selection.ids);
  const now = itemsSpan(after, selection.ids);
  if (!selection.range || !was || !now) {
    return selection;
  }
  const shift = now.start - was.start;
  const shifted = { start: selection.range.start + shift, end: selection.range.end + shift };
  return { ids: selection.ids, range: unionRange(shifted, now), kind: selection.kind };
}
