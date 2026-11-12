import { describe, expect, it } from 'vitest';
import { MIN_NOTE_QUARTERS } from '../../components/PianoRoll';
import type { NoteEventValue } from './melodicization';
import { packet, type DataItem, type DataPacket } from './model';
import { rationalFromNumber, rationalToNumber } from './musicalTime';
import { resizeNotes, resolveSamePitchOverlaps } from './noteClipEdits';
import {
  navigateSelection,
  navigationOrder,
  moveNotesInPitch,
  moveNotesInTime,
  noteKeyEdit,
  MIN_NUDGE_QUARTERS,
  NUDGE_GRID_DIVISOR,
  nudgeQuarters,
  OCTAVE_MIDICENTS,
  PITCH_STEP_MIDICENTS,
  resizeNotesByGrid,
} from './noteKeyboard';

function item(
  id: string,
  start: number,
  length: number,
  pitches: number[]
): DataItem<NoteEventValue> {
  return {
    id,
    value: {
      onset: { quarterNotes: rationalFromNumber(start) },
      interOnset: { quarterNotes: rationalFromNumber(length) },
      duration: { quarterNotes: rationalFromNumber(length) },
      pitches,
      velocity: 1,
    },
    label: id,
    provenance: [],
  };
}

const clip = (items: DataItem<NoteEventValue>[]): DataPacket => packet('events', 'note', items);
const value = (p: DataPacket, id: string) =>
  p.items.find((entry) => entry.id === id)!.value as NoteEventValue;
const start = (p: DataPacket, id: string) => rationalToNumber(value(p, id).onset.quarterNotes);
const length = (p: DataPacket, id: string) => rationalToNumber(value(p, id).duration.quarterNotes);

const none = { shift: false, alt: false, mod: false };

describe('noteKeyEdit: which key does what', () => {
  it('maps each combination', () => {
    expect(noteKeyEdit('ArrowRight', none, 0.5)).toEqual({ kind: 'move', quarters: 0.5 });
    expect(noteKeyEdit('ArrowLeft', none, 0.5)).toEqual({ kind: 'move', quarters: -0.5 });
    expect(noteKeyEdit('ArrowUp', none, 0.5)).toEqual({
      kind: 'pitch',
      midicents: PITCH_STEP_MIDICENTS,
    });
    expect(noteKeyEdit('ArrowDown', none, 0.5)).toEqual({
      kind: 'pitch',
      midicents: -PITCH_STEP_MIDICENTS,
    });
    expect(noteKeyEdit('ArrowUp', { ...none, shift: true }, 0.5)).toEqual({
      kind: 'pitch',
      midicents: OCTAVE_MIDICENTS,
    });
    expect(noteKeyEdit('ArrowLeft', { ...none, shift: true }, 0.5)).toEqual({
      kind: 'move',
      quarters: -0.5 / NUDGE_GRID_DIVISOR,
    });
    expect(noteKeyEdit('ArrowRight', { ...none, mod: true }, 0.5)).toEqual({
      kind: 'length',
      quarters: 0.5,
    });
    expect(noteKeyEdit('ArrowLeft', { ...none, mod: true }, 0.5)).toEqual({
      kind: 'length',
      quarters: -0.5,
    });
    expect(noteKeyEdit('ArrowRight', { ...none, alt: true }, 0.5)).toEqual({
      kind: 'navigate',
      direction: 1,
    });
    expect(noteKeyEdit('ArrowLeft', { ...none, alt: true }, 0.5)).toEqual({
      kind: 'navigate',
      direction: -1,
    });
  });

  it('leaves unbound combinations and other keys alone', () => {
    expect(noteKeyEdit('ArrowUp', { ...none, alt: true }, 0.5)).toBeNull();
    expect(noteKeyEdit('ArrowUp', { ...none, mod: true }, 0.5)).toBeNull();
    expect(noteKeyEdit('ArrowLeft', { shift: true, alt: false, mod: true }, 0.5)).toBeNull();
    expect(noteKeyEdit('ArrowLeft', { shift: true, alt: true, mod: false }, 0.5)).toBeNull();
    expect(noteKeyEdit('a', none, 0.5)).toBeNull();
  });

  it('the nudge is the effective grid unit over 8, three subdivisions finer, with a floor', () => {
    expect(NUDGE_GRID_DIVISOR).toBe(8);
    expect(nudgeQuarters(4)).toBe(0.5); // grid 1/1 -> 1/8
    expect(nudgeQuarters(1)).toBe(0.125); // grid 1/4 -> 1/32
    expect(nudgeQuarters(1 / 3)).toBeCloseTo(1 / 24, 12); // triplet follows the snap unit
    expect(noteKeyEdit('ArrowRight', { ...none, shift: true }, 4)).toEqual({
      kind: 'move',
      quarters: 0.5,
    });
    expect(noteKeyEdit('ArrowLeft', { ...none, shift: true }, 1)).toEqual({
      kind: 'move',
      quarters: -0.125,
    });
  });

  it('never nudges finer than 1/1024 of a quarter: at the floor it still nudges by the floor', () => {
    expect(MIN_NUDGE_QUARTERS).toBe(1 / 1024);
    expect(nudgeQuarters(1 / 64)).toBe(1 / 512);
    expect(nudgeQuarters(1 / 128)).toBe(1 / 1024);
    expect(nudgeQuarters(1 / 1024)).toBe(MIN_NUDGE_QUARTERS);
    expect(noteKeyEdit('ArrowRight', { ...none, shift: true }, 1 / 4096)).toEqual({
      kind: 'move',
      quarters: MIN_NUDGE_QUARTERS,
    });
  });
});

