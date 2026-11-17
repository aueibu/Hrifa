/**
 * Keeps the user's reverb impulse in IndexedDB (A1, H-31; localStorage is too small for up to 8 MB of samples). One record,
 * `reverb-ir`: the file name, the sample rate and the decoded channels as Float32Arrays. Lab-local (the Workbench's soundfont
 * store is another page's code and keeps a file handle, not data).
 *
 * Failure-tolerant by design: every call is in try/catch and a failure means "no stored impulse" (`load` gives null, `save` and
 * `remove` give false). Without IndexedDB (a private window, an old browser, Node) all three are harmless.
 */
import { parseStoredImpulse, type ImpulseData } from './reverb';

const DATABASE = 'hrifa.harmonic-field-lab.audio';
const STORE = 'kv';
export const IMPULSE_KEY = 'reverb-ir';

function factory(): IDBFactory | null {
  try {
    return typeof indexedDB === 'undefined' ? null : indexedDB;
  } catch {
    return null;
  }
}

function open(idb: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = idb.open(DATABASE, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('blocked'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const idb = factory();
  if (!idb) {
    throw new Error('IndexedDB is not available');
  }
  const db = await open(idb);
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      // a write is done when the transaction completes, a read when the request does
      if (mode === 'readwrite') {
        tx.oncomplete = () => resolve(req.result);
        tx.onabort = () => reject(tx.error ?? new Error('aborted'));
      } else {
        req.onsuccess = () => resolve(req.result);
      }
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** The stored impulse, or null when there is none, it cannot be read, or it is not a valid impulse. */
export async function loadImpulse(): Promise<ImpulseData | null> {
  try {
    return parseStoredImpulse(await withStore('readonly', (s) => s.get(IMPULSE_KEY)));
  } catch {
    return null;
  }
}

/** Keep `imp` as the one stored impulse. False when it could not be stored (the impulse still works for this visit). */
export async function saveImpulse(imp: ImpulseData): Promise<boolean> {
  try {
    await withStore('readwrite', (s) =>
      s.put({ name: imp.name, sampleRate: imp.sampleRate, channels: imp.channels }, IMPULSE_KEY)
    );
    return true;
  } catch {
    return false;
  }
}

/** Delete the stored impulse. False when that failed (or there was no storage). */
export async function deleteImpulse(): Promise<boolean> {
  try {
    await withStore('readwrite', (s) => s.delete(IMPULSE_KEY));
    return true;
  } catch {
    return false;
  }
}
