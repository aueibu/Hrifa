import { describe, expect, it } from 'vitest';
import type { NoteEventValue } from './melodicization';
import { packet, type DataItem, type DataPacket } from './model';
import {
  musicalDuration,
  musicalPosition,
  rationalFromNumber,
  rationalToNumber,
} from './musicalTime';
import {
  addNote,
  copyNotes,
  mapMergedIds,
  mergeDuplicateNotes,
  mergeDuplicateNotesDetailed,
  moveNotes,
  resizeNotesStart,
  setVelocities,
  timeMoveResult,
} from './noteClipEdits';

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
      onset: { quarterNotes: rationalFromNumber(start) },
      interOnset: { quarterNotes: rationalFromNumber(length) },
      duration: { quarterNotes: rationalFromNumber(length) },
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

const value = (p: DataPacket, index: number) => p.items[index].value as NoteEventValue;
const start = (p: DataPacket, index: number) =>
  rationalToNumber(value(p, index).onset.quarterNotes);
const length = (p: DataPacket, index: number) =>
  rationalToNumber(value(p, index).duration.quarterNotes);
const ids = (p: DataPacket) => p.items.map((entry) => entry.id);

describe('resizeNotesStart: the left-edge resize', () => {
  it('moves the start and the length with the end fixed, both ways', () => {
    const before = clip([item('a', 2, 2, [6000])]);
    const shorter = resizeNotesStart(before, ['a'], 0.5);
    expect(start(shorter, 0)).toBe(2.5);
    expect(length(shorter, 0)).toBe(1.5);
    const longer = resizeNotesStart(before, ['a'], -1);
    expect(start(longer, 0)).toBe(1);
    expect(length(longer, 0)).toBe(3);
    expect(start(longer, 0) + length(longer, 0)).toBe(4);
    // The slot follows the duration when it matched; the label follows the onset.
    expect(value(longer, 0).interOnset).toEqual(value(longer, 0).duration);
    expect(longer.items[0].label).not.toBe(before.items[0].label);
  });

  it('holds the start at 0 and the length at the minimum, each note on its own, end always fixed', () => {
    const before = clip([
      item('a', 0.5, 2, [6000]),
      item('b', 4, 0.25, [6400]),
      item('c', 2, 2, [6000]),
    ]);
    const wide = resizeNotesStart(before, ['a', 'b', 'c'], -3);
    expect([0, 1, 2].map((index) => start(wide, index))).toEqual([0, 1, 0]);
    expect([0, 1, 2].map((index) => start(wide, index) + length(wide, index))).toEqual([
      2.5, 4.25, 4,
    ]);
    const narrow = resizeNotesStart(before, ['a', 'b', 'c'], 5);
    const minimum = length(narrow, 1);
    expect(minimum).toBeGreaterThan(0);
    expect(minimum).toBeLessThan(0.25);
    expect([0, 1, 2].map((index) => start(narrow, index) + length(narrow, index))).toEqual([
      2.5, 4.25, 4,
    ]);
    expect(length(narrow, 0)).toBe(minimum);
    expect(length(narrow, 2)).toBe(minimum);
  });

  it('applies one delta to a whole selection, leaves the rest by reference, and no-ops by identity', () => {
    const before = clip([
      item('a', 1, 2, [6000]),
      item('b', 3, 2, [6400]),
      item('c', 6, 1, [6000]),
    ]);
    const moved = resizeNotesStart(before, ['a', 'b'], 0.5);
    expect([0, 1, 2].map((index) => start(moved, index))).toEqual([1.5, 3.5, 6]);
    expect(moved.items[2]).toBe(before.items[2]);
    expect(resizeNotesStart(before, ['a'], 0)).toBe(before);
    expect(resizeNotesStart(before, ['zzz'], 1)).toBe(before);
    // A note at 0 cannot be lengthened to the left: nothing changes.
    const atZero = clip([item('a', 0, 1, [6000])]);
    expect(resizeNotesStart(atZero, ['a'], -1)).toBe(atZero);
  });
});

