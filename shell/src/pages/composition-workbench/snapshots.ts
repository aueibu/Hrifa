import { STORAGE_KEY as settingsStorageKey } from './compositionSettings';

/**
 * Whole-page snapshots. Everything the workbench remembers (modules, their settings, routes, the
 * construction patch, transport, voices, UI state) lives in localStorage under this prefix, so a
 * snapshot is a copy of those entries and restoring one writes them back before a reload.
 */
export const workbenchStoragePrefix = 'hrifa.composition-workbench.';

/** Outside the workbench prefix, so restoring a snapshot never wipes the saved snapshots. */
export const snapshotStoreKey = 'hrifa.workbench-snapshots.v1';

const fileFormat = 'hrifa-workbench-snapshots';

export interface WorkbenchSnapshot {
  id: string;
  name: string;
  /** ISO timestamp. */
  savedAt: string;
  /** Raw localStorage values by key. Each module validates its own value when it reads it. */
  entries: Record<string, string>;
}

export interface RestoreOptions {
  /** Also restore the transport and preview voices; off keeps the current ones. */
  includeSettings: boolean;
}

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

function workbenchKeys(storage: KeyValueStorage) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(workbenchStoragePrefix)) {
      keys.push(key);
    }
  }
  return keys;
}

/** Every workbench entry currently stored. */
export function captureWorkbenchState(storage: KeyValueStorage = localStorage) {
  const entries: Record<string, string> = {};
  workbenchKeys(storage).forEach((key) => {
    const value = storage.getItem(key);
    if (value !== null) {
      entries[key] = value;
    }
  });
  return entries;
}

/**
 * Replaces the workbench's stored state with a snapshot's. Entries the snapshot lacks are removed,
 * so modules added since then disappear and missing settings fall back to defaults. Reload
 * afterwards: mounted modules don't re-read storage.
 */
export function restoreWorkbenchState(
  entries: Record<string, string>,
  { includeSettings }: RestoreOptions,
  storage: KeyValueStorage = localStorage
) {
  const keep = (key: string) => !includeSettings && key === settingsStorageKey;
  workbenchKeys(storage)
    .filter((key) => !keep(key))
    .forEach((key) => storage.removeItem(key));
  Object.entries(entries)
    .filter(([key]) => key.startsWith(workbenchStoragePrefix) && !keep(key))
    .forEach(([key, value]) => storage.setItem(key, value));
}

function isSnapshot(value: unknown): value is WorkbenchSnapshot {
  const snapshot = value as WorkbenchSnapshot;
  return (
    Boolean(snapshot) &&
    typeof snapshot === 'object' &&
    typeof snapshot.id === 'string' &&
    typeof snapshot.name === 'string' &&
    typeof snapshot.savedAt === 'string' &&
    Boolean(snapshot.entries) &&
    typeof snapshot.entries === 'object' &&
    Object.values(snapshot.entries).every((entry) => typeof entry === 'string')
  );
}

export function loadSnapshots(storage: KeyValueStorage = localStorage): WorkbenchSnapshot[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(snapshotStoreKey) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isSnapshot) : [];
  } catch {
    return [];
  }
}

/** Throws when storage is full, so the caller can suggest exporting to a file. */
export function storeSnapshots(
  snapshots: WorkbenchSnapshot[],
  storage: KeyValueStorage = localStorage
) {
  storage.setItem(snapshotStoreKey, JSON.stringify(snapshots));
}

export function createSnapshot(
  name: string,
  storage: KeyValueStorage = localStorage,
  now = new Date()
): WorkbenchSnapshot {
  return {
    id: `snapshot-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim() || `Snapshot ${now.toLocaleString()}`,
    savedAt: now.toISOString(),
    entries: captureWorkbenchState(storage),
  };
}

export function snapshotFileText(snapshots: WorkbenchSnapshot[]) {
  return JSON.stringify({ format: fileFormat, version: 1, snapshots }, null, 2);
}

/**
 * Reads an exported file. Imported snapshots get fresh ids so they never replace saved ones;
 * entries outside the workbench prefix are dropped.
 */
export function parseSnapshotFile(text: string): WorkbenchSnapshot[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const file = parsed as { format?: unknown; version?: unknown; snapshots?: unknown };
  if (!file || file.format !== fileFormat || !Array.isArray(file.snapshots)) {
    throw new Error('That file is not a workbench snapshot export.');
  }
  if (file.version !== 1) {
    throw new Error(`Unsupported snapshot file version: ${String(file.version)}.`);
  }
  return file.snapshots.filter(isSnapshot).map((snapshot, index) => ({
    ...snapshot,
    id: `snapshot-${Date.now().toString(36)}-import-${index}`,
    entries: Object.fromEntries(
      Object.entries(snapshot.entries).filter(([key]) => key.startsWith(workbenchStoragePrefix))
    ),
  }));
}
