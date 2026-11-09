import { describe, expect, it } from 'vitest';
import {
  barHasValue,
  currentRow,
  histogramBars,
  inBin,
  rankOf,
  showBarLabel,
  sortRows,
} from './compare';
import { catalog } from './pitchSets';

describe('histogramBars', () => {
  it('uses one bar per distinct value when there are few', () => {
    const h = histogramBars([1, 1, 2, 5], String);
    expect(h.exact).toBe(true);
    expect(h.bars.map((b) => [b.lo, b.count])).toEqual([
      [1, 2],
      [2, 1],
      [5, 1],
    ]);
  });

  it('falls back to twelve equal-width bins with only the end labels', () => {
    const vals = Array.from({ length: 40 }, (_, i) => i);
    const h = histogramBars(vals, String);
    expect(h.exact).toBe(false);
    expect(h.bars).toHaveLength(12);
    expect(h.bars.reduce((s, b) => s + b.count, 0)).toBe(40);
    expect(h.bars.filter((b) => b.label !== '').map((b) => b.label)).toEqual(['0', '39']);
    expect(showBarLabel(h, 0)).toBe(true);
    expect(showBarLabel(h, 11)).toBe(true);
    expect(showBarLabel(h, 3)).toBe(false);
  });

  it('marks the bar holding the current value, including the top edge of the last bin', () => {
    const vals = Array.from({ length: 40 }, (_, i) => i);
    const h = histogramBars(vals, String);
    expect(barHasValue(h, 11, 39)).toBe(true);
    expect(barHasValue(h, 0, 39)).toBe(false);
    expect(barHasValue(h, 0, null)).toBe(false);
  });
});

describe('inBin', () => {
  it('compares exact bars by equality and range bars as half-open except the last', () => {
    const exact = { k: 'hem' as const, lo: 2, hi: 2, ex: true, last: false };
    expect([1, 2, 3].map((v) => inBin(v, exact))).toEqual([false, true, false]);
    const range = { k: 'fr' as const, lo: 10, hi: 20, ex: false, last: false };
    expect([10, 19.99, 20].map((v) => inBin(v, range))).toEqual([true, true, false]);
    expect(inBin(20, { ...range, last: true })).toBe(true);
  });
});

describe('rankOf', () => {
  it('ranks high-first and low-first with ties sharing a place', () => {
    const vals = [1, 2, 2, 3, 4];
    expect(rankOf(vals, 2, 'high')).toMatchObject({ place: 3, tied: 1, lower: 1, higher: 2 });
    expect(rankOf(vals, 2, 'low')).toMatchObject({ place: 2, tied: 1 });
    expect(rankOf(vals, 4, 'high').place).toBe(1);
  });
});

describe('catalog helpers', () => {
  it('finds the loaded set in the catalog only when the size matches', () => {
    const rows = catalog(7, true, 'rahn');
    const major = [0, 2, 4, 5, 7, 9, 11];
    expect(currentRow(rows, major, 7, true, 'rahn')?.hem).toBe(2);
    expect(currentRow(rows, major, 6, true, 'rahn')).toBeNull();
  });

  it('sorts by a column with the set as the tiebreak, both directions', () => {
    const rows = catalog(5, true, 'rahn');
    const asc = sortRows(rows, 'hem', 1, 'rahn').map((r) => r.hem);
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    const desc = sortRows(rows, 'hem', -1, 'rahn').map((r) => r.hem);
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
    expect(sortRows(rows, 'rep', 1, 'rahn')).toHaveLength(rows.length);
  });
});
