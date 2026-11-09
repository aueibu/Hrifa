/**
 * Geometry and statistics for the Spaces tab: the Tonnetz lattice, the set-class map, and the phase circles.
 * Ported from the artifact; the drawing is done by components, this module only decides where things go.
 */
import { catalog, type CatalogRow, type PrimeConvention } from './pitchSets';
import { fourierTerm } from './spectrum';

export type Pt = [number, number];

// ---------- Tonnetz ----------

export const TONNETZ = { cols: 10, rows: 4, dx: 50, dy: 46, r: 17, x0: 40, y0: 26 };

export function tonnetzViewBox() {
  const { cols, rows, dx, dy, x0, y0 } = TONNETZ;
  return {
    width: x0 * 2 + (cols - 1) * dx + ((rows - 1) * dx) / 2,
    height: y0 * 2 + (rows - 1) * dy + 6,
  };
}

/** Pitch class at lattice cell (a, b): fifths run along a, major thirds along b. */
export const tonnetzPc = (p0: number, a: number, b: number) => (p0 + 7 * a + 4 * b) % 12;

export function tonnetzXY(a: number, b: number): Pt {
  const { dx, dy, rows, x0, y0 } = TONNETZ;
  return [x0 + a * dx + (b * dx) / 2, y0 + (rows - 1 - b) * dy];
}

/** Start the fifths axis where the longest unbroken chain of fifths in the loaded set begins. */
export function tonnetzStart(loaded: number[]): number {
  const has = new Set(loaded);
  let p0 = loaded[0] ?? 0;
  let bestLen = 0;
  loaded.forEach((p) => {
    if (has.has((p + 5) % 12) && loaded.length < 12) {
      return;
    }
    let len = 0;
    let x = p;
    while (has.has(x) && len < 12) {
      len++;
      x = (x + 7) % 12;
    }
    if (len > bestLen) {
      bestLen = len;
      p0 = p;
    }
  });
  return p0;
}

export interface TonnetzTriangle {
  points: Pt[];
  /** Indices (into the sets list) of every set containing all three notes. */
  sets: number[];
}

/** Each small triangle of the lattice that is wholly inside at least one set (up = major, down = minor). */
export function tonnetzTriangles(p0: number, sets: ReadonlySet<number>[]): TonnetzTriangle[] {
  const { cols, rows } = TONNETZ;
  const out: TonnetzTriangle[] = [];
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const tris: [number, number][][] = [
        [
          [i, j],
          [i + 1, j],
          [i, j + 1],
        ],
        [
          [i + 1, j],
          [i, j + 1],
          [i + 1, j + 1],
        ],
      ];
      tris.forEach((t) => {
        const pcs = t.map(([a, b]) => tonnetzPc(p0, a, b));
        const inside = sets.flatMap((s, qi) => (pcs.every((p) => s.has(p)) ? [qi] : []));
        if (inside.length) {
          out.push({ points: t.map(([a, b]) => tonnetzXY(a, b)), sets: inside });
        }
      });
    }
  }
  return out;
}

export interface TonnetzEdge {
  from: Pt;
  to: Pt;
  /** Unit normal, used to fan overlapping sets side by side. */
  normal: Pt;
  /** Indices of the sets containing both end notes. */
  sets: number[];
}

/** Lattice edges (fifth, major third, minor third) whose two notes are both in at least one set. */
export function tonnetzEdges(p0: number, sets: ReadonlySet<number>[]): TonnetzEdge[] {
  const { cols, rows } = TONNETZ;
  const dirs: Pt[] = [
    [1, 0],
    [0, 1],
    [-1, 1],
  ];
  const out: TonnetzEdge[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      dirs.forEach(([da, db]) => {
        const a = i + da;
        const b = j + db;
        if (a < 0 || a >= cols || b >= rows) {
          return;
        }
        const pa = tonnetzPc(p0, i, j);
        const pb = tonnetzPc(p0, a, b);
        const inside = sets.flatMap((s, qi) => (s.has(pa) && s.has(pb) ? [qi] : []));
        if (!inside.length) {
          return;
        }
        const A = tonnetzXY(i, j);
        const B = tonnetzXY(a, b);
        const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
        out.push({
          from: A,
          to: B,
          normal: [-(B[1] - A[1]) / len, (B[0] - A[0]) / len],
          sets: inside,
        });
      });
    }
  }
  return out;
}

