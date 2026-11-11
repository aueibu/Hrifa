import type { MantineColorsTuple } from '@mantine/core';

export const markerColorNames = [
  'red',
  'pink',
  'grape',
  'violet',
  'indigo',
  'blue',
  'cyan',
  'teal',
  'green',
  'lime',
  'yellow',
  'orange',
] as const;

export type MarkerColorName = (typeof markerColorNames)[number];
export type MarkerHues = Record<MarkerColorName, number>;
export type MarkerRampCurve = 'even' | 'soft' | 'dramatic';

export interface MarkerRamp {
  /** Percent of the maximum sRGB-gamut chroma used at each hue and lightness. */
  fraction: number;
  /** Absolute OKLCH chroma ceiling, even when the gamut allows more. */
  cap: number;
  /** How strongly the outer stops move from fraction toward their full available gamut. */
  endBoost: number;
  curve: MarkerRampCurve;
}

/**
 * Eight core hues (red, orange, yellow, green, cyan, blue, violet, pink) spaced at least 40 degrees
 * apart carry the categorical set; lime, teal, indigo and grape fill the gaps for Mantine components
 * that name them, at the 25-degree minimum, so avoid placing those beside their neighbours.
 */
export const defaultMarkerHues: MarkerHues = {
  red: 25,
  orange: 52,
  yellow: 100,
  lime: 125,
  green: 150,
  teal: 178,
  cyan: 205,
  blue: 250,
  indigo: 275,
  violet: 300,
  grape: 325,
  pink: 350,
};

export const defaultMarkerRamp: MarkerRamp = {
  fraction: 100,
  cap: 0.16,
  endBoost: 0,
  curve: 'even',
};

// The core step (6) holds white text at 4.5:1 or more on every hue, in both color schemes.
const baseMarkerLightness = [0.97, 0.92, 0.86, 0.78, 0.7, 0.61, 0.52, 0.45, 0.38, 0.3];
const coreStep = 6;

function lightnessAtStep(step: number, curve: MarkerRampCurve): number {
  const exponent = curve === 'soft' ? 0.75 : curve === 'dramatic' ? 1.4 : 1;
  const coreLightness = baseMarkerLightness[coreStep];
  const endpoint = step < coreStep ? baseMarkerLightness[0] : baseMarkerLightness.at(-1)!;
  const originalDistance = Math.abs(baseMarkerLightness[step] - coreLightness);
  const endpointDistance = Math.abs(endpoint - coreLightness);
  const shapedDistance = (originalDistance / endpointDistance) ** exponent;

  return (
    coreLightness +
    Math.sign(baseMarkerLightness[step] - coreLightness) * endpointDistance * shapedDistance
  );
}

function isInSrgbGamut(lightness: number, chroma: number, hue: number): boolean {
  const angle = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(angle);
  const b = chroma * Math.sin(angle);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const red = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const green = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return red >= 0 && red <= 1 && green >= 0 && green <= 1 && blue >= 0 && blue <= 1;
}

export function maxSrgbChroma(lightness: number, hue: number): number {
  let low = 0;
  let high = 0.4;

  for (let index = 0; index < 18; index += 1) {
    const midpoint = (low + high) / 2;
    if (isInSrgbGamut(lightness, midpoint, hue)) {
      low = midpoint;
    } else {
      high = midpoint;
    }
  }

  return low;
}

function oklch(lightness: number, chroma: number, hue: number): string {
  return `oklch(${(lightness * 100).toFixed(1)}% ${chroma.toFixed(3)} ${hue})`;
}

function chromaFractionAtStep(step: number, ramp: MarkerRamp): number {
  const baseFraction = ramp.fraction / 100;
  const endpointDistance = step < coreStep ? coreStep : baseMarkerLightness.length - 1 - coreStep;
  const endness = Math.abs(step - coreStep) / endpointDistance;

  return baseFraction + (1 - baseFraction) * ramp.endBoost * endness;
}

export function markerColor(hue: number, ramp = defaultMarkerRamp, step = coreStep): string {
  const lightness = lightnessAtStep(step, ramp.curve);
  const chroma = Math.min(
    maxSrgbChroma(lightness, hue) * chromaFractionAtStep(step, ramp),
    ramp.cap
  );
  return oklch(lightness, chroma, hue);
}

/** The same ramp stop as hex, for Mantine color math (which cannot parse oklch strings). */
export function markerColorHex(hue: number, ramp = defaultMarkerRamp, step = coreStep): string {
  const lightness = lightnessAtStep(step, ramp.curve);
  const chroma = Math.min(
    maxSrgbChroma(lightness, hue) * chromaFractionAtStep(step, ramp),
    ramp.cap
  );
  return linearRgbToHex(oklchToLinearRgb(lightness, chroma, hue));
}

export function markerPalette(hue: number, ramp = defaultMarkerRamp): MantineColorsTuple {
  return baseMarkerLightness.map((_, index) =>
    markerColor(hue, ramp, index)
  ) as unknown as MantineColorsTuple;
}

export function markerPalettes(
  hues: MarkerHues,
  ramp = defaultMarkerRamp
): Record<MarkerColorName, MantineColorsTuple> {
  return Object.fromEntries(
    markerColorNames.map((name) => [name, markerPalette(hues[name], ramp)])
  ) as Record<MarkerColorName, MantineColorsTuple>;
}

