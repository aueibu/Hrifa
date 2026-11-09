/**
 * Remembers which SoundFont file the user opened, so a page refresh does not mean picking it again.
 *
 * Chromium browsers let a page keep a handle to a file the user chose (File System Access API) and store it in
 * IndexedDB. The file's bytes are not copied: after a reload the page asks the browser for read permission on
 * the handle (which needs a click, unless the user chose "allow on every visit") and reads the file where it
 * already is. Browsers without the API keep the plain file picker, and nothing is remembered.
 */

/** The part of a File System Access file handle used here. */
export interface FileHandleLike {
  readonly name: string;
  getFile(): Promise<File>;
  queryPermission?(descriptor: { mode: 'read' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'read' }): Promise<PermissionState>;
}

export interface SavedSoundfont {
  name: string;
  size: number;
  handle: FileHandleLike;
}

const DATABASE = 'hrifa.soundfonts';
const STORE = 'handles';
const KEY = 'last';

type PickerWindow = Window & {
  showOpenFilePicker?: (options: {
    multiple?: boolean;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<FileHandleLike[]>;
};

/** True when the browser can hand back a persistent file handle. */
export const canRememberFiles = () =>
  typeof window !== 'undefined' &&
  typeof (window as PickerWindow).showOpenFilePicker === 'function' &&
  typeof indexedDB !== 'undefined';

/** Ask the user for a .sf2 file and return its handle, or null if they cancel. */
export async function pickSoundfontHandle(): Promise<FileHandleLike | null> {
  try {
    const [handle] = await (window as PickerWindow).showOpenFilePicker!({
      multiple: false,
      types: [{ description: 'SoundFont', accept: { 'application/octet-stream': ['.sf2'] } }],
    });
    return handle ?? null;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return null;
    }
    throw error;
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

/** Remember a file for the next visit. Failures are swallowed: remembering is a convenience. */
export async function saveSoundfontHandle(entry: SavedSoundfont): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.put(entry, KEY));
  } catch {
    // storage blocked or full: the file simply will not be remembered
  }
}

export async function loadSavedSoundfont(): Promise<SavedSoundfont | null> {
  if (!canRememberFiles()) {
    return null;
  }
  try {
    const saved = await withStore<SavedSoundfont | undefined>('readonly', (store) =>
      store.get(KEY)
    );
    return saved?.handle ? saved : null;
  } catch {
    return null;
  }
}

export async function forgetSavedSoundfont(): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(KEY));
  } catch {
    // nothing to forget
  }
}

/**
 * Whether the page may read a saved file right now. `prompt` means a click can ask the user; `denied` means
 * they refused (the file has to be picked again).
 */
export async function soundfontPermission(handle: FileHandleLike): Promise<PermissionState> {
  return (await handle.queryPermission?.({ mode: 'read' })) ?? 'prompt';
}

/** Ask for read permission. Must be called from a click. */
export async function requestSoundfontPermission(handle: FileHandleLike): Promise<PermissionState> {
  return (await handle.requestPermission?.({ mode: 'read' })) ?? 'denied';
}
