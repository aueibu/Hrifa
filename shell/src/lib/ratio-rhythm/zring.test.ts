import { describe, expect, it } from 'vitest';
import { parseRatios, ratioStr } from './ratios';
import { linearRing } from './ring';
import { dft, sameMagnitudes } from './spectrum';
import { alignTo, canonKey, isZRelated, linearRingPair, sameDistances, zPartners } from './zring';

/** Seeded PRNG (mulberry32), so the random tests are deterministic. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomSet(rand: () => number, k: number, L: number): number[] {
  const s = new Set<number>([0]);
  while (s.size < k) {
    s.add(Math.floor(rand() * L));
  }
  return [...s].sort((a, b) => a - b);
}

describe('Z-pairs on a fixed ring', () => {
  it('{0,1,4,6} and {0,1,3,7} share an interval vector on 12 (4-Z15 and 4-Z29)', () => {
    expect(sameDistances([0, 1, 4, 6], [0, 1, 3, 7], 12)).toBe(true);
    expect(isZRelated([0, 1, 4, 6], [0, 1, 3, 7], 12)).toBe(true);
    const found = zPartners([0, 1, 4, 6], 12);
    expect(found.aborted).toBe(false);
    expect(found.partners.map((p) => p.join())).toEqual(['0,1,3,7']);
  });
  it('{0,1,3,9} and {0,1,4,6} on 13: every distance 1 to 6 exactly once', () => {
    expect(isZRelated([0, 1, 3, 9], [0, 1, 4, 6], 13)).toBe(true);
    const counts = [0, 1, 4, 6].flatMap((a, i, arr) =>
      arr.slice(i + 1).map((b) => Math.min(b - a, 13 - b + a))
    );
    expect(counts.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(zPartners([0, 1, 3, 9], 13).partners.map((p) => p.join())).toContain('0,1,4,6');
  });
  it('rotations and mirror images are not Z-related', () => {
    expect(isZRelated([0, 1, 4, 6], [3, 4, 7, 9], 12)).toBe(false);
    expect(isZRelated([0, 1, 4, 6], [0, 2, 5, 6], 12)).toBe(false);
    expect(canonKey([0, 1, 4, 6], 12)).toBe(canonKey([0, 2, 5, 6], 12));
  });
  it('3 onsets never have a partner', () => {
    expect(zPartners([0, 3, 7], 12).partners).toEqual([]);
  });
});

describe('equal interval vectors iff equal DFT magnitudes', () => {
  it('on random sets (seeded)', () => {
    const rand = prng(20261120);
    let zPairs = 0;
    let checked = 0;
    for (let t = 0; t < 60; t++) {
      const L = 8 + Math.floor(rand() * 10);
      const k = 4 + Math.floor(rand() * 2);
      const A = randomSet(rand, k, L);
      for (const p of zPartners(A, L).partners) {
        zPairs++;
        expect(sameDistances(A, p, L)).toBe(true);
        expect(sameMagnitudes(A, p, L)).toBe(true);
        // different phases: some coefficient differs in direction
        let phaseDiffers = false;
        for (let j = 1; j <= L >> 1; j++) {
          const TWO_PI = 2 * Math.PI;
          const raw = dft(A, L, j).phase - dft(p, L, j).phase;
          const diff = Math.abs(((raw % TWO_PI) + TWO_PI) % TWO_PI);
          if (Math.min(diff, TWO_PI - diff) > 1e-6) {
            phaseDiffers = true;
          }
        }
        expect(phaseDiffers).toBe(true);
      }
      for (let u = 0; u < 40; u++) {
        const B = randomSet(rand, k, L);
        expect(sameDistances(A, B, L)).toBe(sameMagnitudes(A, B, L));
        checked++;
      }
    }
    expect(zPairs).toBeGreaterThan(0);
    expect(checked).toBe(2400);
  });
});

describe('45 ring (the default scale rooted on 5/4)', () => {
  const set = [0, 9, 18, 27, 35, 36];
  it('has no partner, found exhaustively within the budget', () => {
    const r = zPartners(set, 45);
    expect(r.aborted).toBe(false);
    expect(r.partners).toEqual([]);
  });
  it('a step budget stops the search and says so', () => {
    const r = zPartners(set, 45, { cap: 50 });
    expect(r.aborted).toBe(true);
    expect(r.steps).toBeLessThanOrEqual(51);
  });
  it('an injected stop function aborts too', () => {
    let polls = 0;
    const r = zPartners(set, 45, { shouldStop: () => ++polls >= 2 });
    expect(r.aborted).toBe(true);
  });
});

describe('alignTo', () => {
  it('places a partner to share the most onsets and keep 1/1', () => {
    const P = [0, 9, 18, 30, 33, 36];
    const partner = zPartners(P, 45).partners[0];
    const al = alignTo(P, partner, 45);
    expect(al.shared).toBe(4);
    expect(al.Q).toEqual([0, 15, 18, 24, 33, 36]);
  });
});

describe('linear ring pair', () => {
  const P = parseRatios('1/1 10/9 9/8 89/72 3/2 7/4').ratios;
  const Q = parseRatios('1/1 9/8 89/72 5/4 3/2 29/18').ratios;
  it('rooted on 1/1 both live on ring 72 and are Z-related', () => {
    const a = linearRing(P)!;
    const b = linearRing(Q)!;
    expect(a.L).toBe(72);
    expect(b.L).toBe(72);
    expect(a.slots).toEqual([0, 8, 9, 17, 36, 54]);
    expect(b.slots).toEqual([0, 9, 17, 18, 36, 44]);
    expect(isZRelated(a.slots, b.slots, 72)).toBe(true);
    // both have a 1-slot pair: 81/80 in one, 90/89 in the other
    expect(ratioStr(P[1])).toBe('10/9');
  });
  it('the pair holds on the 1/1 rooting and on none of the other five', () => {
    const rep = linearRingPair(P, Q);
    expect(rep.map((r) => r.L)).toEqual([72, 80, 81, 89, 54, 63]);
    expect(rep.map((r) => r.holds)).toEqual([true, false, false, false, false, false]);
  });
  it('the other five rootings have no partner at all on their ring', () => {
    const rep = linearRingPair(P, Q);
    for (const r of rep.slice(1)) {
      const found = zPartners(r.slots, r.L);
      expect(found.aborted).toBe(false);
      expect(found.partners).toEqual([]);
    }
    const first = zPartners(rep[0].slots, rep[0].L);
    expect(first.partners.map((p) => p.join())).toContain(canonKey(linearRing(Q)!.slots, 72));
  });
});
