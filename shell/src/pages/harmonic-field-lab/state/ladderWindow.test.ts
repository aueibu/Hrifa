import { describe, expect, it } from 'vitest';
import { ladderWindow, nearestHidden } from './ladderWindow';

describe('ladderWindow (M8g g, h)', () => {
  it('g: 14 rungs, the 7th selected: 3 each side, +3 before and +4 after', () => {
    const w = ladderWindow(14, 6);
    expect(w).toEqual({ start: 3, end: 10, before: 3, after: 4 });
    expect(nearestHidden(w, 'before')).toBe(2);
    expect(nearestHidden(w, 'after')).toBe(10);
  });
  it('h: the last selected: still 7 tiles, +n only on the left', () => {
    expect(ladderWindow(14, 13)).toEqual({ start: 7, end: 14, before: 7, after: 0 });
  });
  it('the first selected: +n only on the right', () => {
    expect(ladderWindow(14, 0)).toEqual({ start: 0, end: 7, before: 0, after: 7 });
  });
  it('near the start the window slides (selection off-center)', () => {
    expect(ladderWindow(14, 1)).toEqual({ start: 0, end: 7, before: 0, after: 7 });
  });
  it('7 or fewer rungs: all shown, no +n; none: empty', () => {
    expect(ladderWindow(7, 3)).toEqual({ start: 0, end: 7, before: 0, after: 0 });
    expect(ladderWindow(3, 1)).toEqual({ start: 0, end: 3, before: 0, after: 0 });
    expect(ladderWindow(0, -1)).toEqual({ start: 0, end: 0, before: 0, after: 0 });
  });
  it('a missing selection counts as the first', () => {
    expect(ladderWindow(20, -1).start).toBe(0);
  });
});
