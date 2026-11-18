import type { CSSProperties } from 'react';
import { TINT_MAX, TINT_MIN, errorBand } from '../../../lib/harmonic-field';
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

/** A Radix step of a tile hue as a CSS color (a blend of two hues when the hue has `b`). */
export const hueStep = step;

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

export const SOLID_DARK = 'var(--mantine-color-black)';
export const SOLID_LIGHT = 'var(--mantine-color-white)';

export interface TileColors {
  fill: string;
  border: string;
  text: string;
  dimFill: string;
  dimBorder: string;
  dimText: string;
  /** Border of an added pitch's dashed outline (H-23): the tile's border color, never transparent (Tinted without outline uses its border step). */
  addedBorder: string;
  /**
   * Set when the tile has a REACH (H-22, H-23; Tinted and Outlined only): the cell's whole `background` value, a
   * hard-edged full-height band of the tint (see `reachBackground`). Absent: the plain `fill` is used.
   */
  bg?: string;
  /** The same band in the receding (dim) color, for a non-matching cell under a search; set exactly when `bg` is. */
  dimBg?: string;
}

/** Where the band sits in the cell: centered (default) or starting at the left edge (Developer option `tintBand`, H-23). */
export type TintBand = 'center' | 'left';
export const TINT_BANDS: readonly TintBand[] = ['center', 'left'];

/** Outside a band the cell is transparent, so the panel behind the grid shows through (no grey box, either scheme). */
const BAND_OUTSIDE = 'transparent';

/** A percent with at most two decimals and no trailing zeros (16.25, 35, 0). */
const pct = (n: number): string => `${Math.round(n * 100) / 100}%`;

/**
 * A full-height hard-edged band: `inner` over `reach` percent of the cell's width (center: centered; left: from the
 * left edge), transparent elsewhere. Two-position color stops give crisp edges, no fade. Reach 100 is a full fill.
 */
export function reachBackground(inner: string, reach: number, band: TintBand = 'center'): string {
  const w = Math.min(100, Math.max(0, reach));
  if (band === 'left') {
    return `linear-gradient(to right, ${inner} 0 ${pct(w)}, ${BAND_OUTSIDE} ${pct(w)} 100%)`;
  }
  const l = (100 - w) / 2;
  const r = l + w;
  return `linear-gradient(to right, ${BAND_OUTSIDE} 0 ${pct(l)}, ${inner} ${pct(l)} ${pct(r)}, ${BAND_OUTSIDE} ${pct(r)} 100%)`;
}

/**
 * The colors of one tile for a look, outline flag, level and hue. `reach` (percent, optional) makes the Tinted fill
 * a hard-edged band of that width (`band` picks center or left); Outlined gets the Tinted fill step of its level as
 * the same band inside its whole border; Solid ignores it (a full fill). A dimmed Tinted or Outlined tile keeps the
 * band, drawn in the Tinted dim fill step.
 */
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
    dimFill: look === 'outlined' ? 'var(--panel-slot)' : step(hue, TILE.dim.fill),
    dimBorder: look === 'outlined' || outline ? step(hue, TILE.dim.border) : 'transparent',
    dimText: step(hue, TILE.dim.text[scheme]),
    addedBorder:
      look === 'outlined'
        ? step(hue, TILE.outlined.border[level])
        : look === 'solid'
          ? step(hue, TILE.solid.border)
          : step(hue, TILE.tinted.border),
  };
  const dimBg =
    reach === undefined || look === 'solid'
      ? undefined
      : reachBackground(step(hue, TILE.dim.fill), reach, band);
  if (look === 'outlined') {
    return {
      fill: 'var(--panel-slot)',
      border: step(hue, TILE.outlined.border[level]),
      text: step(hue, TILE.outlined.text[scheme]),
      bg:
        reach === undefined
          ? undefined
          : reachBackground(step(hue, TILE.tinted.fill[level]), reach, band),
      dimBg,
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
    bg:
      reach === undefined
        ? undefined
        : reachBackground(step(hue, TILE.tinted.fill[level]), reach, band),
    dimBg,
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
    '--mx-added-bd': c.addedBorder,
    ...(c.bg ? { '--mx-bg': c.bg } : {}),
    ...(c.dimBg ? { '--mx-dim-bg': c.dimBg } : {}),
  } as CSSProperties;
}

const NEUTRAL_BORDER = 'var(--control-border)';

/** The neutral (exact) tile fill per scheme: slightly lighter than the screen it sits on; tune the dark percentage by eye. */
const NEUTRAL_LIFT: Record<TileScheme, string> = {
  dark: 'color-mix(in srgb, var(--text) 14%, transparent)',
  light: 'var(--panel)',
};

/**
 * THE SIGNED ERROR SCALE (H-38), one rule for every error view of the lab: the HUE says the sign (sharp, error above 0, is
 * orange; flat, below 0, is cyan: the tuner strip's `--mark-orange` and `--mark-cyan`), the STRENGTH says the size (the five
 * `errorBand` bands: 0 exact, 1 under 5 c, 2 under 15, 3 under 30, 4 beyond). Exact is neutral. An error is always
 * "what is there minus what was wanted" (the tuner strip's `dev`, a Modes tile's field note minus the mode pitch).
 */
