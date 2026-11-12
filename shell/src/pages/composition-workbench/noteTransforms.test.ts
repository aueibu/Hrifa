import { describe, expect, it } from 'vitest';
import { clipActionOperation, type ClipActionResult } from './clipActions';
import { freezeClipProperties } from './clipProperties';
import { clipActionById, clipActionsOf } from './clipTypes';
import type { NoteEventValue } from './melodicization';
import { packet, type DataItem, type DataPacket } from './model';
import {
  musicalDuration,
  musicalPosition,
  rational,
  rationalFromNumber,
  rationalToNumber,
} from './musicalTime';
import { newNoteItemId } from './noteClipEdits';
import {
  duplicateNotes,
  legato,
  noteClipActions,
  parseScaleFactor,
  quantizeNotes,
  reverseInTime,
  reverseOrder,
  rotateInTime,
  rotateValues,
  scaleNotes,
  transposeNotes,
} from './noteTransforms';

type Selection = { ids: string[]; range: { start: number; end: number } | null; kind?: 'time' };

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

/** a 0..1 C4, b 2..3 E4, c 4..6 chord C4 + E4. */
const base = () =>
  clip([item('a', 0, 1, [6000]), item('b', 2, 1, [6400]), item('c', 4, 2, [6000, 6400])]);

const none: Selection = { ids: [], range: null };
const notes = (selection: Selection['ids'], range: Selection['range'] = null): Selection => ({
  ids: selection,
  range,
});
const time = (start: number, end: number): Selection => ({
  ids: [],
  range: { start, end },
  kind: 'time',
});

const value = (p: DataPacket, id: string) =>
  p.items.find((entry) => entry.id === id)!.value as NoteEventValue;
const onset = (p: DataPacket, id: string) => rationalToNumber(value(p, id).onset.quarterNotes);
const length = (p: DataPacket, id: string) => rationalToNumber(value(p, id).duration.quarterNotes);
const pitches = (p: DataPacket, id: string) => value(p, id).pitches;
const ok = (result: ClipActionResult) => {
  if (!result.ok) {
    throw new Error(`refused: ${result.error}`);
  }
  return result.packet;
};
const refused = (result: ClipActionResult) => {
  expect(result.ok).toBe(false);
  return result.ok ? '' : result.error;
};

describe('parseScaleFactor', () => {
  it('reads decimals, fractions and an x prefix exactly', () => {
    expect(parseScaleFactor('2')).toEqual({ ok: true, value: rational(2) });
    expect(parseScaleFactor('0.5')).toEqual({ ok: true, value: rational(1, 2) });
    expect(parseScaleFactor('x3')).toEqual({ ok: true, value: rational(3) });
    expect(parseScaleFactor('3/2')).toEqual({ ok: true, value: rational(3, 2) });
    expect(parseScaleFactor(0.25)).toEqual({ ok: true, value: rational(1, 4) });
  });

  it('holds to the floor 1/32768 and the ceiling 32768, refusing with a message', () => {
    expect(parseScaleFactor('1/32768').ok).toBe(true);
    expect(parseScaleFactor('32768').ok).toBe(true);
    expect(parseScaleFactor('1/32769').ok).toBe(false);
    expect(parseScaleFactor('32769').ok).toBe(false);
    for (const bad of ['0', '-2', '', 'abc', '1/0', '2x']) {
      const parsed = parseScaleFactor(bad);
      expect(parsed.ok).toBe(false);
    }
  });

  it('refuses huge or unsafe input with the bounds message instead of throwing', () => {
    for (const huge of [
      '1e20',
      '1e400',
      '99999999999999999999',
      '99999999999999999999/3',
      '3/99999999999999999999',
      '99999999999999999999/99999999999999999998',
      '1e-20',
      '0.00000000000000000001',
    ]) {
      const parsed = parseScaleFactor(huge);
      expect([huge, parsed.ok]).toEqual([huge, false]);
      expect(parsed.ok ? '' : parsed.error).toMatch(/between/);
    }
  });
});

