import { describe, expect, it } from 'vitest';
import {
  continuedFraction,
  euclidGaps,
  euclidSlots,
  fmtSbPath,
  gapsFromParents,
  sbRuns,
  sbStructure,
} from './euclid';

const gcdN = (a: number, b: number): number => (b === 0 ? a : gcdN(b, a % b));
const frac = (f: { n: number; d: number } | null) => (f ? `${f.n}/${f.d}` : null);

/** Independent path: walk the Stern-Brocot tree by mediants, one move at a time. */
function walkMoves(p: number, q: number): string[] {
  let ln = 0;
  let ld = 1;
  let rn = 1;
  let rd = 0;
  const moves: string[] = [];
  for (;;) {
    const mn = ln + rn;
    const md = ld + rd;
    if (mn === p && md === q) {
      return moves;
    }
    if (p * md < mn * q) {
      rn = mn;
      rd = md;
      moves.push('L');
    } else {
      ln = mn;
      ld = md;
      moves.push('R');
    }
  }
}

/** Independent Bjorklund: distribute k ones and L-k zeros by repeated pairing. */
function bjorklund(k: number, L: number): number[] {
  let a: number[][] = Array.from({ length: k }, () => [1]);
  let b: number[][] = Array.from({ length: L - k }, () => [0]);
  while (b.length > 1) {
    const n = Math.min(a.length, b.length);
    const merged = Array.from({ length: n }, (_, i) => [...a[i], ...b[i]]);
    const rest = a.length > n ? a.slice(n) : b.slice(n);
    a = merged;
    b = rest;
  }
  return [...a.flat(), ...b.flat()];
}

describe('E(5, 53)', () => {
  it('gaps (10, 11) + (10, 11, 11); onsets', () => {
    expect(euclidSlots(5, 53)).toEqual([0, 10, 21, 31, 42]);
    expect(euclidGaps(5, 53)).toEqual([10, 11, 10, 11, 11]);
    expect(euclidGaps(2, 21)).toEqual([10, 11]);
    expect(euclidGaps(3, 32)).toEqual([10, 11, 11]);
  });
  it('parents 2/21 and 3/32, children 7/74 and 8/85, path L10 R L R', () => {
    const s = sbStructure(5, 53)!;
    expect(frac(s.fraction)).toBe('5/53');
    expect(s.parents.map(frac)).toEqual(['3/32', '2/21']);
    expect(s.children.map(frac)).toEqual(['8/85', '7/74']);
    expect(s.runs).toEqual([
      { dir: 'L', t: 10 },
      { dir: 'R', t: 1 },
      { dir: 'L', t: 1 },
      { dir: 'R', t: 1 },
    ]);
    expect(fmtSbPath(s.runs)).toBe('L¹⁰ R L R');
  });
  it('1/L has a sentinel left parent: 1/5 has parents [null, 1/4], children 1/6 and 2/9', () => {
    const s = sbStructure(1, 5)!;
    expect(s.parents[0]).toBeNull();
    expect(frac(s.parents[1]!)).toBe('1/4');
    expect(s.children.map(frac)).toEqual(['1/6', '2/9']);
  });
  it('path checked by walking the tree and by the continued fraction [0; 10, 1, 1, 2]', () => {
    expect(continuedFraction(5, 53)).toEqual([0, 10, 1, 1, 2]);
    expect(walkMoves(5, 53).join('')).toBe('LLLLLLLLLLRLR');
    // the children really are the mediants of 5/53 with its parents, and each has 5/53 as a parent
    for (const c of sbStructure(5, 53)!.children) {
      const cs = sbStructure(c.n, c.d)!;
      expect(cs.parents.map(frac)).toContain('5/53');
    }
  });
  it('runs agree with a mediant walk for every fraction up to denominator 40', () => {
    for (let L = 2; L <= 40; L++) {
      for (let k = 1; k < L; k++) {
        if (gcdN(k, L) !== 1) {
          continue;
        }
        const walked = walkMoves(k, L);
        const runs = sbRuns(k, L)
          .map((r) => r.dir.repeat(r.t))
          .join('');
        expect(runs).toBe(walked.join(''));
      }
    }
  });
});

describe('parent concatenation identity', () => {
  it('holds for every fraction with denominator up to 80 (1,886 of them)', () => {
    let count = 0;
    const bad: string[] = [];
    for (let L = 2; L <= 80; L++) {
      for (let k = 1; k < L; k++) {
        const built = gapsFromParents(k, L);
        if (built === null) {
          continue;
        }
        count++;
        if (euclidGaps(k, L).join() !== built.join()) {
          bad.push(`${k}/${L}`);
        }
      }
    }
    expect(bad).toEqual([]);
    expect(count).toBe(1886);
  });
  it('E(k, L) is maximally even and matches an independent Bjorklund up to rotation', () => {
    for (const [k, L] of [
      [5, 53],
      [3, 8],
      [5, 12],
      [7, 12],
      [4, 9],
    ]) {
      const g = euclidGaps(k, L);
      expect(new Set(g).size).toBeLessThanOrEqual(2);
      const bj = bjorklund(k, L);
      // gaps of the Bjorklund word (1 starts a gap)
      const ones = bj.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
      const bg = ones.map((o, i) => (i + 1 < ones.length ? ones[i + 1] : L + ones[0]) - o);
      const rot = (a: number[], r: number) => a.slice(r).concat(a.slice(0, r));
      const same = g.some((_, r) => rot(bg, r).join() === g.join());
      expect(same).toBe(true);
    }
  });
});
