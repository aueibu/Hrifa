/**
 * Harmonic entropy (Erlich), pure. HE(c) = -sum p ln p over every reduced ratio n/d with n*d below a limit N, where a ratio j gets
 * p_j proportional to exp(-(c - c_j)^2 / 2 s^2) / sqrt(n_j d_j): the Gaussian blur of the ear (s cents) times the 1/sqrt(n d) weight.
 * Values are in nats; lower is more consonant. Only the shape and relative depth matter (the level depends on N).
 *
 * The candidates cover -300 c to 1500 c, so the curve over 0..1200 c has no edge distortion. A curve is sampled at 1 c; a single
 * interval is computed exactly (`heAt`). Blur window: a ratio further than 8 s from the point has no weight worth adding.
 */

/** The candidate window in cents (300 c below 1/1 to 300 c above 2/1). */
export const HE_LO_C = -300;
export const HE_HI_C = 1500;
/** The ratios further than this many s from a point are skipped. */
export const HE_WINDOW_S = 8;
/** The curve's points: 0..1200 c in 1 c steps. */
export const HE_CURVE_POINTS = 1201;
/** The blur range (cents) and default (Erlich's classic 17 c). */
export const HE_BLUR_MIN = 8;
export const HE_BLUR_MAX = 20;
export const HE_BLUR_DEFAULT = 17;
/** The candidate limits n*d below which ratios count; 30k is the default (converged; 10k shows an artifact dip at 1065 c). */
export const HE_LIMITS = [10000, 30000, 100000, 250000, 500000] as const;
export type HeLimit = (typeof HE_LIMITS)[number];
export const HE_LIMIT_DEFAULT: HeLimit = 30000;
/** Reduced ratios n/d with n*d < N are about this fraction of N inside the candidate window (9,474 at 30k). */
export const HE_RATIOS_PER_LIMIT = 0.316;
/** A built-in guess of the build cost (ms per ratio, s 17, Node: measured 0.0043 to 0.0053) before the first measured build. */
export const HE_MS_PER_RATIO_DEFAULT = 0.005;

