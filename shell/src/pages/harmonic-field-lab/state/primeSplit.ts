/**
 * M9f (H-42): how much each prime adds to an interval's complexity, for the Monzo header. The contribution of prime p is
 * a_p = |e_p| x log2 p (the exponent's size in octaves): 81/80 = [-4 4 -1> gives a_2 = 4.00, a_3 = 6.34, a_5 = 2.32.
 * The norm decides how the contributions combine:
 * - L1 (Tenney): total = sum a, share = a_p / sum a.
 * - L2 (TE): total = sqrt(sum a^2), share = a_p^2 / sum a^2 (the shares add to 100 % of the squared norm).
 * - L-inf: total = max a, the bar is a_p / max a, and the largest prime is flagged (no percent: the label says "max").
 * Count octaves off drops prime 2 from every sum. Pure and cheap (13 primes); the picker calls it at most once per frame.
 */
import { MONZO_PRIMES } from '../../../lib/harmonic-field';

export type SplitNorm = 'l1' | 'l2' | 'linf';
export const SPLIT_NORMS: readonly SplitNorm[] = ['l1', 'l2', 'linf'];

/** The saved choice (`settings.v1` ui `monzoSplit`, H-42). */
export interface MonzoSplit {
  norm: SplitNorm;
  octaves: boolean;
  /** M9f look 1 (F15): the tallest counted bar fills the bar zone (bar = value / largest value); the numbers do not change. */
  fit: boolean;
}
export const MONZO_SPLIT_DEFAULT: MonzoSplit = { norm: 'l1', octaves: true, fit: false };

export interface PrimePart {
  prime: number;
  /** |e_p| x log2 p (0 for a prime that is not counted). */
  a: number;
  /** The bar's length 0..1: the share of the sum (L1), of the squared sum (L2), or a / max (L-inf). */
  share: number;
  /**
   * The drawn bar height 0..1. Fit off: the share. Fit on: value / largest counted value (L1: a / max a; L2: a^2 / max a^2; L-inf
   * is already against the largest).
   */
  bar: number;
  /**
   * F16: prime 2 with octaves off and a nonzero exponent: the height it WOULD have on the same scale (its size over the counted sum,
   * or over the largest counted size with Fit; at most 1), drawn as a dashed outline. 0 otherwise.
   */
  ghost: number;
  /** Whether this prime is in the sums (false only for prime 2 with octaves off). */
  counted: boolean;
  /** L-inf only: the largest contribution (the first one when tied). */
  isMax: boolean;
}

export interface PrimeSplit {
  /** L1: sum a. L2: sqrt(sum a^2). L-inf: max a. 0 when nothing is counted. */
  total: number;
  parts: PrimePart[];
}

export const NORM_LABEL: Record<SplitNorm, string> = { l1: 'L1', l2: 'L2', linf: 'L-inf' };

type MonzoLike = Readonly<Record<string | number, number | undefined>>;

/** Split a monzo (prime -> exponent; primes without a column are ignored) over the Monzo primes. */
export function primeSplit(
  monzo: MonzoLike | null | undefined,
  norm: SplitNorm,
  countOctaves: boolean,
  fit = false
): PrimeSplit {
  const a = MONZO_PRIMES.map((p) => {
    const e = monzo?.[p] ?? 0;
    return p === 2 && !countOctaves ? 0 : Math.abs(e) * Math.log2(p);
  });
  const sum = a.reduce((s, x) => s + x, 0);
  const sumSq = a.reduce((s, x) => s + x * x, 0);
  const max = Math.max(0, ...a);
  const total = norm === 'l1' ? sum : norm === 'l2' ? Math.sqrt(sumSq) : max;
  const maxAt = max > 0 ? a.indexOf(max) : -1;
  const ghostA = !countOctaves ? Math.abs(monzo?.[2] ?? 0) : 0;
  const scaled = (x: number): number => {
    // x is a size on this norm's scale (a, or a^2 for L2); the divisor is the zone's full height
    const q = norm === 'l2' ? x * x : x;
    const full = fit
      ? norm === 'l2'
        ? max * max
        : max
      : norm === 'l1'
        ? sum
        : norm === 'l2'
          ? sumSq
          : max;
    return full > 0 ? Math.min(1, q / full) : q > 0 ? 1 : 0;
  };
  const parts = MONZO_PRIMES.map((prime, i): PrimePart => {
    const share =
      total <= 0
        ? 0
        : norm === 'l1'
          ? a[i] / sum
          : norm === 'l2'
            ? (a[i] * a[i]) / sumSq
            : a[i] / max;
    return {
      prime,
      a: a[i],
      share,
      bar: total <= 0 ? 0 : fit ? scaled(a[i]) : share,
      ghost: prime === 2 && ghostA > 0 ? scaled(ghostA) : 0,
      counted: !(prime === 2 && !countOctaves),
      isMax: norm === 'linf' && i === maxAt,
    };
  });
  return { total, parts };
}

/** The tooltip text for one prime, e.g. `3: 6.34 of 12.66 (50 %), L1, octaves counted`. */
export function partText(
  part: PrimePart,
  total: number,
  norm: SplitNorm,
  countOctaves: boolean
): string {
  const oct = countOctaves ? 'octaves counted' : 'octaves not counted';
  if (!part.counted) {
    return `${part.prime}: not counted (${NORM_LABEL[norm]}, ${oct})`;
  }
  if (part.a === 0) {
    return `${part.prime}: 0 (${NORM_LABEL[norm]}, ${oct})`;
  }
  const a = part.a.toFixed(2);
  if (norm === 'linf') {
    return `${part.prime}: ${a} of max ${total.toFixed(2)} (${Math.round(part.share * 100)} % of the largest), ${NORM_LABEL[norm]}, ${oct}`;
  }
  const what =
    norm === 'l2'
      ? `${a}, ${Math.round(part.share * 100)} % of the squared norm ${total.toFixed(2)}`
      : `${a} of ${total.toFixed(2)} (${Math.round(part.share * 100)} %)`;
  return `${part.prime}: ${what}, ${NORM_LABEL[norm]}, ${oct}`;
}

/** The percent text for the band: blank for 0 and for L-inf (which shows "max" under the largest prime only). */
export function percentText(part: PrimePart, norm: SplitNorm): string {
  if (!part.counted || part.a === 0) {
    return '';
  }
  if (norm === 'linf') {
    return part.isMax ? 'max' : '';
  }
  return `${Math.round(part.share * 100)}`;
}

/** Field by field, anything else reads as the default. */
export function sanitizeMonzoSplit(x: unknown): MonzoSplit {
  const r = x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
  return {
    norm: SPLIT_NORMS.find((n) => n === r.norm) ?? MONZO_SPLIT_DEFAULT.norm,
    octaves: typeof r.octaves === 'boolean' ? r.octaves : MONZO_SPLIT_DEFAULT.octaves,
    fit: typeof r.fit === 'boolean' ? r.fit : MONZO_SPLIT_DEFAULT.fit,
  };
}
