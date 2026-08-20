/** Shift-map cell geometry — the boundary lines and cell coloring behind the shift-map diagram. */

/** Clip an infinite line (point P, direction dir) to the [-range,range]^2 box. */
export function clipLineToBox(
  P: readonly [number, number],
  dir: readonly [number, number],
  range: number
): [[number, number], [number, number]] | null {
  let tMin = -Infinity;
  let tMax = Infinity;
  for (const axis of [0, 1] as const) {
    if (Math.abs(dir[axis]) < 1e-12) {
      if (P[axis] < -range || P[axis] > range) {
        return null;
      }
      continue;
    }
    let t1 = (-range - P[axis]) / dir[axis];
    let t2 = (range - P[axis]) / dir[axis];
    if (t1 > t2) {
      [t1, t2] = [t2, t1];
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
  }
  if (tMin > tMax) {
    return null;
  }
  return [
    [P[0] + tMin * dir[0], P[1] + tMin * dir[1]],
    [P[0] + tMax * dir[0], P[1] + tMax * dir[1]],
  ];
}

/**
 * A stable hash-derived hue for an arbitrary residue-class label, so distinct
 * shift-map cells (or block points by pitch) are visually distinguishable
 * without a fixed, finite set of semantic roles to draw from — the same
 * treatment the source tool used for both the shift map's cell fill and the
 * lattice diagram's per-pitch point coloring.
 */
export function hashHue(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return Math.floor((h * 137.508) % 360);
}
