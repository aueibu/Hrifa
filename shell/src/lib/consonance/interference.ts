/**
 * Interference (sensory roughness) of a chord of complex tones: how much its partials beat against each other.
 *
 * Both models sum a dyadic curve over every pair of partials of every note (partials of the same note included,
 * as the original models do). Inputs are absolute frequencies, so register matters through the critical bandwidth;
 * there is no register damping and no compound-interval relief: both emerge from the curves.
 *
 * - `hutchinson-knopoff` (default): Hutchinson & Knopoff (1978), in Mashinter's (2006) implementation as ported in
 *   the R package `dycon` (Harrison, MIT): g(y) = ((y/a) exp(1 - y/a))^b with y the frequency gap in critical
 *   bandwidths (1.72 f^0.65), cut off at y > 1.2; pair weight = product of the amplitudes; the sum is divided by the
 *   total squared amplitude (so the score is roughness per unit energy, bounded and comparable across chord sizes).
 * - `sethares`: Sethares (1993) with the amplitude rule of Sethares (2005) / Weisser & Lartillot (2013) (minimum of the
 *   two amplitudes), parameters a = 3.5, b = 5.75, s1 = 0.021, s2 = 19, d* = 0.24 as in `dycon`; not normalised.
 *   Its critical-bandwidth scaling is Sethares' own linear fit s(f) = d* / (s1 f + s2), not an ERB.
 */
import { assertFreqs } from './pitch';
import { buildSpectrum, type Partial } from './spectrum';
import { DEFAULT_TIMBRE } from './timbre';
import type { InterferenceModel, Timbre } from './types';

/** Parameters of Hutchinson & Knopoff's dissonance factor, from `dycon::hutch_g`. */
export const HUTCHINSON_KNOPOFF = { cutoff: 1.2, a: 0.25, b: 2 } as const;
/** Parameters of Sethares' curve, from `dycon::dyad_roughness_seth`. */
export const SETHARES_PARAMS = { a: 3.5, b: 5.75, s1: 0.021, s2: 19, dStar: 0.24 } as const;

/** Critical bandwidth (Hz) at the mean of two frequencies, `dycon::hutch_cbw`. */
export function hutchCbw(f1: number, f2: number): number {
  return 1.72 * ((f1 + f2) / 2) ** 0.65;
}

/** Dissonance factor of a pair of pure tones, `dycon::hutch_dissonance_function` (0 beyond 1.2 critical bandwidths). */
export function hutchG(f1: number, f2: number): number {
  return hutchGOfY(Math.abs(f1 - f2) / hutchCbw(f1, f2));
}

/** The dissonance factor as a function of the gap `y` in critical bandwidths, `dycon::hutch_g` (0 above 1.2). */
export function hutchGOfY(y: number): number {
  if (y > HUTCHINSON_KNOPOFF.cutoff) {
    return 0;
  }
  const { a, b } = HUTCHINSON_KNOPOFF;
  return ((y / a) * Math.exp(1 - y / a)) ** b;
}

/** Roughness of two pure tones in Sethares' model (min-amplitude rule), `dycon::dyad_roughness_seth`. */
export function setharesPair(f1: number, a1: number, f2: number, a2: number): number {
  const lo = Math.min(f1, f2);
  const df = Math.abs(f1 - f2);
  const { a, b, s1, s2, dStar } = SETHARES_PARAMS;
  const s = dStar / (s1 * lo + s2);
  return Math.min(a1, a2) * (Math.exp(-a * s * df) - Math.exp(-b * s * df));
}

/** Roughness of a list of pure partials in Hutchinson & Knopoff's model (`dycon::roughness_hutch` on a spectrum). */
export function hutchRoughnessOfPartials(partials: readonly { f: number; a: number }[]): number {
  const n = partials.length;
  if (n < 2) {
    return 0;
  }
  let den = 0;
  let num = 0;
  for (let i = 0; i < n; i++) {
    den += partials[i].a ** 2;
    for (let j = i + 1; j < n; j++) {
      num += partials[i].a * partials[j].a * hutchG(partials[i].f, partials[j].f);
    }
  }
  return num / den;
}

/** Roughness of a list of pure partials in Sethares' model (`dycon::roughness_seth` on a spectrum). */
export function setharesRoughnessOfPartials(partials: readonly { f: number; a: number }[]): number {
  let sum = 0;
  for (let i = 0; i < partials.length; i++) {
    for (let j = i + 1; j < partials.length; j++) {
      sum += setharesPair(partials[i].f, partials[i].a, partials[j].f, partials[j].a);
    }
  }
  return sum;
}

