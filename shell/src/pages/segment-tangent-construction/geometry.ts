/** Pure geometry for the segment/arc/tangent construction — no canvas, no DOM. */

export type Point = readonly [number, number];

export function polygonArea(pts: readonly Point[]): number {
  let sum = 0;
  const k = pts.length;
  for (let i = 0; i < k; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % k];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

export function polygonPerimeter(pts: readonly Point[]): number {
  let sum = 0;
  const k = pts.length;
  for (let i = 0; i < k; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % k];
    sum += Math.hypot(x2 - x1, y2 - y1);
  }
  return sum;
}

export function segmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const cross = (o: Point, a: Point, b: Point) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export function isSelfIntersecting(pts: readonly Point[]): boolean {
  const k = pts.length;
  if (k < 4) {
    return false;
  }
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      // Skip adjacent edges — they share a vertex, which isn't a real crossing.
      if (j === i || j === (i + 1) % k || i === (j + 1) % k) {
        continue;
      }
      if (segmentsIntersect(pts[i], pts[(i + 1) % k], pts[j], pts[(j + 1) % k])) {
        return true;
      }
    }
  }
  return false;
}

export function isConvex(pts: readonly Point[]): boolean {
  const k = pts.length;
  let sign = 0;
  for (let i = 0; i < k; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % k];
    const [cx, cy] = pts[(i + 2) % k];
    const cr = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (Math.abs(cr) < 1e-9) {
      continue;
    }
    const s = cr > 0 ? 1 : -1;
    if (sign === 0) {
      sign = s;
    } else if (s !== sign) {
      return false;
    }
  }
  return true;
}

/** Cumulative boundary angles: length n+1, boundaries[0]=0, boundaries[n]=2*PI. */
export function computeBoundaries(n: number, weights: readonly number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  const b = [0];
  let acc = 0;
  for (let i = 0; i < n - 1; i++) {
    acc += (weights[i] / total) * 2 * Math.PI;
    b.push(acc);
  }
  b.push(2 * Math.PI);
  return b;
}

export function findSegment(a: number, boundaries: readonly number[], n: number): number {
  for (let i = 0; i < n; i++) {
    if (a >= boundaries[i] - 1e-9 && a < boundaries[i + 1] - 1e-9) {
      return i;
    }
  }
  return n - 1;
}

export function angleNorm(x: number, y: number): number {
  let a = Math.atan2(y, x);
  if (a < 0) {
    a += 2 * Math.PI;
  }
  return a;
}

/** Solves |Q + s*u| = rad for s (a line through Q in direction u meeting a circle of radius rad centered at the origin). */
export function lineCircleS(Qx: number, Qy: number, ux: number, uy: number, rad: number): number[] {
  const b = 2 * (Qx * ux + Qy * uy);
  const c = Qx * Qx + Qy * Qy - rad * rad;
  const disc = b * b - 4 * c;
  if (disc < 0) {
    return [];
  }
  const sq = Math.sqrt(disc);
  return [(-b - sq) / 2, (-b + sq) / 2];
}

/** Solves Q + s*u = m*(cos rayAngle, sin rayAngle) for (s, m). */
export function lineRayS(
  Qx: number,
  Qy: number,
  ux: number,
  uy: number,
  rayAngle: number
): { s: number; m: number } | null {
  const vx = Math.cos(rayAngle);
  const vy = Math.sin(rayAngle);
  const det = vx * uy - ux * vy;
  if (Math.abs(det) < 1e-9) {
    return null;
  }
  const s = (Qx * vy - vx * Qy) / det;
  const m = (Qx * uy - ux * Qy) / det;
  return { s, m };
}

/** Solves for t such that Q + s*u lands on the chord C0..C1 at parameter t. */
export function lineChordT(
  Qx: number,
  Qy: number,
  ux: number,
  uy: number,
  C0x: number,
  C0y: number,
  C1x: number,
  C1y: number
): number | null {
  const dx = C1x - C0x;
  const dy = C1y - C0y;
  const det = dx * uy - ux * dy;
  if (Math.abs(det) < 1e-9) {
    return null;
  }
  const bx = C0x - Qx;
  const by = C0y - Qy;
  return (ux * by - bx * uy) / det;
}

/**
 * The apex/base of the purple-tangent triangle for one segment: the two
 * purple lines (tangent to this segment's own arc, at a0 and a1) always meet
 * at distance r/cos(w/2) from center, along the segment's own bisector angle
 * — a classical tangent-intersection fact. The base is the chord connecting
 * the two blue lines' landing points on the outer circle.
 */
export function segmentTriangle(a0: number, a1: number, r: number, R: number) {
  const w = a1 - a0;
  const delta = Math.acos(r / R);
  const bisector = (a0 + a1) / 2;
  const apexDist = r / Math.cos(w / 2);
  const apex: Point = [Math.cos(bisector) * apexDist, Math.sin(bisector) * apexDist];
  const blueA0Ang = a0 - delta;
  const blueA1Ang = a1 + delta;
  const blueA0: Point = [R * Math.cos(blueA0Ang), R * Math.sin(blueA0Ang)];
  const blueA1: Point = [R * Math.cos(blueA1Ang), R * Math.sin(blueA1Ang)];
  return { apex, blueA0, blueA1, blueA0Ang, blueA1Ang, delta };
}

