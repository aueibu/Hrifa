import type { CSSProperties } from 'react';
import { TINT_MAX, TINT_MIN, errorBand } from '../../../lib/harmonic-field';
import type { RadixHue } from '../../../theme/radix';
import {
  FLAT_HUE,
  SHARP_HUE,
  SOLID_DARK,
  SOLID_LIGHT,
  hueStep,
  solidStep,
  solidTextIsDark,
  tileColors,
  tileStyle,
  type TileColors,
  type TileHue,
  type TileLevel,
  type TileLook,
  type TileScheme,
} from '../../../theme/radixRoles';

const step = hueStep;
const NEUTRAL_BORDER = 'var(--control-border)';
const NEUTRAL_LIFT: Record<TileScheme, string> = {
  dark: 'color-mix(in srgb, var(--text) 14%, transparent)',
  light: 'var(--panel)',
};

export function signedBand(errorCents: number): number {
  const b = errorBand(Math.abs(errorCents));
  return b === 0 ? 0 : errorCents < 0 ? -b : b;
}

export {
  FLAT_HUE,
  SHARP_HUE,
  SOLID_DARK,
  SOLID_LIGHT,
  TILE,
  TILE_LOOKS,
  TINT_BANDS,
  WHEEL_ORDER,
  hueStep,
  radixVar,
  reachBackground,
  solidStep,
  solidTextIsDark,
  tileColors,
  tileStyle,
  wheelHue,
  wheelSegment,
  type TileColors,
  type TileHue,
  type TileLevel,
  type TileLook,
  type TileScheme,
  type TintBand,
} from '../../../theme/radixRoles';

/** The lib's tint strength (TINT_MIN to TINT_MAX) as a level: lower third faint, upper third strong. */
export function strengthLevel(strength: number): TileLevel {
  const t = (strength - TINT_MIN) / (TINT_MAX - TINT_MIN);
  return t < 1 / 3 ? 'faint' : t >= 2 / 3 ? 'strong' : 'normal';
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
