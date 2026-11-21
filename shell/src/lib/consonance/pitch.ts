import type { Voicing } from './types';

/** Concert pitch A4 (MIDI 69). */
export const A4_HZ = 440;

/** Frequency of a pitch `cents` above `refHz`. */
export function centsToHz(refHz: number, cents: number): number {
  return refHz * 2 ** (cents / 1200);
}

/** Cents of `hz` above `refHz`. */
export function hzToCents(hz: number, refHz: number): number {
  return 1200 * Math.log2(hz / refHz);
}

/** MIDI note number (fractional) of a frequency, A4 = 69 = 440 Hz. */
export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / A4_HZ);
}

/** Frequency of a (fractional) MIDI note number, A4 = 69 = 440 Hz. */
export function midiToHz(midi: number): number {
  return A4_HZ * 2 ** ((midi - 69) / 12);
}

/** Absolute frequencies of a voicing, in the order of `cents`. */
export function voicingHz(v: Voicing): number[] {
  return v.cents.map((c) => centsToHz(v.refHz, c));
}

/** A voicing from EDO steps: `steps * 1200 / edo` cents above `refHz`. */
export function voicingFromSteps(refHz: number, steps: readonly number[], edo: number): Voicing {
  return { refHz, cents: steps.map((s) => (s * 1200) / edo) };
}

/** `x mod m` with the sign of `m` (R's `%%`). */
export function mod(x: number, m: number): number {
  return x - Math.floor(x / m) * m;
}

/** Round half to even, as R's `round()` does. */
export function roundHalfEven(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/** Throw on a non-positive or non-finite frequency (every score needs real frequencies). */
export function assertFreqs(freqsHz: readonly number[]): void {
  for (const f of freqsHz) {
    if (!(f > 0) || !Number.isFinite(f)) {
      throw new RangeError(`consonance: frequencies must be positive finite numbers, got ${f}`);
    }
  }
}
