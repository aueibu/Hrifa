import { packet, type DataPacket, type Provenance } from './model';
import {
  accumulatePulseDurations,
  addDuration,
  compareRational,
  musicalDuration,
  musicalPosition,
  multiplyRational,
  rational,
  rationalToNumber,
  type MusicalDuration,
  type MusicalPosition,
} from './musicalTime';
import { asPitchGroup, type PitchGroupValue, type PitchValue } from './pitch';

export type PitchAllocation = 'cycle' | 'cycle-rhythm' | 'zip' | 'cartesian';

export interface NoteEventValue {
  onset: MusicalPosition;
  interOnset: MusicalDuration;
  duration: MusicalDuration;
  pitches: PitchValue[];
  velocity: number;
}

export interface MelodicizationResult {
  packet: DataPacket<NoteEventValue>;
  errors: string[];
  messages: string[];
}

const MAX_NOTE_EVENTS = 4096;

function inheritedProvenance(...groups: Provenance[][]) {
  return groups.flatMap((group) => group);
}

function emptyResult(errors: string[]): MelodicizationResult {
  return {
    packet: packet('events', 'note', [], errors),
    errors,
    messages: [],
  };
}

function concretePitchGroups(packetValue: DataPacket) {
  return packetValue.items.flatMap((item) => {
    const group = asPitchGroup(item.value as PitchValue | PitchGroupValue);
    const pitches = group.pitches as Partial<PitchValue>[];
    return pitches.length &&
      pitches.every(
        (pitch) => typeof pitch.midicents === 'number' && Number.isFinite(pitch.midicents)
      )
      ? [{ item, value: { ...group, pitches: pitches as PitchValue[] } }]
      : [];
  });
}

