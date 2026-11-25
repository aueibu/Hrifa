import { act, render, renderHook, screen, userEvent, waitFor } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeskView } from './components/DeskView';
import { CompositionSettingsProvider } from './compositionSettings';
import {
  acceptsDataBlocks,
  commitDataBlockEdit,
  endEditSession,
  MAX_LINEAGE_CHARS,
  pruneLineage,
  type PacketBlock,
} from './dataBlock';
import type { StoredDataBlock } from './dataBlocks/registry';
import { DESK_WRITE_DEBOUNCE_MS, DeskProvider, useDesk } from './desk';
import {
  DESK_DB_NAME,
  enqueueDeskTask,
  deskStoreIdle,
  loadDesk,
  OPEN_BLOCKED_RETRIES,
  resetPersistRequest,
  writeDeskNow,
} from './deskStore';
import { renderDesk, seedDesk, storedDesk } from './deskTestUtils';
import { canUndo, redo, resetHistory, undo } from './history';
import { packet, type DataItem, type DataPacket } from './model';
import { musicalDuration, musicalPosition } from './musicalTime';
import { compositionStateKeys } from './usePersistentState';

vi.mock('./audio/AudioEngineProvider', () => ({
  useAudioEngine: () => ({
    playing: false,
    play: async () => undefined,
    subscribe: () => () => undefined,
    setTransport: () => undefined,
    stopAll: () => undefined,
  }),
}));

function notes(count: number, shift = 0): DataItem[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `note:${index}`,
    value: {
      onset: musicalPosition(index),
      interOnset: musicalDuration(1),
      duration: musicalDuration(1),
      pitches: [6000 + (shift + (index % 12)) * 100],
      velocity: 90,
    },
    provenance: [],
  }));
}

function dataBlock(id: string, count = 4): PacketBlock {
  return {
    schemaVersion: 2,
    typeId: 'notes',
    id,
    name: id,
    createdAt: '2026-11-11T00:00:00Z',
    payload: { kind: 'packet', packet: packet('events', 'note', notes(count)) },
  };
}

const withShift = (dataBlock: PacketBlock, shift: number): DataPacket =>
  packet('events', 'note', notes(dataBlock.payload.packet.items.length, shift));

const snapshotOf = <T,>(value: T) => JSON.parse(JSON.stringify(value)) as T;

/**
 * Edits a data-block on the desk. Edits in one session share a version, so by default each call ends the
 * data-block's session first and is a version of its own; pass `sameSession` to continue the session.
 */
function edit(
  desk: ReturnType<typeof useDesk>,
  id: string,
  shift: number,
  key?: string,
  sameSession = false
) {
  if (!sameSession) {
    endEditSession(id);
  }
  const target = desk.dataBlocks.find((dataBlock) => dataBlock.id === id)!;
  const result = desk.commitDataBlockEditById(id, withShift(target, shift), 'edit', {
    coalesceKey: key,
    handEdit: true,
  });
  expect(result.ok).toBe(true);
}

