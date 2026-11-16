import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TINT_MAX, TINT_MIN } from '../../../lib/harmonic-field';
import { hexToLinearRgb, linearContrast, markHex, markerColorNames } from '../../../theme/markers';
import { defaultThemeTokens as T } from '../../../theme/tokens';
import { defaultUi } from './labState';
import {
  HUE_CAP,
  WHEEL_ORDER,
  strengthCap,
  wheelColor,
  wheelFill,
  wheelSegment,
} from './pairsColor';
import { sanitizeSettings } from './persist';

describe('wheel colors', () => {
  it('the wheel runs red, orange, yellow, green, cyan, blue, violet, pink and back to red, all real mark roles', () => {
    expect(WHEEL_ORDER).toHaveLength(8);
    expect(WHEEL_ORDER.every((n) => (markerColorNames as readonly string[]).includes(n))).toBe(
      true
    );
    expect(wheelSegment(0)).toEqual({ a: 'red', b: 'orange', f: 0 });
    expect(wheelSegment(0.5)).toEqual({ a: 'cyan', b: 'blue', f: 0 });
    expect(wheelSegment(7.5 / 8)).toMatchObject({ a: 'pink', b: 'red' });
    expect(wheelSegment(7.5 / 8).f).toBeCloseTo(0.5, 6);
    expect(wheelSegment(1)).toEqual({ a: 'red', b: 'orange', f: 0 });
  });

  it('builds only var() roles and color-mix, never a hex value', () => {
    for (const pos of [0, 0.1, 0.33, 0.5, 0.77, 0.999]) {
      const s = wheelFill(pos, 0.3);
      expect(s).not.toMatch(/#[0-9a-f]{3,8}/i);
      expect(s).toMatch(/^color-mix\(in srgb, .* 30%, var\(--panel\)\)$/);
    }
    expect(wheelColor(0)).toBe('var(--mark-red)');
    expect(wheelColor(1 / 16)).toBe('color-mix(in oklch, var(--mark-red) 50%, var(--mark-orange))');
  });
});

/**
 * Cell text is `--text` on the strongest tint (TINT_MAX of a wheel color in the panel color, limited by the hue's cap), in
 * both schemes. The strength range is about the Modes grid's (40 to 55%). Measured (this method, --text on the mix): Modes
 * tiles light 7.35 to 10.71, dark 3.49 to 4.60 (sev 0 to 3 are below 4.5 in dark: Modes' own range, not Pairs'). The oklch
 * mix between two neighboring marks is approximated by the srgb mix of the same two (its lightness lies between theirs),
 * sampled at 5 points of every segment; the panel and text colors are the theme tokens the roles resolve to.
 */
describe('cell text contrast on the strongest tint', () => {
  const bytes = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const hex = (c: number[]) =>
    `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  const mix = (a: number[], b: number[], share: number) =>
    a.map((v, i) => v * share + b[i] * (1 - share));
  it('the range is about the Modes strength (weakest 20%, strongest 55%) and every cap sits inside it', () => {
    expect(TINT_MIN).toBe(0.2);
    expect(TINT_MAX).toBe(0.55);
    for (const c of Object.values(HUE_CAP)) {
      expect(c).toBeGreaterThanOrEqual(0.3);
      expect(c).toBeLessThanOrEqual(TINT_MAX);
    }
    expect(wheelFill(0.25, 0.55)).toContain(' 32%, var(--panel))'); // yellow, capped
    expect(wheelFill(0, 0.55)).toContain(' 41%, var(--panel))'); // red-orange segment, capped by orange
  });

  for (const scheme of ['light', 'dark'] as const) {
    it(`${scheme}: at least 4.5:1 everywhere on the wheel, at the faintest strength and at the strongest the cap allows`, () => {
      const panel = scheme === 'light' ? T.white : T.dark[7];
      const text = scheme === 'light' ? T.black : T.dark[0];
      const marks = WHEEL_ORDER.map((n) => bytes(markHex(T.markerHues[n], scheme, n)));
      let worst = Infinity;
      for (let i = 0; i < marks.length; i++) {
        for (let k = 0; k < 5; k++) {
          const wheel = mix(marks[(i + 1) % marks.length], marks[i], k / 5);
          const cap = strengthCap((i + k / 5) / marks.length);
          for (const s of [TINT_MIN, Math.min(TINT_MAX, cap)]) {
            const fill = mix(wheel, bytes(panel), s);
            worst = Math.min(
              worst,
              linearContrast(hexToLinearRgb(text), hexToLinearRgb(hex(fill)))
            );
          }
        }
      }
      expect(worst).toBeGreaterThanOrEqual(4.5);
    });
  }
});

/**
 * A cell that does not match the picked or searched interval keeps only the share `--mx-dim` (panels.module.css, on
 * .mxGrid) of its fill, the rest being the panel color; the text stays at full --text (the old rule faded the whole cell
 * with opacity 0.45, which also faded the text to 1.9:1). Moving the fill toward the panel color is never worse for
 * --text, so the dimmed fill must hold at least 4.5:1 and never drop below the undimmed one.
 */
describe('dimmed cell text contrast (fill-only dimming)', () => {
  const css = readFileSync(new URL('../components/panels.module.css', import.meta.url), 'utf8');
  const dim = Number(/--mx-dim:\s*([0-9.]+);/.exec(css)![1]);
  const bytes = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const hex = (c: number[]) =>
    `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  const mix = (a: number[], b: number[], share: number) =>
    a.map((v, i) => v * share + b[i] * (1 - share));
  const ratio = (text: string, fill: number[]) =>
    linearContrast(hexToLinearRgb(text), hexToLinearRgb(hex(fill)));
  const severities = [
    ['cyan', 0.4],
    ['green', 0.4],
    ['yellow', 0.45],
    ['orange', 0.5],
    ['red', 0.55],
  ] as const;

  it('--mx-dim is a share between 0.3 and 0.9 and the cell no longer uses opacity', () => {
    expect(dim).toBeGreaterThanOrEqual(0.3);
    expect(dim).toBeLessThanOrEqual(0.9);
    expect(/\.mxCell\[data-match='no'\]\s*\{[^}]*opacity/.test(css)).toBe(false);
  });

  for (const scheme of ['light', 'dark'] as const) {
    it(`${scheme}: dimmed fill and --text keep 4.5:1 on every wheel sample and every error severity, never below the undimmed`, () => {
      const panel = bytes(scheme === 'light' ? T.white : T.dark[7]);
      const text = scheme === 'light' ? T.black : T.dark[0];
      const marks = WHEEL_ORDER.map((n) => bytes(markHex(T.markerHues[n], scheme, n)));
      let worstDim = Infinity;
      const check = (fill: number[]) => {
        const plain = ratio(text, fill);
        const dimmed = ratio(text, mix(fill, panel, dim));
        worstDim = Math.min(worstDim, dimmed);
        expect(dimmed).toBeGreaterThanOrEqual(plain - 1e-9);
      };
      for (let i = 0; i < marks.length; i++) {
        for (let k = 0; k < 5; k++) {
          const wheel = mix(marks[(i + 1) % marks.length], marks[i], k / 5);
          const cap = strengthCap((i + k / 5) / marks.length);
          for (const s of [TINT_MIN, Math.min(TINT_MAX, cap)]) {
            check(mix(wheel, panel, s));
          }
        }
      }
      for (const [n, s] of severities) {
        check(mix(bytes(markHex(T.markerHues[n], scheme, n)), panel, s));
      }
      expect(worstDim).toBeGreaterThanOrEqual(4.5);
    });
  }
});

describe('the Pairs Color setting (settings.v1)', () => {
  it('defaults to Off; old stored data without it loads as Off', () => {
    expect(defaultUi().pairsColor).toBe('off');
    expect(sanitizeSettings({ panel: 'keys' }).pairsColor).toBe('off');
    expect(sanitizeSettings(null).pairsColor).toBe('off');
  });

  it('keeps a valid mode and reads anything unknown as Off', () => {
    expect(sanitizeSettings({ pairsColor: 'error' }).pairsColor).toBe('error');
    expect(sanitizeSettings({ pairsColor: 'interval' }).pairsColor).toBe('interval');
    for (const bad of ['Error', 'red', 3, null, {}, true]) {
      expect(sanitizeSettings({ pairsColor: bad }).pairsColor).toBe('off');
    }
  });
});
