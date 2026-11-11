import type { CSSVariablesResolver } from '@mantine/core';
import { markerColorNames, markHex, markTint, type MarkScheme } from './markers';
import { defaultThemeTokens, type ThemeTokens } from './tokens';

type Variables = Record<string, string>;

/**
 * Per-scheme variables for every marker hue:
 *  - `--mark-<hue>`: the hue as a mark on a panel (lines, dots, text), at a lightness tuned for the
 *    scheme so it holds 3:1 or more there. Canvas and SVG code reads these, never a fixed shade.
 *  - `--tint-<hue>-bg` / `-bg-hover` / `-text`: a faint fill with hue-colored text at 7:1, for chips
 *    and badges. Mantine's "light" variant uses the same values.
 *
 * Mantine builds a color's `-light` variants by alpha-blending one of its shades, but only for hex or
 * rgb strings, and this palette is generated as oklch. Without these values every "light" badge and
 * button would fall back to solid black, so they are always supplied.
 */
function markerVariables(tokens: ThemeTokens, scheme: MarkScheme): Variables {
  // Tints sit on the same surfaces as a default button and its hover.
  const tintBase =
    scheme === 'light'
      ? { background: tokens.gray[1], hover: tokens.gray[2] }
      : { background: tokens.dark[6], hover: tokens.dark[5] };
  const variables: Variables = {};
  for (const name of markerColorNames) {
    const hue = tokens.markerHues[name];
    const tint = markTint(hue, scheme, tintBase);
    variables[`--mark-${name}`] = markHex(hue, scheme, name);
    variables[`--tint-${name}-bg`] = tint.background;
    variables[`--tint-${name}-bg-hover`] = tint.backgroundHover;
    variables[`--tint-${name}-text`] = tint.text;
    variables[`--mantine-color-${name}-light`] = tint.background;
    variables[`--mantine-color-${name}-light-hover`] = tint.backgroundHover;
    variables[`--mantine-color-${name}-light-color`] = tint.text;
  }
  // The primary color is the one interactive accent, drawn from the blue ramp. Buttons and badges
  // that take the primary color read `--mantine-color-primary-light`, so it is set alongside the
  // `--mantine-primary-color-*` names; left to Mantine it would blend the filled shade into black.
  for (const suffix of ['light', 'light-hover', 'light-color']) {
    variables[`--mantine-primary-color-${suffix}`] = variables[`--mantine-color-blue-${suffix}`];
    variables[`--mantine-color-primary-${suffix}`] = variables[`--mantine-color-blue-${suffix}`];
  }
  return variables;
}

/**
 * Application roles. Apps use these names, never palette positions. Mantine's stock mapping of
 * neutral steps to roles is kept, except in three places the roles need more than it offers:
 *  - the page is its own tier (`--surface`), so a panel is visibly distinct from it;
 *  - generic borders and dividers (`default-border`) are subtler than control outlines, which keep the
 *    ramp's control step (gray-4 / dark-4) so inputs hold 3:1 against the panel;
 *  - hover steps one tier past the panel in light mode.
 * It also adds the studio tiers a dense editor needs beyond page/panel/inset (see THEMING.md):
 * `--panel-well` (deepest recess), `--panel-slot` (empty cells, fields), `--panel-body` (the work
 * area: canvas, lanes), `--panel-header` (device and panel headers), `--grid` (lines and cell edges)
 * and `--chrome` (title bars, raised controls). In dark mode they climb from the ramp; the in-between
 * ones are mixes of two ramp steps so they track the tokens.
 */
export function createSemanticResolver(tokens: ThemeTokens): CSSVariablesResolver {
  return () => ({
    variables: {
      '--accent': 'var(--mantine-primary-color-filled)',
      '--accent-tint': 'var(--mantine-primary-color-light)',
      '--accent-tint-text': 'var(--mantine-primary-color-light-color)',
      '--focus-ring': 'var(--mantine-primary-color-filled)',
      '--radius-panel': 'var(--mantine-radius-default)',
      '--radius-control': 'var(--mantine-radius-sm)',
      '--shadow-panel': 'var(--mantine-shadow-xs)',
      '--panel': 'var(--mantine-color-body)',
      '--border': 'var(--mantine-color-default-border)',
      '--text': 'var(--mantine-color-text)',
      '--text-muted': 'var(--mantine-color-dimmed)',
      '--text-subtle': 'var(--mantine-color-placeholder)',
    },
    light: {
      '--surface': 'var(--mantine-color-gray-0)',
      '--panel-raised': 'var(--mantine-color-body)',
      '--panel-inset': 'var(--mantine-color-gray-1)',
      '--panel-well': 'var(--mantine-color-gray-1)',
      '--panel-slot': 'var(--mantine-color-gray-1)',
      '--panel-body': 'var(--mantine-color-body)',
      '--panel-header': 'color-mix(in srgb, var(--mantine-color-gray-2) 50%, var(--mantine-color-gray-1))',
      '--grid': 'color-mix(in srgb, var(--mantine-color-gray-3) 40%, var(--mantine-color-gray-2))',
      '--chrome': 'var(--mantine-color-gray-2)',
      '--control-border': 'var(--mantine-color-gray-4)',
      '--mantine-color-default-border': 'var(--mantine-color-gray-2)',
      '--mantine-color-default-hover': 'var(--mantine-color-gray-1)',
      ...markerVariables(tokens, 'light'),
    },
    dark: {
      '--surface': 'var(--mantine-color-dark-8)',
      '--panel-raised': 'var(--mantine-color-dark-6)',
      '--panel-inset': 'var(--mantine-color-dark-9)',
      '--panel-well': 'var(--mantine-color-dark-9)',
      '--panel-slot': 'var(--mantine-color-dark-6)',
      '--panel-body': 'var(--mantine-color-dark-5)',
      '--panel-header': 'color-mix(in srgb, var(--mantine-color-dark-4) 8%, var(--mantine-color-dark-5))',
      '--grid': 'color-mix(in srgb, var(--mantine-color-dark-4) 28%, var(--mantine-color-dark-5))',
      '--chrome': 'color-mix(in srgb, var(--mantine-color-dark-4) 38%, var(--mantine-color-dark-5))',
      '--control-border': 'var(--mantine-color-dark-4)',
      '--mantine-color-default-border': 'var(--mantine-color-dark-5)',
      ...markerVariables(tokens, 'dark'),
    },
  });
}

/** The resolver for the baseline tokens, used by Storybook and tests. */
export const semanticVariablesResolver = createSemanticResolver(defaultThemeTokens);
