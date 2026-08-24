export type DataKind = 'value' | 'list' | 'tree' | 'bank' | 'events' | 'layers' | 'curve';

export type DataDomain =
  | 'integer'
  | 'rational'
  | 'duration'
  | 'onset'
  | 'pitch'
  | 'pitchClass'
  | 'interval'
  | 'note'
  | 'boolean'
  | 'symbol'
  | 'text'
  | 'cycleLength'
  | 'pulseCount'
  | 'phaseOffset'
  | 'parameterFrame'
  | 'rhythmPattern'
  | 'rejectedFrame';

export type DataRole =
  | 'interOnset'
  | 'interUnit'
  | 'generatorValue'
  | 'pitchMaterial'
  | 'parameter'
  | 'pattern'
  | 'rejection';

// `chromatic-${edo}` covers any EDO (chromatic-12, chromatic-19, chromatic-24, ...) — the octave
// divides into `edo` equal pitch-class steps; 12 is just the default, not a hardcoded ceiling.
export type DataEncoding = 'midi-note' | 'midicent' | 'note-name' | `chromatic-${number}`;

export interface PacketGrouping {
  id: string;
  label: string;
  units: number;
  boundaries: number[];
  musicalUnits?: MusicalDuration;
  musicalBoundaries?: MusicalPosition[];
}

export interface PacketFrame {
  topology: 'linear' | 'cyclic';
  unit?: 'abstract' | 'pulse' | 'millisecond' | 'beat' | 'quarterNote';
  extent?: number;
  origin?: number;
  musicalExtent?: MusicalDuration;
  musicalOrigin?: MusicalPosition;
  grouping?: PacketGrouping;
}

export interface Provenance {
  sourceModuleInstance: string;
  sourceItemIds: string[];
  transformation: string;
  parameters?: Record<string, unknown>;
  parameterFrameId?: string;
}

export interface DataItem<T = unknown> {
  id: string;
  value: T;
  provenance: Provenance[];
  label?: string;
}

export interface DataPacket<T = unknown> {
  kind: DataKind;
  domain: DataDomain;
  encoding?: DataEncoding;
  role?: DataRole;
  frame?: PacketFrame;
  items: DataItem<T>[];
  metadata?: Record<string, unknown>;
  warnings: string[];
}

export interface AcceptedPacket {
  kind: DataKind | '*';
  domain: DataDomain | '*';
  encodings?: DataEncoding[];
  roles?: DataRole[];
  topologies?: PacketFrame['topology'][];
}

export interface PortContract {
  label: string;
  description: string;
  accepts: AcceptedPacket[];
  scalarBroadcast?: boolean;
}

export interface ParameterField {
  key: string;
  label: string;
  type: 'integer' | 'integerList' | 'select';
  options?: { label: string; value: string }[];
}

export interface EvaluationContext {
  instance: ModuleInstance;
  inputs: Record<string, DataPacket>;
}

export interface ModuleEvaluation {
  outputs: Record<string, DataPacket>;
  messages: string[];
  status: 'ready' | 'warning' | 'error';
}

export interface ModuleDefinition {
  id: string;
  version: string;
  title: string;
  description: string;
  category: string;
  inputs: Record<string, PortContract>;
  outputs: Record<string, PortContract>;
  parameters: ParameterField[];
  defaultParameters: Record<string, unknown>;
  evaluate(context: EvaluationContext): ModuleEvaluation;
}

export interface ModuleInstance {
  id: string;
  definitionId: string;
  definitionVersion: string;
  parameters: Record<string, unknown>;
  order: number;
}

export interface Connection {
  id: string;
  fromInstanceId: string;
  fromPort: string;
  toInstanceId: string;
  toPort: string;
}

export interface PatchDocument {
  schemaVersion: 1;
  title: string;
  instances: ModuleInstance[];
  connections: Connection[];
  metadata?: Record<string, unknown>;
}

export interface ParameterFrame {
  length: number;
  impulses: number;
  offset: number;
  sourceItemIds: string[];
}

export interface ValidParameterFrame extends ParameterFrame {
  id: string;
  effectiveOffset: number;
}

export interface RejectedFrame extends ParameterFrame {
  id: string;
  reason: string;
}

export interface RhythmPattern {
  length: number;
  impulses: number;
  requestedOffset: number;
  effectiveOffset: number;
  bits: number[];
}

export interface EvaluatedModule {
  instance: ModuleInstance;
  definition: ModuleDefinition;
  inputs: Record<string, DataPacket>;
  evaluation: ModuleEvaluation;
}

export interface PatchEvaluation {
  modules: Map<string, EvaluatedModule>;
  order: string[];
  errors: string[];
}

export function packet<T>(
  kind: DataKind,
  domain: DataDomain,
  items: DataItem<T>[],
  warnings: string[] = [],
  metadata?: Record<string, unknown>,
  semantics?: Pick<DataPacket, 'role' | 'frame' | 'encoding'>
): DataPacket<T> {
  return { kind, domain, items, warnings, metadata, ...semantics };
}

export function emptyPacket(kind: DataKind, domain: DataDomain): DataPacket {
  return packet(kind, domain, []);
}
import type { MusicalDuration, MusicalPosition } from './musicalTime';
