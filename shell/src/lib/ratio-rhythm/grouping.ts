/**
 * Groupings (Canon 4): flat groupings (compositions), their text, hierarchical groupings
 * (trees; little Schroeder counts, top-down and bottom-up totals) and proximity grouping.
 *
 * Pitch-domain counterpart: choosing a prime limit and a chain of factors; the tonal hierarchy
 * (structural vs ornamental tones) is the metrical hierarchy here.
 */

/**
 * The one place groupings are written as text, so the style can be flipped.
 * A flat grouping uses `+` with no spaces (`3+3+2`, human, 2026-11-20); gap and rhythm NAMES stay
 * hyphenated (names.ts). A proximity tree shows each bracket's total: `53 = 31 (8 + 9 (1 + 8) + 14) + 22`.
 */
export const GROUPING_TEXT = {
  flatSeparator: '+',
  treeSeparator: ' + ',
};

/** A flat grouping as text: `3+3+2`. */
export function fmtGrouping(groups: number[]): string {
  return groups.join(GROUPING_TEXT.flatSeparator);
}

/** Parse `3+3+2` (also `3 3 2`, `3-3-2`) into a gap list; null on junk. */
export function parseGrouping(text: string): number[] | null {
  const parts = text.split(/[\s+,-]+/).filter(Boolean);
  const out = parts.map((p) => (/^\d+$/.test(p) ? Number(p) : NaN));
  return out.length && out.every((x) => x > 0) ? out : null;
}

/* ---- proximity grouping ---- */

export interface TreeNode {
  size: number;
  kind: 'leaf' | 'split';
  children: TreeNode[];
}

/**
 * Proximity grouping (Lerdahl and Jackendoff; Tenney and Polansky): merge the closest onsets
 * first. Input is the gap list (each gap is the distance from an onset to the next); the boundary
 * after gap i is weighted by that gap, and the smallest weight merges first. Runs of equal weight
 * merge into one split with several children.
 * Gaps 8, 1, 8, 14, 22 give (8 + (1 + 8) + 14) + 22.
 */
export function proximityTree(gaps: number[]): TreeNode | null {
  if (!gaps.length) {
    return null;
  }
  let cl: TreeNode[] = gaps.map((s) => ({ size: s, kind: 'leaf', children: [] }));
  let bw = gaps.slice(0, -1);
  const mk = (run: TreeNode[]): TreeNode =>
    run.length === 1
      ? run[0]
      : { size: run.reduce((a, c) => a + c.size, 0), kind: 'split', children: run };
  while (cl.length > 1) {
    const mn = Math.min(...bw);
    const nc: TreeNode[] = [];
    const nb: number[] = [];
    let run = [cl[0]];
    for (let i = 0; i < bw.length; i++) {
      if (bw[i] === mn) {
        run.push(cl[i + 1]);
      } else {
        nc.push(mk(run));
        nb.push(bw[i]);
        run = [cl[i + 1]];
      }
    }
    nc.push(mk(run));
    cl = nc;
    bw = nb;
  }
  return cl[0];
}

export function treeDepth(t: TreeNode): number {
  return t.kind === 'split' ? 1 + Math.max(...t.children.map(treeDepth)) : 0;
}

/** Leaf sizes left to right. */
export function treeLeaves(t: TreeNode): number[] {
  return t.kind === 'split' ? t.children.flatMap(treeLeaves) : [t.size];
}

function fmtInner(t: TreeNode): string {
  return t.children
    .map((c) => (c.kind === 'split' ? `${c.size} (${fmtInner(c)})` : String(c.size)))
    .join(GROUPING_TEXT.treeSeparator);
}

/** `53 = 31 (8 + 9 (1 + 8) + 14) + 22`: whole total first, each bracket's total before it. */
export function fmtTree(t: TreeNode): string {
  return t.kind === 'split' ? `${t.size} = ${fmtInner(t)}` : String(t.size);
}

/* ---- counting hierarchical groupings ---- */

