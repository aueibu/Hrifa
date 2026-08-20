/** Pure ratio/rotation-set analysis — EDO quantization, distortion detection, rotation-derived sets. */

export function pcOf(v: number, edo: number): number {
  return ((Math.round(v * edo) % edo) + edo) % edo;
}

export function variance(arr: readonly number[]): number {
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
}

export function cyclicGaps(sorted: readonly number[]): number[] {
  const k = sorted.length;
  const g: number[] = [];
  for (let i = 0; i < k; i++) {
    g.push((i < k - 1 ? sorted[i + 1] : sorted[0] + 1) - sorted[i]);
  }
  return g;
}

/**
 * Compares the irregularity (variance) of the continuous gap sequence to the
 * quantized one. >>1 means quantization INDUCED artificial symmetry (an
 * artifact — raise EDO or work continuous); <<1 means quantization broke an
 * existing genuine symmetry; near 1 means little distortion either way.
 */
export function distortionScore(values: readonly number[], edo: number): number | null {
  if (values.length < 2) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const contGaps = cyclicGaps(sorted);
  const pcs = sorted.map((v) => pcOf(v, edo)).sort((a, b) => a - b);
  const quantGaps = cyclicGaps(pcs.map((p) => p / edo));
  const varC = variance(contGaps);
  const varQ = variance(quantGaps);
  if (varQ < 1e-9) {
    return varC < 1e-9 ? 1 : Infinity;
  }
  return varC / varQ;
}

export interface RotationSet {
  startValue: number;
  pcs: number[];
  intervals: number[];
  rows: number[][];
}

/**
 * Per rotation of the value list: take the PCs in that rotated order, compute
 * the non-cyclic interval structure between them (k-1 gaps, no wraparound),
 * then apply that SAME fixed structure starting from each of the k elements
 * within that rotation to produce k new PC sets.
 */
export function buildRotationSets(values: readonly number[], edo: number): RotationSet[] | null {
  const k = values.length;
  if (k < 2) {
    return null;
  }
  const pcsBase = values.map((v) => pcOf(v, edo));
  const rotations: RotationSet[] = [];
  for (let r = 0; r < k; r++) {
    const pcs = pcsBase.slice(r).concat(pcsBase.slice(0, r));
    const intervals: number[] = [];
    for (let i = 0; i < k - 1; i++) {
      intervals.push((((pcs[i + 1] - pcs[i]) % edo) + edo) % edo);
    }
    const rows = pcs.map((seed) => {
      const out = [seed];
      for (let i = 0; i < intervals.length; i++) {
        out.push((out[out.length - 1] + intervals[i]) % edo);
      }
      return out;
    });
    rotations.push({ startValue: values[r], pcs, intervals, rows });
  }
  return rotations;
}

export interface EdoSweepEntry {
  edo: number;
  safe: boolean;
  distinct: number;
}

export function edoSweep(
  values: readonly number[],
  minEdo: number,
  maxEdo: number
): EdoSweepEntry[] {
  const out: EdoSweepEntry[] = [];
  for (let e = minEdo; e <= maxEdo; e++) {
    const pcs = values.map((v) => pcOf(v, e));
    const distinct = new Set(pcs).size;
    out.push({ edo: e, safe: distinct === values.length, distinct });
  }
  return out;
}