/** Perpendicular offset that fans `count` overlapping edges apart. */
export const edgeOffset = (setIndex: number, count: number) => (setIndex - (count - 1) / 2) * 3.2;

/** Dot packing for 2-5 sets sharing one node: [dot radius share, offset share, angles]. */
export const NODE_PACK: Record<number, [number, number, number[]]> = {
  2: [0.5, 0.5, [0, 180]],
  3: [0.4641, 0.5359, [0, 120, 240]],
  4: [0.4142, 0.5858, [0, 90, 180, 270]],
  5: [0.3702, 0.6298, [0, 72, 144, 216, 288]],
};

export interface TonnetzStats {
  /** Connected pieces of the set where notes touch by a third or fifth. */
  pieces: number;
  maj: number;
  min: number;
}

export function tonnetzStats(abs: number[]): TonnetzStats {
  const has = new Set(abs);
  const seen = new Set<number>();
  let pieces = 0;
  abs.forEach((p) => {
    if (seen.has(p)) {
      return;
    }
    pieces++;
    const stack = [p];
    seen.add(p);
    while (stack.length) {
      const x = stack.pop() as number;
      [3, 4, 5, 7, 8, 9].forEach((d) => {
        const y = (x + d) % 12;
        if (has.has(y) && !seen.has(y)) {
          seen.add(y);
          stack.push(y);
        }
      });
    }
  });
  let maj = 0;
  let min = 0;
  for (let i = 0; i < 12; i++) {
    if (has.has(i) && has.has((i + 4) % 12) && has.has((i + 7) % 12)) {
      maj++;
    }
    if (has.has(i) && has.has((i + 3) % 12) && has.has((i + 7) % 12)) {
      min++;
    }
  }
  return { pieces, maj, min };
}

// ---------- set-class map ----------

/** How strongly a set bunches at component k: |F_k| / n, from 0 (spread evenly) to 1 (all one point). */
export const strength = (abs: number[], k: number) =>
  abs.length ? Math.sqrt(fourierTerm(abs, k).pow) / abs.length : 0;

export interface ScatterGroup {
  x: number;
  y: number;
  /** Set classes sharing this point (same interval content, so Z-related sets and mirror images coincide). */
  rows: CatalogRow[];
}

/** Every set class of size n (mirror images merged), placed by two Fourier strengths and grouped by point. */
export function scatterGroups(
  n: number,
  kx: number,
  ky: number,
  conv: PrimeConvention
): ScatterGroup[] {
  const groups = new Map<string, ScatterGroup>();
  catalog(n, true, conv).forEach((r) => {
    const x = strength(r.z, kx);
    const y = strength(r.z, ky);
    const key = `${x.toFixed(3)},${y.toFixed(3)}`;
    const g = groups.get(key);
    if (g) {
      g.rows.push(r);
    } else {
      groups.set(key, { x, y, rows: [r] });
    }
  });
  return [...groups.values()];
}

// ---------- phase circles ----------

export interface PhaseCircle {
  /** Each note's position on the circle (unit vector), pitch class 0 at the top. */
  marks: Pt[];
  /** Average position of the notes: its length is the strength, its angle the phase. */
  mean: Pt;
  strength: number;
}

export function phaseCircle(abs: number[], k: number): PhaseCircle {
  const marks: Pt[] = abs.map((p) => {
    const a = (2 * Math.PI * k * p) / 12 - Math.PI / 2;
    return [Math.cos(a), Math.sin(a)];
  });
  const n = abs.length || 1;
  const mean: Pt = [
    marks.reduce((s, m) => s + m[0], 0) / n,
    marks.reduce((s, m) => s + m[1], 0) / n,
  ];
  return { marks, mean, strength: strength(abs, k) };
}
