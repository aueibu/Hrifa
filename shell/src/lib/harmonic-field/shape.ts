/** Scale analysis: step sizes, MOS sizes, mode matrix, interval spectrum, propriety, constant structure. Pure. */
import { EPS, mod, primeLimit, tenneyHeight } from './intervals';
import type { LetteredGroup, Note, SizeGroup } from './types';

/** Group values that differ by less than `tol`, largest first. */
export function groupSizes(steps: number[], tol: number): SizeGroup[] {
  const g: SizeGroup[] = [];
  for (const s of steps) {
    const f = g.find((x) => Math.abs(x.size - s) < tol);
    if (f) {
      f.count++;
    } else {
      g.push({ size: s, count: 1 });
    }
  }
  return g.sort((a, b) => b.size - a.size);
}

export interface MosSize {
  n: number;
  L: number;
  s: number;
}

/** Generator chain sizes that form a MOS (exactly two step sizes) or are equal. */
export function mosSizes(gC: number, pC: number, maxN = 60): MosSize[] {
  const res: MosSize[] = [];
  for (let n = 2; n <= maxN; n++) {
    const pos: number[] = [];
    for (let j = 0; j < n; j++) {
      pos.push(mod(j * gC, pC));
    }
    pos.sort((a, b) => a - b);
    const st = pos.map((p, i) => (i < n - 1 ? pos[i + 1] : pC) - p);
    const g = groupSizes(st, 1e-4);
    if (g.length === 2) {
      res.push({ n, L: g[0].count, s: g[1].count });
    }
    if (g.length === 1 && n > 1) {
      res.push({ n, L: n, s: 0 });
    }
  }
  return res;
}

export type SubsetStructure =
  | { kind: 'equal' }
  | { kind: 'mos'; L: number; s: number }
  | { kind: 'other'; sizes: number };

export interface SubsetAnalysis {
  N: number;
  steps: number[];
  groups: LetteredGroup[];
  stepLetters: string[];
  pattern: string;
  structure: SubsetStructure;
  rational: boolean;
  primeLimit: number | null;
  meanTenney: number | null;
}

/** rel = rotateSubset(...). Steps, step-size groups with letters, pattern, structure, prime limit, mean Tenney height. */
export function analyzeSubset(rel: Note[], rep: Note): SubsetAnalysis | null {
  const N = rel.length;
  const P = rep.c;
  if (!N) {
    return null;
  }
  const steps = rel.map((n, i) => (i < N - 1 ? rel[i + 1].c : P) - n.c);
  const groups: LetteredGroup[] = groupSizes(steps, 0.01);
  const letters =
    groups.length <= 3
      ? ['L', 'M', 's'].filter((_, i) => groups.length === 3 || i !== 1)
      : groups.map((_, i) => String.fromCharCode(97 + i));
  groups.forEach((g, i) => {
    g.letter = letters[i];
  });
  const letterOf = (s: number): string =>
    (groups.find((g) => Math.abs(g.size - s) < 0.01) || { letter: '?' }).letter as string;
  const rational = rel.every((n) => n.m);
  const structure: SubsetStructure =
    groups.length === 1
      ? { kind: 'equal' }
      : groups.length === 2
        ? { kind: 'mos', L: groups[0].count, s: groups[1].count }
        : { kind: 'other', sizes: groups.length };
  return {
    N,
    steps,
    groups,
    stepLetters: steps.map(letterOf),
    pattern: steps.map(letterOf).join(''),
    structure,
    rational,
    primeLimit: rational ? Math.max(1, ...rel.map((n) => primeLimit(n) as number)) : null,
    meanTenney: rational ? rel.reduce((a, n) => a + (tenneyHeight(n) as number), 0) / N : null,
  };
}

/** matrix[i][j] = cents of degree j in mode i. */
export function modeMatrix(rel: Note[], repC: number, cap = 32): number[][] {
  const N = rel.length;
  const M = Math.min(N, cap);
  const out: number[][] = [];
  for (let i = 0; i < M; i++) {
    const row: number[] = [];
    for (let j = 0; j < M; j++) {
      let c = rel[(i + j) % N].c - rel[i].c;
      if (c < -EPS) {
        c += repC;
      }
      row.push(c);
    }
    out.push(row);
  }
  return out;
}

