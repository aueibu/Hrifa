import {
  generatorAttackTimes,
  metronomeGridClicks,
  type GroupingOption,
  type InterferenceResult,
} from "../interference";
import type { NoteEventValue } from "../melodicization";
import type { DataPacket, Provenance } from "../model";
import {
  addDuration,
  compareRational,
  musicalDuration,
  type MusicalTimeline,
} from "../musicalTime";
import { pitchFrequency } from "../pitch";
import type {
  InstrumentId,
  MusicalPerformancePlan,
  SecondsPerformanceEvent,
  SecondsPerformancePlan,
} from "./types";

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
          instrumentId: "preview.triangle",
          busId: "preview",
          provenance: group.provenance,
        },
      ];
    }),
  );
  const voiceCount = groups.reduce((total, group) => total + group.pitches.length, 0);
  return {
    plan: {
      id: `${sourceId}:pitch-preview`,
      sourceId,
      timebase: { kind: "seconds" },
      durationSeconds,
      events,
      warnings,
    } satisfies SecondsPerformancePlan,
    audibleEvents: events.length,
    skippedEvents: voiceCount - events.length,
  };
}

export function createInterferencePreviewPlan({
  sourceId,
  patterns,
  midiNotes,
  result,
  unitSeconds,
  grouping,
}: {
  sourceId: string;
  patterns: number[][];
  midiNotes: number[];
  result: InterferenceResult;
  unitSeconds: number;
  grouping?: GroupingOption;
}): SecondsPerformancePlan {
  const generatorEvents = patterns.flatMap((pattern, generatorIndex) =>
    generatorAttackTimes(pattern, result.recurrence).map(
      (time): SecondsPerformanceEvent => ({
        id: `${sourceId}:generator:${generatorIndex}:attack:${time}`,
        atSeconds: time * unitSeconds,
        durationSeconds: Math.min(0.12, unitSeconds * 0.85),
        pitchMidicents: midiNotes[generatorIndex] * 100,
        velocity: 1,
        instrumentId: generatorIndex % 2 ? "preview.triangle" : "preview.sine",
        busId: "preview",
        provenance: [
          {
            sourceModuleInstance: sourceId,
            sourceItemIds: [`generator:${generatorIndex}`],
            transformation: "realize-generator-attack",
            parameters: { time, unitSeconds },
          },
        ],
      }),
    ),
  );
  const metronomeEvents = grouping
    ? metronomeGridClicks(result.recurrence, grouping.units).map(
        ({ time, accented }): SecondsPerformanceEvent => ({
          id: `${sourceId}:metronome:${time}`,
          atSeconds: time * unitSeconds,
          durationSeconds: accented ? 0.055 : 0.03,
          pitchMidicents: frequencyToMidicents(accented ? 1500 : 900),
          velocity: 1,
          instrumentId: accented ? "preview.click-accent" : "preview.click",
          busId: "metronome",
          provenance: [
            {
              sourceModuleInstance: sourceId,
              sourceItemIds: [grouping.id],
              transformation: "realize-grouping-metronome",
              parameters: { time, units: grouping.units, accented },
            },
          ],
        }),
      )
    : [];

  return {
    id: `${sourceId}:interference-preview`,
    sourceId,
    timebase: { kind: "seconds" },
    durationSeconds: result.recurrence * unitSeconds,
    events: [...generatorEvents, ...metronomeEvents],
    warnings: [],
  };
}

export function createNotePacketPerformancePlan({
  sourceId,
  packet,
  timeline,
  instrumentId = "preview.triangle",
}: {
  sourceId: string;
  packet: DataPacket<NoteEventValue>;
  timeline: MusicalTimeline;
  instrumentId?: InstrumentId;
}): MusicalPerformancePlan {
  if (packet.kind !== "events" || packet.domain !== "note") {
    throw new Error("Musical playback requires an events | note packet.");
  }
  if (!packet.items.length) {
    throw new Error("Musical playback requires at least one note event.");
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
    timebase: { kind: "musical", timeline },
    duration,
    events: packet.items.flatMap((item) =>
      item.value.pitches.map((pitch, pitchIndex) => ({
        id: `${sourceId}:performance:${item.id}:pitch:${pitchIndex}`,
        at: item.value.onset,
        duration: item.value.duration,
        pitchMidicents: pitch.midicents,
        velocity: item.value.velocity,
        instrumentId,
        busId: "preview" as const,
        provenance: item.provenance,
      })),
    ),
    warnings: packet.warnings,
  };
}
