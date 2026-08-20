export type DiagramMarkRole = 'line' | 'arc' | 'circle' | 'point';

export interface DiagramStyle {
  marks: Record<DiagramMarkRole, string>;
  guide: {
    crosshairSize: number;
    dash: number[];
    lineWidth: number;
    markerRadius: number;
    opacity: number;
  };
  annotation: {
    background: string;
    font: string;
  };
  sourcePoint: {
    radius: number;
  };
  grid: {
    lineWidth: number;
    opacity: number;
  };
  hoverPoint: {
    radius: number;
    lineWidth: number;
  };
  /** Default mouse-hover accent (outlines, rings). Every tool pulls from this; add a per-tool override field only if a tool genuinely needs a different hover color. */
  hoverHighlight: string;
}

/** Shared canvas treatment. Geometry apps supply roles and coordinates, never visual values. */
export function resolveDiagramStyle(root: Element = document.documentElement): DiagramStyle {
  const css = getComputedStyle(root);
  const value = (name: string) => css.getPropertyValue(name).trim();

  return {
    marks: {
      line: value('--mantine-color-blue-6'),
      arc: value('--mantine-color-grape-6'),
      circle: value('--mantine-color-orange-6'),
      point: value('--mantine-color-green-6'),
    },
    guide: { crosshairSize: 5, dash: [3, 3], lineWidth: 1, markerRadius: 2, opacity: 0.35 },
    // `ctx.font` does not resolve `var()` — unlike DOM CSS, canvas 2D font
    // parsing has no cascade to resolve custom properties against, so a
    // literal `var(...)` in the string is invalid and the whole assignment
    // is silently dropped (ctx.font stays at the canvas default). The
    // family has to be resolved to its actual value here, the same way
    // every color in this file already is.
    annotation: {
      background: value('--mantine-color-default'),
      font: `600 9px ${value('--mantine-font-family-monospace')}`,
    },
    sourcePoint: { radius: 3.2 },
    grid: { lineWidth: 0.5, opacity: 0.3 },
    hoverPoint: { radius: 7, lineWidth: 1.5 },
    hoverHighlight: value('--mantine-color-orange-4'),
  };
}

/**
 * Semantic roles for the Radial Growth Tree's 2D torus view. It reuses the
 * shared canvas contract from `resolveDiagramStyle` (`base`) for every decision
 * that already exists there — grid lines, dashed guides, hover rings, and point
 * radii — and adds only the roles the growth tree genuinely introduces: the
 * O/P/Q construction circles, the tree/dead-end/branch marks, and the handful of
 * ultra-faint fills (halo, search cones) that have no analog in the base
 * contract. Colors are CSS strings (the palette resolves to oklch, rendered
 * natively by canvas 2D).
 */
export interface GrowthTreeStyle {
  base: DiagramStyle;
  origin: string;
  circleO: string;
  circleP: string;
  circleQ: string;
  tree: string;
  deadEnd: string;
  branch: string;
  /** Hovered cell and its periodic torus images (the wrap-relation highlight). */
  relation: string;
  /** Neutral for the field's used/unused/depth-capped points and seam lines. */
  muted: string;
  seam: string;
  text: string;
  /**
   * The one alpha with no base-contract analog: the barely-there fill behind the
   * Q halo disc and the search-cone wedges. Cone outlines and the origin halo
   * reuse `base.guide.opacity`.
   */
  fillFaint: number;
  /** Torus seam (tile-boundary) lines — deliberately stronger than the fine grid. */
  seamOpacity: number;
}

/**
 * A scheme-aware categorical-hue picker. Mantine's fixed palette shades (e.g.
 * `--mantine-color-orange-6`) are identical in light and dark — only the neutral
 * roles adapt — so a shade tuned for one scheme washes out in the other. Canvas
 * marks sit on the scheme-adaptive panel, so we pick a lighter step on dark and
 * a darker step on light to hold contrast either way. `data-mantine-color-scheme`
 * is the attribute Mantine stamps on <html>.
 */
function markHue(root: Element): (name: string) => string {
  const css = getComputedStyle(root);
  const shade = root.getAttribute('data-mantine-color-scheme') === 'dark' ? 5 : 7;
  return (name: string) => css.getPropertyValue(`--mantine-color-${name}-${shade}`).trim();
}

