import { describe, expect, it } from 'vitest';
import {
  HE_RATIOS_PER_LIMIT,
  estimateHeBuildMs,
  formatBuildMs,
  heAt,
  heCandidates,
  heCurve,
  heCurveAt,
  heRange,
} from './harmonicEntropy';

const dips = (curve: Float64Array): number[] =>
  Array.from(curve.keys()).filter(
    (i) => i > 0 && i < curve.length - 1 && curve[i] < curve[i - 1] && curve[i] <= curve[i + 1]
  );
const hasDipNear = (d: number[], c: number, tol = 1) => d.some((x) => Math.abs(x - c) <= tol);

const c10 = heCandidates(10000);
const c30 = heCandidates(30000);
const curve30 = heCurve(c30, 17);

describe('candidates', () => {
  it('counts the reduced ratios in range (the measured 3,167 and 9,474)', () => {
    expect(c10.cents.length).toBe(3167);
    expect(c30.cents.length).toBe(9474);
    expect(c30.cents[0]).toBeGreaterThanOrEqual(-300);
    expect(c30.cents[c30.cents.length - 1]).toBeLessThanOrEqual(1500);
    expect(c30.cents.every((c, i) => i === 0 || c >= c30.cents[i - 1])).toBe(true);
  });
  it('the build estimate fits the ratio count (0.316 per unit of limit)', () => {
    expect(c10.cents.length / 10000).toBeCloseTo(HE_RATIOS_PER_LIMIT, 2);
    expect(c30.cents.length / 30000).toBeCloseTo(HE_RATIOS_PER_LIMIT, 2);
    expect(estimateHeBuildMs(30000, 0.01)).toBeCloseTo(94.8, 1);
    // N ln N: 500k costs more than 500/30 times the 30k build
    const ratio = estimateHeBuildMs(500000, 0.01) / estimateHeBuildMs(30000, 0.01);
    expect(ratio).toBeCloseTo((500 / 30) * (Math.log(500000) / Math.log(30000)), 6);
    expect(ratio).toBeGreaterThan(500 / 30);
    expect(formatBuildMs(50)).toBe('under 0.1 s');
    expect(formatBuildMs(300)).toBe('about 0.3 s');
    expect(formatBuildMs(2400)).toBe('about 2.4 s');
  });
});

describe('the curve', () => {
  it('has dips at 702, 498 and 386 at s 17, N 30k, and 0 c is lower than 50 c', () => {
    expect(curve30.length).toBe(1201);
    const d = dips(curve30);
    for (const c of [702, 498, 386]) {
      expect(hasDipNear(d, c)).toBe(true);
    }
    expect(curve30[0]).toBeLessThan(curve30[50]);
  });
  it('3/2 exact matches the curve at 702 and the interpolation between points', () => {
    const exact = heAt(c30, 1200 * Math.log2(1.5), 17);
    expect(Math.abs(heCurve(c30, 17)[702] - heAt(c30, 702, 17))).toBeLessThan(1e-9);
    expect(Math.abs(exact - curve30[702])).toBeLessThan(0.001);
    expect(heCurveAt(curve30, 702.5)).toBeCloseTo((curve30[702] + curve30[703]) / 2, 12);
  });
  it('folds intervals outside 0..1200 c into the octave', () => {
    expect(heAt(c30, 1200 + 386.3, 17)).toBeCloseTo(heAt(c30, 386.3, 17), 12);
    expect(heAt(c30, -813.7, 17)).toBeCloseTo(heAt(c30, 386.3, 17), 12);
    expect(heCurveAt(curve30, 1900)).toBeCloseTo(heCurveAt(curve30, 700), 12);
  });
  it('11/8 (551 c) is a dip at s 12 and not at s 17 (N 10k)', () => {
    expect(hasDipNear(dips(heCurve(c10, 12)), 551, 2)).toBe(true);
    expect(hasDipNear(dips(heCurve(c10, 17)), 551, 2)).toBe(false);
  });
  it('range gives the curve min and max', () => {
    const r = heRange(curve30);
    expect(r.min).toBe(Math.min(...curve30));
    expect(r.max).toBe(Math.max(...curve30));
    expect(r.min).toBeLessThan(r.max);
  });
});
