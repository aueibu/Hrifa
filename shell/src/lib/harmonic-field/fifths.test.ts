import { describe, expect, it } from 'vitest';
import { FIFTH_CENTS, fifthsLayout, fmtRatio, parseInterval, type Note } from './index';

const c = (s: string) => (parseInterval(s) as Note).c;

describe('fifthsLayout', () => {
  it('is the circle of fifths in 12-EDO: step s holds pitch class 7s mod 12, offsets 0', () => {
    const notes = Array.from({ length: 12 }, (_, k) => ({ c: k * 100 }));
    const L = fifthsLayout(notes, { gen: 700 });
    expect(L.lo).toBe(-5);
    expect(L.hi).toBe(6);
    L.notes.forEach((p, k) => {
      expect((((7 * p.step) % 12) + 12) % 12).toBe(k);
      expect(p.offset).toBeCloseTo(0, 9);
      expect(p.offChain).toBe(false);
      expect(p.stack).toBe(0);
    });
    // C at the top, G one slot clockwise, F one slot anticlockwise
    expect(L.notes[0].turn).toBe(0);
    expect(L.notes[7].turn).toBeCloseTo(1 / 12, 12);
    expect(L.notes[5].turn).toBeCloseTo(11 / 12, 12);
  });

  it('places just notes against the 3/2 chain: 5/4 at +4 (-21.51 c), 9/8 at +2 (0 c), 7/4 at -2 (-27.26 c)', () => {
    const L = fifthsLayout([{ c: c('5/4') }, { c: c('9/8') }, { c: c('7/4') }, { c: c('3/2') }]);
    expect(L.notes[0].step).toBe(4);
    expect(L.notes[0].offset).toBeCloseTo(-21.5064, 3);
    expect(L.notes[1].step).toBe(2);
    expect(L.notes[1].offset).toBeCloseTo(0, 9);
    expect(L.notes[2].step).toBe(-2);
    expect(L.notes[2].offset).toBeCloseTo(968.8259 - 996.09, 3);
    expect(L.notes[3].step).toBe(1);
    expect(FIFTH_CENTS).toBeCloseTo(701.955, 3);
  });

  it('stacks notes that share a step and marks notes more than half a slot from every step as off-chain', () => {
    const L = fifthsLayout([{ c: c('9/8') }, { c: 204 }, { c: 205 }, { c: c('11/8') }]);
    expect(L.notes.slice(0, 3).map((p) => p.stack)).toEqual([0, 1, 2]);
    expect(L.notes[3].offChain).toBe(true);
    expect(L.notes[0].offChain).toBe(false);
    expect(fmtRatio(parseInterval('11/8') as Note)).toBe('11/8');
  });

  it('supports other chain lengths', () => {
    const L = fifthsLayout([{ c: 0 }], { steps: 19, gen: 1200 * (11 / 19) });
    expect(L.positions).toHaveLength(19);
    expect(L.lo).toBe(-9);
    expect(L.hi).toBe(9);
  });
});

describe('fifthsLayout guards', () => {
  it('falls back to defaults for a NaN, zero or negative period, a NaN generator or a NaN chain length', () => {
    const base = fifthsLayout([{ c: c('5/4') }]);
    for (const opts of [
      { period: Number.NaN },
      { period: 0 },
      { period: -1200 },
      { gen: Number.NaN },
      { steps: Number.NaN },
      { steps: Number.POSITIVE_INFINITY },
    ]) {
      const L = fifthsLayout([{ c: c('5/4') }], opts);
      expect(L.positions).toHaveLength(12);
      expect(Number.isFinite(L.notes[0].offset)).toBe(true);
      expect(L.notes[0].step).toBe(base.notes[0].step);
      expect(L.positions.every((p) => Number.isFinite(p.cents) && Number.isFinite(p.turn))).toBe(
        true
      );
    }
  });
});
