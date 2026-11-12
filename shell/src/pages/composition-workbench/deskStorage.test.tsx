import { act, render, renderHook, screen, userEvent, waitFor } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeskView } from './components/DeskView';
import { CompositionSettingsProvider } from './compositionSettings';
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
import { renderDesk, storedDesk } from './deskTestUtils';
import { canUndo, redo, resetHistory, undo } from './history';
import { packet, type DataItem, type DataPacket } from './model';
import { musicalDuration, musicalPosition } from './musicalTime';
import {
  acceptsSnippets,
  commitSnippetEdit,
  endEditSession,
  MAX_LINEAGE_CHARS,
  pruneLineage,
  type Snippet,
} from './snippet';
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

const LEGACY = compositionStateKeys.desk;

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

function clip(id: string, count = 4): Snippet {
  return {
    schemaVersion: 1,
    id,
    name: id,
    createdAt: '2026-11-11T00:00:00Z',
    packet: packet('events', 'note', notes(count)),
  };
}

const withShift = (snippet: Snippet, shift: number): DataPacket =>
  packet('events', 'note', notes(snippet.packet.items.length, shift));

const snapshotOf = <T,>(value: T) => JSON.parse(JSON.stringify(value)) as T;

/**
 * Edits a clip on the desk. Edits in one session share a version, so by default each call ends the
 * clip's session first and is a version of its own; pass `sameSession` to continue the session.
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
  const target = desk.snippets.find((snippet) => snippet.id === id)!;
  const result = desk.commitSnippetEditById(id, withShift(target, shift), 'edit-clip', {
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
    act(() => first.result.current.addSnippet(clip('a')));
    act(() => first.result.current.addSnippet(clip('b')));
    act(() => edit(first.result.current, 'a', 1));
    act(() => edit(first.result.current, 'a', 2));
    const live = snapshotOf(first.result.current.snippets);
    expect(live[0].lineage?.versions).toHaveLength(3);
    first.unmount();

    const second = await renderDesk();
    expect(second.result.current.snippets).toEqual(live);
    expect(acceptsSnippets(second.result.current.snippets)).toBe(true);
    // Nothing about the desk is in localStorage.
    expect(localStorage.getItem(LEGACY)).toBeNull();
    second.unmount();
  });

  it('writes only after the debounce, in one write for a burst', async () => {
    const { result } = await renderDesk();
    const put = vi.spyOn(IDBObjectStore.prototype, 'put');
    act(() => result.current.addSnippet(clip('a')));
    act(() => result.current.addSnippet(clip('b')));
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

describe('migration from localStorage', () => {
  it('moves a v1 desk over once, removing the key only after the write', async () => {
    const legacy = [clip('old-1'), clip('old-2')];
    localStorage.setItem(LEGACY, JSON.stringify(legacy));
    const first = await renderDesk();
    expect(first.result.current.snippets).toEqual(legacy);
    expect(localStorage.getItem(LEGACY)).toBeNull();
    expect((await loadDesk('x')).snippets).toEqual(legacy);
    first.unmount();

    // Once: a later legacy value is not copied over the migrated desk.
    localStorage.setItem(LEGACY, JSON.stringify([clip('stray')]));
    const second = await renderDesk();
    expect(second.result.current.snippets.map((snippet) => snippet.id)).toEqual(['old-1', 'old-2']);
    expect(localStorage.getItem(LEGACY)).not.toBeNull();
    second.unmount();
  });

  it('keeps the localStorage key when the IndexedDB write fails', async () => {
    const legacy = [clip('old-1')];
    localStorage.setItem(LEGACY, JSON.stringify(legacy));
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const { result, unmount } = await renderDesk();
    // Still usable from memory, still safe in localStorage, and the failure is reported.
    expect(result.current.snippets).toEqual(legacy);
    expect(localStorage.getItem(LEGACY)).toBe(JSON.stringify(legacy));
    expect(result.current.persistError).toBe('Browser storage is full.');
    // Let the unmount flush (which retries the migration, and fails) finish inside this test.
    unmount();
    await deskStoreIdle();
  });

  it.each([
    ['not JSON', '{nope'],
    ['a newer schema', JSON.stringify([{ ...clip('x'), schemaVersion: 2 }])],
    [
      'a malformed lineage',
      JSON.stringify([{ ...clip('x'), lineage: { head: 'h', versions: [] } }]),
    ],
  ])('neither migrates nor deletes %s', async (_name, raw) => {
    localStorage.setItem(LEGACY, raw);
    const { result } = await renderDesk();
    expect(result.current.snippets).toEqual([]);
    expect(localStorage.getItem(LEGACY)).toBe(raw);
    expect((await loadDesk('x')).snippets).toEqual([]);
    expect(result.current.persistError).toBeNull();
  });
});

describe('loading', () => {
  it('writes nothing before the initial load resolves, and refuses changes meanwhile', async () => {
    const saved = [clip('kept-1'), clip('kept-2')];
    const seed = await renderDesk();
    saved.forEach((snippet) => act(() => seed.result.current.addSnippet(snippet)));
    await storedDesk(seed.result.current);
    seed.unmount();

    const put = vi.spyOn(IDBObjectStore.prototype, 'put');
    const del = vi.spyOn(IDBObjectStore.prototype, 'delete');
    const { result } = renderHook(() => useDesk(), { wrapper: DeskProvider });
    // Before the read resolves: loading, empty, and a change goes nowhere.
    expect(result.current.loading).toBe(true);
    expect(result.current.snippets).toEqual([]);
    act(() => result.current.addSnippet(clip('too-early')));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.snippets.map((snippet) => snippet.id)).toEqual(['kept-1', 'kept-2']);
    // Wait out the debounce: loading itself must not have caused a write.
    await new Promise((resolve) => setTimeout(resolve, DESK_WRITE_DEBOUNCE_MS * 3));
    await deskStoreIdle();
    expect(put).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    expect((await loadDesk('x')).snippets.map((snippet) => snippet.id)).toEqual([
      'kept-1',
      'kept-2',
    ]);
  });

  it('shows a loading state, then the desk', async () => {
    const seed = await renderDesk();
    act(() => seed.result.current.addSnippet(clip('shown')));
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
    act(() => seed.result.current.addSnippet(clip('precious')));
    await storedDesk(seed.result.current);
    seed.unmount();
    // A clip record from a newer app version: unreadable here, so it is left alone.
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('hrifa-composition-workbench');
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('desk-clips', 'readwrite');
        tx.objectStore('desk-clips').put({ ...clip('precious'), schemaVersion: 2 });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
    const put = vi.spyOn(IDBObjectStore.prototype, 'put');
    const { result } = await renderDesk();
    expect(result.current.snippets).toEqual([]);
    expect(result.current.persistError).toMatch(/left untouched/);
    expect(result.current.locked).toBe(true);
    // A locked desk refuses edits outright: they could never be saved.
    act(() => result.current.addSnippet(clip('new')));
    expect(result.current.snippets).toEqual([]);
    await act(async () => {
      await result.current.flushDesk();
    });
    expect(put).not.toHaveBeenCalled();
  });
});

describe('save failures', () => {
  function Harness() {
    const desk = useDesk();
    return (
      <>
        <button type="button" onClick={() => desk.addSnippet(clip(`c-${desk.snippets.length}`))}>
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
    // The failed write was retried in full: all three clips are stored.
    expect((await loadDesk('x')).snippets).toHaveLength(3);
  });

  it('reports the failure through flushDesk and the context', async () => {
    const { result } = await renderDesk();
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new Error('disk on fire');
    });
    act(() => result.current.addSnippet(clip('a')));
    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.flushDesk();
    });
    expect(saved).toBe(false);
    expect(result.current.persistError).toBe('disk on fire.');
  });
});

describe('undo and redo through the single history', () => {
  it('undoes edits, restores and deletes, sharing untouched clips', async () => {
    const { result } = await renderDesk();
    act(() => result.current.addSnippet(clip('a')));
    act(() => result.current.addSnippet(clip('b')));
    const untouched = result.current.snippets[1];
    act(() => edit(result.current, 'a', 1));
    act(() => edit(result.current, 'a', 2));
    const states = [snapshotOf(result.current.snippets)];

    const rootId = result.current.snippets[0].lineage!.versions.find(
      (version) => version.parentId === null
    )!.id;
    act(() => void result.current.restoreSnippetVersionById('a', rootId));
    states.push(snapshotOf(result.current.snippets));
    const withLineage = result.current.snippets[0];
    act(() => result.current.removeSnippet('a'));
    expect(result.current.snippets.map((snippet) => snippet.id)).toEqual(['b']);

    // Undo the delete: the very clip comes back, lineage and all.
    act(() => undo());
    expect(result.current.snippets[0]).toBe(withLineage);
    // Undo the restore, then both edits.
    act(() => undo());
    expect(snapshotOf(result.current.snippets)).toEqual(states[0]);
    act(() => undo());
    act(() => undo());
    expect(result.current.snippets[0].lineage).toBeUndefined();
    expect(result.current.snippets[1]).toBe(untouched);
    act(() => undo());
    act(() => undo());
    expect(canUndo()).toBe(false);
    expect(result.current.snippets).toEqual([]);

    for (let step = 0; step < 6; step += 1) {
      act(() => redo());
    }
    expect(result.current.snippets.map((snippet) => snippet.id)).toEqual(['b']);
    // What undo and redo reached is what is stored.
    expect((await storedDesk(result.current)).map((snippet) => snippet.id)).toEqual(['b']);
  });
});

describe('big clips and caps', () => {
  it('edits and saves a 4096-event clip, and reloads it', async () => {
    const { result, unmount } = await renderDesk();
    act(() => result.current.addSnippet(clip('big', 4096)));
    act(() => edit(result.current, 'big', 1));
    act(() => edit(result.current, 'big', 2));
    const live = result.current.snippets[0];
    expect(live.packet.items).toHaveLength(4096);
    expect(live.lineage!.versions).toHaveLength(3);
    expect(await storedDesk(result.current)).toEqual([live]);
    expect(result.current.persistError).toBeNull();
    unmount();
    const again = await renderDesk();
    expect(again.result.current.snippets).toEqual([live]);
    again.unmount();
  });

  it('counts the head packet in the character budget, keeping root and head', () => {
    const base = clip('a', 200);
    const first = commitSnippetEdit(base, withShift(base, 1), 'edit-clip', { handEdit: true });
    if (!first.ok) {
      throw new Error(first.error);
    }
    let snippet = first.snippet;
    for (let shift = 2; shift < 6; shift += 1) {
      endEditSession(snippet.id);
      const next = commitSnippetEdit(snippet, withShift(snippet, shift), 'edit-clip', {
        handEdit: true,
      });
      if (!next.ok) {
        throw new Error(next.error);
      }
      snippet = next.snippet;
    }
    const lineage = snippet.lineage!;
    expect(lineage.versions).toHaveLength(6);
    const headSize = JSON.stringify(snippet.packet).length;
    const oneSnapshot = JSON.stringify(lineage.versions[1]).length;
    // Room for the head and about two snapshots: the rest must go.
    const pruned = pruneLineage(
      lineage,
      { maxVersions: 500, maxChars: headSize + oneSnapshot * 3 },
      snippet.packet
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

/** Runs one request against the clips store directly, as another tab (or a crash) would leave it. */
function rawClips<T>(mode: IDBTransactionMode, use: (store: IDBObjectStore) => IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    const opened = indexedDB.open(DESK_DB_NAME);
    opened.onerror = () => reject(opened.error);
    opened.onsuccess = () => {
      const db = opened.result;
      const tx = db.transaction('desk-clips', mode);
      const req = use(tx.objectStore('desk-clips'));
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
    act(() => result.current.addSnippet(clip('a')));
    await storedDesk(result.current);

    // Another tab adds a clip.
    const other = await loadDesk('x');
    await enqueueDeskTask(() =>
      writeDeskNow({
        snippets: [...other.snippets, clip('theirs')],
        stored: other.stored,
        expectedRev: other.rev,
      })
    );

    act(() => result.current.addSnippet(clip('b')));
    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.flushDesk();
    });
    expect(saved).toBe(false);
    expect(result.current.persistError).toBe(
      'The desk changed in another tab. Reload to see the latest version.'
    );
    // Their desk is intact, not orphaned by our order.
    expect((await loadDesk('x')).snippets.map((snippet) => snippet.id)).toEqual(['a', 'theirs']);
  });

  it('keeps writing in sequence when nothing else touched the desk', async () => {
    const { result } = await renderDesk();
    act(() => result.current.addSnippet(clip('a')));
    await storedDesk(result.current);
    act(() => result.current.addSnippet(clip('b')));
    expect((await storedDesk(result.current)).map((snippet) => snippet.id)).toEqual(['a', 'b']);
    expect(result.current.persistError).toBeNull();
  });

  it('loads a desk with a hole in its order, skipping it with a warning instead of locking', async () => {
    const seed = await renderDesk();
    ['a', 'b', 'c'].forEach((id) => act(() => seed.result.current.addSnippet(clip(id))));
    await storedDesk(seed.result.current);
    seed.unmount();
    // Another tab removed b (record gone) and a crash left d without an order entry.
    await rawClips('readwrite', (store) => store.delete('b'));
    await rawClips('readwrite', (store) => store.put(clip('d')));

    const { result } = await renderDesk();
    expect(result.current.snippets.map((snippet) => snippet.id)).toEqual(['a', 'c', 'd']);
    expect(result.current.persistError).toMatch(/repaired/);
    // Not locked: it can be changed and saved, and the warning clears.
    act(() => result.current.addSnippet(clip('e')));
    expect((await storedDesk(result.current)).map((snippet) => snippet.id)).toEqual([
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
        writeDeskNow({ snippets: [clip('a'), clip('b')], stored: new Map(), expectedRev: 0 })
      )
    ).rejects.toThrow('full');
    vi.restoreAllMocks();
    expect(await rawClips('readonly', (store) => store.getAll())).toEqual([]);
    expect((await loadDesk('x')).rev).toBe(0);
  });

  it('retries a blocked open, then reports it and closes connections that open late', async () => {
    const requests: Record<string, unknown>[] = [];
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      const request: Record<string, unknown> = {};
      requests.push(request);
      return request as unknown as IDBOpenDBRequest;
    });
    const loading = loadDesk('x');
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
    const loaded = await loadDesk('x');
    expect(loaded.writable).toBe(true);
    expect(calls).toBe(2);
  });

  it('removes the localStorage key after the first successful write following a failed migration', async () => {
    const legacy = [clip('old-1')];
    localStorage.setItem(LEGACY, JSON.stringify(legacy));
    const failing = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    const { result } = await renderDesk();
    expect(localStorage.getItem(LEGACY)).not.toBeNull();
    failing.mockRestore();

    act(() => result.current.addSnippet(clip('new')));
    expect((await storedDesk(result.current)).map((snippet) => snippet.id)).toEqual([
      'old-1',
      'new',
    ]);
    expect(localStorage.getItem(LEGACY)).toBeNull();
    expect(result.current.persistError).toBeNull();
  });
});

