/**
 * Storage of the composites: `hrifa.harmonic-field-lab.composites.v1` (H-8).
 *
 * ```
 * { version: 1,
 *   composites: [{ id: 1..9, name, next: 3, updated: ISO,
 *                  items: [{ id: 'i1', kind: 'chord' | 'subset' | 'note' | 'selection', label,
 *                            pitches: [{ m, c }],                 // field-absolute, monzo + cents (as H-7)
 *                            rep: { m, c } | null,                // the repeat of the field it came from
 *                            source: { gen: <generation inputs>, tab: 'name', date: ISO } | null,
 *                            detail?: { template, root, pattern, tail: string | null, cents: number[] } }] }] }  // M8d, absent = null
 * ```
 * Plain JSON, self-contained. The recently-used order, the last add and refusals are runtime only.
 *
 * Rules: entry by entry; no write on mount (the caller compares identity); bad data falls back to no composites. An item
 * whose pitches are damaged (not 1 to 2048 usable pitches) is dropped (a different gamut would be worse than none); an
 * unusable `source` or `rep` only loses that; a composite with an invalid or repeated number gets the lowest free number;
 * beyond 9 composites or 64 items per composite the rest is not loaded (the same caps as in memory). Every other well-formed
 * entry is kept and written back, so a later save never drops it. Unknown extra fields are not kept.
 */
import { type Note } from '../../../lib/harmonic-field';
import { sanitizePitch } from './chordShelf';
import {
  ITEM_KINDS,
  MAX_COMPOSITES,
  MAX_COMPOSITE_ITEMS,
  MAX_ITEM_PITCHES,
  autoCompositeName,
  emptyComposites,
  nextItemId,
  sanitizeDetail,
  type Composite,
  type CompositeItem,
  type CompositesState,
  type ItemKind,
  type ItemSource,
} from './composites';
import { cleanName } from './generatorLibrary';
import { genFromStored, genToStored } from './libraryStore';
import { KEY_COMPOSITES, readJson, writeJson } from './persist';

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

const pitchOut = (p: Note) => ({ m: p.m ? { ...p.m } : null, c: p.c });

function sanitizeSource(raw: unknown): ItemSource | null {
  if (!isObj(raw)) {
    return null;
  }
  const gen = genFromStored(raw.gen);
  if (!gen) {
    return null;
  }
  return {
    gen,
    tab: typeof raw.tab === 'string' ? cleanName(raw.tab) : '',
    date: typeof raw.date === 'string' ? raw.date.slice(0, 40) : '',
  };
}

function sanitizeItems(raw: unknown): { items: CompositeItem[]; storedNext: number } {
  const items: CompositeItem[] = [];
  const seen = new Set<string>();
  const ids: unknown[] = [];
  for (const e of Array.isArray(raw) ? raw : []) {
    if (!isObj(e) || items.length >= MAX_COMPOSITE_ITEMS) {
      continue;
    }
    if (!Array.isArray(e.pitches) || e.pitches.length < 1 || e.pitches.length > MAX_ITEM_PITCHES) {
      continue;
    }
    const pitches = e.pitches.map(sanitizePitch);
    if (pitches.some((p) => p === null)) {
      continue;
    }
    const rep = sanitizePitch(e.rep);
    ids.push(e.id);
    items.push({
      id: '',
      kind: ITEM_KINDS.includes(e.kind as ItemKind) ? (e.kind as ItemKind) : 'selection',
      label: (typeof e.label === 'string' && cleanName(e.label)) || 'Item',
      pitches: pitches as Note[],
      rep: rep && rep.c > 0 ? rep : null,
      source: sanitizeSource(e.source),
      detail: sanitizeDetail(e.detail),
    });
  }
  // ids: a well-formed, first-seen stored id is kept; every other item gets a fresh id past all ids in use
  const valid = items.map((_it, i) => {
    const id = ids[i];
    if (typeof id === 'string' && /^i\d{1,9}$/.test(id) && !seen.has(id)) {
      seen.add(id);
      return id;
    }
    return '';
  });
  let n = nextItemId(valid.filter(Boolean).map((id) => ({ id }) as CompositeItem));
  return {
    items: items.map((it, i) => ({ ...it, id: valid[i] || `i${n++}` })),
    storedNext: n,
  };
}

/**
 * Coerce a stored value into composites. Null when it is not a composites record at all (not an object with a `composites`
 * list): the caller then uses none.
 */
export function sanitizeComposites(raw: unknown): CompositesState | null {
  if (!isObj(raw) || !Array.isArray(raw.composites)) {
    return null;
  }
  const picked: { want: number; c: Omit<Composite, 'id'> }[] = [];
  for (const e of raw.composites) {
    if (!isObj(e) || picked.length >= MAX_COMPOSITES) {
      continue;
    }
    const { items, storedNext } = sanitizeItems(e.items);
    const want = typeof e.id === 'number' && Number.isInteger(e.id) ? e.id : 0;
    const next =
      typeof e.next === 'number' && Number.isInteger(e.next) && e.next < 1e9
        ? Math.max(e.next, storedNext)
        : storedNext;
    picked.push({
      want,
      c: {
        name: typeof e.name === 'string' ? cleanName(e.name) : '',
        items,
        next: nextItemId(items, next),
        updated: typeof e.updated === 'string' ? e.updated.slice(0, 40) : '',
      },
    });
  }
  // numbers: a valid, first-seen number is kept; every other composite takes the lowest free one
  const used = new Set<number>();
  const slots = picked.map((p) => {
    if (p.want >= 1 && p.want <= MAX_COMPOSITES && !used.has(p.want)) {
      used.add(p.want);
      return p.want;
    }
    return 0;
  });
  const list: Composite[] = picked.map((p, i) => {
    let id = slots[i];
    if (!id) {
      id = 1;
      while (used.has(id)) {
        id++;
      }
      used.add(id);
    }
    return { id, ...p.c, name: p.c.name || autoCompositeName(id) };
  });
  list.sort((a, b) => a.id - b.id);
  return { ...emptyComposites(), list };
}

export function compositesToStored(s: CompositesState): Record<string, unknown> {
  return {
    version: 1,
    composites: s.list.map((c) => ({
      id: c.id,
      name: c.name,
      next: c.next,
      updated: c.updated,
      items: c.items.map((it) => ({
        id: it.id,
        kind: it.kind,
        label: it.label,
        pitches: it.pitches.map(pitchOut),
        rep: it.rep ? pitchOut(it.rep) : null,
        source: it.source
          ? { gen: genToStored(it.source.gen), tab: it.source.tab, date: it.source.date }
          : null,
        // additive (M8d): written only when set, so an item without a detail is stored byte for byte as before
        ...(it.detail ? { detail: it.detail } : {}),
      })),
    })),
  };
}

/** The composites for this page load: stored, else none (nothing is written). */
export function loadComposites(): CompositesState {
  return sanitizeComposites(readJson(KEY_COMPOSITES)) ?? emptyComposites();
}

/** Store the composites; false when storage is unavailable or full. */
export function saveComposites(s: CompositesState): boolean {
  return writeJson(KEY_COMPOSITES, compositesToStored(s));
}
