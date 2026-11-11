import { metronomeGridClicks, type GroupingOption, type InterferenceResult } from '../interference';
import type { NoteEventValue } from '../melodicization';
import type { DataPacket, Provenance } from '../model';
import {
  addDuration,
  compareRational,
  multiplyRational,
  musicalDuration,
  rational,
  subtractRational,
  type MusicalDuration,
  type MusicalTimeline,
} from '../musicalTime';
import { pitchFrequency } from '../pitch';
import { createRhythmPreviewPlan } from '../rhythmRealization';
import type { ResolvedSound } from '../sounds';
import type {
  InstrumentId,
  MusicalPerformanceEvent,
  MusicalPerformancePlan,
  SecondsPerformanceEvent,
  SecondsPerformancePlan,
} from './types';

/** Interference's grouping click — separate from the transport's meter click (transport.ts). */
export const GROUPING_BUS = 'grouping';

const MIN_AUDIBLE_FREQUENCY = 20;
const MAX_AUDIBLE_FREQUENCY = 20_000;

export interface PitchPreviewGroup {
  id: string;
  pitches: { id: string; midicents: number }[];
  provenance: Provenance[];
}

export function frequencyToMidicents(frequency: number) {
  return 6900 + 1200 * Math.log2(frequency / 440);
}

export function createPitchPreviewPlan({
  sourceId,
  groups,
  stepSeconds,
  gatePercent,
}: {
  sourceId: string;
  groups: PitchPreviewGroup[];
  stepSeconds: number;
  gatePercent: number;
}) {
  const durationSeconds = groups.length * stepSeconds;
  const soundingDuration = Math.max(0.02, stepSeconds * (gatePercent / 100));
  const warnings: string[] = [];
  const events = groups.flatMap<SecondsPerformanceEvent>((group, groupIndex) =>
    group.pitches.flatMap((pitch) => {
      const frequency = pitchFrequency(pitch.midicents);
      if (
        !Number.isFinite(frequency) ||
        frequency < MIN_AUDIBLE_FREQUENCY ||
        frequency > MAX_AUDIBLE_FREQUENCY
      ) {
        warnings.push(`${pitch.id} lies outside 20–20,000 Hz.`);
        return [];
      }
      return [
        {
          id: `${sourceId}:event:${pitch.id}`,
          atSeconds: groupIndex * stepSeconds,
          durationSeconds: soundingDuration,
          pitchMidicents: pitch.midicents,
          velocity: 1,
          instrumentId: 'preview.triangle',
          busId: 'preview',
          provenance: group.provenance,
        },
      ];
    })
  );
  const voiceCount = groups.reduce((total, group) => total + group.pitches.length, 0);
  return {
    plan: {
      id: `${sourceId}:pitch-preview`,
      sourceId,
      timebase: { kind: 'seconds' },
      durationSeconds,
      events,
      warnings,
    } satisfies SecondsPerformancePlan,
    audibleEvents: events.length,
    skippedEvents: voiceCount - events.length,
  };
}

/**
 * Interference's preview in musical time: each generator is a cyclic inter-onset rhythm realized
 * through the shared rhythm realization (rhythmRealization.ts), unrolled over the resultant's
 * recurrence, plus the grouping click on its own bus. The click lengths are musical, not
 * wall-clock: an accented click is a 1/16 of a quarter note, an unaccented one a 1/32.
 */
