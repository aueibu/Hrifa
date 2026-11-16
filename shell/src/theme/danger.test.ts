import { describe, expect, it } from 'vitest';
import { hexToLinearRgb, linearContrast, markHex, markTint } from './markers';
import { semanticVariablesResolver } from './semantic';
import { defaultThemeTokens as T } from './tokens';

/**
 * `--text-danger`: the text-safe red. Dark is `--tint-red-text`; light is `--mark-red` darkened by mixing 85% of it
 * with `--text` (the black token). Surfaces: `--panel`, `--panel-slot` and the Mantine input background.
 */
const mixHex = (a: string, b: string, aPercent: number) => {
  const channel = (hex: string, i: number) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2]
    .map((i) =>
      Math.round((channel(a, i) * aPercent) / 100 + (channel(b, i) * (100 - aPercent)) / 100)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
};

function dangerAndSurfaces(scheme: 'light' | 'dark') {
  if (scheme === 'light') {
    return {
      text: mixHex(markHex(T.markerHues.red, 'light', 'red'), T.black, 85),
      surfaces: { panel: T.white, slot: T.gray[1], input: T.white },
    };
  }
  const base = { background: T.dark[6], hover: T.dark[5] };
  return {
    text: markTint(T.markerHues.red, 'dark', base).text,
    surfaces: { panel: T.dark[7], slot: T.dark[6], input: T.dark[6] },
  };
}

describe('--text-danger', () => {
  for (const scheme of ['light', 'dark'] as const) {
    it(`${scheme}: at least 4.5:1 on the panel, the slot and the input background`, () => {
      const { text, surfaces } = dangerAndSurfaces(scheme);
      for (const [name, bg] of Object.entries(surfaces)) {
        const ratio = linearContrast(hexToLinearRgb(text), hexToLinearRgb(bg));
        expect(ratio, `${scheme} on ${name}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`${scheme}: the resolver points Mantine's error color at the role`, () => {
      const out = semanticVariablesResolver({} as never)[scheme];
      expect(out['--mantine-color-error']).toBe('var(--text-danger)');
      expect(out['--text-danger']).toBeTruthy();
    });
  }

  it('light stays red, not near-black', () => {
    const { text } = dangerAndSurfaces('light');
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(text.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(2 * Math.max(g, b) - 20);
  });
});
