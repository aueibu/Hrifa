import {
  DEFAULT_ENTRY_VELOCITY,
  MIN_NOTE_QUARTERS,
  type PianoRollNewNote,
  type PianoRollNote,
} from '../../components/PianoRoll';
import { readClipProperties } from './clipProperties';
import type { NoteEventValue } from './melodicization';
import type { DataItem, DataPacket } from './model';
import {
  addRational,
  compareRational,
  subtractRational,
  rationalFromNumber,
  rationalToNumber,
  type MusicalDuration,
  type Rational,
} from './musicalTime';
import { pitchLabel } from './routeTreatments';

/**
 * Pure edits to an `events | note` packet, for the note clip editor. Each takes the packet and
 * returns a new one (never mutating), or the same packet when the edit changes nothing. Items the
 * edit leaves alone are returned by reference, and an edited item keeps its id: that is what lets
 * `commitSnippetEdit` stamp provenance on only the notes that changed. A note is one event whose
 * `pitches` may be a chord, so moving or resizing acts on the whole event.
 */

/** The one operation name every hand edit of notes commits under, so a run of them is one session. */
export const NOTE_EDIT_OPERATION = 'edit-notes';

const MAX_MIDICENTS = 12700;

type NoteItem = DataItem<NoteEventValue>;

function isNoteItem(item: DataItem): item is NoteItem {
  const value = item.value as Partial<NoteEventValue> | null;
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray(value.pitches) &&
    value.pitches.every((pitch) => Number.isFinite(pitch)) &&
    value.onset !== undefined &&
    value.duration !== undefined
  );
}

const quarters = (value: { quarterNotes: Rational }) => rationalToNumber(value.quarterNotes);

/**
 * The clip's total length in quarter notes: its stored length, or the default for a clip made
 * before clip properties existed (see `readClipProperties`). Always positive.
 */
export function clipExtent(packet: DataPacket): number {
  return rationalToNumber(readClipProperties(packet).length);
}

/** The end of the furthest note, in quarter notes. */
export function furthestNoteEnd(packet: DataPacket): number {
  return packet.items.filter(isNoteItem).reduce((end, item) => {
    return Math.max(end, quarters(item.value.onset) + quarters(item.value.duration));
  }, 0);
}

/**
 * How far the roll shows: the clip's frame, or further when notes already reach past it (a clip
 * made elsewhere may). Never less than a quarter note.
 */
export function clipRollDuration(packet: DataPacket): number {
  return Math.max(clipExtent(packet), furthestNoteEnd(packet), 1);
}

/** Roll rectangles for a packet: one per pitch, so a chord is several rectangles of one event. */
export function packetRollNotes(packet: DataPacket): PianoRollNote[] {
  return packet.items.filter(isNoteItem).flatMap((item) =>
    item.value.pitches.map((midicents, pitchIndex) => ({
      id: `${item.id}:pitch:${pitchIndex}`,
      sourceId: item.id,
      start: quarters(item.value.onset),
      duration: quarters(item.value.duration),
      pitchMidicents: midicents,
      label: pitchLabel(midicents),
      velocity: item.value.velocity,
    }))
  );
}

function noteLabel(pitches: number[], onset: { quarterNotes: Rational }) {
  const names = pitches.map((midicents) => pitchLabel(midicents));
  const pitch = names.length > 1 ? `[${names.join(' ')}]` : (names[0] ?? '');
  return `${pitch} @ ${onset.quarterNotes.numerator}/${onset.quarterNotes.denominator}`;
}

function withItems(packet: DataPacket, items: DataItem[]): DataPacket {
  return { ...packet, items };
}

/** The same packet when no item changed (by reference), otherwise the packet with the new items. */
function replaceItems(packet: DataPacket, change: (item: NoteItem) => NoteItem | null) {
  let changed = false;
  const items = packet.items.flatMap((item) => {
    if (!isNoteItem(item)) {
      return [item];
    }
    const next = change(item);
    if (next === item) {
      return [item];
    }
    changed = true;
    return next === null ? [] : [next];
  });
  return changed ? withItems(packet, items) : packet;
}

