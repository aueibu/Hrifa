/**
 * Fokker/Erlich periodicity-block construction, ported from the source
 * applet's Phase 3–12 history (see HANDOFF-v4.md). This module is the
 * safety-critical core the tool's own "verify before shipping" law bears
 * most heavily on — every formula here has a documented failure mode it was
 * built to fix; see `periodicityBlock.test.ts` for the regression checks
 * that turn the handoff's hand-verified claims into an automated net.
 */

export function isDegeneratePair(g1: number, g2: number): boolean {
  // Degenerate iff g1+g2 is (near) an integer — rank-1 in disguise:
  // mA + nB ≡ (m-n)A whenever A+B is an integer.
  const s = g1 + g2;
  return Math.abs(s - Math.round(s)) < 1e-9;
}

export interface UnisonVectorCandidate {
  m: number;
  n: number;
  dist: number;
  complexity: number;
  badness: number;
}

/**
 * Search increasing complexity shells (|m|+|n|) for (m,n) whose m*g1+n*g2
 * lands within `tolerance` of an integer. Ranked by Cangwu badness
 * (xen.wiki/w/Cangwu_badness): sqrt(k*complexity² + (complexity*error)²),
 * error in cents. Plain "TE simple badness" (complexity × error) was tried
 * first and regressed the classic textbook case — for the 3/2+5/4
 * generators it prefers a complexity-9 candidate (1.95¢ off, determinant
 * 118) over the classic syntonic-comma/diesis pair (determinant 12), because
 * pure complexity × error has no ceiling on how much complexity it will
 * spend to buy a little more accuracy. TE logflat badness — xen.wiki's own
 * fix for this exact failure mode — doesn't apply here: its complexity
 * exponent is r/(n-r), where r is how many free dimensions are left after
 * tempering. This tool always tempers out BOTH generators down to a finite
 * block (rank 0), so r=0 and the exponent is always 0 — logflat degenerates
 * back to simple badness for every periodicity block, fixing nothing. Cangwu
 * badness is built for exactly this: below about sqrt(k) cents of error,
 * badness behaves like a pure complexity penalty (extra accuracy under that
 * threshold barely moves the score); above it, badness reduces to
 * ~complexity*error as before. k=250 (a ~15.8 cent floor, roughly a
 * quartertone) was picked by checking it reproduces the classic syntonic-
 * comma+diesis pair (determinant 12) for 3/2+5/4, while still preferring a
 * modestly more complex but dramatically more accurate candidate when the
 * win is large. This is the tool's one acknowledged departure from "no
 * arbitrary values" — Cangwu badness is designed to have a free tunable
 * parameter, so picking one isn't disguised lookup the way an invented
 * cents-tolerance would be, but the specific value is still a judgment call.
 */
export function allCandidatesWithinTolerance(
  g1: number,
  g2: number,
  tolerance: number,
  maxComplexity: number
): UnisonVectorCandidate[] {
  const CANGWU_K = 250;
  const out: UnisonVectorCandidate[] = [];
  for (let c = 1; c <= maxComplexity; c++) {
    for (let m = -c; m <= c; m++) {
      for (const n of [c - Math.abs(m), -(c - Math.abs(m))]) {
        if (Math.abs(m) + Math.abs(n) !== c || (m === 0 && n === 0)) {
          continue;
        }
        const v = m * g1 + n * g2;
        const dist = Math.abs(v - Math.round(v));
        if (dist <= tolerance) {
          const cents = dist * 1200;
          const badness = Math.sqrt(CANGWU_K * c * c + (c * cents) ** 2);
          out.push({ m, n, dist, complexity: c, badness });
        }
      }
    }
  }
  out.sort((a, b) => a.badness - b.badness);
  return out;
}

export interface TwoUnisonVectors {
  uv1: UnisonVectorCandidate;
  uv2: UnisonVectorCandidate;
  det: number;
}

/** A 2D lattice (two generators) needs TWO independent unison vectors to close into a finite block. */
export function findTwoUnisonVectors(
  g1: number,
  g2: number,
  tolerance: number,
  maxComplexity: number
): TwoUnisonVectors | null {
  const cands = allCandidatesWithinTolerance(g1, g2, tolerance, maxComplexity);
  if (cands.length === 0) {
    return null;
  }
  const uv1 = cands[0];
  const uv2 = cands.find((c) => uv1.m * c.n - uv1.n * c.m !== 0); // independence test
  if (!uv2) {
    return null;
  }
  return { uv1, uv2, det: Math.abs(uv1.m * uv2.n - uv1.n * uv2.m) };
}

function mod1(v: number): number {
  return ((v % 1) + 1) % 1;
}

/**
 * (i,j)'s local coordinates in the basis (uv1, uv2) — i.e. solving
 * [i,j] = a*uv1 + b*uv2 for (a,b). This is the matrix inverse of
 * [[uv1.m, uv2.m], [uv1.n, uv2.n]] (columns = the two unison vectors). A
 * transposed version of this formula shipped for a time and was caught by
 * the most basic property a unison vector must have — adding a unison
 * vector to any point must never change its equivalence class — which the
 * broken formula failed 200/200 random trials; this one passes 0/1000 (see
 * the regression test).
 */
