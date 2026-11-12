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
  moveNotes,
  resizeNotes,
  resizeNotesStart,
  resolveSamePitchOverlaps,
  setVelocities,
  splitNote,
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

/** [id, onset, length] of every item, in packet order. */
const spans = (p: DataPacket) =>
  p.items.map((entry, index) => [entry.id, start(p, index), length(p, index)]);
/** The same, sorted by onset (reads like the roll). */
const inTime = (p: DataPacket) => [...spans(p)].sort((a, b) => Number(a[1]) - Number(b[1]));

let pieceCounter = 0;
const pieceIds = () => `piece${++pieceCounter}`;

describe('resolveSamePitchOverlaps', () => {
  it('returns a clean packet by identity (no overlap, or only untouched or chord overlaps)', () => {
    const clean = clip([item('a', 0, 2, [6000]), item('b', 2, 2, [6000]), item('c', 0, 1, [6400])]);
    expect(resolveSamePitchOverlaps(clean).packet).toBe(clean);
    expect(resolveSamePitchOverlaps(clean).survivorOf.size).toBe(0);
    expect(resolveSamePitchOverlaps(clean).created.size).toBe(0);
  });

  it('the whole note with a quarter dropped on beat 2 becomes q, q, h (exactly)', () => {
    const base = clip([{ ...item('w', 0, 4, [6000], 0.6), provenance: [step('earlier')] }]);
    const dropped = clip([
      ...base.items,
      item('q', 1, 1, [6000], 0.9),
    ] as DataItem<NoteEventValue>[]);
    pieceCounter = 0;
    const result = resolveSamePitchOverlaps(dropped, base, pieceIds);
    expect(inTime(result.packet)).toEqual([
      ['w', 0, 1],
      ['q', 1, 1],
      ['piece1', 2, 2],
    ]);
    // The original keeps its id and velocity; the piece wears the original's velocity and
    // provenance, a label for its own onset and a slot equal to its length.
    const piece = result.packet.items.find((entry) => entry.id === 'piece1')!;
    expect((piece.value as NoteEventValue).velocity).toBe(0.6);
    expect(piece.provenance).toEqual([step('earlier')]);
    expect(piece.provenance).not.toBe(base.items[0].provenance);
    expect(piece.label).toContain('2/1');
    expect((piece.value as NoteEventValue).interOnset).toEqual(
      (piece.value as NoteEventValue).duration
    );
    // The piece sits right after its original; the dragged note is untouched by reference.
    expect(ids(result.packet)).toEqual(['w', 'piece1', 'q']);
    expect(result.packet.items[2]).toBe(dropped.items[1]);
    expect([...result.created]).toEqual(['piece1']);
    expect(result.removed.size).toBe(0);
    expect(result.survivorOf.size).toBe(0);
  });

  it('a quarter at the same onset as a whole note: the new quarter plus the remainder', () => {
    const base = clip([item('w', 0, 4, [6000])]);
    const edited = clip([...base.items, item('q', 0, 1, [6000])] as DataItem<NoteEventValue>[]);
    const result = resolveSamePitchOverlaps(edited, base, pieceIds);
    expect(inTime(result.packet)).toEqual([
      ['q', 0, 1],
      ['w', 1, 3],
    ]);
    expect(result.created.size).toBe(0);
    // The remainder is the original note shortened from the left: its label follows its onset.
    expect(result.packet.items[0].label).not.toBe(base.items[0].label);
  });

  it('identical onset and duration merge: the existing note keeps its id and takes the velocity', () => {
    const base = clip([item('a', 0, 1, [6000], 0.4)]);
    const edited = clip([
      ...base.items,
      item('b', 0, 1, [6000], 0.9),
    ] as DataItem<NoteEventValue>[]);
    const result = resolveSamePitchOverlaps(edited, base);
    expect(ids(result.packet)).toEqual(['a']);
    expect(value(result.packet, 0).velocity).toBe(0.9);
    expect(Object.fromEntries(result.survivorOf)).toEqual({ b: 'a' });
    expect(mapMergedIds(['b', 'a'], result.survivorOf)).toEqual(['a']);
    // The same velocity: the existing note is returned by reference.
    const same = clip([...base.items, item('c', 0, 1, [6000], 0.4)] as DataItem<NoteEventValue>[]);
    const merged = resolveSamePitchOverlaps(same, base);
    expect(merged.packet.items[0]).toBe(base.items[0]);
    expect(ids(merged.packet)).toEqual(['a']);
  });

  it('partial overlaps from either side shorten the other note (it keeps its id)', () => {
    const base = clip([item('a', 2, 2, [6000])]);
    const fromLeft = clip([...base.items, item('t', 1, 2, [6000])] as DataItem<NoteEventValue>[]);
    expect(inTime(resolveSamePitchOverlaps(fromLeft, base).packet)).toEqual([
      ['t', 1, 2],
      ['a', 3, 1],
    ]);
    const fromRight = clip([...base.items, item('t', 3, 2, [6000])] as DataItem<NoteEventValue>[]);
    expect(inTime(resolveSamePitchOverlaps(fromRight, base).packet)).toEqual([
      ['a', 2, 1],
      ['t', 3, 2],
    ]);
    // A shared edge is not an overlap.
    const touching = clip([...base.items, item('t', 4, 1, [6000])] as DataItem<NoteEventValue>[]);
    expect(resolveSamePitchOverlaps(touching, base).packet).toBe(touching);
  });

  it('a note covered completely is removed (and reported), a bigger touched note stays', () => {
    const base = clip([item('a', 1, 1, [6000]), item('b', 4, 1, [6400])]);
    const edited = clip([...base.items, item('t', 0, 4, [6000])] as DataItem<NoteEventValue>[]);
    const result = resolveSamePitchOverlaps(edited, base);
    expect(ids(result.packet)).toEqual(['b', 't']);
    expect([...result.removed]).toEqual(['a']);
    expect(result.survivorOf.size).toBe(0);
    expect(result.packet.items[0]).toBe(base.items[1]);
  });

  it('two touched notes that overlap: the later ONSET wins, whichever is longer or later in the packet', () => {
    const forward = clip([item('a', 0, 2, [6000]), item('b', 1, 2, [6000])]);
    expect(inTime(resolveSamePitchOverlaps(forward).packet)).toEqual([
      ['a', 0, 1],
      ['b', 1, 2],
    ]);
    const reversed = clip([item('b', 1, 2, [6000]), item('a', 0, 2, [6000])]);
    // Packet order does not matter: b starts later, so b wins here too.
    expect(inTime(resolveSamePitchOverlaps(reversed).packet)).toEqual([
      ['a', 0, 1],
      ['b', 1, 2],
    ]);
    // Equal onsets: the later in packet order wins.
    const tie = clip([item('p', 0, 2, [6000]), item('q', 0, 1, [6000])]);
    pieceCounter = 0;
    expect(inTime(resolveSamePitchOverlaps(tie, undefined, pieceIds).packet)).toEqual([
      ['q', 0, 1],
      ['p', 1, 1],
    ]);
    // The later one inside the earlier splits it.
    const inside = clip([item('a', 0, 4, [6000]), item('b', 1, 1, [6000])]);
    pieceCounter = 0;
    expect(inTime(resolveSamePitchOverlaps(inside, undefined, pieceIds).packet)).toEqual([
      ['a', 0, 1],
      ['b', 1, 1],
      ['piece1', 2, 2],
    ]);
  });

  it('a touched note only overwrites notes of its OWN pitch', () => {
    const base = clip([item('a', 0, 4, [6000])]);
    const edited = clip([...base.items, item('t', 1, 1, [6100])] as DataItem<NoteEventValue>[]);
    expect(resolveSamePitchOverlaps(edited, base).packet).toBe(edited);
  });

  it('chords are left alone: they neither overwrite nor are overwritten', () => {
    const base = clip([item('chord', 0, 4, [6000, 6400])]);
    const over = clip([...base.items, item('t', 1, 1, [6000])] as DataItem<NoteEventValue>[]);
    expect(resolveSamePitchOverlaps(over, base).packet).toBe(over);
    const single = clip([item('s', 0, 4, [6000])]);
    const chordOn = clip([
      ...single.items,
      item('c', 1, 1, [6000, 6400]),
    ] as DataItem<NoteEventValue>[]);
    expect(resolveSamePitchOverlaps(chordOn, single).packet).toBe(chordOn);
  });

  it('untouched overlapping pairs in an old clip survive an unrelated edit; without a base all count', () => {
    const base = clip([item('a', 0, 4, [6000]), item('b', 1, 1, [6000]), item('x', 2, 1, [6400])]);
    const moved = moveNotes(base, ['x'], { start: 1, pitchMidicents: 0 });
    expect(resolveSamePitchOverlaps(moved, base).packet).toBe(moved);
    expect(resolveSamePitchOverlaps(moved).packet).not.toBe(moved);
  });

  describe('pre-existing pairs (both notes in the base, overlapping there at one pitch) stay as they were', () => {
    const oldPair = () => clip([item('a', 0, 4, [6000]), item('b', 1, 1, [6000])]);

    it('a velocity-only edit writes nothing and leaves both notes', () => {
      const base = oldPair();
      const louder = setVelocities(base, { b: 0.5 });
      const result = resolveSamePitchOverlaps(louder, base, pieceIds);
      expect(result.packet).toBe(louder);
      expect(ids(result.packet)).toEqual(['a', 'b']);
      expect(result.created.size + result.removed.size + result.survivorOf.size).toBe(0);
    });

    it('an old identical pair stays two notes under a velocity edit', () => {
      const base = clip([item('d1', 0, 1, [6000], 0.4), item('d2', 0, 1, [6000], 0.4)]);
      const louder = setVelocities(base, { d2: 0.9 });
      const result = resolveSamePitchOverlaps(louder, base);
      expect(result.packet).toBe(louder);
      expect(ids(result.packet)).toEqual(['d1', 'd2']);
    });

    it('a knife cut of a note leaves its old same-pitch partner alone', () => {
      const base = clip([item('a', 0, 4, [6000]), item('p', 2, 4, [6000])]);
      const cut = splitNote(base, 'a', 1, 'r');
      const result = resolveSamePitchOverlaps(cut, base, pieceIds, new Map([['r', 'a']]));
      expect(result.packet).toBe(cut);
      expect(inTime(result.packet)).toEqual([
        ['a', 0, 1],
        ['r', 1, 3],
        ['p', 2, 4],
      ]);
    });

    it('a time-selection cut of an old pair member leaves the partner alone', () => {
      const base = clip([item('a', 0, 4, [6000]), item('p', 2, 4, [6000])]);
      let counter = 0;
      const moved = timeMoveResult(base, { start: 1, end: 2 }, 10, () => `n${counter++}`);
      expect(moved.pieceOf.size).toBe(2);
      const result = resolveSamePitchOverlaps(moved.packet, base, pieceIds, moved.pieceOf);
      expect(result.packet).toBe(moved.packet);
      expect(result.packet.items.find((entry) => entry.id === 'p')).toBe(base.items[1]);
    });

    it('nudging or resizing one note of an old pair leaves both', () => {
      const base = oldPair();
      const nudged = moveNotes(base, ['b'], { start: 0.25, pitchMidicents: 0 });
      expect(resolveSamePitchOverlaps(nudged, base, pieceIds).packet).toBe(nudged);
      const longer = resizeNotes(base, ['b'], 1);
      expect(resolveSamePitchOverlaps(longer, base, pieceIds).packet).toBe(longer);
    });

    it('moving a group that contains an old pair together leaves both', () => {
      const base = clip([
        item('a', 0, 4, [6000]),
        item('b', 1, 1, [6000]),
        item('x', 8, 1, [6400]),
      ]);
      const moved = moveNotes(base, ['a', 'b'], { start: 2, pitchMidicents: 200 });
      expect(resolveSamePitchOverlaps(moved, base, pieceIds).packet).toBe(moved);
    });

    it('a brand-new note overlapping an old pair still resolves against what it overlaps', () => {
      const base = oldPair();
      const edited = clip([...base.items, item('n', 3, 2, [6000])] as DataItem<NoteEventValue>[]);
      pieceCounter = 0;
      expect(inTime(resolveSamePitchOverlaps(edited, base, pieceIds).packet)).toEqual([
        ['a', 0, 3],
        ['b', 1, 1],
        ['n', 3, 2],
      ]);
    });

    it('a note moved onto a same-pitch note it did not overlap before still resolves', () => {
      const base = clip([
        item('a', 0, 4, [6000]),
        item('b', 1, 1, [6000]),
        item('c', 8, 2, [6000]),
      ]);
      const moved = moveNotes(base, ['c'], { start: -7, pitchMidicents: 0 });
      const result = resolveSamePitchOverlaps(moved, base, pieceIds);
      // c [1,3) overwrites b (identical start, covers it) and cuts a; the old a/b pair is gone with it.
      expect(inTime(result.packet).map((entry) => entry[0])).toContain('c');
      expect(result.packet).not.toBe(moved);
    });
  });

  it('piece ids never collide with existing ids, and a source without newId still gets one', () => {
    const base = clip([item('w', 0, 4, [6000]), item('taken', 8, 1, [6400])]);
    const edited = clip([...base.items, item('q', 1, 1, [6000])] as DataItem<NoteEventValue>[]);
    const result = resolveSamePitchOverlaps(edited, base, () => 'taken');
    expect(new Set(ids(result.packet)).size).toBe(4);
    expect([...result.created]).toEqual(['taken~1']);
    expect(ids(resolveSamePitchOverlaps(edited, base).packet)).toContain('w:piece');
  });

  it('two touched notes cutting one untouched note: three pieces at most, no overlap left', () => {
    const base = clip([item('w', 0, 8, [6000])]);
    const edited = clip([
      ...base.items,
      item('q1', 1, 1, [6000]),
      item('q2', 4, 1, [6000]),
    ] as DataItem<NoteEventValue>[]);
    pieceCounter = 0;
    const result = resolveSamePitchOverlaps(edited, base, pieceIds);
    expect(inTime(result.packet)).toEqual([
      ['w', 0, 1],
      ['q1', 1, 1],
      ['piece1', 2, 2],
      ['q2', 4, 1],
      ['piece2', 5, 3],
    ]);
    expect(result.created.size).toBe(2);
  });

  describe('per editor producer (pure edit, then resolve against the base)', () => {
    const resolve = (edited: DataPacket, base: DataPacket) =>
      resolveSamePitchOverlaps(edited, base, pieceIds);

    it('note move onto a same-pitch note splits it', () => {
      const base = clip([item('a', 0, 4, [6000]), item('b', 6, 1, [6000])]);
      const moved = moveNotes(base, ['b'], { start: -5, pitchMidicents: 0 });
      pieceCounter = 0;
      expect(inTime(resolve(moved, base).packet)).toEqual([
        ['a', 0, 1],
        ['b', 1, 1],
        ['piece1', 2, 2],
      ]);
    });

    it('move onto an identical note merges (the existing id and position stay)', () => {
      const base = clip([item('a', 0, 1, [6000]), item('b', 2, 1, [6000])]);
      const moved = moveNotes(base, ['b'], { start: -2, pitchMidicents: 0 });
      const result = resolve(moved, base);
      expect(ids(result.packet)).toEqual(['a']);
      expect(result.survivorOf.get('b')).toBe('a');
    });

    it('transpose (move by pitch) onto a note of another pitch that overlaps it', () => {
      const base = clip([item('a', 0, 4, [6000]), item('b', 1, 1, [6200])]);
      const moved = moveNotes(base, ['b'], { start: 0, pitchMidicents: -200 });
      pieceCounter = 0;
      expect(inTime(resolve(moved, base).packet)).toEqual([
        ['a', 0, 1],
        ['b', 1, 1],
        ['piece1', 2, 2],
      ]);
    });

    it('copy-drag onto a note: the copy overwrites, the original stays', () => {
      const base = clip([item('a', 0, 4, [6000]), item('b', 6, 1, [6000])]);
      const copied = copyNotes(base, ['b'], { start: -5, pitchMidicents: 0 }, () => 'copy');
      pieceCounter = 0;
      expect(inTime(resolve(copied.packet, base).packet)).toEqual([
        ['a', 0, 1],
        ['copy', 1, 1],
        ['piece1', 2, 2],
        ['b', 6, 1],
      ]);
    });

    it('a copy landing exactly on an existing note changes nothing but the merge', () => {
      const base = clip([item('a', 0, 1, [6000]), item('b', 2, 1, [6000])]);
      const copied = copyNotes(base, ['b'], { start: -2, pitchMidicents: 0 }, () => 'copy');
      const result = resolve(copied.packet, base);
      expect(result.survivorOf.get('copy')).toBe('a');
      expect(result.packet.items).toEqual(base.items);
    });

    it('time move in merge mode onto notes: the moved piece overwrites the destination', () => {
      const base = clip([item('a', 0, 3, [6000]), item('b', 5, 1, [6000])]);
      let counter = 0;
      const result = timeMoveResult(
        base,
        { start: 5, end: 6 },
        -4,
        () => `n${counter++}`,
        undefined,
        { merge: true }
      );
      pieceCounter = 0;
      const resolved = resolve(result.packet, base);
      // b (wholly inside the span) keeps its id and lands on [1,2): it splits a around itself.
      expect(inTime(resolved.packet)).toEqual([
        ['a', 0, 1],
        ['b', 1, 1],
        ['piece1', 2, 1],
      ]);
      expect(ids(resolved.packet)).toEqual(['a', 'piece1', 'b']);
      expect([...resolved.created]).toEqual(['piece1']);
    });

    it('a note entered on top of a longer note splits it; on a shorter one covers it', () => {
      const base = clip([item('a', 0, 4, [6000])]);
      const entered = addNote(base, { start: 1, duration: 1, pitchMidicents: 6000 }, 'new');
      pieceCounter = 0;
      expect(inTime(resolve(entered, base).packet)).toEqual([
        ['a', 0, 1],
        ['new', 1, 1],
        ['piece1', 2, 2],
      ]);
      const small = clip([item('s', 1, 1, [6000])]);
      const covering = addNote(small, { start: 1, duration: 3, pitchMidicents: 6000 }, 'new');
      const result = resolve(covering, small);
      expect(ids(result.packet)).toEqual(['new']);
      expect([...result.removed]).toEqual(['s']);
    });

    it('a resize that runs over a same-pitch neighbour shortens the neighbour', () => {
      const base = clip([item('a', 0, 1, [6000]), item('b', 2, 2, [6000])]);
      const longer = resizeNotes(base, ['a'], 2.5);
      expect(inTime(resolve(longer, base).packet)).toEqual([
        ['a', 0, 3.5],
        ['b', 3.5, 0.5],
      ]);
    });

    it('a left-edge resize over a neighbour shortens the neighbour', () => {
      const base = clip([item('a', 0, 2, [6000]), item('b', 3, 2, [6000])]);
      const wider = resizeNotesStart(base, ['b'], -2);
      expect(inTime(resolve(wider, base).packet)).toEqual([
        ['a', 0, 1],
        ['b', 1, 4],
      ]);
    });
  });
});

