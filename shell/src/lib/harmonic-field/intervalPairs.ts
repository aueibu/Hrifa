import { nearestRatio } from './deviation';
/**
 * Interval pairs of a subset (M1 of the Scala-tools arc): every directed pair of degrees with the interval between
 * them, the distinct intervals with their counts (the content table), and the location search (Scala `SHOW LOCATIONS`
 * as the lab does it). Pure.
 */
import { EPS, fmtRatio, mulNotes, tenneyHeight } from './intervals';
import type { Note, RelNote } from './types';

/** The matrix is built for up to this many notes (the same cap as the Modes grid). */
export const PAIRS_CAP = 32;
/** Two intervals are one entry of the content table when they differ by less than this (strict, in cents). */
export const PAIRS_GROUP_TOL = 0.01;

export interface PairCell {
  /** Degree indices into `rel` (0-based): the interval of `to` above `from`. */
  from: number;
  to: number;
  /** Octave-reduced (repeat-reduced) size in cents, in (0, repC]. */
  c: number;
  /** True when `to` lies below `from` in the scale, so the interval is read up to the next repeat. */
  wrap: boolean;
  /** Generic step count: how many scale steps up from `from` to `to`, 1 .. N-1. */
  k: number;
  /** Ratio text when both notes are rational, else null. */
  ratio: string | null;
  /** Index into `IntervalPairs.groups`. */
  group: number;
}

export interface PairGroup {
  /** Position in `IntervalPairs.groups` (the table order). */
  id: number;
  /** Mean size in cents. */
  c: number;
  /** Ratio text, or null for an irrational interval (EDO and other cents-only notes). */
  ratio: string | null;
  /** Tenney height of the ratio, null when irrational. */
  h: number | null;
  count: number;
  /** The cells of this interval, in row-major order. */
  cells: { from: number; to: number }[];
  /** Signed deviation (cents) of this interval from the nearest ratio at the `oddLimit` of the call. */
  err: number;
}

export interface IntervalPairs {
  N: number;
  /** `cells[i][j]`: null on the diagonal. */
  cells: (PairCell | null)[][];
  /** Distinct intervals: rational ones by Tenney height (then size), then irrational ones by size. */
  groups: PairGroup[];
  /** The odd limit the `err` values were measured at. */
  oddLimit: number;
}

/**
 * `rel` = rotateSubset(...) (sorted, rel[0] = 1/1), `rep` = the repeat. Directed: (i, j) is degree j above degree i,
 * reduced into the repeat; a pair with j < i wraps (adds the repeat). Null for an empty subset or more than `cap` notes.
 * `oddLimit` is the limit of the reference ratios for `err` (the lab's "vs JI" setting).
 */
export function intervalPairs(
  rel: readonly RelNote[],
  rep: Note,
  oddLimit = 15,
  cap = PAIRS_CAP
): IntervalPairs | null {
  const N = rel.length;
  if (N < 1 || N > cap) {
    return null;
  }
  const raw: { from: number; to: number; c: number; wrap: boolean; k: number; note: Note }[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      if (i === j) {
        continue;
      }
      let note = mulNotes(rel[j], rel[i], -1);
      const wrap = note.c < -EPS || j < i;
      if (wrap) {
        note = mulNotes(note, rep, 1);
      }
      raw.push({ from: i, to: j, c: note.c, wrap, k: j > i ? j - i : j - i + N, note });
    }
  }
  // group within PAIRS_GROUP_TOL (a group starts at its smallest value, as intervalSpectrum does)
  const order = raw.map((_, n) => n).sort((a, b) => raw[a].c - raw[b].c || a - b);
  const bySize: number[][] = [];
  let start = 0;
  for (const n of order) {
    if (bySize.length && raw[n].c - start < PAIRS_GROUP_TOL) {
      bySize[bySize.length - 1].push(n);
    } else {
      bySize.push([n]);
      start = raw[n].c;
    }
  }
  const draft = bySize.map((ns) => {
    const members = [...ns].sort((a, b) => a - b); // row-major
    const rational = members.map((n) => raw[n].note).find((nt) => nt.m);
    const c = members.reduce((s, n) => s + raw[n].c, 0) / members.length;
    return {
      members,
      c,
      ratio: rational ? fmtRatio(rational) : null,
      h: rational ? tenneyHeight(rational) : null,
    };
  });
  draft.sort((a, b) => {
    if ((a.h === null) !== (b.h === null)) {
      return a.h === null ? 1 : -1;
    }
    return a.h !== null && b.h !== null && Math.abs(a.h - b.h) > 1e-9 ? a.h - b.h : a.c - b.c;
  });
  const cells: (PairCell | null)[][] = Array.from({ length: N }, () =>
    Array.from({ length: N }, () => null as PairCell | null)
  );
  const groups: PairGroup[] = draft.map((d, id) => {
    for (const n of d.members) {
      const r = raw[n];
      cells[r.from][r.to] = {
        from: r.from,
        to: r.to,
        c: r.c,
        wrap: r.wrap,
        k: r.k,
        ratio: r.note.m ? fmtRatio(r.note) : null,
        group: id,
      };
    }
    return {
      id,
      c: d.c,
      ratio: d.ratio,
      h: d.h,
      count: d.members.length,
      cells: d.members.map((n) => ({ from: raw[n].from, to: raw[n].to })),
      err: nearestRatio(d.c, oddLimit, rep.c).err,
    };
  });
  return { N, cells, groups, oddLimit };
}