export interface HeCandidates {
  /** Cents of each ratio, ascending. */
  cents: Float64Array;
  /** 1/sqrt(n*d). */
  weights: Float64Array;
  limit: number;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** Every reduced n/d with n*d < limit and cents in -300..1500, sorted by cents. */
export function heCandidates(limit: number): HeCandidates {
  const cs: number[] = [];
  const ws: number[] = [];
  for (let d = 1; d < limit; d++) {
    for (let n = 1; n * d < limit; n++) {
      const c = 1200 * Math.log2(n / d);
      if (c < HE_LO_C) {
        continue;
      }
      if (c > HE_HI_C) {
        break;
      }
      if (gcd(n, d) !== 1) {
        continue;
      }
      cs.push(c);
      ws.push(1 / Math.sqrt(n * d));
    }
  }
  const order = Uint32Array.from(cs.keys()).sort((a, b) => cs[a] - cs[b]);
  const cents = new Float64Array(order.length);
  const weights = new Float64Array(order.length);
  for (let i = 0; i < order.length; i++) {
    cents[i] = cs[order[i]];
    weights[i] = ws[order[i]];
  }
  return { cents, weights, limit };
}

/** The first index with cents >= x. */
function lowerBound(a: Float64Array, x: number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (a[mid] < x) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/** H at x from the candidates between `from` and `to` (indices). Two passes over the window: the sum, then -sum p ln p. */
function entropyOver(c: HeCandidates, from: number, to: number, x: number, s: number): number {
  const k = 1 / (2 * s * s);
  let sum = 0;
  let acc = 0;
  for (let j = from; j < to; j++) {
    const dx = x - c.cents[j];
    const v = Math.exp(-dx * dx * k) * c.weights[j];
    sum += v;
    // v ln v accumulates the entropy without a second pass: H = ln(sum) - (sum v ln v) / sum
    if (v > 0) {
      acc += v * Math.log(v);
    }
  }
  return sum > 0 ? Math.log(sum) - acc / sum : 0;
}

/** The exact HE at `cents` (folded into 0..1200 c first, so 3/1 and 3/2 give the same value). */
export function heAt(c: HeCandidates, cents: number, s: number): number {
  const x = ((cents % 1200) + 1200) % 1200;
  const w = HE_WINDOW_S * s;
  return entropyOver(c, lowerBound(c.cents, x - w), lowerBound(c.cents, x + w + 1e-9), x, s);
}

/** The curve at 0..1200 c in 1 c steps (1201 values); the window slides along the sorted candidates. */
export function heCurve(c: HeCandidates, s: number): Float64Array {
  const out = new Float64Array(HE_CURVE_POINTS);
  const w = HE_WINDOW_S * s;
  let from = 0;
  let to = 0;
  const n = c.cents.length;
  for (let x = 0; x < HE_CURVE_POINTS; x++) {
    while (from < n && c.cents[from] < x - w) {
      from++;
    }
    if (to < from) {
      to = from;
    }
    while (to < n && c.cents[to] <= x + w) {
      to++;
    }
    out[x] = entropyOver(c, from, to, x, s);
  }
  return out;
}

/** The curve's value at `cents` by linear interpolation (folded into 0..1200 c). */
export function heCurveAt(curve: Float64Array, cents: number): number {
  const x = ((cents % 1200) + 1200) % 1200;
  const i = Math.min(curve.length - 2, Math.floor(x));
  const f = x - i;
  return curve[i] * (1 - f) + curve[i + 1] * f;
}

export interface HeRange {
  min: number;
  max: number;
}
/** The curve's own min and max. */
export function heRange(curve: Float64Array): HeRange {
  let min = Infinity;
  let max = -Infinity;
  for (const v of curve) {
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  return { min, max };
}

/**
 * M9c F10: the cents on each side of 0 c and 1200 c that the Fixed bounds ignore. The unison (and the octave) is a very deep dip that
 * would take the whole scale and leave 3/2, 5/4 and 7/4 crowded at one end; those intervals are still drawn, clamped to the strong end.
 */
export const HE_UNISON_EXCLUDE_C = 30;

/** The curve's min and max EXCLUDING +-`HE_UNISON_EXCLUDE_C` around 0 c and 1200 c: the Fixed bounds of the color ramp. */
export function heFixedRange(curve: Float64Array): HeRange {
  let min = Infinity;
  let max = -Infinity;
  for (let x = HE_UNISON_EXCLUDE_C; x <= HE_CURVE_POINTS - 1 - HE_UNISON_EXCLUDE_C; x++) {
    min = Math.min(min, curve[x]);
    max = Math.max(max, curve[x]);
  }
  return max < min ? heRange(curve) : { min, max };
}

/** The limit `msPerRatio` is calibrated at (the default 30k). */
const HE_REF_LIMIT = 30000;

/** Candidate generation costs about N ln N: the per-ratio cost of a limit relative to the reference limit (1 at 30k). */
export const heLogFactor = (limit: number): number => Math.log(limit) / Math.log(HE_REF_LIMIT);

/**
 * The estimated build time of a limit: about 0.316 x limit ratios, at `msPerRatio` each (calibrated at 30k; the measured one after a
 * build, normalized the same way), scaled by the N ln N growth of candidate generation.
 */
export function estimateHeBuildMs(limit: number, msPerRatio: number = HE_MS_PER_RATIO_DEFAULT) {
  return HE_RATIOS_PER_LIMIT * limit * heLogFactor(limit) * msPerRatio;
}

/** "about 0.1 s" / "about 2 s" / "under 0.1 s" for a duration in ms. */
export function formatBuildMs(ms: number): string {
  if (ms < 100) {
    return 'under 0.1 s';
  }
  const s = ms / 1000;
  return `about ${s < 10 ? Math.round(s * 10) / 10 : Math.round(s)} s`;
}
