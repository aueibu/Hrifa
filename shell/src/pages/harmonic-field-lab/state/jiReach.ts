/**
 * JI reach (M10, H-43): which just intervals of an odd-limit diamond a subset can play, and how well.
 *
 * For every target (an odd-limit diamond ratio, octave-reduced) it lists every ordered pair of subset notes whose
 * interval (reduced into the repeat) lies within a tolerance, and the nearest note above the mode root. A per-prime
 * summary rates the diamond of each prime limit (3, 5, 7, 11, 13) and the cumulative Fokker misfit of 3/2, 5/4, 7/4,
 * 11/8, 13/8. Pure: cents in, numbers out. No React.
 */

/** The odd limits the view offers. */
export const REACH_LIMITS = [5, 7, 9, 11, 13, 15] as const;
export type ReachLimit = (typeof REACH_LIMITS)[number];
export const REACH_TOL_MIN = 0;
export const REACH_TOL_MAX = 100;
/** Pairs grow as n squared: above this many notes the view shows a note instead. */
export const REACH_MAX_NOTES = 64;

export interface ReachTarget0 {
  /** Reduced ratio text, e.g. "3/2". */
  ratio: string;
  /** Octave-reduced numerator and denominator, num/den in (1, 2). */
  num: number;
  den: number;
  cents: number;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const centsOfRatio = (n: number, d: number) => 1200 * Math.log2(n / d);

/** The odd-limit diamond of `limit`: ratios a/b with a, b odd and at most `limit`, octave-reduced, 1/1 left out, sorted by cents. */
export function diamondTargets(limit: number): ReachTarget0[] {
  const seen = new Map<string, ReachTarget0>();
  for (let a = 1; a <= limit; a += 2) {
    for (let b = 1; b <= limit; b += 2) {
      let n = a;
      let d = b;
      while (n >= 2 * d) {
        d *= 2;
      }
      while (n < d) {
        n *= 2;
      }
      const g = gcd(n, d);
      n /= g;
      d /= g;
      if (n === d) {
        continue;
      }
      const ratio = `${n}/${d}`;
      if (!seen.has(ratio)) {
        seen.set(ratio, { ratio, num: n, den: d, cents: centsOfRatio(n, d) });
      }
    }
  }
  return [...seen.values()].sort((x, y) => x.cents - y.cents);
}

/** One ordered pair of subset notes playing a target. */
export interface ReachPair {
  /** Positions in the subset list given to `reachOf` (lower note, upper note). */
  from: number;
  to: number;
  /** Degrees (0-based) in the mode order, as the Pairs panel numbers them. */
  fromDeg: number;
  toDeg: number;
  /** The interval passes the repeat (the upper note is a degree below the lower one). */
  wrap: boolean;
  /** The interval in cents, reduced into the repeat. */
  cents: number;
  /** Interval minus target, signed, in cents. */
  error: number;
}

/** The nearest note above the mode root. */
export interface ReachRoot {
  to: number;
  toDeg: number;
  cents: number;
  error: number;
}

export interface ReachTarget extends ReachTarget0 {
  /** Every pair within the tolerance, smallest |error| first, then the lower note's pitch. */
  pairs: ReachPair[];
  /** The best pair even when none is within the tolerance; null when the subset has fewer than two notes. */
  best: ReachPair | null;
  /** The note nearest the target above the mode root, null when the subset has fewer than two notes. */
  root: ReachRoot | null;
}

export interface ReachLine {
  /** The limit this line rates: a prime (diamond of that odd limit) or the chosen limit. */
  limit: number;
  /** True for the extra line of a composite chosen limit (9, 15). */
  overall: boolean;
  targets: number;
  /** Targets with a pair within the tolerance, and with a root note within it. */
  within: number;
  withinRoot: number;
  /** Average |best error| and the worst target; null when no pair exists. */
  avg: number | null;
  worst: { ratio: string; error: number } | null;
  /** Cumulative Fokker misfit up to this prime (sum of squared best errors of 3/2, 5/4, 7/4, 11/8, 13/8); null when no pair exists. */
  misfit: number | null;
}

export interface Reach {
  limit: number;
  tol: number;
  targets: ReachTarget[];
  /** One line per prime up to the limit, then a line for the limit itself when it is not prime. */
  lines: ReachLine[];
}

const PRIMES = [3, 5, 7, 11, 13] as const;
/** The target that stands for each prime in the misfit. */
const PRIME_TARGET: Record<number, [number, number]> = {
  3: [3, 2],
  5: [5, 4],
  7: [7, 4],
  11: [11, 8],
  13: [13, 8],
};
const EPS = 1e-6;
const round6 = (x: number) => Math.round(x * 1e6);
const mod = (x: number, m: number) => ((x % m) + m) % m;

/**
 * The reach of a subset. `notes` are the subset's cents (above 1/1) in subset order, `modeRoot` the position of the mode
 * root in that list. Pair and root indices refer to positions in `notes`. A tolerance is in cents; the repeat is 1200 c unless given.
 */
export function reachOf(
  notes: readonly number[],
  modeRoot: number,
  limit: number,
  tol: number,
  repC = 1200
): Reach {
  const n = notes.length;
  const root = n ? mod(modeRoot, n) : 0;
  // each note's cents above the mode root, wrapped into the repeat, and its degree in mode order
  const rel = notes.map((c) => mod(c - notes[root], repC));
  const deg = notes.map((_, k) => mod(k - root, n || 1));
  const diamond = diamondTargets(limit);
  const targets: ReachTarget[] = diamond.map((t) => {
    const all: ReachPair[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) {
          continue;
        }
        const cents = mod(notes[j] - notes[i], repC);
        all.push({
          from: i,
          to: j,
          fromDeg: deg[i],
          toDeg: deg[j],
          wrap: rel[j] < rel[i],
          cents,
          error: cents - t.cents,
        });
      }
    }
    all.sort(
      (a, b) =>
        round6(Math.abs(a.error)) - round6(Math.abs(b.error)) ||
        rel[a.from] - rel[b.from] ||
        rel[a.to] - rel[b.to]
    );
    const pairs = all.filter((p) => Math.abs(p.error) <= tol + EPS);
    let rootHit: ReachRoot | null = null;
    for (let k = 0; k < n; k++) {
      if (k === root) {
        continue;
      }
      const error = rel[k] - t.cents;
      if (!rootHit || round6(Math.abs(error)) < round6(Math.abs(rootHit.error))) {
        rootHit = { to: k, toDeg: deg[k], cents: rel[k], error };
      }
    }
    return { ...t, pairs, best: all[0] ?? null, root: rootHit };
  });
  const lineOf = (lim: number, overall: boolean, misfit: number | null): ReachLine => {
    const ts = targets.filter((t) => diamondHas(lim, t));
    const errs = ts.map((t) => (t.best ? Math.abs(t.best.error) : null));
    const have = errs.filter((e): e is number => e !== null);
    let worst: ReachLine['worst'] = null as ReachLine['worst'];
    for (const t of ts) {
      if (t.best && (!worst || Math.abs(t.best.error) > Math.abs(worst.error) + EPS)) {
        worst = { ratio: t.ratio, error: t.best.error };
      }
    }
    return {
      limit: lim,
      overall,
      targets: ts.length,
      within: ts.filter((t) => t.pairs.length > 0).length,
      withinRoot: ts.filter((t) => t.root && Math.abs(t.root.error) <= tol + EPS).length,
      avg: have.length ? have.reduce((s, e) => s + e, 0) / have.length : null,
      worst,
      misfit,
    };
  };
  const lines: ReachLine[] = [];
  let sum = 0;
  let ok = n >= 2;
  for (const p of PRIMES) {
    if (p > limit) {
      break;
    }
    const [a, b] = PRIME_TARGET[p];
    const t = targets.find((x) => x.num === a && x.den === b);
    if (t?.best) {
      sum += t.best.error * t.best.error;
    } else {
      ok = false;
    }
    lines.push(lineOf(p, false, ok ? sum : null));
  }
  if (!(PRIMES as readonly number[]).includes(limit)) {
    lines.push(lineOf(limit, true, lines.length ? lines[lines.length - 1].misfit : null));
  }
  return { limit, tol, targets, lines };
}