function step(transformation: string) {
  return { sourceModuleInstance: 'm', sourceItemIds: [], transformation };
}

describe('resolveSamePitchOverlaps: nested notes, any packet order', () => {
  const permutations = <T>(list: T[]): T[][] =>
    list.length <= 1
      ? [list]
      : list.flatMap((entry, index) =>
          permutations([...list.slice(0, index), ...list.slice(index + 1)]).map((rest) => [
            entry,
            ...rest,
          ])
        );
  /** The resolved clip as sorted [start, end] spans (ids differ across orders, spans must not). */
  const spans = (p: DataPacket) =>
    p.items
      .map((entry) => {
        const v = entry.value as NoteEventValue;
        const from = rationalToNumber(v.onset.quarterNotes);
        return [from, from + rationalToNumber(v.duration.quarterNotes)] as const;
      })
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const noOverlap = (all: ReturnType<typeof spans>) =>
    all.forEach((span, index) => {
      if (index > 0) {
        expect(span[0]).toBeGreaterThanOrEqual(all[index - 1][1]);
      }
    });
  const counter = () => {
    let next = 0;
    return () => `piece${(next += 1)}`;
  };

  it('C 0-5, B 1-4, A 2-3 all touched: every order gives the same spans and no overlap', () => {
    const notes = [item('C', 0, 5, [6000]), item('B', 1, 3, [6000]), item('A', 2, 1, [6000])];
    const results = permutations(notes).map(
      (order) => resolveSamePitchOverlaps(clip(order), clip([]), counter()).packet
    );
    const reference = spans(results[0]);
    expect(reference).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
    ]);
    results.forEach((result) => {
      expect(spans(result)).toEqual(reference);
      noOverlap(spans(result));
    });
  });

  it('new S 0-4 + new W 1-2 + untouched U 3-5: every order gives the same spans and no overlap', () => {
    const base = clip([item('U', 3, 2, [6000])]);
    const notes = [item('S', 0, 4, [6000]), item('W', 1, 1, [6000]), item('U', 3, 2, [6000])];
    const results = permutations(notes).map(
      (order) => resolveSamePitchOverlaps(clip(order), base, counter()).packet
    );
    const reference = spans(results[0]);
    expect(reference).toEqual([
      [0, 1],
      [1, 2],
      [2, 4],
      [4, 5],
    ]);
    results.forEach((result) => {
      expect(spans(result)).toEqual(reference);
      noOverlap(spans(result));
    });
  });

  it('keeps the whole-note result: q, q (dragged), h', () => {
    const base = clip([item('w', 0, 4, [6000]), item('q', 4, 1, [6000])]);
    const edited = clip([item('w', 0, 4, [6000]), item('q', 1, 1, [6000])]);
    const result = resolveSamePitchOverlaps(edited, base, counter()).packet;
    expect(spans(result)).toEqual([
      [0, 1],
      [1, 2],
      [2, 4],
    ]);
  });
});

describe('resolveSamePitchOverlaps: many notes', () => {
  it('a long single-pitch run all touched resolves quickly and like a pairwise reference', () => {
    // 3000 notes of length 2 every 1: each later note overwrites the tail of the earlier one.
    const count = 3000;
    const edited = clip(
      Array.from({ length: count }, (_, index) => item(`n${index}`, index, 2, [6000]))
    );
    const began = performance.now();
    const result = resolveSamePitchOverlaps(edited, clip([]), () => 'x').packet;
    expect(performance.now() - began).toBeLessThan(5000);
    expect(result.items).toHaveLength(count);
    // Every note but the last is cut to one unit by its successor.
    for (let index = 0; index < count - 1; index += 1) {
      expect(start(result, index)).toBe(index);
      expect(length(result, index)).toBe(1);
    }
    expect(length(result, count - 1)).toBe(2);
  });
});
