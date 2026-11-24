import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canUndo, redo, resetHistory, undo } from '../history';
import { setReloading } from '../reloading';
import {
  deleteState,
  getState,
  hasState,
  persistState,
  releaseState,
  resetStateStore,
  setState,
  subscribeState,
} from './stateStore';

const isNumber = (value: unknown): value is number => typeof value === 'number';
const config = { fallback: 7, accepts: isNumber };
// A recorded key (not in the transient list).
const KEY = 'hrifa.composition-workbench.test.state-store';

function stubStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  });
  return data;
}

describe('stateStore', () => {
  let storage: Map<string, string>;
  beforeEach(() => {
    storage = stubStorage();
    resetStateStore();
    resetHistory();
    setReloading(false);
  });

  it('reads storage through migrate and accepts, else the fallback', () => {
    storage.set(KEY, JSON.stringify('3'));
    const migrated = getState(KEY, {
      ...config,
      migrate: (value) => (typeof value === 'string' ? Number(value) : value),
    });
    expect(migrated).toBe(3);

    resetStateStore();
    storage.set(KEY, JSON.stringify('x'));
    expect(getState(KEY, config)).toBe(7);

    resetStateStore();
    storage.set(KEY, '{not json');
    expect(getState(KEY, config)).toBe(7);

    resetStateStore();
    storage.delete(KEY);
    expect(getState(KEY, { ...config, fallback: () => 11 })).toBe(11);
  });

  it('set resolves updaters against the latest value, ignores Object.is, records and persists', () => {
    getState(KEY, config);
    setState<number>(KEY, (current) => current + 1);
    setState<number>(KEY, (current) => current + 1);
    expect(getState(KEY, config)).toBe(9);
    expect(storage.get(KEY)).toBe('9');
    setState<number>(KEY, 9);
    undo();
    // Both writes coalesce into one step that goes back to the first previous value.
    expect(getState(KEY, config)).toBe(7);
    expect(storage.get(KEY)).toBe('7');
    redo();
    expect(getState(KEY, config)).toBe(9);
    expect(canUndo()).toBe(true);
  });

  it('records nothing for an unrecorded write and while reloading does not touch storage', () => {
    getState(KEY, config);
    setState<number>(KEY, 8, { recorded: false });
    expect(canUndo()).toBe(false);
    expect(storage.get(KEY)).toBe('8');
    setReloading(true);
    setState<number>(KEY, 5, { recorded: false });
    expect(storage.get(KEY)).toBe('8');
    persistState(KEY);
    expect(storage.get(KEY)).toBe('8');
  });

  it('undo reaches a key with no mounted hook through the store applier', () => {
    getState(KEY, config);
    persistState(KEY);
    const listener = vi.fn();
    const unsubscribe = subscribeState(KEY, listener, config);
    setState<number>(KEY, 20);
    listener.mockClear();
    unsubscribe();
    expect(hasState(KEY)).toBe(true);
    undo();
    // While reloading an idle key does not re-read storage, so only the applier can supply this.
    setReloading(true);
    expect(getState(KEY, config)).toBe(7);
    setReloading(false);
  });

  it('notifies subscribers when undo applies a value', () => {
    getState(KEY, config);
    persistState(KEY);
    const listener = vi.fn();
    subscribeState(KEY, listener, config);
    setState<number>(KEY, 20);
    listener.mockClear();
    undo();
    expect(listener).toHaveBeenCalled();
    expect(getState(KEY, config)).toBe(7);
  });

  it('a failed storage write does not strand a resubscribed key', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('full');
      },
      removeItem: () => undefined,
    });
    getState(KEY, config);
    persistState(KEY);
    const old = subscribeState(KEY, () => undefined, config);
    old();
    // Unsynced: the entry is the only copy and is not released.
    expect(hasState(KEY)).toBe(true);
    releaseState(KEY);
    // Released before the new subscribe: it still attaches.
    const listener = vi.fn();
    const unsubscribe = subscribeState(KEY, listener, config);
    setState<number>(KEY, 9, { recorded: false });
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('follows storage when a key with no subscribers is read again', () => {
    getState(KEY, config);
    setState<number>(KEY, 12);
    storage.set(KEY, '40');
    expect(getState(KEY, config)).toBe(40);
    storage.delete(KEY);
    expect(getState(KEY, config)).toBe(7);
  });

  it('releases a key when its last subscriber leaves after the stored value was deleted', () => {
    getState(KEY, config);
    persistState(KEY);
    const unsubscribe = subscribeState(KEY, () => undefined, config);
    storage.delete(KEY);
    unsubscribe();
    expect(hasState(KEY)).toBe(false);
  });

  it('keeps a key whose storage entry still exists', () => {
    getState(KEY, config);
    persistState(KEY);
    subscribeState(KEY, () => undefined, config)();
    expect(hasState(KEY)).toBe(true);
  });

  it('deleteState drops the key and refuses writes to it until storage holds it again', () => {
    getState(KEY, config);
    setState<number>(KEY, 12);
    expect(storage.get(KEY)).toBe('12');
    // The page's delete: remove (and record) the stored value, then drop the key.
    storage.delete(KEY);
    deleteState(KEY);
    expect(hasState(KEY)).toBe(false);
    // A late write finds no key; a render that re-creates it holds a value in memory only.
    setState<number>(KEY, 99);
    expect(getState(KEY, config)).toBe(7);
    setState<number>(KEY, 99);
    expect(storage.has(KEY)).toBe(false);
    persistState(KEY);
    // A mount means the node is live again.
    setState<number>(KEY, 5);
    expect(storage.get(KEY)).toBe('5');
  });

  it('deleteState: an undo that restores storage revives a detached key', () => {
    getState(KEY, config);
    storage.delete(KEY);
    deleteState(KEY);
    expect(getState(KEY, config)).toBe(7);
    // Undo wrote the stored value back; the idle detached entry follows storage and is live.
    storage.set(KEY, '31');
    expect(getState(KEY, config)).toBe(31);
    setState<number>(KEY, 32);
    expect(storage.get(KEY)).toBe('32');
  });
});
