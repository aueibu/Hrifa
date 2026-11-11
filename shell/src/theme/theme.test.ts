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
      primaryShade: { light: 6, dark: 6 },
      primaryRamp: {
        core: '#00729f',
        contrast: 90,
        curve: 'even',
        endpointChroma: 100,
      },
      markerHues: {
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
      },
      markerRamp: {
        fraction: 100,
        cap: 0.16,
        endBoost: 0,
        curve: 'even',
      },
    });
  });
});
