/**
 * M8i: group chords that have the same SHAPE on different roots. Pure: the caller supplies each item's key (a text made from
 * its template or pattern and its step list); an item with a null key is never grouped and stays a group of one.
 */

/** The matching tolerance for "same shape", in cents: steps are rounded to this before they are compared. */
export const SHAPE_TOL_C = 0.5;

/** The step list of a chord (successive differences of its pitches in cents, root first) as text, each step rounded to 0.5 c. */
export function stepKey(cents: readonly number[]): string {
  const q = (x: number) => (Math.round(x / SHAPE_TOL_C) * SHAPE_TOL_C).toFixed(1);
  return cents
    .slice(1)
    .map((c, i) => q(c - cents[i]))
    .join(',');
}

export interface ShapeGroup<T> {
  /** The shared key; null for an ungroupable item (always a group of one). */
  key: string | null;
  members: T[];
}

/** Items with the same key become one group; groups and the members inside them keep the order of first appearance. */
export function groupByShape<T>(
  items: readonly T[],
  key: (item: T) => string | null
): ShapeGroup<T>[] {
  const out: ShapeGroup<T>[] = [];
  const byKey = new Map<string, ShapeGroup<T>>();
  for (const item of items) {
    const k = key(item);
    const hit = k === null ? undefined : byKey.get(k);
    if (hit) {
      hit.members.push(item);
      continue;
    }
    const g: ShapeGroup<T> = { key: k, members: [item] };
    out.push(g);
    if (k !== null) {
      byKey.set(k, g);
    }
  }
  return out;
}
