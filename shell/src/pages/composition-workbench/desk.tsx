import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  describeStorageError,
  enqueueDeskTask,
  loadDesk,
  removeLegacyDesk,
  requestPersistentStorage,
  writeDeskNow,
} from './deskStore';
import { recordChange, registerHistoryApplier, type HistoryChange } from './history';
import type { DataPacket } from './model';
import {
  commitSnippetEdit,
  createClipFromVersion,
  convertSnippetToPitchClass,
  duplicateSnippet,
  editSnippetNote,
  endEditSession as endSnippetEditSession,
  restoreSnippetVersion,
  type PitchClassConversionResult,
  type Snippet,
  type SnippetEditResult,
} from './snippet';
import { compositionStateKeys } from './usePersistentState';

/** Desk writes closer together than this are one write. */
export const DESK_WRITE_DEBOUNCE_MS = 150;

/** While a gesture is coalescing edits (a drag, typing), writes wait for it to pause this long. */
export const DESK_GESTURE_WRITE_DEBOUNCE_MS = 1000;

/**
 * The desk: snippets set aside for reuse, kept per browser. One provider at the workbench root so
 * every module sends to, and every view reads from, the same list.
 */
interface DeskContextValue {
  snippets: Snippet[];
  /** True until the saved desk has been read; changes are refused until then. */
  loading: boolean;
  /**
   * True once loaded when the saved desk could not be read (damaged or newer): it is empty here and
   * nothing is ever written over it.
   */
  locked: boolean;
  /**
   * Why the last desk save failed, or null. Set on any failed write (or an unreadable saved desk) and
   * cleared by the next successful write; the desk shows it as a warning.
   */
  persistError: string | null;
  /**
   * Writes any pending change now. Resolves true when the stored desk is current, false when the
   * save failed or the desk has not loaded.
   */
  flushDesk(): Promise<boolean>;
  /**
   * Replaces the whole desk (opening a saved project): every clip and its lineage, written to
   * IndexedDB in one transaction. Not an undo step (opening a project reloads the page). Refused
   * while the desk is loading or locked; on any failure (write error, another tab changed the desk)
   * nothing is stored and the desk on screen is unchanged, and the reason comes back.
   */
  replaceDesk(
    snippets: Snippet[],
    options?: ReplaceDeskOptions
  ): Promise<{ ok: true } | { ok: false; error: string }>;
  /**
   * Ends the clip's hand-edit session so its next edit starts a new version (an editor calls this
   * when it closes or another clip becomes its target). Idle time and a different operation end a
   * session too.
   */
  endEditSession(snippetId: string): void;
  addSnippet(snippet: Snippet): void;
  removeSnippet(id: string): void;
  renameSnippet(id: string, name: string): void;
  setSnippetNote(id: string, note: string): void;
  /** Adds a copy named `<name> (variation)` directly after the original. */
  duplicateSnippetById(id: string): void;
  /**
   * Adds a pitch-class copy (in the given EDO) directly after the original. Returns the conversion
   * result: `ok` when the copy was added, a refusal, or `needsSnap` when pitches are off the EDO
   * grid and `snap` was not set. The original is never changed.
   */
  convertToPitchClassById(
    id: string,
    options: { edo: number; snap?: boolean }
  ): PitchClassConversionResult;
  /**
   * The edit contract: replace the snippet's packet in place (same id, name and position), adding an
   * `operation` provenance step to each added or modified item. One global undo step per gesture. A packet
   * deeply equal to the current one changes nothing (`ok`, no history entry); an invalid packet or
   * an unknown id is refused and the desk is untouched. A `coalesceKey` makes a gesture's edits one
   * undo step (undo is per gesture; versions are per edit session, see `commitSnippetEdit`).
   */
  commitSnippetEditById(
    id: string,
    newPacket: DataPacket,
    operation: string,
    options?: { coalesceKey?: string; handEdit?: boolean }
  ): SnippetEditResult;
  /** Moves the clip back (or forward) to a kept version; same clip, one undo step. */
  restoreSnippetVersionById(id: string, versionId: string): SnippetEditResult;
  /** Adds a new clip made from a version, directly after the original. Returns it. */
  createClipFromVersionById(id: string, versionId: string): SnippetEditResult;
}

export interface ReplaceDeskOptions {
  /**
   * The page is about to reload from storage: write the desk but leave the one on screen alone, and
   * stop all later desk writes (debounce, pagehide, unmount) so nothing can overwrite it.
   */
  reloading?: boolean;
  /**
   * Put storage back to a desk (after a failed open): written even though a `reloading` write froze
   * the desk, which then writes again.
   */
  restore?: boolean;
}

const DeskContext = createContext<DeskContextValue | undefined>(undefined);

