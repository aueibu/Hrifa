/**
 * Harmonicity by harmonic-template matching (virtual pitch).
 *
 * Method (Milne 2013; Milne & Holland 2016; Harrison & Pearce 2018, as ported from the R packages `har18` and
 * `hrep`, MIT, Harrison): every note is expanded into its first `harmonics` harmonics, each weighted 1 / n^rho and
 * smeared with a Gaussian of standard deviation `sigma` cents, on a log-frequency axis of 1-cent bins. A harmonic
 * template (one complex tone) is swept over that spectrum and the cosine similarity is taken at every candidate
 * virtual pitch. The similarity profile is normalised to a distribution and its Kullback-Leibler divergence from the
 * uniform distribution (bits) is the harmonicity: a chord that fits one virtual pitch sharply scores high, one
 * that fits many pitches equally scores low. There is no 1/n floor (the v2 artefact where every chord of n notes read 1/n at best).
 *
 * Two spaces:
 * - `'pitch-class'` is the faithful har18 model: the axis is one octave (1200 bins), octave-equivalent and circular,
 *   so where the notes sit in the octaves does not matter (C-E-G in any voicing scores the same).
 * - `'pitch'` is THIS ARC'S EXTENSION, not a published model: the same template method on absolute pitch, with a
 *   linear axis (no wrap-around) and candidate virtual pitches in a fixed-width window anchored on the lowest note
 *   (default: four octaves below it to one above, `candidateOctaves`). Octave placement now changes the spectrum, so
 *   M10 and M3 differ. Like the original it is transposition-invariant (on the 1-cent grid: exactly for whole-cent
 *   shifts, to rounding error otherwise): it has no absolute-register term (register enters through interference),
 *   and it has no audibility cut-off for partials.
 *
 * The template is a fixed perceptual model of a complex tone (11 harmonics at 1/n^0.75, as `incon` passes to
 * `har_19_composite`), NOT the playback timbre: a listener's virtual-pitch template does not become a sine because the
 * chord is played on sines (that collapsed every chord of n notes to one value). Override only with explicit options.
 *
 * Differences from har18: pitches are cents, so any tuning works (har18 takes MIDI note numbers); the sweep is
 * computed from the sparse partials instead of a dense 1200 x 1200 loop (the same numbers to rounding error);
 * defaults follow `incon` (11 harmonics, rho 0.75, sigma 6.83) rather than the stand-alone `har18` defaults (12
 * harmonics, rho 0.75): pass `{harmonics: 12}` for those.
 */
import { assertFreqs, mod, roundHalfEven } from './pitch';
import type { HarmonicitySpace } from './types';

/** Fixed template defaults (incon: 11 harmonics, roll-off 1 mapped to rho 0.75; sigma from Milne & Holland 2016). */
export const HARMONICITY_DEFAULTS = { harmonics: 11, rho: 0.75, sigma: 6.83 } as const;

export interface HarmonicityOptions {
  /** `'pitch-class'` (har18, default) or `'pitch'` (this arc's extension). */
  space?: HarmonicitySpace;
  /** Harmonics in the spectrum and in the template (integer >= 1, default 11). Independent of the playback timbre. */
  harmonics?: number;
  /** Roll-off of harmonic weights, 1 / n^rho (default 0.75). */
  rho?: number;
  /** Gaussian smoothing standard deviation in cents (default 6.83, Milne & Holland 2016). */
  sigma?: number;
  /**
   * `'pitch'` space only: the window of candidate virtual pitches, in octaves relative to the chord's lowest note
   * (default `[-4, 1]`: from four octaves below, where a template's 11th harmonic can still reach the bass note, to
   * one octave above). Its width is fixed, so the KL reference is the same for every chord, and anchoring it to the
   * bass makes the score transposition-invariant (exactly for whole-cent shifts).
   */
  candidateOctaves?: readonly [number, number];
}

