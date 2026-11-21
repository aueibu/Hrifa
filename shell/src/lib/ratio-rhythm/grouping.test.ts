import { describe, expect, it } from 'vitest';
import {
  bracketings,
  countTrees,
  fmtGrouping,
  fmtTree,
  groupMixes,
  groupingsOf,
  littleSchroeder,
  MAX_TREE_N,
  parseGrouping,
  proximityTree,
  treeDepth,
  treeLeaves,
  TreeLimitError,
} from './grouping';

describe('countTrees limit', () => {
  it('n = 96 (the lab UI cap) finishes well under 100 ms; n above it throws TreeLimitError', () => {
    const t0 = performance.now();
    const r = countTrees(MAX_TREE_N, [3, 5]);
    const ms = performance.now() - t0;
    expect(MAX_TREE_N).toBe(96);
    expect(r.topDown).toBe(r.bottomUp);
    expect(ms).toBeLessThan(100);
    expect(() => countTrees(MAX_TREE_N + 1, [3, 5])).toThrow(TreeLimitError);
    expect(() => countTrees(1000, [1])).toThrow(/0 to 96/);
  });
});

describe('flat grouping text', () => {
  it('uses + with no spaces; names stay hyphenated elsewhere', () => {
    expect(fmtGrouping([3, 3, 2])).toBe('3+3+2');
    expect(fmtGrouping([5, 5, 3])).toBe('5+5+3');
    expect(parseGrouping('3+3+2')).toEqual([3, 3, 2]);
    expect(parseGrouping('3-3-2')).toEqual([3, 3, 2]);
    expect(parseGrouping('3+x')).toBeNull();
  });
});

describe('53 into 5s and 3s', () => {
  it('has exactly four mixes', () => {
    const mixes = groupMixes(53, [5, 3]);
    expect(mixes.map((m) => m.counts)).toEqual([
      [1, 16],
      [4, 11],
      [7, 6],
      [10, 1],
    ]);
    expect(mixes.find((m) => m.counts[0] === 10)!.arrangements).toBe(11n);
  });
  it('mix arrangements add up to the number of compositions', () => {
    const total = groupMixes(53, [5, 3]).reduce((a, m) => a + m.arrangements, 0n);
    expect(total).toBe(countTrees(53, [3, 5]).compositions[53]);
    let n = 0;
    for (const g of groupingsOf(53, [5, 3])) {
      expect(g.reduce((a, b) => a + b, 0)).toBe(53);
      n++;
    }
    expect(BigInt(n)).toBe(total);
  });
});

describe('hierarchical counts', () => {
  it('little Schroeder numbers 1, 1, 3, 11, 45, 197', () => {
    expect(littleSchroeder(6)).toEqual([1n, 1n, 3n, 11n, 45n, 197n]);
  });
  it('binary splits only give the Catalan numbers', () => {
    expect(countTrees(8, [1], 2).bracketings.slice(1, 7)).toEqual([1n, 1n, 2n, 5n, 14n, 42n]);
  });
  it('top-down and bottom-up totals agree', () => {
    for (const [n, leaves, maxB] of [
      [8, [1, 2, 3], 0],
      [12, [2, 3], 0],
      [12, [2, 3], 3],
      [20, [3, 5], 4],
      [53, [3, 5], 0],
      [53, [5], 2],
    ] as Array<[number, number[], number]>) {
      const c = countTrees(n, leaves, maxB);
      expect(c.topDown).toBe(c.bottomUp);
    }
  });
  it('agrees with listing every tree on a small case', () => {
    let listed = 0n;
    for (const g of groupingsOf(8, [1, 2, 3])) {
      for (const t of bracketings(g)) {
        listed++;
        expect(treeLeaves(t)).toEqual(g);
      }
    }
    expect(listed).toBe(countTrees(8, [1, 2, 3]).topDown);
  });
  it('2+2+1+3 carries 11 bracketings, both (2+2+1)+3 and (2+2)+(1+3) among them', () => {
    const all = [...bracketings([2, 2, 1, 3])];
    expect(all.length).toBe(11);
    const texts = all.map(fmtTree);
    expect(texts).toContain('8 = 5 (2 + 2 + 1) + 3');
    expect(texts).toContain('8 = 4 (2 + 2) + 4 (1 + 3)');
  });
});

describe('proximity grouping', () => {
  it('gaps 8, 1, 8, 14, 22 give (8 + (1 + 8) + 14) + 22 and the total-first text', () => {
    const t = proximityTree([8, 1, 8, 14, 22])!;
    expect(fmtTree(t)).toBe('53 = 31 (8 + 9 (1 + 8) + 14) + 22');
    expect(treeLeaves(t)).toEqual([8, 1, 8, 14, 22]);
    expect(treeDepth(t)).toBe(3);
    expect(t.size).toBe(53);
    // the comma pair (1 + 8) is the lowest level; 22 is the phrase boundary at the top
    expect(t.children.map((c) => c.size)).toEqual([31, 22]);
  });
  it('one gap is a leaf', () => {
    expect(fmtTree(proximityTree([7])!)).toBe('7');
    expect(proximityTree([])).toBeNull();
  });
});
