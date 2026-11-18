/**
 * Subset product (M8g): the shape placed on each source. Up = source x shape ratio, Down = source / shape ratio, Both = the
 * union of the two; Steps n applies the shape n times in a row (Steps 2 = Sources x Shape x Shape). Every product is folded
 * into the repeat, exact ratios stay exact (a monzo), pitches that are only cents (EDO fields) combine as cents sums. Pure: no
 * React, no storage.
 *
 * Merging: equal pitches (within EPS) are one pitch. Then, with a tolerance, a pitch within the tolerance of a field note is that
 * field note, and a pitch within the tolerance of an EARLIER kept pitch (generation order: Up before Down, each in source then
 * shape order) is dropped, the earlier one kept. Tolerance 0 merges exact equals only.
 */
import { EPS, mulNotes, reduceInto } from './intervals';
import { RELATIVE_MAX_NOTES, hasPitch, noteText, readNoteText } from './relativePitches';
import type { Note } from './types';

export type ProductDirection = 'up' | 'down' | 'both';
export type ProductKind = 'original' | 'new' | 'merged';
export const PRODUCT_MAX_STEPS = 4;
/** A step layer (distinct pitches so far) longer than this stops the computation (`overflow`). */
export const PRODUCT_LAYER_LIMIT = 20000;

export interface ProductInput {
  sources: readonly Note[];
  shape: readonly Note[];
  direction: ProductDirection;
  /** 1 to `PRODUCT_MAX_STEPS`. */
  steps: number;
  rep: Note;
  /** The notes already in the field (any order). */
  field: readonly Note[];
  /** Merge tolerance in cents; 0 = exact equals only. */
  tol: number;
}

export interface ProductResult {
  /** Every product before any merging: sources x shape^steps, doubled for Both. */
  total: number;
  /** The distinct pitches after merging, sorted by cents: a field note that a product merged into stands for it. */
  distinct: Note[];
  /**
   * The kind of each distinct pitch (same order): `merged` if any product landed on it by tolerance (not exactly), else `original`
   * if a product hit an existing field note exactly, else `new`.
   */
  kinds: ProductKind[];
  /** The distinct pitches that are not in the field (the ones Add would add), sorted by cents. */
  fresh: Note[];
  /** How many of the distinct pitches are already field notes. */
  inField: number;
  /** The product was too large to compute: nothing else is filled. */
  overflow: boolean;
}

function keyOf(n: Note): string {
  if (n.m) {
    const m = n.m;
    return `m${Object.keys(m)
      .sort((a, b) => Number(a) - Number(b))
      .map((p) => `${p}^${m[p]}`)
      .join(',')}`;
  }
  return `c${Math.round(n.c * 1e5)}`;
}

/** Distance round the repeat between two places. */
function cyc(a: number, b: number, rep: number): number {
  const d = Math.abs(a - b) % rep;
  return Math.min(d, rep - d);
}

/** The entry of a list sorted by `c` nearest to `c` round the repeat, with its distance; null for an empty list. */
function nearestIn(
  list: readonly { c: number }[],
  c: number,
  rep: number
): { i: number; d: number } | null {
  if (!list.length) {
    return null;
  }
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid].c < c) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  const cand = new Set([lo - 1, lo, 0, list.length - 1]);
  let best: { i: number; d: number } | null = null;
  for (const i of cand) {
    if (i < 0 || i >= list.length) {
      continue;
    }
    const d = cyc(list[i].c, c, rep);
    if (best === null || d < best.d) {
      best = { i, d };
    }
  }
  return best;
}

/** The distinct folded pitches of sources x shape^steps (sign 1) or sources / shape^steps (sign -1); null when a layer is too large. */
function chain(
  sources: readonly Note[],
  shape: readonly Note[],
  sign: 1 | -1,
  steps: number,
  rep: Note
): Note[] | null {
  let layer = new Map<string, Note>();
  for (const s of sources) {
    const f = reduceInto(s, rep);
    if (!layer.has(keyOf(f))) {
      layer.set(keyOf(f), f);
    }
  }
  for (let k = 0; k < steps; k++) {
    const next = new Map<string, Note>();
    for (const a of layer.values()) {
      for (const b of shape) {
        const n = reduceInto(mulNotes(a, b, sign), rep);
        const key = keyOf(n);
        if (!next.has(key)) {
          next.set(key, n);
        }
      }
    }
    if (next.size > PRODUCT_LAYER_LIMIT) {
      return null;
    }
    layer = next;
  }
  return [...layer.values()];
}