export interface InterferenceOptions {
  /** Default `'hutchinson-knopoff'`. */
  model?: InterferenceModel;
  /** Merge coincident partials of different notes as `hrep` does (default true). The decomposition stays exact. */
  mergeCoincident?: boolean;
  /**
   * Compute `perNote` (default true). It costs one extra evaluation per note; `false` leaves `perNote` empty.
   * `dyads`, `self` and `worst` are always computed (they come free with the total).
   */
  decompose?: boolean;
}

export interface InterferenceResult {
  model: InterferenceModel;
  /** Total interference (higher = rougher). */
  total: number;
  /**
   * Largest single relation between two different notes (max over `dyads`, 0 for fewer than two notes): the worst
   * relation, reported separately from the total.
   */
  worst: number;
  /**
   * Symmetric n x n matrix (input order): `dyads[i][j] === dyads[j][i]` is the contribution of the partials of note i
   * against the partials of note j. The diagonal is 0; each note's internal (same-note) term is in `self`.
   * `total = sum_{i<j} dyads[i][j] + sum(self)` (to floating-point precision).
   */
  dyads: number[][];
  /** Each note's own partial-against-partial term. */
  self: number[];
  /** Marginal contribution of each note: `total` minus the total of the chord without that note. */
  perNote: number[];
}

interface Pairs {
  total: number;
  dyads: number[][];
  self: number[];
}

function pairSums(
  freqsHz: readonly number[],
  t: Timbre,
  model: InterferenceModel,
  merge: boolean
): Pairs {
  const n = freqsHz.length;
  const dyads = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const self = new Array<number>(n).fill(0);
  const ps: Partial[] = buildSpectrum(freqsHz, t, merge);
  if (ps.length < 2) {
    return { total: 0, dyads, self };
  }
  const hk = model === 'hutchinson-knopoff';
  let den = 1;
  if (hk) {
    den = 0;
    for (const p of ps) {
      den += p.a * p.a;
    }
  }
  let sum = 0;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    for (let j = i + 1; j < ps.length; j++) {
      const q = ps[j];
      const v = (hk ? p.a * q.a * hutchG(p.f, q.f) : setharesPair(p.f, p.a, q.f, q.a)) / den;
      if (v === 0) {
        continue;
      }
      sum += v;
      for (const s of p.shares) {
        for (const r of q.shares) {
          const w = v * s.share * r.share;
          if (s.note === r.note) {
            self[s.note] += w;
          } else {
            dyads[s.note][r.note] += w;
            dyads[r.note][s.note] += w;
          }
        }
      }
    }
  }
  return { total: sum, dyads, self };
}

/**
 * Interference of the chord of absolute frequencies `freqsHz` (Hz) played with `t`.
 * Returns the total, the worst relation, the per-dyad matrix and the per-note marginal contributions.
 */
export function interference(
  freqsHz: readonly number[],
  t: Timbre = DEFAULT_TIMBRE,
  opts: InterferenceOptions = {}
): InterferenceResult {
  const { model = 'hutchinson-knopoff', mergeCoincident = true, decompose = true } = opts;
  assertFreqs(freqsHz);
  const { total, dyads, self } = pairSums(freqsHz, t, model, mergeCoincident);
  let worst = 0;
  for (let i = 0; i < dyads.length; i++) {
    for (let j = i + 1; j < dyads.length; j++) {
      worst = Math.max(worst, dyads[i][j]);
    }
  }
  const perNote = decompose
    ? freqsHz.map((_, i) => {
        const rest = freqsHz.filter((__, j) => j !== i);
        return total - pairSums(rest, t, model, mergeCoincident).total;
      })
    : [];
  return { model, total, worst, dyads, self, perNote };
}

/**
 * Isolated-pair roughness for the Relations view: every pair of notes scored ALONE, at its real register (the chord's
 * other notes play no part, unlike `interference().dyads`, whose entries are shares of the whole chord's total).
 * `matrix[i][j]` (symmetric, zero diagonal) is the cross-note roughness of that dyad as a two-note chord, in the
 * model's own units (Hutchinson & Knopoff: per unit energy of the pair).
 */
export function pairwise(
  freqsHz: readonly number[],
  t: Timbre = DEFAULT_TIMBRE,
  opts: Pick<InterferenceOptions, 'model' | 'mergeCoincident'> = {}
): { matrix: number[][]; worst: number } {
  assertFreqs(freqsHz);
  const n = freqsHz.length;
  const matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  let worst = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const r = interference([freqsHz[i], freqsHz[j]], t, { ...opts, decompose: false });
      matrix[i][j] = r.dyads[0][1];
      matrix[j][i] = r.dyads[0][1];
      worst = Math.max(worst, r.dyads[0][1]);
    }
  }
  return { matrix, worst };
}
