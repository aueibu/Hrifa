import {
  buildPeriodicityBlock,
  classKey,
  findTwoUnisonVectors,
  invariantFactors,
  isDegeneratePair,
  traversalCycles,
  type UnisonVectorCandidate,
} from './periodicityBlock';

const uv = (m: number, n: number): UnisonVectorCandidate => ({
  badness: 0,
  complexity: Math.abs(m) + Math.abs(n),
  dist: 0,
  m,
  n,
});

describe('isDegeneratePair', () => {
  it('flags pairs summing to an integer as degenerate (rank-1 in disguise)', () => {
    expect(isDegeneratePair(0.3, 0.7)).toBe(true);
    expect(isDegeneratePair(0.3, 1.7)).toBe(true);
  });

  it('does not flag a genuinely independent pair', () => {
    expect(isDegeneratePair(0.3, 0.5)).toBe(false);
  });
});

describe('classKey', () => {
  it('is invariant under adding either unison vector — the defining property of a unison vector', () => {
    const uv1 = uv(1, -1);
    const uv2 = uv(0, 1);
    let mismatches = 0;
    for (let i = -20; i <= 20; i++) {
      for (let j = -20; j <= 20; j++) {
        const base = classKey(i, j, uv1, uv2);
        if (classKey(i + uv1.m, j + uv1.n, uv1, uv2) !== base) {
          mismatches++;
        }
        if (classKey(i + uv2.m, j + uv2.n, uv1, uv2) !== base) {
          mismatches++;
        }
      }
    }
    expect(mismatches).toBe(0);
  });
});

describe('buildPeriodicityBlock', () => {
  it('produces exactly |determinant| points', () => {
    const uv1 = uv(1, -1);
    const uv2 = uv(0, 1);
    const det = Math.abs(uv1.m * uv2.n - uv1.n * uv2.m);
    const block = buildPeriodicityBlock(0.31, 0.47, uv1, uv2);
    expect(block.length).toBe(det);
  });

  it('reproduces the classic syntonic-comma + diesis pair (determinant 12) for 3/2 and 5/4 at 12-EDO', () => {
    const g1 = Math.log2(3 / 2);
    const g2 = Math.log2(5 / 4);
    const edo = 12;
    const tolerance = 1 / (2 * edo);
    const uvs = findTwoUnisonVectors(g1, g2, tolerance, 25);
    expect(uvs).not.toBeNull();
    expect(uvs!.det).toBe(12);
    const block = buildPeriodicityBlock(g1, g2, uvs!.uv1, uvs!.uv2);
    expect(block.length).toBe(12);
  });
});

describe('invariantFactors', () => {
  it('detects a true Z/d1 x Z/d2 product (d1>1), not simple cyclic', () => {
    // Two unison vectors sharing a common factor of 2 in both components:
    // gcd(gcd(2,2), gcd(2,2)) = 2, det = |2*-2 - 2*2| = 8 -> d1=2, d2=4.
    const uv1 = uv(2, 2);
    const uv2 = uv(2, -2);
    expect(invariantFactors(uv1, uv2)).toEqual({ d1: 2, d2: 4 });
  });

  it('reports simple cyclic (d1=1) for coprime unison vectors', () => {
    const uv1 = uv(1, -1);
    const uv2 = uv(0, 1);
    expect(invariantFactors(uv1, uv2)).toEqual({ d1: 1, d2: 1 });
  });
});

describe('traversalCycles', () => {
  it('never produces a cycle longer than d2 when the group is a true Z/d1 x Z/d2 product', () => {
    const uv1 = uv(2, 2);
    const uv2 = uv(2, -2);
    const { d2 } = invariantFactors(uv1, uv2);
    const block = buildPeriodicityBlock(0.19, 0.53, uv1, uv2);
    expect(block.length).toBe(8);

    const steps: [number, number][] = [
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 3],
      [-1, 2],
    ];
    for (const [stepI, stepJ] of steps) {
      const { cycles } = traversalCycles(block, uv1, uv2, stepI, stepJ);
      for (const cycle of cycles) {
        expect(cycle.length).toBeLessThanOrEqual(d2);
      }
    }
  });

  it('walks the actual group, not a pitch-sorted order — a diagonal step can reach a single cycle a pure single-generator step cannot', () => {
    // Two independent generators with coprime "clock" periods only
    // synchronize into one full cycle when both step together.
    const uv1 = uv(3, 0);
    const uv2 = uv(0, 5);
    const block = buildPeriodicityBlock(0.11, 0.29, uv1, uv2);
    expect(block.length).toBe(15);

    const pureStep = traversalCycles(block, uv1, uv2, 1, 0);
    expect(pureStep.g).toBeGreaterThan(1);

    const diagonalStep = traversalCycles(block, uv1, uv2, 1, 1);
    expect(diagonalStep.g).toBe(1);
  });
});
