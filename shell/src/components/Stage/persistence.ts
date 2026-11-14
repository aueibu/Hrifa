/**
 * Layout storage for the Stage page. The pure core (src/lib/stage) never touches storage; this does, defensively:
 * storage can be missing or throw (private windows, quota), and neither case may break the page. Only the layout key
 * (default `hrifa.stage.layout.v1`, or a given key that starts with `hrifa.stage.`) is read or written.
 */
import {
  parseLayout,
  serializeLayout,
  stageStorageKey,
  type Layout,
  type ModuleRegistry,
} from '../../lib/stage';

export interface StageStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The browser's localStorage, or undefined when it cannot be reached. */
export function browserStorage(): StageStorage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * The stored layout (sanitised against the registry), or `fallback` when nothing usable is stored. `key` defaults to
 * the Stage layout key; a given key must start with `hrifa.stage.` (otherwise this throws).
 */
export function loadLayout(
  storage: StageStorage | undefined,
  registry: ModuleRegistry,
  fallback: Layout,
  key?: string
): Layout {
  const k = stageStorageKey(key);
  let raw: string | null = null;
  try {
    raw = storage?.getItem(k) ?? null;
  } catch {
    raw = null;
  }
  return parseLayout(raw, registry, fallback);
}

/** Store a layout (under `key`, default the Stage layout key; throws for a key without `hrifa.stage.`); false when storage is missing or threw. */
export function saveLayout(
  storage: StageStorage | undefined,
  layout: Layout,
  key?: string
): boolean {
  const k = stageStorageKey(key);
  try {
    if (!storage) {
      return false;
    }
    storage.setItem(k, serializeLayout(layout));
    return true;
  } catch {
    return false;
  }
}
