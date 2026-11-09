/**
 * Turns modes and chords into performance plans for the shared AudioEngine (the same engine the Composition
 * Workbench plays through), plus a cue list the UI follows to light the sounding notes. The explorer never
 * touches Web Audio directly: playback is data (a plan) so it can later be routed through the workbench's
 * mixer and transport unchanged.
 */
import { sampledInstruments } from '../composition-workbench/audio/instrumentRegistry';
import type {
  InstrumentId,
  SecondsPerformanceEvent,
  SecondsPerformancePlan,
} from '../composition-workbench/audio/types';

/** The voice scale and chord playback use unless one is chosen. */
export const DEFAULT_VOICE: InstrumentId = 'preview.triangle-soft';

/** Voices offered for scale and chord playback: synthesized, then sampled (downloaded on first use). */
export const VOICE_CHOICES = [
  {
    group: 'Synth',
    items: [
      { value: 'preview.triangle-soft', label: 'Soft triangle' },
      { value: 'preview.sine', label: 'Sine' },
    ],
  },
  {
    group: 'Sampled',
    items: sampledInstruments.map((d) => ({ value: d.id, label: d.label })),
  },
];

/** A voice from a SoundFont file: `sf2:<file>|<bank msb>:<bank lsb>:<program>` (the file itself is opened separately). */
const SOUNDFONT_VOICE = /^sf2:[^|]+\|\d+:\d+:\d+$/;

export const isVoice = (value: unknown): value is InstrumentId =>
  (typeof value === 'string' && SOUNDFONT_VOICE.test(value)) ||
  VOICE_CHOICES.some((g) => g.items.some((i) => i.value === value));

export const isSampledVoice = (id: InstrumentId) =>
  id.startsWith('sf2:') || sampledInstruments.some((d) => d.id === id);

export const SCALE_SOURCE = 'scale-explorer.play';
/** The drone alternates between two sources so a re-pitched drone can fade in while the old one fades out. */
export const DRONE_SOURCES = ['scale-explorer.drone.a', 'scale-explorer.drone.b'] as const;
export const NOTE_BUS = 'scale-explorer.notes';
export const DRONE_BUS = 'scale-explorer.drone';

export type DroneWave = 'sawtooth' | 'square' | 'triangle' | 'sine';
export type ChordStyle = 'block' | 'arp' | 'both';

export const DRONE_WAVES: { value: DroneWave; label: string }[] = [
  { value: 'sawtooth', label: 'Saw' },
  { value: 'square', label: 'Square' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'sine', label: 'Sine' },
];

const WAVE_INSTRUMENT: Record<DroneWave, InstrumentId> = {
  sawtooth: 'preview.sawtooth',
  square: 'preview.square',
  triangle: 'preview.triangle',
  sine: 'preview.sine',
};

/** Perceived-loudness balance between the drone timbres (carried over from the artifact). */
const WAVE_LEVEL: Record<DroneWave, number> = {
  sawtooth: 0.16,
  square: 0.12,
  triangle: 0.3,
  sine: 0.36,
};

/** Bus gain for the drone at a 0..1 volume setting. */
export const droneGain = (wave: DroneWave, volume: number) => volume * WAVE_LEVEL[wave];

export const NOTE_STEP_SECONDS = 0.42;
const MODE_GAP_SECONDS = 0.35;
const ARP_SECONDS = 0.26;
const HOLD_SECONDS = 1.1;
const DRONE_SECONDS = 3600;

/** One moment of the performance that lights notes: the pitch classes sounding, and what is playing them. */
export interface Cue {
  atSeconds: number;
  durationSeconds: number;
  pcs: number[];
  /** Index of the mode row being played, for the row highlight. */
  modeIndex: number;
  /** Identifies the chord chip being played, if any. */
  chordKey?: string;
  /** Pitch class the drone should follow from this cue on (the playing mode's root). */
  root: number;
}

export interface PlaybackScript {
  plan: SecondsPerformancePlan;
  cues: Cue[];
}

const midicents = (midi: number) => midi * 100;

function newPlan(sourceId: string): SecondsPerformancePlan {
  return {
    id: sourceId,
    sourceId,
    warnings: [],
    timebase: { kind: 'seconds' },
    durationSeconds: 0,
    events: [],
  };
}

/**
 * Synth and sampled voices take the level as a gain (0.4 is a comfortable note), but a SoundFont preset reads it
 * as MIDI velocity, where a low value means a soft, dull, quiet note by design. Shift SoundFont voices up to a
 * normal playing velocity, keeping the same differences between notes, arpeggios, and chords.
 */
