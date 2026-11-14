import { describe, expect, it } from 'vitest';
import {
  MAX_COLUMN_REM,
  MIN_COLUMN_REM,
  clampColumnWidth,
  clampShares,
  dragColumnWidths,
  dragSplitter,
  evenShares,
  minShare,
  nudgeColumnWidths,
  nudgeSplitter,
  splitterAt,
  splitterRange,
} from './splitters';

describe('stack share rules (ported from the lab)', () => {
  it('limits each slot to 20% or 6 rem, whichever is larger; a short column is shared evenly', () => {
    expect(minShare(40, 2)).toBe(0.2);
    expect(minShare(20, 2)).toBe(0.3);
    expect(minShare(25, 3)).toBeCloseTo(0.24, 9);
    expect(minShare(12, 2)).toBe(0.5);
    expect(minShare(18, 3)).toBeCloseTo(1 / 3, 9);
    expect(minShare(0, 2)).toBe(0.2);
  });
  it('repairs shares to the minimum, summing to 1', () => {
    expect(clampShares([0.5, 0.5], 40)).toEqual([0.5, 0.5]);
    expect(clampShares([0.05, 0.95], 40)).toEqual([0.2, 0.8]);
    expect(clampShares([0.97, 0.03], 40)).toEqual([0.8, 0.2]);
    for (const s of [
      [0.05, 0.9, 0.05],
      [0.1, 0.1, 0.8],
    ]) {
      const c = clampShares(s, 40);
      expect(c.every((v) => v >= 0.2 - 1e-9)).toBe(true);
      expect(c.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    }
    expect(clampShares([0.1, 0.9], 10)).toEqual([0.5, 0.5]);
    expect(clampShares([Number.NaN, 0.5], 40)).toEqual([0.5, 0.5]);
  });
  it('drags one splitter, trading between its two neighbours only', () => {
    expect(evenShares(3)).toEqual([0.3333, 0.3333, 0.3333]);
    expect(dragSplitter([0.3, 0.4, 0.3], 0, 0.5, 40)).toEqual([0.5, 0.2, 0.3]);
    expect(dragSplitter([0.3, 0.4, 0.3], 0, 0.95, 40)).toEqual([0.5, 0.2, 0.3]);
    expect(dragSplitter([0.3, 0.4, 0.3], 0, 0, 40)).toEqual([0.2, 0.5, 0.3]);
    expect(dragSplitter([0.3, 0.4, 0.3], 1, 0.6, 40)).toEqual([0.3, 0.3, 0.4]);
    expect(dragSplitter([0.5, 0.5], 5, 0.3, 40)).toEqual([0.5, 0.5]);
    expect(splitterRange([0.3, 0.4, 0.3], 0, 40)).toEqual({ min: 0.2, max: 0.5 });
    expect(splitterAt([0.3, 0.4, 0.3], 1)).toBe(0.7);
  });
  it('nudges 5% and jumps to the limits', () => {
    expect(nudgeSplitter([0.5, 0.5], 0, 'ArrowDown', 40)).toEqual([0.55, 0.45]);
    expect(nudgeSplitter([0.5, 0.5], 0, 'ArrowUp', 40)).toEqual([0.45, 0.55]);
    expect(nudgeSplitter([0.5, 0.5], 0, 'Home', 40)).toEqual([0.2, 0.8]);
    expect(nudgeSplitter([0.5, 0.5], 0, 'End', 40)).toEqual([0.8, 0.2]);
    expect(nudgeSplitter([0.8, 0.2], 0, 'ArrowDown', 40)).toEqual([0.8, 0.2]);
  });
});

describe('column widths', () => {
  it('clamps to the limits and repairs non-numbers to the default', () => {
    expect(clampColumnWidth(3)).toBe(MIN_COLUMN_REM);
    expect(clampColumnWidth(500)).toBe(MAX_COLUMN_REM);
    expect(clampColumnWidth(Number.NaN)).toBe(36);
  });
  it('dragging keeps the total and respects both minimums', () => {
    expect(dragColumnWidths(36, 36, 40)).toEqual([40, 32]);
    expect(dragColumnWidths(36, 36, 1)).toEqual([MIN_COLUMN_REM, 72 - MIN_COLUMN_REM]);
    expect(dragColumnWidths(36, 36, 500)).toEqual([72 - MIN_COLUMN_REM, MIN_COLUMN_REM]);
    expect(dragColumnWidths(36, 36, Number.NaN)).toEqual([36, 36]);
  });
  it('respects the maximum of the other side when the total is large', () => {
    const [l, r] = dragColumnWidths(90, 90, 20);
    expect(l + r).toBe(180);
    expect(r).toBeLessThanOrEqual(MAX_COLUMN_REM);
    expect(l).toBe(180 - MAX_COLUMN_REM);
  });
  it('nudges 1 rem and jumps to the limits', () => {
    expect(nudgeColumnWidths(36, 36, 'ArrowRight')).toEqual([37, 35]);
    expect(nudgeColumnWidths(36, 36, 'ArrowLeft')).toEqual([35, 37]);
    expect(nudgeColumnWidths(36, 36, 'Home')).toEqual([12, 60]);
    expect(nudgeColumnWidths(12, 36, 'ArrowLeft')).toEqual([12, 36]);
  });
});
