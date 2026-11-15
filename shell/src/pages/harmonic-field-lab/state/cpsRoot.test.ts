import { describe, expect, it } from 'vitest';
import type { CpsChord } from '../../../lib/harmonic-field';
import { cpsRootIdx } from './cpsRoot';

const labels = ['1', '3', '5', '7'];

describe('cpsRootIdx', () => {
  it('otonal: the smallest factor label, even when it is not the lowest field pitch (the chord wraps the repeat)', () => {
    // field index 0 is the lowest pitch but carries the largest label (7); the 3 sits higher in the field
    const g: CpsChord = {
      type: 'harmonic',
      common: [0],
      members: [
        { i: 0, x: 3 },
        { i: 4, x: 1 },
        { i: 2, x: 2 },
      ],
    };
    expect(cpsRootIdx(g, labels)).toBe(4);
  });

  it('utonal: the LARGEST factor label (1/7 is the lowest note of 1/(3:5:7) in root position)', () => {
    const g: CpsChord = {
      type: 'subharmonic',
      common: [1, 2, 3],
      members: [
        { i: 0, x: 1 },
        { i: 3, x: 3 },
        { i: 5, x: 2 },
      ],
    };
    expect(cpsRootIdx(g, labels)).toBe(3);
  });
});