describe('write timing and cost', () => {
  it('waits for a gesture to pause before writing, but writes once it does', async () => {
    const { result } = await renderDesk();
    act(() => result.current.addSnippet(clip('a')));
    await storedDesk(result.current);
    const put = vi.spyOn(IDBObjectStore.prototype, 'put');
    act(() => edit(result.current, 'a', 1, 'drag:1'));
    // Well past the ordinary debounce: still nothing written while the gesture may continue.
    await new Promise((resolve) => setTimeout(resolve, DESK_WRITE_DEBOUNCE_MS * 3));
    expect(put).not.toHaveBeenCalled();
    await waitFor(() => expect(put).toHaveBeenCalled(), { timeout: 3000 });
    await deskStoreIdle();
    expect((await loadDesk('x')).snippets[0].lineage!.versions).toHaveLength(2);
  });

  it('does not re-measure the whole history on each edit', () => {
    let snippet = clip('a', 20);
    for (let shift = 1; shift <= 40; shift += 1) {
      endEditSession(snippet.id);
      const next = commitSnippetEdit(snippet, withShift(snippet, shift), 'edit-clip', {
        handEdit: true,
      });
      if (!next.ok) {
        throw new Error(next.error);
      }
      snippet = next.snippet;
    }
    expect(snippet.lineage!.versions).toHaveLength(41);
    const stringify = vi.spyOn(JSON, 'stringify');
    endEditSession(snippet.id);
    const last = commitSnippetEdit(snippet, withShift(snippet, 99), 'edit-clip', {
      handEdit: true,
    });
    // A handful (the packet copies, the head, the lineage frame), not one per version.
    expect(stringify.mock.calls.length).toBeLessThan(15);
    expect(last.ok && acceptsSnippets([last.snippet])).toBe(true);
  });
});