export interface HarmonicityResult {
  /** KL divergence from uniform of the template-fit profile, in bits (higher = more harmonic). */
  value: number;
  /**
   * The best-fitting virtual pitch in Hz. In `'pitch'` space it is the absolute argmax of the profile. In
   * `'pitch-class'` space the answer is only a pitch class, so it is shown in the octave at or just below the lowest
   * note.
   */
  virtualPitchHz: number;
  space: HarmonicitySpace;
}

const BINS = 1200;
const A4 = 440;
const DEFAULT_CANDIDATES: readonly [number, number] = [-4, 1];

interface Kernel {
  half: number;
  /** AC[d + 2 * half]: autocorrelation of the truncated Gaussian, for d in [-2 half, 2 half]. */
  ac: Float64Array;
}

const kernels = new Map<number, Kernel>();

/** Autocorrelation of `hrep`'s sampled Gaussian template (dnorm at integer cents, truncated at floor(12 sigma)). */
function kernelFor(sigma: number): Kernel {
  const hit = kernels.get(sigma);
  if (hit) {
    return hit;
  }
  const half = Math.floor(sigma * 12);
  const g = new Float64Array(2 * half + 1);
  for (let k = -half; k <= half; k++) {
    g[k + half] = Math.exp(-(k * k) / (2 * sigma * sigma)) / (sigma * Math.sqrt(2 * Math.PI));
  }
  const ac = new Float64Array(4 * half + 1);
  for (let d = -2 * half; d <= 2 * half; d++) {
    let s = 0;
    for (let k = -half; k <= half; k++) {
      const j = k + d;
      if (j >= -half && j <= half) {
        s += g[k + half] * g[j + half];
      }
    }
    ac[d + 2 * half] = s;
  }
  const kernel = { half, ac };
  kernels.set(sigma, kernel);
  return kernel;
}

interface Bump {
  pos: number;
  w: number;
}

/** Harmonic bumps of a tone whose fundamental sits at `baseCents` (1-cent bins, rounded like `hrep`). */
function bumps(baseCents: number, harmonics: number, rho: number, wrap: boolean): Bump[] {
  const out: Bump[] = [];
  for (let n = 1; n <= harmonics; n++) {
    const raw = baseCents + BINS * Math.log2(n);
    out.push({ pos: roundHalfEven(wrap ? mod(raw, BINS) : raw), w: 1 / n ** rho });
  }
  return out;
}

/** Signed circular distance in (-600, 600]. */
function circ(d: number): number {
  const m = mod(d, BINS);
  return m > BINS / 2 ? m - BINS : m;
}

function selfNorm2(bs: readonly Bump[], k: Kernel, wrap: boolean): number {
  let s = 0;
  for (const p of bs) {
    for (const q of bs) {
      const d = wrap ? circ(p.pos - q.pos) : p.pos - q.pos;
      if (Math.abs(d) <= 2 * k.half) {
        s += p.w * q.w * k.ac[d + 2 * k.half];
      }
    }
  }
  return s;
}

interface Raw {
  value: number;
  /** pc-space: the best bin (cents above A, 0-1199); pitch space: the best bin above A4 (can be negative). */
  bin: number;
}

const cache = new Map<string, Raw>();
const CACHE_MAX = 4000;

/** Dedupe notes at the same pitch (to 1e-4 cent). */
function uniqueCents(cents: readonly number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const c of cents) {
    const key = Math.round(c * 1e4);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(c);
    }
  }
  return out;
}

