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
export const defaultThemeTokens: ThemeTokens = {
  white: '#fbf9f5',
  black: '#141111',
  gray: [
    '#CCCBCA',
    '#f1f3f5',
    '#e9ecef',
    '#dee2e6',
    '#ced4da',
    '#7a8688',
    '#2c2525',
    '#495057',
    '#343a40',
    '#212529',
  ],
  dark: [
    '#f6efe7',
    '#b8b8b8',
    '#d8d8d8',
    '#a4a4a4',
    '#333333',
    '#434343',
    '#212121',
    '#1c1c1c',
    '#1f1f1f',
    '#141414',
  ],
  primary: [
    '#e7f5ff',
    '#d0ebff',
    '#a5d8ff',
    '#74c0fc',
    '#4dabf7',
    '#339af0',
    '#228be6',
    '#1c7ed6',
    '#1971c2',
    '#1864ab',
  ],
  primaryShade: { light: 6, dark: 8 },
  primaryRamp: {
    core: '#228be6',
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