export interface TreeCounts {
  n: number;
  /** T[m]: trees of total m (a leaf of an allowed size, or a split into 2 to maxBranch subtrees). */
  trees: bigint[];
  /** Compositions of m into the allowed leaf sizes. */
  compositions: bigint[];
  /** Bracketings of j leaves (little Schroeder numbers when maxBranch is unlimited), index j. */
  bracketings: bigint[];
  /** Bottom-up total for n: sum over j of (compositions of n into j leaves) x bracketings[j]. */
  bottomUp: bigint;
  /** Top-down total for n: trees[n]. */
  topDown: bigint;
}

/** Largest n `countTrees` accepts (the lab's UI capped cycles at 96); the work is O(n^3) in bigint. */
export const MAX_TREE_N = 96;

/** Thrown by `countTrees` for n above `MAX_TREE_N` (or not a whole number >= 0). The page should clamp n to `MAX_TREE_N` first. */
export class TreeLimitError extends Error {
  readonly n: number;
  readonly max = MAX_TREE_N;
  constructor(n: number) {
    super(`countTrees: n must be a whole number from 0 to ${MAX_TREE_N}, got ${n}`);
    this.name = 'TreeLimitError';
    this.n = n;
  }
}

/**
 * Count the hierarchical groupings of n pulses whose leaves have the allowed sizes, with at
 * most `maxBranch` parts per split (0 = any). Two routes that must agree: top down (a node is a
 * leaf or a split into subtrees) and bottom up (a flat composition into leaves, then a bracketing
 * of its leaves).
 */
export function countTrees(n: number, leaves: number[], maxBranch = 0): TreeCounts {
  if (!Number.isInteger(n) || n < 0 || n > MAX_TREE_N) {
    throw new TreeLimitError(n);
  }
  const leafSet = new Set(leaves);
  const bOf = (m: number) => (maxBranch === 0 ? m : Math.min(maxBranch, m));
  const T: bigint[] = new Array(n + 1).fill(0n);
  const Ck: bigint[][] = Array.from({ length: n + 1 }, () => new Array<bigint>(n + 1).fill(0n));
  for (let m = 1; m <= n; m++) {
    for (let k = 2; k <= bOf(m); k++) {
      let s = 0n;
      for (let a = 1; a <= m - k + 1; a++) {
        s += T[a] * Ck[k - 1][m - a];
      }
      Ck[k][m] = s;
    }
    let t = leafSet.has(m) ? 1n : 0n;
    for (let k = 2; k <= bOf(m); k++) {
      t += Ck[k][m];
    }
    T[m] = t;
    Ck[1][m] = t;
  }
  const P: bigint[] = new Array(n + 1).fill(0n);
  P[0] = 1n;
  for (let m = 1; m <= n; m++) {
    for (const l of leafSet) {
      if (l <= m) {
        P[m] += P[m - l];
      }
    }
  }
  const SB: bigint[] = new Array(n + 1).fill(0n);
  const D: bigint[][] = Array.from({ length: n + 1 }, () => new Array<bigint>(n + 1).fill(0n));
  if (n >= 1) {
    SB[1] = 1n;
    D[1][1] = 1n;
  }
  for (let j = 2; j <= n; j++) {
    let t = 0n;
    for (let k = 2; k <= bOf(j); k++) {
      let s = 0n;
      for (let a = 1; a <= j - k + 1; a++) {
        s += SB[a] * D[k - 1][j - a];
      }
      D[k][j] = s;
      t += s;
    }
    SB[j] = t;
    D[1][j] = t;
  }
  const Q: bigint[][] = Array.from({ length: n + 1 }, () => new Array<bigint>(n + 1).fill(0n));
  Q[0][0] = 1n;
  for (let m = 1; m <= n; m++) {
    for (let j = 1; j <= m; j++) {
      let s = 0n;
      for (const l of leafSet) {
        if (l <= m) {
          s += Q[m - l][j - 1];
        }
      }
      Q[m][j] = s;
    }
  }
  let bottomUp = 0n;
  for (let j = 1; j <= n; j++) {
    bottomUp += Q[n][j] * SB[j];
  }
  return { n, trees: T, compositions: P, bracketings: SB, bottomUp, topDown: T[n] ?? 0n };
}

