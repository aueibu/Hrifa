import { describe, expect, it } from 'vitest';
import {
  classifyHeight,
  classifyWidth,
  nearestSupportedSize,
  nextHeightClass,
  nextWidthClass,
  pxToRem,
  sizeAtLeast,
  sizeOf,
  slotSizeAttr,
  type SlotSize,
} from './size';

const S = (width: SlotSize['width'], height: SlotSize['height']): SlotSize => ({ width, height });

describe('classification at the boundaries', () => {
  it('width: narrow below 30, regular to under 42, wide from 42', () => {
    expect(classifyWidth(29.99)).toBe('narrow');
    expect(classifyWidth(30)).toBe('regular');
    expect(classifyWidth(41.99)).toBe('regular');
    expect(classifyWidth(42)).toBe('wide');
  });
  it('height: short below 30, regular to under 42, tall from 42', () => {
    expect(classifyHeight(29.99)).toBe('short');
    expect(classifyHeight(30)).toBe('regular');
    expect(classifyHeight(41.99)).toBe('regular');
    expect(classifyHeight(42)).toBe('tall');
  });
  it('below the minimum, zero, negative and NaN are the smallest class', () => {
    for (const v of [11.9, 5, 0, -3, Number.NaN]) {
      expect(classifyWidth(v)).toBe('narrow');
      expect(classifyHeight(v)).toBe('short');
    }
  });
  it('converts px to rem', () => {
    expect(pxToRem(480)).toBe(30);
    expect(pxToRem(480, 13)).toBeCloseTo(36.92, 2);
    expect(pxToRem(160, 0)).toBe(10);
  });
});

describe('hysteresis', () => {
  it('does not flicker for a value wobbling less than 0.5 rem around a boundary', () => {
    for (const b of [30, 42]) {
      let w = nextWidthClass(undefined, b - 1);
      const before = w;
      for (const v of [b - 0.4, b + 0.4, b - 0.49, b + 0.49, b, b - 0.1]) {
        w = nextWidthClass(w, v);
        expect(w).toBe(before);
      }
      let h = nextHeightClass(undefined, b + 1);
      const hb = h;
      for (const v of [b + 0.4, b - 0.4, b - 0.49, b + 0.49, b]) {
        h = nextHeightClass(h, v);
        expect(h).toBe(hb);
      }
    }
  });
  it('changes after a real move: up at B + 0.5, down below B - 0.5', () => {
    expect(nextWidthClass('narrow', 30.49)).toBe('narrow');
    expect(nextWidthClass('narrow', 30.5)).toBe('regular');
    expect(nextWidthClass('regular', 29.5)).toBe('regular');
    expect(nextWidthClass('regular', 29.49)).toBe('narrow');
    expect(nextWidthClass('regular', 42.5)).toBe('wide');
    expect(nextWidthClass('wide', 41.5)).toBe('wide');
    expect(nextWidthClass('wide', 41.49)).toBe('regular');
    expect(nextHeightClass('short', 30.5)).toBe('regular');
    expect(nextHeightClass('tall', 41.49)).toBe('regular');
  });
  it('a big jump crosses both boundaries at once', () => {
    expect(nextWidthClass('narrow', 60)).toBe('wide');
    expect(nextWidthClass('wide', 10)).toBe('narrow');
  });
  it('with no previous class it is the plain rule', () => {
    expect(sizeOf(30, 29.99)).toEqual(S('regular', 'short'));
    expect(sizeOf(41.99, 42)).toEqual(S('regular', 'tall'));
  });
  it('sizeOf applies it per axis', () => {
    expect(sizeOf(30.2, 42.2, S('narrow', 'regular'))).toEqual(S('narrow', 'regular'));
    expect(sizeOf(31, 43, S('narrow', 'regular'))).toEqual(S('regular', 'tall'));
  });
});

describe('sizeAtLeast, nearestSupportedSize, slotSizeAttr', () => {
  it('sizeAtLeast compares both axes', () => {
    expect(sizeAtLeast(S('wide', 'tall'), S('narrow', 'short'))).toBe(true);
    expect(sizeAtLeast(S('regular', 'short'), S('regular', 'regular'))).toBe(false);
    expect(sizeAtLeast(S('narrow', 'tall'), S('regular', 'short'))).toBe(false);
    expect(sizeAtLeast(S('regular', 'regular'), S('regular', 'regular'))).toBe(true);
  });
  it('picks the size itself when supported', () => {
    expect(
      nearestSupportedSize(S('wide', 'tall'), [S('narrow', 'tall'), S('wide', 'tall')])
    ).toEqual(S('wide', 'tall'));
  });
  it('picks the largest supported that fits', () => {
    const supported = [S('narrow', 'short'), S('regular', 'regular'), S('narrow', 'tall')];
    expect(nearestSupportedSize(S('wide', 'tall'), supported)).toEqual(S('regular', 'regular'));
    expect(nearestSupportedSize(S('narrow', 'tall'), supported)).toEqual(S('narrow', 'tall'));
    expect(nearestSupportedSize(S('regular', 'short'), supported)).toEqual(S('narrow', 'short'));
  });
  it('else the smallest supported', () => {
    const supported = [S('wide', 'tall'), S('regular', 'regular')];
    expect(nearestSupportedSize(S('narrow', 'short'), supported)).toEqual(S('regular', 'regular'));
  });
  it('returns the size when nothing is declared', () => {
    const s = S('regular', 'tall');
    expect(nearestSupportedSize(s, [])).toBe(s);
  });
  it('formats the data attribute', () => {
    expect(slotSizeAttr(S('narrow', 'tall'))).toBe('narrow-tall');
  });
});

describe('review additions', () => {
  it('keeps the previous class for a non-finite measurement', () => {
    expect(nextWidthClass('wide', Number.NaN)).toBe('wide');
    expect(nextHeightClass('short', Number.POSITIVE_INFINITY)).toBe('short');
    expect(nextWidthClass('regular', Number.NEGATIVE_INFINITY)).toBe('regular');
    expect(sizeOf(Number.NaN, Number.NaN, S('regular', 'tall'))).toEqual(S('regular', 'tall'));
    expect(nextWidthClass(undefined, Number.NaN)).toBe('narrow');
  });
  it('from regular, 41.4 drops back to regular only below 41.5 and 42.4 does not yet go wide', () => {
    expect(nextWidthClass('wide', 41.4)).toBe('regular');
    expect(nextWidthClass('regular', 42.4)).toBe('regular');
    expect(nextHeightClass('regular', 41.4)).toBe('regular');
    expect(nextHeightClass('regular', 42.4)).toBe('regular');
  });
});
