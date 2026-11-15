import { describe, expect, it } from 'vitest';
import { fmtRatio, ratioNote } from './intervals';
import { matchToField, sketchPitches } from './sketch';
import type { Note } from './types';

describe('sketchPitches', () => {
  it('places 4:5:6 exactly on a rational root, root first', () => {
    const p = sketchPitches(ratioNote(3, 2), '4:5:6')!;
    expect(p.map(fmtRatio)).toEqual(['3/2', '15/8', '9/4']);
    expect(p[1].m).not.toBeNull();
  });
  it('an irrational root keeps cents only', () => {
    const p = sketchPitches({ m: null, c: 100 }, '4:5:6')!;
    expect(p.every((n) => n.m === null)).toBe(true);
    expect(p[1].c).toBeCloseTo(100 + 386.3137, 3);
  });
  it('utonal templates are stacked from the lowest note', () => {
    const p = sketchPitches(ratioNote(1, 1), '1/(4:5:6)')!;
    expect(p.map(fmtRatio)).toEqual(['1/1', '6/5', '3/2']);
  });
  it('null for a bad template', () => {
    expect(sketchPitches(ratioNote(1, 1), 'junk')).toBeNull();
  });
});

describe('matchToField', () => {
  const rep = ratioNote(2, 1);
  const field: Note[] = [ratioNote(1, 1), ratioNote(5, 4), ratioNote(3, 2)];
  it('finds exact notes (reducing past the repeat) and measures the outsiders', () => {
    const m = matchToField(field, rep, [
      ratioNote(1, 1),
      ratioNote(9, 4),
      { m: null, c: 1200 - 10 },
    ]);
    expect(m[0]).toEqual({ idx: 0, dist: 0 });
    // 9/4 is not a field note: nearest is 5/4 reduced from 9/8 is 203.9 c; 9/8 wraps (not 5/4)
    expect(m[1].idx).toBeNull();
    expect(m[1].dist).toBeCloseTo(386.3137 - 203.91, 2);
    // 1190 c is 10 c below the repeat: nearest field note is 1/1 at 1200 (wrapped), +10 c
    expect(m[2].idx).toBeNull();
    expect(m[2].dist).toBeCloseTo(10, 6);
  });
  it('an empty field matches nothing', () => {
    const m = matchToField([], rep, [ratioNote(3, 2)]);
    expect(m[0].idx).toBeNull();
    expect(Number.isNaN(m[0].dist)).toBe(true);
  });
});
