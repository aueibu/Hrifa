/** The field (reduced, filtered, sorted, de-duplicated notes), its lattice view and CPS chords. Pure. */
import { MAXN, dedupeSort, passesMask, reduceInto } from './intervals';
import type { FieldResult, Note, PrimeMask } from './types';

/** Reduce into the repeat, apply the prime filter, sort, de-duplicate, cap. */
export function buildField(notes: Note[], rep: Note, mask: PrimeMask): FieldResult {
  let out = dedupeSort(notes.map((n) => reduceInto(n, rep)).filter((n) => passesMask(n, mask)));
  const truncated = out.length > MAXN;
  if (truncated) {
    out = out.slice(0, MAXN);
  }
  return { notes: out, truncated };
}

/* ---------------- lattice ---------------- */

export type LatticeMode = 'gen' | 'prime' | 'cps';

export interface LatticePoint {
  i: number;
  x: number[];
}

export interface Lattice {
  axes: number[] | null;
  pts: LatticePoint[];
  skipped: number;
  dropped: number | null;
}

/**
 * Integer coordinates for each field note.
 *  mode 'gen'  : generator exponents recorded by genAdditive/genOrthoplex (null if any note lacks them).
 *  mode 'prime': monzo exponents over the primes present, minus the repeat's prime when the repeat is a
 *                single-prime power (so 2/1-equivalent notes coincide). Irrational notes are skipped.
 *  mode 'cps'  : one axis per CPS factor; coordinate 1 if the note uses that factor, else 0.
 */
export function latticeCoords(field: Note[], rep: Note, mode: LatticeMode): Lattice | null {
  if (mode === 'gen') {
    if (!field.length || !field.every((n) => n.x)) {
      return null;
    }
    return {
      axes: null,
      pts: field.map((n, i) => ({ i, x: n.x as number[] })),
      skipped: 0,
      dropped: null,
    };
  }
  if (mode === 'cps') {
    if (!field.length || !field.every((n) => n.f)) {
      return null;
    }
    const nf = Math.max(...field.map((n) => Math.max(-1, ...(n.f as number[])))) + 1;
    return {
      axes: null,
      pts: field.map((n, i) => ({
        i,
        x: Array.from({ length: nf }, (_, a) => ((n.f as number[]).includes(a) ? 1 : 0)),
      })),
      skipped: 0,
      dropped: null,
    };
  }
  const rp = rep.m ? Object.keys(rep.m) : [];
  const drop = rp.length === 1 ? rp[0] : null;
  const ps = new Set<number>();
  let skipped = 0;
  for (const n of field) {
    if (!n.m) {
      skipped++;
      continue;
    }
    for (const p in n.m) {
      if (p !== drop) {
        ps.add(Number(p));
      }
    }
  }
  const axes = [...ps].sort((a, b) => a - b);
  const pts: LatticePoint[] = [];
  field.forEach((n, i) => {
    if (n.m) {
      const m = n.m;
      pts.push({ i, x: axes.map((p) => m[p] || 0) });
    }
  });
  return { axes, pts, skipped, dropped: drop ? Number(drop) : null };
}

/** [fieldIndexA, fieldIndexB, axis] */
export type LatticeEdge = [number, number, number];

/**
 * rule 'step' (default): pairs exactly one step apart on one axis -> [indexA, indexB, axis].
 * rule 'swap' (CPS): pairs that differ by swapping one factor for another, i.e. share all but one factor -> axis -1.
 */
export function latticeEdges(pts: LatticePoint[], rule: 'step' | 'swap' = 'step'): LatticeEdge[] {
  const out: LatticeEdge[] = [];
  if (rule === 'swap') {
    for (let a = 0; a < pts.length; a++) {
      for (let b = a + 1; b < pts.length; b++) {
        let d = 0;
        const x = pts[a].x;
        const y = pts[b].x;
        for (let t = 0; t < x.length && d <= 2; t++) {
          d += Math.abs(x[t] - y[t]);
        }
        if (d === 2) {
          out.push([pts[a].i, pts[b].i, -1]);
        }
      }
    }
    return out;
  }
  const key = (x: number[]) => x.join(',');
  const at = new Map(pts.map((p) => [key(p.x), p.i]));
  for (const p of pts) {
    for (let a = 0; a < p.x.length; a++) {
      const y = p.x.slice();
      y[a]++;
      const j = at.get(key(y));
      if (j != null) {
        out.push([p.i, j, a]);
      }
    }
  }
  return out;
}

export interface CpsChordMember {
  i: number;
  x: number;
}

export interface CpsChord {
  type: 'harmonic' | 'subharmonic';
  common: number[];
  members: CpsChordMember[];
}

/**
 * Chords inside a CPS (Wilson):
 *  harmonic (otonal)    - notes sharing the same k-1 factors; they differ by one factor x, so they sound as x1:x2:x3...
 *  subharmonic (utonal) - notes inside the same k+1 factors; each drops one factor x, so they sound as 1/x1:1/x2:1/x3...
 * Returns groups with at least 3 members; `x` is the factor that varies.
 */
export function cpsChords(field: Note[]): CpsChord[] {
  const pts = field
    .map((n, i) => ({ i, f: n.f }))
    .filter((p): p is { i: number; f: number[] } => !!p.f);
  if (!pts.length) {
    return [];
  }
  const nf = Math.max(...pts.map((p) => Math.max(-1, ...p.f))) + 1;
  const groups = new Map<string, CpsChord>();
  const add = (type: CpsChord['type'], common: number[], i: number, x: number): void => {
    const id = `${type}:${common.join(',')}`;
    if (!groups.has(id)) {
      groups.set(id, { type, common, members: [] });
    }
    (groups.get(id) as CpsChord).members.push({ i, x });
  };
  for (const p of pts) {
    p.f.forEach((x) =>
      add(
        'harmonic',
        p.f.filter((y) => y !== x),
        p.i,
        x
      )
    );
    for (let x = 0; x < nf; x++) {
      if (!p.f.includes(x)) {
        add(
          'subharmonic',
          [...p.f, x].sort((a, b) => a - b),
          p.i,
          x
        );
      }
    }
  }
  const out = [...groups.values()].filter((g) => g.members.length >= 3);
  out.forEach((g) => g.members.sort((a, b) => a.x - b.x));
  return out;
}
