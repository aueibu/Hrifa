/**
 * Maximal evenness and the Stern-Brocot tree (Canon 4). E(k, L) is the most even rhythm of k
 * onsets in L slots; Bjorklund's algorithm, the Euclidean algorithm, the continued fraction of
 * k/L and the Stern-Brocot path to k/L are one object.
 *
 * Pitch-domain counterpart: MOS scales and Erv Wilson's scale tree (canon, pitch-rhythm map).
 *
 * Parents come from the lab's `sternBrocotAncestry` (imported by file). Children and the run
 * path are computed here.
 */
import { sternBrocotAncestry, type Frac } from '../harmonic-field/sternBrocot';
import { gapsOf } from './ring';

/** Onsets of E(k, L): floor(i L / k), slot 0 first. */
export function euclidSlots(k: number, L: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < k; i++) {
    out.push(Math.floor((i * L) / k));
  }
  return out;
}

/** Gaps of E(k, L): for gcd(k, L) = 1 the right parent's gaps followed by the left parent's. */
export function euclidGaps(k: number, L: number): number[] {
  return gapsOf(euclidSlots(k, L), L);
}

/** Continued fraction [a0; a1, a2, ...] of p/q. */
export function continuedFraction(p: number, q: number): number[] {
  const cf: number[] = [];
  let a = p;
  let b = q;
  while (b) {
    cf.push(Math.floor(a / b));
    [a, b] = [b, a % b];
  }
  return cf;
}

export interface SbRun {
  dir: 'L' | 'R';
  t: number;
}

/**
 * Runs of lefts and rights on the Stern-Brocot descent from 1/1 to p/q (the continued fraction
 * with its last term reduced by one; a zero term, as in [0; ...], is skipped).
 */
export function sbRuns(p: number, q: number): SbRun[] {
  const cf = continuedFraction(p, q);
  cf[cf.length - 1] -= 1;
  const runs: SbRun[] = [];
  cf.forEach((t, i) => {
    if (t > 0) {
      runs.push({ dir: i % 2 === 0 ? 'R' : 'L', t });
    }
  });
  return runs;
}

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';

function superscript(n: number): string {
  return String(n)
    .split('')
    .map((c) => SUPERSCRIPT[Number(c)])
    .join('');
}

/** `L¹⁰ R L R`: superscript counts, none for 1. */
export function fmtSbPath(runs: SbRun[]): string {
  return runs.map((r) => (r.t === 1 ? r.dir : `${r.dir}${superscript(r.t)}`)).join(' ');
}

export interface SbStructure {
  fraction: Frac;
  /** [left, right]: the smaller and the larger neighbor it is the mediant of; null for a sentinel (0/1). */
  parents: [Frac | null, Frac | null];
  /** [left, right]: the mediants of the fraction with its left and its right parent. */
  children: [Frac, Frac];
  runs: SbRun[];
}

const gcdN = (a: number, b: number): number => (b === 0 ? a : gcdN(b, a % b));

/** Stern-Brocot structure of n/d (reduced first). Null when n or d is not a positive safe integer; fractions above 1 (such as 5/3) are accepted too. */
export function sbStructure(n: number, d: number): SbStructure | null {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || n < 1 || d < 1) {
    return null;
  }
  const g = gcdN(n, d);
  const fraction = { n: n / g, d: d / g };
  const edges = sternBrocotAncestry(fraction.n, fraction.d).filter(
    (e) => e.from.n === fraction.n && e.from.d === fraction.d
  );
  const tos = edges.map((e) => e.to).sort((a, b) => a.n * b.d - b.n * a.d);
  let left: Frac | null = null;
  let right: Frac | null = null;
  for (const t of tos) {
    if (t.n * fraction.d < fraction.n * t.d) {
      left = t;
    } else {
      right = t;
    }
  }
  // sentinels: 0/1 on the left, 1/0 on the right
  const l = left ?? { n: 0, d: 1 };
  const r = right ?? { n: 1, d: 0 };
  return {
    fraction,
    parents: [left, right],
    children: [
      { n: fraction.n + l.n, d: fraction.d + l.d },
      { n: fraction.n + r.n, d: fraction.d + r.d },
    ],
    runs: sbRuns(fraction.n, fraction.d),
  };
}

/**
 * Gaps of E(k, L) built from the parents: the right parent's gaps followed by the left parent's.
 * Null when a parent is a sentinel (k = 1) or k/L is not in lowest terms.
 */
export function gapsFromParents(k: number, L: number): number[] | null {
  if (gcdN(k, L) !== 1) {
    return null;
  }
  const s = sbStructure(k, L);
  if (!s || !s.parents[0] || !s.parents[1]) {
    return null;
  }
  const [lp, rp] = s.parents;
  return [...euclidGaps(rp.n, rp.d), ...euclidGaps(lp.n, lp.d)];
}
