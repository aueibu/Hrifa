import { describe, expect, it } from 'vitest';
import { chordFoldIds, collapseAll } from './foldIds';

describe('chordFoldIds (M8g f)', () => {
  const sizes = ['Triads', 'Tetras'];
  const chips = [
    { size: 'Triads', family: 'Major' },
    { size: 'Triads', family: 'Septimal' },
    { size: 'Triads', family: 'Major' },
  ];
  it('lists every section and sub-fold that exists, and only those', () => {
    expect(chordFoldIds({ cps: false, patterns: ['2-2', '2-3'], chips, sizes })).toEqual([
      'positional',
      'pos:2-2',
      'pos:2-3',
      'families',
      'size:Triads',
      'fam:Triads:Major',
      'fam:Triads:Septimal',
    ]);
  });
  it('adds cps for the CPS method', () => {
    expect(chordFoldIds({ cps: true, patterns: [], chips: [], sizes })[0]).toBe('cps');
  });
  it('Collapse all folds exactly those ids and respects the cap', () => {
    expect(collapseAll(['a', 'b'])).toEqual({ a: true, b: true });
    const many = Array.from({ length: 300 }, (_, i) => `x${i}`);
    expect(Object.keys(collapseAll(many))).toHaveLength(256);
  });
});
