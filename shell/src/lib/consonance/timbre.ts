import type { Timbre } from './types';

/**
 * A harmonic timbre with `partials` harmonics of amplitude 1 / n^rolloff (n = 1..partials).
 * This is the convention of `hrep::expand_harmonics` (R, MIT, Harrison), which `dycon` and `incon` use:
 * `num_harmonics` -> `partials`, `roll_off` -> `rolloff`, amplitude `1 / n^roll_off`.
 */
export function timbre({ partials, rolloff }: { partials: number; rolloff: number }): Timbre {
  if (!Number.isInteger(partials) || partials < 1) {
    throw new RangeError('timbre: partials must be an integer >= 1');
  }
  return {
    partials,
    rolloff,
    amps: Array.from({ length: partials }, (_, i) => 1 / (i + 1) ** rolloff),
  };
}

/** A timbre from explicit harmonic amplitudes (index 0 = fundamental); `rolloff` is the nominal exponent. */
export function timbreFromAmps(amps: readonly number[], rolloff = 1): Timbre {
  if (amps.length < 1 || amps.some((a) => !(a >= 0) || !Number.isFinite(a))) {
    throw new RangeError(
      'timbreFromAmps: amps must be a non-empty list of finite non-negative numbers'
    );
  }
  return { partials: amps.length, rolloff, amps: [...amps] };
}

/** The default timbre of `incon` (interference only: the harmonicity template is fixed, see `harmonicity`) (Harrison & Pearce 2020): 11 harmonics, roll-off 1. */
export const DEFAULT_TIMBRE: Timbre = timbre({ partials: 11, rolloff: 1 });

/** Harmonic amplitudes of the page's additive piano (`sonify.ts`, PIANO_HARMONICS). */
const PIANO_AMPS = [1, 0.55, 0.3, 0.18, 0.1, 0.06];

/**
 * Presets named after the page's playback timbres (`src/pages/interval-placement/sonify.ts`). The `sine`, `triangle`
 * and `piano` spectra are exact (a triangle oscillator has odd harmonics at 1/n^2); `guitar` is a Karplus-Strong
 * pluck whose real spectrum is not fixed, so it is approximated by 10 harmonics at 1/n^1.5. For `piano` and
 * `triangle`, `rolloff` is a nominal log-log slope used only by the harmonicity template.
 */
export const TIMBRES: Record<'sine' | 'triangle' | 'piano' | 'guitar', Timbre> = {
  sine: { partials: 1, rolloff: 1, amps: [1] },
  triangle: {
    partials: 11,
    rolloff: 2,
    amps: Array.from({ length: 11 }, (_, i) => ((i + 1) % 2 === 1 ? 1 / (i + 1) ** 2 : 0)),
  },
  piano: { partials: PIANO_AMPS.length, rolloff: 1.5, amps: PIANO_AMPS },
  guitar: timbre({ partials: 10, rolloff: 1.5 }),
};