const levelFor = (instrumentId: InstrumentId, gain: number) =>
  instrumentId.startsWith('sf2:') ? Math.min(1, 0.4 + gain) : gain;

function noteEvent(
  plan: SecondsPerformancePlan,
  midi: number,
  atSeconds: number,
  durationSeconds: number,
  velocity: number,
  instrumentId: InstrumentId
): SecondsPerformanceEvent {
  const event: SecondsPerformanceEvent = {
    id: `${plan.sourceId}:${plan.events.length}`,
    pitchMidicents: midicents(midi),
    velocity: levelFor(instrumentId, velocity),
    instrumentId,
    busId: NOTE_BUS,
    provenance: [],
    atSeconds,
    durationSeconds,
  };
  plan.events.push(event);
  return event;
}

export interface ScaleItem {
  modeIndex: number;
  /** Pitch class the mode is played from. */
  root: number;
  z: number[];
}

/** Each mode played upward from its first note to the octave, one after another. */
export function scaleScript(
  items: ScaleItem[],
  instrumentId: InstrumentId = DEFAULT_VOICE
): PlaybackScript {
  const plan = newPlan(SCALE_SOURCE);
  const cues: Cue[] = [];
  let t = 0;
  items.forEach((item) => {
    const base = 60 + item.root;
    const n = item.z.length;
    const notes = [...item.z.map((x) => base + x), base + 12];
    notes.forEach((midi, i) => {
      const at = t + i * NOTE_STEP_SECONDS;
      const dur = NOTE_STEP_SECONDS * 0.92;
      noteEvent(plan, midi, at, dur, 0.4, instrumentId);
      cues.push({
        atSeconds: at,
        durationSeconds: dur,
        pcs: [(item.root + (i < n ? item.z[i] : 0)) % 12],
        modeIndex: item.modeIndex,
        root: item.root,
      });
    });
    t += notes.length * NOTE_STEP_SECONDS + MODE_GAP_SECONDS;
  });
  plan.durationSeconds = t;
  return { plan, cues };
}

export interface ChordItem {
  modeIndex: number;
  chordKey: string;
  root: number;
  /** Chord notes as MIDI numbers, low to high. */
  midis: number[];
  pcs: number[];
}

/** Chords one after another, each as an arpeggio, a block, or an arpeggio then a block. */
export function chordScript(
  items: ChordItem[],
  style: ChordStyle,
  instrumentId: InstrumentId = DEFAULT_VOICE
): PlaybackScript {
  const plan = newPlan(SCALE_SOURCE);
  const cues: Cue[] = [];
  let t = 0;
  items.forEach((item) => {
    let cursor = t;
    const base = { modeIndex: item.modeIndex, chordKey: item.chordKey, root: item.root };
    if (style === 'arp' || style === 'both') {
      item.midis.forEach((midi, j) => {
        const at = cursor + j * ARP_SECONDS;
        noteEvent(plan, midi, at, ARP_SECONDS * 1.7, 0.3, instrumentId);
        cues.push({
          ...base,
          atSeconds: at,
          durationSeconds: ARP_SECONDS * 1.7,
          pcs: [item.pcs[j]],
        });
      });
      cursor += item.midis.length * ARP_SECONDS + 0.12;
    }
    if (style === 'block' || style === 'both') {
      item.midis.forEach((midi) => noteEvent(plan, midi, cursor, HOLD_SECONDS, 0.2, instrumentId));
      cues.push({ ...base, atSeconds: cursor, durationSeconds: HOLD_SECONDS, pcs: item.pcs });
      cursor += HOLD_SECONDS;
    }
    t = cursor + 0.2;
  });
  plan.durationSeconds = t;
  return { plan, cues };
}

/** A long held tone for the drone. Played as its own source so it sounds under melodies and can be re-pitched. */
export function dronePlan(
  pitchClass: number,
  wave: DroneWave,
  sourceId: string
): SecondsPerformancePlan {
  const plan = newPlan(sourceId);
  plan.durationSeconds = DRONE_SECONDS;
  plan.events.push({
    id: `${sourceId}:0`,
    pitchMidicents: midicents(36 + pitchClass),
    velocity: 1,
    instrumentId: WAVE_INSTRUMENT[wave],
    busId: DRONE_BUS,
    provenance: [],
    atSeconds: 0,
    durationSeconds: DRONE_SECONDS,
  });
  return plan;
}

/** The cue sounding at `elapsedSeconds` into a script, and the mode row it belongs to (null once it ends). */
export function activeCues(script: PlaybackScript, elapsedSeconds: number): Cue[] {
  return script.cues.filter(
    (c) => elapsedSeconds >= c.atSeconds && elapsedSeconds < c.atSeconds + c.durationSeconds
  );
}
