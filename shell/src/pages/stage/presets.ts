/**
 * Layout presets: named saved layouts the page switches between ("sketch", "audition"). Pure rules plus a defensive
 * store, like persistence.ts. Stored under `hrifa.stage.presets.v1` only (the Stage's own prefix). The store holds one
 * layout per preset and which one is active; switching first saves the current layout into the active preset, so each
 * preset remembers the arrangement it was left in. Module ids unknown to the registry are dropped on load, as for the
 * layout itself.
 */
import { parseLayout, serializeLayout, type Layout, type ModuleRegistry } from '../../lib/stage';
import type { StageStorage } from './persistence';

export const PRESETS_STORAGE_KEY = 'hrifa.stage.presets.v1';

export interface PresetDef {
  id: string;
  label: string;
  /** The layout the preset starts with (and returns to on "Reset layout"). */
  layout: Layout;
}

export interface PresetStore {
  active: string;
  layouts: Record<string, Layout>;
}

/** Every preset at its default layout, the first one active. Empty when there are no presets. */
export function initialStore(defs: readonly PresetDef[]): PresetStore {
  return {
    active: defs[0]?.id ?? '',
    layouts: Object.fromEntries(defs.map((d) => [d.id, d.layout])),
  };
}

/** The stored layout of a preset, or its default. */
export function layoutOf(store: PresetStore, defs: readonly PresetDef[], id: string): Layout {
  return store.layouts[id] ?? defs.find((d) => d.id === id)?.layout ?? { version: 1, columns: [] };
}

/** Make `to` the active preset, first saving `current` into the previous one. An unknown `to` changes nothing. */
export function switchPreset(
  store: PresetStore,
  defs: readonly PresetDef[],
  to: string,
  current: Layout
): PresetStore {
  if (!defs.some((d) => d.id === to) || to === store.active) {
    return { ...store, layouts: { ...store.layouts, [store.active]: current } };
  }
  return { active: to, layouts: { ...store.layouts, [store.active]: current } };
}

/** The preset a key press selects: Alt+1 is the first preset, Alt+2 the second, and so on; otherwise null. */
export function presetForKey(
  e: Pick<KeyboardEvent, 'code' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>,
  defs: readonly PresetDef[]
): string | null {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
    return null;
  }
  const m = /^Digit([1-9])$/.exec(e.code);
  return m ? (defs[Number(m[1]) - 1]?.id ?? null) : null;
}

/** Parse a stored string against the presets and registry. Never throws; anything unusable falls back to defaults. */
export function parsePresets(
  raw: string | null | undefined,
  defs: readonly PresetDef[],
  known: ModuleRegistry
): PresetStore {
  const base = initialStore(defs);
  try {
    const v: unknown = JSON.parse(raw ?? 'null');
    if (!v || typeof v !== 'object' || Array.isArray(v)) {
      return base;
    }
    const { active, layouts } = v as { active?: unknown; layouts?: unknown };
    const stored =
      layouts && typeof layouts === 'object' && !Array.isArray(layouts)
        ? (layouts as Record<string, unknown>)
        : {};
    return {
      active:
        typeof active === 'string' && defs.some((d) => d.id === active) ? active : base.active,
      layouts: Object.fromEntries(
        defs.map((d) => [
          d.id,
          d.id in stored ? parseLayout(JSON.stringify(stored[d.id]), known, d.layout) : d.layout,
        ])
      ),
    };
  } catch {
    return base;
  }
}

export const serializePresets = (store: PresetStore): string =>
  JSON.stringify({
    active: store.active,
    layouts: Object.fromEntries(
      Object.entries(store.layouts).map(([k, l]) => [k, JSON.parse(serializeLayout(l))])
    ),
  });

export function loadPresets(
  storage: StageStorage | undefined,
  defs: readonly PresetDef[],
  known: ModuleRegistry
): PresetStore {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(PRESETS_STORAGE_KEY) ?? null;
  } catch {
    raw = null;
  }
  return parsePresets(raw, defs, known);
}

/** Store the presets; false when storage is missing or threw. */
export function savePresets(storage: StageStorage | undefined, store: PresetStore): boolean {
  try {
    if (!storage) {
      return false;
    }
    storage.setItem(PRESETS_STORAGE_KEY, serializePresets(store));
    return true;
  } catch {
    return false;
  }
}