/** Whether a target belongs to the odd-limit diamond of `lim` (its odd numerator and denominator, octave-reduced, at most `lim`). */
function diamondHas(lim: number, t: ReachTarget0): boolean {
  const odd = (x: number): number => (x % 2 === 0 ? odd(x / 2) : x);
  return odd(t.num) <= lim && odd(t.den) <= lim;
}

/** The saved JI reach settings (H-43): the odd limit and the tolerance in cents. */
export interface ReachSettings {
  limit: ReachLimit;
  tol: number;
}
export const REACH_DEFAULT: ReachSettings = { limit: 7, tol: 15 };

/** Read stored `reach` field by field: a limit must be one of the six, a tolerance a finite number (clamped to 0 to 100); anything else is the default. */
export function sanitizeReach(raw: unknown): ReachSettings {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const limit = (REACH_LIMITS as readonly unknown[]).includes(o.limit)
    ? (o.limit as ReachLimit)
    : REACH_DEFAULT.limit;
  const tol =
    typeof o.tol === 'number' && Number.isFinite(o.tol)
      ? Math.min(REACH_TOL_MAX, Math.max(REACH_TOL_MIN, o.tol))
      : REACH_DEFAULT.tol;
  return { limit, tol };
}

let last: { key: string; value: Reach } | null = null;
/** `reachOf` with a one-entry cache (the view and the rail summary ask for the same figures on every render; hover never recomputes). */
export function reachCached(
  notes: readonly number[],
  modeRoot: number,
  limit: number,
  tol: number,
  repC = 1200
): Reach {
  const key = `${notes.join(',')}|${modeRoot}|${limit}|${tol}|${repC}`;
  if (last?.key !== key) {
    last = { key, value: reachOf(notes, modeRoot, limit, tol, repC) };
  }
  return last.value;
}

/** The repeat the reach math supports: an octave. */
export const isOctaveRepeat = (repC: number) => Math.abs(repC - 1200) < 0.01;
