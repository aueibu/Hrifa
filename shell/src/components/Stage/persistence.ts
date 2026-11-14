/**
 * Layout storage for the Stage page. The pure core (src/lib/stage) never touches storage; this does, defensively:
 * storage can be missing or throw (private windows, quota), and neither case may break the page. Only the layout key
 * `hrifa.stage.layout.v1` is read or written; no other page's keys.
 */
import {
  LAYOUT_STORAGE_KEY,
  parseLayout,
  serializeLayout,
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

/** The stored layout (sanitised against the registry), or `fallback` when nothing usable is stored. */
export function loadLayout(
  storage: StageStorage | undefined,
  registry: ModuleRegistry,
  fallback: Layout
): Layout {
  let raw: string | null = null;
  try {
    raw = storage?.getItem(LAYOUT_STORAGE_KEY) ?? null;
  } catch {
    raw = null;
  }
  return parseLayout(raw, registry, fallback);
}

/** Store a layout; false when storage is missing or threw. */
export function saveLayout(storage: StageStorage | undefined, layout: Layout): boolean {
  try {
    if (!storage) {
      return false;
    }
    storage.setItem(LAYOUT_STORAGE_KEY, serializeLayout(layout));
    return true;
  } catch {
    return false;
  }
}
