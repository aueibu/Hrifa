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
  copyToClipboard,
  duplicateNotes,
  invertNotes,
  legato,
  makeEqualDuration,
  makeEqualPitch,
  makeEqualVelocity,
  noteClipActions,
  parseNoteDuration,
  parseScaleFactor,
  parseVelocityPercent,
  pasteNotes,
  quantizeNotes,
  reverseInTime,
  reverseOrder,
  rotateDurations,
  rotateInTime,
  rotateValues,
  scaleNotes,
  transposeNotes,
  wholeWindows,
} from './noteTransforms';
import type { RotationSessionCore } from './rotationSession';

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

/** A clip frozen at length 8 with these notes (they may run past that length). */
function frozenWith(items: DataItem<NoteEventValue>[]): DataPacket {
  const held = freezeClipProperties(clip([item('seed', 0, 1, [6000])]));
  return { ...held, items };
}

/** Applies a rotate and carries the selection and the session the way the editor's `adopt` does. */
function rotateAgain(
  current: DataPacket,
  selection: Selection,
  amount: number,
  grid: number,
  session?: RotationSessionCore | null
): { packet: DataPacket; selection: Selection; session: RotationSessionCore | null } {
  const result = rotateInTime(current, selection, amount, grid, session);
  const next = ok(result);
  const wanted = result.ok ? result.selection : undefined;
  return {
    packet: next,
    selection: wanted ?? selection,
    session: (result.ok && result.rotation) || null,
  };
}

/** Every note as [onset, length, ids' pitches], sorted, to compare whole patterns. */
const pattern = (p: DataPacket) =>
  p.items
    .map((entry) => [onset(p, entry.id), length(p, entry.id), pitches(p, entry.id)] as const)
    .sort((x, y) => x[0] - y[0] || x[1] - y[1]);
const soundOf = (p: DataPacket) => p.items.reduce((sum, entry) => sum + length(p, entry.id), 0);

describe('rotate in time (bounded, circular)', () => {
  it('shifts by grid steps and wraps whole notes around the clip length with nothing selected', () => {
    const after = ok(rotateInTime(base(), none, 1, 1));
    expect(['a', 'b', 'c'].map((id) => onset(after, id))).toEqual([1, 3, 5]);
    expect(after.items).toHaveLength(3);
    const back = ok(rotateInTime(base(), none, -1, 1));
    expect(['a', 'b', 'c'].map((id) => onset(back, id))).toEqual([7, 1, 3]);
    expect(['a', 'b', 'c'].map((id) => length(back, id))).toEqual([1, 1, 2]);
  });

  it('splits a note that would cross the span end and wraps its tail to the start', () => {
    // Selection Aq Ah Ae (A4 at 0 for 1, A4 at 1 for 2, A4 at 3 for 1/2): span 0..3.5.
    const before = clip([
      item('q', 0, 1, [6900]),
      item('h', 1, 2, [6900]),
      item('e', 3, 0.5, [6900]),
    ]);
    const result = rotateInTime(before, notes(['q', 'h', 'e']), 1, 1);
    const after = ok(result);
    // q 1..2; h 2..4 is cut at 3.5: 2..3.5 keeps the id, 3.5..4 wraps to 0..0.5 (fresh id);
    // e 4..4.5 wraps wholly to 0.5..1.
    expect(onset(after, 'q')).toBe(1);
    expect([onset(after, 'h'), length(after, 'h')]).toEqual([2, 1.5]);
    expect([onset(after, 'e'), length(after, 'e')]).toEqual([0.5, 0.5]);
    expect(after.items).toHaveLength(4);
    const tail = after.items[3];
    expect(tail.id).toBe('h~r1');
    expect([onset(after, 'h~r1'), length(after, 'h~r1')]).toEqual([0, 0.5]);
    expect(pitches(after, 'h~r1')).toEqual([6900]);
    // Nothing outside the span 0..3.5, and the sound is conserved.
    after.items.forEach((entry) => {
      expect(onset(after, entry.id)).toBeGreaterThanOrEqual(0);
      expect(onset(after, entry.id) + length(after, entry.id)).toBeLessThanOrEqual(3.5);
    });
    expect(soundOf(after)).toBe(3.5);
    // The selection keeps its span and takes in the new piece.
    expect(result.ok && result.selection).toEqual({
      ids: ['q', 'h', 'e', 'h~r1'],
      range: { start: 0, end: 3.5 },
    });
  });

  it('backwards, the part before the span start wraps to the end (same rules)', () => {
    const before = frozenWith([item('x', 0.5, 1, [6000])]);
    const after = ok(rotateInTime(before, none, -1, 1));
    // -1 step: 0.5..1.5 becomes -0.5..0.5: 0..0.5 stays (keeps the id), -0.5..0 wraps to 7.5..8.
    expect([onset(after, 'x'), length(after, 'x')]).toEqual([0, 0.5]);
    expect([onset(after, 'x~r1'), length(after, 'x~r1')]).toEqual([7.5, 0.5]);
    expect(soundOf(after)).toBe(1);
  });

  it('a note over the clip end is cut at the clip length: the part outside stays, the inside part rotates', () => {
    const crossing = frozenWith([item('a', 0, 1, [6000]), item('x', 7.5, 1, [6400])]);
    const after = ok(rotateInTime(crossing, none, 1, 1));
    // x was 7.5..8.5: 8..8.5 (outside the clip) stays put and keeps the id; the inside 7.5..8 moves to
    // 8.5..9 and wraps to 0.5..1 (fresh id); a moves to 1..2.
    expect([onset(after, 'x'), length(after, 'x')]).toEqual([8, 0.5]);
    expect([onset(after, 'x~r1'), length(after, 'x~r1')]).toEqual([0.5, 0.5]);
    expect(onset(after, 'a')).toBe(1);
    expect(after.items).toHaveLength(3);
    const half = ok(rotateInTime(crossing, none, 1, 0.5));
    // Half a step: the inside part 8..8.5 wraps whole to 0..0.5; a 0.5..1.5.
    expect([onset(half, 'x'), length(half, 'x')]).toEqual([8, 0.5]);
    expect([onset(half, 'x~r1'), length(half, 'x~r1')]).toEqual([0, 0.5]);
    const split = ok(rotateInTime(crossing, none, -1, 0.5));
    // The inside part 7..7.5; a -0.5..0.5 -> 0..0.5 stays, 7.5..8 wraps.
    expect([onset(split, 'x'), length(split, 'x')]).toEqual([8, 0.5]);
    expect([onset(split, 'x~r1'), length(split, 'x~r1')]).toEqual([7, 0.5]);
    expect([onset(split, 'a'), length(split, 'a')]).toEqual([0, 0.5]);
    expect([onset(split, 'a~r1'), length(split, 'a~r1')]).toEqual([7.5, 0.5]);
  });

  it('wraps inside the selection span', () => {
    const after = ok(rotateInTime(base(), notes(['a', 'b'], { start: 0, end: 3 }), 2, 1));
    expect([onset(after, 'a'), onset(after, 'b'), onset(after, 'c')]).toEqual([2, 1, 4]);
    // a, rotated to 2..3, fits exactly; no split.
    expect(after.items).toHaveLength(3);
  });

  it('uses the grid unit exactly, triplets included, and a sixteenth for Auto', () => {
    const solo = () => clip([item('a', 0, 1, [6000])]);
    const triplet = ok(rotateInTime(solo(), none, 1, 2 / 3));
    expect(value(triplet, 'a').onset.quarterNotes).toEqual(rational(2, 3));
    const auto = ok(rotateInTime(solo(), none, 3, undefined));
    expect(onset(auto, 'a')).toBe(0.75);
  });

  it('a time selection stays inside its span: 1..5 with one step, the outside part of c stays', () => {
    const after = ok(rotateInTime(base(), time(1, 5), 1, 1));
    // b 2..3 -> 3..4. c (chord, 4..6) is cut at 5: its outside part 5..6 keeps the id and stays; the
    // inside part 4..5 moves to 5..6 which wraps to the span start: 1..2 (fresh id).
    expect([onset(after, 'b'), onset(after, 'c')]).toEqual([3, 5]);
    expect([onset(after, 'c'), length(after, 'c')]).toEqual([5, 1]);
    expect([onset(after, 'c~r1'), length(after, 'c~r1')]).toEqual([1, 1]);
    expect(pitches(after, 'c~r1')).toEqual([6000, 6400]);
    expect(onset(after, 'a')).toBe(0);
    expect(after.items).toHaveLength(4);
  });

  it('a chord split carries all its pitches, velocity and provenance to the wrapped piece', () => {
    const chord = item('k', 3.5, 1, [6000, 6400], 0.7);
    chord.provenance = [
      { sourceModuleInstance: 'm', sourceItemIds: ['s'], transformation: 'edit' },
    ];
    const after = ok(rotateInTime(frozenWith([chord]), none, 1, 1));
    // 4.5..5.5 stays whole (no crossing at 8): use a shift that crosses instead.
    expect(after.items).toHaveLength(1);
    const crossing = ok(rotateInTime(frozenWith([chord]), none, 7, 0.5));
    // 3.5 + 3.5 = 7..8 whole at the end (touches the end exactly): no split.
    expect([onset(crossing, 'k'), length(crossing, 'k')]).toEqual([7, 1]);
    const cut = ok(rotateInTime(frozenWith([chord]), none, 8, 0.5));
    // 3.5 + 4 = 7.5..8.5: 7.5..8 keeps the id, 0..0.5 is a fresh copy of the whole chord.
    expect(pitches(cut, 'k')).toEqual([6000, 6400]);
    expect(pitches(cut, 'k~r1')).toEqual([6000, 6400]);
    expect(value(cut, 'k~r1').velocity).toBe(0.7);
    expect(cut.items[1].provenance).toEqual(chord.provenance);
    expect([onset(cut, 'k'), length(cut, 'k'), onset(cut, 'k~r1'), length(cut, 'k~r1')]).toEqual([
      7.5, 0.5, 0, 0.5,
    ]);
  });

  it('a note longer than the span is cut at the edges, not refused; a split that leaves a sliver is refused', () => {
    const long = clip([item('l', 0, 4, [6000])]);
    const cut = ok(rotateInTime(long, time(0, 2), 1, 1));
    // 2..4 stays (keeps the id); the inside 0..2 is a whole span, so +1 splits it into 1..2 and 0..1.
    expect([onset(cut, 'l'), length(cut, 'l')]).toEqual([2, 2]);
    expect(soundOf(cut)).toBe(4);
    expect(cut.items).toHaveLength(3);
    const edge = frozenWith([item('x', 7, 1, [6000])]);
    // One 64th grid step times 63 puts x at 7.984375: the head would be a 1/64 piece.
    expect(refused(rotateInTime(edge, none, 63, 1 / 64))).toMatch(/minimum note length/);
  });

  it('zero steps return the same packet', () => {
    const before = base();
    expect(ok(rotateInTime(before, none, 0, 1))).toBe(before);
  });
});

