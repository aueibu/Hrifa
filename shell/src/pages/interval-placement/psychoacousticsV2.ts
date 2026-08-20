import type { DissonanceParams } from './intervalMath';

/**
 * Draft alternative to the shipped v1 dissonance model in `intervalMath.ts`
 * (`sonorityPenalty`/`perPair`), built from named published psychoacoustic
 * models rather than one hand-tuned formula. Computed alongside v1
 * (`PlacementRecord.scoreV2`) so the two can be compared; it does not
 * drive ranking — `computeForWindow` still sorts by v1's `perPair`.
 *
 * McDermott, Lehr & Oxenham (2010, Current Biology) psychophysically
 * dissociated roughness, harmonicity, and familiarity as independent
 * predictors of chord preference — real listeners' judgments track a
 * combination of distinct factors, not one blended heuristic. This file
 * keeps that separation:
 *
 *  - `chordRoughnessERB` — Sethares (1993/2005) dissonance curve, driven
 *    by ERB critical bandwidth (Glasberg & Moore, 1990) instead of v1's
 *    `1.72*fbar^0.65` approximation, computed over the whole chord's
 *    combined partials with a lightweight masking term. ERB bandwidth is
 *    inherently frequency-dependent, so the same step interval reading as
 *    rougher in a low register falls out of this calculation on its own —
 *    no separate register-damping multiplier needed on top (v1 applies
 *    one; see the discussion this file grew out of).
 *  - `harmonicEntropy` — replaces v1's `ratioCost` (nearest-simple-ratio
 *    search with a hand-picked Tenney-height penalty) with the
 *    information-theoretic harmonic entropy model (Erlich; formalized by
 *    Sethares & Milne): the Shannon entropy of a listener's ratio
 *    hypotheses for a tempered interval, given realistic tuning-perception
 *    noise. Low entropy = the interval unambiguously implies one simple
 *    ratio; high entropy = many comparably plausible ratios.
 *  - `chordHarmonicity` — a simplified Terhardt (1982) virtual-pitch /
 *    Parncutt (1989) root-support score. Entirely absent from v1: how
 *    strongly the chord's pitches imply a single virtual fundamental,
 *    independent of roughness. A chord that approximates a harmonic
 *    series reads as more fused/consonant on this axis even if none of
 *    its individual dyads are especially "simple" ratios.
 *
 * What this file does NOT attempt: a validated weighting for combining
 * the three sub-scores into one number. McDermott et al. fit that from
 * real listening-test data; `scoreVoicingV2.combined` below is an
 * equal-weight normalized placeholder, kept clearly separable from the
 * sub-scores so a better-informed combination can replace it without
 * redoing the acoustics.
 *
 * Known simplifications, flagged rather than hidden:
 *  - The masking term in `chordRoughnessERB` is a rough stand-in for real
 *    simultaneous masking (which is level-dependent and asymmetric in
 *    frequency — Hutchinson & Knopoff 1978 model it more carefully).
 *  - `chordHarmonicity`'s candidate-fundamental search is a bounded
 *    subharmonic grid, not Terhardt's full weighted template-matching.
 *  - `dyadSalience`'s proximity/bass weighting follows Parncutt's general
 *    finding that bass and close-position dyads dominate perceived chord
 *    dissonance, but the specific weighting curve here is a reasonable
 *    guess, not fit to data.
 */

// ---------- ERB (Glasberg & Moore, 1990) ----------
export function erbBandwidthHz(fHz: number): number {
  return 24.7 * (4.37 * (fHz / 1000) + 1);
}

// ---------- Partial generation ----------
interface Partial {
  freqHz: number;
  amp: number;
}

function partialsForStep(step: number, params: DissonanceParams): Partial[] {
  const f0 = params.fRefHz * 2 ** (step / params.edoSteps);
  const partials: Partial[] = [];
  for (let k = 1; k <= params.roughPartialsK; k++) {
    partials.push({ freqHz: f0 * k, amp: 1 / k ** params.ampPower });
  }
  return partials;
}

// ---------- Roughness: Sethares curve on ERB bandwidth, full chord, masked ----------
const MASK_RADIUS_ERB = 1.0;

