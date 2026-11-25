import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hexToLinearRgb, linearContrast } from './markers';
import { RADIX, RADIX_HUES, RADIX_STEPS_USED } from './radix';
import { semanticVariablesResolver } from './semantic';
import { defaultThemeTokens } from './tokens';

describe('radix.ts', () => {
  it('has all eight hues with 12 hex steps in both schemes', () => {
    expect(RADIX_HUES).toHaveLength(8);
    for (const scheme of ['light', 'dark'] as const) {
      expect(Object.keys(RADIX[scheme]).sort()).toEqual([...RADIX_HUES].sort());
      for (const hue of RADIX_HUES) {
        const steps = RADIX[scheme][hue];
        expect(steps, `${scheme} ${hue}`).toHaveLength(12);
        for (const v of steps) {
          expect(v).toMatch(/^#[0-9a-f]{6}$/);
        }
      }
    }
  });

  it('the header carries the MIT notice and the Radix Colors version', () => {
    const src = readFileSync(new URL('./radix.ts', import.meta.url), 'utf8');
    const header = src.slice(0, src.indexOf('export type'));
    expect(header).toContain('MIT License');
    expect(header).toContain('Permission is hereby granted, free of charge');
    expect(header).toMatch(/@radix-ui\/colors \d+\.\d+\.\d+/);
  });

  it('the resolver emits --rx-<hue>-<step> for steps 2 to 12 in both schemes', () => {
    expect(RADIX_STEPS_USED).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const out = semanticVariablesResolver({} as never);
    for (const scheme of ['light', 'dark'] as const) {
      for (const hue of RADIX_HUES) {
        for (const step of RADIX_STEPS_USED) {
          expect(out[scheme][`--rx-${hue}-${step}`], `${scheme} ${hue} ${step}`).toBe(
            RADIX[scheme][hue][step - 1]
          );
        }
      }
    }
  });

  it('Radix --mark-<hue> holds 3:1 on --panel and --tint-<hue>-text holds 7:1 on --tint-<hue>-bg', () => {
    const out = semanticVariablesResolver({} as never);
    const panel = {
      light: hexToLinearRgb(defaultThemeTokens.white),
      dark: hexToLinearRgb(defaultThemeTokens.dark[7]),
    };
    for (const scheme of ['light', 'dark'] as const) {
      for (const hue of RADIX_HUES) {
        const mark = hexToLinearRgb(out[scheme][`--mark-${hue}`]);
        expect(
          linearContrast(mark, panel[scheme]),
          `${scheme} --mark-${hue}`
        ).toBeGreaterThanOrEqual(3);
        const bg = hexToLinearRgb(out[scheme][`--tint-${hue}-bg`]);
        const text = hexToLinearRgb(out[scheme][`--tint-${hue}-text`]);
        expect(linearContrast(text, bg), `${scheme} --tint-${hue}`).toBeGreaterThanOrEqual(7);
      }
    }
  });
});
