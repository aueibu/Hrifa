import { acceptsDataBlocks, isLegacyDataBlock } from './dataBlock';
import type { StoredDataBlock } from './dataBlocks/registry';
// Registers the built-in data-block types before any stored block is checked against them.
import './dataBlocks/types';
import { migrateStoredBlocks } from './scene/sceneMigration';
import { migrateTracks } from './scene/trackMigration';

/**
 * The desk's storage: IndexedDB, by a small hand-written wrapper. Each data-block is its own record (so a
 * write touches only data-blocks that changed), plus one `order` record naming them in desk order and a
 * `rev` counter that is bumped on every write. The stored data-block is the registry's `StoredDataBlock` (a packet or a record block;
 * a record has no card on the desk yet, O0)
 * (envelope `schemaVersion` 2, with its `typeId`), lineage included. Blocks of the earlier envelope
 * (`schemaVersion` 1) are dropped on load, not migrated (baseline reset, W-60). Every operation opens and closes its own connection, and all of them run through one
 * queue, so reads and writes never interleave within a tab. Across tabs, `rev` is compared inside
 * the write transaction, so a tab never writes over a desk it has not seen.
 *
 * Saved projects live in the same database: `projects` holds each project's name, time
 * and raw workbench keys, and `project-desks` its whole desk with lineage, so listing projects
 * never reads their desks.
 */
export const DESK_DB_NAME = 'hrifa-workbench';
const DB_VERSION = 1;
const DATA_BLOCKS = 'desk-data-blocks';
const META = 'desk-meta';
const PROJECTS = 'projects';
const PROJECT_DESKS = 'project-desks';
const ORDER_KEY = 'order';
const REV_KEY = 'rev';

/** The stored desk changed (another tab wrote) since this tab last read or wrote it. */
export class DeskConflictError extends Error {
  constructor() {
    super('The desk changed in another tab. Reload to see the latest version.');
    this.name = 'DeskConflictError';
  }
}

let queue: Promise<unknown> = Promise.resolve();

/** Runs `task` after everything queued before it has finished, whether that succeeded or not. */
export function enqueueDeskTask<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

/** Resolves once every queued read and write has finished. */
export const deskStoreIdle = () => queue.then(() => undefined);

function request<T>(req: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed.'));
  });
}

function openOnce() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }
    const req = indexedDB.open(DESK_DB_NAME, DB_VERSION);
    let abandoned = false;
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DATA_BLOCKS)) {
        db.createObjectStore(DATA_BLOCKS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META);
      }
      // Saved projects.
      if (!db.objectStoreNames.contains(PROJECTS)) {
        db.createObjectStore(PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(PROJECT_DESKS)) {
        db.createObjectStore(PROJECT_DESKS, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      if (abandoned) {
        // The caller was already told this failed; a late connection must not stay open.
        req.result.close();
        return;
      }
      resolve(req.result);
    };
    req.onerror = () => reject(req.error ?? new Error('IndexedDB could not be opened.'));
    req.onblocked = () => {
      abandoned = true;
      reject(new BlockedError('IndexedDB is blocked by another tab.'));
    };
  });
}

/** How often, and how long apart, a blocked upgrade is retried before giving up. */
export const OPEN_BLOCKED_RETRIES = 2;
export const OPEN_BLOCKED_DELAY_MS = 300;

class BlockedError extends Error {}

/** Opens the database, retrying a blocked upgrade (another tab still on the old version) shortly. */
async function open(): Promise<IDBDatabase> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await openOnce();
    } catch (error) {
      if (!(error instanceof BlockedError) || attempt >= OPEN_BLOCKED_RETRIES) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, OPEN_BLOCKED_DELAY_MS));
    }
  }
}

function done(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed.'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction was aborted.'));
  });
}

async function withDb<T>(use: (db: IDBDatabase) => Promise<T>) {
  const db = await open();
  try {
    return await use(db);
  } finally {
    db.close();
  }
}

export interface DeskWrite {
  /** The whole desk in order. */
  dataBlocks: StoredDataBlock[];
  /** Data-blocks (by reference) already stored, so only changed or new ones are written. */
  stored: ReadonlyMap<string, unknown>;
  /** The `rev` this tab last read or wrote; the write is refused if the store has moved on. */
  expectedRev: number;
}

/**
 * Writes the desk atomically: changed data-blocks, removed data-blocks, the order and a bumped `rev`, in one
 * transaction. Inside that same transaction the stored `rev` is compared with `expectedRev`; on a
 * mismatch (another tab wrote) the transaction is aborted and nothing is written
 * (`DeskConflictError`). Resolves with the new rev. Call it from inside a queued task
 * (`enqueueDeskTask`); it does not queue itself.
 */
