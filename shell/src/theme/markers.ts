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

export const defaultMarkerHues: MarkerHues = {
  red: 25,
  pink: 350,
  grape: 320,
  violet: 285,
  indigo: 260,
  blue: 235,
  cyan: 210,
  teal: 185,
  green: 150,
  lime: 120,
  yellow: 85,
  orange: 55,
};

export const defaultMarkerRamp: MarkerRamp = {
  fraction: 80,
  cap: 0.14,
  endBoost: 0,
  curve: 'even',
};

const baseMarkerLightness = [0.97, 0.92, 0.86, 0.78, 0.7, 0.62, 0.54, 0.46, 0.38, 0.3];
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
