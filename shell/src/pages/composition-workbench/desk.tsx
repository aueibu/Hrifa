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
  commitDataBlockEdit,
  createDataBlockFromVersion,
  convertDataBlockToPitchClass,
  duplicateDataBlock,
  editDataBlockNote,
  endEditSession as endDataBlockEditSession,
  restoreDataBlockVersion,
  type PitchClassConversionResult,
  type DataBlock,
  type DataBlockEditResult,
} from './dataBlock';
import { dataBlockTypeById, nextDataBlockName } from './dataBlockTypes';
import {
  describeStorageError,
  enqueueDeskTask,
  loadDesk,
  requestPersistentStorage,
  writeDeskNow,
} from './deskStore';
import { recordChange, registerHistoryApplier, type HistoryChange } from './history';
import type { DataPacket } from './model';
import type { Rational } from './musicalTime';
import { compositionStateKeys } from './usePersistentState';

/** Desk writes closer together than this are one write. */
export const DESK_WRITE_DEBOUNCE_MS = 150;

/** While a gesture is coalescing edits (a drag, typing), writes wait for it to pause this long. */
export const DESK_GESTURE_WRITE_DEBOUNCE_MS = 1000;

/**
 * The desk: data-blocks set aside for reuse, kept per browser. One provider at the workbench root so
 * every node sends to, and every view reads from, the same list.
 */
interface DeskContextValue {
  dataBlocks: DataBlock[];
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
   * Replaces the whole desk (opening a saved project): every data-block and its lineage, written to
   * IndexedDB in one transaction. Not an undo step (opening a project reloads the page). Refused
   * while the desk is loading or locked; on any failure (write error, another tab changed the desk)
   * nothing is stored and the desk on screen is unchanged, and the reason comes back.
   */
  replaceDesk(
    dataBlocks: DataBlock[],
    options?: ReplaceDeskOptions
  ): Promise<{ ok: true } | { ok: false; error: string }>;
  /**
   * Ends the data-block's hand-edit session so its next edit starts a new version (an editor calls this
   * when it closes or another data-block becomes its target). Idle time and a different operator end a
   * session too.
   */
  endEditSession(dataBlockId: string): void;
  addDataBlock(dataBlock: DataBlock): void;
  /**
   * Adds a new empty data-block of a registered type (see dataBlockTypes.ts) at the end of the desk, named
   * "New data-block", "New data-block 2", and so on. One undo step. Returns the data-block, or null when the desk
   * refused it (loading or locked) or the type is unknown.
   */
  addBlankDataBlock(
    typeId: string,
    length: Rational,
    options?: { timeSignature?: string }
  ): DataBlock | null;
  removeDataBlock(id: string): void;
  renameDataBlock(id: string, name: string): void;
  setDataBlockNote(id: string, note: string): void;
  /** Adds a copy named `<name> (variation)` directly after the original. */
  duplicateDataBlockById(id: string): void;
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
   * The edit contract: replace the data-block's packet in place (same id, name and position), adding an
   * operator provenance step to each added or modified item. One global undo step per gesture. A packet
   * deeply equal to the current one changes nothing (`ok`, no history entry); an invalid packet or
   * an unknown id is refused and the desk is untouched. A `coalesceKey` makes a gesture's edits one
   * undo step (undo is per gesture; versions are per edit session, see `commitDataBlockEdit`).
   */
  commitDataBlockEditById(
    id: string,
    newPacket: DataPacket,
    operation: string,
    options?: { coalesceKey?: string; handEdit?: boolean }
  ): DataBlockEditResult;
  /**
   * The data-block as it is on the desk right now (not as last rendered), for an edit that must start
   * from the latest packet at the moment it commits.
   */
  latestDataBlockById(id: string): DataBlock | undefined;
  /** Moves the data-block back (or forward) to a kept version; same data-block, one undo step. */
  restoreDataBlockVersionById(id: string, versionId: string): DataBlockEditResult;
  /** Adds a new data-block made from a version, directly after the original. Returns it. */
  createDataBlockFromVersionById(id: string, versionId: string): DataBlockEditResult;
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
 * One undo step's worth of desk change: the data-blocks that changed (by id, null when absent on that
 * side) and the order. Unchanged data-blocks are not copied, so a step costs what it changed.
 */
interface DeskSide {
  order: string[];
  dataBlocks: Record<string, DataBlock | null>;
}

