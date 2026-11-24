/**
 * Pure operations on a `WorkspaceStore` for the meta-tab strip (design 5.4): activate, add, rename, duplicate, delete.
 * M2 (`src/lib/stage`) ships the store type and its parse, but no store-level operations, so they live here, small and
 * pure, for the page to apply (`setStore((st) => addWorkspace(st))`). Each returns the SAME object when it does nothing.
 */
import type { Workspace, WorkspaceId, WorkspaceStore } from '../../../lib/stage';

const names = (st: WorkspaceStore, except?: WorkspaceId): string[] =>
  st.order.filter((id) => id !== except).map((id) => st.workspaces[id].name);

/** Is `name` free (trimmed, not empty, not another workspace's name, case-insensitive)? */
export function canNameWorkspace(
  st: WorkspaceStore,
  id: WorkspaceId | null,
  name: string
): boolean {
  const n = name.trim().toLowerCase();
  return n !== '' && !names(st, id ?? undefined).some((x) => x.trim().toLowerCase() === n);
}

/** The names a prompt must refuse (every workspace's, except `id` itself when renaming). */
export const takenWorkspaceNames = (st: WorkspaceStore, id?: WorkspaceId): string[] =>
  names(st, id);

const freshId = (st: WorkspaceStore): WorkspaceId => {
  const taken = new Set(Object.keys(st.workspaces));
  for (let n = st.order.length + 1; ; n++) {
    if (!taken.has(`s${n}`)) {
      return `s${n}`;
    }
  }
};

const freshName = (st: WorkspaceStore, base: string): string => {
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

export function setActiveWorkspace(st: WorkspaceStore, id: WorkspaceId): WorkspaceStore {
  return st.active === id || !st.workspaces[id] ? st : { ...st, active: id };
}

const insertAfter = (order: readonly WorkspaceId[], after: WorkspaceId, id: WorkspaceId) => {
  const at = order.indexOf(after);
  return at < 0 ? [...order, id] : [...order.slice(0, at + 1), id, ...order.slice(at + 1)];
};

/** A copy of `from` (default the active one) under a new id, named "Workspace N", placed last and made active. */
export function addWorkspace(st: WorkspaceStore, from: WorkspaceId = st.active): WorkspaceStore {
  const src = st.workspaces[from];
  if (!src) {
    return st;
  }
  const id = freshId(st);
  const copy: Workspace = { ...src, id, name: freshName(st, `Workspace ${st.order.length + 1}`) };
  return {
    ...st,
    active: id,
    order: [...st.order, id],
    workspaces: { ...st.workspaces, [id]: copy },
  };
}

/** A copy named "<name> copy", placed right after the original and made active. */
export function duplicateWorkspace(st: WorkspaceStore, id: WorkspaceId): WorkspaceStore {
  const src = st.workspaces[id];
  if (!src) {
    return st;
  }
  const newId = freshId(st);
  const copy: Workspace = { ...src, id: newId, name: freshName(st, `${src.name} copy`) };
  return {
    ...st,
    active: newId,
    order: insertAfter(st.order, id, newId),
    workspaces: { ...st.workspaces, [newId]: copy },
  };
}

/** Rename; refused (same object) for an empty or taken name. */
export function renameWorkspace(st: WorkspaceStore, id: WorkspaceId, name: string): WorkspaceStore {
  const n = name.trim();
  const cur = st.workspaces[id];
  if (!cur || cur.name === n || !canNameWorkspace(st, id, n)) {
    return st;
  }
  return { ...st, workspaces: { ...st.workspaces, [id]: { ...cur, name: n } } };
}

/** Delete; the last workspace cannot be deleted. The active one falls to its right neighbour (else its left). */
export function deleteWorkspace(st: WorkspaceStore, id: WorkspaceId): WorkspaceStore {
  if (!st.workspaces[id] || st.order.length <= 1) {
    return st;
  }
  const at = st.order.indexOf(id);
  const order = st.order.filter((x) => x !== id);
  const { [id]: _gone, ...workspaces } = st.workspaces;
  void _gone;
  const active = st.active === id ? order[Math.min(at, order.length - 1)] : st.active;
  return { ...st, active, order, workspaces: workspaces };
}
