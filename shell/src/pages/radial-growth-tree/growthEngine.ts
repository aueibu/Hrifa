import type { FieldPoint } from './pointPlacement';

// ---------------------------------------------------------------------------
// Subsystem 2: growth engine. A pure function of (points, n, originIdx, params).
// No knowledge of solids or the mixing pipeline. All positions returned for
// rendering are in an "unrolled" local frame: A sits at (0,0) and every other
// point's rel position is the cumulative minimum-image step from wherever it was
// reached — the universal-cover unrolling of the torus, so seam-crossing paths
// draw as straight continuous lines.
// ---------------------------------------------------------------------------

export type QFormula = 'OP' | 'OPSUM' | 'DIASUM' | 'OP2' | 'P2' | 'O3';
export type ChildFormula = 'P' | '2P' | 'P2' | 'OP';
export type SearchMode = 'widen' | 'exclude';

export interface GrowthParams {
  wrap: boolean;
  qFormula: QFormula;
  childFormula: ChildFormula;
  maxDepth: number;
  searchMode: SearchMode;
  stepDeg: number;
  maxDeg: number;
  excludeDeg: number;
  spanDeg: number;
  annealed: boolean;
  excludeVisited: boolean;
  maxBranches: number;
  branchDensity: number;
  shareVisited: boolean;
}

interface Vec {
  x: number;
  y: number;
}

interface SegmentEntry {
  from: Vec;
  to: Vec;
  fromAbs: FieldPoint;
  toAbs: FieldPoint;
  dir: Vec;
  theta: number;
  mode: SearchMode;
  excludeDeg: number;
  spanDeg: number;
  searchRadius: number;
  radiusO: number;
  radiusP: number;
  radiusQ: number;
  generation: number;
}

interface EndpointEntry {
  rel: Vec;
  abs: FieldPoint;
  dir: Vec;
  theta: number;
  mode: SearchMode;
  excludeDeg: number;
  spanDeg: number;
  searchRadius: number;
  radiusO: number;
  radiusP: number;
  radiusQ: number;
  generation: number;
}

interface TruncatedEntry {
  rel: Vec;
  abs: FieldPoint;
  generation: number;
}

export interface GrowthResult {
  A: FieldPoint;
  others: { rel: Vec; abs: FieldPoint }[];
  radiusO: number;
  radiusP: number;
  radiusQ: number;
  searchRadius: number;
  annealed: boolean;
  children: Vec[];
  segments: SegmentEntry[];
  endpoints: EndpointEntry[];
  truncated: number;
  truncatedPoints: TruncatedEntry[];
  branchPoints: { rel: Vec }[];
  fieldMeanDensity: number;
  n: number;
}

export function angleBetween(v1x: number, v1y: number, v2x: number, v2y: number): number {
  const d = v1x * v2x + v1y * v2y;
  const m1 = Math.hypot(v1x, v1y);
  const m2 = Math.hypot(v2x, v2y);
  if (m1 === 0 || m2 === 0) {
    return 180;
  }
  let c = d / (m1 * m2);
  c = Math.max(-1, Math.min(1, c));
  return (Math.acos(c) * 180) / Math.PI;
}

/** Minimum-image vector from (ax,ay) to (bx,by) on an n x n torus. */
export function torDelta(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  gridN: number,
  wrap: boolean
): Vec {
  let dx = bx - ax;
  let dy = by - ay;
  if (wrap) {
    dx -= gridN * Math.round(dx / gridN);
    dy -= gridN * Math.round(dy / gridN);
  }
  return { x: dx, y: dy };
}

/**
 * O and P are the first and second UNIQUE distance values among all other points
 * relative to `originAbs`. Compared by exact squared integer distance to avoid
 * float epsilon on lattice ties. Returns {0,0} when the field is exhausted from
 * here — the search then dead-ends rather than crashing.
 */