export function resolveGrowthTreeStyle(root: Element = document.documentElement): GrowthTreeStyle {
  const css = getComputedStyle(root);
  const value = (name: string) => css.getPropertyValue(name).trim();
  const hue = markHue(root);

  return {
    base: resolveDiagramStyle(root),
    origin: hue('yellow'),
    circleO: hue('cyan'),
    circleP: hue('grape'),
    circleQ: hue('indigo'),
    tree: hue('green'),
    deadEnd: hue('red'),
    branch: hue('grape'),
    relation: hue('orange'),
    muted: value('--mantine-color-dimmed'),
    seam: value('--mantine-color-default-border'),
    text: value('--mantine-color-text'),
    fillFaint: 0.06,
    seamOpacity: 0.55,
  };
}

/**
 * Semantic roles for the Radial Growth Tree's 3D solid view (Three.js). Same
 * palette roles as the 2D view; the SolidView engine converts these CSS strings
 * to hex for THREE.Color, since Three.js cannot parse oklch().
 */
export interface SolidViewStyle {
  originColors: { vertex: string; edge: string; face: string };
  wireframeVertex: string;
  wireframeEdge: string;
  axis: string;
  gridMain: string;
  gridSub: string;
  /** Three.js material transparencies — 3D-only, with no 2D/base analog. */
  opacity: {
    gridPlane: number;
    dropLine: number;
    snapLine: number;
  };
}

/**
 * Semantic roles for the Segment-Tangent Construction tool. Reuses
 * `resolveDiagramStyle` as `base` for the shared guide/grid/annotation
 * treatment (ratio-guide dashes, hover, faint fills) and adds the tool's own
 * large categorical palette — one role per construction layer. The source
 * app reused its amber (`#b45309`) for both the inversive-dual circles and
 * the focused-segment label, i.e. one semantic idea ("emphasis amber") in
 * two places, not two independent choices — `focus` captures that and is
 * shared by both rather than duplicated.
 */
export interface SegmentTangentStyle {
  base: DiagramStyle;
  neutral: string;
  tangentBlue: string;
  tangentOpposite: string;
  focus: string;
  apexTriangle: string;
  quad: string;
  excircle: string;
  incircle: string;
  boundaryPolygon: string;
  midpoint: string;
  radialCw: string;
  radialCcw: string;
  outline: { thin: number; normal: number; thick: number };
  /** Each construction layer gets one dash pattern, held constant across the layer. */
  dash: {
    tangent: number[];
    midpoint: number[];
    excircle: number[];
    ratioGuide: number[];
    reproj: number[];
    radial: number[];
  };
}

export function resolveSegmentTangentStyle(
  root: Element = document.documentElement
): SegmentTangentStyle {
  const css = getComputedStyle(root);
  const value = (name: string) => css.getPropertyValue(name).trim();
  const hue = markHue(root);

  return {
    base: resolveDiagramStyle(root),
    neutral: value('--mantine-color-text'),
    tangentBlue: hue('blue'),
    tangentOpposite: hue('violet'),
    focus: hue('yellow'),
    apexTriangle: hue('teal'),
    quad: hue('grape'),
    excircle: hue('pink'),
    incircle: hue('red'),
    boundaryPolygon: hue('indigo'),
    midpoint: hue('green'),
    radialCw: hue('orange'),
    radialCcw: hue('cyan'),
    outline: { thin: 1, normal: 1.3, thick: 1.6 },
    dash: {
      tangent: [8, 4, 2, 4],
      midpoint: [6, 4],
      excircle: [4, 3],
      ratioGuide: [2, 3],
      reproj: [2, 2],
      radial: [3, 3],
    },
  };
}

/**
 * Semantic roles for the periodicity-block diagrams (vector diagram, shift
 * map, lattice diagram) in the Segment-Tangent Construction tool's
 * Periodicity tab. A dedicated resolver rather than overloading
 * `resolveSegmentTangentStyle` — per THEMING.md, tools with their own
 * vocabulary get their own resolver and reuse the shared contract for
 * anything it already decides.
 */
export interface PeriodicityDiagramStyle {
  base: DiagramStyle;
  neutral: string;
  origin: string;
  unisonVector1: string;
  unisonVector2: string;
  parallelogramFill: number;
  dimPoint: string;
  marker: string;
  /** One color per traversal cycle, cycled if there are more cycles than colors. */
  cyclePalette: string[];
}

export function resolvePeriodicityDiagramStyle(
  root: Element = document.documentElement
): PeriodicityDiagramStyle {
  const css = getComputedStyle(root);
  const value = (name: string) => css.getPropertyValue(name).trim();
  const hue = markHue(root);

  return {
    base: resolveDiagramStyle(root),
    neutral: value('--mantine-color-default-border'),
    origin: value('--mantine-color-text'),
    unisonVector1: hue('green'),
    unisonVector2: hue('orange'),
    parallelogramFill: 0.18,
    dimPoint: value('--mantine-color-dimmed'),
    marker: hue('yellow'),
    cyclePalette: [
      hue('red'),
      hue('blue'),
      hue('green'),
      hue('grape'),
      hue('orange'),
      hue('teal'),
      hue('pink'),
      hue('indigo'),
    ],
  };
}

