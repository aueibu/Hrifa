import { SOLIDS } from '../../data/polyhedra';

// ---------------------------------------------------------------------------
// Subsystem 1: point placement. Solid -> lattice points. Pure, DOM-free.
// The growth engine only ever consumes the {x,y,weight} array this produces
// plus a grid size n; it has no knowledge of solids, projection, or mixing.
// ---------------------------------------------------------------------------

export type SourceOrigin = 'vertex' | 'edge' | 'face';

export interface SourceOpts {
  vertices: boolean;
  edges: boolean;
  faces: boolean;
}

export interface CatMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
}

export type GrowLayer = 'seed' | 'final' | 'accumulated';

export interface FieldPoint {
  x: number;
  y: number;
  weight: number;
}

export interface SourcePoint3D {
  pos: [number, number, number];
  origin: SourceOrigin;
  originIdx: number;
}

export interface ProjectedSourcePoint {
  idx: number;
  x: number;
  y: number;
  z: number;
  contU: number;
  contV: number;
  u: number;
  v: number;
  scale: number;
  center: number;
  origin: SourceOrigin;
  originIdx: number;
}

export interface SeedPoint {
  u: number;
  v: number;
  weight: number;
  members: { origin: SourceOrigin; originIdx: number }[];
  resolutionMerged: boolean;
  structuralGroups: number;
}

export interface SeedResult {
  points: SeedPoint[];
  trueGroupCount: number;
  rawPointCount: number;
}

export function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

