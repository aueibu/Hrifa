/**
 * The two spacing rules of M2c ('equal' centers, 'shared' center range), the rounding of each interval's bottom note,
 * and the spacing-range presets. Pure arithmetic in grid steps; `catalog.ts` turns placements into scored entries.
 * Reference implementation the human explored: `arcs/interval-placement/m2c/catalog/worker2.ts` (`centres`, `low`, `place`).
 */

export type SpacingRule = 'equal' | 'shared';
export type TieMode = 'middle' | 'down' | 'up';

export const SPACING_RULES: readonly SpacingRule[] = ['equal', 'shared'];
export const DEFAULT_SPACING_RULE: SpacingRule = 'equal';
export const TIE_MODES: readonly TieMode[] = ['middle', 'down', 'up'];
export const DEFAULT_TIE_MODE: TieMode = 'middle';

/** Tolerance for "exact half step" and for window containment, in steps. */
export const TIE_TOLERANCE = 1e-9;

/**
 * Window centers of the spans, in steps from the window bottom, for the ordering `sizes` (steps, in span order) in a
 * window of `width` steps.
 *
 * - `'equal'`: D = min over i < j of (W - (d_i + d_j)/2) / (j - i), c_0 = max over k of (d_k/2 - k*D), centers c_0 + k*D.
 *   With two or more intervals the chord spans the whole window.
 * - `'shared'`: centers spread evenly over [M/2, W - M/2], M = the largest interval; the same for every ordering of a set.
 *
 * A single interval has no spacing: it sits at the bottom of the window (center d/2, the formula's own result for
 * `equal`; `shared` gives the same, by definition here, because its spread divides by n - 1).
 */
export function spacingCenters(
  rule: SpacingRule,
  sizes: readonly number[],
  width: number
): number[] {
  const n = sizes.length;
  if (n === 0) {
    throw new RangeError('spacingCenters: at least one interval is needed');
  }
  if (n === 1) {
    return [sizes[0] / 2];
  }
  if (rule === 'shared') {
    const h = Math.max(...sizes) / 2;
    return sizes.map((_, k) => h + (k * (width - 2 * h)) / (n - 1));
  }
  let step = Number.POSITIVE_INFINITY;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      step = Math.min(step, (width - (sizes[i] + sizes[j]) / 2) / (j - i));
    }
  }
  let c0 = Number.NEGATIVE_INFINITY;
  for (let k = 0; k < n; k++) {
    c0 = Math.max(c0, sizes[k] / 2 - k * step);
  }
  return sizes.map((_, k) => c0 + k * step);
}

/**
 * The bottom note of an interval of `size` steps centered at `center`, in a window of `width` steps: the grid step
 * nearest to `center - size/2`. An exact half step is a tie (tolerance 1e-9) and rounds toward the window middle under
 * `'middle'` (center < W/2 rounds up, otherwise down: an interval centered exactly on the middle rounds down), always
 * down under `'down'`, always up under `'up'`. The result is clamped to [0, floor(W - size)] so the span stays inside the
 * window (it only matters for spans that are not whole steps).
 */
export function bottomNote(
  center: number,
  size: number,
  width: number,
  tieMode: TieMode = DEFAULT_TIE_MODE
): { low: number; tie: boolean } {
  const x = center - size / 2;
  const f = Math.floor(x + TIE_TOLERANCE);
  const tie = Math.abs(x - f - 0.5) <= TIE_TOLERANCE;
  let low = Math.round(x);
  if (tie) {
    if (tieMode === 'down') {
      low = f;
    } else if (tieMode === 'up') {
      low = f + 1;
    } else {
      low = center < width / 2 - TIE_TOLERANCE ? f + 1 : f;
    }
  }
  const maxLow = Math.floor(width - size + TIE_TOLERANCE);
  return { low: Math.max(0, Math.min(low, maxLow)), tie };
}

export interface SpacedPlacement {
  rule: SpacingRule;
  tieMode: TieMode;
  widthSteps: number;
  /** The interval centers, steps from the window bottom. */
  centers: number[];
  /** `[low, high]` of each span in steps from the window bottom (`high = low + size`, exact for non-whole spans). */
  endpoints: Array<[number, number]>;
  /** The distinct notes (steps), ascending. */
  notes: number[];
  /** How many bottom notes were an exact half step (the rounding twins differ only there). */
  ties: number;
}

