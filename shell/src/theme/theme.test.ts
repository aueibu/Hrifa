import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME } from '@mantine/core';
import { defaultThemeTokens } from './tokens';
import { theme } from './index';

describe('theme boundaries', () => {
  it('keeps unowned foundation values on Mantine defaults', () => {
    expect(theme.spacing).toEqual(DEFAULT_THEME.spacing);
    expect(theme.shadows).toEqual(DEFAULT_THEME.shadows);
    expect(theme.radius).toEqual(DEFAULT_THEME.radius);
    expect(theme.breakpoints).toEqual(DEFAULT_THEME.breakpoints);
  });

  it('keeps the approved neutral foundation as the source baseline', () => {
    expect(defaultThemeTokens).toEqual({
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
      markerHues: {
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
      },
      markerRamp: {
        fraction: 80,
        cap: 0.14,
        endBoost: 0,
        curve: 'even',
      },
    });
  });
});