function midpoint3(a: number[], b: number[]): [number, number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

function centroid3(pts: number[][]): [number, number, number] {
  const c: [number, number, number] = [0, 0, 0];
  pts.forEach((p) => {
    c[0] += p[0];
    c[1] += p[1];
    c[2] += p[2];
  });
  return [c[0] / pts.length, c[1] / pts.length, c[2] / pts.length];
}

/**
 * The raw 3D source points a solid offers: vertices as-is, edge midpoints, and
 * face centroids. Edge/face points are as structurally real as vertices but far
 * less prone to symmetry-collapsing under projection.
 */
export function sourcePoints3D(solidKey: string, opts: SourceOpts): SourcePoint3D[] {
  const solid = SOLIDS[solidKey];
  const out: SourcePoint3D[] = [];
  if (opts.vertices) {
    solid.v.forEach((p, idx) => out.push({ pos: p, origin: 'vertex', originIdx: idx }));
  }
  if (opts.edges) {
    solid.edges.forEach(([i, j], idx) =>
      out.push({ pos: midpoint3(solid.v[i], solid.v[j]), origin: 'edge', originIdx: idx })
    );
  }
  if (opts.faces && solid.faces) {
    solid.faces.forEach((fIdx, idx) =>
      out.push({ pos: centroid3(fIdx.map((i) => solid.v[i])), origin: 'face', originIdx: idx })
    );
  }
  return out;
}

/**
 * Project a solid's source points, dropping z (the solid's own axis). Scale and
 * center are always keyed to the vertex extent, even when vertices are toggled
 * off, so the frame doesn't jump as edge/face sources are flipped on and off.
 */
export function projectSourcePoints(
  solidKey: string,
  N: number,
  opts: SourceOpts
): ProjectedSourcePoint[] {
  const solid = SOLIDS[solidKey];
  const xyAll = solid.v.map(([x, y]) => [x, y]);
  const maxAbs = Math.max(...xyAll.flat().map(Math.abs), 1e-6);
  const s = (N * 0.36) / maxAbs;
  const c = N / 2;
  const raw = sourcePoints3D(solidKey, opts);
  return raw.map((p, idx) => {
    const [x, y, z] = p.pos;
    const contU = c + x * s;
    const contV = c + y * s;
    const u = mod(Math.round(contU), N);
    const v = mod(Math.round(contV), N);
    return {
      idx,
      x,
      y,
      z,
      contU,
      contV,
      u,
      v,
      scale: s,
      center: c,
      origin: p.origin,
      originIdx: p.originIdx,
    };
  });
}

/**
 * "True" shadow groups: source points whose (x,y) coincide EXACTLY, before any
 * lattice exists. A property of the solid (and included source types) alone; it
 * never changes with N. This is the only legitimate source for a weight.
 */
export function trueShadowGroups(solidKey: string, opts: SourceOpts) {
  const raw = sourcePoints3D(solidKey, opts);
  const groups = new Map<
    string,
    { x: number; y: number; members: { origin: SourceOrigin; originIdx: number }[] }
  >();
  raw.forEach((p) => {
    const [x, y] = p.pos;
    const key = `${x.toFixed(9)},${y.toFixed(9)}`;
    if (!groups.has(key)) {
      groups.set(key, { x, y, members: [] });
    }
    groups.get(key)!.members.push({ origin: p.origin, originIdx: p.originIdx });
  });
  return [...groups.values()];
}

/**
 * Project true shadow groups onto Z_N^2. Each group is rounded to a lattice cell
 * exactly once (never per-point), so weight is fixed by real geometry and can't
 * be inflated by rounding. Two distinct groups landing on the same cell (a
 * grid-too-coarse artifact) flags `resolutionMerged` rather than folding into
 * "real" weight.
 */
export function seedPoints(solidKey: string, N: number, opts: SourceOpts): SeedResult {
  const solid = SOLIDS[solidKey];
  const xyAll = solid.v.map(([x, y]) => [x, y]);
  const maxAbs = Math.max(...xyAll.flat().map(Math.abs), 1e-6);
  const s = (N * 0.36) / maxAbs;
  const c = N / 2;

  const trueGroups = trueShadowGroups(solidKey, opts);
  const rounded = trueGroups.map((g) => ({
    u: mod(Math.round(c + g.x * s), N),
    v: mod(Math.round(c + g.y * s), N),
    structuralWeight: g.members.length,
    members: g.members,
  }));

  const cellMap = new Map<string, SeedPoint>();
  rounded.forEach((r) => {
    const key = `${r.u},${r.v}`;
    const existing = cellMap.get(key);
    if (existing) {
      existing.weight += r.structuralWeight;
      existing.members.push(...r.members);
      existing.resolutionMerged = true;
      existing.structuralGroups += 1;
    } else {
      cellMap.set(key, {
        u: r.u,
        v: r.v,
        weight: r.structuralWeight,
        members: [...r.members],
        resolutionMerged: false,
        structuralGroups: 1,
      });
    }
  });
  return {
    points: [...cellMap.values()],
    trueGroupCount: trueGroups.length,
    rawPointCount: sourcePoints3D(solidKey, opts).length,
  };
}

// ---------------------------------------------------------------------------
// Cat-map mixing (optional iteration).
// ---------------------------------------------------------------------------

export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    [x, y] = [y, x % y];
  }
  return x;
}

export function matrixDet(M: CatMatrix): number {
  return M.a * M.d - M.b * M.c;
}

export function matrixBijective(M: CatMatrix, N: number) {
  const d = mod(matrixDet(M), N);
  return { det: matrixDet(M), detModN: d, bijective: gcd(d, N) === 1 };
}

export function catStep(u: number, v: number, N: number, M: CatMatrix): [number, number] {
  return [mod(M.a * u + M.b * v, N), mod(M.c * u + M.d * v, N)];
}

interface Trajectory {
  u: number;
  v: number;
  weight: number;
  seedIdx: number;
  resolutionMerged: boolean;
  structuralGroups: number;
  members: { origin: SourceOrigin; originIdx: number }[];
}

export function computeTrajectories(
  seeds: SeedPoint[],
  t: number,
  N: number,
  M: CatMatrix
): Trajectory[][] {
  const frames: Trajectory[][] = [];
  let cur: Trajectory[] = seeds.map((p, i) => ({
    u: p.u,
    v: p.v,
    weight: p.weight,
    seedIdx: i,
    resolutionMerged: p.resolutionMerged,
    structuralGroups: p.structuralGroups,
    members: p.members,
  }));
  frames.push(cur.map((p) => ({ ...p })));
  for (let k = 1; k <= t; k++) {
    cur = cur.map((p) => {
      const [u, v] = catStep(p.u, p.v, N, M);
      return { ...p, u, v };
    });
    frames.push(cur.map((p) => ({ ...p })));
  }
  return frames;
}