export function createInterferencePreviewPlan({
  sourceId,
  patterns,
  sounds,
  result,
  pulseUnit,
  timeline,
  grouping,
  groupingSound = { instrumentId: 'sound.click', pitchMidicents: frequencyToMidicents(2400) },
  gatePercent,
}: {
  sourceId: string;
  patterns: number[][];
  /** One per generator (see sounds.ts layerSound). */
  sounds: ResolvedSound[];
  result: InterferenceResult;
  /** Musical length of one pulse (the transport's pulse value). */
  pulseUnit: MusicalDuration;
  timeline: MusicalTimeline;
  grouping?: GroupingOption;
  /** The metronome's tertiary voice. */
  groupingSound?: ResolvedSound;
  gatePercent?: number;
}): MusicalPerformancePlan {
  const generators = createRhythmPreviewPlan({
    sourceId,
    pulseUnit,
    timeline,
    gatePercent,
    layers: patterns.map((pattern, index) => {
      const period = pattern.reduce((total, duration) => total + duration, 0);
      const repeats = period > 0 ? Math.round(result.recurrence / period) : 0;
      return {
        layerId: `generator:${index}`,
        steps: Array.from({ length: repeats }, () => pattern)
          .flat()
          .map((duration) => ({ duration })),
        sound: sounds[index],
      };
    }),
  });
  const end = multiplyRational(pulseUnit.quarterNotes, result.recurrence);
  const duration =
    compareRational(generators.duration.quarterNotes, end) > 0
      ? generators.duration.quarterNotes
      : end;
  const metronomeEvents = grouping
    ? metronomeGridClicks(result.recurrence, grouping.units).flatMap(
        ({ time, accented }): MusicalPerformanceEvent[] => {
          const at = multiplyRational(pulseUnit.quarterNotes, time);
          const room = subtractRational(duration, at);
          const wanted = accented ? rational(1, 16) : rational(1, 32);
          const length = compareRational(wanted, room) <= 0 ? wanted : room;
          if (compareRational(length, rational(0)) <= 0) {
            return [];
          }
          return [
            {
              id: `${sourceId}:grouping:${time}`,
              at: { quarterNotes: at },
              duration: { quarterNotes: length },
              // Every grid unit ticks lightly; each group's start is louder.
              pitchMidicents: groupingSound.pitchMidicents,
              velocity: accented ? 0.8 : 0.3,
              instrumentId: groupingSound.instrumentId,
              busId: GROUPING_BUS,
              provenance: [
                {
                  sourceModuleInstance: sourceId,
                  sourceItemIds: [grouping.id],
                  transformation: 'realize-grouping-metronome',
                  parameters: { time, units: grouping.units, accented },
                },
              ],
            },
          ];
        }
      )
    : [];

  return {
    ...generators,
    id: `${sourceId}:interference-preview`,
    duration: { quarterNotes: duration },
    events: [...generators.events, ...metronomeEvents],
  };
}

export function createNotePacketPerformancePlan({
  sourceId,
  packet,
  timeline,
  instrumentId = 'preview.triangle',
}: {
  sourceId: string;
  packet: DataPacket<NoteEventValue>;
  timeline: MusicalTimeline;
  instrumentId?: InstrumentId;
}): MusicalPerformancePlan {
  if (packet.kind !== 'events' || packet.domain !== 'note') {
    throw new Error('Musical playback requires an events | note packet.');
  }
  if (!packet.items.length) {
    throw new Error('Musical playback requires at least one note event.');
  }

  const frameExtent = packet.frame?.musicalExtent ?? musicalDuration(0);
  const duration = packet.items.reduce((extent, item) => {
    const end = addDuration(item.value.onset, item.value.duration);
    return compareRational(end.quarterNotes, extent.quarterNotes) > 0
      ? { quarterNotes: end.quarterNotes }
      : extent;
  }, frameExtent);

  return {
    id: `${sourceId}:note-events-preview`,
    sourceId,
    timebase: { kind: 'musical', timeline },
    duration,
    events: packet.items.flatMap((item) =>
      item.value.pitches.map((midicents, pitchIndex) => ({
        id: `${sourceId}:performance:${item.id}:pitch:${pitchIndex}`,
        at: item.value.onset,
        duration: item.value.duration,
        pitchMidicents: midicents,
        velocity: item.value.velocity,
        instrumentId,
        busId: 'preview' as const,
        provenance: item.provenance,
      }))
    ),
    warnings: packet.warnings,
  };
}
