import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hexToLinearRgb, linearContrast, markTint } from '../../../theme/markers';
import { defaultThemeTokens as T } from '../../../theme/tokens';

/**
 * The lab's red text (a can't-read message, a refusal, an alert note, the worst error size) uses `--tint-red-text`, not
 * `--mark-red` (4.22:1 on the dark panel) and not Mantine's error color (red-8 in dark: 1.21:1 on the dark panel). Method:
 * the real theme tokens, the panel being `--panel` (white or dark-7) and, for a tinted strip, `--panel-slot`.
 */
describe('red text role', () => {
  for (const scheme of ['light', 'dark'] as const) {
    it(`${scheme}: --tint-red-text keeps at least 4.5:1 on the panel and on the slot and tint fills it can sit on`, () => {
      const base =
        scheme === 'light'
          ? { background: T.gray[1], hover: T.gray[2] }
          : { background: T.dark[6], hover: T.dark[5] };
      const tint = markTint(T.markerHues.red, scheme, base);
      const panel = scheme === 'light' ? T.white : T.dark[7];
      for (const bg of [panel, base.background, tint.background]) {
        const ratio = linearContrast(hexToLinearRgb(tint.text), hexToLinearRgb(bg));
        expect(ratio).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it('the lab CSS sets no text color from --mark-red or Mantine red', () => {
    for (const f of ['lab', 'panels']) {
      const css = readFileSync(new URL(`../components/${f}.module.css`, import.meta.url), 'utf8');
      expect(css).not.toMatch(/(^|[\s;{])color:\s*var\(--mark-red\)/);
      expect(css).not.toMatch(/(^|[\s;{])color:\s*var\(--mantine-color-(red|error)/);
    }
  });
});
