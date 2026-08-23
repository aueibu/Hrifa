import type { CompositionOutputRef } from './compositionRouting';
import { signalTypeRegistry, type SignalTypeId } from './signalTypes';

export type CompositionModuleId =
  | 'interference'
  | 'pitch-list'
  | 'melodicization'
  | 'arithmetic'
  | 'fractioning'
  | 'pair-composition'
  | 'scale-construction'
  | 'scale-evolution';
export type CompositionLaneId = 1 | 2 | 3 | 4;

export interface CompositionModuleInstance {
  id: string;
  moduleId: CompositionModuleId;
  laneId: CompositionLaneId;
  row: number;
}

export interface ModuleRouteBinding {
  source?: CompositionOutputRef;
  signalType: SignalTypeId;
  treatment: unknown;
}

export type ModuleRouteState = Record<string, ModuleRouteBinding>;
export type ModuleRouteStates = Record<string, ModuleRouteState>;

export type CompositionInspectorTarget =
  | { kind: 'module'; instanceId: string }
  | { kind: 'route'; instanceId: string; port: string }
  | { kind: 'lane'; laneId: CompositionLaneId };

export interface CompositionLaneDefinition {
  id: CompositionLaneId;
  label: string;
  description: string;
}

export const compositionModuleLabels: Record<CompositionModuleId, string> = {
  interference: 'Interference',
  'pitch-list': 'Pitch List',
  melodicization: 'Melodicization',
  arithmetic: 'Arithmetic',
  fractioning: 'Fractioning',
  'pair-composition': 'Pair Composition',
  'scale-construction': 'Scale Construction',
  'scale-evolution': 'Scale Evolution',
};

export const defaultCompositionInstances: CompositionModuleInstance[] = [
  { id: 'interference', moduleId: 'interference', laneId: 1, row: 1 },
  { id: 'pitch-list', moduleId: 'pitch-list', laneId: 2, row: 1 },
  { id: 'melodicization', moduleId: 'melodicization', laneId: 3, row: 1 },
];

export const compositionLanes: CompositionLaneDefinition[] = [
  { id: 1, label: '1', description: 'Neutral spatial lane for arranging modules and routes.' },
  { id: 2, label: '2', description: 'Neutral spatial lane for arranging modules and routes.' },
  { id: 3, label: '3', description: 'Neutral spatial lane for arranging modules and routes.' },
  { id: 4, label: '4', description: 'Neutral spatial lane for arranging modules and routes.' },
];

export function nextAvailableRow(instances: CompositionModuleInstance[], laneId: CompositionLaneId) {
  const rowsInLane = instances.filter((instance) => instance.laneId === laneId).map((instance) => instance.row);
  return rowsInLane.length ? Math.max(...rowsInLane) + 1 : 1;
}

export function createDefaultModuleRouteState(
  ports: { id: string; signalType: SignalTypeId }[]
): ModuleRouteState {
  return Object.fromEntries(
    ports.map(({ id, signalType }) => [
      id,
      { source: undefined, signalType, treatment: signalTypeRegistry[signalType].default },
    ])
  );
}

export function compositionInstanceLabel(
  instance: CompositionModuleInstance,
  instances: CompositionModuleInstance[]
) {
  const siblings = instances.filter((candidate) => candidate.moduleId === instance.moduleId);
  const index = siblings.findIndex((candidate) => candidate.id === instance.id);
  const base = compositionModuleLabels[instance.moduleId];
  return siblings.length > 1 ? `${base} ${index + 1}` : base;
}

function isLaneId(value: unknown): value is CompositionLaneId {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

function isRow(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

function isModuleId(value: unknown): value is CompositionModuleId {
  return (
    value === 'interference' ||
    value === 'pitch-list' ||
    value === 'melodicization' ||
    value === 'arithmetic' ||
    value === 'fractioning' ||
    value === 'pair-composition' ||
    value === 'scale-construction' ||
    value === 'scale-evolution'
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

export function acceptsCompositionInstances(value: unknown): value is CompositionModuleInstance[] {
  if (!Array.isArray(value)) {
    return false;
  }
  const ids = new Set<string>();
  return value.every((candidate) => {
    if (!candidate || typeof candidate !== 'object') {
      return false;
    }
    const instance = candidate as CompositionModuleInstance;
    if (
      typeof instance.id !== 'string' ||
      ids.has(instance.id) ||
      !isModuleId(instance.moduleId) ||
      !isLaneId(instance.laneId) ||
      !isRow(instance.row)
    ) {
      return false;
    }
    ids.add(instance.id);
    return true;
  });
}

export function acceptsModuleRouteStates(value: unknown): value is ModuleRouteStates {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return Object.values(value).every((state) => {
    if (!state || typeof state !== 'object') {
      return false;
    }
    return Object.values(state as ModuleRouteState).every((binding) => {
      if (!binding || typeof binding !== 'object') {
        return false;
      }
      const candidate = binding as ModuleRouteBinding;
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
  if (target.kind === 'module') {
    return typeof target.instanceId === 'string';
  }
  if (target.kind === 'route') {
    return typeof target.instanceId === 'string' && typeof target.port === 'string';
  }
  return target.kind === 'lane' && isLaneId(target.laneId);
}