/** Harmonicity of the chord of absolute frequencies `freqsHz` (Hz). */
export function harmonicity(
  freqsHz: readonly number[],
  opts: HarmonicityOptions = {}
): HarmonicityResult {
  const { space = 'pitch-class' } = opts;
  const sigma = opts.sigma ?? HARMONICITY_DEFAULTS.sigma;
  const harmonics = opts.harmonics ?? HARMONICITY_DEFAULTS.harmonics;
  const rho = opts.rho ?? HARMONICITY_DEFAULTS.rho;
  const [octLo, octHi] = opts.candidateOctaves ?? DEFAULT_CANDIDATES;
  assertFreqs(freqsHz);
  if (!(sigma > 0) || !Number.isFinite(sigma)) {
    throw new RangeError('harmonicity: sigma must be a positive finite number');
  }
  if (!Number.isInteger(harmonics) || harmonics < 1) {
    throw new RangeError('harmonicity: harmonics must be an integer >= 1');
  }
  if (!Number.isFinite(rho)) {
    throw new RangeError('harmonicity: rho must be finite');
  }
  if (freqsHz.length === 0) {
    return { value: 0, virtualPitchHz: 0, space };
  }
  const wrap = space === 'pitch-class';

  // note positions: cents above A4; pitch-class space keeps them modulo one octave (rounded to 1e-6 semitone first)
  const abs = freqsHz.map((f) => Math.round(1200 * Math.log2(f / A4) * 1e4) / 1e4);
  const notes = uniqueCents(wrap ? abs.map((c) => mod(Math.round(c * 1e4) / 1e4, BINS)) : abs);
  // pitch space: candidate window in bins above A4, anchored on the lowest note
  const bass = Math.round(Math.min(...abs));
  const candLo = bass + BINS * octLo;
  const candHi = bass + BINS * octHi;
  const key = `${space}|${harmonics}|${rho}|${sigma}|${wrap ? '' : `${octLo},${octHi}|`}${notes.map((c) => c.toFixed(4)).join(',')}`;
  let res = cache.get(key);
  if (!res) {
    res = sweep(notes, space, harmonics, rho, sigma, candLo, candHi);
    if (cache.size > CACHE_MAX) {
      cache.clear();
    }
    cache.set(key, res);
  }
  // virtual pitch: pitch-class space is reported relative to the lowest note
  if (wrap) {
    const k = Math.floor((Math.min(...abs) + 0.5 - res.bin) / BINS);
    return { value: res.value, virtualPitchHz: A4 * 2 ** ((res.bin + BINS * k) / BINS), space };
  }
  return { value: res.value, virtualPitchHz: A4 * 2 ** (res.bin / BINS), space };
}

function sweep(
  notes: readonly number[],
  space: HarmonicitySpace,
  harmonics: number,
  rho: number,
  sigma: number,
  candLo: number,
  candHi: number
): Raw {
  const wrap = space === 'pitch-class';
  const k = kernelFor(sigma);
  const span = 2 * k.half;
  const tmpl = bumps(0, harmonics, rho, wrap);
  const partials = notes.flatMap((c) => bumps(c, harmonics, rho, wrap));

  const lo = wrap ? 0 : candLo;
  const hi = wrap ? BINS - 1 : candHi;
  const size = hi - lo + 1;
  const cross = new Float64Array(size);
  for (const tb of tmpl) {
    for (const p of partials) {
      const c = p.pos - tb.pos;
      const wgt = tb.w * p.w;
      for (let d = -span; d <= span; d++) {
        const i = wrap ? mod(c + d, BINS) : c + d - lo;
        if (i < 0 || i >= size) {
          continue;
        }
        cross[i] += wgt * k.ac[d + span];
      }
    }
  }
  const norm = Math.sqrt(selfNorm2(tmpl, k, wrap) * selfNorm2(partials, k, wrap));
  let total = 0;
  let best = 0;
  for (let i = 0; i < size; i++) {
    cross[i] /= norm;
    total += cross[i];
    if (cross[i] > cross[best]) {
      best = i;
    }
  }
  let value = 0;
  if (total > 0) {
    for (let i = 0; i < size; i++) {
      const p = cross[i] / total;
      if (p > 0) {
        value += p * Math.log2(p * size);
      }
    }
  }
  return { value, bin: wrap ? best : best + lo };
}

/** Number of distinct pitch classes of a chord (to 1e-4 cent): the "number of notes" of Harrison & Pearce (2020). */
export function distinctPitchClasses(freqsHz: readonly number[]): number {
  assertFreqs(freqsHz);
  return uniqueCents(
    freqsHz.map((f) => mod(Math.round(1200 * Math.log2(f / A4) * 1e4) / 1e4, BINS))
  ).length;
}
