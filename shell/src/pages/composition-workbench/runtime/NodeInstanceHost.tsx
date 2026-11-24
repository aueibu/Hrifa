import { memo, useCallback, useMemo } from 'react';
import { NodeActiveContext } from '../components/NodeHost';
import type { CompositionOutputRef } from '../compositionRouting';
import {
  createDefaultNodeRouteState,
  type CompositionNodeId,
  type NodeRouteState,
} from '../compositionWorkspace';
import { nodeRegistry } from './nodeRegistry';
import type { OutputStore } from './outputStore';
import { useOutputs } from './useOutputs';
import classes from '../CompositionWorkbench.module.css';

export interface NodeInstanceHostProps {
  store: OutputStore;
  instanceId: string;
  nodeId: CompositionNodeId;
  instanceLabel: string;
  dataBlockId?: string;
  /** Whether this instance is the one shown; the others stay mounted and hidden. */
  shown: boolean;
  routeState: NodeRouteState | undefined;
  // Page-level callbacks, stable across renders; the host binds them to its instance.
  onBind(
    instanceId: string,
    nodeId: CompositionNodeId,
    port: string,
    source: CompositionOutputRef | null
  ): void;
  onAddChannel(instanceId: string): void;
  onRemoveChannel(instanceId: string, port: string): void;
}

/**
 * One placed node: the hidden-unless-shown host div and the node the registry renders. Memoized
 * on primitives and stable callbacks, so it re-renders when its own inputs change, and (only for a
 * node that takes `outputs`) when a published output changes. A source node does not re-render
 * when another node publishes.
 */
export const NodeInstanceHost = memo(function NodeInstanceHost({
  store,
  instanceId,
  nodeId,
  instanceLabel,
  dataBlockId,
  shown,
  routeState,
  onBind,
  onAddChannel,
  onRemoveChannel,
}: NodeInstanceHostProps) {
  const entry = nodeRegistry[nodeId];
  const outputs = useOutputs(store, entry.takesOutputs);
  const resolvedRouteState = useMemo(
    () => routeState ?? createDefaultNodeRouteState(entry.ports ?? []),
    [entry.ports, routeState]
  );
  const bind = useCallback(
    (port: string, source: CompositionOutputRef | null) => onBind(instanceId, nodeId, port, source),
    [instanceId, nodeId, onBind]
  );
  const addChannel = useCallback(() => onAddChannel(instanceId), [instanceId, onAddChannel]);
  const removeChannel = useCallback(
    (port: string) => onRemoveChannel(instanceId, port),
    [instanceId, onRemoveChannel]
  );
  return (
    <div className={classes.nodeHost} hidden={!shown}>
      <NodeActiveContext.Provider value={shown}>
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
      </NodeActiveContext.Provider>
    </div>
  );
});
