import { describe, expect, it } from 'vitest';
import {
  defaultMarkerHues,
  defaultMarkerRamp,
  markerHueCollisions,
  markerPalette,
  maxSrgbChroma,
  nudgeMarkerHue,
} from './markers';

describe('marker hue collisions', () => {
  it('finds neighbors closer than the configured distance, including across zero degrees', () => {
    const hues = { ...defaultMarkerHues, pink: 12, red: 350 };

    expect(markerHueCollisions(hues)).toContainEqual({ distance: 22, names: ['red', 'pink'] });
  });

  it('does not flag hues exactly at the minimum distance', () => {
    const hues = { ...defaultMarkerHues, pink: 300, red: 0, orange: 25 };

    expect(
      markerHueCollisions(hues).find((collision) => collision.names.includes('red'))
    ).toBeUndefined();
  });

  it('wraps hue nudges around the wheel', () => {
    expect(nudgeMarkerHue(359, 1)).toBe(0);
    expect(nudgeMarkerHue(0, -1)).toBe(359);
  });

  it('keeps every generated stop within its calculated sRGB chroma boundary', () => {
    const palette = markerPalette(defaultMarkerHues.yellow, { ...defaultMarkerRamp, cap: 0.3 });

    palette.forEach((color) => {
      const [, lightness, chroma] = color.match(/oklch\(([\d.]+)% ([\d.]+)/) ?? [];
      expect(Number(chroma)).toBeLessThanOrEqual(
        maxSrgbChroma(Number(lightness) / 100, defaultMarkerHues.yellow) + 0.001
      );
    });
  });

  it('uses more of the available gamut at the endpoints when end boost is enabled', () => {
    const standard = markerPalette(defaultMarkerHues.blue, defaultMarkerRamp);
    const boosted = markerPalette(defaultMarkerHues.blue, { ...defaultMarkerRamp, endBoost: 1 });

    expect(boosted[0]).not.toBe(standard[0]);
    expect(boosted[6]).toBe(standard[6]);
    expect(boosted[9]).not.toBe(standard[9]);
  });
});
