import { recordChange, registerHistoryApplier } from '../history';
import { isReloading } from '../reloading';
import { isRecordedStateKey } from '../stateKeys';

/**
 * The keyed store that owns every persisted workbench value (R3a). `usePersistentState` is a thin
 * hook over it. A key is created on first use and stays alive after its last hook unmounts, so undo
 * and redo reach a node whose view is not mounted. A key is released when its node is deleted:
 * the delete removes the stored value, and the next time the last hook of that key goes away the
 * store sees the missing storage entry and drops it (`releaseIfRemoved`). A project open reloads
 * the page (a fresh store); a key read again after storage changed underneath it is re-read.
 */

export interface StateConfig<T> {
  fallback: T | (() => T);
  accepts: (value: unknown) => value is T;
  /** Reshapes or sanitizes the stored value before it is validated. */
  migrate?: (value: unknown) => unknown;
}

export interface StateSetOptions {
  /** Overrides the central classification for this one write. */
  recorded?: boolean;
  /** False for discrete actions that must never merge with the next change. Default true. */
  coalesce?: boolean;
}

type Action<T> = T | ((current: T) => T);

interface Entry {
  value: unknown;
  /** Raw JSON of the value as the recorder last saw it (null until a recorded write or an undo). */
  raw: string | null;
  /** What storage held when we last read or wrote it; a different current value means it changed under us. */
  storedRaw: string | null;
  /** A storage write failed: the store is the only copy, never reload from storage. */
  unsynced: boolean;
  /**
   * The key belongs to a deleted node instance (see `deleteState`): the entry may live in memory
   * (a render that was already under way) but never writes storage or history, so nothing late can
   * bring the deleted state back. An undo that restores the storage value clears it.
   */
  detached: boolean;
  config: StateConfig<unknown>;
  listeners: Set<() => void>;
  unregister: () => void;
}

const entries = new Map<string, Entry>();
/** Keys of deleted instances whose storage is gone; cleared when storage holds the key again (undo). */
const deletedKeys = new Set<string>();

function serialize(value: unknown): string | null {
  try {
    return JSON.stringify(value) ?? null;
  } catch {
    return null;
  }
}

function readStorage(key: string): string | null | undefined {
  try {
    return localStorage.getItem(key);
  } catch {
    return undefined;
  }
}

/** The initial read: storage, JSON, migrate, accepts, else fallback. Never throws. */
function readInitial<T>(key: string, config: StateConfig<T>): { value: T; saved: string | null } {
  const fallbackValue =
    typeof config.fallback === 'function' ? (config.fallback as () => T)() : config.fallback;
  const saved = readStorage(key) ?? null;
  if (saved === null) {
    return { value: fallbackValue, saved };
  }
  try {
    const raw: unknown = JSON.parse(saved);
    const parsed = config.migrate ? config.migrate(raw) : raw;
    return { value: config.accepts(parsed) ? parsed : fallbackValue, saved };
  } catch {
    return { value: fallbackValue, saved };
  }
}

function writeStorage(key: string, entry: Entry) {
  if (isReloading() || entry.detached) {
    return;
  }
  try {
    const text = JSON.stringify(entry.value);
    localStorage.setItem(key, text);
    entry.storedRaw = text;
    entry.unsynced = false;
  } catch {
    // State remains usable in memory when browser persistence is unavailable.
    entry.unsynced = true;
  }
}

function notify(entry: Entry) {
  entry.listeners.forEach((listener) => listener());
}

function create<T>(key: string, config: StateConfig<T>): Entry {
  const { value, saved } = readInitial(key, config);
  // A deleted key whose storage is still empty is detached; storage holding it again (undo) revives it.
  const detached = deletedKeys.has(key) && saved === null;
  if (!detached) {
    deletedKeys.delete(key);
  }
  const entry: Entry = {
    value,
    raw: null,
    storedRaw: saved,
    unsynced: false,
    detached,
    config: config as StateConfig<unknown>,
    listeners: new Set(),
    unregister: () => undefined,
  };
  // Undo and redo write their target raw value back through this, for a key with no mounted hook too.
  entry.unregister = registerHistoryApplier(key, (raw) => {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!entry.config.accepts(parsed)) {
        return false;
      }
      entry.value = parsed;
      entry.raw = raw;
      // History wrote the value back to storage: the key is live again.
      entry.detached = false;
      deletedKeys.delete(key);
      // History wrote the raw text to storage first; the old mount effect then normalized it.
      writeStorage(key, entry);
      notify(entry);
      return true;
    } catch {
      return false;
    }
  });
  entries.set(key, entry);
  return entry;
}

