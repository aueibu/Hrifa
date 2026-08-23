import type { DataPacket } from './model';
import {
  applyPitchRouteTreatment,
  applyRhythmRouteTreatment,
  defaultPitchRouteTreatment,
  defaultRhythmRouteTreatment,
  isPitchRouteTreatmentIdentity,
  isRhythmRouteTreatmentIdentity,
  pitchTreatmentSummary,
  rhythmTreatmentSummary,
  acceptsPitchRouteTreatment,
  acceptsRhythmRouteTreatment,
  type PitchRouteTreatment,
  type RhythmRouteTreatment,
} from './routeTreatments';

export type SignalTypeId = 'pitch' | 'rhythm' | 'numeric';

export interface SignalTypeDefinition<T> {
  id: SignalTypeId;
  label: string;
  default: T;
  matches(source?: DataPacket): boolean;
  accepts(value: unknown): value is T;
  isIdentity(treatment: T, source?: DataPacket): boolean;
  summary(treatment: T, source?: DataPacket): string;
  apply(source: DataPacket | undefined, treatment: T, routeId: string): DataPacket | undefined;
}

export interface NumericRouteTreatment {
  bypassed: boolean;
}

export const defaultNumericRouteTreatment: NumericRouteTreatment = { bypassed: false };

function acceptsNumericRouteTreatment(value: unknown): value is NumericRouteTreatment {
  return Boolean(value) && typeof value === 'object' && typeof (value as NumericRouteTreatment).bypassed === 'boolean';
}

const pitchSignalType: SignalTypeDefinition<PitchRouteTreatment> = {
  id: 'pitch',
  label: 'Pitch',
  default: defaultPitchRouteTreatment,
  matches: (source) => source?.domain === 'pitch' || source?.domain === 'pitchClass',
  accepts: acceptsPitchRouteTreatment,
  isIdentity: isPitchRouteTreatmentIdentity,
  summary: pitchTreatmentSummary,
  apply: applyPitchRouteTreatment,
};

const rhythmSignalType: SignalTypeDefinition<RhythmRouteTreatment> = {
  id: 'rhythm',
  label: 'Rhythm',
  default: defaultRhythmRouteTreatment,
  matches: (source) => source?.kind === 'list' && source?.domain === 'duration',
  accepts: acceptsRhythmRouteTreatment,
  isIdentity: isRhythmRouteTreatmentIdentity,
  summary: rhythmTreatmentSummary,
  apply: applyRhythmRouteTreatment,
};

const numericSignalType: SignalTypeDefinition<NumericRouteTreatment> = {
  id: 'numeric',
  label: 'Numeric',
  default: defaultNumericRouteTreatment,
  matches: () => true,
  accepts: acceptsNumericRouteTreatment,
  isIdentity: (treatment) => !treatment.bypassed,
  summary: (treatment) => (treatment.bypassed ? 'Bypassed' : 'Identity'),
  apply: (source) => source,
};

export const signalTypeRegistry: Record<SignalTypeId, SignalTypeDefinition<unknown>> = {
  pitch: pitchSignalType as SignalTypeDefinition<unknown>,
  rhythm: rhythmSignalType as SignalTypeDefinition<unknown>,
  numeric: numericSignalType as SignalTypeDefinition<unknown>,
};

export function signalTypeFor(source?: DataPacket): SignalTypeId {
  if (pitchSignalType.matches(source)) {
    return 'pitch';
  }
  if (rhythmSignalType.matches(source)) {
    return 'rhythm';
  }
  return 'numeric';
}
