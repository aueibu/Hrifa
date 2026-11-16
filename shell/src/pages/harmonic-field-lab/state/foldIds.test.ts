import { describe, expect, it } from 'vitest';
import { addFold, chordFoldIds, collapseAll, expandAll } from './foldIds';
import { MAX_FOLDS } from './persist';

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
  it('Expand all (M8i) opens every section and every group that exists, groups capped at 256', () => {
    expect(expandAll([])).toEqual({});
    expect(expandAll(['grp:a', 'grp:b', 'grp:a'])).toEqual({ 'grp:a': true, 'grp:b': true });
    const many = Array.from({ length: 300 }, (_, i) => `grp:${i}`);
    expect(Object.keys(expandAll(many))).toHaveLength(256);
    // Collapse all stores sections only: no group stays expanded
    expect(Object.keys(collapseAll(['cps', 'positional'])).some((k) => k.startsWith('grp:'))).toBe(
      false
    );
  });
  it('Collapse all folds exactly those ids and respects the cap', () => {
    expect(collapseAll(['a', 'b'])).toEqual({ a: true, b: true });
    const many = Array.from({ length: 300 }, (_, i) => `x${i}`);
    expect(Object.keys(collapseAll(many))).toHaveLength(256);
  });
});

describe('addFold (full record)', () => {
  it('a full record with grp ids: a new section fold evicts the oldest grp id', () => {
    const full: Record<string, boolean> = { positional: true };
    for (let i = 0; i < MAX_FOLDS - 1; i++) {
      full[`grp:${i}`] = true;
    }
    const next = addFold(full, 'families')!;
    expect(Object.keys(next)).toHaveLength(MAX_FOLDS);
    expect(next.families).toBe(true);
    expect(next['grp:0']).toBeUndefined();
    expect(next['grp:1']).toBe(true);
    expect(next.positional).toBe(true);
  });
  it('a record of 256 section ids refuses', () => {
    const full: Record<string, boolean> = {};
    for (let i = 0; i < MAX_FOLDS; i++) {
      full[`fam:${i}`] = true;
    }
    expect(addFold(full, 'families')).toBeNull();
  });
  it('room left: just adds', () => {
    expect(addFold({ a: true }, 'b')).toEqual({ a: true, b: true });
  });
});
