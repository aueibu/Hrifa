import {
  angleBetween,
  type GrowthParams,
  nearestDistinctRadii,
  runAlgorithm,
  torDelta,
} from './growthEngine';
import type { FieldPoint } from './pointPlacement';

const baseParams: GrowthParams = {
  wrap: true,
  qFormula: 'OP',
  childFormula: 'P',
  maxDepth: 12,
  searchMode: 'widen',
  stepDeg: 10,
  maxDeg: 50,
  excludeDeg: 20,
  spanDeg: 90,
  annealed: false,
  excludeVisited: false,
  maxBranches: 1,
  branchDensity: 0.125,
  shareVisited: false,
};

describe('torDelta', () => {
  it('uses the minimum image on the torus when wrap is on', () => {
    expect(torDelta(0, 0, 7, 0, 8, true)).toEqual({ x: -1, y: 0 });
  });
  it('collapses to a flat delta when wrap is off', () => {
    expect(torDelta(0, 0, 7, 0, 8, false)).toEqual({ x: 7, y: 0 });
  });
});

describe('angleBetween', () => {
  it('measures the angle between two vectors in degrees', () => {
    expect(angleBetween(1, 0, 0, 1)).toBeCloseTo(90);
    expect(angleBetween(1, 0, 1, 0)).toBeCloseTo(0);
  });
});

describe('nearestDistinctRadii', () => {
  it('picks the two smallest distinct squared distances', () => {
    const pts: FieldPoint[] = [
      { x: 0, y: 0, weight: 1 },
      { x: 2, y: 0, weight: 1 },
      { x: 0, y: 2, weight: 1 },
      { x: 4, y: 0, weight: 1 },
    ];
    const { radiusO, radiusP } = nearestDistinctRadii(pts[0], pts, 16, true);
    expect(radiusO).toBeCloseTo(2); // (2,0) and (0,2) tie at d=2
    expect(radiusP).toBeCloseTo(4); // next distinct distance is (4,0)
  });

  it('returns zero radii when the field is exhausted', () => {
    const pts: FieldPoint[] = [{ x: 0, y: 0, weight: 1 }];
    expect(nearestDistinctRadii(pts[0], pts, 16, true)).toEqual({ radiusO: 0, radiusP: 0 });
  });
});

describe('runAlgorithm', () => {
  const field: FieldPoint[] = [
    { x: 0, y: 0, weight: 1 },
    { x: 2, y: 0, weight: 1 },
    { x: 0, y: 2, weight: 1 },
    { x: 4, y: 0, weight: 1 },
  ];

  it('computes quenched radii and gen-1 children at the origin', () => {
    const result = runAlgorithm(field, 16, 0, baseParams);
    expect(result.A).toBe(field[0]);
    expect(result.radiusO).toBeCloseTo(2);
    expect(result.radiusP).toBeCloseTo(4);
    expect(result.radiusQ).toBeCloseTo(8); // OP = 2 * 4
    expect(result.searchRadius).toBeCloseTo(4); // child formula P
    // Every other point lies within r(Q)=8, so all three become children.
    expect(result.children).toHaveLength(3);
  });

  it('keeps every segment referencing real field points', () => {
    const result = runAlgorithm(field, 16, 0, baseParams);
    for (const seg of result.segments) {
      expect(field).toContain(seg.fromAbs);
      expect(field).toContain(seg.toAbs);
    }
  });

  it('does not exceed the requested branch cap', () => {
    const result = runAlgorithm(field, 16, 0, { ...baseParams, maxBranches: 1 });
    // With maxBranches 1, no node may be recorded as a branch point.
    expect(result.branchPoints).toHaveLength(0);
  });

  it('dead-ends without crashing on a single-point field', () => {
    const solo: FieldPoint[] = [{ x: 3, y: 3, weight: 1 }];
    const result = runAlgorithm(solo, 16, 0, baseParams);
    expect(result.children).toHaveLength(0);
    expect(result.segments).toHaveLength(0);
  });

  it('respects the wrap toggle for origin geometry', () => {
    const seam: FieldPoint[] = [
      { x: 0, y: 0, weight: 1 },
      { x: 7, y: 0, weight: 1 },
    ];
    expect(runAlgorithm(seam, 8, 0, { ...baseParams, wrap: true }).radiusO).toBeCloseTo(1);
    expect(runAlgorithm(seam, 8, 0, { ...baseParams, wrap: false }).radiusO).toBeCloseTo(7);
  });
});
