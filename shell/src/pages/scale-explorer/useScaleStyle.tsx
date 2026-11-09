/**
 * Resolved colors for the Scale Explorer's charts. Everything comes from the shell theme: the primary color
 * for the loaded set, its ramp for link distances, the shared mark hues for comparison sets, and the
 * `resolveScaleExplorerStyle` chord-family roles. Re-resolves whenever the color scheme or theme variables
 * change, so charts follow light and dark.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  markHue,
  resolveScaleExplorerStyle,
  type ChordFamilyRole,
  type DiagramStyle,
} from '../../theme/diagram';
import type { ChordFamily } from './chords';

/** Comparison slots: 'L' is the loaded set, 0-3 the comparison sets. */
export type Slot = 'L' | number;

export const SLOT_COUNT = 4;

/** Theme roles for chart neutrals, as CSS values usable directly in SVG attributes. */
export const ROLE = {
  panel: 'var(--panel)',
  border: 'var(--border)',
  text: 'var(--mantine-color-text)',
  muted: 'var(--text-muted)',
} as const;

/** Stroke widths (SVG user units) shared by every chart, so near-duplicate widths stay one decision. */
export const STROKE = { hairline: 1, line: 1.5, mark: 2, heavy: 3 } as const;

/** Opacities shared by every chart. */
export const OPACITY = { faint: 0.16, soft: 0.45, strong: 0.85 } as const;

/** Semitone arcs: both thin, in the primary color; only the line style tells isolated (solid) from chained (dashed). */
export const ARC = {
  isolated: { width: 3, dash: undefined },
  chained: { width: 3, dash: '6 4' },
} as const;

/**
 * Link distances 1-6 fade as they get farther: thinner and more transparent as well as stepped along the
 * primary ramp, so lines that cross stay distinguishable beyond the third.
 */
export const LINK = {
  widths: [2.5, 2.2, 1.9, 1.6, 1.3, 1],
  opacities: [1, 0.9, 0.8, 0.7, 0.6, 0.5],
} as const;

const FAMILY_ROLE: Record<ChordFamily, ChordFamilyRole> = {
  maj: 'major',
  min: 'minor',
  dim: 'diminished',
  aug: 'augmented',
  sus: 'suspended',
  quartal: 'stacked',
  quintal: 'stacked',
  aug6: 'augmentedSixth',
  cluster: 'neutral',
  other: 'neutral',
};

export interface ScaleStyle {
  base: DiagramStyle;
  /** The loaded set's color: the shell primary. */
  accent: string;
  onAccent: string;
  /** Colors of the four comparison slots. */
  slots: string[];
  /** Primary-ramp colors for link distances 1-6 (index 0 is distance 1), strongest against the panel first. */
  links: string[];
  /** A present fifth uses the accent, a missing one the muted neutral. */
  /** A present fifth: a different primary-ramp step from the loaded set's color (darker on light, lighter on dark). */
  fifthPresent: string;
  fifthMissing: string;
  chordFamily: Record<ChordFamilyRole, string>;
  slotColor: (slot: Slot) => string;
  familyColor: (family: ChordFamily) => string;
}

/** Primary-ramp steps for distances 1-6: darker steps on light panels, lighter on dark, nearest strongest. */
const LINK_STEPS = { light: [9, 8, 6, 5, 4, 3], dark: [0, 1, 3, 4, 5, 6] };

/** Primary-ramp step for a present fifth. */
const FIFTH_STEP = { light: 8, dark: 3 };

export function resolveScaleStyle(root: Element = document.documentElement): ScaleStyle {
  const css = getComputedStyle(root);
  const value = (name: string) => css.getPropertyValue(name).trim();
  const hue = markHue(root);
  const dark = root.getAttribute('data-mantine-color-scheme') === 'dark';
  const explorer = resolveScaleExplorerStyle(root);
  const accent = value('--mantine-primary-color-filled');
  const slots = [hue('orange'), hue('grape'), hue('green'), hue('pink')];
  return {
    base: explorer.base,
    accent,
    onAccent: value('--mantine-primary-color-contrast'),
    slots,
    links: (dark ? LINK_STEPS.dark : LINK_STEPS.light).map((s) =>
      value(`--mantine-color-primary-${s}`)
    ),
    fifthPresent: value(`--mantine-color-primary-${dark ? FIFTH_STEP.dark : FIFTH_STEP.light}`),
    fifthMissing: value('--mantine-color-dimmed'),
    chordFamily: explorer.chordFamily,
    slotColor: (slot) => (slot === 'L' ? accent : slots[slot]),
    familyColor: (family) => explorer.chordFamily[FAMILY_ROLE[family]],
  };
}

const ScaleStyleContext = createContext<ScaleStyle | null>(null);

/** Provides the resolved style and re-resolves when the color scheme or theme variables change. */
export function ScaleStyleProvider({ children }: { children: ReactNode }) {
  const [style, setStyle] = useState<ScaleStyle>(() => resolveScaleStyle());
  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setStyle(resolveScaleStyle(root)));
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-mantine-color-scheme', 'style', 'class'],
    });
    setStyle(resolveScaleStyle(root));
    return () => observer.disconnect();
  }, []);
  const value = useMemo(() => style, [style]);
  return <ScaleStyleContext.Provider value={value}>{children}</ScaleStyleContext.Provider>;
}

export function useScaleStyle(): ScaleStyle {
  const style = useContext(ScaleStyleContext);
  if (!style) {
    throw new Error('useScaleStyle must be used inside ScaleStyleProvider.');
  }
  return style;
}
