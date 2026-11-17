/**
 * The marks of a pitch ring, defined ONCE: the sizes (SVG units), the on-screen scale, the dot kinds and the ring line and label.
 * Every ring that draws notes uses these (`PitchRing` in `RingStats.tsx`: the main ring, and the chord library's ring, which
 * is the same component at a larger radius) so that a mark can never look different from one ring to the next; the lattice
 * shares the dot classes (`LatticePanel.tsx`, its own radii). The CSS is `ringMarks.module.css`.
 *
 * Two custom properties let a host recolor what must match its own background, without a second definition of a mark:
 * `--ring-gap` (the dot outline and the hollow dot's fill; default `--panel`) and `--ring-cursor` (default `pointer`; a ring
 * whose dots are not buttons sets it to `auto`).
 */
import type { ComponentPropsWithoutRef } from 'react';
import classes from './ringMarks.module.css';

/** The main ring's drawing is a square of this many SVG units. */
export const RING_SIZE = 300;
/** Room round the ring for labels that move out to a second or third lane. */
export const RING_PAD = 44;
/** The ring's radius in the Chromatic view, in SVG units. */
export const RING_R = 104;
/** The widest the main ring's box is on screen, in rem. */
export const RING_BOX_REM = 19.5;
/** The width of the drawing the box shows (the ring plus the room round it), in SVG units. */
export const RING_VIEW_UNITS = RING_SIZE + 2 * RING_PAD;
/** On-screen pixels per SVG unit when the box is at its widest (about 0.804): a ring drawn at this scale has the main ring's marks at the main ring's size. */
export const RING_PX_PER_UNIT = (RING_BOX_REM * 16) / RING_VIEW_UNITS;

/**
 * The marks' scale on a ring drawn larger (or smaller) than the main ring: `radius / RING_R`. A host that scales passes it to
 * the marks as `scale`: it multiplies only RADII (`RingDot`, `RingOutline`, the chevron, the pin ring). Stroke widths and
 * dashes stay the main ring's values in units (`ringMarks.module.css`), and so does the label text (a larger ring is room for
 * labels, not larger type). Unset, `scale` is 1: the main ring and the lattice are unchanged.
 */
export const markScaleFor = (radius: number): number => radius / RING_R;

/** A field note. */
export const RING_DOT_R = 5.5;
/** A sounding note or a chord mark. */
export const RING_SOUND_R = 8;
/** A note that is off the chain (Fifths view): a small dashed mark. */
export const RING_OFF_CHAIN_R = 4;
/** The outline round a hovered note (and round a chord note that sits exactly on a field note). */
export const RING_OUTLINE_R = 12;

/**
 * What a dot is:
 * - `on`: a field note in the subset (solid), `off`: one outside it (hollow);
 * - `lit`: a sounding note (the main ring's green);
 * - `solid`: a chord note that sits exactly on a field note (the neutral solid dot, at the sounding size);
 * - `ghost`: a sounding or chord pitch that is no field note (no fill, dashed outline; green unless a `tone` is given).
 */
export type RingDotKind = 'on' | 'off' | 'lit' | 'solid' | 'ghost';
/** Recolors a ghost: `above` its nearest note is orange, `below` it teal. */
export type RingDotTone = 'above' | 'below';

/** The radius a kind has unless one is given. */
export const dotRadius = (kind: RingDotKind): number =>
  kind === 'on' || kind === 'off' ? RING_DOT_R : RING_SOUND_R;

/**
 * How far a dot's mark reaches from its center: its radius (times `scale`, or `r` if given, which is in main ring units too)
 * plus half its stroke. The strokes are those of `ringMarks.module.css` (keep in step): 1.5 solid, 2 hollow, lit and ghost, 3
 * for a dot that is part of the highlighted chord (`chord`, the blue outline). Used to stop polygon edges at the mark.
 */
export function dotReach(
  kind: RingDotKind,
  o: { chord?: boolean; r?: number; scale?: number } = {}
): number {
  const field = kind === 'on' || kind === 'off' || kind === 'lit';
  const stroke = o.chord && field ? 3 : kind === 'on' || kind === 'solid' ? 1.5 : 2;
  return (o.r ?? dotRadius(kind)) * (o.scale ?? 1) + stroke / 2;
}

/** The CSS class of each kind (`solid` is the `on` look at the sounding size). */
export const DOT_CLASS: Record<RingDotKind, string> = {
  on: classes.dotOn,
  off: classes.dotOff,
  lit: classes.dotLit,
  solid: classes.dotOn,
  ghost: classes.ringGhost,
};

export interface RingDotProps extends Omit<
  ComponentPropsWithoutRef<'circle'>,
  'cx' | 'cy' | 'r' | 'className'
> {
  kind: RingDotKind;
  /** Only a `ghost` takes a tone; it keeps its dashed outline and size. */
  tone?: RingDotTone;
  cx: number;
  cy: number;
  /** Defaults to the radius of the kind (`dotRadius`). In the main ring's units: `scale` multiplies it. */
  r?: number;
  /** The ring's marks scale (`markScaleFor(radius)`), default 1. */
  scale?: number;
}