/**
 * Adds a note: a new event with a fresh id and no provenance of its own (the edit contract stamps
 * it). The start is clamped to the clip's start (0) and the pitch to the keyboard. Like a regular
 * DAW, a note may start or run past the clip's end: the end marks the playback area, not a limit.
 */
export function addNote(
  packet: DataPacket,
  note: PianoRollNewNote,
  id: string,
  velocity = DEFAULT_ENTRY_VELOCITY
): DataPacket {
  const start = Math.max(0, note.start);
  if (!Number.isFinite(start) || !Number.isFinite(note.duration)) {
    return packet;
  }
  const duration = Math.max(MIN_NOTE_QUARTERS, note.duration);
  const midicents = Math.min(MAX_MIDICENTS, Math.max(0, Math.round(note.pitchMidicents)));
  const onset = { quarterNotes: rationalFromNumber(start) };
  const length = rationalFromNumber(duration);
  const item: NoteItem = {
    id,
    value: {
      onset,
      interOnset: { quarterNotes: length },
      duration: { quarterNotes: length },
      pitches: [midicents],
      velocity,
    },
    label: noteLabel([midicents], onset),
    provenance: [],
  };
  return withItems(packet, [...packet.items, item]);
}

/**
 * Adds several notes at once (the paint can), each with the id at the same index. A note that would
 * sit exactly on an existing one (same start and pitch) is skipped, so painting over a note twice
 * does not stack copies. The same packet when nothing was added.
 */
export function addNotes(
  packet: DataPacket,
  newNotes: readonly PianoRollNewNote[],
  ids: readonly string[],
  velocity = DEFAULT_ENTRY_VELOCITY
): DataPacket {
  const taken = new Set(
    packet.items
      .filter(isNoteItem)
      .flatMap((item) =>
        item.value.pitches.map(
          (pitch) => `${Math.round(quarters(item.value.onset) * 1e6)}:${pitch}`
        )
      )
  );
  let next = packet;
  newNotes.forEach((note, index) => {
    const key = `${Math.round(Math.max(0, note.start) * 1e6)}:${Math.round(note.pitchMidicents)}`;
    if (taken.has(key)) {
      return;
    }
    taken.add(key);
    next = addNote(next, note, ids[index], note.velocity ?? velocity);
  });
  return next;
}

/**
 * Splits an event at `at` (quarter notes), which must fall strictly inside it. Both halves keep the
 * pitches and velocity. The left half is the original item (same id, shortened), the right half is a
 * new item with `newId`. The same packet when `at` is not inside the event.
 */
export function splitNote(packet: DataPacket, id: string, at: number, newId: string): DataPacket {
  const index = packet.items.findIndex((item) => item.id === id);
  const item = packet.items[index];
  if (!item || !isNoteItem(item) || !Number.isFinite(at)) {
    return packet;
  }
  const start = quarters(item.value.onset);
  const end = start + quarters(item.value.duration);
  if (at <= start + 1e-9 || at >= end - 1e-9) {
    return packet;
  }
  const cut = rationalFromNumber(at);
  const leftLength: MusicalDuration = {
    quarterNotes: subtractRational(cut, item.value.onset.quarterNotes),
  };
  const rightLength: MusicalDuration = {
    quarterNotes: subtractRational(
      addRational(item.value.onset.quarterNotes, item.value.duration.quarterNotes),
      cut
    ),
  };
  const slotMatched =
    compareRational(item.value.interOnset.quarterNotes, item.value.duration.quarterNotes) === 0;
  const left: NoteItem = {
    ...item,
    value: {
      ...item.value,
      duration: leftLength,
      interOnset: slotMatched ? leftLength : item.value.interOnset,
    },
  };
  const rightOnset = { quarterNotes: cut };
  const right: NoteItem = {
    id: newId,
    value: {
      ...item.value,
      onset: rightOnset,
      duration: rightLength,
      interOnset: rightLength,
    },
    label: noteLabel(item.value.pitches, rightOnset),
    // A split keeps what the note inherited; the commit adds its own edit step to both halves.
    provenance: [...item.provenance],
  };
  const items = [...packet.items];
  items.splice(index, 1, left, right);
  return withItems(packet, items);
}

