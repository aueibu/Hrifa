import {
  accumulateArrivals,
  buildPointField,
  catMapPeriod,
  catStep,
  computeTrajectories,
  matrixBijective,
  mod,
  seedPoints,
} from './pointPlacement';

describe('mod', () => {
  it('returns a non-negative representative for negative inputs', () => {
    expect(mod(-1, 8)).toBe(7);
    expect(mod(9, 8)).toBe(1);
  });
});

describe('seedPoints', () => {
  it('sums structural weight to the raw source-point count', () => {
    const { points, rawPointCount, trueGroupCount } = seedPoints('tetrahedron', 32, {
      vertices: true,
      edges: false,
      faces: false,
    });
    expect(rawPointCount).toBe(4); // tetrahedron has 4 vertices
    const totalWeight = points.reduce((sum, p) => sum + p.weight, 0);
    expect(totalWeight).toBe(rawPointCount);
    // trueGroupCount is N-independent and cannot exceed the raw count.
    expect(trueGroupCount).toBeLessThanOrEqual(rawPointCount);
  });

  it('produces no points when every source type is disabled', () => {
    const { points, rawPointCount } = seedPoints('cube', 32, {
      vertices: false,
      edges: false,
      faces: false,
    });
    expect(rawPointCount).toBe(0);
    expect(points).toHaveLength(0);
  });
});

describe('matrixBijective', () => {
  it('reports the Arnold cat map as bijective on any grid', () => {
    const diag = matrixBijective({ a: 1, b: 1, c: 1, d: 2 }, 32);
    expect(diag.det).toBe(1);
    expect(diag.bijective).toBe(true);
  });

  it('flags a determinant that shares a factor with N as non-bijective', () => {
    const diag = matrixBijective({ a: 2, b: 0, c: 0, d: 2 }, 4);
    expect(diag.det).toBe(4);
    expect(diag.detModN).toBe(0);
    expect(diag.bijective).toBe(false);
  });
});

describe('catStep', () => {
  it('applies the matrix modulo N', () => {
    expect(catStep(1, 0, 5, { a: 1, b: 1, c: 1, d: 2 })).toEqual([1, 1]);
    expect(catStep(3, 4, 5, { a: 1, b: 1, c: 1, d: 2 })).toEqual([2, 1]);
  });
});

describe('accumulateArrivals', () => {
  it('unions cells across the whole history and sums weight per visit', () => {
    const seeds = [
      { u: 0, v: 0, weight: 2, members: [], resolutionMerged: false, structuralGroups: 1 },
      { u: 1, v: 1, weight: 1, members: [], resolutionMerged: false, structuralGroups: 1 },
    ];
    // Identity matrix: every frame is identical, so each cell is revisited each step.
    const frames = computeTrajectories(seeds, 3, 8, { a: 1, b: 0, c: 0, d: 1 });
    const arrivals = accumulateArrivals(frames);
    const origin = arrivals.find((a) => a.u === 0 && a.v === 0)!;
    expect(origin.visits).toBe(4); // t = 0..3
    expect(origin.weight).toBe(8); // weight 2 counted at each of 4 frames
    expect(arrivals).toHaveLength(2);
  });
});

describe('catMapPeriod', () => {
  it('finds the period of the identity immediately', () => {
    expect(catMapPeriod(8, { a: 1, b: 0, c: 0, d: 1 }, 100)).toBe(1);
  });

  it('returns null for a non-bijective matrix (no period exists)', () => {
    expect(catMapPeriod(4, { a: 2, b: 0, c: 0, d: 2 }, 50)).toBeNull();
  });
});

describe('buildPointField', () => {
  it('returns the seed layer unchanged at the seed selection', () => {
    const field = buildPointField(
      'cube',
      32,
      { vertices: true, edges: false, faces: false },
      10,
      { a: 1, b: 1, c: 1, d: 2 },
      'seed'
    );
    expect(field.points.length).toBe(field.seedCount);
  });

  it('accumulates at least as many cells as the seed layer', () => {
    const opts = { vertices: true, edges: true, faces: false };
    const matrix = { a: 1, b: 1, c: 1, d: 2 };
    const seed = buildPointField('cube', 48, opts, 12, matrix, 'seed');
    const accumulated = buildPointField('cube', 48, opts, 12, matrix, 'accumulated');
    expect(accumulated.points.length).toBeGreaterThanOrEqual(seed.points.length);
  });

  it('yields an empty field for an unknown solid', () => {
    const field = buildPointField(
      'not-a-solid',
      32,
      { vertices: true, edges: false, faces: false },
      0,
      { a: 1, b: 1, c: 1, d: 2 },
      'seed'
    );
    expect(field.points).toHaveLength(0);
  });
});
