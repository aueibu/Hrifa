import { memo, useCallback, useMemo } from 'react';
import { ModuleActiveContext } from '../components/ModuleHost';
import type { CompositionOutputRef } from '../compositionRouting';
import {
  createDefaultModuleRouteState,
  type CompositionModuleId,
  type ModuleRouteState,
} from '../compositionWorkspace';
import { moduleRegistry } from './moduleRegistry';
import type { OutputStore } from './outputStore';
import { useOutputs } from './useOutputs';
import classes from '../CompositionWorkbench.module.css';

export interface ModuleInstanceHostProps {
  store: OutputStore;
  instanceId: string;
  moduleId: CompositionModuleId;
  instanceLabel: string;
  dataBlockId?: string;
  /** Whether this instance is the one shown; the others stay mounted and hidden. */
  shown: boolean;
  routeState: ModuleRouteState | undefined;
  // Page-level callbacks, stable across renders; the host binds them to its instance.
  onBind(
    instanceId: string,
    moduleId: CompositionModuleId,
    port: string,
    source: CompositionOutputRef | null
  ): void;
  onAddChannel(instanceId: string): void;
  onRemoveChannel(instanceId: string, port: string): void;
}

/**
 * One placed module: the hidden-unless-shown host div and the module the registry renders. Memoized
 * on primitives and stable callbacks, so it re-renders when its own inputs change, and (only for a
 * module that takes `outputs`) when a published output changes. A source module does not re-render
 * when another module publishes.
 */
export const ModuleInstanceHost = memo(function ModuleInstanceHost({
  store,
  instanceId,
  moduleId,
  instanceLabel,
  dataBlockId,
  shown,
  routeState,
  onBind,
  onAddChannel,
  onRemoveChannel,
}: ModuleInstanceHostProps) {
  const entry = moduleRegistry[moduleId];
  const outputs = useOutputs(store, entry.takesOutputs);
  const resolvedRouteState = useMemo(
    () => routeState ?? createDefaultModuleRouteState(entry.ports ?? []),
    [entry.ports, routeState]
  );
  const bind = useCallback(
    (port: string, source: CompositionOutputRef | null) =>
      onBind(instanceId, moduleId, port, source),
    [instanceId, moduleId, onBind]
  );
  const addChannel = useCallback(() => onAddChannel(instanceId), [instanceId, onAddChannel]);
  const removeChannel = useCallback(
    (port: string) => onRemoveChannel(instanceId, port),
    [instanceId, onRemoveChannel]
  );
  return (
    <div className={classes.moduleHost} hidden={!shown}>
      <ModuleActiveContext.Provider value={shown}>
        {entry.render({
          instanceId,
          instanceLabel,
          dataBlockId,
          active: shown,
          outputs,
          routeState: resolvedRouteState,
          onBind: bind,
          onAddChannel: addChannel,
          onRemoveChannel: removeChannel,
        })}
      </ModuleActiveContext.Provider>
    </div>
  );
});
