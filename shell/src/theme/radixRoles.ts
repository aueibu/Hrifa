import type { CSSProperties } from 'react';
import { hexToLinearRgb, linearContrast } from './markers';
import { RADIX_HUES, radixHex, type RadixHue, type RadixScheme } from './radix';
import { defaultThemeTokens } from './tokens';

/**
 * Shared Radix Colors role system (promoted from Harmonic Field Lab).
 * Every fill, border, and text color is a Radix Colors step (`--rx-<hue>-<step>`),
 * in both light and dark schemes. `TILE` holds the step numbers for every look.
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

/** The wheel: positions run through these hues and back to the first. */
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

/** A Radix step of a tile hue as a CSS color (a blend of two hues when the hue has `b`). */
export function hueStep(h: TileHue, n: number): string {
  return h.b
    ? `color-mix(in oklch, var(--rx-${h.a}-${n}) ${h.pctA}%, var(--rx-${h.b}-${n}))`
    : `var(--rx-${h.a}-${n})`;
}

/** A single Radix hue step as a CSS variable reference. */
export function radixVar(hue: RadixHue, step: number): string {
  return `var(--rx-${hue}-${step})`;
}

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

export const SOLID_DARK = 'var(--mantine-color-black)';
export const SOLID_LIGHT = 'var(--mantine-color-white)';

export interface TileColors {
  fill: string;
  border: string;
  text: string;
  dimFill: string;
  dimBorder: string;
  dimText: string;
  addedBorder: string;
  bg?: string;
  dimBg?: string;
}

export type TintBand = 'center' | 'left';
export const TINT_BANDS: readonly TintBand[] = ['center', 'left'];

const BAND_OUTSIDE = 'transparent';
const pct = (n: number): string => `${Math.round(n * 100) / 100}%`;

export function reachBackground(inner: string, reach: number, band: TintBand = 'center'): string {
  const w = Math.min(100, Math.max(0, reach));
  if (band === 'left') {
    return `linear-gradient(to right, ${inner} 0 ${pct(w)}, ${BAND_OUTSIDE} ${pct(w)} 100%)`;
  }
  const l = (100 - w) / 2;
  const r = l + w;
  return `linear-gradient(to right, ${BAND_OUTSIDE} 0 ${pct(l)}, ${inner} ${pct(l)} ${pct(r)}, ${BAND_OUTSIDE} ${pct(r)} 100%)`;
}

export function tileColors(
  look: TileLook,
  outline: boolean,
  level: TileLevel,
  hue: TileHue,
  scheme: TileScheme,
  reach?: number,
  band: TintBand = 'center'
): TileColors {
  const dim = {
    dimFill: look === 'outlined' ? 'var(--panel-slot)' : hueStep(hue, TILE.dim.fill),
    dimBorder: look === 'outlined' || outline ? hueStep(hue, TILE.dim.border) : 'transparent',
    dimText: hueStep(hue, TILE.dim.text[scheme]),
    addedBorder:
      look === 'outlined'
        ? hueStep(hue, TILE.outlined.border[level])
        : look === 'solid'
          ? hueStep(hue, TILE.solid.border)
          : hueStep(hue, TILE.tinted.border),
  };
  const dimBg =
    reach === undefined || look === 'solid'
      ? undefined
      : reachBackground(hueStep(hue, TILE.dim.fill), reach, band);
  if (look === 'outlined') {
    return {
      fill: 'var(--panel-slot)',
      border: hueStep(hue, TILE.outlined.border[level]),
      text: hueStep(hue, TILE.outlined.text[scheme]),
      bg:
        reach === undefined
          ? undefined
          : reachBackground(hueStep(hue, TILE.tinted.fill[level]), reach, band),
      dimBg,
      ...dim,
    };
  }
  if (look === 'solid') {
    const n = solidStep(scheme, hue, TILE.solid.fill[level]);
    return {
      fill: hueStep(hue, n),
      border: outline ? hueStep(hue, TILE.solid.border) : 'transparent',
      text: solidTextIsDark(scheme, hue, n) ? SOLID_DARK : SOLID_LIGHT,
      ...dim,
    };
  }
  return {
    fill: hueStep(hue, TILE.tinted.fill[level]),
    border: outline ? hueStep(hue, TILE.tinted.border) : 'transparent',
    text: hueStep(hue, TILE.tinted.text),
    bg:
      reach === undefined
        ? undefined
        : reachBackground(hueStep(hue, TILE.tinted.fill[level]), reach, band),
    dimBg,
    ...dim,
  };
}

export function tileStyle(c: TileColors): CSSProperties {
  return {
    '--mx-fill': c.fill,
    '--mx-bd': c.border,
    '--mx-fg': c.text,
    '--mx-dim-fill': c.dimFill,
    '--mx-dim-bd': c.dimBorder,
    '--mx-dim-fg': c.dimText,
    '--mx-added-bd': c.addedBorder,
    ...(c.bg ? { '--mx-bg': c.bg } : {}),
    ...(c.dimBg ? { '--mx-dim-bg': c.dimBg } : {}),
  } as CSSProperties;
}

export const SHARP_HUE: RadixHue = 'orange';
export const FLAT_HUE: RadixHue = 'cyan';