export const SHARP_HUE: RadixHue = 'orange';
export const FLAT_HUE: RadixHue = 'cyan';

/** The signed band of a cents error: -4 to -1 flat, 0 exact, 1 to 4 sharp. The key of every signed-error style cache. */
export function signedBand(errorCents: number): number {
  const b = errorBand(Math.abs(errorCents));
  return b === 0 ? 0 : errorCents < 0 ? -b : b;
}

/** Every signed band, flat (-4) to sharp (4). */
export const SIGNED_BANDS: readonly number[] = [-4, -3, -2, -1, 0, 1, 2, 3, 4];

/** The tile level of a band 1 to 4 (band 4 is `strong` lifted one more step, see `BAND4_LIFT`). */
const BAND_LEVEL: readonly TileLevel[] = ['normal', 'faint', 'normal', 'strong', 'strong'];

/** Band 4 (30 c or more) goes one Radix step past `strong`, so it stays apart from band 3: Tinted fill, Outlined border, Solid fill. */
export const BAND4_LIFT = { tinted: 6, outlined: 9, solid: 10 } as const;

/** The share (percent) of the hue's text step mixed into the plain text color per band 0 to 4. */
export const BAND_TEXT_MIX: readonly number[] = [0, 40, 65, 85, 100];

/** The Radix step used for error text (a text-only error value). */
export const ERROR_TEXT_STEP = 11;

/** The hue of a signed band: orange sharp, cyan flat, null when exact. */
export const signedBandHue = (band: number): RadixHue | null =>
  band === 0 ? null : band > 0 ? SHARP_HUE : FLAT_HUE;

/** The hue of a cents error (null when exact). */
export const signedErrorHue = (errorCents: number): RadixHue | null =>
  signedBandHue(signedBand(errorCents));

/** The colors of a tile for a signed band (-4 to 4), in a look; see `signedErrorTile`. */
export function signedBandTile(
  look: TileLook,
  outline: boolean,
  band: number,
  scheme: TileScheme
): TileColors {
  const abs = Math.min(4, Math.abs(band));
  const h = signedBandHue(abs === 0 ? 0 : band);
  if (!h) {
    // band 0: the neutral tile (no hue): normal text and border; a fill a little LIGHTER than the surface under it, so the tile
    // does not blend into the screen (dark: a few percent of the text color over any surface; light: the panel's own white)
    const plain = NEUTRAL_LIFT[scheme];
    return {
      fill: plain,
      border: look === 'outlined' || outline ? NEUTRAL_BORDER : 'transparent',
      text: 'var(--text)',
      dimFill: plain,
      dimBorder: look === 'outlined' || outline ? NEUTRAL_BORDER : 'transparent',
      dimText: 'var(--text-muted)',
      addedBorder: NEUTRAL_BORDER,
    };
  }
  const hue: TileHue = { a: h };
  const c = tileColors(look, outline, BAND_LEVEL[abs], hue, scheme);
  if (abs !== 4) {
    return c;
  }
  if (look === 'tinted') {
    return { ...c, fill: step(hue, BAND4_LIFT.tinted) };
  }
  if (look === 'outlined') {
    return { ...c, border: step(hue, BAND4_LIFT.outlined) };
  }
  const n = solidStep(scheme, hue, BAND4_LIFT.solid);
  return {
    ...c,
    fill: step(hue, n),
    text: solidTextIsDark(scheme, hue, n) ? SOLID_DARK : SOLID_LIGHT,
  };
}

/** The tile of a cents error (positive sharp: orange, negative flat: cyan, exact neutral; stronger the further off). */
export function signedErrorTile(
  errorCents: number,
  look: TileLook,
  outline: boolean,
  scheme: TileScheme
): TileColors {
  return signedBandTile(look, outline, signedBand(errorCents), scheme);
}

/** A signed-error tile as inline custom properties (see `tileStyle`). */
export function signedErrorTileStyle(
  errorCents: number,
  look: TileLook,
  outline: boolean,
  scheme: TileScheme
): CSSProperties {
  return tileStyle(signedErrorTile(errorCents, look, outline, scheme));
}

/** The same for a signed band (-4 to 4). */
export function signedBandTileStyle(
  band: number,
  look: TileLook,
  outline: boolean,
  scheme: TileScheme
): CSSProperties {
  return tileStyle(signedBandTile(look, outline, band, scheme));
}

/** The text color of a signed band: plain text when exact, else the hue's text step mixed in by the band (a text-only error value). */
export function signedBandTextColor(band: number): string {
  const abs = Math.min(4, Math.abs(band));
  const h = signedBandHue(abs === 0 ? 0 : band);
  if (!h) {
    return 'var(--text)';
  }
  const mix = BAND_TEXT_MIX[abs];
  return mix >= 100
    ? `var(--rx-${h}-${ERROR_TEXT_STEP})`
    : `color-mix(in srgb, var(--rx-${h}-${ERROR_TEXT_STEP}) ${mix}%, var(--text))`;
}

/** The text color of a cents error (see `signedBandTextColor`). */
export const signedErrorTextColor = (errorCents: number): string =>
  signedBandTextColor(signedBand(errorCents));