export function writeDeskNow({ dataBlocks, stored, expectedRev }: DeskWrite): Promise<number> {
  return withDb(async (db) => {
    const tx = db.transaction([DATA_BLOCKS, META], 'readwrite');
    const finished = done(tx);
    // A failure in the body aborts the transaction; the rethrow (or the await below) reports it.
    finished.catch(() => undefined);
    let nextRev = 0;
    try {
      const meta = tx.objectStore(META);
      const current = Number((await request(meta.get(REV_KEY))) ?? 0);
      if (current !== expectedRev) {
        throw new DeskConflictError();
      }
      const store = tx.objectStore(DATA_BLOCKS);
      const keep = new Set(dataBlocks.map((dataBlock) => dataBlock.id));
      dataBlocks.forEach((dataBlock) => {
        if (stored.get(dataBlock.id) !== dataBlock) {
          store.put(dataBlock);
        }
      });
      stored.forEach((_dataBlock, id) => {
        if (!keep.has(id)) {
          store.delete(id);
        }
      });
      meta.put(
        dataBlocks.map((dataBlock) => dataBlock.id),
        ORDER_KEY
      );
      nextRev = current + 1;
      meta.put(nextRev, REV_KEY);
    } catch (error) {
      // A put that throws does not abort the transaction by itself: do it, so nothing half-written
      // can commit.
      try {
        tx.abort();
      } catch {
        // Already finished or aborted.
      }
      throw error;
    }
    await finished;
    return nextRev;
  });
}

/** A short human reason for a failed storage operation. */
export function describeStorageError(error: unknown) {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return 'Browser storage is full.';
  }
  if (error instanceof Error && error.message) {
    return error.message.endsWith('.') ? error.message : `${error.message}.`;
  }
  return 'Unknown storage error.';
}

let persistRequested = false;
/** Asks the browser not to evict our storage. Once, best effort, never throws. */
export function requestPersistentStorage() {
  if (persistRequested) {
    return;
  }
  persistRequested = true;
  try {
    void navigator.storage?.persist?.().catch(() => undefined);
  } catch {
    // Not available; nothing depends on it.
  }
}

/** Test hook: lets a new test start the persist request flag fresh. */
export function resetPersistRequest() {
  persistRequested = false;
}

export interface LoadedDesk {
  dataBlocks: StoredDataBlock[];
  /** The data-blocks known to be in IndexedDB (by reference), for the next incremental write. */
  stored: Map<string, unknown>;
  /** The stored `rev` this was read at; the next write must expect it. */
  rev: number;
  /** False when the stored desk could not be read: nothing may be written over it. */
  writable: boolean;
  /** A reason to warn about, if any. */
  error?: string;
}

const storedOf = (records: { id?: unknown }[]) =>
  new Map(records.map((record) => [String(record.id), record as unknown] as const));

