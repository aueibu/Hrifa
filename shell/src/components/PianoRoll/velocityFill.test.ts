import { velocityFill, velocityFillColor, velocityLevel } from './velocityFill';

describe('velocityFill', () => {
  it('rises monotonically in saturation and has no alpha', () => {
    const levels = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1].map(velocityFill);
    for (let index = 1; index < levels.length; index += 1) {
      expect(levels[index].colorPercent).toBeGreaterThan(levels[index - 1].colorPercent);
    }
  });

  it('is full strength at 1 and clamps out-of-range and missing values', () => {
    expect(velocityFill(1)).toEqual({ colorPercent: 100 });
    expect(velocityFill(5)).toEqual(velocityFill(1));
    expect(velocityFill(-1)).toEqual(velocityFill(0));
    expect(velocityFill(undefined)).toEqual(velocityFill(1));
    expect(Object.keys(velocityFill(0))).toEqual(['colorPercent']);
  });

  it('mixes the note color toward a theme neutral, never a hex value', () => {
    const quiet = velocityFillColor('var(--mark-red)', 0);
    expect(quiet).toBe(
      'color-mix(in srgb, var(--mark-red) 30%, color-mix(in srgb, var(--text-muted) 45%, var(--panel)))'
    );
    expect(velocityFill(0).colorPercent).toBeGreaterThanOrEqual(25);
    expect(velocityFill(0).colorPercent).toBeLessThanOrEqual(35);
    expect(velocityFill(0.5).colorPercent).toBeGreaterThan(velocityFill(0).colorPercent);
    expect(velocityFill(0.5).colorPercent).toBeLessThan(100);
    expect(quiet).not.toMatch(/#[0-9a-f]{3,6}/i);
    // Opaque at every velocity: no transparent mix anywhere.
    [0, 0.5, 1].forEach((velocity) =>
      expect(velocityFillColor('var(--mark-red)', velocity)).not.toMatch(/transparent|rgba|alpha/)
    );
    expect(velocityFillColor('var(--mark-red)', 1)).toContain('100%');
  });

  it('has a finite-safe level helper', () => {
    expect(velocityLevel(NaN)).toBe(1);
    expect(velocityLevel(Infinity)).toBe(1);
    expect(velocityLevel(-3)).toBe(0);
    expect(velocityLevel(0.4)).toBe(0.4);
  });
});
