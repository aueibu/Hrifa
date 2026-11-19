/** M9f: the per-prime complexity split of the Monzo header (SCENARIOS.M9f F1 to F8). */
import { describe, expect, it } from 'vitest';
import {
  MONZO_SPLIT_DEFAULT,
  partText,
  percentText,
  primeSplit,
  sanitizeMonzoSplit,
} from './primeSplit';

const comma = { 2: -4, 3: 4, 5: -1 }; // 81/80
const pct = (s: ReturnType<typeof primeSplit>) =>
  s.parts.filter((p) => p.share > 0).map((p) => Math.round(p.share * 100));

describe('primeSplit', () => {
  it('L1 (Tenney), octaves counted: 81/80 is 32 / 50 / 18, total 12.66', () => {
    const s = primeSplit(comma, 'l1', true);
    expect(pct(s)).toEqual([32, 50, 18]);
    expect(s.total).toBeCloseTo(12.66, 2);
    expect(s.parts[1].a).toBeCloseTo(6.34, 2);
  });

  it('octaves off drops prime 2: 73 / 27, total 8.66, and 2 is not counted', () => {
    const s = primeSplit(comma, 'l1', false);
    expect(pct(s)).toEqual([73, 27]);
    expect(s.total).toBeCloseTo(8.66, 2);
    expect(s.parts[0].counted).toBe(false);
    expect(s.parts[0].share).toBe(0);
  });

  it('L2 (TE): 26 / 65 / 9 with norm 7.85; octaves off 88 / 12 with 6.75', () => {
    const on = primeSplit(comma, 'l2', true);
    expect(pct(on)).toEqual([26, 65, 9]);
    expect(on.total).toBeCloseTo(7.85, 2);
    const off = primeSplit(comma, 'l2', false);
    expect(pct(off)).toEqual([88, 12]);
    expect(off.total).toBeCloseTo(6.75, 2);
  });

  it('L-inf: bars are a / max (63 / 100 / 37), total 6.34, the largest (3) is flagged', () => {
    const s = primeSplit(comma, 'linf', true);
    expect(pct(s)).toEqual([63, 100, 37]);
    expect(s.total).toBeCloseTo(6.34, 2);
    expect(s.parts.filter((p) => p.isMax).map((p) => p.prime)).toEqual([3]);
    expect(s.parts.map((p) => percentText(p, 'linf')).join('|')).toBe('|max|||||||||||');
    const off = primeSplit(comma, 'linf', false);
    expect(pct(off)).toEqual([100, 37]);
  });

  it('the landing 81/64 splits 49 / 51 and the 7 preview 26 / 41 / 15 / 18 (total 15.47)', () => {
    expect(pct(primeSplit({ 2: -6, 3: 4 }, 'l1', true))).toEqual([49, 51]);
    const s = primeSplit({ ...comma, 7: 1 }, 'l1', true);
    expect(pct(s)).toEqual([26, 41, 15, 18]);
    expect(s.total).toBeCloseTo(15.47, 2);
  });

  it('the inverse has the same shares and total (sizes do not depend on sign)', () => {
    const inv = primeSplit({ 2: 4, 3: -4, 5: 1 }, 'l1', true);
    expect(pct(inv)).toEqual([32, 50, 18]);
    expect(inv.total).toBeCloseTo(12.66, 2);
  });

  it('all zero (or nothing): total 0, no shares, no percent text', () => {
    for (const m of [{}, null, undefined, { 3: 0 }]) {
      for (const norm of ['l1', 'l2', 'linf'] as const) {
        const s = primeSplit(m, norm, true);
        expect(s.total).toBe(0);
        expect(s.parts.every((p) => p.share === 0 && !p.isMax)).toBe(true);
        expect(s.parts.every((p) => percentText(p, norm) === '')).toBe(true);
      }
    }
  });

  it('percentText rounds to whole percent; partText gives the exact numbers', () => {
    const s = primeSplit(comma, 'l1', true);
    expect(percentText(s.parts[1], 'l1')).toBe('50');
    expect(partText(s.parts[1], s.total, 'l1', true)).toBe(
      '3: 6.34 of 12.66 (50 %), L1, octaves counted'
    );
    const off = primeSplit(comma, 'l1', false);
    expect(partText(off.parts[0], off.total, 'l1', false)).toContain('not counted');
  });
});

describe('sanitizeMonzoSplit', () => {
  it('absent or damaged reads L1 / on, field by field', () => {
    expect(sanitizeMonzoSplit(undefined)).toEqual(MONZO_SPLIT_DEFAULT);
    expect(sanitizeMonzoSplit('x')).toEqual({ norm: 'l1', octaves: true, fit: false });
    expect(sanitizeMonzoSplit({ norm: 'l3', octaves: 1, fit: 'y' })).toEqual({
      norm: 'l1',
      octaves: true,
      fit: false,
    });
    expect(sanitizeMonzoSplit({ norm: 'l2' })).toEqual({ norm: 'l2', octaves: true, fit: false });
    expect(sanitizeMonzoSplit({ norm: 'bad', octaves: false, fit: true })).toEqual({
      norm: 'l1',
      octaves: false,
      fit: true,
    });
    expect(sanitizeMonzoSplit({ norm: 'linf', octaves: false })).toEqual({
      norm: 'linf',
      octaves: false,
      fit: false,
    });
  });
});

describe('F15 / F16: Fit bars and the octave ghost', () => {
  const bars = (s: ReturnType<typeof primeSplit>) =>
    s.parts.filter((p) => p.a > 0).map((p) => Math.round(p.bar * 100));
  it('fit off: the bar is the share', () => {
    expect(bars(primeSplit(comma, 'l1', true))).toEqual([32, 50, 18]);
  });
  it('fit on, 81/80: L1 63 / 100 / 37, L2 40 / 100 / 13, L-inf unchanged; numbers (shares) do not change', () => {
    const l1 = primeSplit(comma, 'l1', true, true);
    expect(bars(l1)).toEqual([63, 100, 37]);
    expect(pct(l1)).toEqual([32, 50, 18]);
    expect(bars(primeSplit(comma, 'l2', true, true))).toEqual([40, 100, 13]);
    expect(bars(primeSplit(comma, 'linf', true, true))).toEqual([63, 100, 37]);
    expect(bars(primeSplit(comma, 'linf', true, false))).toEqual([63, 100, 37]);
  });
  it('octaves off: prime 2 has a ghost at 4.00 / 8.66 = 46 % (Fit: 4.00 / 6.34 = 63 %), no bar', () => {
    const s = primeSplit(comma, 'l1', false);
    expect(s.parts[0].bar).toBe(0);
    expect(s.parts[0].ghost).toBeCloseTo(4 / 8.66, 2);
    expect(Math.round(s.parts[0].ghost * 100)).toBe(46);
    expect(Math.round(primeSplit(comma, 'l1', false, true).parts[0].ghost * 100)).toBe(63);
    expect(s.parts[1].ghost).toBe(0);
  });
  it('no ghost when octaves count or prime 2 is 0; a ghost never exceeds the zone', () => {
    expect(primeSplit(comma, 'l1', true).parts[0].ghost).toBe(0);
    expect(primeSplit({ 3: 1 }, 'l1', false).parts[0].ghost).toBe(0);
    expect(primeSplit({ 2: 5, 3: 1 }, 'l1', false).parts[0].ghost).toBe(1);
    expect(primeSplit({ 2: 5 }, 'l1', false).parts[0].ghost).toBe(1);
  });
});
