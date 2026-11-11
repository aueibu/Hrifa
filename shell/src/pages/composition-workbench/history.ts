import { useCallback, useSyncExternalStore } from 'react';

/**
 * Workbench-wide undo/redo. Every recorded write is `(key, previousRaw, nextRaw)` where raw is the
 * exact string kept in localStorage (null means the key is absent). History is session-only and is
 * never stored; undo and redo write raw values back through whichever hook owns the key (or
 * straight to storage when nothing is mounted for it).
 */

/** How many steps undo can go back through. Older ones are dropped. */
export const HISTORY_DEPTH = 50;

/** Writes to one key closer together than this (typing, dragging) are one step. */
export const COALESCE_WINDOW_MS = 500;

export interface HistoryChange {
  key: string;
  previous: string | null;
  next: string | null;
  /** Not a storage key: undo and redo hand the value to the applier but never write storage. */
  virtual?: boolean;
}

interface HistoryEntry {
  changes: HistoryChange[];
  /** Whether later writes may still merge into this entry. */
  open: boolean;
  /** When the entry last received a write. */
  at: number;
  /** The redo steps this entry discarded, restored if the entry nets to nothing. */
  discarded?: HistoryEntry[];
}

export interface RecordOptions {
  /** False for discrete actions (add, remove, move): they never merge with neighbours. */
  coalesce?: boolean;
}

/** Applies a raw value to a mounted owner of the key. Returns false when it cannot. */
type Applier = (raw: string) => boolean;

let past: HistoryEntry[] = [];
let future: HistoryEntry[] = [];
let openEntry: HistoryEntry | null = null;
let lastTouched: HistoryEntry | null = null;
let lastTouchedAt = 0;
let tickOpen = false;
let groupDepth = 0;
let groupChanges: HistoryChange[] = [];
let foldDepth = 0;
let version = 0;
let listenersInstalled = false;
const appliers = new Map<string, Set<Applier>>();
const listeners = new Set<() => void>();