/** One dot of a ring. Everything else (`tabIndex`, `role`, `aria-*`, `data-*`, handlers, a `<title>` child) goes to the circle. */
export function RingDot({ kind, tone, r, scale = 1, ...rest }: RingDotProps) {
  return (
    <circle
      {...rest}
      className={DOT_CLASS[kind]}
      data-tone={kind === 'ghost' ? tone : undefined}
      r={(r ?? dotRadius(kind)) * scale}
    />
  );
}

export interface RingOutlineProps extends Omit<
  ComponentPropsWithoutRef<'circle'>,
  'cx' | 'cy' | 'r' | 'className'
> {
  cx: number;
  cy: number;
  /** Defaults to `haloRadius(RING_OUTLINE_R, scale)`; an explicit value is in main ring units and `scale` multiplies it. */
  r?: number;
  /** The ring's marks scale (`markScaleFor(radius)`), default 1. */
  scale?: number;
}

/**
 * The radius of a ring round a note (the hover outline, the pin ring) on a ring drawn at `scale`: the note's own radius scales,
 * the GAP between the note and the ring stays the main ring's (`outline - RING_DOT_R`, 6.5 units), so a larger ring does not
 * float its halos far from the dots.
 */
export const haloRadius = (outline: number = RING_OUTLINE_R, scale = 1): number =>
  RING_DOT_R * scale + (outline - RING_DOT_R);

/** An outline round a note: no fill, `--text`, the main ring's hover mark. At a larger `scale` the dot grows and the gap to the outline does not (`haloRadius`); an explicit `r` is in main ring units and scales as before. */
export function RingOutline({ r, scale = 1, ...rest }: RingOutlineProps) {
  return (
    <circle
      {...rest}
      className={classes.selRing}
      r={r === undefined ? haloRadius(RING_OUTLINE_R, scale) : r * scale}
    />
  );
}

/** `subset`: the selected notes' shape (neutral); `chord`: the highlighted chord's shape (blue). */
export type RingPolygonKind = 'subset' | 'chord';

export interface RingPolygonProps extends Omit<
  ComponentPropsWithoutRef<'polygon'>,
  'className' | 'points'
> {
  kind: RingPolygonKind;
  /** The corners, in drawing order (sort them round the ring for a convex shape). */
  points: readonly { x: number; y: number }[];
  /**
   * One radius per corner (same order as `points`): the polygon's OUTLINE is then drawn as separate edges that stop at that
   * distance from each corner's center, i.e. at the edge of the mark sitting on the corner (its radius plus half its stroke);
   * the fill still runs to the centers (the marks cover it). Absent: the polygon is drawn whole, as it always was.
   */
  trim?: readonly number[];
}

/**
 * The edges of a closed polygon, each shortened by `trim[i]` at corner i and `trim[i + 1]` at corner i + 1 (as `M x y L x y`
 * segments); an edge the two radii use up completely is left out. Pure.
 */
export function trimmedEdges(
  points: readonly { x: number; y: number }[],
  trim: readonly number[]
): string {
  const n = points.length;
  if (n < 2) {
    return '';
  }
  const out: string[] = [];
  // two corners are one edge; a closed shape of three or more also joins the last to the first
  const count = n === 2 ? 1 : n;
  for (let i = 0; i < count; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const ra = trim[i] ?? 0;
    const rb = trim[(i + 1) % n] ?? 0;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len <= ra + rb) {
      continue;
    }
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    out.push(
      `M${(a.x + ux * ra).toFixed(2)} ${(a.y + uy * ra).toFixed(2)}L${(b.x - ux * rb).toFixed(2)} ${(b.y - uy * rb).toFixed(2)}`
    );
  }
  return out.join('');
}

/**
 * The polygon through some notes of a ring: the main ring's subset and chord shapes, and the library ring's. With `trim` the
 * `<polygon>` (it keeps `rest`: test ids, style) carries the fill only and the outline is a `<path>` of trimmed edges after it.
 */
export function RingPolygon({ kind, points, trim, ...rest }: RingPolygonProps) {
  const pts = points.map((p) => `${p.x},${p.y}`).join(' ');
  if (!trim) {
    return (
      <polygon
        {...rest}
        className={kind === 'chord' ? classes.chordFill : classes.subsetFill}
        points={pts}
      />
    );
  }
  return (
    <>
      <polygon
        {...rest}
        className={`${kind === 'chord' ? classes.chordFill : classes.subsetFill} ${classes.trimmed}`}
        points={pts}
      />
      <path
        className={kind === 'chord' ? classes.chordEdge : classes.subsetEdge}
        d={trimmedEdges(points, trim)}
        data-edges={kind}
        pointerEvents="none"
      />
    </>
  );
}

export interface RingCircleProps extends Omit<
  ComponentPropsWithoutRef<'circle'>,
  'cx' | 'cy' | 'r' | 'className'
> {
  cx: number;
  cy: number;
  r: number;
}

/** The ring line. */
export function RingCircle(props: RingCircleProps) {
  return <circle {...props} className={classes.ringLine} />;
}

export interface RingLabelProps extends Omit<ComponentPropsWithoutRef<'text'>, 'className'> {
  /** The note is solid (in the subset): `--text`; otherwise (or when not given) the label is `--text-muted`. */
  on?: boolean;
}

/** A note's label: muted, `--text` when `on` (it sets `data-on`). */
export function RingLabel({ on, ...rest }: RingLabelProps) {
  return <text {...rest} className={classes.svgLabel} data-on={on} />;
}
