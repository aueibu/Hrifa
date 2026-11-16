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

/** Which strength scale the Interval tint uses: `fixed` (default, H-22) or `relative` (this subset's own range, the pre-M3 look). */
export type TintScale = 'fixed' | 'relative';

/**
 * Fixed strength bounds, in Tenney height (log2(p*q)): the strongest tint at 3/2's height and below, the faintest at
 * H_FAINT and above, linear between. THE SAME IN EVERY SUBSET. Tuned by eye (H-22): change them here.
 */
export const H_STRONG = Math.log2(3 * 2);
export const H_FAINT = 14;

/**
 * Reach: the width of the tint band as a percent of the cell's width (a hard-edged full-height band, H-23). The most
 * complex interval of a subset gets REACH_MIN, the simplest REACH_MAX (reversed with 'faint'). Tuned by eye: change
 * them here.
 */
export const REACH_MIN = 35;
export const REACH_MAX = 100;
export const REACH_MIDDLE = (REACH_MIN + REACH_MAX) / 2;

/** `h` placed between `lo` (simplest) and `hi` (most complex), clamped, and mapped to [outMin, outMax] by `intensity`. */
function spread(
  h: number,
  lo: number,
  hi: number,
  intensity: TintIntensity,
  outMin: number,
  outMax: number
): number {
  const t = Math.min(1, Math.max(0, (h - lo) / (hi - lo))); // 0 simplest .. 1 most complex
  return outMin + (intensity === 'strong' ? 1 - t : t) * (outMax - outMin);
}

/** The lowest and highest Tenney height among the rational groups of a subset (lo > hi when there are none). */
function heightRange(m: IntervalPairs): { lo: number; hi: number } {
  const hs = m.groups.map((g) => g.h).filter((h): h is number => h !== null);
  return { lo: Math.min(...hs), hi: Math.max(...hs) };
}

/** Strength of one interval by its own height on the FIXED bounds; no ratio gives TINT_MIDDLE. */
export function fixedStrength(h: number | null, intensity: TintIntensity): number {
  return h === null ? TINT_MIDDLE : spread(h, H_STRONG, H_FAINT, intensity, TINT_MIN, TINT_MAX);
}

/**
 * Tint strength in [TINT_MIN, TINT_MAX] of every group (by group id), FIXED scale: the Tenney height of its own ratio
 * against H_STRONG and H_FAINT, so one interval has one strength in every subset. 'strong' = lowest height strongest,
 * 'faint' = the reverse. A group with no ratio gets TINT_MIDDLE.
 */
export function tintStrengths(m: IntervalPairs, intensity: TintIntensity): number[] {
  return m.groups.map((g) => fixedStrength(g.h, intensity));
}

/**
 * Tint strength of every group on the RELATIVE scale (Developer option `tintScale` = relative; the pre-M3 behavior): the
 * Tenney height scaled over the rational groups of this subset. A group with no ratio gets TINT_MIDDLE, as does every
 * group when all heights are equal.
 */
export function tintStrengthsRelative(m: IntervalPairs, intensity: TintIntensity): number[] {
  const { lo, hi } = heightRange(m);
  return m.groups.map((g) =>
    g.h === null || hi - lo < 1e-9
      ? TINT_MIDDLE
      : spread(g.h, lo, hi, intensity, TINT_MIN, TINT_MAX)
  );
}

/**
 * Tint reach (percent, REACH_MIN to REACH_MAX) of every group: its Tenney height placed on THIS subset's range of
 * heights. 'strong': the simplest widest; 'faint' reverses. No ratio, or all heights equal: REACH_MIDDLE.
 */
export function tintReaches(m: IntervalPairs, intensity: TintIntensity): number[] {
  const { lo, hi } = heightRange(m);
  return m.groups.map((g) =>
    g.h === null || hi - lo < 1e-9
      ? REACH_MIDDLE
      : spread(g.h, lo, hi, intensity, REACH_MIN, REACH_MAX)
  );
}