export function localCoords(
  uv1: UnisonVectorCandidate,
  uv2: UnisonVectorCandidate,
  ci: number,
  cj: number
): [number, number] {
  const D = uv1.m * uv2.n - uv1.n * uv2.m;
  const a = (uv2.n * ci - uv2.m * cj) / D;
  const b = (-uv1.n * ci + uv1.m * cj) / D;
  return [a, b];
}

export function classKey(
  i: number,
  j: number,
  uv1: UnisonVectorCandidate,
  uv2: UnisonVectorCandidate
): string {
  const [a, b] = localCoords(uv1, uv2, i, j);
  return `${mod1(a).toFixed(6)}|${mod1(b).toFixed(6)}`;
}

export interface BlockPoint {
  i: number;
  j: number;
  pitch: number;
}

/**
 * Classic Fokker/Erlich construction, confirmed against tonalsoft.com and
 * the Xenharmonic wiki: a point belongs to the block at offset (ci,cj) iff
 * its local coordinates (in the two-unison-vector basis) land in the same
 * unit cell as the offset's own local coordinates — pure algebra, no
 * distance metric (unlike the taxicab-nearest-representative method this
 * replaced, an unmotivated substitute that treated a step in generator 1 and
 * a step in generator 2 as equal-sized with no derivation from their actual,
 * unequal sizes). Enumerates one representative per residue class, then
 * re-expresses each directly in the target cell — O(1) placement per class,
 * not a nearest-point search.
 */
export function buildPeriodicityBlock(
  g1: number,
  g2: number,
  uv1: UnisonVectorCandidate,
  uv2: UnisonVectorCandidate,
  ci = 0,
  cj = 0
): BlockPoint[] {
  const D = uv1.m * uv2.n - uv1.n * uv2.m;
  const e1: [number, number] = [uv1.m, uv1.n];
  const e2: [number, number] = [uv2.m, uv2.n]; // the two comma vectors themselves
  const [aOff, bOff] = localCoords(uv1, uv2, ci, cj);
  const floorA = Math.floor(aOff);
  const floorB = Math.floor(bOff);

  const range = Math.abs(D) + 2;
  const seenResidues = new Map<string, [number, number]>();
  for (let i = -range; i <= range; i++) {
    for (let j = -range; j <= range; j++) {
      const key = classKey(i, j, uv1, uv2);
      if (!seenResidues.has(key)) {
        seenResidues.set(key, [i, j]);
      }
    }
  }

  const points: BlockPoint[] = [];
  for (const [i0, j0] of seenResidues.values()) {
    const [a0, b0] = localCoords(uv1, uv2, i0, j0);
    const fracA = a0 - Math.floor(a0);
    const fracB = b0 - Math.floor(b0);
    const aT = floorA + fracA;
    const bT = floorB + fracB;
    const i = Math.round(aT * e1[0] + bT * e2[0]);
    const j = Math.round(aT * e1[1] + bT * e2[1]);
    points.push({ i, j, pitch: mod1(i * g1 + j * g2) });
  }
  return points.sort((a, b) => a.pitch - b.pitch);
}

export interface InvariantFactors {
  d1: number;
  d2: number;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Invariant factors: Lambda/Lambda' = Z/d1 x Z/d2, d1 | d2, d1*d2 = |det|.
 * d1 = gcd of the four comma-vector integers. d1>1 means the group is a TRUE
 * product, not simple cyclic — no step vector can ever produce a cycle
 * longer than d2, regardless of which step is chosen.
 */
export function invariantFactors(
  uv1: UnisonVectorCandidate,
  uv2: UnisonVectorCandidate
): InvariantFactors {
  const g4 = gcd(gcd(Math.abs(uv1.m), Math.abs(uv1.n)), gcd(Math.abs(uv2.m), Math.abs(uv2.n)));
  const det = Math.abs(uv1.m * uv2.n - uv1.n * uv2.m);
  return { d1: g4, d2: det / g4 };
}

export interface TraversalResult {
  g: number;
  cycles: number[][];
}

/**
 * Walks the TRUE group: step = (stepI, stepJ) in lattice space, which can
 * move through both generators at once, not just one — some blocks only
 * reach a single full cycle via a diagonal step (two commas each using a
 * different lone generator, with coprime "clock" periods, only synchronize
 * into one cycle when both clocks tick together). Block points retain their
 * real (i,j) lattice coordinates, so this traverses the actual group rather
 * than an arbitrary pitch-sorted order (which only coincidentally matches
 * real group-theoretic structure when d1=1 — see `invariantFactors`).
 */
export function traversalCycles(
  points: BlockPoint[],
  uv1: UnisonVectorCandidate,
  uv2: UnisonVectorCandidate,
  stepI: number,
  stepJ: number
): TraversalResult {
  const N = points.length;
  const keyToIdx = new Map<string, number>();
  points.forEach((p, idx) => keyToIdx.set(classKey(p.i, p.j, uv1, uv2), idx));
  const visited = new Array(N).fill(false);
  const cycles: number[][] = [];
  for (let start = 0; start < N; start++) {
    if (visited[start]) {
      continue;
    }
    const cycle: number[] = [];
    let idx = start;
    while (!visited[idx]) {
      visited[idx] = true;
      cycle.push(idx);
      const p = points[idx];
      const nextKey = classKey(p.i + stepI, p.j + stepJ, uv1, uv2);
      const nextIdx = keyToIdx.get(nextKey);
      if (nextIdx === undefined) {
        break;
      }
      idx = nextIdx;
    }
    cycles.push(cycle);
  }
  return { g: cycles.length, cycles };
}
