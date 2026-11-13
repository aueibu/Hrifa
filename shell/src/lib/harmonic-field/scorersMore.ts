/**
 * Three more chord scorers (lower = better, same `ScoreResult` shape as `scorers.ts`) and a comparison table.
 *   scorePeriodicityFair  - the Infinitone-style periodicity count with the window scaled to the chord's register.
 *   scoreLattice          - mean Tenney height over every pair of chord tones.
 *   scoreRoughness        - Plomp-Levelt roughness, Sethares' parameterisation, over all partial pairs (the lab default).
 * Conventions: an empty chord scores 999999 (EMPTY_SCORE) with `detail.empty = true`; a single note is a real chord of
 * one tone (lattice 0, roughness = its own partials, periodicity = a closed curve).
 */
import { nearestRatio, ratioList } from './deviation';
import { mAdd, mFrac } from './intervals';
import type { ScoreResult } from './scorers';
import type { Note } from './types';

/** Same value as `EMPTY_SCORE` in retuner.ts (not imported: retuner imports scorers, keep the graph acyclic). */
const EMPTY = 999999;

/* ----------------------------------------------------------------------------------------------------------------
 * Pitch-fair periodicity
 * ------------------------------------------------------------------------------------------------------------- */

export interface PeriodicityFairOpts {
  /** Periods of the chord's LOWEST note in the window (default 44, what Infinitone's 0.1 s is at 440 Hz). */
  periods?: number;
  /** Samples per period of the lowest note (default 100, what Infinitone's 44100 Hz is at 441 Hz). */
  samplesPerPeriod?: number;
  /** Grid cells per axis over [-1, 1] (default 100). */
  bins?: number;
}

/**
 * Same curve-counting idea as the parity scorer (sum the tones as unit phasors, count the grid cells the curve
 * visits), but the window and the sampling step are both measured in periods of the chord's lowest note instead of
 * seconds: `periods` periods, `samplesPerPeriod` samples each. Multiplying every frequency by k then leaves the
 * sampled phases untouched, so the score is the same at 55, 220 and 880 Hz (it depends on the chord's shape only).
 * Phases are computed per sample (no accumulated drift). Defaults match the parity scorer at about 440 Hz.
 */
export function scorePeriodicityFair(
  freqs: readonly number[],
  opts: PeriodicityFairOpts = {}
): ScoreResult {
  const { periods = 44, samplesPerPeriod = 100, bins = 100 } = opts;
  const tones = freqs.filter((f) => f > 0 && Number.isFinite(f));
  if (tones.length === 0) {
    return { score: EMPTY, detail: { cells: 0, samples: 0, empty: true } };
  }
  const fmin = Math.min(...tones);
  const ratios = tones.map((f) => f / fmin);
  const n = ratios.length;
  const a = 1 / n;
  const total = Math.round(periods * samplesPerPeriod);
  const cell = 2 / bins;
  const seen = new Set<number>();
  for (let s = 0; s < total; s++) {
    let x = 0;
    let y = 0;
    for (let i = 0; i < n; i++) {
      const ph = (2 * Math.PI * ratios[i] * s) / samplesPerPeriod;
      x += Math.cos(ph) * a;
      y += Math.sin(ph) * a;
    }
    seen.add(Math.floor((x + 1) / cell) * 100003 + Math.floor((y + 1) / cell));
  }
  return {
    score: seen.size,
    detail: { cells: seen.size, samples: total, periods, samplesPerPeriod, bins, fmin },
  };
}

/* ----------------------------------------------------------------------------------------------------------------
 * Lattice distance
 * ------------------------------------------------------------------------------------------------------------- */

export interface LatticeOpts {
  /** Odd limit of the candidate ratios used to explain a pair that has no exact monzo (default 9). */
  oddLimit?: number;
  /**
   * Bits charged per cent of mistuning (default 0.05). The ratio that explains a pair is the candidate with the lowest
   * cost = Tenney height + centsPenalty * |error in cents|. Exact pairs (monzos, or Hz on a ratio) pay nothing.
   * 0 = pure Tenney height; the explaining ratio is then the nearest by cents (otherwise it would always be 1/1).
   */
  centsPenalty?: number;
}

export interface LatticePair {
  /** Input indices of the pair's lower (i) and upper (j) tone. */
  i: number;
  j: number;
  /** The octave-reduced interval used, as "n/d". */
  ratio: string;
  exact: boolean;
  /** Tenney height log2(n*d). */
  height: number;
  /** Mistuning in cents against `ratio` (0 when exact). */
  errCents: number;
  /** height + penalty: what the pair adds to the mean. */
  cost: number;
}

const gcdBig = (x: bigint, y: bigint): bigint => {
  let a = x;
  let b = y;
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
};

/** Octave-reduce n/d (both > 0) into [1, 2) in lowest terms. */
function reduceOctave(n0: bigint, d0: bigint): [bigint, bigint] {
  let n = n0;
  let d = d0;
  while (n >= 2n * d) {
    d *= 2n;
  }
  while (n < d) {
    n *= 2n;
  }
  const g = gcdBig(n, d);
  return [n / g, d / g];
}