describe('rotate in time: repeated presses stay in a stable span', () => {
  /** A clip frozen at length 8 first, then holding notes that may run past it. */
  const frozen = (...extra: DataItem<NoteEventValue>[]) => {
    const held = freezeClipProperties(clip([item('a', 0, 1, [6000])]));
    return { ...held, items: [...held.items, ...extra] };
  };

  it('with nothing selected, notes stay inside 0..clip length over a full cycle, sound conserved', () => {
    let state = { packet: frozen(item('b', 6.5, 1.5, [6400])), selection: none };
    const total = soundOf(state.packet);
    for (let press = 0; press < 8; press += 1) {
      state = rotateAgain(state.packet, state.selection, 1, 1);
      state.packet.items.forEach((entry) => {
        expect(onset(state.packet, entry.id)).toBeGreaterThanOrEqual(0);
        expect(onset(state.packet, entry.id) + length(state.packet, entry.id)).toBeLessThanOrEqual(
          8
        );
      });
      expect(soundOf(state.packet)).toBe(total);
    }
    // After a full cycle (8 steps of 1 in a span of 8) the sound is where it began: b sounds over
    // 6.5..8 (it may now be several touching pieces), a over 0..1.
    const sounding = (pitch: number, at: number) =>
      state.packet.items.some(
        (entry) =>
          pitches(state.packet, entry.id)[0] === pitch &&
          onset(state.packet, entry.id) <= at &&
          at < onset(state.packet, entry.id) + length(state.packet, entry.id)
      );
    for (let at = 0; at < 8; at += 0.25) {
      expect(sounding(6400, at)).toBe(at >= 6.5);
      expect(sounding(6000, at)).toBe(at < 1);
    }
  });

  it('with a note selection the span is the original one and pieces rotate with their notes', () => {
    const start = clip([item('a', 0, 1, [6000]), item('b', 2, 1, [6400]), item('c', 5, 1, [6700])]);
    let state = { packet: start, selection: notes(['a', 'b'], { start: 0, end: 3 }) };
    const seen: number[][] = [];
    for (let press = 0; press < 3; press += 1) {
      state = rotateAgain(state.packet, state.selection, 1, 1);
      seen.push([onset(state.packet, 'a'), onset(state.packet, 'b')]);
      expect(state.selection.range).toEqual({ start: 0, end: 3 });
    }
    // Wrapping inside 0..3 with step 1: (1,0), (2,1), (0,2) = home after three presses.
    expect(seen).toEqual([
      [1, 0],
      [2, 1],
      [0, 2],
    ]);
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

  it('the Aq Ah Ae selection rotated forward and back returns the same sound', () => {
    const start = clip([
      item('q', 0, 1, [6900]),
      item('h', 1, 2, [6900]),
      item('e', 3, 0.5, [6900]),
    ]);
    let state = { packet: start, selection: notes(['q', 'h', 'e']) };
    state = rotateAgain(state.packet, state.selection, 1, 1);
    state = rotateAgain(state.packet, state.selection, -1, 1);
    // The sound is conserved and back where it was, though h is now in two touching pieces.
    expect(soundOf(state.packet)).toBe(3.5);
    expect(onset(state.packet, 'q')).toBe(0);
    expect(onset(state.packet, 'h')).toBe(1);
    expect(onset(state.packet, 'e')).toBe(3);
    const covered = state.packet.items
      .filter((entry) => onset(state.packet, entry.id) >= 1 && onset(state.packet, entry.id) < 3)
      .reduce((sum, entry) => sum + length(state.packet, entry.id), 0);
    expect(covered).toBe(2);
  });

  it('a time selection keeps its own range over repeated presses, every press inside 1..5', () => {
    let state = {
      packet: base(),
      selection: time(1, 5) as Selection,
      session: null as RotationSessionCore | null,
    };
    const seenB: number[] = [];
    for (let press = 0; press < 4; press += 1) {
      state = rotateAgain(state.packet, state.selection, 1, 1, state.session);
      seenB.push(onset(state.packet, 'b'));
      state.packet.items.forEach((entry) => {
        const start = onset(state.packet, entry.id);
        const end = start + length(state.packet, entry.id);
        if (entry.id === 'a') {
          expect([start, end]).toEqual([0, 1]);
        } else if (entry.id === 'c' && press < 3) {
          // The part of c past the span end (5..6) stays where it was.
          expect([start, end]).toEqual([5, 6]);
        } else if (entry.id === 'c') {
          // After the fourth press c is the one original note again (4..6).
          expect([start, end]).toEqual([4, 6]);
        } else {
          expect(start).toBeGreaterThanOrEqual(1);
          expect(end).toBeLessThanOrEqual(5);
        }
      });
    }
    // b (length 1) steps through 3, 4, 1, 2 inside the span; c's inside part wraps with it.
    expect(seenB).toEqual([3, 4, 1, 2]);
    expect(state.packet.items).toEqual(base().items);
    expect(state.selection.range).toEqual({ start: 1, end: 5 });
  });
});

describe('rotate durations', () => {
  /** C quarter at 0, D half at 1, E eighth at 3 (pitches 6000, 6200, 6400). */
  const cde = () =>
    clip([item('c', 0, 1, [6000]), item('d', 1, 2, [6200]), item('e', 3, 0.5, [6400])]);
  const lengths = (p: DataPacket) => ['c', 'd', 'e'].map((id) => length(p, id));

  it('moves the durations later for a positive amount, pitches and onsets fixed (worked example)', () => {
    // Same convention as rotate values (+1 gives E quarter, C half, D eighth for the pitches):
    // slot i takes the duration of slot i - 1, so C gets E's eighth, D gets C's quarter, E gets D's half.
    const after = ok(rotateDurations(cde(), none, 1));
    expect(lengths(after)).toEqual([0.5, 1, 2]);
    expect(['c', 'd', 'e'].map((id) => pitches(after, id))).toEqual([[6000], [6200], [6400]]);
    expect(['c', 'd', 'e'].map((id) => onset(after, id))).toEqual([0, 1, 3]);
    expect(value(after, 'c').interOnset.quarterNotes).toEqual(rational(1, 2));
  });

  it('works backward, and a full cycle changes nothing (same packet)', () => {
    expect(lengths(ok(rotateDurations(cde(), none, -1)))).toEqual([2, 0.5, 1]);
    const before = cde();
    expect(ok(rotateDurations(before, none, 3))).toBe(before);
    expect(lengths(ok(rotateDurations(before, none, 4)))).toEqual([0.5, 1, 2]);
  });

  it('acts on the selection only, and a chord slot hands its durations over in order', () => {
    const sel = ok(rotateDurations(cde(), notes(['c', 'e']), 1));
    expect(lengths(sel)).toEqual([0.5, 2, 1]);
    const chorded = clip([
      item('p', 0, 1, [100]),
      item('q', 0, 2, [200]),
      item('r', 2, 0.5, [300]),
    ]);
    const after = ok(rotateDurations(chorded, none, 1));
    // Slots {p, q} and {r}: the chord slot takes r's duration for both; r takes p's (the first).
    expect(['p', 'q', 'r'].map((id) => length(after, id))).toEqual([0.5, 0.5, 1]);
  });
});

describe('chord slots in reverse order and rotate values', () => {
  const pair = () =>
    clip([
      item('p', 0, 1, [100], 0.2),
      item('q', 0, 0.5, [200], 0.4),
      item('r', 1, 2, [300], 0.6),
      item('s', 1, 1, [400], 0.8),
      item('far', 5, 1, [900]),
    ]);

  it('equal-size slots swap pitch by pitch and keep each item its own onset and duration', () => {
    const before = pair();
    const after = ok(reverseOrder(before, notes(['p', 'q', 'r', 's'])));
    expect(['p', 'q', 'r', 's'].map((id) => pitches(after, id))).toEqual([
      [300],
      [400],
      [100],
      [200],
    ]);
    expect(['p', 'q', 'r', 's'].map((id) => value(after, id).velocity)).toEqual([
      0.6, 0.8, 0.2, 0.4,
    ]);
    expect(['p', 'q', 'r', 's'].map((id) => length(after, id))).toEqual([1, 0.5, 2, 1]);
    expect(after.items[4]).toBe(before.items[4]);
    expect(pitches(after, 'far')).toEqual([900]);
  });

  it('unequal slots become one single-pitch item per incoming pitch, all with the longest duration', () => {
    const before = clip([
      item('p', 0, 1, [100], 0.2),
      item('q', 0, 2, [200], 0.4),
      item('r', 3, 1, [300], 0.6),
    ]);
    const after = ok(reverseOrder(before, none, counter('x')));
    // Slot {p, q} receives r's single pitch: p keeps its id with 300, the longest duration (2) and
    // r's velocity; q is removed. Slot {r} receives {100, 200}: r keeps its id with 100 and p's
    // velocity, a fresh item x1 at the same onset carries 200 with q's velocity; both last 1.
    expect(after.items.map((entry) => entry.id)).toEqual(['p', 'r', 'x1']);
    expect(pitches(after, 'p')).toEqual([300]);
    expect(length(after, 'p')).toBe(2);
    expect(value(after, 'p').velocity).toBe(0.6);
    expect(pitches(after, 'r')).toEqual([100]);
    expect(value(after, 'r').velocity).toBe(0.2);
    expect([onset(after, 'x1'), length(after, 'x1'), pitches(after, 'x1')]).toEqual([3, 1, [200]]);
    expect(value(after, 'x1').velocity).toBe(0.4);
    expect(length(after, 'r')).toBe(1);
    // No multi-pitch item was created.
    after.items.forEach((entry) => expect(pitches(after, entry.id)).toHaveLength(1));
  });

  it('the resulting selection is every note of the rebuilt slots: kept and created ids, never removed ones', () => {
    const before = clip([
      item('p', 0, 1, [100]),
      item('q', 0, 1, [200]),
      item('s', 0, 1, [250]),
      item('r', 3, 1, [300]),
      item('t', 3, 1, [350]),
    ]);
    const all = notes(['p', 'q', 's', 'r', 't']);
    for (const result of [
      reverseOrder(before, all, counter('x')),
      rotateValues(before, all, 1, counter('x')),
    ]) {
      const after = ok(result);
      const ids = result.ok && result.selection ? result.selection.ids : [];
      // Slots of 3 and 2 swapped: p, q keep their ids and s is removed; r, t keep theirs and one new.
      expect(ids.slice().sort()).toEqual(after.items.map((entry) => entry.id).sort());
      expect(ids).not.toContain('s');
      expect(ids).toContain('x1');
      expect(result.ok && result.selection?.range).toEqual({ start: 0, end: 4 });
    }
    // A time selection or nothing selected leaves the selection to the editor (it recomputes it).
    const timed = reverseOrder(before, time(0, 4), counter('x'));
    expect(timed.ok && timed.selection).toBeUndefined();
  });

  it('an existing multi-pitch item still moves as a unit between equal-size slots', () => {
    const before = clip([item('p', 0, 1, [100, 200]), item('r', 2, 1, [300])]);
    const after = ok(reverseOrder(before, none, counter('x')));
    expect(pitches(after, 'p')).toEqual([300]);
    expect(pitches(after, 'r')).toEqual([100, 200]);
    expect(after.items).toHaveLength(2);
  });

  it('rotate values moves chord slots as a unit; a rotation by the slot count changes nothing', () => {
    const before = pair();
    const after = ok(rotateValues(before, notes(['p', 'q', 'r', 's']), 1));
    expect(['p', 'q', 'r', 's'].map((id) => pitches(after, id))).toEqual([
      [300],
      [400],
      [100],
      [200],
    ]);
    expect(ok(rotateValues(before, notes(['p', 'q', 'r', 's']), 2))).toBe(before);
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
      'rotate-durations',
      'rotate-time',
      'legato',
      'transpose',
      'quantize',
      'duplicate',
      'invert',
      'equal-duration',
      'equal-velocity',
      'equal-pitch',
      'copy',
      'paste',
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

describe('rotate in time: zero steps', () => {
  it('returns the same packet: notes past the end or before a time selection are not folded', () => {
    const crossing = clip([item('a', 0, 1, [6000]), item('x', 7.5, 1, [6400])]);
    expect(ok(rotateInTime(crossing, none, 0, 1))).toBe(crossing);
    const before = base();
    expect(ok(rotateInTime(before, time(1, 5), 0, 1))).toBe(before);
    expect(ok(rotateInTime(before, notes(['a', 'b'], { start: 1, end: 3 }), 0, 1))).toBe(before);
    // Still refuses when there is nothing to act on, as every transform does.
    expect(refused(rotateInTime(clip([]), none, 0, 1))).toMatch(/no notes/);
  });
});

describe('guarded arithmetic', () => {
  it('turns a musical-time overflow into the "too fine" refusal', () => {
    const fine = clip([item('a', 0, 1, [6000])]);
    fine.items[0] = {
      ...fine.items[0],
      value: {
        ...(fine.items[0].value as NoteEventValue),
        onset: { quarterNotes: rational(Number.MAX_SAFE_INTEGER - 1, 3) },
      },
    };
    // Scaling a huge-numerator onset by 32767/32768 cannot be done exactly.
    expect(refused(scaleNotes(fine, none, rational(32767, 32768), 'whole'))).toMatch(/too fine/);
  });

  it('rethrows any other exception instead of calling it "too fine"', () => {
    const broken = base();
    broken.items[1] = {
      ...broken.items[1],
      value: {
        ...(broken.items[1].value as NoteEventValue),
        onset: { quarterNotes: undefined as unknown as ReturnType<typeof rational> },
      },
    };
    expect(() => legato(broken, none)).toThrow(TypeError);
  });
});

describe('invert', () => {
  it('mirrors around the middle of the lowest and highest pitch by default', () => {
    const after = ok(invertNotes(base(), none));
    expect(pitches(after, 'a')).toEqual([6400]);
    expect(pitches(after, 'b')).toEqual([6000]);
    // The chord C4 + E4 maps onto itself and keeps its order.
    expect(pitches(after, 'c')).toEqual([6000, 6400]);
    // Rhythm, velocity and ids are untouched.
    expect(after.items.map((entry) => entry.id)).toEqual(['a', 'b', 'c']);
    expect(['a', 'b', 'c'].map((id) => onset(after, id))).toEqual([0, 2, 4]);
  });

  it('mirrors around a picked pitch: new = 2 * axis - pitch, chords per pitch', () => {
    const after = ok(invertNotes(base(), none, 6000));
    expect(pitches(after, 'a')).toEqual([6000]);
    expect(pitches(after, 'b')).toEqual([5600]);
    expect(pitches(after, 'c')).toEqual([5600, 6000]);
    const above = ok(invertNotes(base(), none, 6200));
    expect(pitches(above, 'a')).toEqual([6400]);
    expect(pitches(above, 'b')).toEqual([6000]);
    expect(pitches(above, 'c')).toEqual([6000, 6400]);
  });

  it('preserves microtonal offsets (cents mirror exactly)', () => {
    const micro = clip([item('m', 0, 1, [6050]), item('n', 1, 1, [6130])]);
    const middle = ok(invertNotes(micro, none));
    expect([pitches(middle, 'm'), pitches(middle, 'n')]).toEqual([[6130], [6050]]);
    const picked = ok(invertNotes(micro, none, 6100));
    expect([pitches(picked, 'm'), pitches(picked, 'n')]).toEqual([[6150], [6070]]);
    // An odd midpoint (6050 and 6131: middle 6090.5) still lands on whole midicents.
    const odd = ok(invertNotes(clip([item('m', 0, 1, [6050]), item('n', 1, 1, [6131])]), none));
    expect([pitches(odd, 'm'), pitches(odd, 'n')]).toEqual([[6131], [6050]]);
  });

  it('acts on the selected notes only, and the middle is theirs', () => {
    const after = ok(invertNotes(base(), notes(['b', 'c'])));
    // Targets b (6400) and c (6000, 6400): middle 6200 -> b becomes 6000, c maps onto itself.
    expect(pitches(after, 'a')).toEqual([6000]);
    expect(pitches(after, 'b')).toEqual([6000]);
    expect(pitches(after, 'c')).toEqual([6000, 6400]);
    const timed = ok(invertNotes(base(), time(0, 3), 6000));
    expect([pitches(timed, 'a'), pitches(timed, 'b'), pitches(timed, 'c')]).toEqual([
      [6000],
      [5600],
      [6000, 6400],
    ]);
  });

  it('changes nothing for a single pitch around its own middle (same packet)', () => {
    const before = base();
    expect(ok(invertNotes(before, notes(['a'])))).toBe(before);
    expect(ok(invertNotes(before, none, 6200)).items).not.toBe(before.items);
  });

  it('refuses, changing nothing, when a result leaves 0..12700', () => {
    const before = base();
    expect(refused(invertNotes(before, none, 0))).toMatch(/off the keyboard/);
    expect(refused(invertNotes(clip([item('hi', 0, 1, [12600])]), none, 100))).toMatch(
      /off the keyboard/
    );
    expect(refused(invertNotes(before, none, Number.NaN))).toMatch(/axis/);
    // The edge itself is allowed: 0 mirrors to 12700 around 6350.
    const edge = ok(invertNotes(clip([item('lo', 0, 1, [0]), item('hi', 1, 1, [12700])]), none));
    expect([pitches(edge, 'lo'), pitches(edge, 'hi')]).toEqual([[12700], [0]]);
  });

  it('refuses on an empty clip', () => {
    expect(refused(invertNotes(clip([]), none))).toMatch(/no notes/);
  });
});

describe('parseNoteDuration and parseVelocityPercent', () => {
  it('reads plain numbers as quarter notes and fractions as note values, exactly', () => {
    const quarters = (input: string) => {
      const result = parseNoteDuration(input);
      return result.ok ? result.value : result.error;
    };
    expect(quarters('1')).toEqual(rational(1));
    expect(quarters('0.5')).toEqual(rational(1, 2));
    expect(quarters('1.5')).toEqual(rational(3, 2));
    expect(quarters('1/4')).toEqual(rational(1));
    expect(quarters('1/8')).toEqual(rational(1, 2));
    expect(quarters('1/16')).toEqual(rational(1, 4));
    expect(quarters('3/16')).toEqual(rational(3, 4));
    expect(quarters('1/3')).toEqual(rational(4, 3));
  });

  it('refuses nonsense, too short and too long, with a message', () => {
    for (const bad of ['', 'abc', '1/0', '-1', '1/', '1e3']) {
      expect(parseNoteDuration(bad).ok).toBe(false);
    }
    expect(parseNoteDuration('0.03').ok).toBe(false);
    expect(parseNoteDuration('1/32').ok).toBe(true);
    expect(parseNoteDuration('0')).toEqual({
      ok: false,
      error: 'A note cannot be shorter than 1/32 of a quarter note.',
    });
    expect(parseNoteDuration('288001').ok).toBe(false);
    expect(parseNoteDuration('288000').ok).toBe(true);
    expect(parseNoteDuration('99999999999999999999/3').ok).toBe(false);
  });

  it('reads velocity percents into 0..1, 1 to 100 only', () => {
    expect(parseVelocityPercent('80')).toEqual({ ok: true, value: 0.8 });
    expect(parseVelocityPercent('80%')).toEqual({ ok: true, value: 0.8 });
    expect(parseVelocityPercent(' 12.5 % ')).toEqual({ ok: true, value: 0.125 });
    expect(parseVelocityPercent(100)).toEqual({ ok: true, value: 1 });
    for (const bad of ['', '0', '101', '-5', 'loud', '1e1']) {
      expect(parseVelocityPercent(bad).ok).toBe(false);
    }
  });
});

describe('make all equal: duration', () => {
  it('defaults to the first target note (earliest onset) and keeps onsets', () => {
    const after = ok(makeEqualDuration(base(), none));
    expect(['a', 'b', 'c'].map((id) => length(after, id))).toEqual([1, 1, 1]);
    expect(['a', 'b', 'c'].map((id) => onset(after, id))).toEqual([0, 2, 4]);
    // The slot-matched inter-onset follows the length.
    expect(value(after, 'c').interOnset.quarterNotes).toEqual(rational(1));
    // First of a selection, not of the clip: b (1) beats c (2).
    expect(length(ok(makeEqualDuration(base(), notes(['c', 'b']))), 'c')).toBe(1);
    const longFirst = clip([item('x', 3, 0.5, [6000]), item('y', 1, 2, [6100])]);
    expect(length(ok(makeEqualDuration(longFirst, none)), 'x')).toBe(2);
  });

  it('uses a typed length exactly and leaves a custom inter-onset alone', () => {
    const custom = base();
    custom.items[0] = {
      ...custom.items[0],
      value: {
        ...(custom.items[0].value as NoteEventValue),
        interOnset: { quarterNotes: rational(3) },
      },
    };
    const after = ok(makeEqualDuration(custom, none, rational(1, 2)));
    expect(['a', 'b', 'c'].map((id) => value(after, id).duration.quarterNotes)).toEqual([
      rational(1, 2),
      rational(1, 2),
      rational(1, 2),
    ]);
    expect(value(after, 'a').interOnset.quarterNotes).toEqual(rational(3));
    expect(value(after, 'b').interOnset.quarterNotes).toEqual(rational(1, 2));
  });

  it('applies to a time selection and leaves the rest, and changes nothing when already equal', () => {
    const after = ok(makeEqualDuration(base(), time(3.5, 5), rational(1, 4)));
    expect(['a', 'b', 'c'].map((id) => length(after, id))).toEqual([1, 1, 0.25]);
    const equal = clip([item('a', 0, 1, [6000]), item('b', 2, 1, [6400])]);
    expect(ok(makeEqualDuration(equal, none))).toBe(equal);
  });

  it('refuses a length under the minimum', () => {
    expect(refused(makeEqualDuration(base(), none, rational(1, 64)))).toMatch(/shorter than 1\/32/);
  });
});

describe('make all equal: velocity', () => {
  const voiced = () =>
    clip([item('a', 0, 1, [6000], 0.5), item('b', 2, 1, [6400], 1), item('c', 4, 1, [6700], 0.25)]);
  const velocityOf = (p: DataPacket, id: string) => value(p, id).velocity;

  it('defaults to the first target note velocity', () => {
    const after = ok(makeEqualVelocity(voiced(), none));
    expect(['a', 'b', 'c'].map((id) => velocityOf(after, id))).toEqual([0.5, 0.5, 0.5]);
    const fromSelection = ok(makeEqualVelocity(voiced(), notes(['c', 'b'])));
    expect(['a', 'b', 'c'].map((id) => velocityOf(fromSelection, id))).toEqual([0.5, 1, 1]);
  });

  it('takes a typed value and acts on the selection only', () => {
    const after = ok(makeEqualVelocity(voiced(), notes(['a', 'c']), 0.8));
    expect(['a', 'b', 'c'].map((id) => velocityOf(after, id))).toEqual([0.8, 1, 0.8]);
    const before = voiced();
    expect(ok(makeEqualVelocity(before, notes(['a']), 0.5))).toBe(before);
  });

  it('refuses a velocity outside 1 to 100 percent', () => {
    expect(refused(makeEqualVelocity(voiced(), none, 0))).toMatch(/1 to 100/);
    expect(refused(makeEqualVelocity(voiced(), none, 1.5))).toMatch(/1 to 100/);
  });
});

describe('make all equal: pitch', () => {
  it('gives every target the picked pitch; a chord collapses to that single pitch', () => {
    const after = ok(makeEqualPitch(base(), none, 6200));
    expect(['a', 'b', 'c'].map((id) => pitches(after, id))).toEqual([[6200], [6200], [6200]]);
    expect(['a', 'b', 'c'].map((id) => onset(after, id))).toEqual([0, 2, 4]);
    expect(value(after, 'c').duration.quarterNotes).toEqual(rational(2));
  });

  it('acts on the selection only and never changes a note already on the pitch', () => {
    const after = ok(makeEqualPitch(base(), notes(['b']), 6000));
    expect([pitches(after, 'a'), pitches(after, 'b'), pitches(after, 'c')]).toEqual([
      [6000],
      [6000],
      [6000, 6400],
    ]);
    const before = clip([item('a', 0, 1, [6000])]);
    expect(ok(makeEqualPitch(before, none, 6000))).toBe(before);
  });

  it('refuses a pitch off the keyboard', () => {
    expect(refused(makeEqualPitch(base(), none, 12800))).toMatch(/keyboard/);
    expect(refused(makeEqualPitch(base(), none, -100))).toMatch(/keyboard/);
    expect(refused(makeEqualPitch(base(), none, Number.NaN))).toMatch(/keyboard/);
  });
});

/** An id source that counts: `prefix1`, `prefix2`, ... */
function counter(prefix: string) {
  let n = 0;
  return () => `${prefix}${(n += 1)}`;
}

describe('copy and paste', () => {
  const clipboardOf = (selection: Selection) => {
    const copied = copyToClipboard(base(), selection);
    if (!copied.ok) {
      throw new Error(copied.error);
    }
    return copied.clipboard;
  };

  it('copy refuses with nothing selected (it never copies the whole clip)', () => {
    expect(copyToClipboard(base(), none)).toEqual({
      ok: false,
      error: 'Select the notes to copy first.',
    });
    expect(copyToClipboard(base(), notes(['gone'])).ok).toBe(false);
  });

  it('copies the selected notes relative to the earliest, whole, chords and velocity included', () => {
    const source = base();
    source.items[2] = {
      ...source.items[2],
      provenance: [{ sourceModuleInstance: 'm', sourceItemIds: ['q'], transformation: 'edit' }],
    };
    const copied = copyToClipboard(source, notes(['c', 'b']));
    if (!copied.ok) {
      throw new Error(copied.error);
    }
    // In clip order, offsets from b's onset (2).
    expect(copied.clipboard.notes.map((note) => note.offset)).toEqual([rational(0), rational(2)]);
    expect(copied.clipboard.notes.map((note) => note.value.pitches)).toEqual([
      [6400],
      [6000, 6400],
    ]);
    expect(copied.clipboard.notes[1].value.duration.quarterNotes).toEqual(rational(2));
    expect(copied.clipboard.notes[1].provenance).toEqual(source.items[2].provenance);
    // The clipboard does not alias the clip.
    expect(copied.clipboard.notes[1].value.pitches).not.toBe(
      (source.items[2].value as NoteEventValue).pitches
    );
  });

  it('a time selection copies the overlapping notes whole, origin = span start', () => {
    // 1..5: a only touches at 1 (not a target); b 2..3 and c 4..6 overlap (c is not cut).
    const copied = copyToClipboard(base(), time(1, 5));
    if (!copied.ok) {
      throw new Error(copied.error);
    }
    expect(copied.clipboard.notes.map((note) => note.offset)).toEqual([rational(1), rational(3)]);
    expect(copied.clipboard.notes[1].value.duration.quarterNotes).toEqual(rational(2));
    // A note that began before the span pulls the origin back to its own onset: no negative offset.
    const early = copyToClipboard(base(), time(2.5, 3.5));
    if (!early.ok) {
      throw new Error(early.error);
    }
    expect(early.clipboard.notes.map((note) => note.offset)).toEqual([rational(0)]);
    expect(copyToClipboard(base(), time(3.2, 3.8)).ok).toBe(false);
  });

  it('pastes at the earliest selected note, with fresh collision-safe ids, and selects them', () => {
    const clipboard = clipboardOf(notes(['b', 'c']));
    let calls = 0;
    // The id source repeats an existing id first: the pasted note must not reuse it.
    const newId = () => (calls++ === 0 ? 'a' : `p${calls}`);
    const target = base();
    const result = pasteNotes(target, notes(['a']), clipboard, newId);
    if (!result.ok) {
      throw new Error(result.error);
    }
    const after = result.packet;
    expect(after.items.slice(0, 3)).toEqual(target.items);
    const added = after.items.slice(3);
    expect(added.map((entry) => entry.id)).toEqual(['a~1', 'p2']);
    expect(new Set(after.items.map((entry) => entry.id)).size).toBe(5);
    // Landed at a's onset (0): b-copy at 0 (length 1), chord copy at 2 (length 2).
    expect(
      added.map((entry) => rationalToNumber((entry.value as NoteEventValue).onset.quarterNotes))
    ).toEqual([0, 2]);
    expect((added[1].value as NoteEventValue).pitches).toEqual([6000, 6400]);
    expect(result.selection).toEqual({ ids: ['a~1', 'p2'], range: { start: 0, end: 4 } });
    expect(result.selection?.kind).toBeUndefined();
    // The clip length (frame) never grows.
    expect(after.frame).toEqual(target.frame);
  });

  it('pastes at a time selection start, and at the clip start with nothing selected', () => {
    const clipboard = clipboardOf(notes(['b', 'c']));
    const atTime = ok(pasteNotes(base(), time(3, 5), clipboard, counter('v')));
    expect(['v1', 'v2'].map((id) => onset(atTime, id))).toEqual([3, 5]);
    const atStart = ok(pasteNotes(base(), none, clipboard, counter('u')));
    expect(['u1', 'u2'].map((id) => onset(atStart, id))).toEqual([0, 2]);
  });

  it('keeps notes that land past the clip end and never grows the clip', () => {
    const clipboard = clipboardOf(notes(['b', 'c']));
    const target = base();
    const after = ok(pasteNotes(target, time(7, 8), clipboard, counter('w')));
    expect(['w1', 'w2'].map((id) => onset(after, id))).toEqual([7, 9]);
    expect(after.frame).toEqual(target.frame);
  });

  it('carries provenance to the pasted note and does not alias the clipboard', () => {
    const source = base();
    source.items[0] = {
      ...source.items[0],
      provenance: [{ sourceModuleInstance: 'm', sourceItemIds: ['q'], transformation: 'edit' }],
    };
    const copied = copyToClipboard(source, notes(['a']));
    if (!copied.ok) {
      throw new Error(copied.error);
    }
    const after = ok(pasteNotes(base(), none, copied.clipboard, () => 'z'));
    expect(after.items[3].provenance).toEqual(source.items[0].provenance);
    (after.items[3].value as NoteEventValue).pitches.push(1);
    expect(copied.clipboard.notes[0].value.pitches).toEqual([6000]);
  });

  it('refuses an empty clipboard', () => {
    expect(refused(pasteNotes(base(), none, null, () => 'x'))).toMatch(/clipboard is empty/);
    expect(refused(pasteNotes(base(), none, { notes: [] }, () => 'x'))).toMatch(
      /clipboard is empty/
    );
  });
});

describe('the second-pass registry actions', () => {
  const context = (selection: Selection = none) => ({
    selection,
    gridUnit: 1,
    newId: counter('r'),
  });

  it('registers invert, the three make-equal actions, copy and paste with their param kinds', () => {
    const ids = clipActionsOf(base()).map((action) => action.id);
    expect(ids.slice(-6)).toEqual([
      'invert',
      'equal-duration',
      'equal-velocity',
      'equal-pitch',
      'copy',
      'paste',
    ]);
    expect(clipActionById(base(), 'invert')?.params).toEqual([
      { id: 'axis', label: 'Axis', type: 'pick-pitch', optional: true },
    ]);
    expect(clipActionById(base(), 'equal-duration')?.params).toEqual([
      { id: 'duration', label: 'Length', type: 'duration', optional: true },
    ]);
    expect(clipActionById(base(), 'equal-velocity')?.params[0]).toMatchObject({ type: 'number' });
    expect(clipActionById(base(), 'equal-pitch')?.params[0]).toMatchObject({ type: 'pick-pitch' });
    expect(clipActionById(base(), 'equal-pitch')?.params[0].optional).toBeUndefined();
  });

  it('invert: no axis is the default, a picked pitch (midicents) is the axis', () => {
    const invert = clipActionById(base(), 'invert')!;
    expect(pitches(ok(invert.run(base(), context(), {})), 'a')).toEqual([6400]);
    expect(pitches(ok(invert.run(base(), context(), { axis: 6000 })), 'b')).toEqual([5600]);
    expect(pitches(ok(invert.run(base(), context(), { axis: '6000' })), 'b')).toEqual([5600]);
    expect(refused(invert.run(base(), context(), { axis: 'x' }))).toMatch(/axis/);
    expect(refused(invert.run(base(), context(), { axis: 99999 }))).toMatch(/axis/);
  });

  it('make equal: typed duration (grid fraction) and velocity, defaults when empty, required pitch', () => {
    const duration = clipActionById(base(), 'equal-duration')!;
    expect(length(ok(duration.run(base(), context(), { duration: '1/8' })), 'c')).toBe(0.5);
    expect(length(ok(duration.run(base(), context(), {})), 'c')).toBe(1);
    expect(refused(duration.run(base(), context(), { duration: 'abc' }))).toMatch(/quarter notes/);
    const velocity = clipActionById(base(), 'equal-velocity')!;
    expect(value(ok(velocity.run(base(), context(), { velocity: '40%' })), 'b').velocity).toBe(0.4);
    expect(refused(velocity.run(base(), context(), { velocity: '300' }))).toMatch(/1 to 100/);
    const pitch = clipActionById(base(), 'equal-pitch')!;
    expect(pitches(ok(pitch.run(base(), context(), { pitch: 7200 })), 'c')).toEqual([7200]);
    expect(refused(pitch.run(base(), context(), {}))).toMatch(/Pick a pitch/);
  });

  it('copy returns the clipboard and the same packet; paste reads it from the context', () => {
    const copy = clipActionById(base(), 'copy')!;
    const source = base();
    const copied = copy.run(source, context(notes(['a', 'b'])), {});
    if (!copied.ok) {
      throw new Error(copied.error);
    }
    expect(copied.packet).toBe(source);
    expect(copied.clipboard?.notes).toHaveLength(2);
    expect(copied.message).toBe('Copied 2 notes.');
    expect(refused(copy.run(source, context(), {}))).toMatch(/Select the notes/);
    const paste = clipActionById(base(), 'paste')!;
    expect(refused(paste.run(source, context(), {}))).toMatch(/clipboard is empty/);
    const pasted = paste.run(source, { ...context(), clipboard: copied.clipboard }, {});
    if (!pasted.ok) {
      throw new Error(pasted.error);
    }
    expect(pasted.packet.items).toHaveLength(5);
    expect(pasted.message).toBe('Pasted 2 notes.');
  });
});

describe('rotate in time: the rotation session (pieces rejoin, circular across presses)', () => {
  const aqhae = () =>
    clip([item('q', 0, 1, [6900]), item('h', 1, 2, [6900]), item('e', 3, 0.5, [6900])]);
  const start = () => ({
    packet: aqhae(),
    selection: notes(['q', 'h', 'e']) as Selection,
    session: null as RotationSessionCore | null,
  });
  const press = (state: ReturnType<typeof start>, amount: number) =>
    rotateAgain(state.packet, state.selection, amount, 0.5, state.session);

  it('a full cycle splits and rejoins notes and returns exactly to the start', () => {
    let state = start();
    const counts: number[] = [];
    const tails: string[][] = [];
    for (let step = 0; step < 7; step += 1) {
      state = press(state, 1);
      counts.push(state.packet.items.length);
      tails.push(state.packet.items.map((entry) => entry.id).filter((id) => id.includes('~')));
      state.packet.items.forEach((entry) => {
        expect(onset(state.packet, entry.id)).toBeGreaterThanOrEqual(0);
        expect(onset(state.packet, entry.id) + length(state.packet, entry.id)).toBeLessThanOrEqual(
          3.5
        );
      });
      expect(soundOf(state.packet)).toBe(3.5);
    }
    // h is cut at the end for shifts 1.0 to 2.0, q at 3.0; each is ONE note again once fully across.
    expect(counts).toEqual([3, 4, 4, 4, 3, 4, 3]);
    // The wrapped piece keeps one stable id across the presses it exists in.
    expect(tails.slice(1, 4)).toEqual([['h~r1'], ['h~r1'], ['h~r1']]);
    expect(tails[5]).toEqual(['q~r1']);
    // Back at the start: the very same notes, same ids, nothing left over.
    expect(state.packet.items).toEqual(aqhae().items);
    expect(state.selection.ids.slice().sort()).toEqual(['e', 'h', 'q']);
  });

  it('rotating back by the same total restores the original notes exactly', () => {
    let state = start();
    for (let step = 0; step < 4; step += 1) {
      state = press(state, 1);
    }
    expect(state.packet.items).toHaveLength(4);
    for (let step = 0; step < 4; step += 1) {
      state = press(state, -1);
    }
    expect(state.packet.items).toEqual(aqhae().items);
    // And past the start, backwards, splits at the start and rejoins on the way round.
    for (let step = 0; step < 7; step += 1) {
      state = press(state, -1);
      expect(soundOf(state.packet)).toBe(3.5);
    }
    expect(state.packet.items).toEqual(aqhae().items);
  });

  it('a bigger amount in one press is the same as that many single presses', () => {
    let single = start();
    for (let step = 0; step < 4; step += 1) {
      single = press(single, 1);
    }
    const jump = press(press(start(), 1), 3);
    expect(pattern(jump.packet)).toEqual(pattern(single.packet));
  });

  it('without a session (another edit ended it) the pieces stay separate notes', () => {
    let state = start();
    for (let step = 0; step < 3; step += 1) {
      state = press(state, 1);
    }
    expect(state.packet.items).toHaveLength(4);
    // Another edit ended the session: the editor passes none, and the pieces rotate as plain notes.
    let plain: ReturnType<typeof start> = { ...state, session: null };
    for (let step = 0; step < 4; step += 1) {
      plain = press(plain, 1);
    }
    expect(plain.packet.items).toHaveLength(4);
    expect(soundOf(plain.packet)).toBe(3.5);
  });

  it('a session for another grid or span is ignored', () => {
    let state = start();
    state = press(state, 1);
    state = press(state, 1);
    state = press(state, 1);
    expect(state.packet.items).toHaveLength(4);
    const otherGrid = rotateAgain(state.packet, state.selection, 1, 0.25, state.session);
    expect(otherGrid.packet.items).toHaveLength(5);
    const otherSpan = rotateAgain(
      state.packet,
      { ...state.selection, range: { start: 0, end: 4 } },
      1,
      0.5,
      state.session
    );
    expect(otherSpan.packet.items).toHaveLength(4);
  });

  it('a session whose originals are gone is ignored rather than resurrecting them', () => {
    const state = press(press(start(), 1), 1);
    const removed = {
      ...state.packet,
      items: state.packet.items.filter((entry) => entry.id !== 'q'),
    };
    const after = rotateAgain(removed, state.selection, 1, 0.5, state.session);
    expect(after.packet.items.some((entry) => entry.id === 'q')).toBe(false);
  });

  it('works for nothing selected (the clip span) and a time selection too', () => {
    const frozen = () =>
      frozenWith([item('a', 0, 1, [6000]), item('x', 3, 2, [6400]), item('y', 6.5, 1, [6700])]);
    let state = {
      packet: frozen(),
      selection: none as Selection,
      session: null as RotationSessionCore | null,
    };
    for (let step = 0; step < 16; step += 1) {
      state = rotateAgain(state.packet, state.selection, 1, 0.5, state.session);
      expect(soundOf(state.packet)).toBe(4);
    }
    // 16 half-steps = a full turn of the 8-quarter clip: the original notes, nothing split.
    expect(state.packet.items).toEqual(frozen().items);
    let timed = {
      packet: base(),
      selection: time(1, 7) as Selection,
      session: null as RotationSessionCore | null,
    };
    for (let step = 0; step < 2; step += 1) {
      timed = rotateAgain(timed.packet, timed.selection, 1, 3, timed.session);
      expect(timed.packet.items.length).toBeGreaterThanOrEqual(3);
    }
    // Two presses of 3 quarters in a 6-long span are one full turn: the original notes.
    expect(timed.packet.items).toEqual(base().items);
  });
});

describe('rotate in time: cut at the span edges, outside parts stay and re-merge', () => {
  type State = { packet: DataPacket; selection: Selection; session: RotationSessionCore | null };
  const begin = (current: DataPacket, selection: Selection): State => ({
    packet: current,
    selection,
    session: null,
  });
  const press = (state: State, amount: number, grid = 1): State =>
    rotateAgain(state.packet, state.selection, amount, grid, state.session);
  /** Whether anything sounds at `at` (a point inside a note). */
  const soundsAt = (current: DataPacket, at: number) =>
    current.items.some(
      (entry) =>
        onset(current, entry.id) <= at && at < onset(current, entry.id) + length(current, entry.id)
    );

  it('time selection with an edge-crossing note: +1 then -1 restores the packet exactly', () => {
    const original = base();
    let state = press(begin(original, time(1, 5)), 1);
    expect(state.packet.items).not.toEqual(original.items);
    state = press(state, -1);
    expect(state.packet.items).toEqual(original.items);
  });

  it('the part outside the span never moves or goes silent, and sound is conserved', () => {
    let state = begin(base(), time(1, 5));
    const total = soundOf(state.packet);
    for (let step = 0; step < 4; step += 1) {
      state = press(state, 1);
      expect(soundOf(state.packet)).toBe(total);
      // c's part over 5..6 and a over 0..1 are untouched on every press (the last press rejoins c).
      expect([0.25, 0.75, 5.25, 5.75].every((at) => soundsAt(state.packet, at))).toBe(true);
      expect(onset(state.packet, 'a')).toBe(0);
      if (step < 3) {
        expect([onset(state.packet, 'c'), length(state.packet, 'c')]).toEqual([5, 1]);
      }
    }
    // A full cycle (4 steps in a span of 4): the original packet.
    expect(state.packet.items).toEqual(base().items);
  });

  it('a note crossing the left edge keeps its outside part still too (+1 then -1 restores)', () => {
    const original = clip([item('w', 0.5, 1, [6000]), item('m', 2, 1, [6400])]);
    let state = press(begin(original, time(1, 5)), 1);
    // w's part over 0.5..1 stays (keeps the id); its inside part 1..1.5 moves to 2..2.5; m to 3..4.
    expect([onset(state.packet, 'w'), length(state.packet, 'w')]).toEqual([0.5, 0.5]);
    expect(onset(state.packet, 'm')).toBe(3);
    state = press(state, -1);
    expect(state.packet.items).toEqual(original.items);
  });

  it('a note over both edges: outside parts stay, the inside rotates, and it rejoins', () => {
    const original = clip([item('n', 0, 6, [6000])]);
    let state = press(begin(original, time(1, 5)), 1);
    expect(soundOf(state.packet)).toBe(6);
    expect([0.5, 5.5].every((at) => soundsAt(state.packet, at))).toBe(true);
    expect(state.packet.items.length).toBeGreaterThan(3);
    state = press(state, -1);
    expect(state.packet.items).toEqual(original.items);
    state = press(state, 4);
    expect(state.packet.items).toEqual(original.items);
  });

  it('nothing selected with a note past the clip end: that part stays, the rest rotates and rejoins', () => {
    const original = frozenWith([item('a', 0, 1, [6000]), item('x', 7.5, 1, [6400])]);
    let state = begin(original, none);
    for (let step = 0; step < 16; step += 1) {
      state = press(state, 1, 0.5);
      expect(soundOf(state.packet)).toBe(2);
      // 8..8.5 (past the clip end) is x's own part and never moves.
      expect(soundsAt(state.packet, 8.25)).toBe(true);
      // (The last press rejoins x into the one original note, which crosses the clip end again.)
      expect(
        step === 15 ||
          state.packet.items.every(
            (entry) =>
              onset(state.packet, entry.id) >= 8 ||
              onset(state.packet, entry.id) + length(state.packet, entry.id) <= 8
          )
      ).toBe(true);
    }
    expect(state.packet.items).toEqual(original.items);
    // Forward then back by the same total also restores it.
    state = press(press(begin(original, none), 3, 0.5), -3, 0.5);
    expect(state.packet.items).toEqual(original.items);
  });

  it('a note selection spans its own notes, so nothing is cut at the edges', () => {
    const original = clip([item('p', 0, 1, [6000]), item('q', 1, 2, [6400])]);
    const state = press(begin(original, notes(['p', 'q'])), 1, 1);
    // Pieces only come from wrapping at the selection's end (3), never from a cut at an edge.
    expect(soundOf(state.packet)).toBe(3);
    expect(state.packet.items.every((entry) => onset(state.packet, entry.id) >= 0)).toBe(true);
  });
});

describe('wholeWindows', () => {
  it('is an exact floor, also for negatives and near the safe-integer limit', () => {
    expect(wholeWindows(rational(7, 2), rational(1))).toBe(3);
    expect(wholeWindows(rational(-1, 4), rational(1))).toBe(-1);
    expect(wholeWindows(rational(-4), rational(2))).toBe(-2);
    expect(wholeWindows(rational(0), rational(5, 3))).toBe(0);
    // Float division gets this one wrong (5066549580372907 instead of ...906).
    const value = rational(9007199253996279);
    const span = rational(16, 9);
    expect(wholeWindows(value, span)).toBe(Number((9007199253996279n * 9n) / 16n));
  });
});

describe('a rest payload landing in a slot of another size', () => {
  const restSlots = () =>
    clip([item('r', 0, 1, []), item('p', 1, 1, [6000]), item('q', 1, 1, [6400])]);

  it('keeps one empty-pitch item at that onset instead of deleting the slot', () => {
    // Slots: {r} (a rest) and {p, q} (a chord). Reverse order swaps their payloads.
    const after = ok(reverseOrder(restSlots(), none, counter('n')));
    expect(pitches(after, 'r')).toEqual([6000]);
    // The chord slot took the rest: exactly one item left at 1, with no pitches.
    const atOne = after.items.filter((entry) => onset(after, entry.id) === 1);
    expect(atOne).toHaveLength(1);
    expect(pitches(after, atOne[0].id)).toEqual([]);
    expect(atOne[0].id).toBe('p');
    expect(length(after, 'p')).toBe(1);
  });

  it('a note selection ends up selecting exactly what is left (r also gains a fresh note)', () => {
    const result = reverseOrder(restSlots(), notes(['r', 'p', 'q']), counter('n'));
    expect(result.ok && result.selection?.ids.slice().sort()).toEqual(['n1', 'p', 'r']);
  });
});

describe('selection after an action on a chord (separate same-onset notes and a multi-pitch item)', () => {
  const chorded = () =>
    clip([
      item('x1', 0, 1, [6000]),
      item('x2', 0, 1, [6400]),
      item('x3', 0, 1, [6700]),
      item('m', 2, 1, [6000, 6400]),
    ]);
  const ids = (p: DataPacket) => p.items.map((entry) => entry.id);

  it('Reverse in time keeps every id and lets the editor keep the selection', () => {
    const result = reverseInTime(chorded(), notes(['x1', 'x2', 'x3']));
    expect(result.ok && result.selection).toBeUndefined();
    expect(ids(ok(result))).toEqual(ids(chorded()));
    const multi = reverseInTime(chorded(), notes(['m']));
    expect(multi.ok && multi.selection).toBeUndefined();
    expect(ids(ok(multi))).toEqual(ids(chorded()));
  });

  it('Invert (default axis) mirrors every chord note in place and keeps the selection', () => {
    const result = invertNotes(chorded(), notes(['x1', 'x2', 'x3']));
    expect(result.ok && result.selection).toBeUndefined();
    const after = ok(result);
    expect(ids(after)).toEqual(ids(chorded()));
    // The axis is the middle of 6000 and 6700 (6350): 6000 <-> 6700 and 6400 -> 6300.
    expect(['x1', 'x2', 'x3'].map((id) => pitches(after, id))).toEqual([[6700], [6300], [6000]]);
  });

  it('Paste with a chord selects exactly the pasted notes (fresh ids) and none of the originals', () => {
    const source = chorded();
    const copied = copyToClipboard(source, notes(['x1', 'x2', 'x3']));
    if (!copied.ok) {
      throw new Error(copied.error);
    }
    const result = pasteNotes(source, time(4, 5), copied.clipboard, counter('v'));
    if (!result.ok) {
      throw new Error(result.error);
    }
    const added = result.packet.items.filter((entry) => !ids(source).includes(entry.id));
    expect(added).toHaveLength(3);
    expect(result.selection?.ids.slice().sort()).toEqual(added.map((entry) => entry.id).sort());
    expect(added.every((entry) => onset(result.packet, entry.id) === 4)).toBe(true);
    // The multi-pitch item pastes as ONE item holding both pitches.
    const copiedItem = copyToClipboard(source, notes(['m']));
    if (!copiedItem.ok) {
      throw new Error(copiedItem.error);
    }
    const single = pasteNotes(source, none, copiedItem.clipboard, counter('w'));
    expect(single.ok && single.selection?.ids).toHaveLength(1);
  });
});
