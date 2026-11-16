import { describe, expect, it } from 'vitest';
import { groupByShape, stepKey } from './shapeGroups';

describe('stepKey', () => {
  it('rounds each step to 0.5 c', () => {
    expect(stepKey([0, 400, 700])).toBe('400.0,300.0');
    expect(stepKey([100, 500.1, 800.2])).toBe('400.0,300.0');
    expect(stepKey([0, 400.4, 700])).not.toBe(stepKey([0, 400, 700]));
    expect(stepKey([0])).toBe('');
  });
});

describe('groupByShape', () => {
  it('keeps the order of first appearance, members in order, null keys alone', () => {
    const g = groupByShape(['a1', 'b1', 'a2', 'x', 'y', 'b2', 'a3'], (s) =>
      s === 'x' || s === 'y' ? null : s[0]
    );
    expect(g.map((x) => x.members)).toEqual([['a1', 'a2', 'a3'], ['b1', 'b2'], ['x'], ['y']]);
    expect(g.map((x) => x.key)).toEqual(['a', 'b', null, null]);
  });
});
