import type {
  MusicalPerformanceEvent,
  MusicalPerformancePlan,
  PerformancePlan,
  SecondsPerformanceEvent,
  SecondsPerformancePlan,
} from './audio/types';
import {
  addRational,
  compareRational,
  defaultMusicalTimeline,
  multiplyRational,
  musicalDuration,
  musicalPosition,
  rational,
  type MusicalDuration,
  type MusicalPosition,
  type MusicalTimeline,
  type Rational,
} from './musicalTime';
import { defaultSoundSettings, layerSound, type SoundSet } from './sounds';

/**
 * The workbench-wide transport: one tempo, meter, and pulse length every rhythm preview follows,
 * plus the meter click (metronome) and count-in. Stored with the other global settings
 * (compositionSettings.tsx); the pure helpers here turn it into time and click events.
 */
export interface TransportSettings {
  /** Quarter-note beats per minute. */
  tempo: number;
  /** "numerator/denominator", e.g. "4/4" or "7/8". */
  meter: string;
  /** How long one rhythm pulse lasts, as a key of transportPulseOptions. */
  pulse: string;
  metronome: boolean;
  /** 0–100, same scale as every module's volume fader. */
  metronomeVolume: number;
  /** One bar of clicks before playback starts. */
  countIn: boolean;
}

export const defaultTransportSettings: TransportSettings = {
  tempo: 120,
  meter: '4/4',
  pulse: '1/4',
  metronome: false,
  metronomeVolume: 30,
  countIn: false,
};

/** Values are the pulse length in quarter notes (Melodicization's original pulse options). */
export const transportPulseOptions: {
  value: string;
  label: string;
  symbol: string;
  duration: MusicalDuration;
}[] = [
  { value: '1/1', label: 'Quarter note', symbol: '♩', duration: musicalDuration(1) },
  { value: '1/2', label: 'Eighth note', symbol: '♪', duration: musicalDuration(1, 2) },
  { value: '1/4', label: 'Sixteenth note', symbol: '16th', duration: musicalDuration(1, 4) },
  { value: '1/8', label: 'Thirty-second note', symbol: '32nd', duration: musicalDuration(1, 8) },
];

