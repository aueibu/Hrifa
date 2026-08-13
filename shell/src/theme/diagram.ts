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
    annotation: {
      background: value('--mantine-color-default'),
      font: '600 9px var(--mantine-font-family-monospace)',
    },
    sourcePoint: { radius: 3.2 },
    grid: { lineWidth: 0.5, opacity: 0.3 },
    hoverPoint: { radius: 7, lineWidth: 1.5 },
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
