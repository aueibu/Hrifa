import type { MantineColorsTuple } from '@mantine/core';
import { defaultMarkerHues, defaultMarkerRamp, type MarkerHues, type MarkerRamp } from './markers';

export type ColorShade = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type PrimaryRampCurve = 'even' | 'soft' | 'dramatic';

export interface PrimaryRamp {
  core: string;
  contrast: number;
  curve: PrimaryRampCurve;
  endpointChroma: number;
}

export interface ThemeTokens {
  white: string;
  black: string;
  gray: MantineColorsTuple;
  dark: MantineColorsTuple;
  primary: MantineColorsTuple;
  primaryShade: { light: ColorShade; dark: ColorShade };
  primaryRamp: PrimaryRamp;
  markerHues: MarkerHues;
  markerRamp: MarkerRamp;
}

type StoredThemeTokens = Omit<ThemeTokens, 'primaryRamp' | 'markerHues' | 'markerRamp'> & {
  primaryRamp?: PrimaryRamp;
  markerHues?: MarkerHues;
  markerRamp?: MarkerRamp;
};

export const themeTokensStorageKey = 'shell.theme-tokens.v1';

/** Public neutral-scale labels, ordered lightest to darkest. */
export const neutralScaleSteps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

/** Chosen shell neutral foundation, while retaining Mantine's stock role behavior. */
/*
 * One warm neutral family, lightest to darkest in each ramp, tuned so Mantine's stock role mapping
 * (see semantic.ts for the three places the app overrides it) gives real surface and text tiers:
 *   light  gray-0 page · white panel · gray-1 hover/inset · gray-2 border · gray-4 control border
 *          gray-5 subtle text · gray-6 muted text · black main text
 *   dark   dark-9 well · dark-8 page · dark-7 panel · dark-6 raised/input/slot · dark-5 border/hover/
 *          body · dark-4 control border · dark-3 subtle text · dark-2 muted text · dark-0 main text
 *          (the dark ramp is a barely-warm gray; the light ramp is warmer)
 */
export const defaultThemeTokens: ThemeTokens = {
  white: '#fbf9f5',
  black: '#1b1814',
  gray: [
    '#f3f0ea',
    '#ece8e0',
    '#ddd7cc',
    '#b8b0a3',
    '#8c8478',
    '#6f685e',
    '#554f47',
    '#3a352f',
    '#27231f',
    '#1b1814',
  ],
  // Slightly warm grays with wide steps, sampled from Bitwig's dark UI (see THEMING.md, "Studio tiers").
  dark: [
    '#e6e3df',
    '#cbc8c4',
    '#b4b1ad',
    '#a19e9a',
    '#85827e',
    '#464442',
    '#3a3836',
    '#32302e',
    '#2a2826',
    '#1d1b19',
  ],
  // The marker ramp at hue 235, a cyan-leaning blue near Bitwig's accent (the blue mark stays at 250): the one interactive accent.
  primary: [
    '#ebf7ff',
    '#c8eaff',
    '#9cdaff',
    '#54c4ff',
    '#00abed',
    '#008ec5',
    '#00729f',
    '#005d82',
    '#004867',
    '#003249',
  ],
  // The same step in both schemes: white text holds 4.5:1 or more on it either way.
  primaryShade: { light: 6, dark: 6 },
  primaryRamp: {
    core: '#00729f',
    contrast: 90,
    curve: 'even',
    endpointChroma: 100,
  },
  markerHues: defaultMarkerHues,
  markerRamp: defaultMarkerRamp,
};

function isPrimaryRamp(value: unknown): value is PrimaryRamp {
  return (
    typeof value === 'object' &&
    value !== null &&
    'core' in value &&
    typeof value.core === 'string' &&
    'contrast' in value &&
    typeof value.contrast === 'number' &&
    'curve' in value &&
    (value.curve === 'even' || value.curve === 'soft' || value.curve === 'dramatic') &&
    'endpointChroma' in value &&
    typeof value.endpointChroma === 'number'
  );
}

function isMarkerHues(value: unknown): value is MarkerHues {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.entries(defaultMarkerHues).every(
      ([name]) => name in value && typeof value[name as keyof typeof value] === 'number'
    )
  );
}

function isMarkerRamp(value: unknown): value is MarkerRamp {
  return (
    typeof value === 'object' &&
    value !== null &&
    'fraction' in value &&
    typeof value.fraction === 'number' &&
    'cap' in value &&
    typeof value.cap === 'number' &&
    (!('endBoost' in value) || typeof value.endBoost === 'number') &&
    'curve' in value &&
    (value.curve === 'even' || value.curve === 'soft' || value.curve === 'dramatic')
  );
}

export function isThemeTokens(value: unknown): value is StoredThemeTokens {
  const isColorShade = (shade: unknown): shade is ColorShade =>
    typeof shade === 'number' && Number.isInteger(shade) && shade >= 0 && shade <= 9;
  return (
    typeof value === 'object' &&
    value !== null &&
    'white' in value &&
    typeof value.white === 'string' &&
    'black' in value &&
    typeof value.black === 'string' &&
    'gray' in value &&
    Array.isArray(value.gray) &&
    value.gray.length === 10 &&
    value.gray.every((color) => typeof color === 'string') &&
    'dark' in value &&
    Array.isArray(value.dark) &&
    value.dark.length === 10 &&
    value.dark.every((color) => typeof color === 'string') &&
    'primary' in value &&
    Array.isArray(value.primary) &&
    value.primary.length === 10 &&
    value.primary.every((color) => typeof color === 'string') &&
    'primaryShade' in value &&
    typeof value.primaryShade === 'object' &&
    value.primaryShade !== null &&
    'light' in value.primaryShade &&
    isColorShade(value.primaryShade.light) &&
    'dark' in value.primaryShade &&
    isColorShade(value.primaryShade.dark) &&
    (!('primaryRamp' in value) || isPrimaryRamp(value.primaryRamp)) &&
    (!('markerHues' in value) || isMarkerHues(value.markerHues)) &&
    (!('markerRamp' in value) || isMarkerRamp(value.markerRamp))
  );
}

export function normalizeThemeTokens(tokens: StoredThemeTokens): ThemeTokens {
  return {
    ...tokens,
    primaryRamp: tokens.primaryRamp ?? {
      core: tokens.primary[6],
      contrast: 90,
      curve: 'even',
      endpointChroma: 100,
    },
    markerHues: tokens.markerHues ?? defaultMarkerHues,
    markerRamp: { ...defaultMarkerRamp, ...tokens.markerRamp },
  };
}

export function loadThemeTokens(): ThemeTokens {
  try {
    const saved = localStorage.getItem(themeTokensStorageKey);
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (isThemeTokens(parsed)) {
        return normalizeThemeTokens(parsed);
      }
    }
  } catch {
    // The source baseline remains available when storage is unavailable or malformed.
  }
  return defaultThemeTokens;
}