function notify() {
  version += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Ends the current coalescing group, so the next write starts a new step. */
export function closeHistoryGroup() {
  if (openEntry) {
    openEntry.open = false;
  }
  openEntry = null;
}

function installListeners() {
  if (listenersInstalled || typeof window === 'undefined') {
    return;
  }
  listenersInstalled = true;
  // A finished drag or click, or leaving a field, ends the burst. Capture so nothing hides it.
  ['pointerup', 'pointercancel', 'focusout'].forEach((type) =>
    window.addEventListener(type, closeHistoryGroup, true)
  );
}

function markTick() {
  if (!tickOpen) {
    tickOpen = true;
    queueMicrotask(() => {
      tickOpen = false;
    });
  }
}

function mergeChange(changes: HistoryChange[], change: HistoryChange) {
  const existing = changes.find((candidate) => candidate.key === change.key);
  if (existing) {
    existing.next = change.next;
  } else {
    changes.push({ ...change });
  }
}

function isNoop(entry: HistoryEntry) {
  return entry.changes.every((change) => change.previous === change.next);
}

function pushEntry(entry: HistoryEntry) {
  past = [...past, entry].slice(-HISTORY_DEPTH);
  entry.discarded = future;
  future = [];
  lastTouched = entry;
  lastTouchedAt = Date.now();
}

/** Records one write. Cheap no-ops (same raw both sides) are ignored. */
export function recordChange(change: HistoryChange, options: RecordOptions = {}) {
  if (change.previous === change.next) {
    return;
  }
  if (foldDepth > 0) {
    foldChange(change);
    return;
  }
  if (groupDepth > 0) {
    mergeChange(groupChanges, change);
    return;
  }
  installListeners();
  const coalesce = options.coalesce !== false;
  const now = Date.now();
  const entry = openEntry;
  if (coalesce && entry?.open && past[past.length - 1] === entry) {
    const sameTick = tickOpen;
    const knowsKey = entry.changes.some((candidate) => candidate.key === change.key);
    if (now - entry.at <= COALESCE_WINDOW_MS && (sameTick || knowsKey)) {
      mergeChange(entry.changes, change);
      entry.at = now;
      markTick();
      if (isNoop(entry)) {
        past = past.filter((candidate) => candidate !== entry);
        // The burst netted to nothing, so it must not have cost the redo stack.
        future = entry.discarded ?? future;
        openEntry = null;
        lastTouched = null;
      }
      notify();
      return;
    }
  }
  const created: HistoryEntry = { changes: [{ ...change }], open: coalesce, at: now };
  pushEntry(created);
  openEntry = coalesce ? created : null;
  markTick();
  notify();
}

/** Records every write made inside `fn` as one step. */
export function recordGroup<T>(fn: () => T): T {
  installListeners();
  groupDepth += 1;
  try {
    return fn();
  } finally {
    groupDepth -= 1;
    if (groupDepth === 0) {
      const changes = groupChanges.filter((change) => change.previous !== change.next);
      groupChanges = [];
      if (changes.length) {
        closeHistoryGroup();
        pushEntry({ changes, open: false, at: Date.now() });
        notify();
      }
    }
  }
}

function foldChange(change: HistoryChange) {
  const target = lastTouched;
  // It must be recent (the effect that follows the change), and never write a key back that the
  // same step removed.
  if (
    !target ||
    Date.now() - lastTouchedAt > COALESCE_WINDOW_MS ||
    target.changes.some((candidate) => candidate.key === change.key && candidate.next === null)
  ) {
    return;
  }
  lastTouchedAt = Date.now();
  mergeChange(target.changes, change);
  notify();
}

/**
 * For automatic follow-up writes (pruning or resetting state because something else changed).
 * They attach to the step that caused them, so undo reverts both and they never form their own.
 */
export function foldIntoHistory<T>(fn: () => T): T {
  foldDepth += 1;
  try {
    return fn();
  } finally {
    foldDepth -= 1;
  }
}

/** Lets a mounted owner (a hook, a provider) take raw values written by undo and redo. */
export function registerHistoryApplier(key: string, applier: Applier) {
  let set = appliers.get(key);
  if (!set) {
    set = new Set();
    appliers.set(key, set);
  }
  set.add(applier);
  return () => {
    set.delete(applier);
    if (!set.size) {
      appliers.delete(key);
    }
  };
}

function writeStorage(key: string, raw: string | null) {
  try {
    if (raw === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, raw);
    }
  } catch {
    // In-memory state still updates when storage is unavailable.
  }
}

function applyEntry(entry: HistoryEntry, direction: 'undo' | 'redo') {
  const ordered = direction === 'undo' ? [...entry.changes].reverse() : entry.changes;
  const targets = ordered.map((change) => ({
    key: change.key,
    raw: direction === 'undo' ? change.previous : change.next,
  }));
  // Storage first, for every key: a module that remounts as a result reads it in its initializer.
  ordered.forEach((change, index) => {
    if (!change.virtual) {
      writeStorage(targets[index].key, targets[index].raw);
    }
  });
  targets.forEach(({ key, raw }) => {
    if (raw === null) {
      return;
    }
    appliers.get(key)?.forEach((applier) => applier(raw));
  });
}

export function undo() {
  const entry = past[past.length - 1];
  if (!entry) {
    return;
  }
  closeHistoryGroup();
  past = past.slice(0, -1);
  future = [...future, entry];
  // Resets that follow an undo or redo are not part of any step, so nothing may fold.
  lastTouched = null;
  applyEntry(entry, 'undo');
  notify();
}

export function redo() {
  const entry = future[future.length - 1];
  if (!entry) {
    return;
  }
  closeHistoryGroup();
  future = future.slice(0, -1);
  past = [...past, entry];
  lastTouched = null;
  applyEntry(entry, 'redo');
  notify();
}

export const canUndo = () => past.length > 0;
export const canRedo = () => future.length > 0;

/** Forgets all history (tests, and a fresh workbench session). */
export function resetHistory() {
  past = [];
  future = [];
  openEntry = null;
  lastTouched = null;
  groupDepth = 0;
  groupChanges = [];
  foldDepth = 0;
  notify();
}

/** For the Undo and Redo controls. */
export function useHistory() {
  useSyncExternalStore(subscribe, () => version);
  return {
    undo: useCallback(undo, []),
    redo: useCallback(redo, []),
    canUndo: canUndo(),
    canRedo: canRedo(),
  };
}
