import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, rem } from '@mantine/core';
import { defaultThemeTokens } from './tokens';
import { theme } from './index';

describe('theme boundaries', () => {
  it('keeps unowned foundation values on Mantine defaults and owns compact scale', () => {
    expect(theme.shadows).toEqual(DEFAULT_THEME.shadows);
    expect(theme.breakpoints).toEqual(DEFAULT_THEME.breakpoints);
    expect(theme.defaultRadius).toBe('xs');
    expect(theme.spacing).toEqual({
      xs: rem(4),
      sm: rem(6),
      md: rem(8),
      lg: rem(12),
      xl: rem(16),
    });
    expect(theme.radius).toEqual({
      xs: rem(2),
      sm: rem(3),
      md: rem(4),
      lg: rem(6),
      xl: rem(8),
    });
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
        '#ece9e4',
        '#d2cfca',
        '#b9b5af',
        '#a4a09c',
        '#8a8682',
        '#514e49',
        '#44413c',
        '#363430',
        '#2a2825',
        '#1e1c1a',
      ],
      primary: [
        '#eef3fb',
        '#d5e1f4',
        '#b3c9eb',
        '#8daee0',
        '#6d94d1',
        '#5680c2',
        '#4772b3',
        '#395d94',
        '#2c4975',
        '#1f3557',
      ],
      primaryShade: { light: 6, dark: 6 },
      primaryRamp: {
        core: '#4772b3',
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