/** The little Schroeder numbers 1, 1, 3, 11, 45, 197, ... for j = 1..count (any branching). */
export function littleSchroeder(count: number): bigint[] {
  return countTrees(count, [1]).bracketings.slice(1, count + 1);
}

export interface Mix {
  /** How many groups of each size (same order as the sizes given). */
  counts: number[];
  /** Orderings of that mix (multinomial), bigint. */
  arrangements: bigint;
}

/** Every way to total L from the group sizes, as mixes. 53 into 5s and 3s: 10+1, 7+6, 4+11, 1+16. */
export function groupMixes(L: number, sizes: number[]): Mix[] {
  const out: Mix[] = [];
  const counts: number[] = new Array(sizes.length).fill(0);
  const rec = (i: number, rem: number): void => {
    if (i === sizes.length - 1) {
      if (rem % sizes[i] === 0) {
        counts[i] = rem / sizes[i];
        out.push({ counts: [...counts], arrangements: multinomial(counts) });
      }
      return;
    }
    for (let c = 0; c * sizes[i] <= rem; c++) {
      counts[i] = c;
      rec(i + 1, rem - c * sizes[i]);
    }
  };
  if (sizes.length) {
    rec(0, L);
  }
  return out;
}

function multinomial(counts: number[]): bigint {
  let total = 0;
  let r = 1n;
  for (const c of counts) {
    for (let i = 1; i <= c; i++) {
      total++;
      r = (r * BigInt(total)) / BigInt(i);
    }
  }
  return r;
}

/** Every flat grouping (ordered composition) of L into the given sizes, as gap lists. */
export function* groupingsOf(L: number, sizes: number[]): Generator<number[]> {
  const sorted = [...sizes].sort((a, b) => a - b);
  const cur: number[] = [];
  function* rec(rem: number): Generator<number[]> {
    if (rem === 0) {
      yield cur.slice();
      return;
    }
    for (const s of sorted) {
      if (s > rem) {
        break;
      }
      cur.push(s);
      yield* rec(rem - s);
      cur.pop();
    }
  }
  yield* rec(L);
}

/** Every bracketing of a sequence of leaf sizes (each split has 2 to maxBranch parts; 0 = any). */
export function* bracketings(sizes: number[], maxBranch = 0): Generator<TreeNode> {
  yield* bracket(sizes, 0, sizes.length, maxBranch);
}

function* compositionsOfLen(len: number, k: number): Generator<number[]> {
  const a: number[] = [];
  function* rec(rem: number, kk: number): Generator<number[]> {
    if (kk === 1) {
      a.push(rem);
      yield a.slice();
      a.pop();
      return;
    }
    for (let x = 1; x <= rem - kk + 1; x++) {
      a.push(x);
      yield* rec(rem - x, kk - 1);
      a.pop();
    }
  }
  yield* rec(len, k);
}

function* bracket(sz: number[], i: number, j: number, maxB: number): Generator<TreeNode> {
  const len = j - i;
  if (len === 1) {
    yield { size: sz[i], kind: 'leaf', children: [] };
    return;
  }
  let total = 0;
  for (let q = i; q < j; q++) {
    total += sz[q];
  }
  const top = maxB === 0 ? len : Math.min(maxB, len);
  for (let k = 2; k <= top; k++) {
    for (const blocks of compositionsOfLen(len, k)) {
      const ranges: Array<[number, number]> = [];
      let x = i;
      for (const b of blocks) {
        ranges.push([x, x + b]);
        x += b;
      }
      for (const kids of product(sz, ranges, 0, maxB)) {
        yield { size: total, kind: 'split', children: kids };
      }
    }
  }
}

function* product(
  sz: number[],
  ranges: Array<[number, number]>,
  idx: number,
  maxB: number
): Generator<TreeNode[]> {
  if (idx === ranges.length) {
    yield [];
    return;
  }
  for (const t of bracket(sz, ranges[idx][0], ranges[idx][1], maxB)) {
    for (const rest of product(sz, ranges, idx + 1, maxB)) {
      yield [t, ...rest];
    }
  }
}
