import { useCallback, useSyncExternalStore } from 'react';

/**
 * Per-viewer defaults for "New clip" (type and length in bars). They live under a key outside the
 * workbench prefix (`hrifa.composition-workbench.`), so a saved project never captures them, and
 * they are never recorded in history.
 */
export const CLIP_DEFAULTS_KEY = 'hrifa.clip-defaults.v1';

export const MIN_CLIP_BARS = 1;
export const MAX_CLIP_BARS = 64;

export interface ClipDefaults {
  /** Id of a registered clip type. */
  typeId: string;
  /** Length of a new clip, in whole bars of the project meter. */
  bars: number;
}

const defaults: ClipDefaults = { typeId: 'notes', bars: 1 };

const listeners = new Set<() => void>();
let cache: { raw: string | null; value: ClipDefaults } | null = null;

function readRaw(): string | null {
  try {
    return localStorage.getItem(CLIP_DEFAULTS_KEY);
  } catch {
    return null;
  }
}

export function readClipDefaults(): ClipDefaults {
  const raw = readRaw();
  if (cache && cache.raw === raw) {
    return cache.value;
  }
  let value = defaults;
  try {
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const bars = parsed.bars;
    value = {
      typeId:
        typeof parsed.typeId === 'string' && parsed.typeId !== '' ? parsed.typeId : defaults.typeId,
      bars:
        typeof bars === 'number' &&
        Number.isInteger(bars) &&
        bars >= MIN_CLIP_BARS &&
        bars <= MAX_CLIP_BARS
          ? bars
          : defaults.bars,
    };
  } catch {
    // A damaged value reads as the defaults.
  }
  cache = { raw, value };
  return value;
}

export function writeClipDefaults(patch: Partial<ClipDefaults>) {
  const next = { ...readClipDefaults(), ...patch };
  try {
    localStorage.setItem(CLIP_DEFAULTS_KEY, JSON.stringify(next));
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

/** The New clip defaults, shared live between every component that uses them. */
export function useClipDefaults() {
  const value = useSyncExternalStore(subscribe, readClipDefaults, () => defaults);
  const update = useCallback((patch: Partial<ClipDefaults>) => writeClipDefaults(patch), []);
  return [value, update] as const;
}
