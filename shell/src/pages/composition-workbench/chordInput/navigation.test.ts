import { describe, expect, it } from 'vitest';
import { stepChordKey, stepSpread } from './navigation';

describe('stepSpread', () => {
  it('steps close, open, drop2, drop3 and clamps at the ends', () => {
    expect(stepSpread('close', 1)).toBe('open');
    expect(stepSpread('open', 1)).toBe('drop2');
    expect(stepSpread('drop2', 1)).toBe('drop3');
    expect(stepSpread('drop3', 1)).toBe('drop3');
    expect(stepSpread('close', -1)).toBe('close');
    expect(stepSpread('drop3', -1)).toBe('drop2');
  });
});

describe('stepChordKey', () => {
  it('root mode steps one chord with any arrow and clamps', () => {
    const columns = [['A', 'B', 'C']];
    expect(stepChordKey(columns, 'root', 'A', 0, 1)).toBe('B');
    expect(stepChordKey(columns, 'root', 'B', 1, 0)).toBe('C');
    expect(stepChordKey(columns, 'root', 'B', -1, 0)).toBe('A');
    expect(stepChordKey(columns, 'root', 'C', 0, 1)).toBe('C');
    expect(stepChordKey(columns, 'root', null, 0, 1)).toBe('A');
    expect(stepChordKey([], 'root', null, 0, 1)).toBeNull();
  });

  it('common-tone mode moves within a column and across columns keeping the row', () => {
    const columns = [['a1', 'a2', 'a3'], ['b1'], ['c1', 'c2']];
    expect(stepChordKey(columns, 'common', 'a2', 0, 1)).toBe('a3');
    expect(stepChordKey(columns, 'common', 'a3', 0, 1)).toBe('a3');
    expect(stepChordKey(columns, 'common', 'a2', 1, 0)).toBe('b1');
    expect(stepChordKey(columns, 'common', 'b1', 1, 0)).toBe('c1');
    expect(stepChordKey(columns, 'common', 'a3', 2, 0)).toBe('c2');
    expect(stepChordKey(columns, 'common', 'a1', -1, 0)).toBe('a1');
    expect(stepChordKey(columns, 'common', null, 0, 1)).toBe('a1');
  });
});