function pairRoughness(p1: Partial, p2: Partial, a: number, b: number): number {
  const df = Math.abs(p1.freqHz - p2.freqHz);
  const fbar = 0.5 * (p1.freqHz + p2.freqHz);
  const bw = erbBandwidthHz(fbar);
  const x = bw > 0 ? df / bw : 0;
  return (Math.exp(-a * x) - Math.exp(-b * x)) * p1.amp * p2.amp;
}

/**
 * Roughness across every cross-note partial pair in the chord (same-note
 * partials excluded — that's timbral roughness, not harmonic dissonance
 * between notes). Each partial's contribution is damped toward a louder
 * other-note partial within ~1 ERB of it, as a lightweight stand-in for
 * perceptual masking — two nearby partials don't simply sum their
 * roughness independently of their relative loudness.
 */
export function chordRoughnessERB(steps: number[], params: DissonanceParams): number {
  const perNote = steps.map((step) => partialsForStep(step, params));
  const allPartials: Array<Partial & { note: number }> = [];
  perNote.forEach((partials, note) => partials.forEach((p) => allPartials.push({ ...p, note })));

  const maskWeight = allPartials.map((p, i) => {
    let maxNeighborAmp = 0;
    allPartials.forEach((q, j) => {
      if (i === j || q.note === p.note) {
        return;
      }
      const bw = erbBandwidthHz(0.5 * (p.freqHz + q.freqHz));
      if (bw > 0 && Math.abs(p.freqHz - q.freqHz) / bw <= MASK_RADIUS_ERB) {
        maxNeighborAmp = Math.max(maxNeighborAmp, q.amp);
      }
    });
    return maxNeighborAmp > p.amp ? p.amp / maxNeighborAmp : 1;
  });

  let total = 0;
  for (let i = 0; i < allPartials.length; i++) {
    for (let j = i + 1; j < allPartials.length; j++) {
      if (allPartials[i].note === allPartials[j].note) {
        continue;
      }
      total +=
        pairRoughness(allPartials[i], allPartials[j], params.roughA, params.roughB) *
        maskWeight[i] *
        maskWeight[j];
    }
  }
  return total;
}

// ---------- Harmonic entropy (Erlich; Sethares & Milne) ----------
function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function buildRatioSet(maxDenom: number): Array<{ cents: number }> {
  const set: Array<{ cents: number }> = [];
  for (let d = 1; d <= maxDenom; d++) {
    for (let n = d; n <= 2 * d; n++) {
      if (gcd(n, d) !== 1) {
        continue;
      }
      set.push({ cents: 1200 * Math.log2(n / d) });
    }
  }
  return set;
}

// Built once — the ratio hypothesis set doesn't depend on any per-call params.
const RATIO_SET = buildRatioSet(32);
const LN2 = Math.log(2);

/**
 * Harmonic entropy of a tempered interval: weight every nearby simple
 * ratio (up to denominator 32, within one octave) by a Gaussian
 * likelihood centered on the actual interval — spread `sigmaCents`, the
 * same tuning-tolerance knob v1 already exposes for its own ratio search
 * — normalize to a probability distribution over ratio hypotheses, and
 * return its Shannon entropy in bits.
 */
export function harmonicEntropy(cents: number, sigmaCents: number): number {
  let sum = 0;
  const likelihoods = RATIO_SET.map(({ cents: target }) => {
    const z = (cents - target) / sigmaCents;
    const l = Math.exp(-0.5 * z * z);
    sum += l;
    return l;
  });
  if (sum <= 0) {
    return 0;
  }
  let entropy = 0;
  likelihoods.forEach((l) => {
    const p = l / sum;
    // Guard on `p`, not `l`: a ratio far from `cents` can have a tiny but
    // nonzero Gaussian likelihood (e.g. 2.5e-323) that passes an `l <= 0`
    // check, yet still underflows to exactly 0 once divided by `sum`. The
    // true limit of `p * log(p)` as `p -> 0` is 0, but `0 * -Infinity`
    // evaluates to `NaN` in IEEE 754 — so this has to skip on `p`, the
    // value actually fed to `log`, not on `l`.
    if (p <= 0) {
      return;
    }
    entropy -= p * (Math.log(p) / LN2);
  });
  return entropy;
}

