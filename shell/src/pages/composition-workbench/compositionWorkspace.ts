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
  | 'scale-evolution'
  | 'rhythm-householder'
  | 'mixer';

/**
 * A module placed on the free canvas. `x`/`y` are the card's top-left corner in canvas units; they
 * are pure presentation and never affect routing.
 */
export interface CompositionModuleInstance {
  id: string;
  moduleId: CompositionModuleId;
  x: number;
  y: number;
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
  | { kind: 'canvas' };

export const compositionModuleLabels: Record<CompositionModuleId, string> = {
  interference: 'Interference',
  'pitch-list': 'Pitch List',
  melodicization: 'Melodicization',
  arithmetic: 'Arithmetic',
  fractioning: 'Fractioning',
  'pair-composition': 'Pair Composition',
  'scale-construction': 'Scale Construction',
  'scale-evolution': 'Scale Evolution',
  'rhythm-householder': 'Rhythm Householder',
  mixer: 'Mixer',
};

export const defaultCompositionInstances: CompositionModuleInstance[] = [
  { id: 'interference', moduleId: 'interference', x: 0, y: 0 },
  { id: 'pitch-list', moduleId: 'pitch-list', x: 200, y: 0 },
  { id: 'melodicization', moduleId: 'melodicization', x: 100, y: 170 },
];

// Saved projects from the lane/row grid: one lane was a 200-unit column, one row a 170-unit step.
const legacyLanePitch = 200;
const legacyRowPitch = 170;

/**
 * Upgrades saved `{ laneId, row }` placements to canvas `{ x, y }` so existing projects open with
 * the same relative arrangement. Already-migrated entries pass through unchanged.
 */
export function migrateCompositionInstances(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }
  return value.map((candidate) => {
    if (!candidate || typeof candidate !== 'object') {
      return candidate;
    }
    const legacy = candidate as Record<string, unknown>;
    if (isFiniteNumber(legacy.x) && isFiniteNumber(legacy.y)) {
      return { id: legacy.id, moduleId: legacy.moduleId, x: legacy.x, y: legacy.y };
    }
    if (
      typeof legacy.laneId === 'number' &&
      typeof legacy.row === 'number' &&
      Number.isInteger(legacy.laneId) &&
      Number.isInteger(legacy.row) &&
      legacy.laneId >= 1 &&
      legacy.row >= 1
    ) {
      return {
        id: legacy.id,
        moduleId: legacy.moduleId,
        x: (legacy.laneId - 1) * legacyLanePitch,
        y: (legacy.row - 1) * legacyRowPitch,
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
export function mixerPortLabels(routeState: ModuleRouteState | undefined) {
  return Object.keys(routeState ?? {}).map((id, index) => ({
    id,
    label: `Ch ${index + 1}`,
    shortLabel: String(index + 1),
  }));
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
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
    value === 'scale-evolution' ||
    value === 'rhythm-householder' ||
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
      !isFiniteNumber(instance.x) ||
      !isFiniteNumber(instance.y)
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
  return target.kind === 'canvas';
}
