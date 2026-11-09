import type { SoundSet } from '../sounds';
import type { TransportSettings } from '../transport';
import type { Provenance } from '../model';
import type { MusicalDuration, MusicalPosition, MusicalTimeline } from '../musicalTime';

export type StaticInstrumentId =
  | 'preview.sine'
  | 'preview.triangle'
  | 'preview.triangle-soft'
  | 'preview.sawtooth'
  | 'preview.square'
  | 'preview.click'
  | 'preview.click-accent'
  | 'sound.click'
  | 'sound.pluck'
  | 'sound.woodblock'
  | 'sound.drum'
  | 'sound.tone'
  | 'gm.piano'
  | 'gm.guitar'
  | 'gm.harp'
  | 'gm.marimba'
  | 'gm.vibraphone'
  | 'gm.organ'
  | 'gm.flute'
  | 'gm.clarinet'
  | 'gm.violin'
  | 'gm.cello';

/** A voice from a SoundFont file the user opened: `sf2:<file>|<bank>:<program>` (see soundfontLibrary.ts). */
export type SoundfontVoiceId = `sf2:${string}`;

export type InstrumentId = StaticInstrumentId | SoundfontVoiceId;

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
  /**
   * Add the global transport's meter clicks and count-in (see transport.ts). For previews whose
   * time grid is the transport's pulse; leave off for anything timed independently of it.
   */
  followTransport?: boolean;
  /**
   * Repeat the plan seamlessly until stopped. Musical plans only: the plan's own `duration` is
   * one pass, and a plan built to loop (the mixer's `loopable`) must be exactly one period of its
   * pattern. The count-in, when on, sounds once before the first pass; the meter click restarts
   * with each pass. `onComplete` never fires for a looping session.
   */
  loop?: boolean;
  onComplete?(): void;
}

export interface PlaybackSession {
  readonly id: string;
  readonly sourceId: string;
  readonly active: boolean;
  setBusGain(busId: string, gain: number): void;
  stop(): void;
}

export interface PlaybackClock {
  startedAtMs: number;
  /** Length of one pass in seconds when the session loops; a playhead wraps at this. */
  loopSeconds?: number;
}

export interface AudioEngine {
  play(request: PlaybackRequest): Promise<PlaybackSession>;
  stopSource(sourceId: string): void;
  stopAll(): void;
  /** True while any preview is sounding. */
  readonly playing: boolean;
  /** Called whenever a preview starts or ends; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /**
   * Where a source's sounding preview is, for drawing a playhead: `startedAtMs` is the
   * performance.now() time the plan's own material begins (after any count-in).
   */
  clock(sourceId: string): PlaybackClock | undefined;
  /** The global transport; metronome changes apply live to sounding previews. */
  setTransport(settings: TransportSettings, metronomeSounds?: SoundSet): void;
  dispose(): void;
}