beforeEach(() => {
  localStorage.clear();
  resetHistory();
  resetPersistRequest();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('desk storage in IndexedDB', () => {
  it('round-trips the desk, lineage included, across a provider remount', async () => {
    const first = await renderDesk();
    act(() => first.result.current.addDataBlock(dataBlock('a')));
    act(() => first.result.current.addDataBlock(dataBlock('b')));
    act(() => edit(first.result.current, 'a', 1));
    act(() => edit(first.result.current, 'a', 2));
    const live = snapshotOf(first.result.current.dataBlocks);
    expect(live[0].lineage?.versions).toHaveLength(3);
    first.unmount();

    const second = await renderDesk();
    expect(second.result.current.dataBlocks).toEqual(live);
    expect(acceptsDataBlocks(second.result.current.dataBlocks)).toBe(true);
    // Nothing about the desk is in localStorage.
    expect(localStorage.getItem(compositionStateKeys.desk)).toBeNull();
    second.unmount();
  });

  it('writes only after the debounce, in one write for a burst', async () => {
    const { result } = await renderDesk();
    const put = vi.spyOn(IDBObjectStore.prototype, 'put');
    act(() => result.current.addDataBlock(dataBlock('a')));
    act(() => result.current.addDataBlock(dataBlock('b')));
    expect(put).not.toHaveBeenCalled();
    await waitFor(() => expect(put).toHaveBeenCalled(), { timeout: DESK_WRITE_DEBOUNCE_MS * 10 });
    await deskStoreIdle();
    // a, b, the order record and the rev, in one pass.
    expect(put).toHaveBeenCalledTimes(4);
  });

  it('asks the browser to keep storage, once', async () => {
    const persist = vi.fn(async () => true);
    vi.stubGlobal('navigator', { ...navigator, storage: { persist } });
    const first = await renderDesk();
    first.unmount();
    const second = await renderDesk();
    second.unmount();
    expect(persist).toHaveBeenCalledTimes(1);
  });
});

describe('loading', () => {
  it('writes nothing before the initial load resolves, and refuses changes meanwhile', async () => {
    const saved = [dataBlock('kept-1'), dataBlock('kept-2')];
    const seed = await renderDesk();
    saved.forEach((dataBlock) => act(() => seed.result.current.addDataBlock(dataBlock)));
    await storedDesk(seed.result.current);
    seed.unmount();

    const put = vi.spyOn(IDBObjectStore.prototype, 'put');
    const del = vi.spyOn(IDBObjectStore.prototype, 'delete');
    const { result } = renderHook(() => useDesk(), { wrapper: DeskProvider });
    // Before the read resolves: loading, empty, and a change goes nowhere.
    expect(result.current.loading).toBe(true);
    expect(result.current.dataBlocks).toEqual([]);
    act(() => result.current.addDataBlock(dataBlock('too-early')));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.dataBlocks.map((dataBlock) => dataBlock.id)).toEqual([
      'kept-1',
      'kept-2',
    ]);
    // Wait out the debounce: loading itself must not have caused a write.
    await new Promise((resolve) => setTimeout(resolve, DESK_WRITE_DEBOUNCE_MS * 3));
    await deskStoreIdle();
    expect(put).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    expect((await loadDesk()).dataBlocks.map((dataBlock) => dataBlock.id)).toEqual([
      'kept-1',
      'kept-2',
    ]);
  });

  it('shows a loading state, then the desk', async () => {
    const seed = await renderDesk();
    act(() => seed.result.current.addDataBlock(dataBlock('shown')));
    await storedDesk(seed.result.current);
    seed.unmount();
    render(
      <CompositionSettingsProvider>
        <DeskProvider>
          <DeskView />
        </DeskProvider>
      </CompositionSettingsProvider>
    );
    expect(screen.getByRole('status').textContent).toBe('Loading the desk…');
    expect(await screen.findByDisplayValue('shown')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('does not write over a saved desk it could not read', async () => {
    const seed = await renderDesk();
    act(() => seed.result.current.addDataBlock(dataBlock('precious')));
    await storedDesk(seed.result.current);
    seed.unmount();
    // A data-block record from a newer app version: unreadable here, so it is left alone.
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('hrifa-workbench');
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('desk-data-blocks', 'readwrite');
        tx.objectStore('desk-data-blocks').put({ ...dataBlock('precious'), schemaVersion: 3 });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
    const put = vi.spyOn(IDBObjectStore.prototype, 'put');
    const { result } = await renderDesk();
    expect(result.current.dataBlocks).toEqual([]);
    expect(result.current.persistError).toMatch(/left untouched/);
    expect(result.current.locked).toBe(true);
    // A locked desk refuses edits outright: they could never be saved.
    act(() => result.current.addDataBlock(dataBlock('new')));
    expect(result.current.dataBlocks).toEqual([]);
    await act(async () => {
      await result.current.flushDesk();
    });
    expect(put).not.toHaveBeenCalled();
  });

  it('drops a desk saved in the earlier envelope (baseline reset), stays writable and deletes it on the next save', async () => {
    const { schemaVersion: _version, typeId: _type, payload, ...rest } = dataBlock('old');
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('hrifa-workbench');
      open.onupgradeneeded = () => {
        open.result.createObjectStore('desk-data-blocks', { keyPath: 'id' });
        open.result.createObjectStore('desk-meta');
        open.result.createObjectStore('projects', { keyPath: 'id' });
        open.result.createObjectStore('project-desks', { keyPath: 'id' });
      };
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction(['desk-data-blocks', 'desk-meta'], 'readwrite');
        tx.objectStore('desk-data-blocks').put({
          ...rest,
          schemaVersion: 1,
          packet: payload.kind === 'packet' ? payload.packet : null,
        });
        tx.objectStore('desk-meta').put(['old'], 'order');
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
    const { result } = await renderDesk();
    expect(result.current.dataBlocks).toEqual([]);
    expect(result.current.locked).toBe(false);
    expect(result.current.persistError).toMatch(/earlier version dropped/);
    act(() => result.current.addDataBlock(dataBlock('new')));
    expect((await storedDesk(result.current)).map((block) => block.id)).toEqual(['new']);
    const reloaded = await loadDesk();
    expect(reloaded.error).toBeUndefined();
  });
});

describe('a desk saved with strips (W-75) opens as one placement per object (W-77)', () => {
  const strip = (id: string, extra: object = {}) => ({
    id,
    dataRef: { id: 'n1' },
    start: { numerator: 4, denominator: 1 },
    duration: { numerator: 8, denominator: 1 },
    mapping: 'stretch',
    contentOffset: { numerator: 0, denominator: 1 },
    modifiers: [],
    mute: false,
    parentStrip: null,
    ...extra,
  });
  const strippedObject = (id: string, strips: object[], mute = false) => ({
    schemaVersion: 2,
    id,
    typeId: 'object',
    name: id,
    createdAt: '2026-11-24T00:00:00Z',
    payload: {
      kind: 'record',
      data: { registerSpan: { lowMc: 0, highMc: 12700 }, mute, strips },
    },
  });
  const collection = (members: string[]) => ({
    schemaVersion: 2,
    id: 'root',
    typeId: 'collection',
    name: 'root',
    createdAt: '2026-11-24T00:00:00Z',
    payload: {
      kind: 'record',
      data: { memberRefs: members.map((id) => ({ id })), mute: false },
    },
  });

  it('opens with a second strip as its own object, parents remapped, writable, with no error', async () => {
    await seedDesk([
      dataBlock('n1'),
      strippedObject(
        'verse',
        [strip('a'), strip('b', { start: { numerator: 16, denominator: 1 } })],
        true
      ),
      strippedObject('kid', [strip('k', { parentStrip: { objectId: 'verse', stripId: 'b' } })]),
      collection(['verse', 'kid']),
    ] as unknown as StoredDataBlock[]);
    const loaded = await loadDesk();
    expect(loaded.error).toBeUndefined();
    expect(loaded.writable).toBe(true);
    expect(loaded.dataBlocks.map((block) => block.id)).toEqual([
      'n1',
      'verse',
      'verse:b',
      'kid',
      'root',
    ]);
    const data = (id: string) =>
      (
        loaded.dataBlocks.find((block) => block.id === id)!.payload as {
          data: Record<string, unknown>;
        }
      ).data;
    expect(data('verse')).toMatchObject({
      mute: true,
      mapping: 'stretch',
      primaryDataRef: { id: 'n1' },
    });
    expect(data('verse:b')).toMatchObject({
      timeSpan: { start: { numerator: 16, denominator: 1 } },
      mute: true,
    });
    expect(data('kid').parentRef).toEqual({ id: 'verse:b' });
    expect((data('root').memberRefs as { id: string }[]).map((ref) => ref.id)).toEqual([
      'verse',
      'verse:b',
      'kid',
    ]);
  });
});

describe('save failures', () => {
  function Harness() {
    const desk = useDesk();
    return (
      <>
        <button
          type="button"
          onClick={() => desk.addDataBlock(dataBlock(`c-${desk.dataBlocks.length}`))}
        >
          add
        </button>
        <DeskView />
      </>
    );
  }

  it('sets persistError, shows the warning, and clears it after a later successful write', async () => {
    const user = userEvent.setup();
    render(
      <CompositionSettingsProvider>
        <DeskProvider>
          <Harness />
        </DeskProvider>
      </CompositionSettingsProvider>
    );
    await user.click(await screen.findByRole('button', { name: 'add' }));
    expect(screen.queryByRole('alert')).toBeNull();

    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await user.click(screen.getByRole('button', { name: 'add' }));
    const alert = await screen.findByRole('alert', undefined, {
      timeout: DESK_WRITE_DEBOUNCE_MS * 10,
    });
    expect(alert.textContent).toContain('Desk changes could not be saved.');
    expect(alert.textContent).toContain('Browser storage is full.');

    put.mockRestore();
    await user.click(screen.getByRole('button', { name: 'add' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull(), {
      timeout: DESK_WRITE_DEBOUNCE_MS * 10,
    });
    // The failed write was retried in full: all three data-blocks are stored.
    expect((await loadDesk()).dataBlocks).toHaveLength(3);
  });

  it('reports the failure through flushDesk and the context', async () => {
    const { result } = await renderDesk();
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new Error('disk on fire');
    });
    act(() => result.current.addDataBlock(dataBlock('a')));
    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.flushDesk();
    });
    expect(saved).toBe(false);
    expect(result.current.persistError).toBe('disk on fire.');
  });
});

describe('undo and redo through the single history', () => {
  it('undoes edits, restores and deletes, sharing untouched data-blocks', async () => {
    const { result } = await renderDesk();
    act(() => result.current.addDataBlock(dataBlock('a')));
    act(() => result.current.addDataBlock(dataBlock('b')));
    const untouched = result.current.dataBlocks[1];
    act(() => edit(result.current, 'a', 1));
    act(() => edit(result.current, 'a', 2));
    const states = [snapshotOf(result.current.dataBlocks)];

    const rootId = result.current.dataBlocks[0].lineage!.versions.find(
      (version) => version.parentId === null
    )!.id;
    act(() => void result.current.restoreDataBlockVersionById('a', rootId));
    states.push(snapshotOf(result.current.dataBlocks));
    const withLineage = result.current.dataBlocks[0];
    act(() => result.current.removeDataBlock('a'));
    expect(result.current.dataBlocks.map((dataBlock) => dataBlock.id)).toEqual(['b']);

    // Undo the delete: the very data-block comes back, lineage and all.
    act(() => undo());
    expect(result.current.dataBlocks[0]).toBe(withLineage);
    // Undo the restore, then both edits.
    act(() => undo());
    expect(snapshotOf(result.current.dataBlocks)).toEqual(states[0]);
    act(() => undo());
    act(() => undo());
    expect(result.current.dataBlocks[0].lineage).toBeUndefined();
    expect(result.current.dataBlocks[1]).toBe(untouched);
    act(() => undo());
    act(() => undo());
    expect(canUndo()).toBe(false);
    expect(result.current.dataBlocks).toEqual([]);

    for (let step = 0; step < 6; step += 1) {
      act(() => redo());
    }
    expect(result.current.dataBlocks.map((dataBlock) => dataBlock.id)).toEqual(['b']);
    // What undo and redo reached is what is stored.
    expect((await storedDesk(result.current)).map((dataBlock) => dataBlock.id)).toEqual(['b']);
  });
});

describe('big data-blocks and caps', () => {
  it('edits and saves a 4096-event data-block, and reloads it', async () => {
    const { result, unmount } = await renderDesk();
    act(() => result.current.addDataBlock(dataBlock('big', 4096)));
    act(() => edit(result.current, 'big', 1));
    act(() => edit(result.current, 'big', 2));
    const live = result.current.dataBlocks[0];
    expect(live.payload.packet.items).toHaveLength(4096);
    expect(live.lineage!.versions).toHaveLength(3);
    expect(await storedDesk(result.current)).toEqual([live]);
    expect(result.current.persistError).toBeNull();
    unmount();
    const again = await renderDesk();
    expect(again.result.current.dataBlocks).toEqual([live]);
    again.unmount();
  });

  it('counts the head packet in the character budget, keeping root and head', () => {
    const base = dataBlock('a', 200);
    const first = commitDataBlockEdit(base, withShift(base, 1), 'edit', { handEdit: true });
    if (!first.ok) {
      throw new Error(first.error);
    }
    let current = first.dataBlock;
    for (let shift = 2; shift < 6; shift += 1) {
      endEditSession(current.id);
      const next = commitDataBlockEdit(current, withShift(current, shift), 'edit', {
        handEdit: true,
      });
      if (!next.ok) {
        throw new Error(next.error);
      }
      current = next.dataBlock;
    }
    const lineage = current.lineage!;
    expect(lineage.versions).toHaveLength(6);
    const headSize = JSON.stringify(current.payload.packet).length;
    const oneSnapshot = JSON.stringify(lineage.versions[1]).length;
    // Room for the head and about two snapshots: the rest must go.
    const pruned = pruneLineage(
      lineage,
      { maxVersions: 500, maxChars: headSize + oneSnapshot * 3 },
      current.payload.packet
    );
    expect(pruned.versions.length).toBeLessThan(6);
    expect(pruned.versions.length).toBeGreaterThanOrEqual(2);
    expect(pruned.versions.some((version) => version.id === lineage.head)).toBe(true);
    expect(pruned.versions.some((version) => version.parentId === null)).toBe(true);
    // Without the head counted, the same budget would have kept more.
    expect(
      pruneLineage(lineage, { maxVersions: 500, maxChars: headSize + oneSnapshot * 3 }).versions
        .length
    ).toBeGreaterThan(pruned.versions.length);
    expect(MAX_LINEAGE_CHARS).toBe(20_000_000);
  });
});

/** Runs one request against the data-blocks store directly, as another tab (or a crash) would leave it. */
function rawDataBlocks<T>(mode: IDBTransactionMode, use: (store: IDBObjectStore) => IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    const opened = indexedDB.open(DESK_DB_NAME);
    opened.onerror = () => reject(opened.error);
    opened.onsuccess = () => {
      const db = opened.result;
      const tx = db.transaction('desk-data-blocks', mode);
      const req = use(tx.objectStore('desk-data-blocks'));
      tx.oncomplete = () => {
        db.close();
        resolve(req.result);
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

describe('two tabs and damaged storage', () => {
  it('refuses a write when another tab changed the desk, and writes nothing', async () => {
    const { result } = await renderDesk();
    act(() => result.current.addDataBlock(dataBlock('a')));
    await storedDesk(result.current);

    // Another tab adds a data-block.
    const other = await loadDesk();
    await enqueueDeskTask(() =>
      writeDeskNow({
        dataBlocks: [...other.dataBlocks, dataBlock('theirs')],
        stored: other.stored,
        expectedRev: other.rev,
      })
    );

    act(() => result.current.addDataBlock(dataBlock('b')));
    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.flushDesk();
    });
    expect(saved).toBe(false);
    expect(result.current.persistError).toBe(
      'The desk changed in another tab. Reload to see the latest version.'
    );
    // Their desk is intact, not orphaned by our order.
    expect((await loadDesk()).dataBlocks.map((dataBlock) => dataBlock.id)).toEqual(['a', 'theirs']);
  });

  it('keeps writing in sequence when nothing else touched the desk', async () => {
    const { result } = await renderDesk();
    act(() => result.current.addDataBlock(dataBlock('a')));
    await storedDesk(result.current);
    act(() => result.current.addDataBlock(dataBlock('b')));
    expect((await storedDesk(result.current)).map((dataBlock) => dataBlock.id)).toEqual(['a', 'b']);
    expect(result.current.persistError).toBeNull();
  });

  it('loads a desk with a hole in its order, skipping it with a warning instead of locking', async () => {
    const seed = await renderDesk();
    ['a', 'b', 'c'].forEach((id) => act(() => seed.result.current.addDataBlock(dataBlock(id))));
    await storedDesk(seed.result.current);
    seed.unmount();
    // Another tab removed b (record gone) and a crash left d without an order entry.
    await rawDataBlocks('readwrite', (store) => store.delete('b'));
    await rawDataBlocks('readwrite', (store) => store.put(dataBlock('d')));

    const { result } = await renderDesk();
    expect(result.current.dataBlocks.map((dataBlock) => dataBlock.id)).toEqual(['a', 'c', 'd']);
    expect(result.current.persistError).toMatch(/repaired/);
    // Not locked: it can be changed and saved, and the warning clears.
    act(() => result.current.addDataBlock(dataBlock('e')));
    expect((await storedDesk(result.current)).map((dataBlock) => dataBlock.id)).toEqual([
      'a',
      'c',
      'd',
      'e',
    ]);
    expect(result.current.persistError).toBeNull();
  });

  it('aborts the transaction when a put throws, so nothing is half written', async () => {
    const real = IDBObjectStore.prototype.put;
    let calls = 0;
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<typeof real>
    ) {
      calls += 1;
      if (calls === 2) {
        throw new DOMException('full', 'QuotaExceededError');
      }
      return real.apply(this, args);
    });
    await expect(
      enqueueDeskTask(() =>
        writeDeskNow({
          dataBlocks: [dataBlock('a'), dataBlock('b')],
          stored: new Map(),
          expectedRev: 0,
        })
      )
    ).rejects.toThrow('full');
    vi.restoreAllMocks();
    expect(await rawDataBlocks('readonly', (store) => store.getAll())).toEqual([]);
    expect((await loadDesk()).rev).toBe(0);
  });

  it('retries a blocked open, then reports it and closes connections that open late', async () => {
    const requests: Record<string, unknown>[] = [];
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      const request: Record<string, unknown> = {};
      requests.push(request);
      return request as unknown as IDBOpenDBRequest;
    });
    const loading = loadDesk();
    for (let attempt = 1; attempt <= OPEN_BLOCKED_RETRIES + 1; attempt += 1) {
      await waitFor(() => expect(requests).toHaveLength(attempt));
      await waitFor(() => expect(typeof requests[attempt - 1].onblocked).toBe('function'));
      (requests[attempt - 1].onblocked as () => void)();
    }
    const loaded = await loading;
    expect(loaded.writable).toBe(false);
    expect(loaded.error).toMatch(/blocked/);
    expect(requests).toHaveLength(OPEN_BLOCKED_RETRIES + 1);
    const close = vi.fn();
    requests.forEach((request) => {
      request.result = { close };
      (request.onsuccess as () => void)();
    });
    expect(close).toHaveBeenCalledTimes(requests.length);
  });

  it('opens once a blocked upgrade clears on a retry', async () => {
    const real = indexedDB.open.bind(indexedDB);
    let calls = 0;
    vi.spyOn(indexedDB, 'open').mockImplementation((name, version) => {
      calls += 1;
      if (calls === 1) {
        const request: Record<string, unknown> = {};
        setTimeout(() => (request.onblocked as () => void)(), 0);
        return request as unknown as IDBOpenDBRequest;
      }
      return real(name, version);
    });
    const loaded = await loadDesk();
    expect(loaded.writable).toBe(true);
    expect(calls).toBe(2);
  });
});

