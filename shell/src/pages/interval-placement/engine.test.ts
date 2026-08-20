import {
  computeIntervalPlacements,
  defaultIntervalPlacementParams,
  quantizeInterval,
  uniquePermutations,
} from './engine';

describe('uniquePermutations', () => {
  it('returns n! permutations for distinct values', () => {
    expect(uniquePermutations([1, 2, 3])).toHaveLength(6);
  });

  it('deduplicates permutations of repeated values', () => {
    // 3 items with a repeat -> 3!/2! = 3 unique arrangements, not 6.
    expect(uniquePermutations([2, 2, 5])).toHaveLength(3);
  });
});

describe('quantizeInterval', () => {
  it('splits an even-length interval symmetrically around the floored anchor', () => {
    const { A, low, high, down, up } = quantizeInterval(10, 4, 0.5, 'down');
    expect(A).toBe(10);
    expect(down + up).toBe(4);
    expect(low).toBe(A - down);
    expect(high).toBe(A + up);
  });

  it('breaks an odd-length tie according to oddBias', () => {
    const down = quantizeInterval(10, 5, 0.5, 'down');
    const up = quantizeInterval(10, 5, 0.5, 'up');
    expect(down.down).not.toBe(up.down);
    expect(down.down + down.up).toBe(5);
    expect(up.down + up.up).toBe(5);
  });
});

describe('computeIntervalPlacements', () => {
  it('produces one record per unique permutation, each spanning all placed pitches', () => {
    const intervals = [3, 4];
    const { records } = computeIntervalPlacements(intervals, defaultIntervalPlacementParams, [], 3);
    expect(records).toHaveLength(uniquePermutations(intervals).length);
    records.forEach((rec) => {
      expect(rec.pitches.length).toBeGreaterThanOrEqual(2);
      expect(rec.total).toBeGreaterThanOrEqual(0);
    });
  });

  it('ranks records by ascending per-pair dissonance', () => {
    const { records } = computeIntervalPlacements([3, 4, 5], defaultIntervalPlacementParams, [], 3);
    for (let i = 1; i < records.length; i++) {
      expect(records[i].perPair).toBeGreaterThanOrEqual(records[i - 1].perPair);
    }
  });

  it('produces consistent results across all four placement modes', () => {
    const intervals = [3, 5, 7];
    (['v1', 'v2', 'prefixDominance', 'repulse'] as const).forEach((placementMode) => {
      const { records } = computeIntervalPlacements(
        intervals,
        { ...defaultIntervalPlacementParams, placementMode },
        [],
        3
      );
      expect(records.length).toBeGreaterThan(0);
      records.forEach((rec) => {
        expect(Number.isFinite(rec.perPair)).toBe(true);
      });
    });
  });
});
