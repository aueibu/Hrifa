import { describe, expect, it } from 'vitest';
import { sternBrocotAncestry, sternBrocotBranches } from './sternBrocot';

const text = (n: number, d: number) =>
  sternBrocotAncestry(n, d)
    .map((e) => `${e.from.n}/${e.from.d}-${e.to.n}/${e.to.d}`)
    .sort();

describe('sternBrocotAncestry', () => {
  it('7/5 has the seven edges of its path', () => {
    expect(text(7, 5)).toEqual(
      ['7/5-4/3', '7/5-3/2', '4/3-1/1', '4/3-3/2', '3/2-1/1', '3/2-2/1', '2/1-1/1'].sort()
    );
  });
  it('5/4 has parents 1/1 and 4/3 on its own mediant', () => {
    const own = sternBrocotAncestry(5, 4).filter((e) => e.from.n === 5);
    expect(own.map((e) => `${e.to.n}/${e.to.d}`).sort()).toEqual(['1/1', '4/3']);
  });
  it('1/1 has none; ratios below 1 work', () => {
    expect(sternBrocotAncestry(1, 1)).toEqual([]);
    expect(text(2, 3)).toContain('2/3-1/2');
  });
  it('a deep chain is capped, keeping the edges nearest the ratio', () => {
    expect(sternBrocotAncestry(81, 80).length).toBeGreaterThan(100);
    const deep = sternBrocotAncestry(100001, 100000);
    expect(deep.length).toBe(500);
    expect(deep.at(-1)?.from).toEqual({ n: 100001, d: 100000 });
  });
});

const branches = (n: number, d: number) =>
  sternBrocotBranches(n, d).map((e) => `${e.from.n}/${e.from.d}-${e.to.n}/${e.to.d}`);

describe('sternBrocotBranches (option A)', () => {
  it('7/5 forks to 4/3 and 3/2, each branch climbing on its own', () => {
    expect(branches(7, 5)).toEqual(['7/5-4/3', '7/5-3/2', '4/3-1/1', '3/2-2/1']);
  });
  it('5/4: 1/1 directly, and 4/3 climbing to 3/2 and 2/1', () => {
    expect(branches(5, 4)).toEqual(['5/4-4/3', '5/4-1/1', '4/3-3/2', '3/2-2/1']);
  });
  it('no triangles: every ancestor is reached once', () => {
    for (const [n, d] of [
      [7, 5],
      [81, 80],
      [14, 11],
      [2, 3],
    ]) {
      const tos = sternBrocotBranches(n, d).map((e) => `${e.to.n}/${e.to.d}`);
      expect(new Set(tos).size).toBe(tos.length);
    }
  });
  it('1/1 has none', () => {
    expect(sternBrocotBranches(1, 1)).toEqual([]);
  });
});
