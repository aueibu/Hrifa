import { describe, expect, it } from 'vitest';
import { fieldMarks, liveCurveStep, liveRoughness } from './liveRoughness';
import { scoreRoughness } from './scorersMore';
import { dissonanceAt } from './visual';

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

describe('fieldMarks (faint field notes on the live curve)', () => {
  const edo12 = Array.from({ length: 12 }, (_, i) => i * 100);
  it('lowest note at 400 c: the unison, the 300 c note lands 1100 c above, the 100 c note 900 c above, and none are drawn twice', () => {
    const m = fieldMarks(edo12, [400], C4);
    const at = (iv: number) => m.find((x) => Math.abs(x.interval - iv) < 1e-9);
    expect(m).toHaveLength(11); // the shown note itself (the unison) is the chord's own mark
    expect(at(0)).toBeUndefined();
    expect(at(1100)?.idx).toBe(3);
    expect(at(900)?.idx).toBe(1);
    expect(at(100)?.idx).toBe(5);
    expect(m.every((x) => x.interval >= 0 && x.interval < 1200)).toBe(true);
  });
  it('0 and a repeat are one unison mark: a field note an octave above the lowest note is the lowest note', () => {
    const m = fieldMarks([50, 1250, 750], [50], C4);
    expect(m.map((x) => x.interval)).toEqual([700]);
  });
  it('reduces into a custom repeat and carries the pair roughness', () => {
    const m = fieldMarks([0, 1500], [300], C4, 1900);
    expect(m.map((x) => x.interval)).toEqual([1600, 1200]);
    expect(m[1].roughness).toBe(dissonanceAt(1200, C4 * 2 ** (300 / 1200)));
  });
  it('nothing shown: no marks; chord notes (even an octave up) are not repeated', () => {
    expect(fieldMarks(edo12, [], C4)).toEqual([]);
    expect(fieldMarks(edo12, [0, 1900], C4).map((x) => x.interval)).not.toContain(700);
  });
});