/** Purple-chord / blue-chord quadrilateral, sorted into a simple polygon by angle. */
export function segmentQuad(a0: number, a1: number, r: number, R: number) {
  const { blueA0, blueA1, blueA0Ang, blueA1Ang, delta } = segmentTriangle(a0, a1, r, R);
  const purpleA0Ang = a0 + delta;
  const purpleA1Ang = a1 - delta;
  const purpleA0: Point = [R * Math.cos(purpleA0Ang), R * Math.sin(purpleA0Ang)];
  const purpleA1: Point = [R * Math.cos(purpleA1Ang), R * Math.sin(purpleA1Ang)];
  return [
    { p: blueA0, ang: blueA0Ang },
    { p: purpleA0, ang: purpleA0Ang },
    { p: purpleA1, ang: purpleA1Ang },
    { p: blueA1, ang: blueA1Ang },
  ]
    .sort((a, b) => a.ang - b.ang)
    .map((o) => o.p);
}

export interface TriangleMetrics {
  aLen: number;
  bLen: number;
  cLen: number;
  s: number;
  area: number;
}

export function triangleMetrics(A: Point, B: Point, C: Point): TriangleMetrics {
  const aLen = Math.hypot(B[0] - C[0], B[1] - C[1]); // opposite A
  const bLen = Math.hypot(C[0] - A[0], C[1] - A[1]); // opposite B
  const cLen = Math.hypot(A[0] - B[0], A[1] - B[1]); // opposite C
  const s = (aLen + bLen + cLen) / 2;
  const area = Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1])) / 2;
  return { aLen, bLen, cLen, s, area };
}

export function incircle(A: Point, B: Point, C: Point, m: TriangleMetrics) {
  const { aLen, bLen, cLen, s, area } = m;
  const ix = (aLen * A[0] + bLen * B[0] + cLen * C[0]) / (aLen + bLen + cLen);
  const iy = (aLen * A[1] + bLen * B[1] + cLen * C[1]) / (aLen + bLen + cLen);
  return { center: [ix, iy] as Point, radius: area / s };
}

export function excircles(A: Point, B: Point, C: Point, m: TriangleMetrics) {
  const { aLen, bLen, cLen, s, area } = m;
  return [
    {
      center: [
        (-aLen * A[0] + bLen * B[0] + cLen * C[0]) / (-aLen + bLen + cLen),
        (-aLen * A[1] + bLen * B[1] + cLen * C[1]) / (-aLen + bLen + cLen),
      ] as Point,
      radius: area / (s - aLen),
    },
    {
      center: [
        (aLen * A[0] - bLen * B[0] + cLen * C[0]) / (aLen - bLen + cLen),
        (aLen * A[1] - bLen * B[1] + cLen * C[1]) / (aLen - bLen + cLen),
      ] as Point,
      radius: area / (s - bLen),
    },
    {
      center: [
        (aLen * A[0] + bLen * B[0] - cLen * C[0]) / (aLen + bLen - cLen),
        (aLen * A[1] + bLen * B[1] - cLen * C[1]) / (aLen + bLen - cLen),
      ] as Point,
      radius: area / (s - cLen),
    },
  ];
}

/**
 * Each tangent line touches its own arc (radius r) at angle theta, so its
 * perpendicular distance from center is exactly r; its inversive dual (w.r.t.
 * the outer circle, radius R) is a circle through the origin, centered at
 * distance R²/(2r) along that same angle, with that same radius.
 */
export function inversiveDual(r: number, theta: number, R: number) {
  const dualR = (R * R) / (2 * r);
  return { center: [dualR * Math.cos(theta), dualR * Math.sin(theta)] as Point, radius: dualR };
}

export interface BoundaryCombo {
  bits: number[];
  pts: Point[];
  area: number;
  perimeter: number;
  selfIntersecting: boolean;
  convex: boolean;
}

/**
 * At boundary i, the two arc-crossing points are: this segment's own arc
 * (radius radii[i]) and the previous segment's own arc (radius
 * radii[(i-1+n)%n]), both at angle angles[i]. `bits[i]` picks own (0) vs
 * neighbor (1) per boundary; 2^n total combinations.
 */
export function boundaryComboPoints(
  n: number,
  angles: readonly number[],
  radii: readonly number[],
  bits: readonly number[]
): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n;
    const rad = bits[i] === 0 ? radii[i] : radii[prev];
    pts.push([rad * Math.cos(angles[i]), rad * Math.sin(angles[i])]);
  }
  return pts;
}

/** How many of the boundary polygon's edges a given triangle's edges cross. */
export function triangleBoundaryCrossingCount(
  triPts: readonly Point[],
  boundaryPts: readonly Point[]
): number {
  let count = 0;
  for (let t = 0; t < triPts.length; t++) {
    const t1 = triPts[t];
    const t2 = triPts[(t + 1) % triPts.length];
    for (let e = 0; e < boundaryPts.length; e++) {
      const e1 = boundaryPts[e];
      const e2 = boundaryPts[(e + 1) % boundaryPts.length];
      if (segmentsIntersect(t1, t2, e1, e2)) {
        count++;
      }
    }
  }
  return count;
}

export function evaluateBoundaryCombo(
  n: number,
  angles: readonly number[],
  radii: readonly number[],
  bits: readonly number[]
): BoundaryCombo {
  const pts = boundaryComboPoints(n, angles, radii, bits);
  const selfIntersecting = isSelfIntersecting(pts);
  return {
    bits: [...bits],
    pts,
    area: polygonArea(pts),
    perimeter: polygonPerimeter(pts),
    selfIntersecting,
    convex: !selfIntersecting && isConvex(pts),
  };
}
