import { describe, expect, it } from 'vitest';
import { groupingsOf } from './grouping';
import {
  additiveHierarchy,
  additiveSearch,
  divisiveHierarchy,
  isWeakPulse,
  meterOrderings,
  primeFactors,
  syncopation,
} from './meter';
import { parseRatios } from './ratios';
import { linearRing, logRing } from './ring';

const example = parseRatios('1/1 10/9 9/8 5/4 3/2').ratios;
const slots72 = linearRing(example)!.slots; // 0 8 9 18 36

describe('divisive meter on 72', () => {
  it('2x2x2x3x3 has levels 72, 36, 18, 9, 3, 1 and syncopation 0', () => {
    const h = divisiveHierarchy(72, [2, 2, 2, 3, 3]);
    expect(h.weights[0]).toBe(6);
    expect(h.weights[36]).toBe(5);
    expect(h.weights[9]).toBe(3);
    expect(h.weights[8]).toBe(1);
    expect(syncopation(h, slots72).total).toBe(0);
  });
  it('ten orderings run from syncopation 0 (2x2x2x3x3) to 8 (3x3x2x2x2)', () => {
    expect(primeFactors(72)).toEqual([2, 2, 2, 3, 3]);
    const all = meterOrderings(72, slots72);
    expect(all.length).toBe(10);
    expect(all[0].text).toBe('2×2×2×3×3');
    expect(all[0].sync.total).toBe(0);
    expect(all[all.length - 1].text).toBe('3×3×2×2×2');
    expect(all[all.length - 1].sync.total).toBe(8);
    expect(all.map((o) => o.sync.total)).toEqual(
      all.map((o) => o.sync.total).sort((a, b) => a - b)
    );
  });
  it('in every ordering exactly one of 10/9 (slot 8) and 9/8 (slot 9) is weak', () => {
    for (const o of meterOrderings(72, slots72)) {
      const weak = [isWeakPulse(o.hierarchy, 8), isWeakPulse(o.hierarchy, 9)];
      expect(weak.filter(Boolean).length).toBe(1);
    }
    // the named cases: binary-first makes 10/9 (slot 8) weak, ternary-first makes 9/8 (slot 9) weak
    const binaryFirst = divisiveHierarchy(72, [2, 2, 2, 3, 3]);
    expect(isWeakPulse(binaryFirst, 8)).toBe(true);
    const ternaryFirst = divisiveHierarchy(72, [3, 3, 2, 2, 2]);
    expect(isWeakPulse(ternaryFirst, 9)).toBe(true);
  });
});

describe('divisive scoring from level sizes', () => {
  it('agrees with the per-slot weights on every ordering of several rings', () => {
    for (const [L, on] of [
      [72, [0, 8, 9, 18, 36]],
      [60, [0, 7, 12, 13, 30, 41, 59]],
      [90, [0, 1, 2, 45, 46, 89]],
    ] as Array<[number, number[]]>) {
      for (const o of meterOrderings(L, on)) {
        const direct = syncopation(divisiveHierarchy(L, o.order), on);
        expect(o.sync).toEqual(direct);
      }
    }
  });
  it('scores all 2,520 orderings of L = 259,350 on a few onsets in under a second', () => {
    const L = 2 * 3 * 5 * 5 * 7 * 13 * 19;
    expect(L).toBe(259350);
    const t0 = performance.now();
    const all = meterOrderings(L, [0, 40000, 40001, 130000, 200000]);
    const ms = performance.now() - t0;
    expect(all.length).toBe(2520);
    expect(all[0].sync.total).toBeLessThanOrEqual(all[all.length - 1].sync.total);
    expect(ms).toBeLessThan(1000);
    // weights come on demand for one chosen ordering
    expect(all[0].hierarchy.weights.length).toBe(L);
  });
});

describe('additive meter on 53', () => {
  const ring53 = logRing(example, 53);
  const slots53 = ring53.onsets.map((o) => o.slot);
  it('the log reading on 53 puts the example on 0 8 9 17 31', () => {
    expect(slots53).toEqual([0, 8, 9, 17, 31]);
  });
  it('every one of the 11 members of the 10 fives + 1 three family scores exactly 3', () => {
    // The canon says "never below 5": that was wrong. Onsets 9, 17 and 31 are 4, 2 and 1 mod 5,
    // so they never sit on a group start, and each is followed by a silence over 5 slots that holds
    // a group start: 3 syncopations in every member (min = max). Example 3+5x10 has starts
    // 0 3 8 13 18 23 28 33 ...: onsets 9, 17, 31 are followed by the silent starts 13, 18, 33.
    const scores: number[] = [];
    for (const g of groupingsOf(53, [5, 3])) {
      if (g.filter((x) => x === 5).length !== 10) {
        continue;
      }
      scores.push(syncopation(additiveHierarchy(g), slots53).total);
    }
    expect(scores.length).toBe(11);
    expect(Math.min(...scores)).toBe(3);
    expect(Math.max(...scores)).toBe(3);
    expect(
      syncopation(additiveHierarchy([3, ...new Array<number>(10).fill(5)]), slots53).total
    ).toBe(3);
  });
  it('the best mixes score 0 with 4 fives and 11 threes; the other mixes cannot', () => {
    const minByFives = new Map<number, number>();
    for (const g of groupingsOf(53, [5, 3])) {
      const f = g.filter((x) => x === 5).length;
      const s = syncopation(additiveHierarchy(g), slots53).total;
      minByFives.set(f, Math.min(minByFives.get(f) ?? Infinity, s));
    }
    expect([...minByFives.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [1, 1],
      [4, 0],
      [7, 1],
      [10, 3],
    ]);
  });
  it('the best groupings use 4 fives and 11 threes', () => {
    let min = Infinity;
    const byScore = new Map<number, Set<string>>();
    for (const g of groupingsOf(53, [5, 3])) {
      const s = syncopation(additiveHierarchy(g), slots53).total;
      min = Math.min(min, s);
      const key = `${g.filter((x) => x === 5).length}`;
      if (!byScore.has(s)) {
        byScore.set(s, new Set());
      }
      byScore.get(s)!.add(key);
    }
    expect([...byScore.get(min)!]).toEqual(['4']);
    // the canon's example: 3 3 3 3 5 3 3 3 5 3 3 3 3 5 5 puts 9/8, 5/4, 3/2 on group starts
    const example3 = [3, 3, 3, 3, 5, 3, 3, 3, 5, 3, 3, 3, 3, 5, 5];
    const h = additiveHierarchy(example3);
    expect(syncopation(h, slots53).total).toBe(min);
    expect([9, 17, 31].every((p) => h.weights[p] === 2)).toBe(true);
    expect(isWeakPulse(h, 8)).toBe(true);
  });
  it('the dynamic program agrees with listing every grouping', () => {
    const best = additiveSearch(slots53, 53, [5, 3])!;
    const hist = new Map<number, bigint>();
    let min = Infinity;
    for (const g of groupingsOf(53, [5, 3])) {
      const s = syncopation(additiveHierarchy(g), slots53).total;
      hist.set(s, (hist.get(s) ?? 0n) + 1n);
      min = Math.min(min, s);
    }
    expect(best.minSync).toBe(min);
    expect(best.dist).toEqual([...hist.entries()].sort((a, b) => a[0] - b[0]));
    expect(syncopation(additiveHierarchy(best.groups), slots53).total).toBe(min);
    expect(best.total).toBe(3109n);
  });
});