/**
 * Semantic roles for the Interval Placement plot (endpoint/anchor canvas,
 * hover spines, alpha=0/beta=0 comparison overlays). Reuses
 * `resolveDiagramStyle` as `base` for the shared grid/annotation treatment.
 * The per-interval hue coding (`hueForInterval`/`intervalColor` in
 * `pages/interval-placement/visuals.ts`) is data-driven HSL, not a themed
 * role, so it stays outside this resolver.
 */
export interface IntervalPlacementStyle {
  base: DiagramStyle;
  /** Whether the per-interval hue coding should use its dark-surface lightness curve. */
  isDark: boolean;
  neutral: string;
  grid: string;
  octaveGrid: string;
  anchorRangeFill: string;
  anchorRangeOpacity: number;
  anchorFloatRing: string;
  betaZero: string;
  betaZeroLink: string;
  alphaZero: string;
  labelBackground: string;
  /** Resolved (not `var(...)`) — `ctx.font` can't resolve custom properties itself. */
  fontFamily: string;
  /**
   * Piano-key roles for the Keyboard panel. Fixed Mantine palette shades
   * (verified identical across `data-mantine-color-scheme`), not scheme
   * conditionals: an idle white/black key should always read as ivory/ebony,
   * the same way the physical instrument would, regardless of app theme.
   */
  whiteKey: string;
  blackKey: string;
  keyDivider: string;
  /** Fretboard fret/string line opacity against `neutral`, via `color-mix`, not a literal color. */
  boardLineOpacity: number;
  boardMarkerOpacity: number;
}

export function resolveIntervalPlacementStyle(
  root: Element = document.documentElement
): IntervalPlacementStyle {
  const css = getComputedStyle(root);
  const value = (name: string) => css.getPropertyValue(name).trim();
  const hue = markHue(root);
  const isDark = root.getAttribute('data-mantine-color-scheme') === 'dark';

  return {
    base: resolveDiagramStyle(root),
    isDark,
    neutral: value('--mantine-color-text'),
    grid: value('--mantine-color-default-border'),
    octaveGrid: value('--mantine-color-dimmed'),
    /**
     * The pitch-window band, two steps off the panel background in each
     * scheme's own numbered shade — `gray-2` in light (panel is `white`,
     * `gray-0`/`gray-1` are the first two steps off it), `dark-4` in dark
     * (panel is `dark-6`, so `dark-5`/`dark-4` are the first two steps
     * lighter) — a plain theme-neutral grey instead of the categorical
     * cyan every other per-role color on this page uses, since this band
     * marks the pitch window itself, not a data role. Opacity is much
     * higher than the old cyan fill's 0.08: a grey has no hue to separate
     * it from the (also grey/neutral) panel background, only lightness, so
     * it needs a much stronger mix to actually read as a band rather than
     * disappear into the panel.
     */
    anchorRangeFill: value(isDark ? '--mantine-color-primary-1' : '--mantine-color-primary-3'),
    anchorRangeOpacity: 0.2,
    anchorFloatRing: hue('cyan'),
    betaZero: hue('cyan'),
    betaZeroLink: hue('red'),
    alphaZero: hue('blue'),
    labelBackground: value('--mantine-color-default'),
    fontFamily: value('--mantine-font-family'),
    whiteKey: value('--mantine-color-gray-1'),
    blackKey: value('--mantine-color-dark-9'),
    keyDivider: value('--mantine-color-gray-6'),
    boardLineOpacity: 0.32,
    boardMarkerOpacity: 0.1,
  };
}

export function resolveSolidViewStyle(root: Element = document.documentElement): SolidViewStyle {
  const css = getComputedStyle(root);
  const value = (name: string) => css.getPropertyValue(name).trim();
  const hue = markHue(root);

  return {
    originColors: {
      vertex: hue('yellow'),
      edge: hue('cyan'),
      face: hue('red'),
    },
    wireframeVertex: value('--mantine-color-dimmed'),
    wireframeEdge: value('--mantine-color-dimmed'),
    axis: hue('cyan'),
    gridMain: hue('yellow'),
    gridSub: value('--mantine-color-default-border'),
    opacity: { gridPlane: 0.7, dropLine: 0.6, snapLine: 0.9 },
  };
}
