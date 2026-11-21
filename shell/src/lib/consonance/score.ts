import { harmonicity, type HarmonicityOptions, type HarmonicityResult } from './harmonicity';
import { interference, type InterferenceResult } from './interference';
import { periodicity, type PeriodicityOptions, type PeriodicityResult } from './periodicity';
import { voicingHz } from './pitch';
import { DEFAULT_TIMBRE } from './timbre';
import type { Timbre, Voicing } from './types';

export interface ScoreOptions {
  /** Playback timbre (default `DEFAULT_TIMBRE`); drives interference only. The harmonicity template is fixed. */
  timbre?: Timbre;
  /** Passed to `interference`. */
  mergeCoincident?: boolean;
  /** Passed to `periodicity`. */
  periodicity?: PeriodicityOptions;
  /** Passed to both harmonicity calls (`space` is set by `scoreVoicing`). */
  harmonicity?: Omit<HarmonicityOptions, 'space'>;
  /** Compute the per-note marginals (default true); false skips them (they are then empty). */
  decompose?: boolean;
}

export interface VoicingScores {
  /** The voicing's absolute frequencies, in input order. */
  freqsHz: number[];
  interference: { hutchinsonKnopoff: InterferenceResult; sethares: InterferenceResult };
  periodicity: PeriodicityResult & { perNote: number[] };
  harmonicity: {
    pitchClass: HarmonicityResult & { perNote: number[] };
    /** This arc's pitch-space extension (see `harmonicity`). */
    pitch: HarmonicityResult & { perNote: number[] };
  };
}

/** Marginal of each note: `score(all) - score(all without that note)` (a one-note chord's rest scores 0). */
export function perNoteMarginal(
  freqsHz: readonly number[],
  score: (f: readonly number[]) => number
): number[] {
  const all = score(freqsHz);
  return freqsHz.map((_, i) => {
    const rest = freqsHz.filter((__, j) => j !== i);
    return all - (rest.length === 0 ? 0 : score(rest));
  });
}

/** Every score of a voicing: both interference models, periodicity, harmonicity in both spaces. */
export function scoreVoicing(voicing: Voicing, opts: ScoreOptions = {}): VoicingScores {
  const { timbre: t = DEFAULT_TIMBRE, mergeCoincident, decompose = true } = opts;
  const freqsHz = voicingHz(voicing);
  const per = opts.periodicity;
  const harm = (space: 'pitch-class' | 'pitch') => {
    const o: HarmonicityOptions = { ...opts.harmonicity, space };
    const r = harmonicity(freqsHz, o);
    return {
      ...r,
      perNote: decompose ? perNoteMarginal(freqsHz, (f) => harmonicity(f, o).value) : [],
    };
  };
  const p = periodicity(freqsHz, per);
  return {
    freqsHz,
    interference: {
      hutchinsonKnopoff: interference(freqsHz, t, {
        model: 'hutchinson-knopoff',
        mergeCoincident,
        decompose,
      }),
      sethares: interference(freqsHz, t, { model: 'sethares', mergeCoincident, decompose }),
    },
    periodicity: {
      ...p,
      perNote: decompose ? perNoteMarginal(freqsHz, (f) => periodicity(f, per).value) : [],
    },
    harmonicity: { pitchClass: harm('pitch-class'), pitch: harm('pitch') },
  };
}

/** Keys of the flat score record. */
export const SCORE_KEYS = [
  'interference',
  'interferenceSethares',
  'worstRelation',
  'periodicity',
  'harmonicityPc',
  'harmonicityPitch',
] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];

/** Which direction is better for each flat score (interference, worst relation, periodicity: lower). */
export const SCORE_SENSE: Record<ScoreKey, 'min' | 'max'> = {
  interference: 'min',
  interferenceSethares: 'min',
  worstRelation: 'min',
  periodicity: 'min',
  harmonicityPc: 'max',
  harmonicityPitch: 'max',
};

/** The headline numbers of `scoreVoicing` as one flat record, for ranking and plotting. */
export function flatScores(s: VoicingScores): Record<ScoreKey, number> {
  return {
    interference: s.interference.hutchinsonKnopoff.total,
    interferenceSethares: s.interference.sethares.total,
    worstRelation: s.interference.hutchinsonKnopoff.worst,
    periodicity: s.periodicity.value,
    harmonicityPc: s.harmonicity.pitchClass.value,
    harmonicityPitch: s.harmonicity.pitch.value,
  };
}
