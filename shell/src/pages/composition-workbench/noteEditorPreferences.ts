import { useCallback, useSyncExternalStore } from 'react';
import { MAX_VELOCITY_LANE_HEIGHT, MIN_VELOCITY_LANE_HEIGHT } from '../../components/PianoRoll';

/**
 * Per-viewer settings of the note clip editor: the length and velocity a newly entered note gets
 * (set by dragging sideways and up or down while entering one) and the grid subdivision. Like the
 * New clip defaults they live under a key outside the workbench prefix, so a saved project never captures them, and they are never
 * recorded in history or written to a clip.
 */
export const NOTE_EDITOR_PREFERENCES_KEY = 'hrifa.note-editor.v1';

export const MIN_ENTRY_LENGTH = 1 / 32;
export const MAX_ENTRY_LENGTH = 64;
/** The quietest remembered entry velocity, so a remembered 0% cannot make silent notes. */
export const MIN_ENTRY_VELOCITY = 0.01;

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

/** The inspector Actions panel's collapsible sections, in display order. */
export const ACTION_SECTION_IDS = ['time', 'pitch', 'values', 'clipboard'] as const;
export type ActionSectionId = (typeof ACTION_SECTION_IDS)[number];

/** The named slots the chord picker can occupy (chordInput/ChordPickerHost.tsx). */
export const CHORD_HOSTS = ['dock', 'takeover'] as const;
export type ChordHost = (typeof CHORD_HOSTS)[number];

/** The chord dock's width bounds and default, in pixels (14rem, 30rem, a generous ceiling). */
export const MIN_CHORD_DOCK_WIDTH = 224;
export const DEFAULT_CHORD_DOCK_WIDTH = 480;
export const MAX_CHORD_DOCK_WIDTH = 1600;

export interface NoteEditorPreferences {
  /** Quarter notes; null until the viewer has set one (the grid unit is used). */
  entryLength: number | null;
  /** 0 to 1; null until the viewer has set one (the default entry velocity is used). */
  entryVelocity: number | null;
  /** The id of a `GRID_OPTIONS` entry. */
  grid: string;
  /** The velocity lane under the roll is collapsed to its header. */
  velocityLaneCollapsed: boolean;
  /** The velocity lane's height in pixels; null until the viewer has dragged it (the default is used). */
  laneHeight: number | null;
  /** The Actions panel sections that are open (several at once; all open until the viewer closes some). */
  actionSections: ActionSectionId[];
  /** Where the Chords tool's picker sits: the dock beside the roll, or the takeover of the canvas area. */
  chordHost: ChordHost;
  /** The chord dock's width in pixels; null until the viewer has dragged it (the default is used). */
  chordDockWidth: number | null;
}

const defaults: NoteEditorPreferences = {
  entryLength: null,
  entryVelocity: null,
  grid: 'auto',
  velocityLaneCollapsed: false,
  laneHeight: null,
  actionSections: [...ACTION_SECTION_IDS],
  chordHost: 'dock',
  chordDockWidth: null,
};

const listeners = new Set<() => void>();
let cache: { raw: string | null; value: NoteEditorPreferences } | null = null;

function readRaw(): string | null {
  try {
    return localStorage.getItem(NOTE_EDITOR_PREFERENCES_KEY);
  } catch {
    return null;
  }
}

/** The known section ids of a stored value, in display order; anything else reads as all open. */
function knownSections(value: unknown): ActionSectionId[] {
  if (!Array.isArray(value)) {
    return [...ACTION_SECTION_IDS];
  }
  return ACTION_SECTION_IDS.filter((id) => value.includes(id));
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
      entryVelocity:
        typeof parsed.entryVelocity === 'number' &&
        Number.isFinite(parsed.entryVelocity) &&
        parsed.entryVelocity >= MIN_ENTRY_VELOCITY &&
        parsed.entryVelocity <= 1
          ? parsed.entryVelocity
          : null,
      grid:
        typeof parsed.grid === 'string' && GRID_OPTIONS.some((option) => option.id === parsed.grid)
          ? parsed.grid
          : defaults.grid,
      velocityLaneCollapsed: parsed.velocityLaneCollapsed === true,
      laneHeight:
        typeof parsed.laneHeight === 'number' &&
        Number.isFinite(parsed.laneHeight) &&
        parsed.laneHeight >= MIN_VELOCITY_LANE_HEIGHT &&
        parsed.laneHeight <= MAX_VELOCITY_LANE_HEIGHT
          ? parsed.laneHeight
          : null,
      actionSections: knownSections(parsed.actionSections),
      chordHost: parsed.chordHost === 'takeover' ? 'takeover' : 'dock',
      chordDockWidth:
        typeof parsed.chordDockWidth === 'number' &&
        Number.isFinite(parsed.chordDockWidth) &&
        parsed.chordDockWidth >= MIN_CHORD_DOCK_WIDTH &&
        parsed.chordDockWidth <= MAX_CHORD_DOCK_WIDTH
          ? parsed.chordDockWidth
          : null,
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
  if (next.entryVelocity !== null) {
    next.entryVelocity = Number.isFinite(next.entryVelocity)
      ? Math.min(1, Math.max(MIN_ENTRY_VELOCITY, next.entryVelocity))
      : null;
  }
  if (next.laneHeight !== null) {
    next.laneHeight = Number.isFinite(next.laneHeight)
      ? Math.min(MAX_VELOCITY_LANE_HEIGHT, Math.max(MIN_VELOCITY_LANE_HEIGHT, next.laneHeight))
      : null;
  }
  if (next.chordDockWidth !== null) {
    next.chordDockWidth = Number.isFinite(next.chordDockWidth)
      ? Math.min(MAX_CHORD_DOCK_WIDTH, Math.max(MIN_CHORD_DOCK_WIDTH, next.chordDockWidth))
      : null;
  }
  next.actionSections = knownSections(next.actionSections);
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
