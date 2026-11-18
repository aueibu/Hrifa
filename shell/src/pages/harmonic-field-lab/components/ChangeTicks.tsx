/**
 * Change ticks (M8m, replacing the pins): the change marks of a ring (added, merged, dropped, missing) as one short radial tick
 * at the pitch's exact angle, all the same length, no heads, no stagger. Added: the tick points outward from the ring line, with a small plus at its outer end.
 * Dropped: inward. Missing: inward and dashed, ending in a small open circle (an o; line + o = the full length). Merged: it crosses the ring line and carries a short bar across each end
 * (a small I beam). Color by kind (`changeTicks.module.css`). Common / original notes are not ticks;
 * the ring draws them as plain dots on the line.
 *
 * Lengths are screen px turned into drawing units by `k` (units per px); strokes are fixed px (non-scaling). Angles are radians
 * clockwise from the top (a point is `center + r * (sin a, -cos a)`). Labels are not drawn here: a ring draws its labels after
 * the ticks so they sit on top.
 */
import classes from './changeTicks.module.css';

export type TickKind = 'added' | 'merged' | 'dropped' | 'missing';

/** Every tick's length, px. */
export const TICK_LEN_PX = 14;
/** The merged tick's cross bars, px (one centered on each end). */
export const TICK_BAR_PX = 6;
/** The missing tick's end circle radius, px. */
export const TICK_O_PX = 2.5;

export interface TickPoint {
  x: number;
  y: number;
}

interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const at = (c: TickPoint, a: number, r: number): TickPoint => ({
  x: c.x + r * Math.sin(a),
  y: c.y - r * Math.cos(a),
});

export interface TickGeometry {
  /** The radial tick. */
  tick: Seg;
  /** Added: one bar near the outer end (a plus). Merged: bars across the inner and outer ends. */
  bars?: Seg[];
  /** Missing only: the small open circle at the inner end (line + circle = the full tick length). */
  o?: { x: number; y: number; r: number };
}

/** One tick's shapes: at `angle` on a ring of radius `R` around `center`. `k` is units per px. */
export function tickGeometry(
  angle: number,
  kind: TickKind,
  R: number,
  k: number,
  center: TickPoint = { x: 0, y: 0 }
): TickGeometry {
  const L = TICK_LEN_PX * k;
  const [r1, r2] =
    kind === 'added' ? [R, R + L] : kind === 'merged' ? [R - L / 2, R + L / 2] : [R, R - L];
  const a = at(center, angle, r1);
  const b = at(center, angle, r2);
  const tick = { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
  // bars are tangent to the ring (perpendicular to the radius)
  const h = (TICK_BAR_PX * k) / 2;
  const dx = Math.cos(angle) * h;
  const dy = Math.sin(angle) * h;
  const across = (p: TickPoint): Seg => ({
    x1: p.x - dx,
    y1: p.y - dy,
    x2: p.x + dx,
    y2: p.y + dy,
  });
  if (kind === 'added') {
    // a small plus at the outer end: the bar crosses the tick half a bar length in from its tip
    return { tick, bars: [across(at(center, angle, r2 - h))] };
  }
  if (kind === 'missing') {
    // a small open circle (an o) at the inner end; the line stops at the circle so line + o = the full tick length
    const r = TICK_O_PX * k;
    const o = at(center, angle, r2 + r);
    const end = at(center, angle, r2 + 2 * r);
    return { tick: { ...tick, x2: end.x, y2: end.y }, o: { x: o.x, y: o.y, r } };
  }
  if (kind !== 'merged') {
    return { tick };
  }
  // merged: one bar centered on each end (an I beam)
  return { tick, bars: [across(a), across(b)] };
}

export interface TickSpec {
  /** Radians clockwise from the top. */
  angle: number;
  kind: TickKind;
}

/** The ticks of a ring. Render after the ring and the dots and before the ring's labels. `R` is the ring's radius in drawing units, `k` units per px, `center` the ring's center. */
export function ChangeTicks({
  ticks,
  R,
  k,
  center = { x: 0, y: 0 },
}: {
  ticks: readonly TickSpec[];
  R: number;
  k: number;
  center?: TickPoint;
}) {
  return (
    <>
      {ticks.map((t, i) => {
        const g = tickGeometry(t.angle, t.kind, R, k, center);
        return (
          <g key={i} className={classes.tick} data-kind={t.kind} data-testid="change-tick">
            <line className={classes.line} {...g.tick} />
            {g.bars?.map((b, j) => (
              <line key={j} className={classes.line} {...b} />
            ))}
            {g.o && <circle className={classes.o} cx={g.o.x} cy={g.o.y} r={g.o.r} />}
          </g>
        );
      })}
    </>
  );
}
