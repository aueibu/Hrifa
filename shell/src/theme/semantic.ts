import type { CSSVariablesResolver } from '@mantine/core';
import { markerColorNames } from './markers';

// Mantine synthesizes each color's `-light`/`-light-hover` CSS variant (the "light" Badge/Button variant's
// background) in dark mode by alpha-blending one of that color's own shades -- but its blend only understands
// hex/rgb shade strings. This app's whole palette (see foundation.ts + markers.ts) is generated as raw oklch(...)
// strings for every marker color, which that blend can't parse, so it silently falls back to solid black for any
// color it wasn't hand-pointed at an already-resolved var. `blue` had been patched this way already; every other
// marker color needs the same fix or its "light" variant badges/buttons render as solid black in dark mode.
const markerDarkLightVariants = Object.fromEntries(
  markerColorNames.flatMap((name) => [
    [`--mantine-color-${name}-light`, `var(--mantine-color-${name}-9)`],
    [`--mantine-color-${name}-light-hover`, `var(--mantine-color-${name}-8)`],
  ])
);

export const semanticVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    '--accent': 'var(--mantine-primary-color-filled)',
    '--focus-ring': 'var(--mantine-primary-color-filled)',
    '--radius-panel': 'var(--mantine-radius-default)',
    '--radius-control': 'var(--mantine-radius-sm)',
    '--shadow-panel': 'var(--mantine-shadow-xs)',
    '--surface': 'var(--mantine-color-body)',
    '--panel': 'var(--mantine-color-default)',
    '--panel-raised': 'var(--mantine-color-default)',
    '--panel-inset': 'var(--mantine-color-body)',
    '--border': 'var(--mantine-color-default-border)',
    '--text': 'var(--mantine-color-text)',
    '--text-muted': 'var(--mantine-color-dimmed)',
  },
  light: {},
  dark: markerDarkLightVariants,
});
