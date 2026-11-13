/**
 * Periodicity (Stolzenburg 2015, "Harmony perception by periodicity detection", J. Math. & Music 9(3), 215-238),
 * as ported from the R packages `stolz15` / `incon` (`smooth_log_periodicity`, MIT, Harrison).
 *
 * Every interval of the chord is approximated by the simplest fraction within a tolerance (about 1.1 %, the
 * just-noticeable pitch difference, "rational tuning II" in the paper) with the Stern-Brocot style search of the
 * paper's Table 1; fractions keep their octave (the interval is reduced to one octave, approximated, then doubled
 * or halved back). The relative periodicity of the chord seen from one note is the lowest common multiple of the
 * fractions' denominators (scaled by the first note's ratio); the score is the mean over every note taken as the
 * reference of log2 of that period ("smoothed logarithmic periodicity"). Lower = more periodic = simpler.
 *
 * Differences from the R code: (1) `toleranceCents` is honoured (the R `get_rational_interval` ignores its `d`
 * argument and always uses 0.011); the default reproduces 0.011 exactly. (2) the input is absolute frequencies.
 */
import { assertFreqs, mod } from './pitch';

/** The R default tolerance as a fraction of the interval's frequency ratio (Stolzenburg's "rational tuning II"). */
export const STOLZENBURG_D = 0.011;
/** Default tolerance in cents: 1200 log2(1 + 0.011), about 18.9 c. */
export const DEFAULT_TOLERANCE_CENTS = 1200 * Math.log2(1 + STOLZENBURG_D);

export interface PeriodicityOptions {
  /** Largest allowed error of the interval approximation, in cents (default about 18.9, i.e. 1.1 %). */
  toleranceCents?: number;
}

export interface PeriodicityResult {
  /** Smoothed log2 periodicity (lower = simpler). */
  value: number;
  /** The approximating integer ratio chord relative to the lowest note, ascending (e.g. `[4, 5, 6]`). */
  ratios: number[];
  /** The tolerance as a fraction (`d`) that was used. */
  d: number;
}

/**
 * Simplest fraction a/b with `(1 - d) x <= a/b <= (1 + d) x` (Stolzenburg 2015, Table 1; `stolz15::fraction`).
 * `x` should be at least 1.
 */
export function fraction(x: number, d: number): [number, number] {
  const xMin = (1 - d) * x;
  const xMax = (1 + d) * x;
  let aL = Math.floor(x);
  let bL = 1;
  let aR = Math.floor(x) + 1;
  let bR = 1;
  let a = Math.round(x);
  let b = 1;
  for (let guard = 0; (a / b < xMin || xMax < a / b) && guard < 10000; guard++) {
    const x0 = 2 * x - a / b;
    if (x < a / b) {
      aR = a;
      bR = b;
      const k = Math.floor((x0 * bL - aL) / (aR - x0 * bR));
      aL += k * aR;
      bL += k * bR;
    } else {
      aL = a;
      bL = b;
      const k = Math.floor((aR - x0 * bR) / (x0 * bL - aL));
      aR += k * aL;
      bR += k * bL;
    }
    a = aL + aR;
    b = bL + bR;
  }
  return [a, b];
}

export function doubleFraction([a, b]: [number, number]): [number, number] {
  return b % 2 === 0 ? [a, b / 2] : [a * 2, b];
}

export function halfFraction([a, b]: [number, number]): [number, number] {
  return a % 2 === 0 ? [a / 2, b] : [a, b * 2];
}

/** Fraction approximating the interval of `semitones` (any sign, fractional allowed): `stolz15::get_rational_interval`. */
export function rationalInterval(semitones: number, d: number): [number, number] {
  const s = Math.round(semitones * 1e6) / 1e6;
  let octave = Math.floor(s / 12);
  const pc = mod(s, 12);
  let res = fraction(2 ** (pc / 12), d);
  while (octave < 0) {
    res = halfFraction(res);
    octave++;
  }
  while (octave > 0) {
    res = doubleFraction(res);
    octave--;
  }
  return res;
}

function gcd(x: bigint, y: bigint): bigint {
  let a = x;
  let b = y;
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a;
}

function lcmAll(xs: readonly number[]): bigint {
  let l = 1n;
  for (const x of xs) {
    const v = BigInt(x);
    l = (l / gcd(l, v)) * v;
  }
  return l;
}

/** log2 of a positive bigint, safe beyond 2^1024. */
function log2Big(x: bigint): number {
  const bits = x.toString(2).length;
  if (bits <= 53) {
    return Math.log2(Number(x));
  }
  const shift = BigInt(bits - 53);
  return Math.log2(Number(x >> shift)) + (bits - 53);
}

/** Periodicity of the chord of absolute frequencies `freqsHz` (Hz). */
export function periodicity(
  freqsHz: readonly number[],
  opts: PeriodicityOptions = {}
): PeriodicityResult {
  assertFreqs(freqsHz);
  if (
    opts.toleranceCents !== undefined &&
    !(opts.toleranceCents > 0 && Number.isFinite(opts.toleranceCents))
  ) {
    throw new RangeError('periodicity: toleranceCents must be a positive finite number');
  }
  const toleranceCents = opts.toleranceCents ?? DEFAULT_TOLERANCE_CENTS;
  const d =
    opts.toleranceCents === undefined
      ? STOLZENBURG_D
      : Math.round((2 ** (toleranceCents / 1200) - 1) * 1e12) / 1e12;
  // distinct pitches only (hrep::pi_chord drops repeats): within 1e-6 semitone counts as the same pitch
  const sorted: number[] = [];
  for (const f of [...freqsHz].sort((x, y) => x - y)) {
    const prev = sorted[sorted.length - 1];
    if (prev === undefined || 12 * Math.log2(f / prev) >= 1e-6) {
      sorted.push(f);
    }
  }
  if (sorted.length === 0) {
    return { value: 0, ratios: [], d };
  }
  const semis = sorted.map((f) => 12 * Math.log2(f / sorted[0]));
  let sum = 0;
  for (const ref of semis) {
    const fr = semis.map((s) => rationalInterval(s - ref, d));
    const period = lcmAll(fr.map(([, b]) => b)) * BigInt(fr[0][0]);
    // relative periodicity = lcm(denominators) * a_1 / b_1 (an integer for rationalised chords)
    sum += log2Big(period) - Math.log2(fr[0][1]);
  }
  const fromBass = semis.map((s) => rationalInterval(s, d));
  const l = lcmAll(fromBass.map(([, b]) => b));
  const ints = fromBass.map(([a, b]) => (BigInt(a) * l) / BigInt(b));
  const g = ints.reduce((acc, v) => gcd(acc, v), 0n);
  return { value: sum / sorted.length, ratios: ints.map((v) => Number(v / g)), d };
}
