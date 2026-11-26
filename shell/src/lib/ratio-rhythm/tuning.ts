/**
 * Tempering (log ring, vals) and quantization (linear ring, rounding onto a coarser grid).
 */
import { factorInt } from '../harmonic-field/intervals';
import type { Ratio } from './ratios';
import type { Ring } from './ring';

/** The val of prime p in N steps per octave: round(N log2 p); 2 maps to N exactly. */
export function valOf(prime: number, N: number): number {
  return prime === 2 ? N : Math.round(N * Math.log2(prime));
}

/**
 * Steps a ratio maps to in N-EDO under the patent val, as a signed value:
 * the sum of exponent times val over the prime factorization of n/d. A comma n/d with n > d
 * that vanishes gives 0; a comma that stays one step wide gives +1 (the sign follows n/d).
 */
export function ratioSteps(r: Ratio, N: number): number {
  const top = factorInt(r.n);
  const bottom = factorInt(r.d);
  let steps = 0;
  for (const p in top) {
    steps += top[p] * valOf(Number(p), N);
  }
  for (const p in bottom) {
    steps -= bottom[p] * valOf(Number(p), N);
  }
  return steps;
}

/** True when the comma maps to 0 steps (it is tempered out). */
export function temperedOut(comma: Ratio, N: number): boolean {
  return ratioSteps(comma, N) === 0;
}

export type TieRule = 'up' | 'down';

/** Raw target of a slot on a grid of N: round(p N / L), halves by `tie`. Not reduced mod N. */
export function quantizeSlot(slot: number, L: number, N: number, tie: TieRule = 'up'): number {
  const num = slot * N;
  const q0 = Math.floor(num / L);
  const rem = num - q0 * L;
  const up = 2 * rem > L || (2 * rem === L && tie === 'up');
  return up ? q0 + 1 : q0;
}

export interface Quantization {
  N: number;
  tie: TieRule;
  /** Target slots mod N, one per onset in order. */
  targets: number[];
  /** Onsets that land with zero error. */
  exact: boolean[];
  /** Signed error per onset as a fraction of the cycle: slot / L - target / N. */
  errors: number[];
  exactCount: number;
  /** Number of distinct target slots. */
  distinct: number;
  /** H(source | target) = sum (n_j / k) log2 n_j. */
  bitsLost: number;
  /** Sum of |error|, in cycles. */
  totalDisplacement: number;
  /** Root mean square of the error, in cycles. */
  rmsDisplacement: number;
  /** Onsets that sat exactly on a half step. */
  ties: number;
}

export function bitsLost(targets: number[]): number {
  const counts = new Map<number, number>();
  for (const t of targets) {
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  let h = 0;
  for (const n of counts.values()) {
    h += (n / targets.length) * Math.log2(n);
  }
  return h;
}

export function quantize(ring: Ring, N: number, tie: TieRule = 'up'): Quantization {
  const { L } = ring;
  const targets: number[] = [];
  const exact: boolean[] = [];
  const errors: number[] = [];
  let ties = 0;
  for (const s of ring.slots) {
    const raw = quantizeSlot(s, L, N, tie);
    const rem = (s * N) % L;
    if (2 * rem === L) {
      ties++;
    }
    targets.push(((raw % N) + N) % N);
    exact.push(rem === 0);
    errors.push(s / L - raw / N);
  }
  const k = ring.slots.length;
  return {
    N,
    tie,
    targets,
    exact,
    errors,
    exactCount: exact.filter(Boolean).length,
    distinct: new Set(targets).size,
    bitsLost: bitsLost(targets),
    totalDisplacement: errors.reduce((a, e) => a + Math.abs(e), 0),
    rmsDisplacement: Math.sqrt(errors.reduce((a, e) => a + e * e, 0) / k),
    ties,
  };
}

/** Does the whole ring keep every onset distinct on a grid of N, with halves rounded this way? */
export function keepsAll(ring: Ring, N: number, tie: TieRule): boolean {
  return quantize(ring, N, tie).distinct === ring.slots.length;
}

/** The tie rule: a grid keeps the ring only if it does so with halves rounded both up and down. */
export function keepsAllBothTies(ring: Ring, N: number): boolean {
  return keepsAll(ring, N, 'up') && keepsAll(ring, N, 'down');
}

/** Does the pair of slots a and b on a ring of L stay on different targets on a grid of N? */
export function pairKept(L: number, a: number, b: number, N: number, tie: TieRule): boolean {
  return quantizeSlot(a, L, N, tie) % N !== quantizeSlot(b, L, N, tie) % N;
}

/** Anchored pair rule (slots 0 and d on a ring of L): the pair survives iff N > L / (2d). Smallest such N. */
export function anchoredPairMinGrid(L: number, d: number): number {
  return Math.floor(L / (2 * d)) + 1;
}

/** The same threshold by scanning: smallest N from which the pair is kept (both tie rules) for every larger N up to L. */
export function scanPairMinGrid(L: number, d: number): number {
  let min = L + 1;
  for (let N = L; N >= 2; N--) {
    if (pairKept(L, 0, d, N, 'up') && pairKept(L, 0, d, N, 'down')) {
      min = N;
    } else {
      break;
    }
  }
  return min;
}

/**
 * Grids N in [from, to] that keep every onset in every given ring. `tie` is a rule, or 'both'
 * for the canon's tie rule (must hold with halves rounded up and down).
 */
export function gridsKeepingAll(
  rings: Ring[],
  from: number,
  to: number,
  tie: TieRule | 'both' = 'both'
): number[] {
  const out: number[] = [];
  for (let N = from; N <= to; N++) {
    const ok = rings.every((r) => (tie === 'both' ? keepsAllBothTies(r, N) : keepsAll(r, N, tie)));
    if (ok) {
      out.push(N);
    }
  }
  return out;
}