describe('moving in time', () => {
  it('moves every selected note by the same amount; others stay by reference', () => {
    const before = clip([
      item('a', 1, 1, [6000]),
      item('b', 2, 1, [6400]),
      item('c', 5, 1, [6000]),
    ]);
    const moved = moveNotesInTime(before, ['a', 'b'], 0.5);
    expect([start(moved, 'a'), start(moved, 'b')]).toEqual([1.5, 2.5]);
    expect(moved.items[2]).toBe(before.items[2]);
    const nudged = moveNotesInTime(before, ['a'], -nudgeQuarters(1));
    expect(start(nudged, 'a')).toBe(0.875);
  });

  it('stops at 0 and does nothing when a note is already there', () => {
    const before = clip([item('a', 0, 1, [6000]), item('b', 1, 1, [6400])]);
    expect(moveNotesInTime(before, ['a', 'b'], -1)).toBe(before);
    const near = clip([item('a', 0.25, 1, [6000])]);
    expect(start(moveNotesInTime(near, ['a'], -1), 'a')).toBe(0);
  });
});

describe('moving in pitch', () => {
  it('moves by a semitone and by an octave, keeping the group shape', () => {
    const before = clip([item('a', 0, 1, [6000]), item('b', 0, 1, [6400])]);
    const up = moveNotesInPitch(before, ['a', 'b'], PITCH_STEP_MIDICENTS);
    expect([value(up, 'a').pitches, value(up, 'b').pitches]).toEqual([[6100], [6500]]);
    const down = moveNotesInPitch(before, ['a', 'b'], -OCTAVE_MIDICENTS);
    expect([value(down, 'a').pitches, value(down, 'b').pitches]).toEqual([[4800], [5200]]);
    expect(value(moveNotesInPitch(before, ['a'], OCTAVE_MIDICENTS), 'a').pitches).toEqual([7200]);
  });

  it('refuses the whole group at the keyboard ends (no partial move)', () => {
    const top = clip([item('a', 0, 1, [12700]), item('b', 0, 1, [6000])]);
    expect(moveNotesInPitch(top, ['a', 'b'], PITCH_STEP_MIDICENTS)).toBe(top);
    expect(moveNotesInPitch(top, ['a', 'b'], OCTAVE_MIDICENTS)).toBe(top);
    const bottom = clip([item('a', 0, 1, [50]), item('b', 0, 1, [6000])]);
    expect(moveNotesInPitch(bottom, ['a', 'b'], -PITCH_STEP_MIDICENTS)).toBe(bottom);
    const nearTop = clip([item('a', 0, 1, [12000])]);
    expect(moveNotesInPitch(nearTop, ['a'], OCTAVE_MIDICENTS)).toBe(nearTop);
    expect(value(moveNotesInPitch(nearTop, ['a'], PITCH_STEP_MIDICENTS), 'a').pitches).toEqual([
      12100,
    ]);
  });

  it('a chord moves as one event and is refused when any of its pitches would leave', () => {
    const chord = clip([item('c', 0, 1, [6000, 12700])]);
    expect(moveNotesInPitch(chord, ['c'], PITCH_STEP_MIDICENTS)).toBe(chord);
    expect(value(moveNotesInPitch(chord, ['c'], -PITCH_STEP_MIDICENTS), 'c').pitches).toEqual([
      5900, 12600,
    ]);
  });

  it('nothing selected, or an unknown id, is no change', () => {
    const before = clip([item('a', 0, 1, [6000])]);
    expect(moveNotesInPitch(before, [], 100)).toBe(before);
    expect(moveNotesInPitch(before, ['zzz'], 100)).toBe(before);
  });
});