/**
 * Why this exists: storage can change outside the store while a key is idle (no subscriber): tests
 * clearing localStorage, history writing storage first, a project written before a reload. An idle
 * key therefore follows storage when it differs from what the store last wrote, so it never shows a
 * stale value. A mounted key is owned by the store and is not re-read.
 */
function revalidate<T>(key: string, entry: Entry, config: StateConfig<T>) {
  if (entry.listeners.size) {
    return;
  }
  // The key is idle: the next reader's config applies (the first registrant's holds while mounted).
  entry.config = config as StateConfig<unknown>;
  if (entry.unsynced || isReloading()) {
    return;
  }
  const current = readStorage(key);
  if (current === undefined || current === entry.storedRaw) {
    return;
  }
  const { value, saved } = readInitial(key, config);
  entry.value = value;
  entry.raw = null;
  entry.storedRaw = saved;
  if (saved !== null) {
    entry.detached = false;
    deletedKeys.delete(key);
  }
}

function acquire<T>(key: string, config: StateConfig<T>): Entry {
  const existing = entries.get(key);
  if (!existing) {
    return create(key, config);
  }
  revalidate(key, existing, config);
  return existing;
}

/** The current value (creates the key from its first registrant's config). */
export function getState<T>(key: string, config: StateConfig<T>): T {
  return acquire(key, config).value as T;
}

/** Always attaches: a key released between render and subscribe is created again from `config`. */
export function subscribeState<T>(
  key: string,
  listener: () => void,
  config: StateConfig<T>
): () => void {
  const entry = entries.get(key) ?? create(key, config);
  entry.listeners.add(listener);
  return () => {
    // The key may have been released and recreated meanwhile; only touch the entry we joined.
    entry.listeners.delete(listener);
    if (!entry.listeners.size) {
      releaseIfRemoved(key, entry);
    }
  };
}

/**
 * Writes the current value to storage once a hook has mounted (the initial value persists too).
 * A mounted hook means the instance is live, so a key flagged as deleted is live again: only a
 * render that never committed (a late one while the node was being deleted) stays detached.
 */
export function persistState(key: string) {
  deletedKeys.delete(key);
  const entry = entries.get(key);
  if (entry) {
    entry.detached = false;
    writeStorage(key, entry);
  }
}

/** Reproduces the old hook's set: latest-value updaters, Object.is no-op, one recorded change. */
export function setState<T>(key: string, action: Action<T>, options?: StateSetOptions) {
  const entry = entries.get(key);
  if (!entry || entry.detached) {
    return;
  }
  const previous = entry.value as T;
  const next = typeof action === 'function' ? (action as (current: T) => T)(previous) : action;
  if (Object.is(next, previous)) {
    return;
  }
  entry.value = next;
  writeStorage(key, entry);
  notify(entry);
  if (!(options?.recorded ?? isRecordedStateKey(key))) {
    return;
  }
  const previousRaw = entry.raw ?? serialize(previous);
  const nextRaw = serialize(next);
  entry.raw = nextRaw;
  if (previousRaw !== null && nextRaw !== null) {
    recordChange({ key, previous: previousRaw, next: nextRaw }, { coalesce: options?.coalesce });
  }
}

/** Drops a key (its applier and value). Called when its node instance is deleted. */
export function releaseState(key: string) {
  const entry = entries.get(key);
  if (entry) {
    entry.unregister();
    entries.delete(key);
  }
}

/**
 * A node instance was deleted: drops its keys and keeps them from being written again until an
 * undo restores the storage value. Call it after the stored value was removed (and recorded), so a
 * late `set` or a render that re-creates the key cannot write storage back and resurrect it.
 */
export function deleteState(key: string) {
  releaseState(key);
  deletedKeys.add(key);
}

/** The delete path removes the stored value; a key with no hook and no storage entry is gone. */
function releaseIfRemoved(key: string, entry: Entry) {
  // An unsynced entry is the only copy (a failed write): storage says nothing about it.
  if (entries.get(key) !== entry || isReloading() || entry.unsynced) {
    return;
  }
  if (readStorage(key) === null) {
    releaseState(key);
  }
}

/** Whether the store holds the key (tests, diagnostics). */
export function hasState(key: string) {
  return entries.has(key);
}

/** Forgets every key and its applier (tests). */
export function resetStateStore() {
  [...entries.keys()].forEach(releaseState);
  deletedKeys.clear();
}