interface Tone {
  note?: Note;
  c: number;
  /** Position in the input. */
  idx: number;
}

/**
 * The ratio (odd limit <= `oddLimit`, octave-reduced) that best explains `cents`: lowest cost = Tenney height +
 * penalty * |error|. With penalty 0 the nearest ratio by cents (ties: lower height) is used.
 */
function explain(cents: number, oddLimit: number, penalty: number) {
  if (penalty <= 0) {
    const r = nearestRatio(cents, oddLimit, 1200);
    const [ns, ds] = r.ratio.split('/');
    return { ratio: r.ratio, h: Math.log2(Number(ns) * Number(ds)), err: Math.abs(r.err) };
  }
  const L = Math.max(1, Math.floor(oddLimit) || 1);
  const x = ((cents % 1200) + 1200) % 1200;
  let best = { ratio: '1/1', h: 0, err: 0, cost: Infinity };
  for (const cand of ratioList(L, 1200)) {
    const e = Math.abs(((x - cand.c + 1800) % 1200) - 600);
    // cand.h is the odd-part height; the pair cost uses the Tenney height of the octave-reduced ratio itself
    const [ns, ds] = cand.ratio.split('/');
    const h = Math.log2(Number(ns) * Number(ds));
    const cost = h + penalty * e;
    if (cost < best.cost - 1e-12) {
      best = { ratio: cand.ratio, h, err: e, cost };
    }
  }
  return best;
}

/**
 * Mean Tenney height log2(n*d) over every pair of chord tones, using the octave-reduced interval of the pair (so
 * close and open voicings score alike). Input is Hz values or Notes (not mixed). Notes that carry monzos give the exact
 * ratio. Otherwise (Hz, irrational notes) the pair is explained by the candidate ratio within `oddLimit` with the
 * lowest cost = Tenney height + centsPenalty * |error|, so the score is continuous in the pitches (see `LatticeOpts`).
 * Only the pairwise intervals matter: 4:5:6 (pairs 5/4, 6/5, 3/2) and 10:12:15 (pairs 6/5, 3/2, 5/4) score the same.
 * Empty (or no valid Hz) = 999999; one tone = 0 (no pairs). `detail.pairs[].i` is the input index of the pair's lower
 * tone and `j` of the upper one.
 */
export function scoreLattice(
  input: readonly number[] | readonly Note[],
  opts: LatticeOpts = {}
): ScoreResult {
  const { oddLimit = 9, centsPenalty = 0.05 } = opts;
  const tones: Tone[] = [];
  (input as readonly (number | Note)[]).forEach((x, idx) => {
    if (typeof x === 'number') {
      if (x > 0 && Number.isFinite(x)) {
        tones.push({ c: 1200 * Math.log2(x), idx });
      }
    } else {
      tones.push({ note: x, c: x.c, idx });
    }
  });
  if (tones.length === 0) {
    return { score: EMPTY, detail: { pairs: [], empty: true } };
  }
  tones.sort((p, q) => p.c - q.c);
  const pairs: LatticePair[] = [];
  for (let i = 0; i < tones.length; i++) {
    for (let j = i + 1; j < tones.length; j++) {
      const p = tones[i];
      const q = tones[j];
      if (p.note?.m && q.note?.m) {
        const [a, b] = mFrac(mAdd(q.note.m, p.note.m, -1));
        const [n, d] = reduceOctave(a, b);
        const h = Math.log2(Number(n * d));
        pairs.push({
          i: p.idx,
          j: q.idx,
          ratio: `${n}/${d}`,
          exact: true,
          height: h,
          errCents: 0,
          cost: h,
        });
      } else {
        const r = explain(q.c - p.c, oddLimit, centsPenalty);
        const exact = r.err < 1e-6;
        pairs.push({
          i: p.idx,
          j: q.idx,
          ratio: r.ratio,
          exact,
          height: r.h,
          errCents: exact ? 0 : r.err,
          cost: r.h + (exact ? 0 : centsPenalty * r.err),
        });
      }
    }
  }
  const score = pairs.length ? pairs.reduce((s, p) => s + p.cost, 0) / pairs.length : 0;
  return { score, detail: { pairs, oddLimit, centsPenalty } };
}

/* ----------------------------------------------------------------------------------------------------------------
 * Roughness (Plomp-Levelt, Sethares)
 * ------------------------------------------------------------------------------------------------------------- */