let deskStepCount = 0;

function deskStep(before: DataBlock[], after: DataBlock[]): HistoryChange {
  const was = new Map(before.map((dataBlock) => [dataBlock.id, dataBlock]));
  const now = new Map(after.map((dataBlock) => [dataBlock.id, dataBlock]));
  const previous: DeskSide = { order: before.map((dataBlock) => dataBlock.id), dataBlocks: {} };
  const next: DeskSide = { order: after.map((dataBlock) => dataBlock.id), dataBlocks: {} };
  new Set([...was.keys(), ...now.keys()]).forEach((id) => {
    if (was.get(id) !== now.get(id)) {
      previous.dataBlocks[id] = was.get(id) ?? null;
      next.dataBlocks[id] = now.get(id) ?? null;
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
      // What each data-block was before the whole burst: the earliest side wins.
      Object.entries(later.dataBlocks).forEach(([id, dataBlock]) => {
        if (!(id in earlier.dataBlocks)) {
          earlier.dataBlocks[id] = dataBlock;
        }
      });
      const final = incoming.nextValue as DeskSide;
      const merged = existing.nextValue as DeskSide;
      existing.nextValue = {
        order: final.order,
        dataBlocks: { ...merged.dataBlocks, ...final.dataBlocks },
      };
    },
  };
}

export function DeskProvider({ children }: { children: ReactNode }) {
  const [dataBlocks, setDataBlocks] = useState<DataBlock[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  // Undo and redo are workbench-wide (history.ts); the desk only records through it. The refs let
  // several changes in one event see each other.
  const dataBlocksRef = useRef(dataBlocks);
  const loadedRef = useRef(false);
  // False when the stored desk could not be read: it is left alone, nothing is ever written over it.
  const writableRef = useRef(false);
  // The data-blocks as last written (by reference), and the list that was current then.
  const storedRef = useRef<Map<string, DataBlock>>(new Map());
  const settledRef = useRef<DataBlock[] | null>(null);
  // The store's rev as this tab last read or wrote it; a write is refused if another tab moved it.
  const revRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  // Whether the latest change belongs to a gesture (it waits longer before writing).
  const gestureRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void loadDesk().then((result) => {
      if (cancelled) {
        return;
      }
      dataBlocksRef.current = result.dataBlocks;
      storedRef.current = result.stored;
      revRef.current = result.rev;
      settledRef.current = result.dataBlocks;
      writableRef.current = result.writable;
      loadedRef.current = true;
      setDataBlocks(result.dataBlocks);
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
      const target = dataBlocksRef.current;
      if (!writableRef.current) {
        return false;
      }
      if (target === settledRef.current) {
        return true;
      }
      try {
        revRef.current = await writeDeskNow({
          dataBlocks: target,
          stored: storedRef.current,
          expectedRev: revRef.current,
        });
        storedRef.current = new Map(target.map((dataBlock) => [dataBlock.id, dataBlock]));
        settledRef.current = target;
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
    if (!loaded || dataBlocks === settledRef.current) {
      return;
    }
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(
      () => void flushNow(),
      gestureRef.current ? DESK_GESTURE_WRITE_DEBOUNCE_MS : DESK_WRITE_DEBOUNCE_MS
    );
  }, [loaded, dataBlocks, flushNow]);

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
        const live = new Map(dataBlocksRef.current.map((dataBlock) => [dataBlock.id, dataBlock]));
        const next: DataBlock[] = [];
        for (const id of side.order) {
          const dataBlock = id in side.dataBlocks ? side.dataBlocks[id] : live.get(id);
          if (!dataBlock) {
            return false;
          }
          next.push(dataBlock);
        }
        dataBlocksRef.current = next;
        setDataBlocks(next);
        return true;
      }),
    []
  );

  /**
   * The single path for every desk change. `updater` returns the next list, or the same array to
   * change nothing (no history entry). A real change records a data-block-level step in the shared
   * history. Refused while the saved desk is still loading, so it can never be overwritten.
   */
  const applyChange = useCallback(
    (
      updater: (current: DataBlock[]) => DataBlock[],
      options: { coalesce?: boolean; coalesceKey?: string } = {}
    ): boolean => {
      // A locked desk (unreadable saved desk) or one frozen for a project open never saves, so an
      // edit there would be lost on reload: refuse it.
      if (!loadedRef.current || !writableRef.current) {
        return false;
      }
      const current = dataBlocksRef.current;
      const next = updater(current);
      if (next === current) {
        return false;
      }
      dataBlocksRef.current = next;
      gestureRef.current = options.coalesce ?? false;
      setDataBlocks(next);
      recordChange(deskStep(current, next), {
        coalesce: options.coalesce ?? false,
        coalesceKey: options.coalesceKey,
      });
      return true;
    },
    []
  );

  /** The refusal for an edit that cannot land, checked before anything records an edit session. */
  const refusal = useCallback((): DataBlockEditResult | null => {
    if (!loadedRef.current) {
      return {
        ok: false,
        error: 'The desk is still loading, so the data-block cannot be edited yet.',
      };
    }
    if (!writableRef.current) {
      return { ok: false, error: 'The desk is not accepting changes right now.' };
    }
    return null;
  }, []);

  const addDataBlock = useCallback(
    (dataBlock: DataBlock) => {
      applyChange((current) => [...current, dataBlock]);
    },
    [applyChange]
  );
  const addBlankDataBlock = useCallback(
    (typeId: string, length: Rational, options?: { timeSignature?: string }): DataBlock | null => {
      const type = dataBlockTypeById(typeId);
      if (!type) {
        return null;
      }
      const dataBlock = type.createBlank({
        id: newDataBlockId(),
        createdAt: new Date().toISOString(),
        name: nextDataBlockName(dataBlocksRef.current),
        length,
        timeSignature: options?.timeSignature,
      });
      return applyChange((current) => [...current, dataBlock]) ? dataBlock : null;
    },
    [applyChange]
  );
  const removeDataBlock = useCallback(
    (id: string) =>
      applyChange((current) => {
        const next = current.filter((dataBlock) => dataBlock.id !== id);
        return next.length === current.length ? current : next;
      }),
    [applyChange]
  );
  const renameDataBlock = useCallback(
    (id: string, name: string) =>
      applyChange((current) =>
        current.some((dataBlock) => dataBlock.id === id && dataBlock.name !== name)
          ? current.map((dataBlock) => (dataBlock.id === id ? { ...dataBlock, name } : dataBlock))
          : current
      ),
    [applyChange]
  );
  const setDataBlockNote = useCallback(
    (id: string, note: string) =>
      applyChange((current) => {
        const target = current.find((dataBlock) => dataBlock.id === id);
        if (!target) {
          return current;
        }
        const edited = editDataBlockNote(target, note);
        return edited.note === target.note
          ? current
          : current.map((dataBlock) => (dataBlock.id === id ? edited : dataBlock));
      }),
    [applyChange]
  );
  const duplicateDataBlockById = useCallback(
    (id: string) => {
      const request = { id: newDataBlockId(), createdAt: new Date().toISOString() };
      applyChange((current) => {
        const index = current.findIndex((dataBlock) => dataBlock.id === id);
        if (index < 0) {
          return current;
        }
        const next = [...current];
        next.splice(index + 1, 0, duplicateDataBlock(current[index], request));
        return next;
      });
    },
    [applyChange]
  );
  const convertToPitchClassById = useCallback(
    (id: string, options: { edo: number; snap?: boolean }): PitchClassConversionResult => {
      const source = dataBlocksRef.current.find((dataBlock) => dataBlock.id === id);
      if (!source) {
        return { ok: false, error: 'That data-block is no longer on the desk.' };
      }
      const result = convertDataBlockToPitchClass(source, {
        id: newDataBlockId(),
        createdAt: new Date().toISOString(),
        ...options,
      });
      if (!result.ok) {
        return result;
      }
      applyChange((current) => {
        const index = current.findIndex((dataBlock) => dataBlock.id === id);
        if (index < 0) {
          return current;
        }
        const next = [...current];
        next.splice(index + 1, 0, result.dataBlock);
        return next;
      });
      return result;
    },
    [applyChange]
  );
  const latestDataBlockById = useCallback(
    (id: string) => dataBlocksRef.current.find((dataBlock) => dataBlock.id === id),
    []
  );

  const commitDataBlockEditById = useCallback(
    (
      id: string,
      newPacket: DataPacket,
      operation: string,
      options?: { coalesceKey?: string; handEdit?: boolean }
    ): DataBlockEditResult => {
      const target = dataBlocksRef.current.find((dataBlock) => dataBlock.id === id);
      if (!target) {
        return { ok: false, error: 'That data-block is no longer on the desk.' };
      }
      const refused = refusal();
      if (refused) {
        return refused;
      }
      const result = commitDataBlockEdit(target, newPacket, operation, {
        handEdit: options?.handEdit,
      });
      if (!result.ok) {
        return result;
      }
      if (result.dataBlock === target) {
        return result;
      }
      applyChange(
        (current) =>
          current.some((dataBlock) => dataBlock.id === id)
            ? current.map((dataBlock) => (dataBlock.id === id ? result.dataBlock : dataBlock))
            : current,
        { coalesce: options?.coalesceKey !== undefined, coalesceKey: options?.coalesceKey }
      );
      return result;
    },
    [applyChange, refusal]
  );
  const restoreDataBlockVersionById = useCallback(
    (id: string, versionId: string): DataBlockEditResult => {
      const target = dataBlocksRef.current.find((dataBlock) => dataBlock.id === id);
      if (!target) {
        return { ok: false, error: 'That data-block is no longer on the desk.' };
      }
      const refused = refusal();
      if (refused) {
        return refused;
      }
      const result = restoreDataBlockVersion(target, versionId);
      if (!result.ok || result.dataBlock === target) {
        return result;
      }
      applyChange((current) =>
        current.some((dataBlock) => dataBlock.id === id)
          ? current.map((dataBlock) => (dataBlock.id === id ? result.dataBlock : dataBlock))
          : current
      );
      return result;
    },
    [applyChange, refusal]
  );
  const createDataBlockFromVersionById = useCallback(
    (id: string, versionId: string): DataBlockEditResult => {
      const source = dataBlocksRef.current.find((dataBlock) => dataBlock.id === id);
      if (!source) {
        return { ok: false, error: 'That data-block is no longer on the desk.' };
      }
      const refused = refusal();
      if (refused) {
        return refused;
      }
      const result = createDataBlockFromVersion(source, versionId, {
        id: newDataBlockId(),
        createdAt: new Date().toISOString(),
      });
      if (!result.ok) {
        return result;
      }
      applyChange((current) => {
        const index = current.findIndex((dataBlock) => dataBlock.id === id);
        if (index < 0) {
          return current;
        }
        const next = [...current];
        next.splice(index + 1, 0, result.dataBlock);
        return next;
      });
      return result;
    },
    [applyChange, refusal]
  );
  const replaceDesk = useCallback(
    (
      next: DataBlock[],
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
            dataBlocks: next,
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
        storedRef.current = new Map(next.map((dataBlock) => [dataBlock.id, dataBlock]));
        settledRef.current = next;
        if (options.reloading) {
          // The page is about to reload from storage: leave what is on screen alone (replacing it
          // would republish nodes and fire resets on the old page) and write nothing more.
          window.clearTimeout(timerRef.current);
          timerRef.current = undefined;
          writableRef.current = false;
        } else if (options.restore) {
          // Storage is back to the desk that is on screen, and the page keeps running.
          writableRef.current = true;
        } else {
          dataBlocksRef.current = next;
          setDataBlocks(next);
        }
        setPersistError(null);
        return { ok: true as const };
      });
    },
    []
  );
  const endEditSession = useCallback(
    (dataBlockId: string) => endDataBlockEditSession(dataBlockId),
    []
  );
  const value = useMemo(
    () => ({
      dataBlocks,
      loading: !loaded,
      locked,
      persistError,
      flushDesk: flushNow,
      replaceDesk,
      endEditSession,
      addDataBlock,
      addBlankDataBlock,
      removeDataBlock,
      renameDataBlock,
      setDataBlockNote,
      duplicateDataBlockById,
      convertToPitchClassById,
      commitDataBlockEditById,
      latestDataBlockById,
      restoreDataBlockVersionById,
      createDataBlockFromVersionById,
    }),
    [
      dataBlocks,
      loaded,
      locked,
      persistError,
      flushNow,
      replaceDesk,
      endEditSession,
      addDataBlock,
      addBlankDataBlock,
      removeDataBlock,
      renameDataBlock,
      setDataBlockNote,
      duplicateDataBlockById,
      convertToPitchClassById,
      commitDataBlockEditById,
      latestDataBlockById,
      restoreDataBlockVersionById,
      createDataBlockFromVersionById,
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

export function newDataBlockId() {
  return `data-block-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
