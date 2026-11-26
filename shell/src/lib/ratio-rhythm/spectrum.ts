/**
 * Interval content and the Fourier view of a rhythm on a ring of L slots (Canon 6).
 *  - folded distance counts (d = min(d, L - d)): what Z-partners share, the rhythm's interval vector;
 *  - the per-step spectrum (unfolded sizes for each generic step): the lab's `SpectrumRow` shape,
 *    on integer slots, with the lab's propriety rule;
 *  - DFT strengths and phases (j beats per cycle).
 *
 * Pitch-domain counterpart: the interval vector and Z-relation (distance histogram), the interval
 * spectrum and propriety of a scale, and the harmonic j of a tone (same strengths, different phase:
 * same timbre, different waveform).
 */

/** A size and how many times it occurs. */
export interface SizeCount {
  size: number;
  count: number;
}

/** The lab's row shape: for generic step k, the sizes (ascending, with counts) and how many differ. */
export interface SpectrumRow {
  k: number;
  sizes: SizeCount[];
  variety: number;
}

/** Folded distance counts c[d], d = 0..floor(L/2): pairs of onsets at circular distance d. */
export function distanceCounts(slots: number[], L: number): number[] {
  const H = L >> 1;
  const c: number[] = new Array(H + 1).fill(0);
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const d = Math.abs(slots[i] - slots[j]) % L;
      c[Math.min(d, L - d)]++;
    }
  }
  return c;
}

/** The folded distance counts as sizes (`2 ×1, 3 ×2`): only distances that occur, ascending. */
export function foldedDistances(slots: number[], L: number): SizeCount[] {
  const c = distanceCounts(slots, L);
  const out: SizeCount[] = [];
  c.forEach((count, size) => {
    if (count > 0 && size > 0) {
      out.push({ size, count });
    }
  });
  return out;
}

/** Lab chips as text: `2 ×1, 3 ×2` (size, space, ×count, comma separated, ascending). */
export function fmtChips(sizes: SizeCount[]): string {
  return sizes.map((s) => `${s.size} ×${s.count}`).join(', ');
}

/**
 * Per generic step k = 1..k-1: every onset to the onset k places later around the cycle
 * (wrapping adds L), grouped by size. `3-3-2` on 8: 1st step `2 ×1, 3 ×2`, 2nd step `5 ×2, 6 ×1`.
 * Fewer than 2 onsets gives [].
 */
export function intervalSpectrum(slots: number[], L: number): SpectrumRow[] {
  const A = [...slots].sort((a, b) => a - b);
  const N = A.length;
  const out: SpectrumRow[] = [];
  for (let k = 1; k < N; k++) {
    const counts = new Map<number, number>();
    for (let i = 0; i < N; i++) {
      const j = i + k;
      const v = j < N ? A[j] - A[i] : A[j - N] + L - A[i];
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const sizes = [...counts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([size, count]) => ({ size, count }));
    out.push({ k, sizes, variety: sizes.length });
  }
  return out;
}

export interface ProprietyPair {
  k: number;
  /** A size of the k-step interval. */
  a: number;
  /** A size of the (k+1)-step interval that is smaller than `a`. */
  b: number;
}

export interface Propriety {
  verdict: 'strictly proper' | 'proper' | 'improper';
  /** Clashes: a k-step size larger than a (k+1)-step size. */
  pairs: ProprietyPair[];
}

/**
 * Rothenberg propriety on slots, the lab's rule: compare every k-step size with every (k+1)-step
 * size. A k-step larger than a (k+1)-step is a clash (improper); an equal pair makes it proper
 * but not strict; otherwise strictly proper. Slots are integers, so the tolerance is exact.
 */
export function propriety(spectrum: SpectrumRow[]): Propriety {
  const pairs: ProprietyPair[] = [];
  let equal = false;
  for (let i = 0; i + 1 < spectrum.length; i++) {
    const A = spectrum[i];
    const B = spectrum[i + 1];
    for (const a of A.sizes) {
      for (const b of B.sizes) {
        if (a.size > b.size) {
          pairs.push({ k: A.k, a: a.size, b: b.size });
        } else if (a.size === b.size) {
          equal = true;
        }
      }
    }
  }
  return { verdict: pairs.length ? 'improper' : equal ? 'proper' : 'strictly proper', pairs };
}

/** Display label: proper / strictly proper / not proper. */
export function proprietyLabel(p: Propriety): string {
  return p.verdict === 'improper' ? 'not proper' : p.verdict;
}

/** A maximally even rhythm has at most two sizes at every generic step. */
export function hasTwoSizesPerStep(spectrum: SpectrumRow[]): boolean {
  return spectrum.every((r) => r.variety <= 2);
}

export interface Harmonic {
  j: number;
  mag: number;
  /** Radians, atan2(im, re) of sum exp(-2 pi i j x / L). */
  phase: number;
}

/** DFT coefficient j of the onsets on a ring of L: strength and phase. */
export function dft(slots: number[], L: number, j: number): Harmonic {
  let re = 0;
  let im = 0;
  for (const x of slots) {
    const a = (2 * Math.PI * ((j * x) % L)) / L;
    re += Math.cos(a);
    im -= Math.sin(a);
  }
  return { j, mag: Math.hypot(re, im), phase: Math.atan2(im, re) };
}

/** Strengths for j = 1..floor(L/2): the ring's independent values (Nyquist limit). */
export function spectrum(slots: number[], L: number): Harmonic[] {
  const out: Harmonic[] = [];
  for (let j = 1; j <= L >> 1; j++) {
    out.push(dft(slots, L, j));
  }
  return out;
}

/** Same number of onsets and equal DFT magnitudes for every j (within `tol`): homometric, same distance counts. */
export function sameMagnitudes(a: number[], b: number[], L: number, tol = 1e-9): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let j = 1; j <= L >> 1; j++) {
    if (Math.abs(dft(a, L, j).mag - dft(b, L, j).mag) > tol) {
      return false;
    }
  }
  return true;
}
