/**
 * The module registry as data: what the layout core needs to know about a module (id, title, the size classes it has a
 * rendering for, its minimum size). The render function is not here; the React layer attaches it by id. Module ids are
 * plain strings, an open set: nothing in the layout core names a particular module.
 */
import { sizeAtLeast, type SlotSize } from './size';

export type ModuleId = string;

export interface ModuleMeta {
  id: ModuleId;
  title: string;
  /** The size classes the module has a deliberate rendering for. */
  sizes: readonly SlotSize[];
  /** The smallest room the module accepts; the Stage enforces it in M3 (the M2 layout core does not). */
  minSize: SlotSize;
}

export type ModuleRegistry = ReadonlyMap<ModuleId, ModuleMeta>;

/** Build a registry; a repeated id is a programming error and throws. */
export function createRegistry(metas: readonly ModuleMeta[]): ModuleRegistry {
  const map = new Map<ModuleId, ModuleMeta>();
  for (const m of metas) {
    if (map.has(m.id)) {
      throw new Error(`Duplicate module id: ${m.id}`);
    }
    map.set(m.id, m);
  }
  return map;
}

export const hasModule = (registry: ModuleRegistry, id: unknown): id is ModuleId =>
  typeof id === 'string' && registry.has(id);

/** True when every size the module declares is at least its minSize. */
export const sizesSatisfyMin = (m: ModuleMeta): boolean =>
  m.sizes.every((s) => sizeAtLeast(s, m.minSize));

/** The ids of registered modules whose declared sizes break their own minSize (empty when the registry is sound). */
export const registryProblems = (registry: ModuleRegistry): ModuleId[] =>
  [...registry.values()].filter((m) => !sizesSatisfyMin(m)).map((m) => m.id);