export interface Coverage {
  /** Cells that match. */
  matches: number;
  /** Degrees that have the interval above them (a match starting there), and the number of degrees. */
  above: number;
  N: number;
  /** Degrees that are an end of at least one match. */
  covered: number;
  /** Degrees that are an end of more than one match. */
  multi: number;
  /** The most matches any one degree is an end of. */
  highest: number;
}

/** The coverage figures of a set of matching cells (degree indices into the subset, 0-based). */
export function pairCoverage(cells: readonly { from: number; to: number }[], N: number): Coverage {
  const from = new Set<number>();
  const use = new Map<number, number>();
  for (const c of cells) {
    from.add(c.from);
    use.set(c.from, (use.get(c.from) ?? 0) + 1);
    use.set(c.to, (use.get(c.to) ?? 0) + 1);
  }
  let multi = 0;
  let highest = 0;
  for (const n of use.values()) {
    multi += n > 1 ? 1 : 0;
    highest = Math.max(highest, n);
  }
  return { matches: cells.length, above: from.size, N, covered: use.size, multi, highest };
}

export interface Location {
  cells: PairCell[];
  coverage: Coverage;
  /** Largest distance (cents) of a match from the target. */
  worst: number;
}

/** Every cell within `tolC` cents (inclusive) of `targetC`, with the coverage figures. */
export function locateInterval(m: IntervalPairs, targetC: number, tolC: number): Location {
  const tol = Math.max(0, tolC) + 1e-9;
  const cells: PairCell[] = [];
  let worst = 0;
  for (const row of m.cells) {
    for (const cell of row) {
      if (cell && Math.abs(cell.c - targetC) <= tol) {
        cells.push(cell);
        worst = Math.max(worst, Math.abs(cell.c - targetC));
      }
    }
  }
  return { cells, coverage: pairCoverage(cells, m.N), worst };
}

export interface StepRow {
  /** Generic step count (1 = a scale step). */
  k: number;
  /** The intervals that take k steps, in table order, with how many cells each. */
  items: { group: number; count: number }[];
}

/** The content table grouped by generic step count k = 1 .. N-1 (Scala's "steps" column; the diagonals of the matrix). */
export function stepsTable(m: IntervalPairs): StepRow[] {
  const rows: StepRow[] = [];
  for (let k = 1; k < m.N; k++) {
    const counts = new Map<number, number>();
    for (const row of m.cells) {
      for (const cell of row) {
        if (cell && cell.k === k) {
          counts.set(cell.group, (counts.get(cell.group) ?? 0) + 1);
        }
      }
    }
    rows.push({
      k,
      items: [...counts].sort((a, b) => a[0] - b[0]).map(([group, count]) => ({ group, count })),
    });
  }
  return rows;
}

/** How the Interval coloring places a group on the color wheel: by its size, or by its rank among the sizes. */
export type WheelReading = 'size' | 'rank';
/** How strong a group's tint is: the simpler the ratio the stronger, or the reverse. */
export type TintIntensity = 'strong' | 'faint';

/** Golden step of the rank reading: consecutive ranks land far apart on the wheel. */
export const WHEEL_GOLDEN = 0.381966;
/** Tint strength range (share of the hue in the mix) and the fixed strength of a group with no ratio. */
export const TINT_MIN = 0.2;
export const TINT_MAX = 0.55;
export const TINT_MIDDLE = (TINT_MIN + TINT_MAX) / 2;

/**
 * Wheel position in [0, 1) of every group (by group id). 'size': the interval's cents over the repeat, so equal
 * intervals match, near-equal ones are near and an interval and its inversion mirror. 'rank': the distinct sizes sorted
 * small to large, rank r at frac(r * WHEEL_GOLDEN), so neighboring sizes contrast.
 */
export function wheelPositions(m: IntervalPairs, repC: number, reading: WheelReading): number[] {
  const frac = (x: number) => x - Math.floor(x);
  if (reading === 'size') {
    return m.groups.map((g) => frac(g.c / repC));
  }
  const bySize = m.groups.map((g) => g.id).sort((a, b) => m.groups[a].c - m.groups[b].c);
  const pos: number[] = [];
  bySize.forEach((id, r) => {
    pos[id] = frac(r * WHEEL_GOLDEN);
  });
  return pos;
}

/**
 * Tint strength in [TINT_MIN, TINT_MAX] of every group (by group id), from the Tenney height of its ratio scaled over the
 * rational groups of this subset: 'strong' = lowest height strongest, 'faint' = the reverse. A group with no ratio gets
 * TINT_MIDDLE, as does every group when all heights are equal.
 */
export function tintStrengths(m: IntervalPairs, intensity: TintIntensity): number[] {
  const hs = m.groups.map((g) => g.h).filter((h): h is number => h !== null);
  const lo = Math.min(...hs);
  const hi = Math.max(...hs);
  return m.groups.map((g) => {
    if (g.h === null || hi - lo < 1e-9) {
      return TINT_MIDDLE;
    }
    const t = (g.h - lo) / (hi - lo); // 0 simplest .. 1 most complex
    const s = intensity === 'strong' ? 1 - t : t;
    return TINT_MIN + s * (TINT_MAX - TINT_MIN);
  });
}