/**
 * Place one ordering (`sizes` in steps, in span order) in a window of `width` steps. Returns null when the window is
 * narrower than the largest interval (the ordering cannot fit; the caller counts it). Never returns a note outside
 * [0, width].
 */
export function placeSpaced(
  rule: SpacingRule,
  sizes: readonly number[],
  width: number,
  tieMode: TieMode = DEFAULT_TIE_MODE
): SpacedPlacement | null {
  if (sizes.length === 0) {
    throw new RangeError('placeSpaced: at least one interval is needed');
  }
  if (Math.max(...sizes) > width + TIE_TOLERANCE) {
    return null;
  }
  const centers = spacingCenters(rule, sizes, width);
  let ties = 0;
  const endpoints = sizes.map((d, k): [number, number] => {
    const { low, tie } = bottomNote(centers[k], d, width, tieMode);
    if (tie) {
      ties++;
    }
    return [low, low + d];
  });
  const seen = new Map<number, number>();
  for (const [lo, hi] of endpoints) {
    for (const v of [lo, hi]) {
      const key = Math.round(v * 1e6);
      if (!seen.has(key)) {
        seen.set(key, v);
      }
    }
  }
  const notes = [...seen.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  return { rule, tieMode, widthSteps: width, centers, endpoints, notes, ties };
}

// ---- the spacing range (window widths) ----

/** A range of window widths in grid steps (inclusive); `fromSteps === toSteps` is one width. */
export interface SpacingRangeSteps {
  fromSteps: number;
  toSteps: number;
}
/** The same in cents (converted with the grid: whole steps from `ceil(from / stepCents)` to `floor(to / stepCents)`). */
export interface SpacingRangeCents {
  fromCents: number;
  toCents: number;
}
export type SpacingRange = SpacingRangeSteps | SpacingRangeCents;

export type SpacingPresetName = 'close' | 'open' | 'wide' | 'vast';

/** The named ranges at 12-EDO, in steps (data only). */
export const SPACING_PRESETS_12: Readonly<Record<SpacingPresetName, SpacingRangeSteps>> = {
  close: { fromSteps: 6, toSteps: 12 },
  open: { fromSteps: 13, toSteps: 24 },
  wide: { fromSteps: 25, toSteps: 36 },
  vast: { fromSteps: 37, toSteps: 48 },
};

/**
 * A preset in another grid: the same octave ranges. Each top edge is a whole number of octaves (`toSteps * edo / 12`);
 * each preset after `close` starts one step above the previous top, so the presets tile the widths with no gap
 * (19-EDO: close 10-19, open 20-38, wide 39-57, vast 58-76). `close` starts at half an octave, rounded (halves up).
 */
export function spacingPreset(name: SpacingPresetName, edo = 12): SpacingRangeSteps {
  if (!(edo > 0) || !Number.isFinite(edo)) {
    throw new RangeError('spacingPreset: edo must be > 0');
  }
  const p = SPACING_PRESETS_12[name];
  if (!p) {
    throw new RangeError(`unknown spacing preset: ${String(name)}`);
  }
  const scale = (steps12: number) => Math.round((steps12 * edo) / 12);
  return {
    fromSteps: name === 'close' ? scale(p.fromSteps) : scale(p.fromSteps - 1) + 1,
    toSteps: scale(p.toSteps),
  };
}

/** The whole window widths (steps) a spacing range covers, ascending. Throws when the range is empty or invalid. */
export function spacingWidths(range: SpacingRange, stepCents: number): number[] {
  const [from, to] =
    'fromSteps' in range
      ? [range.fromSteps, range.toSteps]
      : [range.fromCents / stepCents, range.toCents / stepCents];
  if (!Number.isFinite(from) || !Number.isFinite(to) || !(from > 0) || to < from - TIE_TOLERANCE) {
    throw new RangeError('spacing range: need finite 0 < from <= to');
  }
  const lo = Math.ceil(from - 1e-9);
  const hi = Math.floor(to + 1e-9);
  if (hi < lo) {
    throw new RangeError('spacing range contains no whole step width');
  }
  const out: number[] = [];
  for (let w = lo; w <= hi; w++) {
    out.push(w);
  }
  return out;
}
