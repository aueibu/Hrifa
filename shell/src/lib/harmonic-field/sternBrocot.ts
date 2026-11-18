/**
 * M8e: the Stern-Brocot ancestry of a ratio (meta ring, Connect: Parents). Pure, no React.
 *
 * Every positive ratio p/q (lowest terms) is the mediant (a+c)/(b+d) of exactly two simpler fractions a/b and c/d with
 * |ad - bc| = 1, its parents. The descent from 1/1 (between the sentinels 0/1 and 1/0, which are never returned) visits the
 * mediants on the way to p/q; each visited mediant is joined to its two parents. Those edges are the whole ancestry.
 */

export interface Frac {
  n: number;
  d: number;
}
export interface SbEdge {
  /** The child (a mediant on the path). */
  from: Frac;
  /** One of its two parents. */
  to: Frac;
}

/** The most edges one ancestry returns (a deep chain such as 1001/1000 is cut here, nearest the ratio first dropped last). */
export const SB_MAX_EDGES = 500;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * Every mediant edge on the Stern-Brocot path from 1/1 to n/d, in path order (1/1 first, the ratio's own two edges last).
 * Edges to the sentinels 0/1 and 1/0 are left out. n/d is reduced first; non-positive or non-integer input gives []. Works below 1
 * too (1/2 sits left of 1/1). Capped at `maxEdges`.
 */
export function sternBrocotAncestry(n: number, d: number, maxEdges = SB_MAX_EDGES): SbEdge[] {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || n < 1 || d < 1) {
    return [];
  }
  const g = gcd(n, d);
  const tn = n / g;
  const td = d / g;
  const edges: SbEdge[] = [];
  // left and right bounds, starting at the sentinels 0/1 and 1/0
  let ln = 0;
  let ld = 1;
  let rn = 1;
  let rd = 0;
  for (;;) {
    const mn = ln + rn;
    const md = ld + rd;
    if (!Number.isSafeInteger(mn) || !Number.isSafeInteger(md)) {
      break;
    }
    const self = { n: mn, d: md };
    if (ln !== 0) {
      edges.push({ from: self, to: { n: ln, d: ld } });
    }
    if (rd !== 0) {
      edges.push({ from: self, to: { n: rn, d: rd } });
    }
    if (mn === tn && md === td) {
      break;
    }
    // compare target with the mediant by cross-multiplication
    if (tn * md < mn * td) {
      rn = mn;
      rd = md;
    } else {
      ln = mn;
      ld = md;
    }
  }
  // keep the edges nearest the ratio (the end of the path)
  return edges.slice(-maxEdges);
}

/**
 * The ancestry drawn as two branches (human, M8e look 2: option A): from n/d upward, each ratio is joined only to parents not
 * joined yet, the newer (more complex) parent first, so the ratio forks to its two parents and each branch climbs on its own with
 * no triangles. 7/5: 7/5-4/3, 7/5-3/2, 4/3-1/1, 3/2-2/1 (4/3-3/2, 3/2-1/1 and 2/1-1/1 are left out). Every ancestor appears once.
 */
export function sternBrocotBranches(n: number, d: number, maxEdges = SB_MAX_EDGES): SbEdge[] {
  const all = sternBrocotAncestry(n, d, maxEdges);
  if (all.length === 0) {
    return [];
  }
  const key = (f: Frac) => `${f.n}/${f.d}`;
  const parents = new Map<string, Frac[]>();
  for (const e of all) {
    const k = key(e.from);
    parents.set(k, [...(parents.get(k) ?? []), e.to]);
  }
  // the last edge's child is the ratio itself (reduced)
  const start = all[all.length - 1].from;
  const seen = new Set([key(start)]);
  const queue: Frac[] = [start];
  const out: SbEdge[] = [];
  for (let i = 0; i < queue.length; i++) {
    const child = queue[i];
    const ps = [...(parents.get(key(child)) ?? [])].sort((a, b) => b.n + b.d - (a.n + a.d));
    for (const p of ps) {
      if (!seen.has(key(p))) {
        seen.add(key(p));
        out.push({ from: child, to: p });
        queue.push(p);
      }
    }
  }
  return out;
}
