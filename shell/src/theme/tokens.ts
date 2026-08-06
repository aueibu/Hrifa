import type { MantineColorsTuple } from '@mantine/core';

export interface ThemeTokens {
  white: string;
  black: string;
  gray: MantineColorsTuple;
  dark: MantineColorsTuple;
}

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
};

export function isThemeTokens(value: unknown): value is ThemeTokens {
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
    value.dark.every((color) => typeof color === 'string')
  );
}

export function loadThemeTokens(): ThemeTokens {
  try {
    const saved = localStorage.getItem(themeTokensStorageKey);
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (isThemeTokens(parsed)) {
        return parsed;
      }
    }
  } catch {
    // The source baseline remains available when storage is unavailable or malformed.
  }
  return defaultThemeTokens;
}