/** The strengths of the chosen scale. */
export function tintStrengthsFor(
  m: IntervalPairs,
  intensity: TintIntensity,
  scale: TintScale
): number[] {
  return scale === 'relative' ? tintStrengthsRelative(m, intensity) : tintStrengths(m, intensity);
}

/** An interval that is not a cell of the subset (an added pitch's cell, header or chip): its size and, when exact, its ratio. */
export interface ExtraInterval {
  /** Size in cents, reduced into the repeat (a near unison may be slightly negative). */
  c: number;
  /** The exact ratio (monzo) reduced into the repeat, or null when either pitch has no ratio. */
  note: Note | null;
}

export interface ExtraTint {
  /** Wheel position in [0, 1), as `wheelPositions` gives for a group. */
  pos: number;
  /** Tint strength in [TINT_MIN, TINT_MAX], as `tintStrengthsFor` gives for a group. */
  strength: number;
  /** Tint reach in percent (REACH_MIN to REACH_MAX), as `tintReaches` gives for a group. */
  reach: number;
}

/**
 * Wheel position and strength of intervals that are not subset cells, by the rules of the subset's own groups and without
 * changing any of them (the subset's `wheelPositions` and `tintStrengths` are computed from the subset alone):
 * - an interval within PAIRS_GROUP_TOL of a subset group takes that group's position and strength;
 * - strength: fixed scale (default) = its own Tenney height on H_STRONG..H_FAINT; relative scale = its height scaled over
 *   the subset's heights, clamped; no ratio (cents only) gives TINT_MIDDLE (so do equal subset heights, relative scale);
 * - reach: its own height placed on the subset's range of heights (the range `tintReaches` uses), clamped; no ratio or
 *   equal subset heights gives REACH_MIDDLE;
 * - 'size': frac(c / repeat); 'rank': its rank among the sizes of the subset's groups plus the distinct new sizes of
 *   `items`, at frac(rank * WHEEL_GOLDEN). The subset's own ranks stay as they are.
 * Results are in the order of `items`.
 */
export function extraTints(
  m: IntervalPairs,
  items: readonly ExtraInterval[],
  repC: number,
  reading: WheelReading,
  intensity: TintIntensity,
  scale: TintScale = 'fixed'
): ExtraTint[] {
  const frac = (x: number) => x - Math.floor(x);
  const basePos = wheelPositions(m, repC, reading);
  const baseStr = tintStrengthsFor(m, intensity, scale);
  const baseReach = tintReaches(m, intensity);
  const { lo, hi } = heightRange(m);
  const ranged = hi - lo >= 1e-9;
  const groupOf = (c: number): number =>
    m.groups.findIndex((g) => Math.abs(g.c - c) < PAIRS_GROUP_TOL);
  // the new sizes (not a subset group, distinct from each other), for the rank
  const fresh: number[] = [];
  for (const it of items) {
    if (groupOf(it.c) < 0 && !fresh.some((c) => Math.abs(c - it.c) < PAIRS_GROUP_TOL)) {
      fresh.push(it.c);
    }
  }
  const sizes = [...m.groups.map((g) => g.c), ...fresh].sort((a, b) => a - b);
  return items.map((it) => {
    const g = groupOf(it.c);
    if (g >= 0) {
      return { pos: basePos[g], strength: baseStr[g], reach: baseReach[g] };
    }
    const h = it.note ? tenneyHeight(it.note) : null;
    let strength = fixedStrength(h, intensity);
    let reach = REACH_MIDDLE;
    if (h !== null && ranged) {
      reach = spread(h, lo, hi, intensity, REACH_MIN, REACH_MAX);
    }
    if (scale === 'relative') {
      strength =
        h !== null && ranged ? spread(h, lo, hi, intensity, TINT_MIN, TINT_MAX) : TINT_MIDDLE;
    }
    const rank = sizes.findIndex((c) => Math.abs(c - it.c) < PAIRS_GROUP_TOL);
    return {
      pos: reading === 'size' ? frac(it.c / repC) : frac(rank * WHEEL_GOLDEN),
      strength,
      reach,
    };
  });
}