export interface AccumulatedArrival {
  u: number;
  v: number;
  weight: number;
  visits: number;
  seedIdxs: number[];
  iterations: number[];
}

/**
 * Accumulate arrivals across the whole iteration history (t=0..t), not just the
 * final frame. A bijective cat-map never creates points, only reshuffles them,
 * so a final-frame view stays as sparse as the seed; accumulating is what gets
 * richer with more iterations.
 */
export function accumulateArrivals(frames: Trajectory[][]): AccumulatedArrival[] {
  const cellMap = new Map<
    string,
    {
      u: number;
      v: number;
      weight: number;
      visits: number;
      seedIdxs: Set<number>;
      iterations: Set<number>;
    }
  >();
  frames.forEach((frame, t) => {
    frame.forEach((p) => {
      const key = `${p.u},${p.v}`;
      const existing = cellMap.get(key);
      if (existing) {
        existing.weight += p.weight;
        existing.visits += 1;
        existing.seedIdxs.add(p.seedIdx);
        existing.iterations.add(t);
      } else {
        cellMap.set(key, {
          u: p.u,
          v: p.v,
          weight: p.weight,
          visits: 1,
          seedIdxs: new Set([p.seedIdx]),
          iterations: new Set([t]),
        });
      }
    });
  });
  return [...cellMap.values()].map((c) => ({
    ...c,
    seedIdxs: [...c.seedIdxs],
    iterations: [...c.iterations],
  }));
}

/**
 * Period of the (possibly non-bijective) matrix on Z_N^2: smallest k with
 * Matrix^k = I (mod N). Returns null if not found within cap — correct behavior
 * for a non-bijective matrix, which has no period.
 */
export function catMapPeriod(N: number, Mat: CatMatrix, cap: number): number | null {
  const Mm = [
    [Mat.a, Mat.b],
    [Mat.c, Mat.d],
  ];
  let P = [
    [1, 0],
    [0, 1],
  ];
  const mul = (A: number[][], B: number[][]) => [
    [mod(A[0][0] * B[0][0] + A[0][1] * B[1][0], N), mod(A[0][0] * B[0][1] + A[0][1] * B[1][1], N)],
    [mod(A[1][0] * B[0][0] + A[1][1] * B[1][0], N), mod(A[1][0] * B[0][1] + A[1][1] * B[1][1], N)],
  ];
  for (let k = 1; k <= cap; k++) {
    P = mul(P, Mm);
    if (P[0][0] === 1 && P[0][1] === 0 && P[1][0] === 0 && P[1][1] === 1) {
      return k;
    }
  }
  return null;
}

export interface PointField {
  points: FieldPoint[];
  seedCount: number;
  trueGroupCount: number;
  rawPointCount: number;
}

/**
 * Full point-placement pipeline: solid -> seed -> mix -> chosen layer, mapped to
 * the growth engine's {x, y, weight} input shape. `weight` is carried through
 * but the growth engine does not consume it (informational only).
 */
export function buildPointField(
  solidKey: string,
  n: number,
  opts: SourceOpts,
  t: number,
  M: CatMatrix,
  layer: GrowLayer
): PointField {
  if (!solidKey || !SOLIDS[solidKey]) {
    return { points: [], seedCount: 0, trueGroupCount: 0, rawPointCount: 0 };
  }
  const { points: seeds, trueGroupCount, rawPointCount } = seedPoints(solidKey, n, opts);
  const frames = computeTrajectories(seeds, t, n, M);
  const final = frames[frames.length - 1];
  const source = layer === 'seed' ? seeds : layer === 'final' ? final : accumulateArrivals(frames);
  const points = source.map((s) => ({ x: s.u, y: s.v, weight: s.weight }));
  return { points, seedCount: seeds.length, trueGroupCount, rawPointCount };
}
