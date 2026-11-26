/**
 * Rings: the linear (otonal) reading, the log reading, the rates reading, gaps,
 * rotation and onset statistics. Slots are integers counted from 0.
 */
import { ratioNote } from '../harmonic-field/intervals';
import { gcdAll, lcdOf, lcmAll, makeRatio, type Ratio } from './ratios';

/** A ring of L slots with onsets at the sorted integer slots (the root is slot 0). */
export interface Ring {
  L: number;
  slots: number[];
}

export interface BigRing {
  L: bigint;
  slots: bigint[];
}

/** Linear reading in bigint, safe for any LCD: slot(r) = (r.n - r.d) * L / r.d. */
export function linearRingBig(rs: Ratio[]): BigRing {
  const L = lcdOf(rs);
  const slots = rs.map((r) => (r.n - r.d) * (L / r.d)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { L, slots };
}

/** Linear reading as plain numbers; null when L does not fit a safe integer. */
export function linearRing(rs: Ratio[]): Ring | null {
  const big = linearRingBig(rs);
  if (big.L > BigInt(Number.MAX_SAFE_INTEGER)) {
    return null;
  }
  return { L: Number(big.L), slots: big.slots.map(Number) };
}

/** The ratio at a slot of a ring: (L + s) / L in lowest terms. */
export function slotRatio(L: number | bigint, s: number | bigint): Ratio {
  const l = BigInt(L);
  return makeRatio(l + BigInt(s), l) as Ratio;
}

export function ringRatios(ring: Ring): Ratio[] {
  return ring.slots.map((s) => slotRatio(ring.L, s));
}

/** Harmonic numbers L + s: the ring is harmonics L to 2L of a virtual fundamental. */
export function ringHarmonics(ring: Ring): number[] {
  return ring.slots.map((s) => ring.L + s);
}

export interface IntegerRing {
  /** Ring size after the GCD reduction. */
  L: number;
  slots: number[];
  /** The factor everything was divided by (1 when already minimal). */
  factor: number;
  /** The reduced harmonic numbers L + s (24:28:32:36:44 on 24 becomes 6:7:8:9:11). */
  harmonics: number[];
}

/** An integer ring handed over as harmonics on a base (24:28:32:36:44 on 24), reduced by the GCD of slots and L. */
export function integerRing(harmonics: number[], base: number): IntegerRing {
  const slots = harmonics.map((h) => h - base).sort((a, b) => a - b);
  const g = Number(gcdAll([BigInt(base), ...slots.map(BigInt)]));
  const L = base / g;
  const reduced = slots.map((s) => s / g);
  return { L, slots: reduced, factor: g, harmonics: reduced.map((s) => L + s) };
}

export interface LogOnset {
  slot: number;
  ratios: Ratio[];
}

export interface LogRing {
  L: number;
  onsets: LogOnset[];
}

/** Log reading: round cents / 1200 * N to the nearest step (equave 2/1); ratios on one step merge. */
export function logRing(rs: Ratio[], N: number): LogRing {
  const m = new Map<number, Ratio[]>();
  for (const r of rs) {
    const pos = (ratioNote(r.n, r.d).c / 1200) * N;
    const s = ((Math.round(pos) % N) + N) % N;
    const list = m.get(s);
    if (list) {
      list.push(r);
    } else {
      m.set(s, [r]);
    }
  }
  return {
    L: N,
    onsets: [...m.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([slot, ratios]) => ({ slot, ratios })),
  };
}

export interface RatesGrid {
  /** Integer form of the rates: each ratio over the common denominator. */
  pulses: bigint[];
  /** LCM of the integer form: the common grid. */
  slots: bigint;
  /** Distinct onset positions on that grid (one cycle). */
  occupied: number;
}

/** Rates reading: each ratio is a pulse rate. Pass ratios as given (not octave-reduced). */
export function ratesGrid(rs: Ratio[]): RatesGrid {
  const D = lcdOf(rs);
  const pulses = rs.map((r) => r.n * (D / r.d));
  const slots = lcmAll(pulses);
  return { pulses, slots, occupied: Number(occupiedCount(pulses, slots)) };
}

/**
 * Distinct positions in one cycle of M slots hit by pulses of the given rates, counted
 * exactly by inclusion-exclusion (pulse p hits the multiples of M/p; a subset of pulses
 * coincides on the multiples of the LCM of their steps). Never enumerates the grid, so huge
 * grids are fine; cost is 2^(distinct rates), and the parser caps the set size.
 */
function occupiedCount(pulses: bigint[], M: bigint): bigint {
  const steps = [...new Set(pulses.map((p) => M / p))];
  let total = 0n;
  const walk = (from: number, acc: bigint, size: number): void => {
    for (let i = from; i < steps.length; i++) {
      const l = lcmAll([acc, steps[i]]);
      const count = M / l;
      total += size % 2 === 0 ? count : -count;
      walk(i + 1, l, size + 1);
    }
  };
  walk(0, 1n, 0);
  return total;
}

/** Gaps (IOIs) between consecutive onsets, wrapping; they sum to L. */
export function gapsOf(slots: number[], L: number): number[] {
  return slots.map((a, i) => (i + 1 < slots.length ? slots[i + 1] : L + slots[0]) - a);
}

/** Onsets from gaps, starting at slot 0. */
export function slotsOfGaps(gaps: number[]): number[] {
  const out: number[] = [];
  let s = 0;
  for (const g of gaps) {
    out.push(s);
    s += g;
  }
  return out;
}

/**
 * Rotation (rhythmic mode): shift every slot by a constant, mod L. Gaps keep their cyclic order
 * and the ring size does not change. Contrast `rerootMode` in modes.ts, which rescales.
 */
export function rotateRing(ring: Ring, shift: number): Ring {
  const { L } = ring;
  const slots = ring.slots.map((s) => (((s + shift) % L) + L) % L).sort((a, b) => a - b);
  return { L, slots };
}

/** Rotate so that onset index i sits on slot 0. */
export function rotateToOnset(ring: Ring, i: number): Ring {
  return rotateRing(ring, -ring.slots[i]);
}

/** Reduce a ring by the GCD of its slots and L (the ring is already minimal for reduced ratios). */
export function minimalRing(ring: Ring): Ring & { factor: number } {
  const g = Number(gcdAll([BigInt(ring.L), ...ring.slots.map(BigInt)]));
  return { L: ring.L / g, slots: ring.slots.map((s) => s / g), factor: g };
}

export interface OnsetStats {
  k: number;
  L: number;
  gaps: number[];
  minIoi: number;
  maxIoi: number;
  /** k / L */
  density: number;
  /** min IOI divided by the tatum (1 slot). */
  oversampling: number;
  /** Population variance of the gaps (the mean is always L / k). */
  variance: number;
  distinctGaps: number;
}

export function onsetStats(ring: Ring): OnsetStats {
  const gaps = gapsOf(ring.slots, ring.L);
  const k = gaps.length;
  const mean = ring.L / k;
  return {
    k,
    L: ring.L,
    gaps,
    minIoi: Math.min(...gaps),
    maxIoi: Math.max(...gaps),
    density: k / ring.L,
    oversampling: Math.min(...gaps),
    variance: gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / k,
    distinctGaps: new Set(gaps).size,
  };
}