export function subsetProduct(input: ProductInput): ProductResult {
  const { sources, shape, direction, rep, field } = input;
  const steps = Math.min(PRODUCT_MAX_STEPS, Math.max(1, Math.round(input.steps) || 1));
  const tol = Math.max(0, input.tol);
  const per = sources.length * shape.length ** steps;
  const total = direction === 'both' ? 2 * per : per;
  const empty: ProductResult = {
    total,
    distinct: [],
    kinds: [],
    fresh: [],
    inField: 0,
    overflow: false,
  };
  if (!sources.length || !shape.length || !(rep.c > 0)) {
    return { ...empty, total: sources.length && shape.length ? total : 0 };
  }
  const found: Note[] = [];
  const seen = new Set<string>();
  for (const sign of direction === 'both' ? ([1, -1] as const) : [direction === 'up' ? 1 : -1]) {
    const got = chain(sources, shape, sign as 1 | -1, steps, rep);
    if (got === null) {
      return { ...empty, overflow: true };
    }
    for (const n of got) {
      if (!seen.has(keyOf(n))) {
        seen.add(keyOf(n));
        found.push(n);
      }
    }
  }
  // the field, folded and sorted by place, for the nearest-note lookups
  const fieldSorted = field.map((n) => reduceInto(n, rep)).sort((a, b) => a.c - b.c);
  const matched = new Set<number>();
  // field notes (by index) and kept pitches (by note) that a product only reached by tolerance
  const fieldByTol = new Set<number>();
  const keptByTol = new Set<Note>();
  const kept: Note[] = [];
  for (const p of found) {
    const nf = nearestIn(fieldSorted, p.c, rep.c);
    if (nf && (nf.d < EPS || nf.d <= tol)) {
      matched.add(nf.i);
      if (nf.d >= EPS) {
        fieldByTol.add(nf.i);
      }
      continue;
    }
    const nk = nearestIn(kept, p.c, rep.c);
    if (nk && (nk.d < EPS || nk.d <= tol)) {
      if (nk.d >= EPS) {
        keptByTol.add(kept[nk.i]);
      }
      continue;
    }
    // keep `kept` sorted by place
    let at = kept.length;
    while (at > 0 && kept[at - 1].c > p.c) {
      at--;
    }
    kept.splice(at, 0, p);
  }
  const entries: { n: Note; kind: ProductKind }[] = [
    ...[...matched].map((i) => ({
      n: fieldSorted[i],
      kind: (fieldByTol.has(i) ? 'merged' : 'original') as ProductKind,
    })),
    ...kept.map((n) => ({ n, kind: (keptByTol.has(n) ? 'merged' : 'new') as ProductKind })),
  ].sort((a, b) => a.n.c - b.n.c);
  return {
    total,
    distinct: entries.map((e) => e.n),
    kinds: entries.map((e) => e.kind),
    fresh: kept,
    inField: matched.size,
    overflow: false,
  };
}

/** The sentence for a product that would pass the Relative field's note limit. */
export const productTooMany = (n: number): string =>
  `This would make ${n} notes; the limit is ${RELATIVE_MAX_NOTES}.`;

/** The text of each pitch as a Relative field stores it (`p/q` or `700 c`). */
export const productTexts = (pitches: readonly Note[]): string[] => pitches.map(noteText);

/**
 * A Relative field's notes (pitch text) with these pitches added: a pitch already there (folded into the repeat) is not added
 * twice. The result can pass the limit; the caller refuses then (`productTooMany`).
 */
export function addProductNotes(
  existing: readonly string[],
  pitches: readonly string[],
  rep: Note
): string[] {
  const out = [...existing];
  for (const t of pitches) {
    const n = readNoteText(t);
    if (n && !hasPitch(out, t, rep)) {
      out.push(noteText(reduceInto(n, rep)));
    }
  }
  return out;
}
