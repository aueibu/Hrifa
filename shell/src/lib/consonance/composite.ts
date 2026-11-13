/**
 * The composite consonance model of Harrison & Pearce (2020, "Simultaneous consonance in music perception and
 * composition", Psychological Review 127(2), 216-244, https://doi.org/10.1037/rev0000169), as implemented in the R
 * package `incon` (`har_19_composite`, MIT, Harrison): a linear regression on RAW feature values (Table 2 of the
 * paper, unstandardised coefficients):
 *
 *   consonance = 0.628 + 0.422 * (number of distinct pitch classes) - 1.620 * roughness (Hutchinson & Knopoff)
 *                + 1.780 * harmonicity (har18, pitch-class) - 0.089 * culture
 *
 * The culture (corpus familiarity) term is OMITTED here (no corpus model in this library, a non-goal of the arc), so the
 * value is the composite without it. The chord-size term is off by default, as in `incon` (it is thought to come from a
 * confound in the Bowling et al. data); enable it with `{chordSize: true}`.
 */
import { harmonicity, distinctPitchClasses } from './harmonicity';
import { interference } from './interference';
import { DEFAULT_TIMBRE } from './timbre';
import type { Timbre } from './types';

/** `incon::har_19_composite_coef`. */
export const INCON_COEFFICIENTS = {
  intercept: 0.628434666589357,
  chordSize: 0.422267698605598,
  interference: -1.62001025973261,
  harmonicity: 1.77992362857478,
  /** Not used by this library. */
  culture: -0.0892234643584134,
} as const;

/** The composite from raw feature values (higher = more consonant). `chordSize` is the number of distinct pitch classes. */
export function inconComposite(
  features: { interference: number; harmonicity: number; chordSize?: number },
  opts: { chordSize?: boolean } = {}
): number {
  const c = INCON_COEFFICIENTS;
  return (
    c.intercept +
    (opts.chordSize ? c.chordSize * (features.chordSize ?? 0) : 0) +
    c.interference * features.interference +
    c.harmonicity * features.harmonicity
  );
}

/**
 * The composite of a chord of absolute frequencies: raw Hutchinson & Knopoff `total` (timbre as `incon`: default 11
 * harmonics at 1/n) and raw pitch-class harmonicity. No culture term.
 */
export function inconCompositeOfFreqs(
  freqsHz: readonly number[],
  opts: { chordSize?: boolean; timbre?: Timbre } = {}
): number {
  return inconComposite(
    {
      interference: interference(freqsHz, opts.timbre ?? DEFAULT_TIMBRE, { decompose: false })
        .total,
      harmonicity: harmonicity(freqsHz).value,
      chordSize: distinctPitchClasses(freqsHz),
    },
    opts
  );
}
