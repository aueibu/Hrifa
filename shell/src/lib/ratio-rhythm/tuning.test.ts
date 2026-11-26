import { describe, expect, it } from 'vitest';
import { modeTable } from './modes';
import { parseRatios } from './ratios';
import { logRing, linearRing } from './ring';
import {
  anchoredPairMinGrid,
  bitsLost,
  gridsKeepingAll,
  keepsAll,
  pairKept,
  quantize,
  ratioSteps,
  scanPairMinGrid,
  temperedOut,
  valOf,
} from './tuning';

const example = parseRatios('1/1 10/9 9/8 5/4 3/2').ratios;
const ring = linearRing(example)!;
const comma = { n: 81n, d: 80n };

describe('vals and tempering', () => {
  it('val of 2, 3, 5 in 12 and 53', () => {
    expect([2, 3, 5, 7].map((p) => valOf(p, 12))).toEqual([12, 19, 28, 34]);
    expect([2, 3, 5].map((p) => valOf(p, 53))).toEqual([53, 84, 123]);
    // 31 x log2(11) = 107.24
    expect(valOf(11, 31)).toBe(107);
  });
  // Steps are signed (sum of exponent x val over n/d, so 81/80 is +1 when it stays open).
  it.each([7, 12, 17, 19, 24, 31].filter((N) => N !== 17))('81/80 is 0 steps in %i', (N) => {
    expect(ratioSteps(comma, N)).toBe(0);
    expect(temperedOut(comma, N)).toBe(true);
  });
  it.each([22, 29, 41, 53])('81/80 is 1 step in %i', (N) => {
    expect(ratioSteps(comma, N)).toBe(1);
  });
  it('the inverse comma has the opposite sign', () => {
    expect(ratioSteps({ n: 80n, d: 81n }, 53)).toBe(-1);
  });
  it('canon list vs the patent val: 17 gives 1 step on the val', () => {
    expect(ratioSteps(comma, 17)).toBe(1);
  });
  it('the log ring merges 10/9 and 9/8 exactly where the canon says (rounding, 17 included)', () => {
    const merged = (N: number) => logRing(example, N).onsets.length === 4;
    for (const N of [7, 12, 17, 19, 24, 31]) {
      expect(merged(N), `N ${N}`).toBe(true);
    }
    for (const N of [22, 29, 41, 53]) {
      expect(merged(N), `N ${N}`).toBe(false);
    }
  });
});

describe('quantization 72 to 16', () => {
  const q = quantize(ring, 16);
  it('targets 0, 2, 2, 4, 8; 0.4 bits lost; 4 of 5 exact', () => {
    expect(q.targets).toEqual([0, 2, 2, 4, 8]);
    expect(q.bitsLost).toBeCloseTo(0.4, 10);
    expect(q.exactCount).toBe(4);
    expect(q.exact).toEqual([true, false, true, true, true]);
    expect(q.distinct).toBe(4);
  });
  it('displacement: 10/9 moved 1/72 of the cycle', () => {
    expect(q.totalDisplacement).toBeCloseTo(1 / 72, 12);
    expect(q.rmsDisplacement).toBeCloseTo(Math.sqrt(1 / 72 ** 2 / 5), 12);
    expect(q.errors[1]).toBeCloseTo(-1 / 72, 12);
  });
  it('bitsLost of a list of targets', () => {
    expect(bitsLost([0, 0, 0, 0])).toBeCloseTo(2, 10);
    expect(bitsLost([0, 1, 2])).toBe(0);
  });
});

describe('anchored pair rule N > L / (2d)', () => {
  it('formula: 10/9 mode needs 41, 9/8 mode needs 21', () => {
    expect(anchoredPairMinGrid(80, 1)).toBe(41);
    expect(anchoredPairMinGrid(81, 2)).toBe(21);
  });
  it('the scan agrees', () => {
    expect(scanPairMinGrid(80, 1)).toBe(41);
    expect(scanPairMinGrid(81, 2)).toBe(21);
  });
  it('the pair holds for every N above the threshold and fails at and below it', () => {
    for (const [L, d] of [
      [80, 1],
      [81, 2],
    ]) {
      const t = anchoredPairMinGrid(L, d);
      for (let N = 2; N <= L; N++) {
        const kept = pairKept(L, 0, d, N, 'up') && pairKept(L, 0, d, N, 'down');
        expect(kept, `L ${L} d ${d} N ${N}`).toBe(N >= t);
      }
    }
  });
});

describe('grids that keep all five onsets in every mode', () => {
  const rings = modeTable(example).map((m) => m.ring);
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const expected = [46, 48, 54, ...range(55, 58), ...range(61, 67), ...range(69, 72)];
  it('scan N from 5 to 72 with the both-ways tie rule', () => {
    expect(gridsKeepingAll(rings, 5, 72)).toEqual(expected);
  });
  it('53 keeps them only with ties rounding up', () => {
    expect(gridsKeepingAll(rings, 53, 53, 'up')).toEqual([53]);
    expect(gridsKeepingAll(rings, 53, 53, 'down')).toEqual([]);
    expect(gridsKeepingAll(rings, 53, 53)).toEqual([]);
  });
  it('keepsAll on one ring', () => {
    expect(keepsAll(ring, 16, 'up')).toBe(false);
    expect(keepsAll(ring, 72, 'up')).toBe(true);
  });
});