export function nearestDistinctRadii(
  originAbs: FieldPoint,
  points: FieldPoint[],
  n: number,
  wrap: boolean,
  excludeSet?: Set<FieldPoint> | null
): { radiusO: number; radiusP: number } {
  const dists = points
    .filter((p) => p !== originAbs && !(excludeSet && excludeSet.has(p)))
    .map((p) => {
      const { x: dx, y: dy } = torDelta(originAbs.x, originAbs.y, p.x, p.y, n, wrap);
      return { dx, dy, d: Math.hypot(dx, dy), d2: dx * dx + dy * dy };
    })
    .sort((a, b) => a.d - b.d);
  if (dists.length === 0) {
    return { radiusO: 0, radiusP: 0 };
  }
  const radiusO = dists[0].d;
  let radiusP = radiusO;
  for (const entry of dists) {
    if (entry.d2 !== dists[0].d2) {
      radiusP = entry.d;
      break;
    }
  }
  return { radiusO, radiusP };
}

export function applyQFormula(radiusO: number, radiusP: number, formula: QFormula): number {
  switch (formula) {
    case 'OP2':
      return (radiusO * radiusP) ** 2;
    case 'P2':
      return radiusP ** 2;
    case 'O3':
      return radiusO ** 3;
    case 'OPSUM':
      return radiusO + radiusP;
    case 'DIASUM':
      return 2 * radiusO + 2 * radiusP;
    case 'OP':
    default:
      return radiusO * radiusP;
  }
}

export function applyChildFormula(radiusO: number, radiusP: number, formula: ChildFormula): number {
  switch (formula) {
    case '2P':
      return 2 * radiusP;
    case 'P2':
      return radiusP ** 2;
    case 'OP':
      return radiusO * radiusP;
    case 'P':
    default:
      return radiusP;
  }
}

const SEGMENT_SAFETY_CAP = 4000;

interface WithDist {
  abs: FieldPoint;
  rel: Vec;
  d: number;
  d2: number;
}