/**
 * Sethares' constants (Sethares, "Tuning, Timbre, Spectrum, Scale", 2nd ed. 2005; his MATLAB `dissmeasure.m` at
 * https://sethares.engr.wisc.edu/comprog.html; a fit to Plomp and Levelt 1965). For two partials f1 <= f2 with
 * amplitudes a1, a2 (his code has C1 = 5, C2 = -5, hence the factor 5):
 *   d = 5 * min(a1, a2) * ( exp(-b1 * s * (f2 - f1)) - exp(-b2 * s * (f2 - f1)) ),   s = DSTAR / (S1 * f1 + S2)
 * `s` stretches the curve with register (the critical bandwidth grows with frequency). The older 1994 model used the
 * product a1 * a2; the 2005 model uses the minimum, which is the default (`amp: 'product'` gives the older one).
 */
export const SETHARES = { b1: 3.51, b2: 5.75, s1: 0.0207, s2: 18.96, dstar: 0.24, c: 5 } as const;

export interface RoughnessOpts {
  /** Harmonics per tone (default 7: Sethares' sample script uses a 7-partial spectrum). */
  harmonics?: number;
  /** Amplitude of harmonic k (1-based) is rolloff^(k-1) (default 0.88, Sethares' sample spectrum). */
  rolloff?: number;
  /** 'min' (Sethares 2005, default) or 'product' (older). */
  amp?: 'min' | 'product';
}

/** Roughness of one pair of partials. Argument order does not matter. */
export function pairRoughness(
  fa: number,
  aa: number,
  fb: number,
  ab: number,
  amp: 'min' | 'product' = 'min'
): number {
  const lo = Math.min(fa, fb);
  const df = Math.abs(fa - fb);
  const s = SETHARES.dstar / (SETHARES.s1 * lo + SETHARES.s2);
  const w = amp === 'min' ? Math.min(aa, ab) : aa * ab;
  return SETHARES.c * w * (Math.exp(-SETHARES.b1 * s * df) - Math.exp(-SETHARES.b2 * s * df));
}

/**
 * Sum of Plomp-Levelt roughness over every pair of partials of every tone (including partials of the same tone, as
 * Sethares sums over the whole spectrum). Each tone gets `harmonics` partials at k*f with amplitude rolloff^(k-1);
 * tones are not level-normalised. `detail.pairs` lists each pair of tones (input order, i < j) with its roughness;
 * `detail.self` lists each tone's own partial-partial roughness.
 */
export function scoreRoughness(freqs: readonly number[], opts: RoughnessOpts = {}): ScoreResult {
  const { harmonics = 7, rolloff = 0.88, amp = 'min' } = opts;
  const tones = freqs.filter((f) => f > 0 && Number.isFinite(f));
  if (tones.length === 0) {
    return { score: EMPTY, detail: { pairs: [], self: [], empty: true } };
  }
  const partials = tones.map((f) =>
    Array.from({ length: harmonics }, (_, k) => ({ f: f * (k + 1), a: rolloff ** k }))
  );
  const self = partials.map((ps) => {
    let r = 0;
    for (let x = 0; x < ps.length; x++) {
      for (let y = x + 1; y < ps.length; y++) {
        r += pairRoughness(ps[x].f, ps[x].a, ps[y].f, ps[y].a, amp);
      }
    }
    return r;
  });
  const pairs: { i: number; j: number; roughness: number }[] = [];
  for (let i = 0; i < tones.length; i++) {
    for (let j = i + 1; j < tones.length; j++) {
      let r = 0;
      for (const p of partials[i]) {
        for (const q of partials[j]) {
          r += pairRoughness(p.f, p.a, q.f, q.a, amp);
        }
      }
      pairs.push({ i, j, roughness: r });
    }
  }
  const score = self.reduce((s, v) => s + v, 0) + pairs.reduce((s, p) => s + p.roughness, 0);
  return { score, detail: { pairs, self, harmonics, rolloff, amp } };
}

/* ----------------------------------------------------------------------------------------------------------------
 * Comparison table
 * ------------------------------------------------------------------------------------------------------------- */

export interface NamedScorer {
  name: string;
  /** `notes` is the chord's exact notes when the caller has them (the lattice scorer wants them). */
  score: (freqs: number[], notes?: Note[]) => ScoreResult;
}

export interface ComparisonTable {
  /** Column names (scorers). */
  scorers: string[];
  rows: {
    name: string;
    /** One score per scorer (each scorer has its own scale: compare ranks, not values). */
    scores: number[];
    /** One rank per scorer: 1 = best (lowest) chord for that scorer; ties share the lower rank. */
    ranks: number[];
  }[];
}

/** Score every chord with every scorer and rank the chords within each scorer (1 = lowest score). */
export function compareScorers(
  chords: ReadonlyArray<{ name: string; freqs: number[]; notes?: Note[] }>,
  scorers: ReadonlyArray<NamedScorer>
): ComparisonTable {
  const scores = chords.map((c) => scorers.map((s) => s.score(c.freqs, c.notes).score));
  return {
    scorers: scorers.map((s) => s.name),
    rows: chords.map((c, r) => ({
      name: c.name,
      scores: scores[r],
      ranks: scorers.map((_, k) => 1 + scores.filter((row) => row[k] < scores[r][k] - 1e-9).length),
    })),
  };
}
