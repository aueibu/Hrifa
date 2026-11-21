/**
 * Modes on the linear ring. Rotation (ring.ts `rotateRing`) shifts slots and keeps L.
 * Re-rooting (here) divides every ratio by a new root and octave-reduces, so each mode gets
 * its own LCD and its own ring.
 */
import { lcmAll, rerootRatios, type Ratio } from './ratios';
import { gapsOf, linearRing, ringHarmonics, type Ring } from './ring';

export interface Mode {
  root: Ratio;
  /** Ratios above the new root, ascending, starting at 1/1. */
  ratios: Ratio[];
  ring: Ring;
  gaps: number[];
}

/** Re-root the set on one of its ratios. Null if the ring would not fit a safe integer. */
export function rerootMode(rs: Ratio[], root: Ratio): Mode | null {
  const ratios = rerootRatios(rs, root);
  const ring = linearRing(ratios);
  if (!ring) {
    return null;
  }
  return { root, ratios, ring, gaps: gapsOf(ring.slots, ring.L) };
}

/** Every re-rooting, in the order of the input ratios (the canon's Canon 3 table, 1/1 first). */
export function modeTable(rs: Ratio[]): Mode[] {
  const out: Mode[] = [];
  for (const root of rs) {
    const m = rerootMode(rs, root);
    if (m) {
      out.push(m);
    }
  }
  return out;
}

/** The fingerprint: the ring size of every mode, in root order. A complete invariant of the scale. */
export function fingerprint(rs: Ratio[]): number[] {
  return modeTable(rs).map((m) => m.ring.L);
}

function oddPart(n: number): number {
  let x = n;
  while (x % 2 === 0) {
    x /= 2;
  }
  return x;
}

/** Odd-harmonic form: the sorted distinct odd parts of the harmonics L..2L of the 1/1 ring. */
export function oddHarmonicForm(rs: Ratio[]): number[] | null {
  const ring = linearRing(rs);
  if (!ring) {
    return null;
  }
  return [...new Set(ringHarmonics(ring).map(oddPart))].sort((a, b) => a - b);
}

/** Common grid for equal cycles: the LCM of the mode ring sizes (6,480 for the worked example). */
export function commonGrid(rs: Ratio[]): bigint {
  return lcmAll(fingerprint(rs).map(BigInt));
}

export interface EqualCyclesMode {
  root: Ratio;
  /** The mode's own ring size. */
  L: number;
  /** Onsets on the common grid (every cycle lasts the same time). */
  slots: number[];
}

/**
 * Equal cycles: every mode lasts one cycle; onset time = (ratio above the root - 1) x cycle.
 * Null when the common grid would not fit a safe integer (use `commonGrid` for its exact size).
 */
export function equalCycles(rs: Ratio[]): { grid: number; modes: EqualCyclesMode[] } | null {
  const modes = modeTable(rs);
  const gridBig = lcmAll(modes.map((m) => BigInt(m.ring.L)));
  if (gridBig > BigInt(Number.MAX_SAFE_INTEGER)) {
    return null;
  }
  const grid = Number(gridBig);
  return {
    grid,
    modes: modes.map((m) => ({
      root: m.root,
      L: m.ring.L,
      slots: m.ring.slots.map((s) => Number((BigInt(s) * gridBig) / BigInt(m.ring.L))),
    })),
  };
}

export interface EqualPulseMode {
  root: Ratio;
  /** Unhalved harmonic number of the root: root ratio x L of the 1/1 ring. */
  rootHarmonic: number;
  /** Cycle length in tatums (the mode rooted on rho lasts rho times the 1/1 mode). */
  length: number;
  /** Onsets in tatums from the mode's root (the tatum stays at the virtual fundamental). */
  slots: number[];
}

/** Equal pulse: the tatum is fixed, the mode rooted on rho lasts rho times as long (72, 80, 81, 90, 108). */
export function equalPulse(rs: Ratio[]): EqualPulseMode[] | null {
  const ring = linearRing(rs);
  if (!ring) {
    return null;
  }
  const L0 = BigInt(ring.L);
  const harmonics = rs.map((r) => Number((r.n * L0) / r.d));
  return rs.map((root) => {
    const rootHarmonic = Number((root.n * L0) / root.d);
    const slots = harmonics
      .map((h) => (h >= rootHarmonic ? h : 2 * h) - rootHarmonic)
      .sort((a, b) => a - b);
    return { root, rootHarmonic, length: rootHarmonic, slots };
  });
}
