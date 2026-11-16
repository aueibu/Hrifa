import type { CSSProperties } from 'react';
import { TINT_MAX, TINT_MIN } from '../../../lib/harmonic-field';
import { hexToLinearRgb, linearContrast } from '../../../theme/markers';
import { RADIX_HUES, radixHex, type RadixHue, type RadixScheme } from '../../../theme/radix';
import { defaultThemeTokens } from '../../../theme/tokens';

/**
 * Colored tiles of the Modes grid and the Pairs panel (pure; no React). Every fill, border and text color is a Radix
 * Colors step (theme/radix.ts, emitted as `--rx-<hue>-<step>` by the theme), in both schemes. THE TUNING CONSTANTS ARE
 * `TILE` BELOW: change a step number there and every tile follows.
 */
export type TileLook = 'tinted' | 'outlined' | 'solid';
export const TILE_LOOKS: readonly TileLook[] = ['tinted', 'outlined', 'solid'];
export type TileLevel = 'faint' | 'normal' | 'strong';
export type TileScheme = RadixScheme;

export const TILE = {
  /** Tinted: soft fill, high-contrast text; Outline stacked adds a border of step `border`. */
  tinted: { fill: { faint: 3, normal: 4, strong: 5 }, text: 12, border: 8 },
  /** Outlined: neutral slot fill, the border carries the hue (stronger level, stronger border), text step `text`. */
  outlined: { border: { faint: 6, normal: 7, strong: 8 }, text: { light: 12, dark: 11 } },
  /** Solid: step-9 style fill, text the better of white or the near-black token; Outline stacked adds step `border`. */
  solid: { fill: { faint: 7, normal: 8, strong: 9 }, border: 11 },
  /** Dimmed (non-matching) cells: fill step, border step (Outlined and stacked outlines), text step. */
  dim: { fill: 2, border: 5, text: { light: 12, dark: 11 } },
  /** Solid: the smallest text contrast allowed; a step too weak is bumped up by one (to at most step 11). */
  solidMinContrast: 4.5,
} as const;

/** Level used by the Modes severity tiles (they have no intensity of their own). */
const SEV_LEVEL: Record<TileLook, TileLevel> = {
  tinted: 'normal',
  outlined: 'normal',
  solid: 'strong',
};

/** The Modes severities, mild to bad, as Radix hues. */
export const SEV_HUES: readonly RadixHue[] = ['cyan', 'green', 'yellow', 'orange', 'red'];

/** The Pairs wheel: positions run through these hues and back to the first. */
export const WHEEL_ORDER: readonly RadixHue[] = RADIX_HUES;

/** The hues that bracket wheel position `pos` (0 to 1, one turn) and the share `f` of the second one. */
export function wheelSegment(pos: number): { a: RadixHue; b: RadixHue; f: number } {
  const n = WHEEL_ORDER.length;
  const t = (((pos % 1) + 1) % 1) * n;
  const i = Math.floor(t);
  return { a: WHEEL_ORDER[i % n], b: WHEEL_ORDER[(i + 1) % n], f: t - i };
}

/** A tile's hue: one Radix hue, or `a` blended with `b` (`pctA` percent of `a`) for a wheel position between two. */
export interface TileHue {
  a: RadixHue;
  b?: RadixHue;
  pctA?: number;
}

export function wheelHue(pos: number): TileHue {
  const { a, b, f } = wheelSegment(pos);
  const pctA = Math.round((1 - f) * 100);
  return pctA >= 100 ? { a } : { a, b, pctA };
}

/** The lib's tint strength (TINT_MIN to TINT_MAX) as a level: lower third faint, upper third strong. */
export function strengthLevel(strength: number): TileLevel {
  const t = (strength - TINT_MIN) / (TINT_MAX - TINT_MIN);
  return t < 1 / 3 ? 'faint' : t >= 2 / 3 ? 'strong' : 'normal';
}

const step = (h: TileHue, n: number): string =>
  h.b
    ? `color-mix(in oklch, var(--rx-${h.a}-${n}) ${h.pctA}%, var(--rx-${h.b}-${n}))`
    : `var(--rx-${h.a}-${n})`;

