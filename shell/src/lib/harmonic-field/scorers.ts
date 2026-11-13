/**
 * Chord scorers. Every scorer maps a chord (frequencies in Hz) to a number where LOWER = better (more consonant).
 * This file holds the Infinitone-parity periodicity scorer; the other scorers are added in a later milestone.
 */

/** A scorer's answer: the number the retuner compares, and free-form detail for the "why" table. */
export interface ScoreResult {
  score: number;
  detail?: Record<string, unknown>;
}

export interface PeriodicityInfinitoneOpts {
  /** Window length in seconds (Infinitone: 0.1). */
  dur?: number;
  /** Sample rate in Hz (Infinitone hard-codes 44100, not the host rate). */
  sr?: number;
  /** Grid cells per axis over [-1, 1] (Infinitone: 100). */
  bins?: number;
}

/**
 * Infinitone 2 "acoustic score" (behavioural reconstruction, see notes/AUTORETUNER.md in the Infinitone repo).
 * Sum N pure sines of amplitude 1/N as a complex signal z(t) = sum (1/N) e^(i 2 pi f t) for t = 0 .. dur at 1/sr
 * steps (phase accumulated in float32, as Infinitone does), lay a bins x bins grid over [-1, 1]^2 and count the
 * cells z(t) lands in. Fewer cells = the curve retraces itself = more periodic = more consonant.
 *
 * Properties kept on purpose: the window is fixed at `dur`, so the score depends on absolute pitch (a low chord
 * is sampled densely and fills more cells; a high chord is sampled sparsely and fills fewer); pure sines only.
 * `score` is the cell count; an empty chord scores 999999 like Infinitone.
 */
export function scorePeriodicityInfinitone(
  freqs: readonly number[],
  opts: PeriodicityInfinitoneOpts = {}
): ScoreResult {
  const { dur = 0.1, sr = 44100, bins = 100 } = opts;
  const n = freqs.length;
  if (n === 0) {
    return { score: 999999, detail: { cells: 0, samples: 0, empty: true } };
  }
  const a = 1 / n;
  const dt = 1 / sr;
  const ph = new Float32Array(n);
  const seen = new Set<number>();
  const cell = 2 / bins;
  let samples = 0;
  for (let t = 0; t < dur; t += dt) {
    let x = 0;
    let y = 0;
    for (let i = 0; i < n; i++) {
      ph[i] += freqs[i] * 2 * Math.PI * dt;
      x += Math.cos(ph[i]) * a;
      y += Math.sin(ph[i]) * a;
    }
    const cx = Math.floor((x + 1) / cell);
    const cy = Math.floor((y + 1) / cell);
    seen.add(cx * 100003 + cy);
    samples++;
  }
  return { score: seen.size, detail: { cells: seen.size, samples, dur, sr, bins } };
}