/**
 * Moves the events by `delta` (quarter notes in time, midicents in pitch), all by the same amount so
 * a group keeps its shape. The group stops at the clip's start and at the keyboard's edges; there is
 * no limit at the clip's end (notes may extend past it).
 */
export function moveNotes(
  packet: DataPacket,
  ids: readonly string[],
  delta: { start: number; pitchMidicents: number }
): DataPacket {
  const chosen = new Set(ids);
  const moving = packet.items.filter(
    (item): item is NoteItem => isNoteItem(item) && chosen.has(item.id)
  );
  if (!moving.length) {
    return packet;
  }
  let lowest = Number.NEGATIVE_INFINITY;
  let lowestPitch = Number.NEGATIVE_INFINITY;
  let highestPitch = Number.POSITIVE_INFINITY;
  moving.forEach((item) => {
    const start = quarters(item.value.onset);
    lowest = Math.max(lowest, -start);
    const pitches = item.value.pitches;
    lowestPitch = Math.max(lowestPitch, -Math.min(...pitches));
    highestPitch = Math.min(highestPitch, MAX_MIDICENTS - Math.max(...pitches));
  });
  const dStart = Math.max(delta.start, lowest);
  const dPitch = Math.min(Math.max(Math.round(delta.pitchMidicents), lowestPitch), highestPitch);
  if (dStart === 0 && dPitch === 0) {
    return packet;
  }
  const shift = dStart === 0 ? null : rationalFromNumber(dStart);
  return replaceItems(packet, (item) => {
    if (!chosen.has(item.id)) {
      return item;
    }
    const onset = shift
      ? { quarterNotes: addRational(item.value.onset.quarterNotes, shift) }
      : item.value.onset;
    const pitches = item.value.pitches.map((pitch) => pitch + dPitch);
    return {
      ...item,
      value: { ...item.value, onset, pitches },
      label: noteLabel(pitches, onset),
    };
  });
}

/**
 * Changes each event's duration by `delta` quarter notes, keeping at least `MIN_NOTE_QUARTERS`
 * (there is no limit at the clip's end). An event whose slot
 * (`interOnset`) matched its duration keeps matching.
 */
export function resizeNotes(packet: DataPacket, ids: readonly string[], delta: number): DataPacket {
  const chosen = new Set(ids);
  return replaceItems(packet, (item) => {
    if (!chosen.has(item.id)) {
      return item;
    }
    const current = quarters(item.value.duration);
    const next = Math.max(MIN_NOTE_QUARTERS, current + delta);
    const duration: MusicalDuration = { quarterNotes: rationalFromNumber(next) };
    if (compareRational(duration.quarterNotes, item.value.duration.quarterNotes) === 0) {
      return item;
    }
    const slotMatched =
      compareRational(item.value.interOnset.quarterNotes, item.value.duration.quarterNotes) === 0;
    return {
      ...item,
      value: {
        ...item.value,
        duration,
        interOnset: slotMatched ? duration : item.value.interOnset,
      },
    };
  });
}

/** Removes the events. */
export function deleteNotes(packet: DataPacket, ids: readonly string[]): DataPacket {
  const chosen = new Set(ids);
  return replaceItems(packet, (item) => (chosen.has(item.id) ? null : item));
}

