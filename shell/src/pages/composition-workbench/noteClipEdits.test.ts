import { describe, expect, it } from 'vitest';
import { DEFAULT_ENTRY_VELOCITY } from '../../components/PianoRoll';
import type { NoteEventValue } from './melodicization';
import { packet, type DataItem, type DataPacket } from './model';
import { musicalDuration, musicalPosition, rationalToNumber } from './musicalTime';
import {
  addNote,
  addNotes,
  changeVelocity,
  setVelocities,
  clipExtent,
  clipRollDuration,
  deleteNotes,
  itemsSpan,
  moveNotes,
  moveTimeRange,
  timeMoveResult,
  copyNotes,
  notesOverlapping,
  packetRollNotes,
  timeMoveDelta,
  resizeNotes,
  splitNote,
} from './noteClipEdits';
import { commitSnippetEdit, type Snippet } from './snippet';

function item(
  id: string,
  start: number,
  length: number,
  pitches: number[],
  velocity = 1
): DataItem<NoteEventValue> {
  return {
    id,
    value: {
      onset: start === 1 / 3 ? musicalPosition(1, 3) : musicalPosition(start),
      interOnset: musicalDuration(length),
      duration: musicalDuration(length),
      pitches,
      velocity,
    },
    label: id,
    provenance: [],
  };
}

function clip(items: DataItem<NoteEventValue>[], extent = 8): DataPacket {
  return {
    ...packet('events', 'note', items),
    frame: {
      topology: 'linear',
      unit: 'quarterNote',
      extent,
      origin: 0,
      musicalExtent: musicalDuration(extent),
      musicalOrigin: musicalPosition(0),
    },
  };
}

const base = () =>
  clip([item('a', 0, 1, [6000]), item('b', 2, 1, [6400]), item('c', 4, 2, [6000, 6400])]);
const onsets = (p: DataPacket) =>
  p.items.map((entry) => rationalToNumber((entry.value as NoteEventValue).onset.quarterNotes));

