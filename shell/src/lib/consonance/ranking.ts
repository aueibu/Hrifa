/**
 * Combining scores for ranking: standardise within a candidate set, weight, and find the Pareto front.
 * Scores are never mixed before this last step.
 */

/**
 * Weights for ranking on z-scores (`combine` after `standardise`): the standardised analogue of the composite model.
 * In Harrison & Pearce (2020) the standardised coefficients of the features (their Fig. 2C) are "broadly similar" in
 * size, so the preset is equal magnitude: interference (lower is better) -1, harmonicity (higher is better) +1.
 * Periodicity is not part of the published composite, so it gets 0 here (a judgement: raise it if you want it to count).
 * The published `-1.620 / +1.780` are UNSTANDARDISED coefficients for raw values: use `inconComposite` for those.
 */
export const EQUAL_WEIGHTS = { interference: -1, periodicity: 0, harmonicity: 1 } as const;

/**
 * z-scores of `xs` (mean 0, sample standard deviation 1, like R's `scale()`). A constant list, or one with fewer than
 * two values, standardises to zeros.
 */
export function standardise(xs: readonly number[]): number[] {
  const n = xs.length;
  if (n < 2) {
    return xs.map(() => 0);
  }
  const mean = xs.reduce((s, x) => s + x, 0) / n;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1));
  if (!(sd > 0)) {
    return xs.map(() => 0);
  }
  return xs.map((x) => (x - mean) / sd);
}

/**
 * Weighted sum of score columns: `columns[k][i]` is score k of candidate i (standardise each column first),
 * `weights[k]` its weight (negative for scores where lower is better, as in `EQUAL_WEIGHTS`). Returns one value per
 * candidate; higher = better.
 */
export function combine(
  columns: readonly (readonly number[])[],
  weights: readonly number[]
): number[] {
  if (columns.length !== weights.length) {
    throw new RangeError('combine: one weight per score column is required');
  }
  const n = columns[0]?.length ?? 0;
  const out = new Array<number>(n).fill(0);
  columns.forEach((col, k) => {
    if (col.length !== n) {
      throw new RangeError('combine: all score columns must have the same length');
    }
    for (let i = 0; i < n; i++) {
      out[i] += weights[k] * col[i];
    }
  });
  return out;
}

/**
 * Indices of the non-dominated points. `senses[k]` says whether lower or higher is better on axis k (default: all
 * `'min'`). A point is dominated when another is at least as good on every axis and strictly better on one; equal
 * points are all kept. Points with a NaN coordinate are never on the front. Ascending index order.
 */
export function paretoFront(
  points: readonly (readonly number[])[],
  senses?: readonly ('min' | 'max')[]
): number[] {
  const sign = (k: number) => (senses?.[k] === 'max' ? -1 : 1);
  const p = points.map((pt) => pt.map((v, k) => v * sign(k)));
  const valid = p.map((pt) => pt.every((v) => !Number.isNaN(v)));
  const front: number[] = [];
  for (let i = 0; i < p.length; i++) {
    if (!valid[i]) {
      continue;
    }
    let dominated = false;
    for (let j = 0; j < p.length && !dominated; j++) {
      if (i === j || !valid[j]) {
        continue;
      }
      let allLe = true;
      let someLt = false;
      for (let k = 0; k < p[i].length; k++) {
        if (p[j][k] > p[i][k]) {
          allLe = false;
        } else if (p[j][k] < p[i][k]) {
          someLt = true;
        }
      }
      dominated = allLe && someLt;
    }
    if (!dominated) {
      front.push(i);
    }
  }
  return front;
}