export const transportMeterOptions = ['2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '9/8', '12/8'];

export const MIN_TEMPO = 20;
export const MAX_TEMPO = 400;

export function isValidMeter(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const match = /^(\d+)\/(\d+)$/.exec(value);
  if (!match) {
    return false;
  }
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  return numerator >= 1 && numerator <= 32 && [1, 2, 4, 8, 16, 32].includes(denominator);
}

export function parseMeter(meter: string) {
  const [numerator, denominator] = (isValidMeter(meter) ? meter : '4/4').split('/').map(Number);
  return { numerator, denominator };
}

export function transportPulse(settings: Pick<TransportSettings, 'pulse'>) {
  return (
    transportPulseOptions.find((option) => option.value === settings.pulse) ??
    transportPulseOptions[2]
  );
}

/** The transport's tempo and meter as the musical timeline a musical-time plan is scheduled on. */
export function transportTimeline(
  settings: Pick<TransportSettings, 'tempo' | 'meter'>
): MusicalTimeline {
  const { numerator, denominator } = parseMeter(settings.meter);
  return {
    ...defaultMusicalTimeline,
    id: `transport:${settings.tempo}:${settings.meter}`,
    tempoMap: [{ at: musicalPosition(0), bpm: settings.tempo }],
    meterMap: [{ atBar: 1, numerator, denominator }],
  };
}

const quarterSeconds = (tempo: number) => 60 / tempo;

/** Seconds per rhythm pulse at the current tempo. */
export function pulseSeconds(settings: Pick<TransportSettings, 'tempo' | 'pulse'>) {
  const { numerator, denominator } = transportPulse(settings).duration.quarterNotes;
  return (numerator / denominator) * quarterSeconds(settings.tempo);
}

/** Length of one meter beat (the meter's denominator note) in quarter notes. */
export function beatQuarterNotes(settings: Pick<TransportSettings, 'meter'>) {
  return 4 / parseMeter(settings.meter).denominator;
}

/**
 * The count-in's length in quarter notes (one bar of the meter), or zero when it is off. This is
 * how far applyTransport shifts a musical plan's material, and where a looped plan's loop begins.
 */
export function countInQuarterNotes(
  settings: Pick<TransportSettings, 'meter' | 'countIn'>
): Rational {
  const { numerator, denominator } = parseMeter(settings.meter);
  return settings.countIn ? multiplyRational(rational(4, denominator), numerator) : rational(0);
}

export function barSeconds(settings: Pick<TransportSettings, 'tempo' | 'meter'>) {
  const { numerator } = parseMeter(settings.meter);
  return numerator * beatQuarterNotes(settings) * quarterSeconds(settings.tempo);
}

/** Silence before the material starts, in seconds — one bar when count-in is on. */
export function countInSeconds(settings: TransportSettings) {
  return settings.countIn ? barSeconds(settings) : 0;
}

/** Buses the transport owns. Their gain follows the transport, not any module's fader. */
export const METER_BUS = 'meter';
export const COUNT_IN_BUS = 'count-in';

export function transportBusGain(
  busId: string,
  settings: TransportSettings,
  toGain: (percent: number) => number
) {
  if (busId === METER_BUS) {
    return settings.metronome ? toGain(settings.metronomeVolume) : 0;
  }
  if (busId === COUNT_IN_BUS) {
    return toGain(settings.metronomeVolume);
  }
  return undefined;
}

interface Click {
  index: number;
  accented: boolean;
}

/** Downbeats on the metronome's primary voice, other beats on its secondary. */
function meterClick(set: SoundSet, accented: boolean) {
  return { ...layerSound(set, accented ? 0 : 1), durationSeconds: accented ? 0.05 : 0.03 };
}

/**
 * Adds meter clicks (always scheduled, on the meter bus — its gain is the on/off switch, so the
 * metronome can be toggled mid-preview) and, when count-in is on, shifts the material one bar
 * later behind a bar of count-in clicks.
 */
export function applyTransport(
  plan: PerformancePlan,
  settings: TransportSettings,
  sounds: SoundSet = defaultSoundSettings.metronome
): PerformancePlan {
  const { numerator } = parseMeter(settings.meter);
  const beats = (count: number): Click[] =>
    Array.from({ length: count }, (_, index) => ({ index, accented: index % numerator === 0 }));

  if (plan.timebase.kind === 'seconds') {
    const seconds = plan as SecondsPerformancePlan;
    const beatSeconds = beatQuarterNotes(settings) * quarterSeconds(settings.tempo);
    const shift = countInSeconds(settings);
    const clickEvent = (click: Click, at: number, busId: string): SecondsPerformanceEvent => {
      const sound = meterClick(sounds, click.accented);
      return {
        id: `${plan.sourceId}:${busId}:${click.index}`,
        atSeconds: at,
        durationSeconds: sound.durationSeconds,
        pitchMidicents: sound.pitchMidicents,
        velocity: 1,
        instrumentId: sound.instrumentId,
        busId,
        provenance: [
          {
            sourceModuleInstance: plan.sourceId,
            sourceItemIds: [],
            transformation: busId === METER_BUS ? 'transport-meter-click' : 'transport-count-in',
            parameters: { beat: click.index, accented: click.accented },
          },
        ],
      };
    };
    // A click that would land exactly at the end belongs to the next cycle, so it's left out.
    const beatCount = Math.ceil(seconds.durationSeconds / beatSeconds - 1e-9);
    return {
      ...seconds,
      durationSeconds: seconds.durationSeconds + shift,
      events: [
        ...(settings.countIn
          ? beats(numerator).map((click) =>
              clickEvent(click, click.index * beatSeconds, COUNT_IN_BUS)
            )
          : []),
        ...seconds.events.map((event) => ({ ...event, atSeconds: event.atSeconds + shift })),
        ...beats(beatCount).map((click) =>
          clickEvent(click, shift + click.index * beatSeconds, METER_BUS)
        ),
      ],
    };
  }

  const musical = plan as MusicalPerformancePlan;
  const beat = rational(4, parseMeter(settings.meter).denominator);
  const shift = countInQuarterNotes(settings);
  const clickLength = rational(1, 32);
  const beatAt = (index: number, offset: Rational): MusicalPosition => ({
    quarterNotes: addRational(multiplyRational(beat, index), offset),
  });
  const clickEvent = (click: Click, offset: Rational, busId: string): MusicalPerformanceEvent => {
    const sound = meterClick(sounds, click.accented);
    return {
      id: `${plan.sourceId}:${busId}:${click.index}`,
      at: beatAt(click.index, offset),
      duration: { quarterNotes: clickLength },
      pitchMidicents: sound.pitchMidicents,
      velocity: 1,
      instrumentId: sound.instrumentId,
      busId,
      provenance: [
        {
          sourceModuleInstance: plan.sourceId,
          sourceItemIds: [],
          transformation: busId === METER_BUS ? 'transport-meter-click' : 'transport-count-in',
          parameters: { beat: click.index, accented: click.accented },
        },
      ],
    };
  };
  let meterBeats = 0;
  while (compareRational(multiplyRational(beat, meterBeats), musical.duration.quarterNotes) < 0) {
    meterBeats += 1;
  }
  // The plan must contain every event in full, so it also reaches the end of the last click.
  const materialEnd = addRational(shift, musical.duration.quarterNotes);
  const lastClickEnd = addRational(
    beatAt(Math.max(0, meterBeats - 1), shift).quarterNotes,
    clickLength
  );
  return {
    ...musical,
    duration: {
      quarterNotes: compareRational(lastClickEnd, materialEnd) > 0 ? lastClickEnd : materialEnd,
    },
    events: [
      ...(settings.countIn
        ? beats(numerator).map((click) => clickEvent(click, rational(0), COUNT_IN_BUS))
        : []),
      ...musical.events.map((event) => ({
        ...event,
        at: { quarterNotes: addRational(event.at.quarterNotes, shift) },
      })),
      ...beats(meterBeats).map((click) => clickEvent(click, shift, METER_BUS)),
    ],
  };
}
