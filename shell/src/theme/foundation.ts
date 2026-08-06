import { createTheme } from '@mantine/core';
import { markerPalettes } from './markers';
import type { ThemeTokens } from './tokens';

export function createAppTheme(tokens: ThemeTokens) {
  return createTheme({
    colors: {
      gray: tokens.gray,
      dark: tokens.dark,
      primary: tokens.primary,
      ...markerPalettes(tokens.markerHues, tokens.markerRamp),
    },
    primaryColor: 'primary',
    primaryShade: tokens.primaryShade,
    white: tokens.white,
    black: tokens.black,
    fontFamily: 'Figtree, sans-serif',
    fontFamilyMonospace: '"DM Mono", monospace',
    headings: {
      fontFamily: 'Fraunces, serif',
    },
  });
}
