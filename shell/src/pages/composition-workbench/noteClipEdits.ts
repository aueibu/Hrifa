import {
  MIN_NOTE_QUARTERS,
  type PianoRollNewNote,
  type PianoRollNote,
} from '../../components/PianoRoll';
import type { NoteEventValue } from './melodicization';
import type { DataItem, DataPacket } from './model';
import {
  addRational,
  compareRational,
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

/** What a hand-drawn note's loudness starts at (0 to 1, as the other producers write it). */
export const DEFAULT_NOTE_VELOCITY = 0.8;

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

/** The clip's length in quarter notes, from its frame; 0 when the frame names none. */
export function clipExtent(packet: DataPacket): number {
  const frame = packet.frame;
  if (frame?.musicalExtent) {
    return quarters(frame.musicalExtent);
  }
  return frame?.extent !== undefined && Number.isFinite(frame.extent) ? frame.extent : 0;
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
  velocity = DEFAULT_NOTE_VELOCITY
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
