import { createTheme, defaultVariantColorsResolver, rem } from '@mantine/core';
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
    // The light variant is a neutral surface with a hint of the hue (see semantic.ts), so it takes the
    // same outline as a default button instead of Mantine's transparent border.
    variantColorResolver: (input) => {
      const colors = defaultVariantColorsResolver(input);
      return input.variant === 'light'
        ? { ...colors, border: `${rem(1)} solid var(--mantine-color-default-border)` }
        : colors;
    },
    white: tokens.white,
    black: tokens.black,
    fontFamily: 'Figtree, sans-serif',
    fontFamilyMonospace: '"DM Mono", monospace',
    headings: {
      fontFamily: 'Fraunces, serif',
    },
  });
}