describe('scale', () => {
  it('whole, with nothing selected, scales onsets and durations about the clip start', () => {
    const before = base();
    const after = ok(scaleNotes(before, none, rational(2), 'whole'));
    expect(['a', 'b', 'c'].map((id) => onset(after, id))).toEqual([0, 4, 8]);
    expect(['a', 'b', 'c'].map((id) => length(after, id))).toEqual([2, 2, 4]);
    // Pitches, velocity and ids are untouched; the clip's length never changes (c now ends at 12).
    expect(pitches(after, 'c')).toEqual([6000, 6400]);
    expect(after.frame).toBe(before.frame);
    expect(after.metadata).toBe(before.metadata);
    expect(after.items.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
  });

  it('whole scales about the selection start; individually keeps the onsets', () => {
    const selection = notes(['b', 'c'], { start: 2, end: 6 });
    const whole = ok(scaleNotes(base(), selection, rational(2), 'whole'));
    expect(onset(whole, 'a')).toBe(0);
    expect(['b', 'c'].map((id) => onset(whole, id))).toEqual([2, 6]);
    expect(['b', 'c'].map((id) => length(whole, id))).toEqual([2, 4]);
    const individually = ok(scaleNotes(base(), selection, rational(2), 'individual'));
    expect(['b', 'c'].map((id) => onset(individually, id))).toEqual([2, 4]);
    expect(['b', 'c'].map((id) => length(individually, id))).toEqual([2, 4]);
    expect(length(individually, 'a')).toBe(1);
    // The two modes differ for the same factor.
    expect(onset(whole, 'c')).not.toBe(onset(individually, 'c'));
  });

  it('halves exactly, keeps a matching slot matching, and handles a factor like 3/2', () => {
    const half = ok(scaleNotes(base(), none, rational(1, 2), 'whole'));
    expect(['a', 'b', 'c'].map((id) => onset(half, id))).toEqual([0, 1, 2]);
    expect(['a', 'b', 'c'].map((id) => length(half, id))).toEqual([0.5, 0.5, 1]);
    const three = ok(scaleNotes(base(), notes(['a']), rational(3, 2), 'individual'));
    expect(value(three, 'a').duration.quarterNotes).toEqual(rational(3, 2));
    expect(value(three, 'a').interOnset.quarterNotes).toEqual(rational(3, 2));
  });

  it('a time selection scales the notes overlapping it about the span start, partial notes whole', () => {
    // Span 1..5 holds b (2..3) and c (4..6, partly outside); a only touches the edge at 1.
    const after = ok(scaleNotes(base(), time(1, 5), rational(2), 'whole'));
    expect(onset(after, 'a')).toBe(0);
    expect(length(after, 'a')).toBe(1);
    expect(['b', 'c'].map((id) => onset(after, id))).toEqual([3, 7]);
    expect(['b', 'c'].map((id) => length(after, id))).toEqual([2, 4]);
  });

  it('refuses, changing nothing, when any duration would drop under the minimum note length', () => {
    const fine = clip([item('a', 0, 1, [6000]), item('tiny', 2, 1 / 32, [6400])]);
    const message = refused(scaleNotes(fine, none, rational(1, 2), 'individual'));
    expect(message).toMatch(/minimum note length/);
    expect(ok(scaleNotes(fine, notes(['a']), rational(1, 2), 'individual'))).not.toBe(fine);
    // 1/16 halved is exactly the minimum (1/32): allowed.
    const sixteenth = clip([item('s', 2, 1 / 16, [6400])]);
    expect(length(ok(scaleNotes(sixteenth, none, rational(1, 2), 'whole')), 's')).toBe(1 / 32);
  });

  it('refuses a whole scale that would move a note before the clip start, and a factor of 1 changes nothing', () => {
    const before = base();
    // b starts at 2 and the span starts at 3: scaling by 4 about 3 puts b at -1.
    expect(
      refused(
        scaleNotes(
          clip([item('b', 2, 2, [6000]), item('x', 3, 1, [6100])]),
          time(3, 5),
          rational(4),
          'whole'
        )
      )
    ).toMatch(/before the start/);
    const same = scaleNotes(before, none, rational(1), 'whole');
    expect(ok(same)).toBe(before);
  });

  it('refuses with a message on an empty clip and on a time selection with no notes', () => {
    expect(refused(scaleNotes(clip([]), none, rational(2), 'whole'))).toMatch(/no notes/);
    expect(refused(scaleNotes(base(), time(7, 8), rational(2), 'whole'))).toMatch(/no notes/);
  });
});

describe('reverse in time', () => {
  it('mirrors the whole clip with nothing selected', () => {
    const after = ok(reverseInTime(base(), none));
    expect(['a', 'b', 'c'].map((id) => onset(after, id))).toEqual([7, 5, 2]);
    expect(['a', 'b', 'c'].map((id) => length(after, id))).toEqual([1, 1, 2]);
    expect(pitches(after, 'c')).toEqual([6000, 6400]);
  });

  it('mirrors inside a note selection span (positions S+E-e)', () => {
    const after = ok(reverseInTime(base(), notes(['a', 'b'], { start: 0, end: 3 })));
    expect([onset(after, 'a'), onset(after, 'b'), onset(after, 'c')]).toEqual([2, 0, 4]);
  });

  it('a time selection mirrors the overlapping notes whole, partial ones included', () => {
    // Span 1..5: b (2..3) -> 3..4 and c (4..6, half outside) -> 0..2.
    const after = ok(reverseInTime(base(), time(1, 5)));
    expect([onset(after, 'b'), onset(after, 'c'), onset(after, 'a')]).toEqual([3, 0, 0]);
  });

  it('refuses when a note would land before the clip start', () => {
    const before = clip([item('x', 0, 4, [6000])]);
    expect(refused(reverseInTime(before, time(1, 2)))).toMatch(/before the start/);
  });
});

describe('reverse order', () => {
  it('reverses pitches and velocities across the slots and keeps the rhythm', () => {
    const before = clip([
      item('a', 0, 1, [6000], 0.2),
      item('b', 2, 1, [6400], 0.5),
      item('c', 4, 2, [6000, 6400], 0.9),
    ]);
    const after = ok(reverseOrder(before, none));
    expect(pitches(after, 'a')).toEqual([6000, 6400]);
    expect(value(after, 'a').velocity).toBe(0.9);
    expect(pitches(after, 'b')).toEqual([6400]);
    expect(pitches(after, 'c')).toEqual([6000]);
    expect(value(after, 'c').velocity).toBe(0.2);
    expect(['a', 'b', 'c'].map((id) => onset(after, id))).toEqual([0, 2, 4]);
    expect(['a', 'b', 'c'].map((id) => length(after, id))).toEqual([1, 1, 2]);
  });

  it('treats notes sharing an onset as separate slots in packet order, and works on a selection only', () => {
    const before = clip([
      item('p', 0, 1, [100]),
      item('q', 0, 1, [200]),
      item('r', 1, 1, [300]),
      item('far', 5, 1, [900]),
    ]);
    const after = ok(reverseOrder(before, notes(['p', 'q', 'r'])));
    expect([100, 200, 300].map((_, index) => pitches(after, ['p', 'q', 'r'][index]))).toEqual([
      [300],
      [200],
      [100],
    ]);
    expect(pitches(after, 'far')).toEqual([900]);
    expect(after.items[3]).toBe(before.items[3]);
  });

  it('does nothing (same packet) for a single note', () => {
    const before = base();
    expect(ok(reverseOrder(before, notes(['a'])))).toBe(before);
  });
});

describe('rotate values', () => {
  const seeded = () =>
    clip([
      item('a', 0, 1, [6000], 0.2),
      item('b', 2, 1, [6400], 0.5),
      item('c', 4, 2, [6700], 0.9),
    ]);

  it('moves each value to a later slot for a positive amount, wrapping, rhythm fixed', () => {
    const after = ok(rotateValues(seeded(), none, 1));
    expect(['a', 'b', 'c'].map((id) => pitches(after, id))).toEqual([[6700], [6000], [6400]]);
    expect(['a', 'b', 'c'].map((id) => value(after, id).velocity)).toEqual([0.9, 0.2, 0.5]);
    expect(['a', 'b', 'c'].map((id) => length(after, id))).toEqual([1, 1, 2]);
  });

  it('a negative amount rotates the other way; a multiple of the count changes nothing', () => {
    const after = ok(rotateValues(seeded(), none, -1));
    expect(['a', 'b', 'c'].map((id) => pitches(after, id))).toEqual([[6400], [6700], [6000]]);
    const before = seeded();
    expect(ok(rotateValues(before, none, 3))).toBe(before);
    expect(ok(rotateValues(before, none, -6))).toBe(before);
    expect(pitches(ok(rotateValues(before, none, 4)), 'a')).toEqual([6700]);
  });

  it('rotates only the selected notes', () => {
    const after = ok(rotateValues(seeded(), notes(['a', 'c']), 1));
    expect(pitches(after, 'a')).toEqual([6700]);
    expect(pitches(after, 'b')).toEqual([6400]);
    expect(pitches(after, 'c')).toEqual([6000]);
  });
});

describe('rotate in time', () => {
  it('shifts by grid steps and wraps around the clip length with nothing selected', () => {
    const after = ok(rotateInTime(base(), none, 1, 1));
    expect(['a', 'b', 'c'].map((id) => onset(after, id))).toEqual([1, 3, 5]);
    const back = ok(rotateInTime(base(), none, -1, 1));
    expect(['a', 'b', 'c'].map((id) => onset(back, id))).toEqual([7, 1, 3]);
    // Lengths are kept (c wraps past nothing here, but never shortens).
    expect(['a', 'b', 'c'].map((id) => length(back, id))).toEqual([1, 1, 2]);
  });

  it('wraps around the selection span', () => {
    const after = ok(rotateInTime(base(), notes(['a', 'b'], { start: 0, end: 3 }), 2, 1));
    expect([onset(after, 'a'), onset(after, 'b'), onset(after, 'c')]).toEqual([2, 1, 4]);
  });

  it('uses the grid unit exactly, triplets included, and a sixteenth for Auto', () => {
    const triplet = ok(rotateInTime(clip([item('a', 0, 1, [6000])]), none, 1, 2 / 3));
    expect(value(triplet, 'a').onset.quarterNotes).toEqual(rational(2, 3));
    const auto = ok(rotateInTime(clip([item('a', 0, 1, [6000])]), none, 3, undefined));
    expect(onset(auto, 'a')).toBe(0.75);
  });

  it('a time selection wraps by position in the span, a note starting before it lands near the end', () => {
    // Span 1..5, one step of 1: b 2->3, c 4->5 wraps to 1.
    const after = ok(rotateInTime(base(), time(1, 5), 1, 1));
    expect([onset(after, 'b'), onset(after, 'c')]).toEqual([3, 1]);
    expect(onset(after, 'a')).toBe(0);
  });
});

/** Applies a rotate and carries the selection the way the editor's `adopt` does. */
function rotateAgain(
  current: DataPacket,
  selection: Selection,
  amount: number,
  grid: number
): { packet: DataPacket; selection: Selection } {
  const result = rotateInTime(current, selection, amount, grid);
  const next = ok(result);
  const wanted = result.ok ? result.selection : undefined;
  return { packet: next, selection: wanted ?? selection };
}

describe('rotate in time: repeated presses wrap in a stable span', () => {
  // Clip length 8; b sits at 7 (length 2, so it crosses the clip end once it has wrapped around).
  /** A clip frozen at length 8 first, then holding notes that may run past it. */
  const frozen = (...extra: DataItem<NoteEventValue>[]) => {
    const held = freezeClipProperties(clip([item('a', 0, 1, [6000])]));
    return { ...held, items: [...held.items, ...extra] };
  };
  const wrapping = () => frozen(item('b', 7, 2, [6400]));

  it('with nothing selected, two presses and a full cycle keep wrapping inside 0..clip length', () => {
    let state = { packet: wrapping(), selection: none };
    const seen: number[] = [];
    for (let press = 0; press < 8; press += 1) {
      state = rotateAgain(state.packet, state.selection, 1, 1);
      seen.push(onset(state.packet, 'b'));
    }
    // 7 -> 0 -> 1 ... -> 6 -> 7: wraps at the clip length each time, and the 8th press is home.
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(onset(state.packet, 'a')).toBe(0);
    expect(length(state.packet, 'b')).toBe(2);
  });

  it('with nothing selected, a note already past the clip end does not stretch the span', () => {
    const sticking = frozen(item('b', 7.5, 2, [6400]));
    const once = ok(rotateInTime(sticking, none, 1, 1));
    expect(onset(once, 'b')).toBe(0.5);
    expect(onset(once, 'a')).toBe(1);
    const twice = ok(rotateInTime(once, none, 1, 1));
    expect(onset(twice, 'b')).toBe(1.5);
  });

  it('with a note selection, the span stays the original one over N presses (full cycle returns)', () => {
    const start = clip([item('a', 0, 1, [6000]), item('b', 2, 1, [6400]), item('c', 5, 1, [6700])]);
    let state = { packet: start, selection: notes(['a', 'b'], { start: 0, end: 3 }) };
    const seen: number[] = [];
    for (let press = 0; press < 6; press += 1) {
      state = rotateAgain(state.packet, state.selection, 2, 1);
      seen.push(onset(state.packet, 'b'));
      expect(state.selection.range).toEqual({ start: 0, end: 3 });
    }
    // b: 2 -> 1 -> 0 -> 2 -> 1 -> 0 -> 2 (wrapping inside 0..3, step 2); six presses = home.
    expect(seen).toEqual([1, 0, 2, 1, 0, 2]);
    expect(onset(state.packet, 'a')).toBe(0);
    expect(onset(state.packet, 'c')).toBe(5);
  });

  it('a note selection without a range uses the notes span once and keeps it afterwards', () => {
    const start = clip([item('a', 0, 1, [6000]), item('b', 2, 1, [6400])]);
    let state = { packet: start, selection: notes(['a', 'b']) };
    state = rotateAgain(state.packet, state.selection, 1, 1);
    expect(state.selection.range).toEqual({ start: 0, end: 3 });
    expect([onset(state.packet, 'a'), onset(state.packet, 'b')]).toEqual([1, 0]);
    state = rotateAgain(state.packet, state.selection, 1, 1);
    expect([onset(state.packet, 'a'), onset(state.packet, 'b')]).toEqual([2, 1]);
    state = rotateAgain(state.packet, state.selection, 1, 1);
    expect([onset(state.packet, 'a'), onset(state.packet, 'b')]).toEqual([0, 2]);
  });

  it('a time selection keeps its own range over repeated presses', () => {
    let current = base();
    const selection = time(1, 5);
    const seen: number[] = [];
    for (let press = 0; press < 4; press += 1) {
      current = ok(rotateInTime(current, selection, 1, 1));
      seen.push(onset(current, 'c'));
    }
    expect(seen).toEqual([1, 2, 3, 4]);
  });
});

describe('legato', () => {
  it('extends each note to the next onset and leaves the last unchanged', () => {
    const after = ok(legato(base(), none));
    expect(['a', 'b', 'c'].map((id) => length(after, id))).toEqual([2, 2, 2]);
    expect(value(after, 'a').interOnset.quarterNotes).toEqual(rational(2));
  });

  it('uses the next SELECTED onset, and notes sharing an onset both reach the next', () => {
    const selected = ok(legato(base(), notes(['a', 'c'])));
    expect(length(selected, 'a')).toBe(4);
    expect(length(selected, 'b')).toBe(1);
    expect(length(selected, 'c')).toBe(2);
    const shared = ok(
      legato(
        clip([item('p', 0, 0.5, [100]), item('q', 0, 0.25, [200]), item('r', 1, 1, [300])]),
        none
      )
    );
    expect([length(shared, 'p'), length(shared, 'q'), length(shared, 'r')]).toEqual([1, 1, 1]);
  });

  it('shortens a note that overlaps the next one, and a single onset changes nothing', () => {
    const shortened = ok(legato(clip([item('a', 0, 4, [100]), item('b', 1, 1, [200])]), none));
    expect(length(shortened, 'a')).toBe(1);
    const before = base();
    expect(ok(legato(before, notes(['c'])))).toBe(before);
  });
});

describe('transpose', () => {
  it('moves every pitch of a chord and keeps microtonal offsets', () => {
    const before = clip([item('m', 0, 1, [6050, 6450]), item('n', 1, 1, [6000])]);
    const up = ok(transposeNotes(before, notes(['m']), 12));
    expect(pitches(up, 'm')).toEqual([7250, 7650]);
    expect(pitches(up, 'n')).toEqual([6000]);
    expect(up.items[1]).toBe(before.items[1]);
    const down = ok(transposeNotes(before, none, -2));
    expect(pitches(down, 'm')).toEqual([5850, 6250]);
    expect(pitches(down, 'n')).toEqual([5800]);
  });

  it('refuses, changing nothing, if any note would leave the keyboard', () => {
    const before = clip([item('lo', 0, 1, [1100]), item('mid', 1, 1, [6000, 12600])]);
    expect(refused(transposeNotes(before, none, -12))).toMatch(/off the keyboard/);
    expect(refused(transposeNotes(before, none, 2))).toMatch(/off the keyboard/);
    // Only the low note selected: moving up is fine, down 12 is not (1100 - 1200 < 0).
    expect(pitches(ok(transposeNotes(before, notes(['lo']), 12)), 'lo')).toEqual([2300]);
    expect(refused(transposeNotes(before, notes(['lo']), -12))).toMatch(/off the keyboard/);
  });

  it('zero changes nothing', () => {
    const before = base();
    expect(ok(transposeNotes(before, none, 0))).toBe(before);
  });
});

describe('quantize', () => {
  const loose = () =>
    clip([
      item('a', 0.4, 0.5, [6000]),
      item('b', 0.5, 0.5, [6100]),
      item('c', 1.6, 0.25, [6200]),
      item('d', 3, 1, [6300]),
    ]);

  it('snaps onsets to the grid at 100%, halves up, keeping durations and ids', () => {
    const before = loose();
    const after = ok(quantizeNotes(before, none, 1));
    expect(['a', 'b', 'c', 'd'].map((id) => onset(after, id))).toEqual([0, 1, 2, 3]);
    expect(['a', 'b', 'c', 'd'].map((id) => length(after, id))).toEqual([0.5, 0.5, 0.25, 1]);
    expect(after.items.map((entry) => entry.id)).toEqual(['a', 'b', 'c', 'd']);
    // d is already on the grid: kept by reference.
    expect(after.items[3]).toBe(before.items[3]);
  });

  it('uses a sixteenth on Auto and exact triplet grids', () => {
    const auto = ok(quantizeNotes(loose(), notes(['a']), undefined));
    expect(onset(auto, 'a')).toBe(0.5);
    const triplet = ok(quantizeNotes(clip([item('a', 0.7, 1, [6000])]), none, 2 / 3));
    expect(value(triplet, 'a').onset.quarterNotes).toEqual(rational(2, 3));
  });

  it('only touches the selection, and a time selection only the overlapping notes', () => {
    const selected = ok(quantizeNotes(loose(), notes(['c']), 1));
    expect(onset(selected, 'a')).toBe(0.4);
    expect(onset(selected, 'c')).toBe(2);
    const timed = ok(quantizeNotes(loose(), time(1.5, 2), 1));
    expect(onset(timed, 'c')).toBe(2);
    expect(onset(timed, 'a')).toBe(0.4);
  });

  it('on-grid notes make no change (same packet)', () => {
    const before = base();
    expect(ok(quantizeNotes(before, none, 1))).toBe(before);
  });
});

describe('duplicate', () => {
  const ids = () => {
    let next = 0;
    return () => `dup${(next += 1)}`;
  };

  it('with nothing selected the copy goes after the content end, new ids, copies selected', () => {
    const before = base();
    const result = duplicateNotes(before, none, ids());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    const after = result.packet;
    expect(after.items).toHaveLength(6);
    expect(after.items.slice(0, 3)).toEqual(before.items);
    expect(['dup1', 'dup2', 'dup3'].map((id) => onset(after, id))).toEqual([6, 8, 10]);
    expect(pitches(after, 'dup3')).toEqual([6000, 6400]);
    expect(result.selection).toEqual({
      ids: ['dup1', 'dup2', 'dup3'],
      range: { start: 6, end: 12 },
    });
    // The clip's length is untouched.
    expect(after.frame).toBe(before.frame);
  });

  it('a note selection copies directly after its span and selects the copy', () => {
    const result = duplicateNotes(base(), notes(['a', 'b'], { start: 0, end: 3 }), ids());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect([onset(result.packet, 'dup1'), onset(result.packet, 'dup2')]).toEqual([3, 5]);
    expect(result.selection).toEqual({ ids: ['dup1', 'dup2'], range: { start: 3, end: 6 } });
  });

  it('a range wider than the notes shifts by the whole range (silence is copied too)', () => {
    const result = duplicateNotes(base(), notes(['a'], { start: 0, end: 2 }), ids());
    expect(result.ok && onset(result.packet, 'dup1')).toBe(2);
  });

  it('a time selection copies the part of each note inside the span, keeping the band on the copy', () => {
    const before = base();
    const result = duplicateNotes(before, time(2.5, 4.5), ids());
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    // b's last half (2.5..3) and c's first half (4..4.5) shift by 2; the originals stay whole.
    expect(length(result.packet, 'b')).toBe(1);
    expect(length(result.packet, 'c')).toBe(2);
    expect(result.selection).toMatchObject({ kind: 'time', range: { start: 4.5, end: 6.5 } });
    const moved = result.selection!.ids.map((id) => [
      onset(result.packet, id),
      length(result.packet, id),
    ]);
    expect(moved).toEqual([
      [4.5, 0.5],
      [6, 0.5],
    ]);
  });

  it('refuses on an empty clip', () => {
    expect(refused(duplicateNotes(clip([]), none, ids()))).toMatch(/no notes/);
  });
});

describe('unique ids for bulk copies', () => {
  it('newNoteItemId never repeats within one millisecond', () => {
    const ids = new Set(Array.from({ length: 5000 }, () => newNoteItemId('clip')));
    expect(ids.size).toBe(5000);
    expect([...ids].every((id) => /^clip:note:[a-z0-9]+-[a-z0-9]+$/.test(id))).toBe(true);
  });

  it('a duplicate of 2000 notes has 2000 new unique ids, even from a repeating id source', () => {
    const many = clip(
      Array.from({ length: 2000 }, (_, index) => item(`n${index}`, index * 0.25, 0.25, [6000])),
      600
    );
    let calls = 0;
    // A deliberately bad source: every id is handed out twice, and some are existing ids.
    const bad = () => (calls++ % 2 === 0 ? `dup-${calls}` : `n${calls % 2000}`);
    for (const source of [() => newNoteItemId('clip'), bad]) {
      const after = ok(duplicateNotes(many, none, source));
      const ids = after.items.map((entry) => entry.id);
      expect(ids).toHaveLength(4000);
      expect(new Set(ids).size).toBe(4000);
    }
  });

  it('a time-selection duplicate also gets unique ids', () => {
    const many = clip(
      Array.from({ length: 300 }, (_, index) => item(`n${index}`, index * 0.25, 0.25, [6000])),
      100
    );
    const after = ok(
      duplicateNotes(
        many,
        time(0, 75),
        (() => {
          let calls = 0;
          return () => `same-${Math.floor(calls++ / 2)}`;
        })()
      )
    );
    const ids = after.items.map((entry) => entry.id);
    expect(ids).toHaveLength(600);
    expect(new Set(ids).size).toBe(600);
  });
});

describe('the clip-type registry actions', () => {
  it('registers the note actions on the Notes type with params and applicability', () => {
    const blank = base();
    expect(clipActionsOf(blank).map((action) => action.id)).toEqual([
      'scale',
      'reverse-time',
      'reverse-order',
      'rotate-values',
      'rotate-time',
      'legato',
      'transpose',
      'quantize',
      'duplicate',
    ]);
    expect(clipActionsOf(blank)).toBe(noteClipActions);
    expect(clipActionById(blank, 'scale')?.params.map((param) => param.id)).toEqual([
      'factor',
      'mode',
    ]);
    expect(clipActionById(blank, 'nope')).toBeUndefined();
    for (const action of noteClipActions) {
      expect(action.applies(blank)).toBe(true);
      expect(action.label).toBeTruthy();
    }
    expect(clipActionOperation('scale')).toBe('transform-scale');
  });

  it('only note clips implement them: other packets have none and cyclic note packets do not apply', () => {
    expect(clipActionsOf(packet('list', 'pitch', []))).toEqual([]);
    expect(clipActionsOf(packet('events', 'pitchClass', []))).toEqual([]);
    const cyclic: DataPacket = {
      ...base(),
      frame: { ...base().frame!, topology: 'cyclic' },
    };
    expect(clipActionById(cyclic, 'scale')?.applies(cyclic)).toBe(false);
  });

  it('runs from a context with typed (string) params, and refuses bad params with a message', () => {
    const context = { selection: none, gridUnit: 1, newId: () => 'n' };
    const scale = clipActionById(base(), 'scale')!;
    expect(ok(scale.run(base(), context, { factor: '2', mode: 'individual' })).items).toHaveLength(
      3
    );
    expect(refused(scale.run(base(), context, { factor: 'nope', mode: 'whole' }))).toMatch(
      /factor/
    );
    const rotate = clipActionById(base(), 'rotate-time')!;
    expect(refused(rotate.run(base(), context, { amount: '1.5' }))).toMatch(/whole number/);
    expect(onset(ok(rotate.run(base(), context, { amount: '-1' })), 'a')).toBe(7);
    const transpose = clipActionById(base(), 'transpose')!;
    expect(refused(transpose.run(base(), context, { semitones: '' }))).toMatch(/number/);
    expect(pitches(ok(transpose.run(base(), context, { semitones: '12' })), 'a')).toEqual([7200]);
  });
});