describe('mergeDuplicateNotes', () => {
  it('returns a clean packet by identity (different onsets, same pitch, are not duplicates)', () => {
    const clean = clip([item('a', 0, 2, [6000]), item('b', 1, 2, [6000]), item('c', 0, 1, [6400])]);
    expect(mergeDuplicateNotes(clean)).toBe(clean);
    expect(mergeDuplicateNotesDetailed(clean).survivorOf.size).toBe(0);
  });

  it('keeps the first note (id, velocity), takes the longest duration, and maps dropped ids', () => {
    const before = clip([
      item('a', 1, 1, [6000], 0.4),
      item('b', 3, 1, [6400]),
      item('c', 1, 3, [6000], 0.9),
      item('d', 1, 2, [6000], 0.1),
    ]);
    const { packet: merged, survivorOf } = mergeDuplicateNotesDetailed(before);
    expect(ids(merged)).toEqual(['a', 'b']);
    expect(value(merged, 0).velocity).toBe(0.4);
    expect(length(merged, 0)).toBe(3);
    expect(rationalToNumber(value(merged, 0).interOnset.quarterNotes)).toBe(3);
    expect(merged.items[1]).toBe(before.items[1]);
    expect(Object.fromEntries(survivorOf)).toEqual({ c: 'a', d: 'a' });
    expect(mapMergedIds(['d', 'b', 'c'], survivorOf)).toEqual(['a', 'b']);
    expect(mapMergedIds(['b'], new Map())).toEqual(['b']);
  });

  it('chords: an event merges only into ONE event with the same pitch set, in either order', () => {
    const chord = clip([item('a', 0, 1, [6000, 6400]), item('b', 0, 2, [6400, 6000])]);
    const merged = mergeDuplicateNotes(chord);
    expect(ids(merged)).toEqual(['a']);
    expect(length(merged, 0)).toBe(2);
    // Partial duplicates are left whole, whichever comes first.
    const single = item('s', 0, 1, [6000]);
    const pair = item('p', 0, 1, [6000, 6400]);
    const singleFirst = clip([single, pair]);
    const pairFirst = clip([pair, single]);
    expect(mergeDuplicateNotes(singleFirst)).toBe(singleFirst);
    expect(mergeDuplicateNotes(pairFirst)).toBe(pairFirst);
    const into = clip([item('a', 0, 1, [6000, 6400]), item('b', 0, 2, [6400])]);
    expect(mergeDuplicateNotes(into)).toBe(into);
    const intoReversed = clip([item('b', 0, 2, [6400]), item('a', 0, 1, [6000, 6400])]);
    expect(mergeDuplicateNotes(intoReversed)).toBe(intoReversed);
  });

  describe('merging only what the edit touched (with the base packet)', () => {
    const pair = () => [item('d1', 0, 1, [6000], 0.4), item('d2', 0, 1, [6000], 0.4)];

    it('pre-existing identical notes survive an unrelated edit', () => {
      const base = clip([...pair(), item('x', 2, 1, [6400])]);
      const moved = moveNotes(base, ['x'], { start: 1, pitchMidicents: 0 });
      expect(mergeDuplicateNotes(moved, base)).toBe(moved);
      // Without a base every note counts as touched, so the old pair is merged.
      expect(ids(mergeDuplicateNotes(moved))).toEqual(['d1', 'x']);
    });

    it("editing D2's velocity or length of a pre-existing pair is not lost", () => {
      const base = clip(pair());
      const louder = setVelocities(base, { d2: 0.9 });
      const merged = mergeDuplicateNotesDetailed(louder, base);
      expect(ids(merged.packet)).toEqual(['d1']);
      expect(value(merged.packet, 0).velocity).toBe(0.9);
      expect(merged.survivorOf.get('d2')).toBe('d1');
      const longer = clip([item('d1', 0, 1, [6000], 0.4), item('d2', 0, 3, [6000], 0.4)]);
      const grown = mergeDuplicateNotes(longer, base);
      expect(ids(grown)).toEqual(['d1']);
      expect(length(grown, 0)).toBe(3);
    });

    it('a note touched onto a pre-existing pair merges into the first untouched one only', () => {
      const base = clip([...pair(), item('x', 2, 2, [6000], 0.7)]);
      const moved = moveNotes(base, ['x'], { start: -2, pitchMidicents: 0 });
      const merged = mergeDuplicateNotesDetailed(moved, base);
      expect(ids(merged.packet)).toEqual(['d1', 'd2']);
      expect(Object.fromEntries(merged.survivorOf)).toEqual({ x: 'd1' });
      expect(length(merged.packet, 0)).toBe(2);
      expect(value(merged.packet, 0).velocity).toBe(0.7);
    });

    it('two touched duplicates with no untouched one: the first keeps its id and velocity', () => {
      const base = clip([item('a', 0, 1, [6000], 0.3), item('b', 2, 1, [6000], 0.8)]);
      const edited = clip([item('a', 1, 1, [6000], 0.3), item('b', 1, 1, [6000], 0.8)]);
      const merged = mergeDuplicateNotes(edited, base);
      expect(ids(merged)).toEqual(['a']);
      expect(value(merged, 0).velocity).toBe(0.3);
    });
  });

  describe('per editor producer (pure edit, then merge)', () => {
    it('note move onto another note', () => {
      const before = clip([item('a', 0, 1, [6000]), item('b', 2, 2, [6000])]);
      const moved = mergeDuplicateNotes(moveNotes(before, ['b'], { start: -2, pitchMidicents: 0 }));
      expect(ids(moved)).toEqual(['a']);
      expect(length(moved, 0)).toBe(2);
    });

    it('move by pitch onto a note of the same onset', () => {
      const before = clip([item('a', 0, 1, [6000]), item('b', 0, 1, [6200])]);
      const moved = mergeDuplicateNotesDetailed(
        moveNotes(before, ['b'], { start: 0, pitchMidicents: -200 })
      );
      expect(ids(moved.packet)).toEqual(['a']);
      expect(moved.survivorOf.get('b')).toBe('a');
    });

    it('copy-drag onto a note', () => {
      const before = clip([item('a', 0, 1, [6000]), item('b', 2, 1, [6000])]);
      const copied = copyNotes(before, ['b'], { start: -2, pitchMidicents: 0 }, () => 'copy');
      const merged = mergeDuplicateNotesDetailed(copied.packet);
      expect(ids(merged.packet)).toEqual(['a', 'b']);
      expect(merged.survivorOf.get('copy')).toBe('a');
    });

    it('time move in merge mode onto notes', () => {
      const before = clip([item('a', 0, 1, [6000]), item('b', 2, 1, [6000])]);
      let counter = 0;
      const result = timeMoveResult(
        before,
        { start: 2, end: 3 },
        -2,
        () => `n${counter++}`,
        undefined,
        { merge: true }
      );
      expect(result.packet.items.length).toBeGreaterThan(1);
      const merged = mergeDuplicateNotes(result.packet);
      expect(merged.items).toHaveLength(1);
      expect(merged.items[0].id).toBe('a');
    });

    it('a note entered on top of an existing note', () => {
      const before = clip([item('a', 1, 1, [6000])]);
      const added = addNote(before, { start: 1, duration: 3, pitchMidicents: 6000 }, 'new');
      const merged = mergeDuplicateNotes(added);
      expect(ids(merged)).toEqual(['a']);
      expect(length(merged, 0)).toBe(3);
    });

    it('a left-edge resize never merges notes of different onsets', () => {
      const before = clip([item('a', 0, 1, [6000]), item('b', 2, 2, [6000])]);
      const resized = resizeNotesStart(before, ['b'], -2);
      // b now starts where a does: the same onset and pitch, so they merge.
      expect(ids(mergeDuplicateNotes(resized))).toEqual(['a']);
      const partly = resizeNotesStart(before, ['b'], -1);
      expect(mergeDuplicateNotes(partly)).toBe(partly);
    });
  });
});