export function runAlgorithm(
  points: FieldPoint[],
  n: number,
  originIdx: number,
  params: GrowthParams
): GrowthResult {
  const {
    wrap,
    qFormula,
    childFormula,
    maxDepth,
    searchMode,
    stepDeg,
    maxDeg,
    excludeDeg,
    spanDeg,
    annealed,
    excludeVisited,
    maxBranches,
    branchDensity,
    shareVisited,
  } = params;

  const A = points[originIdx];

  const withDist: WithDist[] = points
    .filter((_, i) => i !== originIdx)
    .map((p) => {
      const { x: dx, y: dy } = torDelta(A.x, A.y, p.x, p.y, n, wrap);
      return { abs: p, rel: { x: dx, y: dy }, d: Math.hypot(dx, dy), d2: dx * dx + dy * dy };
    })
    .sort((a, b) => a.d - b.d);

  const { radiusO, radiusP } = nearestDistinctRadii(A, points, n, wrap);
  const radiusQ = applyQFormula(radiusO, radiusP, qFormula);
  const searchRadius = applyChildFormula(radiusO, radiusP, childFormula);

  const children = withDist.filter((o) => o.d <= radiusQ);

  function collectCandidates(
    currentAbs: FieldPoint,
    dir: Vec,
    visited: Set<FieldPoint>,
    extraExclude: Set<FieldPoint> | null,
    extraInclude: WithDist[] | null
  ) {
    let localRadiusO = radiusO;
    let localRadiusP = radiusP;
    let localRadiusQ = radiusQ;
    let localSearchRadius = searchRadius;
    if (annealed) {
      let opExclude: Set<FieldPoint> | null = excludeVisited ? visited : null;
      if (extraExclude && extraExclude.size) {
        opExclude = new Set(opExclude ? opExclude : []);
        for (const p of extraExclude) {
          opExclude.add(p);
        }
      }
      const local = nearestDistinctRadii(currentAbs, points, n, wrap, opExclude);
      localRadiusO = local.radiusO;
      localRadiusP = local.radiusP;
      localRadiusQ = applyQFormula(localRadiusO, localRadiusP, qFormula);
      localSearchRadius = applyChildFormula(localRadiusO, localRadiusP, childFormula);
    }

    const pool = extraInclude ? withDist.concat(extraInclude) : withDist;
    type Cand = { cand: WithDist; delta: Vec; d: number };

    if (searchMode === 'exclude') {
      const list: Cand[] = [];
      for (const cand of pool) {
        if (visited.has(cand.abs) || (extraExclude && extraExclude.has(cand.abs))) {
          continue;
        }
        const { x: dx, y: dy } = torDelta(
          currentAbs.x,
          currentAbs.y,
          cand.abs.x,
          cand.abs.y,
          n,
          wrap
        );
        const d = Math.hypot(dx, dy);
        if (d === 0 || d > localSearchRadius) {
          continue;
        }
        const ang = angleBetween(dx, dy, dir.x, dir.y);
        if (ang >= excludeDeg && ang <= spanDeg) {
          list.push({ cand, delta: { x: dx, y: dy }, d });
        }
      }
      const area =
        (((spanDeg - excludeDeg) * Math.PI) / 180) * localSearchRadius * localSearchRadius;
      return {
        list,
        theta: spanDeg,
        area,
        localRadiusO,
        localRadiusP,
        localRadiusQ,
        localSearchRadius,
      };
    }
    // widening cone: expand theta in steps; stop at the first step with any hits
    for (let theta = 0; theta <= maxDeg; theta += stepDeg) {
      const list: Cand[] = [];
      for (const cand of pool) {
        if (visited.has(cand.abs) || (extraExclude && extraExclude.has(cand.abs))) {
          continue;
        }
        const { x: dx, y: dy } = torDelta(
          currentAbs.x,
          currentAbs.y,
          cand.abs.x,
          cand.abs.y,
          n,
          wrap
        );
        const d = Math.hypot(dx, dy);
        if (d === 0 || d > localSearchRadius) {
          continue;
        }
        const ang = angleBetween(dx, dy, dir.x, dir.y);
        if (ang <= theta) {
          list.push({ cand, delta: { x: dx, y: dy }, d });
        }
      }
      if (list.length > 0) {
        const area = ((theta * Math.PI) / 180) * localSearchRadius * localSearchRadius;
        return { list, theta, area, localRadiusO, localRadiusP, localRadiusQ, localSearchRadius };
      }
    }
    return {
      list: [] as Cand[],
      theta: maxDeg,
      area: ((maxDeg * Math.PI) / 180) * localSearchRadius * localSearchRadius,
      localRadiusO,
      localRadiusP,
      localRadiusQ,
      localSearchRadius,
    };
  }

  const segments: SegmentEntry[] = [];
  const endpoints: EndpointEntry[] = [];
  const truncatedPoints: TruncatedEntry[] = [];
  const branchPoints: { rel: Vec }[] = [];

  function walkNode(
    currentAbs: FieldPoint,
    currentRel: Vec,
    dir: Vec,
    visited: Set<FieldPoint>,
    hopsRemaining: number,
    firstHopExtra: { exclude: Set<FieldPoint>; include: WithDist[] } | null
  ) {
    const generation = maxDepth - hopsRemaining + 1;
    if (segments.length >= SEGMENT_SAFETY_CAP) {
      truncatedPoints.push({ rel: currentRel, abs: currentAbs, generation });
      return;
    }
    if (hopsRemaining <= 0) {
      truncatedPoints.push({ rel: currentRel, abs: currentAbs, generation });
      return;
    }
    const extraExclude = firstHopExtra ? firstHopExtra.exclude : null;
    const extraInclude = firstHopExtra ? firstHopExtra.include : null;
    const { list, theta, area, localRadiusO, localRadiusP, localRadiusQ, localSearchRadius } =
      collectCandidates(currentAbs, dir, visited, extraExclude, extraInclude);
    if (list.length === 0) {
      endpoints.push({
        rel: currentRel,
        abs: currentAbs,
        dir: { x: dir.x, y: dir.y },
        theta,
        mode: searchMode,
        excludeDeg,
        spanDeg,
        searchRadius: localSearchRadius,
        radiusO: localRadiusO,
        radiusP: localRadiusP,
        radiusQ: localRadiusQ,
        generation,
      });
      return;
    }
    const localDensity = area > 0 ? list.length / area : Infinity;
    let kept: typeof list;
    if (maxBranches > 1 && localDensity >= branchDensity) {
      kept = list
        .slice()
        .sort((a, b) => a.d - b.d)
        .slice(0, maxBranches);
    } else {
      kept = [list.reduce((best, c) => (!best || c.d < best.d ? c : best))];
    }
    if (kept.length > 1) {
      branchPoints.push({ rel: currentRel });
    }
    for (const c of kept) {
      visited.add(c.cand.abs);
    } // reserve all siblings before recursion
    for (const c of kept) {
      const toRel = { x: currentRel.x + c.delta.x, y: currentRel.y + c.delta.y };
      segments.push({
        from: currentRel,
        to: toRel,
        fromAbs: currentAbs,
        toAbs: c.cand.abs,
        dir: { x: dir.x, y: dir.y },
        theta,
        mode: searchMode,
        excludeDeg,
        spanDeg,
        searchRadius: localSearchRadius,
        radiusO: localRadiusO,
        radiusP: localRadiusP,
        radiusQ: localRadiusQ,
        generation,
      });
      const newDir = { x: c.delta.x, y: c.delta.y };
      walkNode(c.cand.abs, toRel, newDir, visited, hopsRemaining - 1, null);
    }
  }

  const sharedVisited = shareVisited ? new Set<FieldPoint>() : null;
  const childrenAbsList = children.map((c) => c.abs);
  for (const child of children) {
    if (sharedVisited && sharedVisited.has(child.abs)) {
      continue;
    }
    const visited = sharedVisited ? sharedVisited : new Set<FieldPoint>();
    visited.add(child.abs);
    const dir = { x: child.rel.x, y: child.rel.y };
    const otherSiblings = new Set(childrenAbsList.filter((a) => a !== child.abs));
    const firstHopExtra = {
      exclude: otherSiblings,
      include: [{ abs: A, rel: { x: 0, y: 0 }, d: 0, d2: 0 }],
    };
    walkNode(child.abs, child.rel, dir, visited, maxDepth, firstHopExtra);
  }

  return {
    A,
    others: withDist.map((o) => ({ rel: o.rel, abs: o.abs })),
    radiusO,
    radiusP,
    radiusQ,
    searchRadius,
    annealed,
    children: children.map((c) => c.rel),
    segments,
    endpoints,
    truncated: truncatedPoints.length,
    truncatedPoints,
    branchPoints,
    fieldMeanDensity: points.length / (n * n),
    n,
  };
}

export interface SampleStats {
  count: number;
  mean: number;
  sd: number;
  min: number;
  max: number;
}

/** Empirical check: sample up to `trials` random origins, report gen-1 child-count stats. */
export function sampleOrigins(
  points: FieldPoint[],
  n: number,
  params: GrowthParams,
  trials = 200
): SampleStats | null {
  if (!points.length) {
    return null;
  }
  const take = Math.min(trials, points.length);
  const idxs = new Set<number>();
  while (idxs.size < take) {
    idxs.add(Math.floor(Math.random() * points.length));
  }
  const counts: number[] = [];
  for (const idx of idxs) {
    counts.push(runAlgorithm(points, n, idx, params).children.length);
  }
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const variance = counts.reduce((a, b) => a + (b - mean) * (b - mean), 0) / counts.length;
  return {
    count: counts.length,
    mean,
    sd: Math.sqrt(variance),
    min: Math.min(...counts),
    max: Math.max(...counts),
  };
}