/**
 * One undo step's worth of desk change: the clips that changed (by id, null when absent on that
 * side) and the order. Unchanged clips are not copied, so a step costs what it changed.
 */
interface DeskSide {
  order: string[];
  snippets: Record<string, Snippet | null>;
}

let deskStepCount = 0;

function deskStep(before: Snippet[], after: Snippet[]): HistoryChange {
  const was = new Map(before.map((snippet) => [snippet.id, snippet]));
  const now = new Map(after.map((snippet) => [snippet.id, snippet]));
  const previous: DeskSide = { order: before.map((snippet) => snippet.id), snippets: {} };
  const next: DeskSide = { order: after.map((snippet) => snippet.id), snippets: {} };
  new Set([...was.keys(), ...now.keys()]).forEach((id) => {
    if (was.get(id) !== now.get(id)) {
      previous.snippets[id] = was.get(id) ?? null;
      next.snippets[id] = now.get(id) ?? null;
    }
  });
  deskStepCount += 1;
  return {
    key: compositionStateKeys.desk,
    // Not a stored string: the desk lives in IndexedDB. The tokens only mark that the step changed.
    previous: `desk-${deskStepCount - 1}`,
    next: `desk-${deskStepCount}`,
    virtual: true,
    previousValue: previous,
    nextValue: next,
    mergeValues(existing, incoming) {
      const earlier = existing.previousValue as DeskSide;
      const later = incoming.previousValue as DeskSide;
      // What each clip was before the whole burst: the earliest side wins.
      Object.entries(later.snippets).forEach(([id, snippet]) => {
        if (!(id in earlier.snippets)) {
          earlier.snippets[id] = snippet;
        }
      });
      const final = incoming.nextValue as DeskSide;
      const merged = existing.nextValue as DeskSide;
      existing.nextValue = {
        order: final.order,
        snippets: { ...merged.snippets, ...final.snippets },
      };
    },
  };
}

