import { describe, expect, it } from 'vitest';
import { gcd, lcm, lcdOf, parseRatios, ratioStr, reduceOctave, rerootRatios } from './ratios';

const strs = (rs: { n: bigint; d: bigint }[]) => rs.map(ratioStr);

describe('gcd, lcm, lcd', () => {
  it('works in bigint', () => {
    expect(gcd(24n, 36n)).toBe(12n);
    expect(lcm(72n, 80n)).toBe(720n);
    expect(lcm(2n ** 70n, 3n)).toBe(3n * 2n ** 70n);
  });
});

describe('parseRatios', () => {
  it('parses, sorts and keeps 1/1', () => {
    const p = parseRatios('3/2 5/4 9/8 10/9 1/1');
    expect(strs(p.ratios)).toEqual(['1/1', '10/9', '9/8', '5/4', '3/2']);
    expect(p.bad).toEqual([]);
    expect(p.added).toBe(false);
  });
  it('adds a missing 1/1, octave-reduces and dedupes', () => {
    const p = parseRatios('3/1 3/2 5:4');
    expect(strs(p.ratios)).toEqual(['1/1', '5/4', '3/2']);
    expect(p.added).toBe(true);
  });
  it('rejects non-exact input', () => {
    const p = parseRatios('701.96 3/2 7\\12 100c 0 abc 1.5');
    expect(strs(p.ratios)).toEqual(['1/1', '3/2']);
    expect(p.bad).toEqual(['701.96', '7\\12', '100c', '0', 'abc', '1.5']);
  });
  it('cuts to the cap and handles huge numerators', () => {
    const p = parseRatios('1 5/4 3/2 7/4', { max: 3 });
    expect(p.ratios).toHaveLength(3);
    expect(p.cut).toBe(true);
    expect(lcdOf(parseRatios('1 10000000019/10000000000').ratios)).toBe(10000000000n);
  });
  it('can skip octave reduction (rates reading)', () => {
    expect(strs(parseRatios('13/6 1', { reduce: false }).ratios)).toEqual(['1/1', '13/6']);
  });
});

describe('reduceOctave and rerootRatios', () => {
  it('reduces into [1, 2)', () => {
    expect(ratioStr(reduceOctave(13n, 6n)!)).toBe('13/12');
    expect(ratioStr(reduceOctave(1n, 3n)!)).toBe('4/3');
    expect(reduceOctave(0n, 3n)).toBeNull();
  });
  it('re-roots on 9/8', () => {
    const rs = parseRatios('1/1 10/9 9/8 5/4 3/2').ratios;
    const root = rs[2];
    expect(strs(rerootRatios(rs, root))).toEqual(['1/1', '10/9', '4/3', '16/9', '160/81']);
  });
});
