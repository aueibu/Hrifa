import { useCallback, useEffect, useRef, useState } from 'react';
import {
  loadSoundfontData,
  loadSoundfontFile,
  type SoundfontInfo,
} from '../composition-workbench/audio/soundfontLibrary';
import {
  canRememberFiles,
  forgetSavedSoundfont,
  loadSavedSoundfont,
  pickSoundfontHandle,
  requestSoundfontPermission,
  saveSoundfontHandle,
  soundfontPermission,
  type FileHandleLike,
  type SavedSoundfont,
} from '../composition-workbench/audio/soundfontStore';

export interface SoundfontState {
  /** The opened file, once parsed. */
  info: SoundfontInfo | null;
  /** A file is being read and parsed (large files take a few seconds). */
  loading: boolean;
  error: string | null;
  /** A file remembered from an earlier visit that needs a click to read again. */
  remembered: { name: string } | null;
  /** Where the open file came from: the dev server's local folder, or a file the user chose. */
  source: 'local-folder' | 'chosen' | null;
  /** The browser can remember the file between visits. */
  canRemember: boolean;
}

const LOCAL_FOLDER = `${import.meta.env.BASE_URL}local-soundfonts/`;

/**
 * Some browsers (and embedded Chromium views) offer the file picker but refuse to read the file it returns,
 * or to restore a remembered file. Once that happens the picker is dropped for the ordinary file dialog, and
 * the choice is remembered so the page does not keep failing.
 */
const BLOCKED_KEY = 'hrifa.scale-explorer.file-handles-blocked.v1';
const BLOCKED_MESSAGE =
  'This browser would not let the page read the file directly. Click Open SoundFont… again to choose it with the standard file dialog; it will not be remembered between visits.';

function handlesBlocked(): boolean {
  try {
    return localStorage.getItem(BLOCKED_KEY) === '1';
  } catch {
    return false;
  }
}

function markHandlesBlocked() {
  try {
    localStorage.setItem(BLOCKED_KEY, '1');
  } catch {
    // best effort: without storage the failure just repeats next visit
  }
}

class HandleBlockedError extends Error {}

const isBlockedError = (e: unknown) =>
  e instanceof HandleBlockedError ||
  (e instanceof DOMException &&
    ['NotAllowedError', 'SecurityError', 'NotSupportedError'].includes(e.name));

const messageOf = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** Dev server only: the chosen .sf2 in the local folder, so a refresh needs no picking at all. */
async function loadFromLocalFolder(): Promise<SoundfontInfo | null> {
  if (!import.meta.env.DEV) {
    return null;
  }
  try {
    const listing = await fetch(`${LOCAL_FOLDER}index.json`);
    if (!listing.ok || !listing.headers.get('content-type')?.includes('json')) {
      return null;
    }
    const { files, preferred } = (await listing.json()) as {
      files: { name: string }[];
      preferred: string | null;
    };
    // only auto-load an unambiguous choice: the named file, or the only one in the folder
    const chosen =
      files.find((f) => f.name === preferred) ?? (files.length === 1 ? files[0] : null);
    if (!chosen) {
      return null;
    }
    const response = await fetch(`${LOCAL_FOLDER}${encodeURIComponent(chosen.name)}`);
    if (!response.ok) {
      return null;
    }
    return await loadSoundfontData(chosen.name, new Uint8Array(await response.arrayBuffer()));
  } catch {
    return null;
  }
}

/**
 * Opens .sf2 files for the Scale Explorer. A file loads from, in order: the dev server's local folder, a file
 * remembered from an earlier visit (read directly when the browser still allows it, otherwise after one
 * click on Reconnect), or a file the user picks. The parsed file stays in the shared soundfont library until
 * the page reloads.
 */