describe('write timing and cost', () => {
  it('waits for a gesture to pause before writing, but writes once it does', async () => {
    const { result } = await renderDesk();
    act(() => result.current.addDataBlock(dataBlock('a')));
    await storedDesk(result.current);
    const put = vi.spyOn(IDBObjectStore.prototype, 'put');
    act(() => edit(result.current, 'a', 1, 'drag:1'));
    // Well past the ordinary debounce: still nothing written while the gesture may continue.
    await new Promise((resolve) => setTimeout(resolve, DESK_WRITE_DEBOUNCE_MS * 3));
    expect(put).not.toHaveBeenCalled();
    await waitFor(() => expect(put).toHaveBeenCalled(), { timeout: 3000 });
    await deskStoreIdle();
    expect((await loadDesk()).dataBlocks[0].lineage!.versions).toHaveLength(2);
  });

  it('does not re-measure the whole history on each edit', () => {
    let current = dataBlock('a', 20);
    for (let shift = 1; shift <= 40; shift += 1) {
      endEditSession(current.id);
      const next = commitDataBlockEdit(current, withShift(current, shift), 'edit', {
        handEdit: true,
      });
      if (!next.ok) {
        throw new Error(next.error);
      }
      current = next.dataBlock;
    }
    expect(current.lineage!.versions).toHaveLength(41);
    const stringify = vi.spyOn(JSON, 'stringify');
    endEditSession(current.id);
    const last = commitDataBlockEdit(current, withShift(current, 99), 'edit', {
      handEdit: true,
    });
    // A handful (the packet copies, the head, the lineage frame), not one per version.
    expect(stringify.mock.calls.length).toBeLessThan(15);
    expect(last.ok && acceptsDataBlocks([last.dataBlock])).toBe(true);
  });
});
