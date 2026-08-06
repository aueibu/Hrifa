import { createTheme } from '@mantine/core';
import type { ThemeTokens } from './tokens';

export function createAppTheme(tokens: ThemeTokens) {
  return createTheme({
    colors: {
      gray: tokens.gray,
      dark: tokens.dark,
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