/** Changes each event's velocity by `delta` (the range is 0 to 1). */
export function changeVelocity(
  packet: DataPacket,
  ids: readonly string[],
  delta: number
): DataPacket {
  const chosen = new Set(ids);
  return replaceItems(packet, (item) => {
    if (!chosen.has(item.id)) {
      return item;
    }
    const current = Number.isFinite(item.value.velocity)
      ? Math.min(1, Math.max(0, item.value.velocity))
      : 1;
    const velocity = Math.round(Math.min(1, Math.max(0, current + delta)) * 1000) / 1000;
    return velocity === item.value.velocity
      ? item
      : { ...item, value: { ...item.value, velocity } };
  });
}

/** A fresh item id for a hand-drawn note. */
export function newNoteItemId(snippetId: string): string {
  return `${snippetId}:note:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** The time span the events occupy, in quarter notes, or null when none of the ids is a note. */
export function itemsSpan(
  packet: DataPacket,
  ids: readonly string[]
): { start: number; end: number } | null {
  const chosen = new Set(ids);
  const spans = packet.items
    .filter((item): item is NoteItem => isNoteItem(item) && chosen.has(item.id))
    .map((item) => ({
      start: quarters(item.value.onset),
      end: quarters(item.value.onset) + quarters(item.value.duration),
    }));
  if (!spans.length) {
    return null;
  }
  return {
    start: Math.min(...spans.map((span) => span.start)),
    end: Math.max(...spans.map((span) => span.end)),
  };
}

/**
 * The ids of the notes that overlap the span, a note that only touches an edge included (its end is
 * the span's start, or its start is the span's end): the notes a time selection holds.
 */
export function notesOverlapping(
  packet: DataPacket,
  range: { start: number; end: number }
): string[] {
  return packet.items
    .filter(isNoteItem)
    .filter((item) => {
      const start = quarters(item.value.onset);
      const end = start + quarters(item.value.duration);
      return end >= range.start - 1e-9 && start <= range.end + 1e-9;
    })
    .map((item) => item.id);
}

/**
 * The shift a time-selection move actually applies: `delta` rounded to the grid (when one is given)
 * and held at the clip's start, so the moved span never begins before 0. Moving later is not limited.
 */
export function timeMoveDelta(
  range: { start: number; end: number },
  delta: number,
  grid?: number
): number {
  if (!Number.isFinite(delta)) {
    return 0;
  }
  const snapped = grid && grid > 0 ? Math.round(delta / grid) * grid : delta;
  return Math.max(snapped, -range.start);
}

/** How a time-selection drag treats what it is dragged over, and whether it moves or copies. */
export interface TimeMoveOptions {
  /** Copy the content (the source stays untouched) instead of moving it. */
  copy?: boolean;
  /** Keep the notes already at the destination (merge) instead of overwriting them (the default). */
  merge?: boolean;
}

export interface TimeMoveResult {
  packet: DataPacket;
  /** The ids of the pieces that were moved or copied, in packet order: what the band then holds. */
  movedIds: string[];
}

/** One piece of `item` over [start, end): `offset` shifts it, `slot` overrides its own-length slot. */
function notePart(
  item: NoteItem,
  start: Rational,
  end: Rational,
  id: string,
  slot?: MusicalDuration,
  offset?: Rational
): NoteItem {
  const length: MusicalDuration = { quarterNotes: subtractRational(end, start) };
  const onset = { quarterNotes: offset ? addRational(start, offset) : start };
  return {
    ...item,
    id,
    value: { ...item.value, onset, duration: length, interOnset: slot ?? length },
    label: noteLabel(item.value.pitches, onset),
    provenance: [...item.provenance],
  };
}

/**
 * Moves (or copies) everything inside the time span `range` (quarter notes) later or earlier by
 * `delta`, the time-selection drag. Time only: pitches never change. The span is cut at its left and
 * right edges: a note that crosses an edge is split there and only the part inside moves.
 *
 * Source (move): the part that STAYS keeps the item's id; the part that MOVES gets a fresh id from
 * `newId`, with the same pitches, velocity and inherited provenance. A note that crosses both edges
 * becomes three: the left stay part keeps the id, the moved middle and the right stay part get fresh
 * ids (in that order of `newId` calls). A note wholly inside simply moves and keeps its id. A copy
 * leaves the source untouched and every copied piece gets a fresh id.
 *
 * Destination: by default the moved block OVERWRITES what it lands on: every note the destination
 * span [start + shift, end + shift] covers is removed (a note straddling a destination edge is cut
 * there, the left part keeping the id, a right part after a left one taking a fresh id; a note that
 * only touches an edge is left alone, no slivers) and the moved pieces go in. With `merge` the
 * destination notes are kept (overlap allowed). When source and destination overlap, the moved
 * content replaces the overlap. `delta` is rounded to `grid` if given and clamped so the span stays
 * at or after the clip start; nothing moves (the same packet) for no shift, an empty span or no note
 * inside it (an empty block overwrites nothing).
 */
export function timeMoveResult(
  packet: DataPacket,
  range: { start: number; end: number },
  delta: number,
  newId: () => string,
  grid?: number,
  options: TimeMoveOptions = {}
): TimeMoveResult {
  const none: TimeMoveResult = { packet, movedIds: [] };
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end <= range.start) {
    return none;
  }
  const shiftBy = timeMoveDelta(range, delta, grid);
  if (shiftBy === 0) {
    return none;
  }
  const from = rationalFromNumber(range.start);
  const to = rationalFromNumber(range.end);
  const shift = rationalFromNumber(shiftBy);
  interface Entry {
    item: DataItem;
    moved: boolean;
  }
  let changed = false;
  const entries = packet.items.flatMap((item): Entry[] => {
    if (!isNoteItem(item)) {
      return [{ item, moved: false }];
    }
    const start = item.value.onset.quarterNotes;
    const end = addRational(start, item.value.duration.quarterNotes);
    const insideStart = compareRational(start, from) > 0 ? start : from;
    const insideEnd = compareRational(end, to) < 0 ? end : to;
    if (compareRational(insideStart, insideEnd) >= 0) {
      return [{ item, moved: false }];
    }
    changed = true;
    const slotMatched =
      compareRational(item.value.interOnset.quarterNotes, item.value.duration.quarterNotes) === 0;
    const leftStays = compareRational(start, insideStart) < 0;
    const rightStays = compareRational(insideEnd, end) < 0;
    const whole = !leftStays && !rightStays;
    if (options.copy) {
      const copy = notePart(
        item,
        insideStart,
        insideEnd,
        newId(),
        whole ? item.value.interOnset : undefined,
        shift
      );
      return [
        { item, moved: false },
        { item: copy, moved: true },
      ];
    }
    if (whole) {
      // Wholly inside: it moves as it is, keeping its id and its own slot.
      return [
        { item: notePart(item, start, end, item.id, item.value.interOnset, shift), moved: true },
      ];
    }
    if (!leftStays) {
      // Only the right edge cuts: the part that stays is the right one and keeps the id.
      return [
        { item: notePart(item, insideStart, insideEnd, newId(), undefined, shift), moved: true },
        { item: notePart(item, insideEnd, end, item.id), moved: false },
      ];
    }
    // The left part always stays and keeps the id (the knife's rule, including its slot).
    const left = notePart(
      item,
      start,
      insideStart,
      item.id,
      slotMatched ? undefined : item.value.interOnset
    );
    const middle = notePart(item, insideStart, insideEnd, newId(), undefined, shift);
    return rightStays
      ? [
          { item: left, moved: false },
          { item: middle, moved: true },
          { item: notePart(item, insideEnd, end, newId()), moved: false },
        ]
      : [
          { item: left, moved: false },
          { item: middle, moved: true },
        ];
  });
  if (!changed) {
    return none;
  }
  let result = entries;
  if (!options.merge) {
    // Overwrite: clear the destination of everything that is not one of the moved pieces.
    const destFrom = addRational(from, shift);
    const destTo = addRational(to, shift);
    result = entries.flatMap((entry): Entry[] => {
      if (entry.moved || !isNoteItem(entry.item)) {
        return [entry];
      }
      const item = entry.item;
      const start = item.value.onset.quarterNotes;
      const end = addRational(start, item.value.duration.quarterNotes);
      const coverStart = compareRational(start, destFrom) > 0 ? start : destFrom;
      const coverEnd = compareRational(end, destTo) < 0 ? end : destTo;
      if (compareRational(coverStart, coverEnd) >= 0) {
        return [entry];
      }
      const leftRemains = compareRational(start, destFrom) < 0;
      const rightRemains = compareRational(destTo, end) < 0;
      const slotMatched =
        compareRational(item.value.interOnset.quarterNotes, item.value.duration.quarterNotes) === 0;
      if (leftRemains) {
        const left: Entry = {
          item: notePart(
            item,
            start,
            destFrom,
            item.id,
            slotMatched ? undefined : item.value.interOnset
          ),
          moved: false,
        };
        return rightRemains
          ? [left, { item: notePart(item, destTo, end, newId()), moved: false }]
          : [left];
      }
      return rightRemains ? [{ item: notePart(item, destTo, end, item.id), moved: false }] : [];
    });
  }
  return {
    packet: withItems(
      packet,
      result.map((entry) => entry.item)
    ),
    movedIds: result.filter((entry) => entry.moved).map((entry) => entry.item.id),
  };
}

/** `timeMoveResult`'s packet alone. */
export function moveTimeRange(
  packet: DataPacket,
  range: { start: number; end: number },
  delta: number,
  newId: () => string,
  grid?: number,
  options: TimeMoveOptions = {}
): DataPacket {
  return timeMoveResult(packet, range, delta, newId, grid, options).packet;
}

/**
 * Copies these events, shifted by `delta` (time clamped at the clip start and pitch at the keyboard's
 * ends, once for the group like `moveNotes`): the originals stay untouched, each copy is a fresh item
 * (id from `newIds`, in order) with the same pitches, velocity and inherited provenance. The same
 * packet when nothing is copied or the shift is zero.
 */
export function copyNotes(
  packet: DataPacket,
  ids: readonly string[],
  delta: { start: number; pitchMidicents: number },
  newIds: () => string
): { packet: DataPacket; copyIds: string[] } {
  const chosen = new Set(ids);
  const copying = packet.items.filter(
    (item): item is NoteItem => isNoteItem(item) && chosen.has(item.id)
  );
  if (!copying.length) {
    return { packet, copyIds: [] };
  }
  let lowest = Number.NEGATIVE_INFINITY;
  let lowestPitch = Number.NEGATIVE_INFINITY;
  let highestPitch = Number.POSITIVE_INFINITY;
  copying.forEach((item) => {
    lowest = Math.max(lowest, -quarters(item.value.onset));
    lowestPitch = Math.max(lowestPitch, -Math.min(...item.value.pitches));
    highestPitch = Math.min(highestPitch, MAX_MIDICENTS - Math.max(...item.value.pitches));
  });
  const dStart = Math.max(delta.start, lowest);
  const dPitch = Math.min(Math.max(Math.round(delta.pitchMidicents), lowestPitch), highestPitch);
  if (dStart === 0 && dPitch === 0) {
    return { packet, copyIds: [] };
  }
  const shift = rationalFromNumber(dStart);
  const copyIds: string[] = [];
  const copies = copying.map((item): NoteItem => {
    const id = newIds();
    copyIds.push(id);
    const onset = { quarterNotes: addRational(item.value.onset.quarterNotes, shift) };
    const pitches = item.value.pitches.map((pitch) => pitch + dPitch);
    return {
      ...item,
      id,
      value: { ...item.value, onset, pitches },
      label: noteLabel(pitches, onset),
      provenance: [...item.provenance],
    };
  });
  return { packet: withItems(packet, [...packet.items, ...copies]), copyIds };
}
