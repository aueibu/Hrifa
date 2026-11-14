/**
 * Kit tokens, defined once. A density is one complete set of sizes; `KitScope` writes the chosen set as `--kit-*`
 * custom properties and every kit rule reads them, so changing the density changes sizes through this table only.
 * `compact` is the lab's measurement (ARCHITECTURE.md section 5a, decided Q8: the lab's density, to be honed later).
 * `roomy` is a proportional proposal (about 1.15x) so the demo can show the setting doing something. Colours are never
 * here: they are theme roles in kit.module.css.
 */
import type { CSSProperties } from 'react';

export type Density = 'compact' | 'roomy';
export const DENSITY_NAMES: readonly Density[] = ['compact', 'roomy'];
export const DEFAULT_DENSITY: Density = 'compact';

export interface DensityTokens {
  fontBase: string;
  fontSmall: string;
  fontTiny: string;
  lineHeight: string;
  /** The one row height: name/value rows, inputs, selects, segmented controls (Q9). */
  rowHeight: string;
  stripHeight: string;
  stripPadding: string;
  stripGap: string;
  stripToolsGap: string;
  stripTitleSize: string;
  panelPadding: string;
  /** Between blocks (sections, rows not in a section) in a panel body. */
  panelGap: string;
  sectionGap: string;
  sectionPadding: string;
  rowGap: string;
  actionsGap: string;
  chipPadding: string;
  /** Horizontal padding of a toggle, so its text never touches the border. */
  chipPaddingX: string;
  numScale: string;
  sectionHeadWeight: string;
}

export const DENSITY_TOKENS: Record<Density, DensityTokens> = {
  compact: {
    fontBase: '0.8125rem',
    fontSmall: '0.75rem',
    fontTiny: '0.6875rem',
    lineHeight: '1.3',
    rowHeight: '1.625rem',
    stripHeight: '1.875rem',
    stripPadding: '0 0.5rem',
    stripGap: '0.5rem',
    stripToolsGap: '0.375rem',
    stripTitleSize: '0.75rem',
    panelPadding: '0.5rem',
    panelGap: '0.625rem',
    sectionGap: '0.375rem',
    sectionPadding: '0.375rem 0.5rem 0.5rem',
    rowGap: '0.5rem',
    actionsGap: '0.375rem',
    chipPadding: '0.1875rem',
    chipPaddingX: '0.5rem',
    numScale: '0.92em',
    sectionHeadWeight: '600',
  },
  roomy: {
    fontBase: '0.9375rem',
    fontSmall: '0.8125rem',
    fontTiny: '0.75rem',
    lineHeight: '1.4',
    rowHeight: '1.875rem',
    stripHeight: '2.125rem',
    stripPadding: '0 0.625rem',
    stripGap: '0.625rem',
    stripToolsGap: '0.5rem',
    stripTitleSize: '0.8125rem',
    panelPadding: '0.625rem',
    panelGap: '0.75rem',
    sectionGap: '0.5rem',
    sectionPadding: '0.5rem 0.625rem 0.625rem',
    rowGap: '0.625rem',
    actionsGap: '0.5rem',
    chipPadding: '0.25rem',
    chipPaddingX: '0.625rem',
    numScale: '0.92em',
    sectionHeadWeight: '600',
  },
};

/** Sizes that do not change with density (lab values). */
export const FIXED_TOKENS = {
  /** NumberInput widths: counts (64 px) and milliseconds-like values (72 px). */
  numberWidth: '4rem',
  numberWidthWide: '4.5rem',
  /** Select width when it is not filling the row (110 px). */
  selectWidth: '6.875rem',
  stripTitleWeight: '600',
  stripTitleTracking: '0.02em',
} as const;

/** Tooltip width in px (Q6); a number for Mantine, not a CSS property. */
export const TIP_WIDTH = 300;

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** The custom properties for a density (and the fixed tokens): the only place a kit size is turned into CSS. */
export function tokenStyle(density: Density): CSSProperties {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...FIXED_TOKENS, ...DENSITY_TOKENS[density] })) {
    out[`--kit-${kebab(k)}`] = String(v);
  }
  return out as CSSProperties;
}
