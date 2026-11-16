import { describe, expect, it } from 'vitest';
import { liveCurveStep, liveRoughness } from './liveRoughness';
import { scoreRoughness } from './scorersMore';

const C4 = 261.6256;
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.01);
const NO_CURVE = { step: 600 };

describe('liveRoughness (confirmed scenarios, 12-EDO, lowest note 261.6256 Hz)', () => {
  it('a: C G B = 0, 700, 1100 c', () => {
    const r = liveRoughness([0, 700, 1100], C4, NO_CURVE);
    near(r.total, 4.79);
    const p = (i: number, j: number) => r.pairs.find((x) => x.i === i && x.j === j)!.roughness;
    near(p(0, 1), 0.91);
    near(p(0, 2), 2.04);
    near(p(1, 2), 1.71);
  });
  it('b: C F# Ab = 0, 600, 800 c; F#-Ab is the biggest pair', () => {
    const r = liveRoughness([0, 600, 800], C4, NO_CURVE);
    near(r.total, 6.7);
    const by = r.pairs.map((x) => x.roughness);
    near(by[0], 2.17);
    near(by[1], 1.94);
    near(by[2], 2.46);
    expect(Math.max(...by)).toBe(by[2]);
  });
  it('c: C E G = 0, 400, 700 c; C G B < C E G < C F# Ab', () => {
    const cEG = liveRoughness([0, 400, 700], C4, NO_CURVE).total;
    near(cEG, 5.43);
    expect(liveRoughness([0, 700, 1100], C4, NO_CURVE).total).toBeLessThan(cEG);
    expect(cEG).toBeLessThan(liveRoughness([0, 600, 800], C4, NO_CURVE).total);
  });
  it('f: one note is its own self term, with no pairs, and still has a curve', () => {
    const r = liveRoughness([0], C4, { step: 100 });
    expect(r.pairs).toEqual([]);
    expect(r.total).toBe(r.self[0]);
    expect(r.curve.cents).toHaveLength(13);
  });
  it('no notes: zeros and an empty curve', () => {
    const r = liveRoughness([], C4);
    expect(r.total).toBe(0);
    expect(r.curve.cents).toEqual([]);
  });
  it('g: the curve value at x equals scoreRoughness of the chord plus a tone at x', () => {
    const cents = [0, 386.3, 701.96];
    const r = liveRoughness(cents, C4, { step: 25 });
    const hz = cents.map((c) => C4 * 2 ** (c / 1200));
    for (const k of [0, 5, 16, 30, 48]) {
      const x = r.curve.cents[k];
      const want = scoreRoughness([...hz, C4 * 2 ** (x / 1200)]).score;
      expect(Math.abs(r.curve.values[k] - want)).toBeLessThan(1e-9);
    }
  });
  it('the curve is measured above the lowest note, whatever the input order', () => {
    const a = liveRoughness([700, 0], C4, { step: 100 });
    const b = liveRoughness([0, 700], C4, { step: 100 });
    a.curve.values.forEach((v, k) => expect(Math.abs(v - b.curve.values[k])).toBeLessThan(1e-9));
  });
});

describe('liveCurveStep', () => {
  it('is 1 c for one note and grows with the notes; the curve always ends at the repeat', () => {
    expect(liveCurveStep(1)).toBe(1);
    expect(liveCurveStep(8)).toBe(6);
    const r = liveRoughness([0, 700, 1100, 400, 200, 900, 300, 100], C4);
    expect(r.curve.cents[1] - r.curve.cents[0]).toBe(6);
    expect(r.curve.cents[r.curve.cents.length - 1]).toBe(1200);
  });
});
