import { useCallback, useSyncExternalStore } from 'react';

/**
 * The Outliner's per-viewer session (workbench O2a): which scene is active and which row is selected.
 * The viewer's, like `auditionPreferences.ts`: a key outside the project prefix, never project data,
 * never in history. A stale id (a deleted scene or row) is the panel's to ignore.
 */
export const SCENE_SESSION_KEY = 'hrifa.scene-session.v1';

export interface SceneSession {
  activeSceneId: string | null;
  selectedId: string | null;
}

const EMPTY: SceneSession = { activeSceneId: null, selectedId: null };
const listeners = new Set<() => void>();
let cache: { raw: string | null; value: SceneSession } | null = null;

function readRaw(): string | null {
  try {
    return localStorage.getItem(SCENE_SESSION_KEY);
  } catch {
    return null;
  }
}

const idOrNull = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null);

export function readSceneSession(): SceneSession {
  const raw = readRaw();
  if (cache && cache.raw === raw) {
    return cache.value;
  }
  let value = EMPTY;
  try {
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    value = {
      activeSceneId: idOrNull(parsed.activeSceneId),
      selectedId: idOrNull(parsed.selectedId),
    };
  } catch {
    // A damaged value reads as empty.
  }
  cache = { raw, value };
  return value;
}

export function writeSceneSession(patch: Partial<SceneSession>) {
  const next = { ...readSceneSession(), ...patch };
  try {
    localStorage.setItem(SCENE_SESSION_KEY, JSON.stringify(next));
  } catch {
    // Kept in memory for this session when storage is unavailable.
  }
  cache = { raw: readRaw(), value: next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The viewer's scene session, shared live by the Outliner and Properties panels. */
export function useSceneSession() {
  const value = useSyncExternalStore(subscribe, readSceneSession, () => EMPTY);
  const update = useCallback((patch: Partial<SceneSession>) => writeSceneSession(patch), []);
  return [value, update] as const;
}