const hexAt = (scheme: TileScheme, h: TileHue, n: number): string => radixHex(scheme, h.a, n);

function solidScore(
  scheme: TileScheme,
  h: TileHue,
  n: number
): { dark: boolean; contrast: number } {
  const fills = [hexAt(scheme, h, n)];
  if (h.b) {
    fills.push(radixHex(scheme, h.b, n));
  }
  const dark = hexToLinearRgb(defaultThemeTokens.black);
  const light = hexToLinearRgb(defaultThemeTokens.white);
  // both ends of a blend must take the same text; the worse end decides
  const ok = (text: [number, number, number]) =>
    Math.min(...fills.map((f) => linearContrast(text, hexToLinearRgb(f))));
  const d = ok(dark);
  const l = ok(light);
  return d >= l ? { dark: true, contrast: d } : { dark: false, contrast: l };
}

/** Text on a solid fill: white or the near-black token, whichever has the higher contrast on the (blended) fill. */
export function solidTextIsDark(scheme: TileScheme, h: TileHue, n: number): boolean {
  return solidScore(scheme, h, n).dark;
}

/** The solid fill step actually used: `n`, or the next steps up until the text holds the minimum contrast (at most 11). */
export function solidStep(scheme: TileScheme, h: TileHue, n: number): number {
  let s = n;
  while (s < 11 && solidScore(scheme, h, s).contrast < TILE.solidMinContrast) {
    s++;
  }
  return s;
}

const SOLID_DARK = 'var(--mantine-color-black)';
const SOLID_LIGHT = 'var(--mantine-color-white)';

export interface TileColors {
  fill: string;
  border: string;
  text: string;
  dimFill: string;
  dimBorder: string;
  dimText: string;
}

/** The colors of one tile for a look, outline flag, level and hue. */
export function tileColors(
  look: TileLook,
  outline: boolean,
  level: TileLevel,
  hue: TileHue,
  scheme: TileScheme
): TileColors {
  const dim = {
    dimFill: look === 'outlined' ? 'var(--panel-slot)' : step(hue, TILE.dim.fill),
    dimBorder: look === 'outlined' || outline ? step(hue, TILE.dim.border) : 'transparent',
    dimText: step(hue, TILE.dim.text[scheme]),
  };
  if (look === 'outlined') {
    return {
      fill: 'var(--panel-slot)',
      border: step(hue, TILE.outlined.border[level]),
      text: step(hue, TILE.outlined.text[scheme]),
      ...dim,
    };
  }
  if (look === 'solid') {
    const n = solidStep(scheme, hue, TILE.solid.fill[level]);
    return {
      fill: step(hue, n),
      border: outline ? step(hue, TILE.solid.border) : 'transparent',
      text: solidTextIsDark(scheme, hue, n) ? SOLID_DARK : SOLID_LIGHT,
      ...dim,
    };
  }
  return {
    fill: step(hue, TILE.tinted.fill[level]),
    border: outline ? step(hue, TILE.tinted.border) : 'transparent',
    text: step(hue, TILE.tinted.text),
    ...dim,
  };
}

/** The tile as inline custom properties; `.tile`-style CSS in panels.module.css reads them. */
export function tileStyle(c: TileColors): CSSProperties {
  return {
    '--mx-fill': c.fill,
    '--mx-bd': c.border,
    '--mx-fg': c.text,
    '--mx-dim-fill': c.dimFill,
    '--mx-dim-bd': c.dimBorder,
    '--mx-dim-fg': c.dimText,
  } as CSSProperties;
}

/** A Modes severity tile (0 to 4). */
export function sevTileStyle(
  look: TileLook,
  outline: boolean,
  sev: number,
  scheme: TileScheme
): CSSProperties {
  const hue = { a: SEV_HUES[Math.min(SEV_HUES.length - 1, Math.max(0, sev))] };
  return tileStyle(tileColors(look, outline, SEV_LEVEL[look], hue, scheme));
}
