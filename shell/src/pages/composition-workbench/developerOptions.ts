import { useCallback, useSyncExternalStore } from 'react';

/**
 * Per-viewer developer options. They live under a key outside the workbench prefix
 * (`hrifa.composition-workbench.`), so a saved project never captures them, and they are never
 * recorded in history.
 */
export const DEVELOPER_OPTIONS_KEY = 'hrifa.developer-options.v1';

export interface DeveloperOptions {
  /** Whether opening a project also replaces transport and sounds (tempo, metronome, voices). */
  openIncludesSettings: boolean;
}

const defaults: DeveloperOptions = { openIncludesSettings: true };

const listeners = new Set<() => void>();
let cache: { raw: string | null; value: DeveloperOptions } | null = null;

function readRaw(): string | null {
  try {
    return localStorage.getItem(DEVELOPER_OPTIONS_KEY);
  } catch {
    return null;
  }
}

export function readDeveloperOptions(): DeveloperOptions {
  const raw = readRaw();
  if (cache && cache.raw === raw) {
    return cache.value;
  }
  let value = defaults;
  try {
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    value = {
      openIncludesSettings:
        typeof parsed.openIncludesSettings === 'boolean'
          ? parsed.openIncludesSettings
          : defaults.openIncludesSettings,
    };
  } catch {
    // A damaged value reads as the defaults.
  }
  cache = { raw, value };
  return value;
}

export function writeDeveloperOptions(patch: Partial<DeveloperOptions>) {
  const next = { ...readDeveloperOptions(), ...patch };
  try {
    localStorage.setItem(DEVELOPER_OPTIONS_KEY, JSON.stringify(next));
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

/** The developer options, shared live between every component that uses them. */
export function useDeveloperOptions() {
  const options = useSyncExternalStore(subscribe, readDeveloperOptions, () => defaults);
  const update = useCallback(
    (patch: Partial<DeveloperOptions>) => writeDeveloperOptions(patch),
    []
  );
  return [options, update] as const;
}