describe('note clip edits', () => {
  it('adds a note with the given id, keeps its length past the clip end, and keeps every other item by reference', () => {
    const before = base();
    const after = addNote(before, { start: 7, duration: 5, pitchMidicents: 6050.4 }, 'fresh');
    expect(after.items.slice(0, 3)).toEqual(before.items);
    after.items.slice(0, 3).forEach((entry, index) => expect(entry).toBe(before.items[index]));
    const added = after.items[3];
    expect(added.id).toBe('fresh');
    expect(added.provenance).toEqual([]);
    expect(added.value).toMatchObject({ pitches: [6050], velocity: 0.8 });
    // Notes may run past the 8-quarter clip's end.
    expect(rationalToNumber((added.value as NoteEventValue).duration.quarterNotes)).toBe(5);
    expect(before.items).toHaveLength(3);
  });

  it('accepts a note past the end of the clip, but not before its start', () => {
    const before = base();
    const past = addNote(before, { start: 9, duration: 1, pitchMidicents: 6000 }, 'x');
    expect(onsets(past)).toEqual([0, 2, 4, 9]);
    const early = addNote(before, { start: -2, duration: 1, pitchMidicents: 6000 }, 'y');
    expect(onsets(early)).toEqual([0, 2, 4, 0]);
  });

  it('moves by the delta, keeps ids, leaves other items by reference and keeps exact time', () => {
    const before = clip([item('a', 0, 1, [6000]), item('b', 1 / 3, 1, [6400])]);
    const after = moveNotes(before, ['b'], { start: 0.25, pitchMidicents: -200 });
    expect(after.items.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(after.items[0]).toBe(before.items[0]);
    expect((after.items[1].value as NoteEventValue).pitches).toEqual([6200]);
    expect((after.items[1].value as NoteEventValue).onset.quarterNotes).toEqual({
      numerator: 7,
      denominator: 12,
    });
  });

  it('moves a group by one clamped delta so it keeps its shape, and a chord as a whole', () => {
    const before = base();
    const left = moveNotes(before, ['a', 'b'], { start: -3, pitchMidicents: 0 });
    expect(onsets(left)).toEqual([0, 2, 4]);
    const some = moveNotes(before, ['b', 'c'], { start: -3, pitchMidicents: 0 });
    // b may go back by 2 (to 0), so c goes back by the same 2.
    expect(onsets(some)).toEqual([0, 0, 2]);
    const right = moveNotes(before, ['c'], { start: 5, pitchMidicents: 300 });
    // No limit at the clip's end (8): c moves the full 5. Pitches move together.
    expect(onsets(right)).toEqual([0, 2, 9]);
    expect((right.items[2].value as NoteEventValue).pitches).toEqual([6300, 6700]);
    expect(
      moveNotes(before, ['a'], { start: 0, pitchMidicents: 20000 }).items[0].value
    ).toMatchObject({
      pitches: [12700],
    });
    expect(moveNotes(before, ['a'], { start: -1, pitchMidicents: 0 })).toBe(before);
  });

  it('lets a note past the clip end move and grow freely', () => {
    const before = clip([item('long', 6, 4, [6000])], 8);
    expect(onsets(moveNotes(before, ['long'], { start: 1, pitchMidicents: 0 }))).toEqual([7]);
    const longer = resizeNotes(before, ['long'], 1);
    expect(rationalToNumber((longer.items[0].value as NoteEventValue).duration.quarterNotes)).toBe(
      5
    );
    const shorter = resizeNotes(before, ['long'], -1);
    expect(rationalToNumber((shorter.items[0].value as NoteEventValue).duration.quarterNotes)).toBe(
      3
    );
    // No stored clip properties: the note ends at 10, so the length reads as the next bar line (12).
    expect(clipRollDuration(before)).toBe(12);
  });

  it('resizes with a floor, no ceiling at the clip end, and keeps a matching slot matching', () => {
    const before = base();
    const grown = resizeNotes(before, ['a'], 0.5);
    const value = grown.items[0].value as NoteEventValue;
    expect(rationalToNumber(value.duration.quarterNotes)).toBe(1.5);
    expect(value.interOnset).toEqual(value.duration);
    const floored = resizeNotes(before, ['a'], -5);
    expect(rationalToNumber((floored.items[0].value as NoteEventValue).duration.quarterNotes)).toBe(
      1 / 32
    );
    const capped = resizeNotes(before, ['c'], 10);
    expect(rationalToNumber((capped.items[2].value as NoteEventValue).duration.quarterNotes)).toBe(
      12
    );
    expect(grown.items[1]).toBe(before.items[1]);
  });

  it('deletes the chosen events only', () => {
    const before = base();
    const after = deleteNotes(before, ['b']);
    expect(after.items.map((entry) => entry.id)).toEqual(['a', 'c']);
    expect(deleteNotes(before, ['nope'])).toBe(before);
  });

  it('changes velocity within 0 to 1', () => {
    const before = base();
    expect((changeVelocity(before, ['a'], -2).items[0].value as NoteEventValue).velocity).toBe(0);
    expect(changeVelocity(before, ['a'], 0.5)).toBe(before);
    expect((changeVelocity(before, ['a'], -0.25).items[0].value as NoteEventValue).velocity).toBe(
      0.75
    );
  });

  it('sets velocities to absolute values: clamped, rounded, same packet when nothing changes', () => {
    const before = base();
    const velocityOf = (packet: DataPacket, index: number) =>
      (packet.items[index].value as NoteEventValue).velocity;
    const after = setVelocities(before, { a: 0.3333333, b: 5, c: -1, nope: 0.5 });
    expect([0, 1, 2].map((index) => velocityOf(after, index))).toEqual([0.333, 1, 0]);
    expect(after.items.map((entry) => entry.id)).toEqual(before.items.map((entry) => entry.id));
    const velocities = Object.fromEntries(
      before.items.map((entry) => [entry.id, (entry.value as NoteEventValue).velocity])
    );
    expect(setVelocities(before, velocities)).toBe(before);
    expect(setVelocities(before, {})).toBe(before);
  });

  it('only added and modified notes get the edit step when committed (K2 provenance)', () => {
    const snippet: Snippet = {
      schemaVersion: 1,
      id: 'clip-1',
      name: 'Clip',
      createdAt: '2026-11-11T00:00:00Z',
      packet: base(),
    };
    const edited = deleteNotes(
      addNote(
        moveNotes(snippet.packet, ['a'], { start: 1, pitchMidicents: 0 }),
        {
          start: 6,
          duration: 1,
          pitchMidicents: 6000,
        },
        'fresh'
      ),
      ['b']
    );
    const result = commitSnippetEdit(snippet, edited, 'edit-notes', { handEdit: true });
    if (!result.ok) {
      throw new Error(result.error);
    }
    const steps = (id: string) =>
      result.snippet.packet.items
        .find((entry) => entry.id === id)!
        .provenance.filter((step) => step.transformation === 'edit-notes')
        .map((step) => step.parameters?.change);
    expect(steps('a')).toEqual(['modified']);
    expect(steps('fresh')).toEqual(['added']);
    expect(steps('c')).toEqual([]);
    expect(result.snippet.packet.items.map((entry) => entry.id)).toEqual(['a', 'c', 'fresh']);
  });

  it('describes the clip: extent, one roll rectangle per pitch, and the time events occupy', () => {
    const before = base();
    expect(clipExtent(before)).toBe(8);
    expect(clipRollDuration(clip([], 4))).toBe(4);
    const notes = packetRollNotes(before);
    expect(notes).toHaveLength(4);
    expect(notes.filter((note) => note.sourceId === 'c').map((note) => note.id)).toEqual([
      'c:pitch:0',
      'c:pitch:1',
    ]);
    expect(itemsSpan(before, ['a', 'c'])).toEqual({ start: 0, end: 6 });
    expect(itemsSpan(before, ['nope'])).toBeNull();
  });
});

describe('note entry tools', () => {
  it('addNote takes the velocity the entry gesture chose', () => {
    const after = addNote(base(), { start: 1, duration: 1, pitchMidicents: 7200 }, 'v', 0.4);
    expect(after.items[3].value).toMatchObject({ velocity: 0.4 });
  });

  it('paints several notes with their own ids, skipping one exactly on an existing note', () => {
    const before = base();
    const after = addNotes(
      before,
      [
        { start: 0, duration: 1, pitchMidicents: 6000 },
        { start: 1, duration: 1, pitchMidicents: 6000 },
        { start: 2, duration: 1, pitchMidicents: 6000 },
      ],
      ['p0', 'p1', 'p2']
    );
    // 'a' already sits at 0 on C4, so only p1 and p2 are new.
    expect(after.items.map((entry) => entry.id)).toEqual(['a', 'b', 'c', 'p1', 'p2']);
    expect(after.items.slice(0, 3).every((entry, index) => entry === before.items[index])).toBe(
      true
    );
    expect(addNotes(before, [{ start: 0, duration: 1, pitchMidicents: 6000 }], ['x'])).toBe(before);
  });

  it('painted notes keep their own velocity, falling back to the default only when absent', () => {
    const after = addNotes(
      base(),
      [
        { start: 3, duration: 1, pitchMidicents: 7200, velocity: 0.38 },
        { start: 4, duration: 1, pitchMidicents: 7200 },
      ],
      ['p0', 'p1']
    );
    expect(after.items.find((entry) => entry.id === 'p0')?.value).toMatchObject({ velocity: 0.38 });
    expect(after.items.find((entry) => entry.id === 'p1')?.value).toMatchObject({
      velocity: DEFAULT_ENTRY_VELOCITY,
    });
  });

  it('splits a note: the left half keeps the id, the right half is a fresh item, pitch and velocity kept', () => {
    const before = clip([item('a', 1, 2, [6000, 6400], 0.6), item('z', 5, 1, [6700])]);
    const after = splitNote(before, 'a', 2, 'right');
    expect(after.items.map((entry) => entry.id)).toEqual(['a', 'right', 'z']);
    const [left, right] = after.items.map((entry) => entry.value as NoteEventValue);
    expect(rationalToNumber(left.onset.quarterNotes)).toBe(1);
    expect(rationalToNumber(left.duration.quarterNotes)).toBe(1);
    expect(rationalToNumber(left.interOnset.quarterNotes)).toBe(1);
    expect(rationalToNumber(right.onset.quarterNotes)).toBe(2);
    expect(rationalToNumber(right.duration.quarterNotes)).toBe(1);
    expect(left.pitches).toEqual([6000, 6400]);
    expect(right.pitches).toEqual([6000, 6400]);
    expect(left.velocity).toBe(0.6);
    expect(right.velocity).toBe(0.6);
    expect(after.items[2]).toBe(before.items[1]);
    expect(after.items[1].provenance).toEqual([]);
  });

  it('a split keeps the inherited provenance on both halves (K2)', () => {
    const inherited = [
      { sourceModuleInstance: 'm1', sourceItemIds: ['x'], transformation: 'melodicize' },
    ];
    const source = { ...item('a', 0, 2, [6000]), provenance: inherited };
    const after = splitNote(clip([source]), 'a', 1, 'right');
    expect(after.items[0].provenance).toEqual(inherited);
    expect(after.items[1].provenance).toEqual(inherited);
    expect(after.items[1].provenance).not.toBe(source.provenance);
  });

  it('splits at a triplet line exactly, and refuses a cut at or outside the ends', () => {
    const before = clip([item('a', 0, 1, [6000])]);
    const after = splitNote(before, 'a', 1 / 3, 'r');
    const right = after.items[1].value as NoteEventValue;
    expect(right.onset.quarterNotes).toEqual({ numerator: 1, denominator: 3 });
    expect(right.duration.quarterNotes).toEqual({ numerator: 2, denominator: 3 });
    expect(splitNote(before, 'a', 0, 'r')).toBe(before);
    expect(splitNote(before, 'a', 1, 'r')).toBe(before);
    expect(splitNote(before, 'a', 2, 'r')).toBe(before);
    expect(splitNote(before, 'missing', 0.5, 'r')).toBe(before);
  });
});

describe('moveTimeRange: the time-selection drag', () => {
  let counter = 0;
  const fresh = () => `new${(counter += 1)}`;
  const span = (p: DataPacket, id: string) => {
    const value = p.items.find((entry) => entry.id === id)!.value as NoteEventValue;
    return [
      rationalToNumber(value.onset.quarterNotes),
      rationalToNumber(value.onset.quarterNotes) + rationalToNumber(value.duration.quarterNotes),
    ];
  };
  const all = (p: DataPacket) =>
    p.items.map((entry) => ({ id: entry.id, span: span(p, entry.id) }));

  it('moves a note wholly inside the span and keeps its id, pitch and velocity', () => {
    const before = clip([item('a', 1, 1, [6000], 0.5), item('z', 6, 1, [6400])]);
    const after = moveTimeRange(before, { start: 0, end: 3 }, 2, fresh);
    expect(all(after)).toEqual([
      { id: 'a', span: [3, 4] },
      { id: 'z', span: [6, 7] },
    ]);
    expect(after.items[0].value).toMatchObject({ pitches: [6000], velocity: 0.5 });
    // Untouched notes are returned by reference.
    expect(after.items[1]).toBe(before.items[1]);
    expect(before.items[0].value).toMatchObject({ onset: musicalPosition(1) });
  });

  it('splits a whole note at the span edge: only the last beat moves, as a quarter note', () => {
    const before = clip([item('w', 0, 4, [6000], 0.7)]);
    const after = moveTimeRange(before, { start: 3, end: 4 }, 4, fresh);
    const [stay, moved] = after.items;
    // The part that stays keeps the id (the first three beats); the moved part is new.
    expect(stay.id).toBe('w');
    expect(span(after, 'w')).toEqual([0, 3]);
    expect(moved.id).not.toBe('w');
    expect(span(after, moved.id)).toEqual([7, 8]);
    expect(moved.value).toMatchObject({ pitches: [6000], velocity: 0.7 });
    expect((moved.value as NoteEventValue).duration).toEqual(musicalDuration(1));
    expect(after.items).toHaveLength(2);
  });

  it('cuts the left edge too: the left part keeps the id and the inside part moves with a fresh id', () => {
    const before = clip([item('w', 0, 4, [6000])]);
    const after = moveTimeRange(before, { start: 1, end: 5 }, 1, fresh);
    expect(after.items.map((entry) => entry.id)).toEqual(['w', after.items[1].id]);
    expect(span(after, 'w')).toEqual([0, 1]);
    expect(span(after, after.items[1].id)).toEqual([2, 5]);
  });

  it('a note crossing both edges becomes three: left keeps the id, middle moves, right stays', () => {
    const before = clip([item('w', 0, 8, [6000, 6400], 0.9)]);
    const after = moveTimeRange(before, { start: 2, end: 4 }, 8, fresh);
    expect(after.items).toHaveLength(3);
    const [left, middle, right] = after.items;
    expect(left.id).toBe('w');
    expect(new Set([left.id, middle.id, right.id]).size).toBe(3);
    expect(span(after, left.id)).toEqual([0, 2]);
    expect(span(after, middle.id)).toEqual([10, 12]);
    expect(span(after, right.id)).toEqual([4, 8]);
    // Chords and velocity are kept on every part.
    after.items.forEach((entry) =>
      expect(entry.value).toMatchObject({ pitches: [6000, 6400], velocity: 0.9 })
    );
  });

  it('inherits provenance like the knife, on a copy', () => {
    const source = item('w', 0, 4, [6000]);
    source.provenance = [{ transformation: 'earlier' } as never];
    const after = moveTimeRange(clip([source]), { start: 2, end: 4 }, 2, fresh);
    expect(after.items[1].provenance).toEqual(source.provenance);
    expect(after.items[1].provenance).not.toBe(source.provenance);
  });

  it('merge: moves several notes and chords together, leaves the source empty and keeps destination notes', () => {
    const before = clip([
      item('a', 0, 1, [6000]),
      item('b', 1, 1, [6400, 6700]),
      item('c', 1, 1, [7200]),
      item('d', 4, 1, [6000]),
    ]);
    const after = moveTimeRange(before, { start: 0, end: 2 }, 4, fresh, undefined, {
      merge: true,
    });
    expect(all(after)).toEqual([
      { id: 'a', span: [4, 5] },
      { id: 'b', span: [5, 6] },
      { id: 'c', span: [5, 6] },
      // The note already there stays (overlap allowed), nothing is deleted.
      { id: 'd', span: [4, 5] },
    ]);
    // The source span is empty; a note whose start is the span's end only touches it, and counts.
    expect(notesOverlapping(after, { start: 0, end: 3.5 })).toEqual([]);
    expect(notesOverlapping(after, { start: 0, end: 4 }).sort()).toEqual(['a', 'd']);
    // A note ending at the span's start touches it too.
    expect(notesOverlapping(after, { start: 6, end: 8 }).sort()).toEqual(['b', 'c']);
    expect(notesOverlapping(after, { start: 6.5, end: 8 })).toEqual([]);
  });

  it('a note that only touches the span stays put: no split, no sliver, no move', () => {
    const before = clip([item('l', 0, 2, [6000]), item('r', 4, 2, [6400])]);
    expect(moveTimeRange(before, { start: 2, end: 4 }, 10, fresh)).toBe(before);
  });

  it('clamps at the clip start and never moves the span before 0', () => {
    expect(timeMoveDelta({ start: 2, end: 4 }, -5)).toBe(-2);
    const after = moveTimeRange(clip([item('a', 3, 1, [6000])]), { start: 2, end: 4 }, -5, fresh);
    expect(span(after, 'a')).toEqual([1, 2]);
    expect(timeMoveDelta({ start: 2, end: 4 }, 100)).toBe(100);
  });

  it('rounds the shift to the grid', () => {
    expect(timeMoveDelta({ start: 0, end: 1 }, 0.6, 0.5)).toBe(0.5);
    expect(timeMoveDelta({ start: 0, end: 1 }, 0.76, 0.5)).toBe(1);
    const after = moveTimeRange(
      clip([item('a', 0, 1, [6000])]),
      { start: 0, end: 1 },
      1.3,
      fresh,
      0.5
    );
    expect(span(after, 'a')).toEqual([1.5, 2.5]);
    expect(timeMoveDelta({ start: 0, end: 1 }, Number.NaN)).toBe(0);
  });

  it('returns the same packet for no shift, an empty span, a span with no notes or touching only (nothing at the destination)', () => {
    const before = clip([item('a', 2, 1, [6000])]);
    expect(moveTimeRange(before, { start: 0, end: 4 }, 0, fresh)).toBe(before);
    expect(moveTimeRange(before, { start: 3, end: 3 }, 2, fresh)).toBe(before);
    expect(moveTimeRange(before, { start: 5, end: 7 }, 2, fresh)).toBe(before);
    // A note that merely ends where the span starts, or starts where it ends, is not inside it.
    expect(moveTimeRange(before, { start: 3, end: 5 }, 2, fresh)).toBe(before);
    // Source [0,2] holds nothing (the note only touches), but its destination [2,4] overwrites the note.
    expect(moveTimeRange(before, { start: 0, end: 2 }, 2, fresh)).not.toBe(before);
    expect(moveTimeRange(before, { start: 0, end: 2 }, 2, fresh, undefined, { merge: true })).toBe(
      before
    );
    expect(moveTimeRange(before, { start: 0, end: 1 }, -3, fresh)).toBe(before);
  });

  it('is exact for thirds: a triplet note moves without float drift', () => {
    const triplet = item('t', 1 / 3, 1, [6000]);
    const after = moveTimeRange(clip([triplet]), { start: 0, end: 4 }, 1, fresh);
    expect((after.items[0].value as NoteEventValue).onset.quarterNotes).toEqual({
      numerator: 4,
      denominator: 3,
    });
  });

  it('keeps the slot of a split note like the knife: left keeps a custom one, pieces take their length', () => {
    const custom = item('a', 0, 4, [6000]);
    (custom.value as NoteEventValue).interOnset = musicalDuration(6);
    const after = moveTimeRange(clip([custom]), { start: 2, end: 4 }, 1, fresh);
    expect((after.items[0].value as NoteEventValue).interOnset).toEqual(musicalDuration(6));
    expect((after.items[1].value as NoteEventValue).interOnset).toEqual(musicalDuration(2));
  });
});

describe('time-selection move and copy: overwrite (default) and merge', () => {
  let counter = 0;
  const fresh = () => `n${(counter += 1)}`;
  const spans = (p: DataPacket) =>
    p.items.map((entry) => {
      const value = entry.value as NoteEventValue;
      const start = rationalToNumber(value.onset.quarterNotes);
      return { id: entry.id, span: [start, start + rationalToNumber(value.duration.quarterNotes)] };
    });
  const at = (p: DataPacket, id: string) => spans(p).find((entry) => entry.id === id)?.span;

  it('overwrite: a note straddling the destination edge is cut there and the moved block lands', () => {
    // a (0-2) moves to 2-4; b (3-6) starts inside the destination: its part outside (4-6) stays, keeping the id.
    const before = clip([item('a', 0, 2, [6000]), item('b', 3, 3, [6400])]);
    const result = timeMoveResult(before, { start: 0, end: 2 }, 2, fresh);
    expect(spans(result.packet)).toEqual([
      { id: 'a', span: [2, 4] },
      { id: 'b', span: [4, 6] },
    ]);
    expect(result.movedIds).toEqual(['a']);
  });

  it('overwrite: a note wholly inside the destination is deleted; one touching its edge is untouched', () => {
    const before = clip([
      item('a', 0, 1, [6000]),
      item('in', 2, 1, [6400]),
      item('before', 1, 1, [6400]),
      item('after', 3, 1, [6700]),
    ]);
    const result = timeMoveResult(before, { start: 0, end: 1 }, 2, fresh);
    expect(spans(result.packet).map((entry) => entry.id)).toEqual(['a', 'before', 'after']);
    // Touching the destination 2-3 exactly (1-2 ends at 2, 3-4 starts at 3): same items, no sliver.
    expect(result.packet.items[1]).toBe(before.items[2]);
    expect(result.packet.items[2]).toBe(before.items[3]);
    expect(at(result.packet, 'a')).toEqual([2, 3]);
  });

  it('overwrite: a note crossing the whole destination is cut three ways: left keeps the id, right is new', () => {
    const before = clip([item('a', 0, 1, [6000]), item('g', 3, 4, [6400], 0.4)]);
    const result = timeMoveResult(before, { start: 0, end: 1 }, 4, fresh);
    const [moved, left, right] = result.packet.items;
    expect(moved.id).toBe('a');
    expect(at(result.packet, 'a')).toEqual([4, 5]);
    expect(left.id).toBe('g');
    expect(at(result.packet, 'g')).toEqual([3, 4]);
    expect(right.id).not.toBe('g');
    expect(spans(result.packet)[2].span).toEqual([5, 7]);
    expect(right.value).toMatchObject({ pitches: [6400], velocity: 0.4 });
  });

  it('overwrite: source and destination overlapping, the moved content replaces the overlap', () => {
    // w (0-4), span 1-3 moved by 1: stay parts 0-1 and 3-4; the destination 2-4 clears the right stay part.
    const before = clip([item('w', 0, 4, [6000])]);
    const result = timeMoveResult(before, { start: 1, end: 3 }, 1, fresh);
    expect(spans(result.packet).map((entry) => entry.span)).toEqual([
      [0, 1],
      [2, 4],
    ]);
    expect(result.packet.items[0].id).toBe('w');
    expect(result.movedIds).toHaveLength(1);
    expect(result.movedIds[0]).toBe(result.packet.items[1].id);
  });

  it('merge: the same move keeps the destination notes', () => {
    const before = clip([item('w', 0, 4, [6000])]);
    const result = timeMoveResult(before, { start: 1, end: 3 }, 1, fresh, undefined, {
      merge: true,
    });
    expect(spans(result.packet).map((entry) => entry.span)).toEqual([
      [0, 1],
      [2, 4],
      [3, 4],
    ]);
    expect(result.movedIds).toEqual([result.packet.items[1].id]);
  });

  it('chords keep all their pitches through a move and a copy', () => {
    const before = clip([item('c', 0, 1, [6000, 6400, 6700])]);
    const moved = timeMoveResult(before, { start: 0, end: 1 }, 3, fresh);
    expect(moved.packet.items[0].value).toMatchObject({ pitches: [6000, 6400, 6700] });
    const copied = timeMoveResult(before, { start: 0, end: 1 }, 3, fresh, undefined, {
      copy: true,
    });
    expect(copied.packet.items).toHaveLength(2);
    expect(copied.packet.items[0]).toBe(before.items[0]);
    expect(copied.packet.items[1].value).toMatchObject({ pitches: [6000, 6400, 6700] });
    expect(at(copied.packet, copied.movedIds[0])).toEqual([3, 4]);
  });

  it('copy (overwrite): the source stays untouched, copies get fresh ids, the destination is overwritten', () => {
    const source = item('w', 0, 4, [6000], 0.6);
    source.provenance = [{ transformation: 'earlier' } as never];
    const before = clip([source, item('z', 6, 1, [6400])]);
    // Copy the last two beats (2-4) by 4: they land on 6-8 and overwrite z.
    const result = timeMoveResult(before, { start: 2, end: 4 }, 4, fresh, undefined, {
      copy: true,
    });
    expect(result.packet.items[0]).toBe(before.items[0]);
    expect(result.packet.items.map((entry) => entry.id)).not.toContain('z');
    const [copyId] = result.movedIds;
    expect(copyId).not.toBe('w');
    expect(at(result.packet, copyId)).toEqual([6, 8]);
    const copy = result.packet.items.find((entry) => entry.id === copyId)!;
    expect(copy.value).toMatchObject({ pitches: [6000], velocity: 0.6 });
    expect(copy.provenance).toEqual(source.provenance);
    expect(copy.provenance).not.toBe(source.provenance);
  });

  it('copy + merge: the source and the destination notes both stay', () => {
    const before = clip([item('w', 0, 2, [6000]), item('z', 4, 1, [6400])]);
    const result = timeMoveResult(before, { start: 0, end: 2 }, 4, fresh, undefined, {
      copy: true,
      merge: true,
    });
    expect(result.packet.items[0]).toBe(before.items[0]);
    expect(result.packet.items[2]).toBe(before.items[1]);
    expect(result.packet.items).toHaveLength(3);
    expect(at(result.packet, result.movedIds[0])).toEqual([4, 6]);
    expect(result.movedIds).toHaveLength(1);
  });

  it('copy onto a span overlapping the source overwrites the source parts there', () => {
    const before = clip([item('w', 0, 4, [6000])]);
    const result = timeMoveResult(before, { start: 0, end: 2 }, 1, fresh, undefined, {
      copy: true,
    });
    // The copy of 0-2 lands on 1-3: w is cut to 0-1 (id kept) and 3-4 (new id).
    expect(spans(result.packet).map((entry) => entry.span)).toEqual([
      [0, 1],
      [3, 4],
      [1, 3],
    ]);
    expect(result.packet.items[0].id).toBe('w');
  });

  it('an empty source span still overwrites the destination (move and copy); merge and an empty destination stay no-ops', () => {
    const before = clip([item('z', 6, 1, [6400])]);
    const moved = timeMoveResult(before, { start: 0, end: 2 }, 6, fresh);
    expect(moved.packet.items).toEqual([]);
    expect(moved.movedIds).toEqual([]);
    const copied = timeMoveResult(before, { start: 0, end: 2 }, 6, fresh, undefined, {
      copy: true,
    });
    expect(copied.packet.items).toEqual([]);
    // A straddled destination edge is cut: the left part keeps the id and is shortened.
    const cut = timeMoveResult(before, { start: 0, end: 1 }, 6.5, fresh);
    expect(cut.packet.items.map((entry) => entry.id)).toEqual(['z']);
    expect(
      rationalToNumber((cut.packet.items[0].value as NoteEventValue).duration.quarterNotes)
    ).toBe(0.5);
    expect(
      timeMoveResult(before, { start: 0, end: 2 }, 6, fresh, undefined, { merge: true }).packet
    ).toBe(before);
    // Nothing at the destination either: still the same packet.
    expect(timeMoveResult(before, { start: 0, end: 2 }, 2, fresh).packet).toBe(before);
  });
});

describe('copyNotes: the Ctrl-drag of notes', () => {
  let counter = 0;
  const fresh = () => `c${(counter += 1)}`;

  it('copies the notes shifted, leaves the originals alone and keeps velocity, pitches and provenance', () => {
    const source = item('a', 1, 1, [6000, 6400], 0.5);
    source.provenance = [{ transformation: 'earlier' } as never];
    const before = clip([source, item('b', 3, 1, [6700])]);
    const { packet: after, copyIds } = copyNotes(
      before,
      ['a'],
      { start: 2, pitchMidicents: 200 },
      fresh
    );
    expect(after.items.slice(0, 2)).toEqual(before.items);
    expect(after.items[0]).toBe(before.items[0]);
    expect(copyIds).toHaveLength(1);
    const copy = after.items[2];
    expect(copy.id).toBe(copyIds[0]);
    expect(copy.value).toMatchObject({
      onset: musicalPosition(3),
      pitches: [6200, 6600],
      velocity: 0.5,
    });
    expect(copy.provenance).toEqual(source.provenance);
    expect(copy.provenance).not.toBe(source.provenance);
  });

  it('clamps the group at the clip start, and a zero shift copies nothing', () => {
    const before = clip([item('a', 1, 1, [6000]), item('b', 3, 1, [6000])]);
    const { packet: after } = copyNotes(
      before,
      ['a', 'b'],
      { start: -5, pitchMidicents: 0 },
      fresh
    );
    expect(
      after.items
        .slice(2)
        .map((entry) => rationalToNumber((entry.value as NoteEventValue).onset.quarterNotes))
    ).toEqual([0, 2]);
    expect(copyNotes(before, ['a'], { start: 0, pitchMidicents: 0 }, fresh).packet).toBe(before);
    expect(copyNotes(before, ['x'], { start: 1, pitchMidicents: 0 }, fresh).packet).toBe(before);
  });
});
