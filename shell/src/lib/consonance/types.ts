/** Shared types for the consonance library. Pure TypeScript: no React, no DOM, no fs. */

/**
 * A voicing: notes as cents above an absolute reference pitch, plus the reference in Hz (decision I-2).
 * `cents` need not be sorted. EDO steps are an input convenience (`steps * 1200 / edo`); Hz and midicents are derived
 * only at the edge.
 */
export interface Voicing {
  /** Absolute frequency of cents = 0, in Hz. */
  refHz: number;
  /** Each note's distance above `refHz`, in cents. */
  cents: number[];
}

/**
 * A tone colour as the amplitudes of harmonics 1, 2, 3, ... (`amps[0]` is the fundamental; a 0 means the harmonic is
 * absent). Used by interference only; the harmonicity template is a fixed perceptual default (see `harmonicity`).
 * `partials` and `rolloff` describe the parametric form (amplitude 1 / n^rolloff); for the presets built from an
 * explicit amplitude list, `amps` is authoritative and `rolloff` is nominal.
 */
export interface Timbre {
  /** Number of harmonics the tone is modelled with. */
  partials: number;
  /** Nominal roll-off exponent: harmonic n has amplitude 1 / n^rolloff in the parametric timbres. */
  rolloff: number;
  /** Amplitude of harmonic n + 1 at index n. */
  amps: readonly number[];
}

/** The two interference models. */
export type InterferenceModel = 'hutchinson-knopoff' | 'sethares';

/** Pitch representation in which harmonicity is computed. */
export type HarmonicitySpace = 'pitch-class' | 'pitch';
