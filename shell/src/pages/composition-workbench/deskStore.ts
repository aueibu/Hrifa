import { acceptsSnippets, type Snippet } from './snippet';

/**
 * The desk's storage: IndexedDB, by a small hand-written wrapper. Each clip is its own record (so a
 * write touches only clips that changed), plus one `order` record naming them in desk order and a
 * `rev` counter that is bumped on every write. The stored clip is the v1 `Snippet`, lineage
 * included. Every operation opens and closes its own connection, and all of them run through one
 * queue, so reads and writes never interleave within a tab. Across tabs, `rev` is compared inside
 * the write transaction, so a tab never writes over a desk it has not seen.
 *
 * Saved projects live in the same database (version 2): `projects` holds each project's name, time
 * and raw workbench keys, and `project-desks` its whole desk with lineage, so listing projects
 * never reads their desks.
 */
export const DESK_DB_NAME = 'hrifa-composition-workbench';
const DB_VERSION = 2;
const CLIPS = 'desk-clips';
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
      if (!db.objectStoreNames.contains(CLIPS)) {
        db.createObjectStore(CLIPS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META);
      }
      // Version 2: saved projects. A version 1 database keeps its desk untouched.
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
  snippets: Snippet[];
  /** Clips (by reference) already stored, so only changed or new ones are written. */
  stored: ReadonlyMap<string, Snippet>;
  /** The `rev` this tab last read or wrote; the write is refused if the store has moved on. */
  expectedRev: number;
}

/**
 * Writes the desk atomically: changed clips, removed clips, the order and a bumped `rev`, in one
 * transaction. Inside that same transaction the stored `rev` is compared with `expectedRev`; on a
 * mismatch (another tab wrote) the transaction is aborted and nothing is written
 * (`DeskConflictError`). Resolves with the new rev. Call it from inside a queued task
 * (`enqueueDeskTask`); it does not queue itself.
 */
export function writeDeskNow({ snippets, stored, expectedRev }: DeskWrite): Promise<number> {
  return withDb(async (db) => {
    const tx = db.transaction([CLIPS, META], 'readwrite');
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
      const clips = tx.objectStore(CLIPS);
      const keep = new Set(snippets.map((snippet) => snippet.id));
      snippets.forEach((snippet) => {
        if (stored.get(snippet.id) !== snippet) {
          clips.put(snippet);
        }
      });
      stored.forEach((_snippet, id) => {
        if (!keep.has(id)) {
          clips.delete(id);
        }
      });
      meta.put(
        snippets.map((snippet) => snippet.id),
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
  snippets: Snippet[];
  /** The clips known to be in IndexedDB (by reference), for the next incremental write. */
  stored: Map<string, Snippet>;
  /** The stored `rev` this was read at; the next write must expect it. */
  rev: number;
  /** False when the stored desk could not be read: nothing may be written over it. */
  writable: boolean;
  /** A reason to warn about, if any. */
  error?: string;
  /** Set while a localStorage desk is in memory but not yet safely in IndexedDB. */
  pendingLegacyKey?: string;
}

const storedOf = (snippets: Snippet[]) =>
  new Map(snippets.map((snippet) => [snippet.id, snippet] as const));

/** Removes the localStorage copy of the desk once IndexedDB holds it. Never throws. */
export function removeLegacyDesk(legacyKey: string) {
  try {
    localStorage.removeItem(legacyKey);
  } catch {
    // The copy is in IndexedDB now; a stale key is harmless.
  }
}

interface RawDesk {
  order: unknown[] | null;
  clips: { id?: unknown }[];
  rev: number;
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/**
 * Reads the desk, and on first use moves a v1 desk over from localStorage: copied into IndexedDB
 * first, and the localStorage key removed only once that write succeeded (if the copy fails, the key
 * is reported as pending so a later successful write removes it). Corrupt or newer data in either
 * place is left untouched. A record named in the order but missing is skipped, and a record the
 * order lacks is appended, both with a warning; only unreadable or newer data locks the desk.
 */
export function loadDesk(legacyKey: string): Promise<LoadedDesk> {
  return enqueueDeskTask(async () => {
    let raw: RawDesk;
    try {
      raw = await withDb(async (db) => {
        const tx = db.transaction([CLIPS, META], 'readonly');
        const meta = tx.objectStore(META);
        const [order, clips, rev] = await Promise.all([
          request(meta.get(ORDER_KEY)),
          request(tx.objectStore(CLIPS).getAll()),
          request(meta.get(REV_KEY)),
        ]);
        return {
          order: Array.isArray(order) ? (order as unknown[]) : null,
          clips: clips as { id?: unknown }[],
          rev: typeof rev === 'number' ? rev : 0,
        };
      });
    } catch (error) {
      return {
        snippets: [],
        stored: new Map(),
        rev: 0,
        writable: false,
        error: `The saved desk could not be read. ${describeStorageError(error)}`,
      };
    }
    const { rev } = raw;
    if (raw.order) {
      const byId = new Map(raw.clips.map((clip) => [clip.id, clip]));
      const records: unknown[] = [];
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
      if (acceptsSnippets(records)) {
        const warnings = [
          missing > 0 ? `${missing} missing ${plural(missing, 'clip', 'clips')} skipped` : '',
          orphans > 0
            ? `${orphans} ${plural(orphans, 'clip', 'clips')} outside the saved order added at the end`
            : '',
        ].filter(Boolean);
        return {
          snippets: records,
          stored: storedOf(records),
          rev,
          writable: true,
          ...(warnings.length
            ? { error: `The saved desk was repaired: ${warnings.join('; ')}.` }
            : {}),
        };
      }
      return {
        snippets: [],
        stored: new Map(),
        rev,
        writable: false,
        error: 'The saved desk is damaged or from a newer version, so it was left untouched.',
      };
    }
    let legacy: Snippet[] | null = null;
    try {
      const text = localStorage.getItem(legacyKey);
      if (text !== null) {
        const parsed: unknown = JSON.parse(text);
        legacy = acceptsSnippets(parsed) ? parsed : null;
      }
    } catch {
      legacy = null;
    }
    if (!legacy || legacy.length === 0) {
      return { snippets: [], stored: new Map(), rev, writable: true };
    }
    let written: number;
    try {
      written = await writeDeskNow({ snippets: legacy, stored: new Map(), expectedRev: rev });
    } catch (error) {
      // Keep working from memory; the localStorage copy stays until a write succeeds.
      return {
        snippets: legacy,
        stored: new Map(),
        rev,
        writable: true,
        error: describeStorageError(error),
        pendingLegacyKey: legacyKey,
      };
    }
    removeLegacyDesk(legacyKey);
    return { snippets: legacy, stored: storedOf(legacy), rev: written, writable: true };
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
  desk: Snippet[] | null;
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
      if (!desks || !acceptsSnippets(desks.desk)) {
        throw new Error('The saved desk in this project is damaged or from a newer version.');
      }
      return { ...rest, desk: desks.desk };
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
