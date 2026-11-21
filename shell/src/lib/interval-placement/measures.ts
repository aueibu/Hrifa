import { centsToHz } from '../consonance/pitch';
import type { Collision, Measures, NotePair } from './types';

/** Round a size in cents to 1e-6 so that float noise does not split equal sizes. */
export function centsKey(c: number): number {
  return Math.round(c * 1e6);
}

/** The descriptive measures of a voicing (exact facts, not consonance). `cents` must be sorted ascending. */
export function computeMeasures(
  refHz: number,
  cents: readonly number[],
  inducedPairs: readonly NotePair[],
  collisions: readonly Collision[]
): Measures {
  const n = cents.length;
  const centroidCents = n ? cents.reduce((s, c) => s + c, 0) / n : 0;
  const lowestCents = n ? cents[0] : 0;
  return {
    spanCents: n ? cents[n - 1] - cents[0] : 0,
    noteCount: n,
    centroidCents,
    centroidHz: centsToHz(refHz, centroidCents),
    lowestCents,
    lowestHz: centsToHz(refHz, lowestCents),
    distinctInduced: new Set(inducedPairs.map((p) => centsKey(p.cents))).size,
    collisions: collisions.length,
  };
}
