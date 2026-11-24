import type { CompositionOutputRef } from './compositionRouting';
import { signalTypeRegistry, type SignalTypeId } from './signalTypes';

export type CompositionNodeId =
  | 'interference'
  | 'pitch-list'
  | 'rhythm-list'
  | 'melodicization'
  | 'arithmetic'
  | 'fractioning'
  | 'pair-composition'
  | 'scale-construction'
  | 'scale-evolution'
  | 'rhythm-householder'
  | 'rhythm-edit'
  | 'swirling-mists'
  | 'data-block-source'
  | 'mixer';

/**
 * A node placed on the free canvas. `x`/`y` are the card's top-left corner in canvas units; they
 * are pure presentation and never affect routing.
 */
export interface CompositionNodeInstance {
  id: string;
  nodeId: CompositionNodeId;
  x: number;
  y: number;
  /** A `data-block-source` node only: the desk data-block it publishes; absent for a blank node, which the Add node menu places. */
  dataBlockId?: string;
}

export interface NodeRouteBinding {
  source?: CompositionOutputRef;
  signalType: SignalTypeId;
  treatment: unknown;
}

export type NodeRouteState = Record<string, NodeRouteBinding>;
export type NodeRouteStates = Record<string, NodeRouteState>;

export type CompositionInspectorTarget =
  | { kind: 'node'; instanceId: string }
  | { kind: 'route'; instanceId: string; port: string }
  | { kind: 'canvas' };

export const compositionNodeLabels: Record<CompositionNodeId, string> = {
  interference: 'Interference',
  'pitch-list': 'Pitch List',
  'rhythm-list': 'Rhythm List',
  melodicization: 'Melodicization',
  arithmetic: 'Arithmetic',
  fractioning: 'Fractioning',
  'pair-composition': 'Pair Composition',
  'scale-construction': 'Scale Construction',
  'scale-evolution': 'Scale Evolution',
  'rhythm-householder': 'Rhythm Householder',
  'rhythm-edit': 'Rhythm Edit',
  'swirling-mists': 'Swirling Mists',
  'data-block-source': 'Data-block',
  mixer: 'Mixer',
};

export const defaultCompositionInstances: CompositionNodeInstance[] = [
  { id: 'interference', nodeId: 'interference', x: 0, y: 0 },
  { id: 'pitch-list', nodeId: 'pitch-list', x: 200, y: 0 },
  { id: 'melodicization', nodeId: 'melodicization', x: 100, y: 170 },
];

/**
 * Normalizes stored instance entries to `{ id, nodeId, x, y, dataBlockId? }`. Entries that are not
 * placed on the canvas (no finite `x` and `y`) pass through unchanged.
 */
export function migrateCompositionInstances(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }
  return value.map((candidate) => {
    if (!candidate || typeof candidate !== 'object') {
      return candidate;
    }
    const stored = candidate as Record<string, unknown>;
    if (isFiniteNumber(stored.x) && isFiniteNumber(stored.y)) {
      return {
        id: stored.id,
        nodeId: stored.nodeId,
        x: stored.x,
        y: stored.y,
        ...(typeof stored.dataBlockId === 'string' ? { dataBlockId: stored.dataBlockId } : {}),
      };
    }
    return candidate;
  });
}

/**
 * Mixer inlets are not a fixed list: each channel is one port, identified by a stable id (never a
 * display index, so removing or reordering channels never redirects a connection). The receiver's
 * route state is the single source of truth for which channels exist, in order.
 */
export function newMixerChannelId() {
  return `ch-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultMixerPorts(): { id: string; signalType: SignalTypeId }[] {
  return [newMixerChannelId(), newMixerChannelId()].map((id) => ({ id, signalType: 'numeric' }));
}

/** Labels for the mixer's channels, numbered by position: Ch 1, Ch 2, … */
export function mixerPortLabels(routeState: NodeRouteState | undefined) {
  return Object.keys(routeState ?? {}).map((id, index) => ({
    id,
    label: `Ch ${index + 1}`,
    shortLabel: String(index + 1),
  }));
}

export function createDefaultNodeRouteState(
  ports: { id: string; signalType: SignalTypeId }[]
): NodeRouteState {
  return Object.fromEntries(
    ports.map(({ id, signalType }) => [
      id,
      { source: undefined, signalType, treatment: signalTypeRegistry[signalType].default },
    ])
  );
}

export function compositionInstanceLabel(
  instance: CompositionNodeInstance,
  instances: CompositionNodeInstance[]
) {
  const siblings = instances.filter((candidate) => candidate.nodeId === instance.nodeId);
  const index = siblings.findIndex((candidate) => candidate.id === instance.id);
  const base = compositionNodeLabels[instance.nodeId];
  return siblings.length > 1 ? `${base} ${index + 1}` : base;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNodeId(value: unknown): value is CompositionNodeId {
  return (
    value === 'interference' ||
    value === 'pitch-list' ||
    value === 'rhythm-list' ||
    value === 'melodicization' ||
    value === 'arithmetic' ||
    value === 'fractioning' ||
    value === 'pair-composition' ||
    value === 'scale-construction' ||
    value === 'scale-evolution' ||
    value === 'rhythm-householder' ||
    value === 'rhythm-edit' ||
    value === 'swirling-mists' ||
    value === 'data-block-source' ||
    value === 'mixer'
  );
}

function isSignalTypeId(value: unknown): value is SignalTypeId {
  return value === 'pitch' || value === 'rhythm' || value === 'numeric';
}

function acceptsOutputRef(value: unknown): value is CompositionOutputRef {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as CompositionOutputRef).instanceId === 'string' &&
    typeof (value as CompositionOutputRef).port === 'string'
  );
}

export function acceptsCompositionInstances(value: unknown): value is CompositionNodeInstance[] {
  if (!Array.isArray(value)) {
    return false;
  }
  const ids = new Set<string>();
  return value.every((candidate) => {
    if (!candidate || typeof candidate !== 'object') {
      return false;
    }
    const instance = candidate as CompositionNodeInstance;
    if (
      typeof instance.id !== 'string' ||
      ids.has(instance.id) ||
      !isNodeId(instance.nodeId) ||
      !isFiniteNumber(instance.x) ||
      !isFiniteNumber(instance.y) ||
      (instance.dataBlockId !== undefined && typeof instance.dataBlockId !== 'string')
    ) {
      return false;
    }
    ids.add(instance.id);
    return true;
  });
}

export function acceptsNodeRouteStates(value: unknown): value is NodeRouteStates {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return Object.values(value).every((state) => {
    if (!state || typeof state !== 'object') {
      return false;
    }
    return Object.values(state as NodeRouteState).every((binding) => {
      if (!binding || typeof binding !== 'object') {
        return false;
      }
      const candidate = binding as NodeRouteBinding;
      return (
        (!candidate.source || acceptsOutputRef(candidate.source)) &&
        isSignalTypeId(candidate.signalType) &&
        signalTypeRegistry[candidate.signalType].accepts(candidate.treatment)
      );
    });
  });
}

export function acceptsCompositionInspectorTarget(
  value: unknown
): value is CompositionInspectorTarget {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const target = value as Record<string, unknown>;
  if (target.kind === 'node') {
    return typeof target.instanceId === 'string';
  }
  if (target.kind === 'route') {
    return typeof target.instanceId === 'string' && typeof target.port === 'string';
  }
  return target.kind === 'canvas';
}
