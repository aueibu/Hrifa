import { describe, expect, it } from 'vitest';
import { COL_MIN_CH, COL_PAD_CH, colWidthCh } from './pairsWidth';

describe('colWidthCh', () => {
  it.each(['-130.81\u2191', '171.4 c', '1028.6 c', '701.955 c', '15/8', '11/6'])(
    'is at least the length of %s plus the padding',
    (t) => {
      expect(colWidthCh([t])).toBeGreaterThanOrEqual([...t].length + COL_PAD_CH);
    }
  );
  it('is compact: about 1.5ch of padding in all, never the old 3ch', () => {
    expect(COL_PAD_CH).toBeLessThanOrEqual(1.5);
    expect(colWidthCh(['701.955 c'])).toBe(9 + COL_PAD_CH);
  });
  it('takes the longest text of the grid and never goes below the minimum', () => {
    expect(colWidthCh(['15/8', '701.955 c', '11/6'])).toBe(9 + COL_PAD_CH);
    expect(colWidthCh([])).toBe(COL_MIN_CH);
    expect(colWidthCh(['1'])).toBe(COL_MIN_CH);
  });
});