/** Linear-light sRGB for an OKLCH color, clipped to the gamut. */
export function oklchToLinearRgb(lightness: number, chroma: number, hue: number): [number, number, number] {
  const angle = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(angle);
  const b = chroma * Math.sin(angle);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

export function hexToLinearRgb(hex: string): [number, number, number] {
  const channel = (start: number) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return [channel(1), channel(3), channel(5)];
}

export function linearRgbToHex([red, green, blue]: [number, number, number]): string {
  const encode = (value: number) => {
    const clamped = Math.min(1, Math.max(0, value));
    const encoded = clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
    return Math.round(encoded * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${encode(red)}${encode(green)}${encode(blue)}`;
}

/** WCAG contrast ratio between two linear-light colors. */
export function linearContrast(
  first: [number, number, number],
  second: [number, number, number]
): number {
  const luminance = ([red, green, blue]: [number, number, number]) =>
    0.2126 * red + 0.7152 * green + 0.0722 * blue;
  const [high, low] = [luminance(first), luminance(second)].sort((left, right) => right - left);
  return (high + 0.05) / (low + 0.05);
}

export type MarkScheme = 'light' | 'dark';

/**
 * Where each hue is drawn as a mark (line, dot, text) on a panel, per color scheme. Lightness is
 * staggered between neighbouring hues so they stay apart for viewers who cannot separate red from
 * green; light marks sit near 52% and dark marks near 72% so both hold 3:1 or more on the panel.
 */
export const markLightness: Record<MarkScheme, Record<MarkerColorName, number>> = {
  light: {
    red: 0.56,
    orange: 0.54,
    yellow: 0.6,
    lime: 0.52,
    green: 0.62,
    teal: 0.48,
    cyan: 0.48,
    blue: 0.45,
    indigo: 0.46,
    violet: 0.57,
    grape: 0.52,
    pink: 0.52,
  },
  dark: {
    red: 0.68,
    orange: 0.77,
    yellow: 0.85,
    lime: 0.82,
    green: 0.79,
    teal: 0.76,
    cyan: 0.8,
    blue: 0.66,
    indigo: 0.64,
    violet: 0.76,
    grape: 0.7,
    pink: 0.72,
  },
};

const markChromaCap = 0.16;

function gamutLinear(lightness: number, cap: number, hue: number): [number, number, number] {
  return oklchToLinearRgb(lightness, Math.min(maxSrgbChroma(lightness, hue), cap), hue);
}

/** One mark color as linear-light sRGB (for contrast math) and as hex (for CSS, canvas and WebGL). */
export function markLinear(hue: number, scheme: MarkScheme, name: MarkerColorName) {
  return gamutLinear(markLightness[scheme][name], markChromaCap, hue);
}

export function markHex(hue: number, scheme: MarkScheme, name: MarkerColorName): string {
  return linearRgbToHex(markLinear(hue, scheme, name));
}

export interface MarkTint {
  background: string;
  backgroundHover: string;
  text: string;
}

/** OKLab lightness (0 to 1) of a hex color. */
function hexLightness(hex: string): number {
  const [red, green, blue] = hexToLinearRgb(hex);
  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

/** The neutral surfaces a tint is built on: the app's own control surface and its hover step. */
export interface TintBase {
  background: string;
  hover: string;
}

/**
 * A tint is the app's own neutral control surface with a hint of the hue: the same lightness as the
 * base (so it sits in the interface like a default button), nudged toward the hue by a small chroma,
 * with text that is mostly neutral and slightly tinted, found by search so it keeps 7:1 on the fill.
 * A chip says what kind of thing something is without leaving the neutral palette.
 */
export function markTint(hue: number, scheme: MarkScheme, base: TintBase): MarkTint {
  const dark = scheme === 'dark';
  const background = gamutLinear(hexLightness(base.background), dark ? 0.03 : 0.022, hue);
  const backgroundHover = gamutLinear(hexLightness(base.hover), dark ? 0.036 : 0.028, hue);
  const step = dark ? 0.01 : -0.01;
  let lightness = dark ? 0.86 : 0.4;
  let text = gamutLinear(lightness, 0.06, hue);
  while (
    linearContrast(text, background) < 7.1 &&
    lightness + step > 0.15 &&
    lightness + step < 0.99
  ) {
    lightness += step;
    text = gamutLinear(lightness, 0.06, hue);
  }
  return {
    background: linearRgbToHex(background),
    backgroundHover: linearRgbToHex(backgroundHover),
    text: linearRgbToHex(text),
  };
}

export interface MarkerHueCollision {
  distance: number;
  names: [MarkerColorName, MarkerColorName];
}

export function markerHueCollisions(hues: MarkerHues, minimumDistance = 25): MarkerHueCollision[] {
  const ordered = [...markerColorNames].sort((left, right) => hues[left] - hues[right]);

  return ordered.flatMap((name, index) => {
    const next = ordered[(index + 1) % ordered.length];
    const distance = (hues[next] - hues[name] + 360) % 360;
    return distance < minimumDistance ? [{ distance, names: [name, next] }] : [];
  });
}

export function nudgeMarkerHue(hue: number, amount: number): number {
  return ((Math.round(hue + amount) % 360) + 360) % 360;
}
