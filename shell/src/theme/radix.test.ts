import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RADIX, RADIX_HUES, RADIX_STEPS_USED } from './radix';
import { semanticVariablesResolver } from './semantic';

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
});
