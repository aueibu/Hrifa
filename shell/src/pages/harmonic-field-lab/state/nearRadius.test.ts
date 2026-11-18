import { describe, expect, it } from 'vitest';
import { nearRatios, parseInterval, ratioNote } from '../../../lib/harmonic-field';
import { REL_RADII, edoError, type EntropySource } from './intervalColor';
import {
  RADIUS_DIP_SHARE,
  RADIUS_LABELS,
  effectiveRadius,
  radiusFloor,
  radiusOrder,
  radiusRingLabel,
  radiusRingValues,
  radiusScaleValue,
  radiusValue,
} from './nearRadius';

const item = (text: string) => {
  const note = parseInterval(text);
  if (!note) {
    throw new Error(text);
  }
  const [a, b] = text.split('/').map(Number);
  const odd = (v: number) => {
    let m = v;
    while (m % 2 === 0) {
      m /= 2;
    }
    return m;
  };
  return { note, odd: Math.max(odd(a), odd(b)), tenney: Math.log2(a * b) };
};

describe('Near radius (M9c)', () => {
  it('every Radius choice has a label', () => {
    expect(REL_RADII.map((r) => RADIUS_LABELS[r])).toEqual([
      'Tenney',
      'Odd limit',
      'Roughness',
      'Harmonic entropy',
      '|error| vs 12-EDO',
    ]);
  });
  it('each metric supplies its value per ratio', () => {
    const r = item('5/4');
    expect(radiusValue('tenney', r)).toBeCloseTo(4.322, 2);
    expect(radiusValue('odd', r)).toBe(5);
    expect(radiusValue('errorSize', r)).toBeCloseTo(edoError(r.note.c), 9);
    expect(radiusValue('roughness', item('3/2'))).toBeLessThan(
      radiusValue('roughness', item('81/80'))
    );
    const he: EntropySource = { lo: 0, hi: 5, at: (c) => c / 1000 };
    expect(radiusValue('entropy', r, he)).toBeCloseTo(r.note.c / 1000, 9);
    expect(radiusValue('entropy', r, null)).toBe(0);
  });
  it('the Entropy radius waits for its curve (Tenney meanwhile); the others never wait', () => {
    expect(effectiveRadius('entropy', false)).toBe('tenney');
    expect(effectiveRadius('entropy', true)).toBe('entropy');
    expect(effectiveRadius('odd', false)).toBe('odd');
  });
  it('the dot cap keeps the lowest odd limits for Odd limit, the lowest Tenney for the others', () => {
    expect(radiusOrder('odd')).toBe('odd');
    for (const r of ['tenney', 'roughness', 'entropy', 'errorSize'] as const) {
      expect(radiusOrder(r)).toBe('tenney');
    }
    // the ratios that exist do not depend on the radius: the same set under either order, only the sequence differs
    const base = { spanC: 1200, oddCap: 15 };
    const a = nearRatios(ratioNote(1, 1), { ...base, order: 'odd' });
    const b = nearRatios(ratioNote(1, 1), { ...base, order: 'tenney' });
    expect(new Set(a.items.map((x) => x.text))).toEqual(new Set(b.items.map((x) => x.text)));
  });
  it('Scale: Even is the count-like size for Tenney only; Linear is the value; Log is log(1 + v)', () => {
    expect(radiusScaleValue('tenney', 'even', 4)).toBe(4);
    expect(radiusScaleValue('odd', 'even', 7)).toBe(7);
    expect(radiusScaleValue('roughness', 'even', 1.5)).toBe(1.5);
    expect(radiusScaleValue('errorSize', 'linear', 12)).toBe(12);
    expect(radiusScaleValue('entropy', 'log', 1)).toBeCloseTo(Math.log(2), 12);
    expect(radiusScaleValue('tenney', 'log', 0)).toBe(0);
  });
  it('ring values: Tenney whole numbers, odd limits 7, 15, ... plus the outer one, round steps for the rest', () => {
    expect(radiusRingValues('tenney', 2.2, 6.1)).toEqual([3, 4, 5, 6]);
    expect(radiusRingValues('odd', 3, 100)).toEqual([7, 15, 31, 63, 100]);
    expect(radiusRingValues('odd', 3, 127)).toEqual([7, 15, 31, 63, 127]);
    // 0 to 40 c in steps of 5 (about eight rings)
    expect(radiusRingValues('errorSize', 0, 40)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40]);
    const r = radiusRingValues('roughness', 0, 4.39);
    expect(r[0]).toBe(0);
    expect(r.length).toBeGreaterThanOrEqual(5);
    expect(r.length).toBeLessThanOrEqual(10);
    for (const v of r) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(4.39);
    }
    // a flat range has no rings
    expect(radiusRingValues('entropy', 2, 2)).toEqual([]);
  });
  it('F10: the Entropy floor exists only when the dots reach below the Fixed bounds and have room above them', () => {
    const he: EntropySource = { lo: 1, hi: 5, at: () => 0 };
    expect(radiusFloor('entropy', he, 0.2, 4)).toBe(1);
    expect(radiusFloor('entropy', he, 1.5, 4)).toBeUndefined(); // no dot below the bounds
    expect(radiusFloor('entropy', he, 0.2, 0.9)).toBeUndefined(); // every dot below them
    expect(radiusFloor('entropy', null, 0.2, 4)).toBeUndefined();
    expect(radiusFloor('tenney', he, 0.2, 4)).toBeUndefined();
    expect(RADIUS_DIP_SHARE).toBeGreaterThan(0);
    expect(RADIUS_DIP_SHARE).toBeLessThan(0.5);
  });
  it('ring labels: T, o, R and H with 2 decimals, cents with c', () => {
    expect(radiusRingLabel('tenney', 7)).toBe('T7');
    expect(radiusRingLabel('odd', 15)).toBe('o15');
    expect(radiusRingLabel('roughness', 0.5)).toBe('R0.50');
    expect(radiusRingLabel('entropy', 1.234)).toBe('H1.23');
    expect(radiusRingLabel('errorSize', 12.04)).toBe('12c');
  });
});
