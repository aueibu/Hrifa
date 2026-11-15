/**
 * Pure operations on a `ScreensetStore` for the meta-tab strip (design 5.4): activate, add, rename, duplicate, delete.
 * M2 (`src/lib/stage`) ships the store type and its parse, but no store-level operations, so they live here, small and
 * pure, for the page to apply (`setStore((st) => addScreenset(st))`). Each returns the SAME object when it does nothing.
 */
import type { Screenset, ScreensetId, ScreensetStore } from '../../../lib/stage';

const names = (st: ScreensetStore, except?: ScreensetId): string[] =>
  st.order.filter((id) => id !== except).map((id) => st.screensets[id].name);

/** Is `name` free (trimmed, not empty, not another screenset's name, case-insensitive)? */
export function canNameScreenset(
  st: ScreensetStore,
  id: ScreensetId | null,
  name: string
): boolean {
  const n = name.trim().toLowerCase();
  return n !== '' && !names(st, id ?? undefined).some((x) => x.trim().toLowerCase() === n);
}

/** The names a prompt must refuse (every screenset's, except `id` itself when renaming). */
export const takenScreensetNames = (st: ScreensetStore, id?: ScreensetId): string[] =>
  names(st, id);

const freshId = (st: ScreensetStore): ScreensetId => {
  const taken = new Set(Object.keys(st.screensets));
  for (let n = st.order.length + 1; ; n++) {
    if (!taken.has(`s${n}`)) {
      return `s${n}`;
    }
  }
};

const freshName = (st: ScreensetStore, base: string): string => {
  const taken = new Set(names(st).map((n) => n.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) {
    return base;
  }
  for (let n = 2; ; n++) {
    if (!taken.has(`${base} ${n}`.toLowerCase())) {
      return `${base} ${n}`;
    }
  }
};

export function setActiveScreenset(st: ScreensetStore, id: ScreensetId): ScreensetStore {
  return st.active === id || !st.screensets[id] ? st : { ...st, active: id };
}

const insertAfter = (order: readonly ScreensetId[], after: ScreensetId, id: ScreensetId) => {
  const at = order.indexOf(after);
  return at < 0 ? [...order, id] : [...order.slice(0, at + 1), id, ...order.slice(at + 1)];
};

/** A copy of `from` (default the active one) under a new id, named "Screenset N", placed last and made active. */
export function addScreenset(st: ScreensetStore, from: ScreensetId = st.active): ScreensetStore {
  const src = st.screensets[from];
  if (!src) {
    return st;
  }
  const id = freshId(st);
  const copy: Screenset = { ...src, id, name: freshName(st, `Screenset ${st.order.length + 1}`) };
  return {
    ...st,
    active: id,
    order: [...st.order, id],
    screensets: { ...st.screensets, [id]: copy },
  };
}

/** A copy named "<name> copy", placed right after the original and made active. */
export function duplicateScreenset(st: ScreensetStore, id: ScreensetId): ScreensetStore {
  const src = st.screensets[id];
  if (!src) {
    return st;
  }
  const newId = freshId(st);
  const copy: Screenset = { ...src, id: newId, name: freshName(st, `${src.name} copy`) };
  return {
    ...st,
    active: newId,
    order: insertAfter(st.order, id, newId),
    screensets: { ...st.screensets, [newId]: copy },
  };
}

/** Rename; refused (same object) for an empty or taken name. */
export function renameScreenset(st: ScreensetStore, id: ScreensetId, name: string): ScreensetStore {
  const n = name.trim();
  const cur = st.screensets[id];
  if (!cur || cur.name === n || !canNameScreenset(st, id, n)) {
    return st;
  }
  return { ...st, screensets: { ...st.screensets, [id]: { ...cur, name: n } } };
}

/** Delete; the last screenset cannot be deleted. The active one falls to its right neighbour (else its left). */
export function deleteScreenset(st: ScreensetStore, id: ScreensetId): ScreensetStore {
  if (!st.screensets[id] || st.order.length <= 1) {
    return st;
  }
  const at = st.order.indexOf(id);
  const order = st.order.filter((x) => x !== id);
  const { [id]: _gone, ...screensets } = st.screensets;
  void _gone;
  const active = st.active === id ? order[Math.min(at, order.length - 1)] : st.active;
  return { ...st, active, order, screensets };
}
