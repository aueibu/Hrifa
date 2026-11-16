/**
 * Dip-name placement for the Live roughness chart: the chart analogue of the ring's `labelLayout`. Names live in a LABEL
 * BAND beneath the plot baseline (never inside the plot, so nothing there covers the curve or the note marks). A name's
 * natural spot is directly under its dot's x in lane 0 (just under the band's top); when that would overlap a name
 * already placed it moves to the next lane down (up to `lanes`, `laneStep` apart); when no lane is free it is shrunk a
 * little (down to `minScale`) before anything may overlap, and as a last resort it is dropped (null; the caller keeps a
 * `<title>` on the dot). Several kinds can share one layout: items marked `first` (note labels) are placed before the rest.
 * Names are clamped inside the plot's x range (the first and last dip anchor start and end).
 * A thin vertical leader joins the dot to its name when the name is more than `LEADER_MIN` below the dot or is not in
 * lane 0. Pure geometry; boxes are estimated from the character count (`labelBox`).
 */
import { boxesOverlap, labelBox, type Box, type LabelOptions } from './labelLayout';

export interface ChartDip {
  /** The dot. */
  x: number;
  y: number;
  text: string;
  isFirst: boolean;
  isLast: boolean;
  /** Placed before the others (a field-note ratio label before the dip names), each group left to right. */
  first?: boolean;
}

export interface ChartLabelOptions {
  /** Centre y of lane 0, and the distance between lanes. */
  bandY: number;
  laneStep?: number;
  lanes?: number;
  /** The plot's x range every name stays inside. */
  x0: number;
  x1: number;
  advance?: number;
  /** Half the font size, added on every side of a name's box. */
  pad?: number;
  minScale?: number;
}

export interface ChartLabelPlace {
  /** Text anchor x and the baseline y to draw at. */
  x: number;
  y: number;
  anchor: 'start' | 'middle' | 'end';
  lane: number;
  scale: number;
  /** Draw a thin leader from the dot to the name. */
  leader: boolean;
  /** Where the leader ends (just above the name, vertical when the dot is over the name). */
  leaderTo: { x: number; y: number };
  box: Box;
}

/** A dip within this many x-units of a drawn note label gets no label (that label names the pitch). */
export const NEAR_X = 4;
/** A name more than this far below its dot gets a leader. */
export const LEADER_MIN = 6;
const TEXT_H = 6;
const ASCENT = 3;

export function layoutChartLabels(
  dips: readonly ChartDip[],
  o: ChartLabelOptions
): (ChartLabelPlace | null)[] {
  const lanes = o.lanes ?? 3;
  const step = o.laneStep ?? 11;
  const minScale = o.minScale ?? 0.8;
  const lo: LabelOptions = {
    cx: 0,
    cy: 0,
    laneStep: step,
    lanes,
    advance: o.advance ?? 5.4,
    subAdvance: 0,
    lineH: TEXT_H,
    subH: 0,
    subDy: 0,
    obstacles: [],
    bounds: { x0: o.x0, y0: -Infinity, x1: o.x1, y1: Infinity },
    pad: o.pad ?? 2.5,
    minScale,
  };
  const scales = [1, 0.9, minScale].filter((s, i, a) => s >= minScale && a.indexOf(s) === i);
  const out: (ChartLabelPlace | null)[] = dips.map(() => null);
  const placed: Box[] = [];
  const order = dips
    .map((_, i) => i)
    .sort((a, b) => Number(!!dips[b].first) - Number(!!dips[a].first) || dips[a].x - dips[b].x);
  for (const i of order) {
    const d = dips[i];
    const anchor = d.isFirst ? 'start' : d.isLast ? 'end' : 'middle';
    let done = false;
    for (const scale of scales) {
      for (let lane = 0; lane < lanes && !done; lane++) {
        const cy = o.bandY + lane * step;
        const w = labelBox({ x: 0, y: 0, text: d.text }, 0, cy, lo, scale).w;
        let cx = anchor === 'start' ? d.x + w / 2 : anchor === 'end' ? d.x - w / 2 : d.x;
        cx = Math.min(Math.max(cx, o.x0 + w / 2), o.x1 - w / 2);
        const box = labelBox({ x: 0, y: 0, text: d.text }, cx, cy, lo, scale);
        if (placed.some((p) => boxesOverlap(box, p))) {
          continue;
        }
        placed.push(box);
        const textX = anchor === 'start' ? cx - w / 2 : anchor === 'end' ? cx + w / 2 : cx;
        const top = cy - (TEXT_H / 2) * scale;
        out[i] = {
          x: textX,
          y: cy + ASCENT * scale,
          anchor,
          lane,
          scale,
          leader: lane > 0 || top - d.y > LEADER_MIN,
          leaderTo: {
            x: Math.min(Math.max(d.x, cx - w / 2 + 2), cx + w / 2 - 2),
            y: top - 2,
          },
          box,
        };
        done = true;
      }
      if (done) {
        break;
      }
    }
  }
  return out;
}
