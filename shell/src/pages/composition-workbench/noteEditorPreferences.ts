import { useCallback, useSyncExternalStore } from 'react';

/**
 * Per-viewer settings of the note clip editor: the length a newly entered note gets (set by dragging
 * sideways while entering one) and the grid subdivision. Like the New clip defaults they live under a
 * key outside the workbench prefix, so a saved project never captures them, and they are never
 * recorded in history or written to a clip.
 */
export const NOTE_EDITOR_PREFERENCES_KEY = 'hrifa.note-editor.v1';

export const MIN_ENTRY_LENGTH = 1 / 32;
export const MAX_ENTRY_LENGTH = 64;

/** A grid choice: `quarters` is null for the automatic grid, which adapts to the zoom. */
export interface GridOption {
  id: string;
  label: string;
  quarters: number | null;
}

/** Whole-note fractions 1/1 to 1/32, then the triplets (three in the time of two). */
export const GRID_OPTIONS: GridOption[] = [
  { id: 'auto', label: 'Auto', quarters: null },
  ...[1, 2, 4, 8, 16, 32].map((division) => ({
    id: `1/${division}`,
    label: `1/${division}`,
    quarters: 4 / division,
  })),
  ...[2, 4, 8, 16, 32].map((division) => ({
    id: `1/${division}T`,
    label: `1/${division} triplet`,
    quarters: ((4 / division) * 2) / 3,
  })),
];

export interface NoteEditorPreferences {
  /** Quarter notes; null until the viewer has set one (the grid unit is used). */
  entryLength: number | null;
  /** The id of a `GRID_OPTIONS` entry. */
  grid: string;
}

const defaults: NoteEditorPreferences = { entryLength: null, grid: 'auto' };

const listeners = new Set<() => void>();
let cache: { raw: string | null; value: NoteEditorPreferences } | null = null;

function readRaw(): string | null {
  try {
    return localStorage.getItem(NOTE_EDITOR_PREFERENCES_KEY);
  } catch {
    return null;
  }
}

export function readNoteEditorPreferences(): NoteEditorPreferences {
  const raw = readRaw();
  if (cache && cache.raw === raw) {
    return cache.value;
  }
  let value = defaults;
  try {
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const length = parsed.entryLength;
    value = {
      entryLength:
        typeof length === 'number' &&
        Number.isFinite(length) &&
        length >= MIN_ENTRY_LENGTH &&
        length <= MAX_ENTRY_LENGTH
          ? length
          : null,
      grid:
        typeof parsed.grid === 'string' && GRID_OPTIONS.some((option) => option.id === parsed.grid)
          ? parsed.grid
          : defaults.grid,
    };
  } catch {
    // A damaged value reads as the defaults.
  }
  cache = { raw, value };
  return value;
}

export function writeNoteEditorPreferences(patch: Partial<NoteEditorPreferences>) {
  const next = { ...readNoteEditorPreferences(), ...patch };
  if (next.entryLength !== null) {
    // The range the read accepts, so what is written always reads back.
    next.entryLength = Number.isFinite(next.entryLength)
      ? Math.min(MAX_ENTRY_LENGTH, Math.max(MIN_ENTRY_LENGTH, next.entryLength))
      : null;
  }
  try {
    localStorage.setItem(NOTE_EDITOR_PREFERENCES_KEY, JSON.stringify(next));
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

/** The note editor's per-viewer settings, shared live between every editor that uses them. */
export function useNoteEditorPreferences() {
  const value = useSyncExternalStore(subscribe, readNoteEditorPreferences, () => defaults);
  const update = useCallback(
    (patch: Partial<NoteEditorPreferences>) => writeNoteEditorPreferences(patch),
    []
  );
  return [value, update] as const;
}
