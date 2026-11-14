/**
 * Label placement round a ring: pure geometry, no React. Every label starts at its natural spot; one that would overlap
 * a label already placed, or an obstacle (the mode-root chevron), moves outward to the next lane, up to `lanes` lanes
 * (a thin leader line then joins it to its dot); one that fits in no lane is shrunk a little before it is allowed to
 * overlap. Boxes are estimated from the character count and a fixed monospace advance.
 */
export interface Box {
  /** Centre. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LabelItem {
  /** Natural label position (lane 0). */
  x: number;
  y: number;
  /** The ratio text, and an optional second line under it (a cents offset). */
  text: string;
  sub?: string;
}

export interface LabelOptions {
  /** Ring centre: lanes run outward along the ray from here through the natural position. */
  cx: number;
  cy: number;
  /** Radial distance between lanes, and how many lanes there are (lane 0 is the natural position). */
  laneStep: number;
  lanes: number;
  /** Advance of one character of the main text and of the sub line, at full size, and their line heights. */
  advance: number;
  subAdvance: number;
  lineH: number;
  subH: number;
  /** Where the sub line's centre sits below the main line's centre. */
  subDy: number;
  /** Areas that no label may cover, and the drawing area every label must stay inside. */
  obstacles: readonly Box[];
  bounds: { x0: number; y0: number; x1: number; y1: number };
  /** Breathing room added on every side of a label's box (about half the font size), so labels are never tight. */
  pad?: number;
  /** Smallest font scale tried before overlapping is accepted. */
  minScale?: number;
}

export interface LabelPlace {
  /** Where to draw the text (its middle) and the first line's centre. */
  x: number;
  y: number;
  lane: number;
  /** 1 at full size; smaller when the label was shrunk to fit. */
  scale: number;
  /** The label is not on its natural spot (another lane, or slid aside): draw a leader from the dot. */
  leader: boolean;
  /** Everything the label covers, at its scale. */
  box: Box;
  /** True when no lane and no shrink avoided every overlap (the last resort was used). */
  crowded: boolean;
}

const GAP = 1;
/** Sideways slides tried in each lane, in px along the ring (0 first). */
const SHIFTS = [0, 14, -14, 28, -28];
export const boxesOverlap = (a: Box, b: Box, gap = 0): boolean =>
  Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + gap;

/** The box of one label at (x, y) at a font scale. */
export function labelBox(it: LabelItem, x: number, y: number, o: LabelOptions, scale: number): Box {
  const pad = (o.pad ?? 0) * 2;
  const w =
    Math.max(it.text.length * o.advance, (it.sub?.length ?? 0) * o.subAdvance) * scale + 2 + pad;
  if (it.sub === undefined) {
    return { x, y, w, h: o.lineH * scale + pad };
  }
  const top = y - (o.lineH * scale) / 2;
  const bottom = y + o.subDy * scale + (o.subH * scale) / 2;
  return { x, y: (top + bottom) / 2, w, h: bottom - top + pad };
}

/**
 * Place every label. The first item is placed first and so keeps its natural spot unless an obstacle forces it out
 * (callers put the root first). Returns one place per item, in the same order.
 */
export function layoutLabels(items: readonly LabelItem[], o: LabelOptions): LabelPlace[] {
  const placed: Box[] = [];
  const inside = (b: Box) =>
    b.x - b.w / 2 >= o.bounds.x0 &&
    b.x + b.w / 2 <= o.bounds.x1 &&
    b.y - b.h / 2 >= o.bounds.y0 &&
    b.y + b.h / 2 <= o.bounds.y1;
  const free = (b: Box) =>
    inside(b) &&
    !o.obstacles.some((ob) => boxesOverlap(b, ob)) &&
    !placed.some((p) => boxesOverlap(b, p, GAP));
  const minScale = o.minScale ?? 0.75;
  const scales = [1, 0.9, 0.8, minScale].filter((s, i, a) => s >= minScale && a.indexOf(s) === i);
  return items.map((it) => {
    const dx = it.x - o.cx;
    const dy = it.y - o.cy;
    const len = Math.hypot(dx, dy) || 1;
    // a lane is a distance along the ray; a shift slides the label sideways along the ring (the leader follows)
    const at = (lane: number, shift = 0) => ({
      x: it.x + (dx / len) * lane * o.laneStep - (dy / len) * shift,
      y: it.y + (dy / len) * lane * o.laneStep + (dx / len) * shift,
    });
    // prefer full size in a farther lane or slid aside over a smaller label in a nearer one
    for (const scale of scales) {
      for (let lane = 0; lane < o.lanes; lane++) {
        for (const shift of SHIFTS) {
          const p = at(lane, shift);
          const box = labelBox(it, p.x, p.y, o, scale);
          if (free(box)) {
            placed.push(box);
            return { ...p, lane, scale, leader: lane > 0 || shift !== 0, box, crowded: false };
          }
        }
      }
    }
    // nothing fits: the lane that overlaps least (fewest boxes), smallest size
    let best = { lane: 0, hits: Infinity };
    const scale = scales[scales.length - 1];
    for (let lane = 0; lane < o.lanes; lane++) {
      const p = at(lane);
      const box = labelBox(it, p.x, p.y, o, scale);
      const hits =
        placed.filter((q) => boxesOverlap(box, q, GAP)).length +
        o.obstacles.filter((q) => boxesOverlap(box, q)).length +
        (inside(box) ? 0 : 1);
      if (hits < best.hits) {
        best = { lane, hits };
      }
    }
    const p = at(best.lane);
    const box = labelBox(it, p.x, p.y, o, scale);
    placed.push(box);
    return { ...p, lane: best.lane, scale, leader: best.lane > 0, box, crowded: true };
  });
}

/** A conservative box for the mode-root chevron outside a dot at (x, y) as seen from the centre (cx, cy). */
export function chevronBox(cx: number, cy: number, x: number, y: number, gap: number): Box {
  const a = Math.atan2(y - cy, x - cx);
  const mid = gap + 3.5;
  // the chevron is 6 long and 11 wide, tilted by the angle: its axis-aligned box
  const w = Math.abs(Math.cos(a)) * 6 + Math.abs(Math.sin(a)) * 11 + 1;
  const h = Math.abs(Math.sin(a)) * 6 + Math.abs(Math.cos(a)) * 11 + 1;
  return { x: x + mid * Math.cos(a), y: y + mid * Math.sin(a), w, h };
}

/** A leader line from a dot to its displaced label: starts just off the dot, ends just short of the text. */
export function leaderEnds(x: number, y: number, lx: number, ly: number) {
  const d = Math.hypot(lx - x, ly - y) || 1;
  const ux = (lx - x) / d;
  const uy = (ly - y) / d;
  return { x1: x + ux * 7, y1: y + uy * 7, x2: lx - ux * 7, y2: ly - uy * 7 };
}
