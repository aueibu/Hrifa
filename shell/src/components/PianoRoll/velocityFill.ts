/** How a note is drawn at a velocity when the roll's velocity fill is on. */
export interface VelocityFill {
  /** 0 to 100: how much of the note's own color is kept; the rest is mixed toward a neutral. */
  colorPercent: number;
}

/**
 * The look follows Bitwig at 100 / 50 / 0%: full color; darker and greyer but the same hue; dark,
 * low saturation, hue still visible. So 0% keeps 30% of the color, 50% keeps 65%.
 */
const MIN_COLOR_PERCENT = 30;

/** A velocity as a finite 0 to 1 level; missing or non-finite means full. */
export function velocityLevel(velocity: number | undefined): number {
  return Number.isFinite(velocity) ? Math.min(1, Math.max(0, velocity as number)) : 1;
}

/**
 * Velocity shows through saturation only: a soft note is a greyer version of its color, a loud one
 * is full strength. Always opaque (no alpha anywhere), so notes stay solid over the grid lines.
 * Linear in the velocity, so monotonic.
 */
export function velocityFill(velocity: number | undefined): VelocityFill {
  const level = velocityLevel(velocity);
  return {
    colorPercent: MIN_COLOR_PERCENT + (100 - MIN_COLOR_PERCENT) * level,
  };
}

/**
 * The neutral a quiet note is mixed toward: the muted text role pulled toward the panel, so it is a
 * dim grey that reads as dark on the panel in both schemes (it never goes brighter than muted text).
 */
const NEUTRAL = 'color-mix(in srgb, var(--text-muted) 45%, var(--panel))';

/** The CSS color of a filled note: its color mixed toward the neutral by its velocity. */
export function velocityFillColor(color: string, velocity: number | undefined): string {
  const { colorPercent } = velocityFill(velocity);
  return `color-mix(in srgb, ${color} ${Math.round(colorPercent)}%, ${NEUTRAL})`;
}
