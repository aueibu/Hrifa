import { useCallback, useSyncExternalStore } from 'react';

/**
 * Per-viewer defaults for "New data-block" (type and length in bars). They live under a key outside the
 * workbench prefix (`hrifa.composition-workbench.`), so a saved project never captures them, and
 * they are never recorded in history.
 */
export const DATA_BLOCK_DEFAULTS_KEY = 'hrifa.data-block-defaults.v1';

export const MIN_DATA_BLOCK_BARS = 1;
export const MAX_DATA_BLOCK_BARS = 64;

export interface DataBlockDefaults {
  /** Id of a registered data-block type. */
  typeId: string;
  /** Length of a new data-block, in whole bars of the project meter. */
  bars: number;
}

const defaults: DataBlockDefaults = { typeId: 'notes', bars: 1 };

const listeners = new Set<() => void>();
let cache: { raw: string | null; value: DataBlockDefaults } | null = null;

function readRaw(): string | null {
  try {
    return localStorage.getItem(DATA_BLOCK_DEFAULTS_KEY);
  } catch {
    return null;
  }
}

export function readDataBlockDefaults(): DataBlockDefaults {
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
        bars >= MIN_DATA_BLOCK_BARS &&
        bars <= MAX_DATA_BLOCK_BARS
          ? bars
          : defaults.bars,
    };
  } catch {
    // A damaged value reads as the defaults.
  }
  cache = { raw, value };
  return value;
}

export function writeDataBlockDefaults(patch: Partial<DataBlockDefaults>) {
  const next = { ...readDataBlockDefaults(), ...patch };
  try {
    localStorage.setItem(DATA_BLOCK_DEFAULTS_KEY, JSON.stringify(next));
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

/** The New data-block defaults, shared live between every component that uses them. */
export function useDataBlockDefaults() {
  const value = useSyncExternalStore(subscribe, readDataBlockDefaults, () => defaults);
  const update = useCallback(
    (patch: Partial<DataBlockDefaults>) => writeDataBlockDefaults(patch),
    []
  );
  return [value, update] as const;
}
