import { useCallback, useSyncExternalStore } from 'react';
import { defaultAuditionSettings, type AuditionSettings } from './dataBlocks/registry';

/**
 * The listener's audition settings (R3, W-64): Play mode, Base octave, Offset and Loop. They are the
 * viewer's, never the data-block's: they live under a key outside the workbench prefix (like the
 * note editor's and New data-block's), so a saved project never captures them and nothing here
 * is recorded in history or written to a data-block. `lengthMismatch` (R4) is not a viewer setting
 * yet and stays at its default.
 */
export const AUDITION_PREFERENCES_KEY = 'hrifa.audition-settings.v1';

export const MIN_BASE_OCTAVE = -1;
export const MAX_BASE_OCTAVE = 9;
export const MAX_OFFSET = 999;

const listeners = new Set<() => void>();
let cache: { raw: string | null; value: AuditionSettings } | null = null;

function readRaw(): string | null {
  try {
    return localStorage.getItem(AUDITION_PREFERENCES_KEY);
  } catch {
    return null;
  }
}

function wholeNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}

export function readAuditionSettings(): AuditionSettings {
  const raw = readRaw();
  if (cache && cache.raw === raw) {
    return cache.value;
  }
  let value = defaultAuditionSettings;
  try {
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    value = {
      ...defaultAuditionSettings,
      mode: parsed.mode === 'together' ? 'together' : 'sequence',
      baseOctave: wholeNumber(
        parsed.baseOctave,
        MIN_BASE_OCTAVE,
        MAX_BASE_OCTAVE,
        defaultAuditionSettings.baseOctave
      ),
      offset: wholeNumber(parsed.offset, -MAX_OFFSET, MAX_OFFSET, defaultAuditionSettings.offset),
      loop: parsed.loop !== false,
    };
  } catch {
    // A damaged value reads as the defaults.
  }
  cache = { raw, value };
  return value;
}

export function writeAuditionSettings(patch: Partial<AuditionSettings>) {
  const next = { ...readAuditionSettings(), ...patch };
  next.baseOctave = wholeNumber(
    next.baseOctave,
    MIN_BASE_OCTAVE,
    MAX_BASE_OCTAVE,
    defaultAuditionSettings.baseOctave
  );
  next.offset = wholeNumber(next.offset, -MAX_OFFSET, MAX_OFFSET, 0);
  try {
    localStorage.setItem(AUDITION_PREFERENCES_KEY, JSON.stringify(next));
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

/** The viewer's audition settings, shared live by every desk card. */
export function useAuditionSettings() {
  const value = useSyncExternalStore(
    subscribe,
    readAuditionSettings,
    () => defaultAuditionSettings
  );
  const update = useCallback(
    (patch: Partial<AuditionSettings>) => writeAuditionSettings(patch),
    []
  );
  return [value, update] as const;
}