// ---------- Harmonicity / virtual pitch (Terhardt 1982; Parncutt 1989) ----------
/**
 * How strongly the chord's pitches imply a single virtual fundamental.
 * Candidate fundamentals are each note's own frequency divided by small
 * integers (its possible subharmonics — the standard candidate-generation
 * step in Terhardt's model); each candidate is scored by how many of the
 * chord's actual pitches land near one of its low harmonics, weighted by
 * `1/harmonicNumber` (higher harmonics contribute less root support, per
 * Parncutt). Returns the best candidate's score, normalized to 0..1.
 */
export function chordHarmonicity(freqsHz: number[], maxHarmonic = 8, centsTolerance = 20): number {
  if (!freqsHz.length) {
    return 0;
  }
  const candidates = new Set<number>();
  freqsHz.forEach((f) => {
    for (let k = 1; k <= maxHarmonic; k++) {
      candidates.add(f / k);
    }
  });
  let best = 0;
  candidates.forEach((f0) => {
    let score = 0;
    freqsHz.forEach((f) => {
      let noteScore = 0;
      for (let k = 1; k <= maxHarmonic; k++) {
        const centsOff = Math.abs(1200 * Math.log2(f / (f0 * k)));
        if (centsOff <= centsTolerance) {
          noteScore = 1 / k;
          break;
        }
      }
      score += noteScore;
    });
    best = Math.max(best, score);
  });
  return best / freqsHz.length;
}

// ---------- Top-level: score a full voicing ----------
export interface VoicingScoreV2 {
  roughness: number;
  ambiguity: number;
  harmonicity: number;
  combined: number;
}

/**
 * Dyad salience within the chord: closer-register pairs and pairs
 * involving the lowest note (bass/root relationships) are weighted more
 * heavily, per Parncutt's root-support model. A flat unweighted mean
 * (what v1's `perPair` uses) treats a close inner-voice dyad the same as
 * a widely spaced outer one, which the literature doesn't support.
 */
function dyadSalience(isBassPair: boolean, gapSteps: number): number {
  const proximity = 1 / (1 + gapSteps / 12);
  return isBassPair ? proximity * 1.5 : proximity;
}

// Rough normalizations so the three terms sit on comparable scales for
// the placeholder `combined` score below — tune once there's real
// comparison data to fit against, per the file header.
function normalizeRoughness(r: number): number {
  return r / 4;
}
function normalizeAmbiguity(bits: number): number {
  return bits / 5;
}

/** `pitches` are scale steps (same convention as `PlacementRecord.pitches`), ascending. */
export function scoreVoicingV2(pitches: number[], params: DissonanceParams): VoicingScoreV2 {
  if (pitches.length < 2) {
    return { roughness: 0, ambiguity: 0, harmonicity: 0, combined: 0 };
  }
  const freqs = pitches.map((p) => params.fRefHz * 2 ** (p / params.edoSteps));

  const roughnessRaw = chordRoughnessERB(pitches, params);
  const harmonicity = chordHarmonicity(freqs);

  let ambigSum = 0;
  let weightSum = 0;
  for (let i = 0; i < pitches.length; i++) {
    for (let j = i + 1; j < pitches.length; j++) {
      const gap = pitches[j] - pitches[i];
      const cents = 1200 * ((gap % params.edoSteps) / params.edoSteps);
      const he = harmonicEntropy(cents, params.sigmaCents);
      const w = dyadSalience(i === 0, gap);
      ambigSum += he * w;
      weightSum += w;
    }
  }
  const ambiguity = weightSum ? ambigSum / weightSum : 0;

  // Higher roughness/ambiguity = more dissonant; higher harmonicity = more
  // consonant, hence subtracted.
  const combined = normalizeRoughness(roughnessRaw) + normalizeAmbiguity(ambiguity) - harmonicity;

  return { roughness: roughnessRaw, ambiguity, harmonicity, combined };
}