describe('lengthening and shortening by the grid', () => {
  it('lengthens by one division and shortens by one', () => {
    const before = clip([item('a', 0, 2, [6000]), item('b', 4, 1, [6400])]);
    const longer = resizeNotesByGrid(before, ['a', 'b'], 0.5, 0.5);
    expect([length(longer, 'a'), length(longer, 'b')]).toEqual([2.5, 1.5]);
    const shorter = resizeNotesByGrid(before, ['a', 'b'], -0.5, 0.5);
    expect([length(shorter, 'a'), length(shorter, 'b')]).toEqual([1.5, 0.5]);
  });

  it('never goes below one division: each note is held on its own', () => {
    const before = clip([
      item('big', 0, 2, [6000]),
      item('edge', 4, 0.75, [6400]),
      item('at', 8, 0.5, [6700]),
      item('under', 12, 0.25, [7000]),
    ]);
    const shorter = resizeNotesByGrid(before, ['big', 'edge', 'at', 'under'], -1, 0.5);
    // 2 shortens by the full division asked (2 - 1); 0.75 stops at the division; the ones at or
    // below it stay as they are.
    expect(length(shorter, 'big')).toBe(1);
    expect(length(shorter, 'edge')).toBe(0.5);
    expect(length(shorter, 'at')).toBe(0.5);
    expect(length(shorter, 'under')).toBe(0.25);
    expect(shorter.items[2]).toBe(before.items[2]);
    expect(shorter.items[3]).toBe(before.items[3]);
    const atFloor = clip([item('a', 0, 0.5, [6000])]);
    expect(resizeNotesByGrid(atFloor, ['a'], -0.5, 0.5)).toBe(atFloor);
  });
});

describe('selection navigation', () => {
  // A C E G chord at 0, then a second chord of the same pitches (G, D, C) at 1.
  const clipOf = () =>
    clip([
      item('c', 0, 1, [6000]),
      item('e', 0, 1, [6400]),
      item('g', 0, 1, [6700]),
      item('late-c', 1, 1, [6000]),
      item('late-d', 1, 1, [6200]),
      item('late-g', 1, 1, [6700]),
    ]);

  it('orders by onset ascending, then pitch high to low, then packet order', () => {
    expect(navigationOrder(clipOf())).toEqual(['g', 'e', 'c', 'late-g', 'late-d', 'late-c']);
    const ties = clip([item('x', 0, 1, [6000]), item('y', 0, 2, [6000])]);
    expect(navigationOrder(ties)).toEqual(['x', 'y']);
    // A chord event sorts by its top pitch.
    const mixed = clip([item('low', 0, 1, [5000]), item('chord', 0, 1, [4000, 7000])]);
    expect(navigationOrder(mixed)).toEqual(['chord', 'low']);
  });

  it('Alt+Right walks the C E G chord G, E, C, then the next onset, then stays at the end', () => {
    const p = clipOf();
    let selected: string[] = ['c', 'e', 'g'];
    const walk: string[] = [];
    for (let step = 0; step < 6; step += 1) {
      const next = navigateSelection(p, selected, 1);
      walk.push(next!);
      selected = [next!];
    }
    expect(walk).toEqual(['g', 'e', 'c', 'late-g', 'late-d', 'late-c']);
    expect(navigateSelection(p, ['late-c'], 1)).toBe('late-c');
  });

  it('Alt+Left mirrors it: the last of several, then back, staying at the first', () => {
    const p = clipOf();
    expect(navigateSelection(p, ['c', 'e', 'g'], -1)).toBe('c');
    expect(navigateSelection(p, ['c'], -1)).toBe('e');
    expect(navigateSelection(p, ['e'], -1)).toBe('g');
    expect(navigateSelection(p, ['g'], -1)).toBe('g');
    expect(navigateSelection(p, ['late-g'], -1)).toBe('c');
  });

  it('with nothing selected: the first note (Right) or the last note (Left)', () => {
    const p = clipOf();
    expect(navigateSelection(p, [], 1)).toBe('g');
    expect(navigateSelection(p, [], -1)).toBe('late-c');
    expect(navigateSelection(p, ['zzz'], 1)).toBe('g');
    expect(navigateSelection(clip([]), [], 1)).toBeNull();
  });

  it('several selected: the first or last of THEM in order, alone', () => {
    const p = clipOf();
    expect(navigateSelection(p, ['late-d', 'e'], 1)).toBe('e');
    expect(navigateSelection(p, ['late-d', 'e'], -1)).toBe('late-d');
  });
});

