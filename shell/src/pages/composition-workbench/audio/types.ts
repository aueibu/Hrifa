import type { Provenance } from '../model';
import type { MusicalDuration, MusicalPosition, MusicalTimeline } from '../musicalTime';

export type InstrumentId =
  | 'preview.sine'
  | 'preview.triangle'
  | 'preview.click'
  | 'preview.click-accent';

interface PerformanceEventBase {
  id: string;
  pitchMidicents: number;
  velocity: number;
  instrumentId: InstrumentId;
  busId: string;
  provenance: Provenance[];
}

export interface SecondsPerformanceEvent extends PerformanceEventBase {
  atSeconds: number;
  durationSeconds: number;
}

export interface MusicalPerformanceEvent extends PerformanceEventBase {
  at: MusicalPosition;
  duration: MusicalDuration;
}

interface PerformancePlanBase {
  id: string;
  sourceId: string;
  warnings: string[];
}

export interface SecondsPerformancePlan extends PerformancePlanBase {
  timebase: { kind: 'seconds' };
  durationSeconds: number;
  events: SecondsPerformanceEvent[];
}

export interface MusicalPerformancePlan extends PerformancePlanBase {
  timebase: { kind: 'musical'; timeline: MusicalTimeline };
  duration: MusicalDuration;
  events: MusicalPerformanceEvent[];
}

export type PerformanceEvent = SecondsPerformanceEvent | MusicalPerformanceEvent;
export type PerformancePlan = SecondsPerformancePlan | MusicalPerformancePlan;

export interface PlaybackRequest {
  plan: PerformancePlan;
  busGains?: Record<string, number>;
  onComplete?(): void;
}

export interface PlaybackSession {
  readonly id: string;
  readonly sourceId: string;
  readonly active: boolean;
  setBusGain(busId: string, gain: number): void;
  stop(): void;
}

export interface AudioEngine {
  play(request: PlaybackRequest): Promise<PlaybackSession>;
  stopSource(sourceId: string): void;
  stopAll(): void;
  dispose(): void;
}
