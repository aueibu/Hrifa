/**
 * Beat frequencies of note pairs (M3 of the Scala-tools arc). Scala `SHOW BEATS`: for a pair that should make the ratio
 * p/q, the lower note's p-th partial and the upper note's q-th partial should be the same pitch; if the pair is off they
 * beat at `q * fHi - p * fLo` Hz (negative = the upper note is flat of the target). Pure.
 */

/** Largest partial the Developer option `beatPartialLimit` accepts (and the largest term of an automatic target). */
export const BEAT_PARTIAL_LIMIT_MAX = 64;
/** Largest numerator and denominator of an automatic target. */
export const BEAT_MAX_TERM = 64;

const CENTS_EPS = 1e-9;

/** Frequency of a note at `cents` above 1/1, with 1/1 at `baseHz`. */
export const noteHz = (baseHz: number, cents: number): number => baseHz * 2 ** (cents / 1200);

/** Signed beat rate (Hz) of the lower note's p-th and the upper note's q-th partial. */
export const beatHz = (fLoHz: number, fHiHz: number, p: number, q: number): number =>
  q * fHiHz - p * fLoHz;

export const ratioCents = (p: number, q: number): number => 1200 * Math.log2(p / q);

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

export interface BeatTarget {
  p: number;
  q: number;
}

let candCache = new Map<number, { p: number; q: number; c: number; h: number }[]>();

/** Reduced ratios p/q > 1, p and q up to BEAT_MAX_TERM, up to the repeat, simplest (p*q) first, then by size. */
function candidates(repC: number) {
  const key = Math.round(repC * 1e6);
  let list = candCache.get(key);
  if (!list) {
    list = [];
    for (let q = 1; q <= BEAT_MAX_TERM; q++) {
      for (let p = q + 1; p <= BEAT_MAX_TERM; p++) {
        const c = ratioCents(p, q);
        if (c <= repC + CENTS_EPS && gcd(p, q) === 1) {
          list.push({ p, q, c, h: p * q });
        }
      }
    }
    list.sort((a, b) => a.h - b.h || a.c - b.c);
    if (candCache.size > 8) {
      candCache = new Map();
    }
    candCache.set(key, list);
  }
  return list;
}

/**
 * The automatic target of an interval of `intervalC` cents above the lower note: 1/1 when within `tolC` of a unison (a
 * slightly negative interval counts), else the simplest ratio (lowest p*q, ties by the smaller error) in (1, repeat]
 * within `tolC`; null when none.
 */
export function autoBeatTarget(intervalC: number, tolC: number, repC = 1200): BeatTarget | null {
  const tol = Math.max(0, tolC) + CENTS_EPS;
  if (Math.abs(intervalC) <= tol) {
    return { p: 1, q: 1 };
  }
  let best: { p: number; q: number; err: number; h: number } | null = null;
  for (const c of candidates(repC)) {
    if (best && c.h > best.h) {
      break;
    }
    const err = Math.abs(c.c - intervalC);
    if (err <= tol && (!best || c.h < best.h || err < best.err)) {
      best = { p: c.p, q: c.q, err, h: c.h };
    }
  }
  return best ? { p: best.p, q: best.q } : null;
}

export interface BeatCell {
  /** Signed beat in Hz. */
  hz: number;
  /** The ratio measured against (a unison is 1/1). */
  target: BeatTarget;
  source: 'picked' | 'auto';
  /** [the lower note's partial, the upper note's partial] = [p, q]. */
  partials: [number, number];
  /** True only when `BeatOptions.partialLimit` is set and a partial is above it; false when there is no limit. */
  theoretical: boolean;
}

export interface BeatOptions {
  repC: number;
  baseHz: number;
  tolC: number;
  /** A ratio picked in Find: applies to cells within `tolC` of its size, other cells use the automatic target. */
  picked?: BeatTarget | null;
  /** Developer option `beatPartialLimit`: a cell needing a partial above this is flagged `theoretical`. Absent or null: no limit. */
  partialLimit?: number | null;
}

/**
 * The beat of one cell. `loC` and `hiC` are the two notes' places above 1/1 in cents; the upper note of a wrapped pair is
 * one repeat higher (for a subset cell of `intervalPairs`: `loC = field[src of from].c`, `hiC = loC + cell.c`). Null when
 * the cell has no target.
 */
export function beatCell(loC: number, hiC: number, o: BeatOptions): BeatCell | null {
  const interval = hiC - loC;
  const pk = o.picked;
  let target: BeatTarget | null = null;
  let source: BeatCell['source'] = 'auto';
  if (pk && Math.abs(interval - ratioCents(pk.p, pk.q)) <= Math.max(0, o.tolC) + CENTS_EPS) {
    target = pk;
    source = 'picked';
  } else {
    target = autoBeatTarget(interval, o.tolC, o.repC);
  }
  if (!target) {
    return null;
  }
  const { p, q } = target;
  const lim = o.partialLimit ?? null;
  return {
    hz: beatHz(noteHz(o.baseHz, loC), noteHz(o.baseHz, hiC), p, q),
    target,
    source,
    partials: [p, q],
    theoretical: lim !== null && (p > lim || q > lim),
  };
}

export interface BeatSummary {
  count: number;
  /** Over the sizes (absolute values) of the beats. */
  total: number;
  average: number;
  highest: number;
}

/** Total, average and highest of the sizes of the beats; zeros for an empty list. */
export function beatSummary(cells: readonly { hz: number }[]): BeatSummary {
  const sizes = cells.map((c) => Math.abs(c.hz));
  const total = sizes.reduce((s, x) => s + x, 0);
  return {
    count: sizes.length,
    total,
    average: sizes.length ? total / sizes.length : 0,
    highest: sizes.length ? Math.max(...sizes) : 0,
  };
}

/** "minus 0.89 hertz" / "plus 10.38 hertz" (no sign word for a beat that rounds to zero). */
export function beatWords(hz: number): string {
  const t = Math.abs(hz).toFixed(2);
  if (Number(t) === 0) {
    return `${t} hertz`;
  }
  return `${hz < 0 ? 'minus' : 'plus'} ${t} hertz`;
}

/** The accessible name of a beat cell: "C to G, minus 0.89 hertz". */
export const beatCellName = (fromName: string, toName: string, hz: number): string =>
  `${fromName} to ${toName}, ${beatWords(hz)}`;