interface RawDesk {
  order: unknown[] | null;
  dataBlocks: { id?: unknown }[];
  rev: number;
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/**
 * Reads the desk from IndexedDB. Corrupt or newer data is left untouched. A record named in the
 * order but missing is skipped, and a record the order lacks is appended, both with a warning; only
 * unreadable or newer data locks the desk.
 */
export function loadDesk(): Promise<LoadedDesk> {
  return enqueueDeskTask(async () => {
    let raw: RawDesk;
    try {
      raw = await withDb(async (db) => {
        const tx = db.transaction([DATA_BLOCKS, META], 'readonly');
        const meta = tx.objectStore(META);
        const [order, dataBlocks, rev] = await Promise.all([
          request(meta.get(ORDER_KEY)),
          request(tx.objectStore(DATA_BLOCKS).getAll()),
          request(meta.get(REV_KEY)),
        ]);
        return {
          order: Array.isArray(order) ? (order as unknown[]) : null,
          dataBlocks: dataBlocks as { id?: unknown }[],
          rev: typeof rev === 'number' ? rev : 0,
        };
      });
    } catch (error) {
      return {
        dataBlocks: [],
        stored: new Map(),
        rev: 0,
        writable: false,
        error: `The saved desk could not be read. ${describeStorageError(error)}`,
      };
    }
    const { rev } = raw;
    if (raw.order) {
      const byId = new Map(raw.dataBlocks.map((dataBlock) => [dataBlock.id, dataBlock]));
      const records: { id?: unknown }[] = [];
      let missing = 0;
      raw.order.forEach((id) => {
        const record = byId.get(id);
        if (record === undefined) {
          missing += 1;
          return;
        }
        byId.delete(id);
        records.push(record);
      });
      const orphans = byId.size;
      records.push(...byId.values());
      // The earlier envelope is dropped, not migrated (W-60). The dropped records stay in `stored`,
      // so the next write deletes them from the database instead of leaving orphans behind.
      const dropped = records.filter(isLegacyDataBlock);
      const kept = records.filter((record) => !isLegacyDataBlock(record));
      // Objects stored with strips are unwrapped back to one placement each before they are validated (W-77). `stored`
      // keeps the records as they were saved, so the next write replaces them with the migrated ones.
      const current = migrateTracks(migrateStoredBlocks(kept));
      if (acceptsDataBlocks(current)) {
        const warnings = [
          dropped.length > 0
            ? `${dropped.length} ${plural(dropped.length, 'data-block', 'data-blocks')} from an earlier version dropped`
            : '',
          missing > 0
            ? `${missing} missing ${plural(missing, 'data-block', 'data-blocks')} skipped`
            : '',
          orphans > 0
            ? `${orphans} ${plural(orphans, 'data-block', 'data-blocks')} outside the saved order added at the end`
            : '',
        ].filter(Boolean);
        return {
          dataBlocks: current,
          stored: storedOf([...dropped, ...kept]),
          rev,
          writable: true,
          ...(warnings.length
            ? { error: `The saved desk was repaired: ${warnings.join('; ')}.` }
            : {}),
        };
      }
      return {
        dataBlocks: [],
        stored: new Map(),
        rev,
        writable: false,
        error: 'The saved desk is damaged or from a newer version, so it was left untouched.',
      };
    }
    return { dataBlocks: [], stored: new Map(), rev, writable: true };
  });
}

/** A saved project as listed: everything but its desk. */
export interface StoredProject {
  id: string;
  name: string;
  /** ISO timestamp. */
  savedAt: string;
  /** Raw localStorage values by key (the workbench's own state; never the desk). */
  entries: Record<string, string>;
  /** Whether the project holds a desk (one saved while the desk was unreadable has none). */
  hasDesk: boolean;
}

/** A saved project with its whole desk, lineage included (null: the desk is left as it is on open). */
export interface ProjectRecord extends Omit<StoredProject, 'hasDesk'> {
  desk: StoredDataBlock[] | null;
}

/** Projects, newest first. Reads no desks. */
export function listProjects(): Promise<StoredProject[]> {
  return enqueueDeskTask(() =>
    withDb(async (db) => {
      const tx = db.transaction([PROJECTS], 'readonly');
      const all = (await request(tx.objectStore(PROJECTS).getAll())) as StoredProject[];
      return all.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
    })
  );
}

/**
 * Stores projects (new or replacing the same id), each with its desk, all in one transaction: either
 * every project is written or none. Resolves once committed.
 */
export function putProjects(projects: ProjectRecord[]): Promise<void> {
  return enqueueDeskTask(() => putProjectsNow(projects));
}

/** `putProjects` for use inside a queued task. */
export function putProjectsNow(projects: ProjectRecord[]): Promise<void> {
  return withDb(async (db) => {
    const tx = db.transaction([PROJECTS, PROJECT_DESKS], 'readwrite');
    const finished = done(tx);
    finished.catch(() => undefined);
    try {
      const meta = tx.objectStore(PROJECTS);
      const desks = tx.objectStore(PROJECT_DESKS);
      for (const { desk, ...rest } of projects) {
        meta.put({ ...rest, hasDesk: desk !== null } satisfies StoredProject);
        if (desk === null) {
          desks.delete(rest.id);
        } else {
          desks.put({ id: rest.id, desk });
        }
      }
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // Already finished or aborted.
      }
      throw error;
    }
    await finished;
  });
}

/** One project with its desk, or null when it no longer exists. Throws if its desk is unreadable. */
export function getProject(id: string): Promise<ProjectRecord | null> {
  return enqueueDeskTask(() =>
    withDb(async (db) => {
      const tx = db.transaction([PROJECTS, PROJECT_DESKS], 'readonly');
      const [meta, desks] = await Promise.all([
        request(tx.objectStore(PROJECTS).get(id)) as Promise<StoredProject | undefined>,
        request(tx.objectStore(PROJECT_DESKS).get(id)) as Promise<
          { id: string; desk: unknown } | undefined
        >,
      ]);
      if (!meta) {
        return null;
      }
      const { hasDesk, ...rest } = meta;
      if (!hasDesk) {
        return { ...rest, desk: null };
      }
      // A desk saved before the registry rebuild (earlier envelope) opens empty: nothing migrates (W-60).
      const desk = Array.isArray(desks?.desk)
        ? migrateTracks(
            migrateStoredBlocks(
              (desks.desk as unknown[]).filter((entry) => !isLegacyDataBlock(entry))
            )
          )
        : undefined;
      if (!desk || !acceptsDataBlocks(desk)) {
        throw new Error('The saved desk in this project is damaged or from a newer version.');
      }
      return { ...rest, desk };
    })
  );
}

export function deleteProject(id: string): Promise<void> {
  return enqueueDeskTask(() =>
    withDb(async (db) => {
      const tx = db.transaction([PROJECTS, PROJECT_DESKS], 'readwrite');
      const finished = done(tx);
      tx.objectStore(PROJECTS).delete(id);
      tx.objectStore(PROJECT_DESKS).delete(id);
      await finished;
    })
  );
}

export function renameProject(id: string, name: string): Promise<void> {
  return enqueueDeskTask(() =>
    withDb(async (db) => {
      const tx = db.transaction([PROJECTS], 'readwrite');
      const finished = done(tx);
      const store = tx.objectStore(PROJECTS);
      const current = (await request(store.get(id))) as StoredProject | undefined;
      if (current) {
        store.put({ ...current, name });
      }
      await finished;
    })
  );
}
