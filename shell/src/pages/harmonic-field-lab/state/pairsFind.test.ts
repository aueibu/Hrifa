import { describe, expect, it } from 'vitest';
import { parseFind } from './pairsFind';

describe('Pairs Find box parsing', () => {
  it('a slash or colon is a ratio; everything else is cents', () => {
    expect(parseFind('3/2')).toMatchObject({ c: expect.closeTo(701.955, 2) });
    expect(parseFind('4:3')).toMatchObject({ c: expect.closeTo(498.045, 2) });
    for (const t of ['700', '700 c', '700c', '700.5 c', ' 700 ']) {
      expect(parseFind(t)).toMatchObject({ c: expect.closeTo(Number.parseFloat(t), 6) });
    }
    expect(parseFind('3')).toMatchObject({ c: 3, label: '3 c' }); // never 3/1
    expect(parseFind('-100 c')).toMatchObject({ c: -100 });
  });

  it('empty is no search and junk is bad', () => {
    expect(parseFind('  ')).toBeNull();
    for (const t of ['abc', '7 x', '3/', 'c', '1..2 c']) {
      expect(parseFind(t)).toBe('bad');
    }
  });
});
