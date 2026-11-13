import { hzToMidi, midiToHz } from './pitch';
import type { Timbre } from './types';

/** One sinusoidal partial. After merging, `shares` says how much of its energy each source note contributed. */
export interface Partial {
  /** Frequency in Hz. */
  f: number;
  /** Amplitude. */
  a: number;
  /** Source notes: `share` is the fraction of the partial's squared amplitude (sums to 1). */
  shares: { note: number; share: number }[];
}

/** Two partials closer than this many semitones are the same partial (`hrep` rounds to 6 digits). */
const COINCIDENT_SEMITONES = 1e-6;

/**
 * The partials of a chord: each note gets the timbre's harmonics (n * f, amplitude `timbre.amps[n - 1]`).
 * With `merge` (the default, as `hrep::expand_harmonics` does) partials of different notes that coincide in pitch
 * (to 1e-6 semitone) become one partial whose amplitude is the root of the sum of squares (incoherent sum,
 * `hrep::sum_amplitudes(coherent = FALSE)`); `shares` keeps the attribution. Sorted by frequency.
 */
export function buildSpectrum(freqsHz: readonly number[], t: Timbre, merge = true): Partial[] {
  const raw: Partial[] = [];
  freqsHz.forEach((f0, note) => {
    t.amps.forEach((a, k) => {
      if (a > 0) {
        raw.push({ f: f0 * (k + 1), a, shares: [{ note, share: 1 }] });
      }
    });
  });
  raw.sort((x, y) => x.f - y.f);
  if (!merge) {
    return raw;
  }
  const out: Partial[] = [];
  let lastMidi = Number.NEGATIVE_INFINITY;
  for (const p of raw) {
    const midi = hzToMidi(p.f);
    const last = out[out.length - 1];
    if (last && midi - lastMidi < COINCIDENT_SEMITONES) {
      const e1 = last.a * last.a;
      const e2 = p.a * p.a;
      const e = e1 + e2;
      const shares = new Map<number, number>();
      for (const s of last.shares) {
        shares.set(s.note, (shares.get(s.note) ?? 0) + s.share * e1);
      }
      for (const s of p.shares) {
        shares.set(s.note, (shares.get(s.note) ?? 0) + s.share * e2);
      }
      last.shares = [...shares].map(([note, w]) => ({ note, share: w / e }));
      last.a = Math.sqrt(e);
      last.f = midiToHz(lastMidi);
    } else {
      out.push({ f: p.f, a: p.a, shares: p.shares.map((s) => ({ ...s })) });
      lastMidi = midi;
    }
  }
  return out;
}
