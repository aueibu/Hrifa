import type { PianoRollNote } from './model';
import { rectFromCorners, selectionId, type PixelRect } from './selection';

/** Room above and below the stems, so a pin at 0% or 100% is not cut off (shared with the lane's drawing). */
export const LANE_PAD = 8;
/** A pin's radius in pixels (the pin is an 11 px disc). */
export const PIN_RADIUS = 5.5;
/** Pixels of vertical pointer travel that change a ramp's curve by one unit. */
export const CURVE_PIXELS = 24;
/** The curve's limits: the exponent is 2^-curve, so 4 is a 1/16 power at the early end. */
export const CURVE_LIMIT = 4;

/** One velocity head: a note (or chord, which is one item) with its x position. */
export interface LaneHead {
  id: string;
  x: number;
}

/** A head plus the value its pin is drawn at (0 to 1), for hit tests. */
export interface LanePin extends LaneHead {
  velocity: number;
}

/** A pointer position in lane coordinates: x on the timeline (pixels), y from the track's top. */
export interface LanePoint {
  x: number;
  y: number;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/**
 * The lane's heads: one per selection id (the notes of a chord share an item id, so they are one
 * head), at the first rectangle's start, in time order. `x` is in quarter notes times `scale`.
 */
export function laneHeads(
  notes: readonly PianoRollNote[],
  scale = 1
): Array<LaneHead & { velocity: number }> {
  const seen = new Set<string>();
  const heads: Array<LaneHead & { velocity: number }> = [];
  notes.forEach((note) => {
    const id = selectionId(note);
    if (seen.has(id)) {
      return;
    }
    seen.add(id);
    const velocity = Number.isFinite(note.velocity) ? clamp(note.velocity as number, 0, 1) : 1;
    heads.push({ id, x: note.start * scale, velocity });
  });
  return heads.sort((a, b) => a.x - b.x);
}

/** The y (from the track's top) a pin of this velocity sits at. */
export function velocityY(velocity: number, trackHeight: number): number {
  return LANE_PAD + (1 - clamp(velocity, 0, 1)) * (trackHeight - 2 * LANE_PAD);
}

/** The velocity (0 bottom, 1 top) a y position (from the track's top) stands for, clamped. */
export function percentAtY(y: number, trackHeight: number): number {
  const span = trackHeight - 2 * LANE_PAD;
  return span > 0 ? clamp(1 - (y - LANE_PAD) / span, 0, 1) : 0;
}

/**
 * Pencil sampling: the values a pointer segment from `from` to `to` draws. Every head the segment
 * crosses or passes over (its x within the segment, widened by `radius` at both ends so a press on
 * a pin counts) gets the y of the segment at its own x, as a 0 to 1 velocity. A first sample has no
 * `from` and draws only the heads at the pointer. A fast drag is one long segment between two
 * pointer events, so no head under it is skipped.
 */
export function pencilSample(
  heads: readonly LaneHead[],
  from: LanePoint | null,
  to: LanePoint,
  trackHeight: number,
  radius = PIN_RADIUS
): Map<string, number> {
  const start = from ?? to;
  const low = Math.min(start.x, to.x) - radius;
  const high = Math.max(start.x, to.x) + radius;
  const values = new Map<string, number>();
  heads.forEach((head) => {
    if (head.x < low || head.x > high) {
      return;
    }
    const t = start.x === to.x ? 1 : clamp((head.x - start.x) / (to.x - start.x), 0, 1);
    values.set(head.id, percentAtY(start.y + t * (to.y - start.y), trackHeight));
  });
  return values;
}

/**
 * The heads a ramp from `fromX` to `toX` covers (within `radius` of the span), ordered from the
 * press side (`fromX`) to the release side, whichever way the drag went.
 */
export function rampHeads(
  heads: readonly LaneHead[],
  fromX: number,
  toX: number,
  radius = 0
): LaneHead[] {
  const low = Math.min(fromX, toX) - radius;
  const high = Math.max(fromX, toX) + radius;
  const inside = heads.filter((head) => head.x >= low && head.x <= high);
  return inside.sort((a, b) => (fromX <= toX ? a.x - b.x : b.x - a.x));
}

/** The curve applied to a 0..1 position: t^(2^-curve). 0 is linear, up (positive) is early, down late. */
export function curvePosition(t: number, curve: number): number {
  const position = clamp(t, 0, 1);
  if (!curve) {
    return position;
  }
  return position ** (2 ** -clamp(curve, -CURVE_LIMIT, CURVE_LIMIT));
}

/** The curve a vertical drag asks for: dragging up (negative `dy`) raises it, from where it began. */
export function curveFromDrag(startCurve: number, dy: number): number {
  return clamp(startCurve - dy / CURVE_PIXELS, -CURVE_LIMIT, CURVE_LIMIT);
}

export interface RampPoint extends LaneHead {
  value: number;
}

/**
 * The ramp's values. `ordered` runs from the press side to the release side; the first head gets
 * exactly `start` and the last exactly `end`, the heads between them by their time position along
 * that span (shaped by `curve`). A single head, or heads all at one x, get `start`.
 */
export function rampValues(
  ordered: readonly LaneHead[],
  start: number,
  end: number,
  curve = 0
): RampPoint[] {
  if (!ordered.length) {
    return [];
  }
  const first = ordered[0].x;
  const length = Math.abs(ordered[ordered.length - 1].x - first);
  return ordered.map((head, index) => {
    if (index === 0 || length === 0) {
      return { ...head, value: start };
    }
    if (index === ordered.length - 1) {
      return { ...head, value: end };
    }
    const t = Math.abs(head.x - first) / length;
    return { ...head, value: start + (end - start) * curvePosition(t, curve) };
  });
}

/**
 * The velocity ramp kept after release as a secondary selection. Editor-side transient state only,
 * never in the packet: the heads' ids and x (quarter notes) as they were when the ramp was made, the
 * two end percentages and the curve. Re-applying a curve is `rampValues(heads, start, end, curve)`,
 * always from these originals and never from the values already written.
 */
export interface VelocityRamp {
  heads: LaneHead[];
  start: number;
  end: number;
  curve: number;
}

/** The ids of the pins a rectangle (timeline x, y from the track's top) touches, once each. */
export function pinsInRect(
  pins: readonly LanePin[],
  rect: PixelRect,
  trackHeight: number
): string[] {
  return pins
    .filter((pin) => {
      const y = velocityY(pin.velocity, trackHeight);
      return (
        pin.x + PIN_RADIUS >= rect.left &&
        pin.x - PIN_RADIUS <= rect.left + rect.width &&
        y + PIN_RADIUS >= rect.top &&
        y - PIN_RADIUS <= rect.top + rect.height
      );
    })
    .map((pin) => pin.id)
    .filter((id, index, ids) => ids.indexOf(id) === index);
}

/** The marquee rectangle between two lane points. */
export function laneRect(a: LanePoint, b: LanePoint): PixelRect {
  return rectFromCorners(a.x, a.y, b.x, b.y);
}

/** The time span a Time-tool drag covers, snapped outward to the grid (the roll's own rule). */
export function snapSpan(
  fromX: number,
  toX: number,
  pixelsPerQuarter: number,
  unit: number
): { start: number; end: number } {
  const start = Math.max(
    0,
    Math.floor(Math.min(fromX, toX) / pixelsPerQuarter / unit + 1e-9) * unit
  );
  const end = Math.ceil(Math.max(fromX, toX) / pixelsPerQuarter / unit - 1e-9) * unit;
  return { start, end: end > start ? end : start + unit };
}