export function melodicize({
  instanceId,
  rhythm,
  pitches,
  allocation,
  pulseUnit,
  articulationPercent,
}: {
  instanceId: string;
  rhythm?: DataPacket;
  pitches?: DataPacket;
  allocation: PitchAllocation;
  pulseUnit: MusicalDuration;
  articulationPercent: number;
}): MelodicizationResult {
  const errors: string[] = [];
  if (
    !rhythm ||
    rhythm.kind !== 'list' ||
    rhythm.domain !== 'duration' ||
    rhythm.role !== 'interOnset'
  ) {
    errors.push('Connect an inter-onset duration list as the rhythm source.');
  }
  if (!pitches || pitches.kind !== 'list' || pitches.domain !== 'pitch') {
    errors.push(
      pitches?.domain === 'pitchClass'
        ? 'Pitch classes need an explicit register assignment before melodicization.'
        : 'Connect a concrete pitch list as the pitch source.'
    );
  }
  if (compareRational(pulseUnit.quarterNotes, rational(0)) <= 0) {
    errors.push('Pulse value must be a positive musical duration.');
  }
  if (
    !Number.isSafeInteger(articulationPercent) ||
    articulationPercent <= 0 ||
    articulationPercent > 200
  ) {
    errors.push('Articulation must be greater than 0% and no more than 200%.');
  }
  if (errors.length || !rhythm || !pitches) {
    return emptyResult(errors);
  }

  const pulseValues = rhythm.items.map((item) => Number(item.value));
  if (pulseValues.some((value) => !Number.isSafeInteger(value) || value <= 0)) {
    return emptyResult(['Every inter-onset duration must be a positive whole pulse count.']);
  }
  const pitchGroups = concretePitchGroups(pitches);
  if (pitchGroups.length !== pitches.items.length) {
    return emptyResult(['Every pitch group must contain finite concrete midicent values.']);
  }
  if (!pulseValues.length || !pitchGroups.length) {
    return emptyResult(['Rhythm and pitch inputs must both contain at least one item.']);
  }

  const rhythmicSpineValues =
    allocation === 'cycle-rhythm'
      ? Array.from(
          { length: pitchGroups.length },
          (_, attackIndex) => pulseValues[attackIndex % pulseValues.length]
        )
      : pulseValues;
  const accumulated = accumulatePulseDurations(rhythmicSpineValues, pulseUnit);
  const pairings: { attackIndex: number; rhythmIndex: number; pitchIndex: number }[] = [];
  if (allocation === 'cycle') {
    accumulated.placements.forEach((_, attackIndex) => {
      pairings.push({
        attackIndex,
        rhythmIndex: attackIndex,
        pitchIndex: attackIndex % pitchGroups.length,
      });
    });
  } else if (allocation === 'cycle-rhythm') {
    pitchGroups.forEach((_, pitchIndex) => {
      pairings.push({
        attackIndex: pitchIndex,
        rhythmIndex: pitchIndex % rhythm.items.length,
        pitchIndex,
      });
    });
  } else if (allocation === 'zip') {
    const count = Math.min(accumulated.placements.length, pitchGroups.length);
    for (let index = 0; index < count; index += 1) {
      pairings.push({ attackIndex: index, rhythmIndex: index, pitchIndex: index });
    }
  } else {
    accumulated.placements.forEach((_, attackIndex) => {
      pitchGroups.forEach((_, pitchIndex) =>
        pairings.push({ attackIndex, rhythmIndex: attackIndex, pitchIndex })
      );
    });
  }

  const soundingNoteCount = pairings.reduce(
    (count, pairing) => count + pitchGroups[pairing.pitchIndex].value.pitches.length,
    0
  );
  if (soundingNoteCount > MAX_NOTE_EVENTS) {
    return emptyResult([
      `This ${allocation} allocation would create ${soundingNoteCount} notes; the limit is ${MAX_NOTE_EVENTS}.`,
    ]);
  }

  const articulation = rational(articulationPercent, 100);
  const items = pairings.map(({ attackIndex, rhythmIndex, pitchIndex }, eventIndex) => {
    const rhythmItem = rhythm.items[rhythmIndex];
    const pitchGroup = pitchGroups[pitchIndex];
    const placement = accumulated.placements[attackIndex];
    const soundingDuration = {
      quarterNotes: multiplyRational(placement.duration.quarterNotes, articulation),
    };
    return {
      id: `${instanceId}:note-group:${rhythmItem.id}:${pitchGroup.item.id}:${eventIndex}`,
      value: {
        onset: placement.at,
        interOnset: placement.duration,
        duration: soundingDuration,
        pitches: pitchGroup.value.pitches,
        velocity: 1,
      },
      label: `${pitchGroup.value.label} @ ${placement.at.quarterNotes.numerator}/${placement.at.quarterNotes.denominator}`,
      provenance: [
        ...inheritedProvenance(rhythmItem.provenance, pitchGroup.item.provenance),
        {
          sourceModuleInstance: instanceId,
          sourceItemIds: [rhythmItem.id, pitchGroup.item.id],
          transformation: 'melodicize',
          parameters: {
            allocation,
            articulationPercent,
            pulseUnit,
            attackIndex,
            rhythmIndex,
            pitchIndex,
          },
        },
      ],
    };
  });

  const usedRhythmCount =
    allocation === 'zip' || allocation === 'cycle-rhythm'
      ? Math.min(rhythm.items.length, pitchGroups.length)
      : rhythm.items.length;
  const lastPlacement = accumulated.placements[pairings.at(-1)!.attackIndex];
  const musicalExtent = addDuration(lastPlacement.at, lastPlacement.duration);
  const topology =
    allocation !== 'cycle-rhythm' &&
    rhythm.frame?.topology === 'cyclic' &&
    usedRhythmCount === rhythm.items.length
      ? 'cyclic'
      : 'linear';
  const warnings = [...rhythm.warnings, ...pitches.warnings];
  const messages: string[] = [];
  if (allocation === 'zip' && rhythm.items.length > usedRhythmCount) {
    const unused = rhythm.items.length - usedRhythmCount;
    messages.push(`${unused} trailing rhythm item${unused === 1 ? '' : 's'} unused by Zip.`);
  }
  if (allocation === 'zip' && pitchGroups.length > usedRhythmCount) {
    const unused = pitchGroups.length - usedRhythmCount;
    messages.push(`${unused} trailing pitch group${unused === 1 ? '' : 's'} unused by Zip.`);
  }

  const sourceGrouping = rhythm.frame?.grouping;
  const outputPulseExtent = rhythmicSpineValues.reduce((total, value) => total + value, 0);
  const sourcePulseExtent =
    rhythm.frame?.extent ?? pulseValues.reduce((total, value) => total + value, 0);
  const groupingBoundaries =
    sourceGrouping && allocation === 'cycle-rhythm'
      ? Array.from({ length: Math.ceil(outputPulseExtent / sourcePulseExtent) }, (_, cycleIndex) =>
          sourceGrouping.boundaries.map((boundary) => boundary + cycleIndex * sourcePulseExtent)
        )
          .flat()
          .filter((boundary) => boundary < outputPulseExtent)
      : sourceGrouping?.boundaries;
  const grouping = sourceGrouping
    ? {
        ...sourceGrouping,
        units: sourceGrouping.units * rationalToNumber(pulseUnit.quarterNotes),
        boundaries: groupingBoundaries!.map(
          (boundary) => boundary * rationalToNumber(pulseUnit.quarterNotes)
        ),
        musicalUnits: {
          quarterNotes: multiplyRational(pulseUnit.quarterNotes, sourceGrouping.units),
        },
        musicalBoundaries: groupingBoundaries!.map((boundary) =>
          musicalPosition(
            pulseUnit.quarterNotes.numerator * boundary,
            pulseUnit.quarterNotes.denominator
          )
        ),
      }
    : undefined;

  return {
    packet: packet(
      'events',
      'note',
      items,
      [...warnings, ...messages],
      {
        allocation,
        articulationPercent,
        pulseUnit,
        sourceRhythmPacket: rhythm.metadata,
        sourcePitchEncoding: pitches.encoding,
      },
      {
        frame: {
          topology,
          unit: 'quarterNote',
          extent: rationalToNumber(musicalExtent.quarterNotes),
          origin: 0,
          musicalExtent,
          musicalOrigin: musicalPosition(0),
          grouping,
        },
      }
    ),
    errors: [],
    messages,
  };
}

export const melodicizationPulseOptions = [
  { value: '1/1', label: 'Quarter note', duration: musicalDuration(1) },
  { value: '1/2', label: 'Eighth note', duration: musicalDuration(1, 2) },
  { value: '1/4', label: 'Sixteenth note', duration: musicalDuration(1, 4) },
  { value: '1/8', label: 'Thirty-second note', duration: musicalDuration(1, 8) },
];