export function useSoundfont() {
  const [state, setState] = useState<SoundfontState>({
    info: null,
    loading: false,
    error: null,
    remembered: null,
    source: null,
    canRemember: canRememberFiles() && !handlesBlocked(),
  });
  const saved = useRef<SavedSoundfont | null>(null);
  const started = useRef(false);

  const run = useCallback(async (load: () => Promise<SoundfontInfo | null>, fallback: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const info = await load();
      setState((prev) => ({
        ...prev,
        info: info ?? prev.info,
        source: info ? 'chosen' : prev.source,
        loading: false,
        remembered: info ? null : prev.remembered,
      }));
      return info;
    } catch (e) {
      if (isBlockedError(e)) {
        markHandlesBlocked();
        saved.current = null;
        void forgetSavedSoundfont();
        setState((prev) => ({
          ...prev,
          loading: false,
          canRemember: false,
          remembered: null,
          error: BLOCKED_MESSAGE,
        }));
        return null;
      }
      setState((prev) => ({ ...prev, loading: false, error: messageOf(e, fallback) }));
      return null;
    }
  }, []);

  const readHandle = useCallback(
    (handle: FileHandleLike) =>
      run(async () => {
        let file: File;
        try {
          file = await handle.getFile();
        } catch (e) {
          throw isBlockedError(e) ? new HandleBlockedError() : e;
        }
        const info = await loadSoundfontFile(file);
        await saveSoundfontHandle({ name: file.name, size: file.size, handle });
        return info;
      }, 'Could not read that SoundFont file.'),
    [run]
  );

  // On start: the dev folder first, then a remembered file (silently if the browser still allows it).
  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    void (async () => {
      if (await run(loadFromLocalFolder, 'Could not read the local SoundFont.')) {
        setState((prev) => ({ ...prev, source: 'local-folder' }));
        return;
      }
      const remembered = await loadSavedSoundfont();
      if (!remembered) {
        return;
      }
      saved.current = remembered;
      let permission: PermissionState = 'prompt';
      try {
        permission = await soundfontPermission(remembered.handle);
      } catch {
        // permission could not even be queried: offer Reconnect and let that click decide
      }
      if (permission === 'granted') {
        await readHandle(remembered.handle);
      } else {
        setState((prev) => ({ ...prev, remembered: { name: remembered.name } }));
      }
    })();
  }, [run, readHandle]);

  /** Pick a file. With the File System Access API the choice is remembered. */
  const pick = useCallback(async () => {
    try {
      const handle = await pickSoundfontHandle();
      if (handle) {
        await readHandle(handle);
      }
    } catch (e) {
      if (isBlockedError(e)) {
        markHandlesBlocked();
        setState((prev) => ({ ...prev, canRemember: false, error: BLOCKED_MESSAGE }));
      } else {
        setState((prev) => ({ ...prev, error: messageOf(e, 'Could not open the file picker.') }));
      }
    }
  }, [readHandle]);

  /** For browsers without file handles: a file from an ordinary input. Not remembered. */
  const openFile = useCallback(
    (file: File) => run(() => loadSoundfontFile(file), 'Could not read that SoundFont file.'),
    [run]
  );

  /** Read the remembered file again. Needs a click so the browser can ask for permission. */
  const reconnect = useCallback(async () => {
    const remembered = saved.current;
    if (!remembered) {
      return;
    }
    let permission: PermissionState;
    try {
      permission = await requestSoundfontPermission(remembered.handle);
    } catch {
      markHandlesBlocked();
      saved.current = null;
      void forgetSavedSoundfont();
      setState((prev) => ({
        ...prev,
        canRemember: false,
        remembered: null,
        error: BLOCKED_MESSAGE,
      }));
      return;
    }
    if (permission === 'granted') {
      await readHandle(remembered.handle);
    } else {
      setState((prev) => ({
        ...prev,
        error: 'Access to the remembered SoundFont was not allowed. Open the file again.',
      }));
    }
  }, [readHandle]);

  const forget = useCallback(async () => {
    saved.current = null;
    await forgetSavedSoundfont();
    setState((prev) => ({ ...prev, remembered: null }));
  }, []);

  return { ...state, pick, openFile, reconnect, forget };
}