/* ---- scale shape: interval spectrum, propriety, constant structure ---- */

export interface SpectrumRow {
  k: number;
  sizes: SizeGroup[];
  variety: number;
}

/**
 * rel = rotateSubset(...) (sorted, rel[0] = 1/1). For each generic step k = 1..N-1 every degree i to degree i+k
 * (cyclic: wrapping adds repC). Sizes grouped within tol (default 0.01 c), ascending, with counts.
 * Fewer than 2 notes gives [].
 */
export function intervalSpectrum(rel: Note[], repC: number, tol = 0.01): SpectrumRow[] {
  const N = rel.length;
  const out: SpectrumRow[] = [];
  for (let k = 1; k < N; k++) {
    const v: number[] = [];
    for (let i = 0; i < N; i++) {
      const j = i + k;
      v.push(j < N ? rel[j].c - rel[i].c : rel[j - N].c + repC - rel[i].c);
    }
    v.sort((a, b) => a - b);
    const sizes: SizeGroup[] = [];
    let start: number | null = null;
    for (const x of v) {
      if (start !== null && x - start < tol) {
        const g = sizes[sizes.length - 1];
        g.size = (g.size * g.count + x) / (g.count + 1);
        g.count++;
      } else {
        sizes.push({ size: x, count: 1 });
        start = x;
      }
    }
    out.push({ k, sizes, variety: sizes.length });
  }
  return out;
}

export interface ProprietyPair {
  k: number;
  a: number;
  b: number;
}

export interface Propriety {
  verdict: 'strictly proper' | 'proper' | 'improper';
  pairs: ProprietyPair[];
}

/**
 * Rothenberg propriety. Compares each k-step size with each (k+1)-step size (k = 1..N-2).
 * pairs = clashes (a = a k-step, b = a (k+1)-step, a > b).
 */
export function propriety(spectrum: SpectrumRow[], tol = 0.01): Propriety {
  const pairs: ProprietyPair[] = [];
  let equal = false;
  for (let i = 0; i + 1 < spectrum.length; i++) {
    const A = spectrum[i];
    const B = spectrum[i + 1];
    for (const a of A.sizes) {
      for (const b of B.sizes) {
        const d = a.size - b.size;
        if (d >= tol) {
          pairs.push({ k: A.k, a: a.size, b: b.size });
        } else if (d > -tol) {
          equal = true;
        }
      }
    }
  }
  return { verdict: pairs.length ? 'improper' : equal ? 'proper' : 'strictly proper', pairs };
}

export interface ConstantStructure {
  cs: boolean;
  example: { size: number; ks: [number, number] } | null;
}

/**
 * Constant structure (Myhill): no interval size occurs for two different step counts.
 * `example` = {size, ks:[k1,k2]} for the clash with the smallest size (null when cs).
 * `spectrum` (optional) = a precomputed intervalSpectrum(rel, repC, tol), to avoid recomputing it.
 * Cost: sorting all (size, k) groups, O(N^2 log N).
 */
export function constantStructure(
  rel: Note[],
  repC: number,
  tol = 0.01,
  spectrum?: SpectrumRow[]
): ConstantStructure {
  const sp = spectrum || intervalSpectrum(rel, repC, tol);
  const all: { size: number; k: number }[] = [];
  for (const r of sp) {
    for (const g of r.sizes) {
      all.push({ size: g.size, k: r.k });
    }
  }
  all.sort((a, b) => a.size - b.size || a.k - b.k);
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length && all[j].size - all[i].size < tol; j++) {
      if (all[j].k !== all[i].k) {
        return {
          cs: false,
          example: {
            size: (all[i].size + all[j].size) / 2,
            ks: [Math.min(all[i].k, all[j].k), Math.max(all[i].k, all[j].k)],
          },
        };
      }
    }
  }
  return { cs: true, example: null };
}
