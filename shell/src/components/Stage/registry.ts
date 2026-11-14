/**
 * The registry in the React layer: `StageModule` is the data-only `ModuleMeta` from src/lib/stage plus the render
 * function. A module is given a size class and nothing else (no layout, column, side or pixels; ARCHITECTURE.md
 * section 3). The registry is built once at module scope with `createStageRegistry`.
 */
import type { ReactNode } from 'react';
import {
  createRegistry,
  type ModuleMeta,
  type ModuleRegistry,
  type SlotSize,
} from '../../lib/stage';

export type StageModule = ModuleMeta & { render(size: SlotSize): ReactNode };

export interface StageRegistry {
  /** The data-only registry the layout core reads. */
  meta: ModuleRegistry;
  /** The same modules with their render functions. */
  modules: ReadonlyMap<string, StageModule>;
}

export function createStageRegistry(modules: readonly StageModule[]): StageRegistry {
  const meta = createRegistry(
    modules.map(({ id, title, sizes, minSize }) => ({ id, title, sizes, minSize }))
  );
  return { meta, modules: new Map(modules.map((m) => [m.id, m])) };
}