describe('Ctrl+Right on a whole selected same-pitch legato run', () => {
  const run = [item('a', 0, 1, [6000]), item('b', 1, 1, [6000]), item('c', 2, 1, [6000])];
  const orders = [
    ['a', 'b', 'c'],
    ['c', 'b', 'a'],
    ['b', 'c', 'a'],
    ['b', 'a', 'c'],
  ];
  const result = (order: string[]) => {
    const before = clip(order.map((id) => run.find((entry) => entry.id === id)!));
    const lengthened = resizeNotesByGrid(before, ['a', 'b', 'c'], 1, 1);
    const resolved = resolveSamePitchOverlaps(lengthened, before, () => 'piece').packet;
    return resolved.items
      .map((entry) => [entry.id, start(resolved, entry.id), length(resolved, entry.id)])
      .sort((x, y) => String(x[0]).localeCompare(String(y[0])));
  };

  it('behaves identically for any packet order: each note lengthens by one unit, the later onset overwrites the overlap', () => {
    // Every note grows by 1 (a 0-2, b 1-3, c 2-4); where two overlap the LATER onset wins, so b cuts
    // a back to 0-1 and c cuts b back to 1-2: only the last note keeps its extra unit (c 2-4).
    for (const order of orders) {
      expect(result(order)).toEqual([
        ['a', 0, 1],
        ['b', 1, 1],
        ['c', 2, 2],
      ]);
    }
  });
});

describe('performance: thousands of notes', () => {
  const count = 5000;
  const big = () =>
    clip(
      Array.from({ length: count }, (_, index) =>
        item(`n${index}`, index * 2, index % 3 === 0 ? 0.25 : 1, [6000 + (index % 12) * 100])
      )
    );
  const ids = (p: DataPacket) => p.items.map((entry) => entry.id);

  it('a select-all grid resize is one pass and equals the per-note result', () => {
    const before = big();
    const selected = ids(before);
    // The per-note reference: the earlier implementation, one id at a time through resizeNotes.
    const reference = (quarters: number, unit: number) => {
      const floor = Math.max(unit, MIN_NOTE_QUARTERS);
      return selected.slice(0, 300).reduce((next, id) => {
        const current = length(next, id);
        if (quarters < 0 && current <= floor + 1e-9) {
          return next;
        }
        return resizeNotes(
          next,
          [id],
          quarters < 0 ? Math.max(quarters, floor - current) : quarters
        );
      }, before);
    };
    const began = performance.now();
    const longer = resizeNotesByGrid(before, selected, 0.5, 0.5);
    const shorter = resizeNotesByGrid(before, selected, -0.5, 0.5);
    expect(performance.now() - began).toBeLessThan(3000);
    const refLonger = reference(0.5, 0.5);
    const refShorter = reference(-0.5, 0.5);
    for (const id of selected.slice(0, 300)) {
      expect(value(longer, id)).toEqual(value(refLonger, id));
      expect(value(shorter, id)).toEqual(value(refShorter, id));
    }
    for (const index of [2500, 4999]) {
      const original = length(before, `n${index}`);
      expect(length(longer, `n${index}`)).toBe(original + 0.5);
      expect(length(shorter, `n${index}`)).toBe(
        original <= 0.5 + 1e-9 ? original : Math.max(0.5, original - 0.5)
      );
    }
  });

  it('a resolve with thousands of touched notes on many pitches is fast and leaves no overlap', () => {
    const grown = resizeNotesByGrid(big(), ids(big()), 0.5, 0.5);
    const began = performance.now();
    const resolved = resolveSamePitchOverlaps(grown, big()).packet;
    expect(performance.now() - began).toBeLessThan(5000);
    expect(resolved.items.length).toBe(count);
  });
});