export function DeskProvider({ children }: { children: ReactNode }) {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  // Undo and redo are workbench-wide (history.ts); the desk only records through it. The refs let
  // several changes in one event see each other.
  const snippetsRef = useRef(snippets);
  const loadedRef = useRef(false);
  // False when the stored desk could not be read: it is left alone, nothing is ever written over it.
  const writableRef = useRef(false);
  // The clips as last written (by reference), and the list that was current then.
  const storedRef = useRef<Map<string, Snippet>>(new Map());
  const settledRef = useRef<Snippet[] | null>(null);
  // The store's rev as this tab last read or wrote it; a write is refused if another tab moved it.
  const revRef = useRef(0);
  // Set while a localStorage desk is not yet written to IndexedDB; removed after the first write.
  const legacyKeyRef = useRef<string | null>(null);
  const timerRef = useRef<number | undefined>(undefined);
  // Whether the latest change belongs to a gesture (it waits longer before writing).
  const gestureRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void loadDesk(compositionStateKeys.desk).then((result) => {
      if (cancelled) {
        return;
      }
      snippetsRef.current = result.snippets;
      storedRef.current = result.stored;
      revRef.current = result.rev;
      legacyKeyRef.current = result.pendingLegacyKey ?? null;
      // A desk only in memory (failed migration) is unsettled, so the first write retries it.
      settledRef.current = result.pendingLegacyKey ? null : result.snippets;
      writableRef.current = result.writable;
      loadedRef.current = true;
      setSnippets(result.snippets);
      setLocked(!result.writable);
      setPersistError(result.error ?? null);
      setLoaded(true);
      requestPersistentStorage();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Queues a write of the latest desk. Serialised with every other desk read and write. */
  const flushNow = useCallback((): Promise<boolean> => {
    window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
    if (!loadedRef.current || !writableRef.current) {
      return Promise.resolve(false);
    }
    return enqueueDeskTask(async () => {
      const target = snippetsRef.current;
      if (!writableRef.current) {
        return false;
      }
      if (target === settledRef.current) {
        return true;
      }
      try {
        revRef.current = await writeDeskNow({
          snippets: target,
          stored: storedRef.current,
          expectedRev: revRef.current,
        });
        storedRef.current = new Map(target.map((snippet) => [snippet.id, snippet]));
        settledRef.current = target;
        if (legacyKeyRef.current) {
          removeLegacyDesk(legacyKeyRef.current);
          legacyKeyRef.current = null;
        }
        setPersistError(null);
        return true;
      } catch (error) {
        setPersistError(describeStorageError(error));
        return false;
      }
    });
  }, []);

  // Any change after load is written, lightly debounced. The first effect run after load finds the
  // list already settled, so loading never writes.
  useEffect(() => {
    if (!loaded || snippets === settledRef.current) {
      return;
    }
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(
      () => void flushNow(),
      gestureRef.current ? DESK_GESTURE_WRITE_DEBOUNCE_MS : DESK_WRITE_DEBOUNCE_MS
    );
  }, [loaded, snippets, flushNow]);

  // Leaving (unmount or closing the page) writes what is pending.
  useEffect(() => {
    const onHide = () => void flushNow();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      void flushNow();
    };
  }, [flushNow]);

  // Undo and redo hand a step's side back here.
  useEffect(
    () =>
      registerHistoryApplier(compositionStateKeys.desk, (_raw, value) => {
        const side = value as DeskSide | undefined;
        if (!side || !loadedRef.current || !writableRef.current) {
          return false;
        }
        const live = new Map(snippetsRef.current.map((snippet) => [snippet.id, snippet]));
        const next: Snippet[] = [];
        for (const id of side.order) {
          const snippet = id in side.snippets ? side.snippets[id] : live.get(id);
          if (!snippet) {
            return false;
          }
          next.push(snippet);
        }
        snippetsRef.current = next;
        setSnippets(next);
        return true;
      }),
    []
  );

  /**
   * The single path for every desk change. `updater` returns the next list, or the same array to
   * change nothing (no history entry). A real change records a snippet-level step in the shared
   * history. Refused while the saved desk is still loading, so it can never be overwritten.
   */
  const applyChange = useCallback(
    (
      updater: (current: Snippet[]) => Snippet[],
      options: { coalesce?: boolean; coalesceKey?: string } = {}
    ) => {
      // A locked desk (unreadable saved desk) or one frozen for a project open never saves, so an
      // edit there would be lost on reload: refuse it.
      if (!loadedRef.current || !writableRef.current) {
        return;
      }
      const current = snippetsRef.current;
      const next = updater(current);
      if (next === current) {
        return;
      }
      snippetsRef.current = next;
      gestureRef.current = options.coalesce ?? false;
      setSnippets(next);
      recordChange(deskStep(current, next), {
        coalesce: options.coalesce ?? false,
        coalesceKey: options.coalesceKey,
      });
    },
    []
  );

  const addSnippet = useCallback(
    (snippet: Snippet) => applyChange((current) => [...current, snippet]),
    [applyChange]
  );
  const removeSnippet = useCallback(
    (id: string) =>
      applyChange((current) => {
        const next = current.filter((snippet) => snippet.id !== id);
        return next.length === current.length ? current : next;
      }),
    [applyChange]
  );
  const renameSnippet = useCallback(
    (id: string, name: string) =>
      applyChange((current) =>
        current.some((snippet) => snippet.id === id && snippet.name !== name)
          ? current.map((snippet) => (snippet.id === id ? { ...snippet, name } : snippet))
          : current
      ),
    [applyChange]
  );
  const setSnippetNote = useCallback(
    (id: string, note: string) =>
      applyChange((current) => {
        const target = current.find((snippet) => snippet.id === id);
        if (!target) {
          return current;
        }
        const edited = editSnippetNote(target, note);
        return edited.note === target.note
          ? current
          : current.map((snippet) => (snippet.id === id ? edited : snippet));
      }),
    [applyChange]
  );
  const duplicateSnippetById = useCallback(
    (id: string) => {
      const request = { id: newSnippetId(), createdAt: new Date().toISOString() };
      applyChange((current) => {
        const index = current.findIndex((snippet) => snippet.id === id);
        if (index < 0) {
          return current;
        }
        const next = [...current];
        next.splice(index + 1, 0, duplicateSnippet(current[index], request));
        return next;
      });
    },
    [applyChange]
  );
  const convertToPitchClassById = useCallback(
    (id: string, options: { edo: number; snap?: boolean }): PitchClassConversionResult => {
      const source = snippetsRef.current.find((snippet) => snippet.id === id);
      if (!source) {
        return { ok: false, error: 'That snippet is no longer on the desk.' };
      }
      const result = convertSnippetToPitchClass(source, {
        id: newSnippetId(),
        createdAt: new Date().toISOString(),
        ...options,
      });
      if (!result.ok) {
        return result;
      }
      applyChange((current) => {
        const index = current.findIndex((snippet) => snippet.id === id);
        if (index < 0) {
          return current;
        }
        const next = [...current];
        next.splice(index + 1, 0, result.snippet);
        return next;
      });
      return result;
    },
    [applyChange]
  );
  const commitSnippetEditById = useCallback(
    (
      id: string,
      newPacket: DataPacket,
      operation: string,
      options?: { coalesceKey?: string; handEdit?: boolean }
    ): SnippetEditResult => {
      const target = snippetsRef.current.find((snippet) => snippet.id === id);
      if (!target) {
        return { ok: false, error: 'That snippet is no longer on the desk.' };
      }
      const result = commitSnippetEdit(target, newPacket, operation, {
        handEdit: options?.handEdit,
      });
      if (!result.ok) {
        return result;
      }
      if (result.snippet === target) {
        return result;
      }
      applyChange(
        (current) =>
          current.some((snippet) => snippet.id === id)
            ? current.map((snippet) => (snippet.id === id ? result.snippet : snippet))
            : current,
        { coalesce: options?.coalesceKey !== undefined, coalesceKey: options?.coalesceKey }
      );
      return result;
    },
    [applyChange]
  );
  const restoreSnippetVersionById = useCallback(
    (id: string, versionId: string): SnippetEditResult => {
      const target = snippetsRef.current.find((snippet) => snippet.id === id);
      if (!target) {
        return { ok: false, error: 'That snippet is no longer on the desk.' };
      }
      const result = restoreSnippetVersion(target, versionId);
      if (!result.ok || result.snippet === target) {
        return result;
      }
      applyChange((current) =>
        current.some((snippet) => snippet.id === id)
          ? current.map((snippet) => (snippet.id === id ? result.snippet : snippet))
          : current
      );
      return result;
    },
    [applyChange]
  );
  const createClipFromVersionById = useCallback(
    (id: string, versionId: string): SnippetEditResult => {
      const source = snippetsRef.current.find((snippet) => snippet.id === id);
      if (!source) {
        return { ok: false, error: 'That snippet is no longer on the desk.' };
      }
      const result = createClipFromVersion(source, versionId, {
        id: newSnippetId(),
        createdAt: new Date().toISOString(),
      });
      if (!result.ok) {
        return result;
      }
      applyChange((current) => {
        const index = current.findIndex((snippet) => snippet.id === id);
        if (index < 0) {
          return current;
        }
        const next = [...current];
        next.splice(index + 1, 0, result.snippet);
        return next;
      });
      return result;
    },
    [applyChange]
  );
  const replaceDesk = useCallback(
    (
      next: Snippet[],
      options: ReplaceDeskOptions = {}
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!loadedRef.current) {
        return Promise.resolve({ ok: false, error: 'The desk is still loading.' });
      }
      if (!writableRef.current && !options.restore) {
        return Promise.resolve({
          ok: false,
          error: 'The saved desk could not be read, so it cannot be replaced.',
        });
      }
      return enqueueDeskTask(async () => {
        try {
          revRef.current = await writeDeskNow({
            snippets: next,
            stored: storedRef.current,
            expectedRev: revRef.current,
          });
        } catch (error) {
          if (options.restore) {
            // Storage still holds the project's desk; the desk on screen writes over it on the next
            // change (the rev is current), so it must be writable again and unsettled.
            writableRef.current = true;
            settledRef.current = null;
          }
          return { ok: false as const, error: describeStorageError(error) };
        }
        storedRef.current = new Map(next.map((snippet) => [snippet.id, snippet]));
        settledRef.current = next;
        if (legacyKeyRef.current) {
          removeLegacyDesk(legacyKeyRef.current);
          legacyKeyRef.current = null;
        }
        if (options.reloading) {
          // The page is about to reload from storage: leave what is on screen alone (replacing it
          // would republish modules and fire resets on the old page) and write nothing more.
          window.clearTimeout(timerRef.current);
          timerRef.current = undefined;
          writableRef.current = false;
        } else if (options.restore) {
          // Storage is back to the desk that is on screen, and the page keeps running.
          writableRef.current = true;
        } else {
          snippetsRef.current = next;
          setSnippets(next);
        }
        setPersistError(null);
        return { ok: true as const };
      });
    },
    []
  );
  const endEditSession = useCallback((snippetId: string) => endSnippetEditSession(snippetId), []);
  const value = useMemo(
    () => ({
      snippets,
      loading: !loaded,
      locked,
      persistError,
      flushDesk: flushNow,
      replaceDesk,
      endEditSession,
      addSnippet,
      removeSnippet,
      renameSnippet,
      setSnippetNote,
      duplicateSnippetById,
      convertToPitchClassById,
      commitSnippetEditById,
      restoreSnippetVersionById,
      createClipFromVersionById,
    }),
    [
      snippets,
      loaded,
      locked,
      persistError,
      flushNow,
      replaceDesk,
      endEditSession,
      addSnippet,
      removeSnippet,
      renameSnippet,
      setSnippetNote,
      duplicateSnippetById,
      convertToPitchClassById,
      commitSnippetEditById,
      restoreSnippetVersionById,
      createClipFromVersionById,
    ]
  );
  return <DeskContext.Provider value={value}>{children}</DeskContext.Provider>;
}

export function useDesk() {
  const value = useContext(DeskContext);
  if (!value) {
    throw new Error('useDesk must be used within a DeskProvider.');
  }
  return value;
}

/** The desk when there is one (the project menu may render outside a provider in isolation). */
export function useOptionalDesk() {
  return useContext(DeskContext);
}

export function newSnippetId() {
  return `snippet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
