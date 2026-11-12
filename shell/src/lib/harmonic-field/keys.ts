/**
 * Transposition map: which keys exist. Pure.
 *
 * "Key" = the same scale started on another note. For every field note t, move the subset (read from its mode root,
 * `rotateSubset`) so that its root lands on t: each moved note is (subset note relative to the root) x t, reduced into
 * [0, repeat) like every field note. A moved note is FOUND when it is the same pitch as a field note: an exact monzo
 * match when the moved note and the field note are both rational; otherwise (either is irrational, e.g. EDO steps)
 * when their circular distance mod the repeat is <= tolC cents (default 0.01). See README.md.
 */
import { mod } from './intervals';
import { rotateSubset } from './subset';
import type { Note } from './types';

export interface Transposition {
  /** Field index the mode root moves to. */
  root: number;
  /** No moved note is missing. */
  complete: boolean;
  /** Count of missing notes. */
  missing: number;
  /** Field index found for each subset degree in rotateSubset order, or null for a missing note. idx[0] === root. */
  idx: (number | null)[];
}

interface SortedCents {
  ix: Int32Array;
  c: Float64Array;
  n: number;
}

/**
 * One entry per field note in field order. A key whose degrees would land on the same field note twice counts as
 * incomplete: the later duplicate is reported missing (idx null). Empty subset gives [].
 * Cost: O(N*F*log F); each moved note is looked up by cents first (binary search wrapping mod the repeat, window 1e-6 c
 * for rational notes), monzos are compared only on a cents hit, and a miss allocates nothing.
 */
export function transpositions(
  field: Note[],
  idx: number[],
  mode: number,
  rep: Note,
  tolCIn?: number
): Transposition[] {
  let tolC = tolCIn as number;
  if (!(tolC >= 0)) {
    tolC = 0.01;
  }
  const rel = rotateSubset(field, idx, mode, rep);
  const F = field.length;
  const L = rep.c;
  if (!rel.length || !(L > 0)) {
    return [];
  }
  const WIN = 1e-6;
  // field notes sorted by cents (all, and the irrational ones alone), as parallel typed arrays
  const mk = (pred: (n: Note) => boolean): SortedCents => {
    const a: number[] = [];
    field.forEach((n, i) => {
      if (pred(n)) {
        a.push(i);
      }
    });
    a.sort((x, y) => field[x].c - field[y].c || x - y);
    return {
      ix: Int32Array.from(a),
      c: Float64Array.from(a, (i) => field[i].c),
      n: a.length,
    };
  };
  const all = mk(() => true);
  const irr = mk((n) => !n.m);
  const lower = (S: SortedCents, c: number): number => {
    let lo = 0;
    let hi = S.n;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (S.c[m] < c) {
        lo = m + 1;
      } else {
        hi = m;
      }
    }
    return lo;
  };
  // circular distance mod the repeat
  const circ = (a: number, b: number): number => {
    let d = a - b;
    if (d < 0) {
      d = -d;
    }
    return d > L / 2 ? L - d : d;
  };
  const nearest = (S: SortedCents, c: number): number => {
    const n = S.n;
    if (!n) {
      return -1;
    }
    const lo = lower(S, c);
    const a = S.c[(lo + n - 1) % n];
    const b = S.c[lo % n];
    const da = circ(a, c);
    const db = circ(b, c);
    return Math.min(da, db) <= tolC + 1e-9 ? S.ix[da <= db ? (lo + n - 1) % n : lo % n] : -1;
  };
  // monzos as dense exponent rows over the primes that occur, so an exact comparison is a short integer loop
  const pr = new Set<string>();
  for (const n of field) {
    if (n.m) {
      for (const p in n.m) {
        pr.add(p);
      }
    }
  }
  for (const n of rel) {
    if (n.m) {
      for (const p in n.m) {
        pr.add(p);
      }
    }
  }
  if (rep.m) {
    for (const p in rep.m) {
      pr.add(p);
    }
  }
  const PL = [...pr];
  const D = PL.length;
  const row = (m: Record<string, number>, buf: Float64Array, o: number): void => {
    for (let d = 0; d < D; d++) {
      buf[o + d] = m[PL[d]] || 0;
    }
  };
  const FV = new Float64Array(F * D);
  const RV = new Float64Array(rel.length * D);
  const RP = new Float64Array(D);
  field.forEach((n, i) => {
    if (n.m) {
      row(n.m, FV, i * D);
    }
  });
  rel.forEach((n, i) => {
    if (n.m) {
      row(n.m, RV, i * D);
    }
  });
  if (rep.m) {
    row(rep.m, RP, 0);
  }
  const sumEq = (q: number, t: number, k: number, fi: number): boolean => {
    for (let d = 0; d < D; d++) {
      if (RV[q * D + d] + FV[t * D + d] - k * RP[d] !== FV[fi * D + d]) {
        return false;
      }
    }
    return true;
  };
  const NR = rel.length;
  const stamp = new Int32Array(F);
  const out: Transposition[] = [];
  for (let t = 0; t < F; t++) {
    const tn = field[t];
    const ix: (number | null)[] = new Array<number | null>(NR);
    let missing = 0;
    for (let q = 0; q < NR; q++) {
      const r = rel[q];
      const c0 = r.c + tn.c;
      const k = Math.floor(c0 / L + 1e-9);
      const gc = k ? c0 - k * L : c0;
      let j = -1;
      if (r.m && tn.m && (k === 0 || rep.m)) {
        // rational moved note: exact monzo match among cents neighbours, else irrational field notes within tolC
        const n = all.n;
        const lo = lower(all, gc - WIN);
        let best = -1;
        for (let s = 0, p = lo; s < n; s++, p++) {
          const u = p % n;
          if (circ(all.c[u], gc) > WIN) {
            break;
          }
          const fi = all.ix[u];
          const f = field[fi];
          if (f.m && sumEq(q, t, k, fi) && fi > best) {
            best = fi;
          }
        }
        if (best < 0) {
          for (let s = 1, p = lo - 1; s < n; s++, p--) {
            const u = mod(p, n);
            if (circ(all.c[u], gc) > WIN) {
              break;
            }
            const fi = all.ix[u];
            const f = field[fi];
            if (f.m && sumEq(q, t, k, fi) && fi > best) {
              best = fi;
            }
          }
        }
        j = best >= 0 ? best : nearest(irr, gc);
      } else {
        j = nearest(all, gc);
      }
      if (j >= 0) {
        if (stamp[j] === t + 1) {
          j = -1;
        } else {
          stamp[j] = t + 1;
        }
      }
      if (j < 0) {
        missing++;
        ix[q] = null;
      } else {
        ix[q] = j;
      }
    }
    out.push({ root: t, complete: missing === 0, missing, idx: ix });
  }
  return out;
}
