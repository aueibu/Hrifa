import { packet, type DataPacket, type Provenance } from './model';
import {
  accumulatePulseDurations,
  addDuration,
  compareRational,
  musicalDuration,
  musicalPosition,
  multiplyRational,
  pulsesToMusicalDuration,
  rational,
  rationalFromNumber,
  rationalToNumber,
  type MusicalDuration,
  type MusicalPosition,
} from './musicalTime';
import { rhythmOrigin } from './rhythmFrame';
import { rhythmAttacks, type RhythmStep } from './rhythmRealization';
import { pitchGroupToArray, type PitchItemValue } from './pitch';

export type PitchAllocation = 'cycle' | 'cycle-rhythm' | 'zip' | 'cartesian';

export interface NoteEventValue {
  onset: MusicalPosition;
  interOnset: MusicalDuration;
  duration: MusicalDuration;
  /** Bare midicents, one per sounding pitch — no wrapper object (see pitch.ts). */
  pitches: number[];
  velocity: number;
}

interface ConcretePitchGroup {
  pitches: number[];
  label: string;
}

export interface MelodicizationResult {
  packet: DataPacket<NoteEventValue>;
  errors: string[];
  messages: string[];
}

const MAX_NOTE_EVENTS = 4096;

function greatestCommonDivisor(first: number, second: number): number {
  return second === 0 ? first : greatestCommonDivisor(second, first % second);
}

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
    const pitches = pitchGroupToArray(item.value as PitchItemValue);
    return pitches.length && pitches.every((midicents) => Number.isFinite(midicents))
      ? [{ item, value: { pitches, label: item.label ?? '' } satisfies ConcretePitchGroup }]
      : [];
  });
}

function melodicizeUnguarded({
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
  if (pulseValues.some((value) => !Number.isFinite(value) || value === 0)) {
    return emptyResult(['Every inter-onset duration must be a nonzero number of pulses; a rest is negative.']);
  }
  const pitchGroups = concretePitchGroups(pitches);
  if (pitchGroups.length !== pitches.items.length) {
    return emptyResult(['Every pitch group must contain finite concrete midicent values.']);
  }
  if (!pulseValues.length || !pitchGroups.length) {
    return emptyResult(['Rhythm and pitch inputs must both contain at least one item.']);
  }

  // The rhythm may start after the downbeat (frame.origin, see rhythmFrame.ts). Every attack
  // shifts by that start; bar lines don't, which is what puts the attacks off the beat.
  const origin = rhythmOrigin(rhythm);
  if (!Number.isFinite(origin)) {
    return emptyResult(['The rhythm must start on a finite pulse.']);
  }
  // Rests and ties live in the rhythm (see rhythmNotation.ts). A rest makes no attack and takes no
  // pitch; a tie merges the next item into the note it starts, which takes one pitch.
  const steps: RhythmStep[] = rhythm.items.map((item) => ({
    duration: Number(item.value),
    tie: item.tie,
    itemId: item.id,
  }));
  const single = rhythmAttacks(steps, origin, { cyclic: rhythm.frame?.topology === 'cyclic' });
  const attacksPerCycle = single.attacks.length;
  if (!attacksPerCycle) {
    return emptyResult(['The rhythm has no attacks to place pitches on; it is all rests and ties.']);
  }
  const pitchCount = pitchGroups.length;

  // Cartesian walks both cycles in step: attack k takes rhythm slot k mod A and pitch group k mod P,
  // and the pitch side steps once each time the pair of cycles realigns (every lcm(A, P) attacks).
  // That plays every pitch group at every rhythm slot exactly once, A x P attacks in all, as
  // successive rhythm cycles. When A and P share no factor it is just two cycles running until
  // they realign. Cycle-rhythm repeats the rhythm until every pitch group has played once.
  const cartesianCount = allocation === 'cartesian' ? attacksPerCycle * pitchCount : 0;
  if (cartesianCount > MAX_NOTE_EVENTS) {
    return emptyResult([
      `This cartesian allocation would create ${cartesianCount} attacks; the limit is ${MAX_NOTE_EVENTS}.`,
    ]);
  }
  const repeats =
    allocation === 'cartesian'
      ? pitchCount
      : allocation === 'cycle-rhythm'
        ? Math.ceil(pitchCount / attacksPerCycle)
        : 1;
  const spine = repeats === 1 ? single : rhythmAttacks(Array.from({ length: repeats }, () => steps).flat(), origin);
  const attacks =
    allocation === 'cartesian'
      ? spine.attacks.slice(0, cartesianCount)
      : allocation === 'cycle-rhythm'
        ? spine.attacks.slice(0, pitchCount)
        : spine.attacks;
  const realignEvery = cartesianCount
    ? cartesianCount / greatestCommonDivisor(attacksPerCycle, pitchCount)
    : 0;

  const pairings: { attackIndex: number; pitchIndex: number }[] = [];
  if (allocation === 'cycle') {
    attacks.forEach((_, attackIndex) => {
      pairings.push({ attackIndex, pitchIndex: attackIndex % pitchCount });
    });
  } else if (allocation === 'cycle-rhythm') {
    attacks.forEach((_, attackIndex) => pairings.push({ attackIndex, pitchIndex: attackIndex }));
  } else if (allocation === 'zip') {
    const count = Math.min(attacks.length, pitchCount);
    for (let index = 0; index < count; index += 1) {
      pairings.push({ attackIndex: index, pitchIndex: index });
    }
  } else {
    attacks.forEach((_, attackIndex) => {
      pairings.push({
        attackIndex,
        pitchIndex: (attackIndex + Math.floor(attackIndex / realignEvery)) % pitchCount,
      });
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
  const items = pairings.map(({ attackIndex, pitchIndex }, eventIndex) => {
    const attack = attacks[attackIndex];
    const rhythmIndex = attack.index % steps.length;
    const rhythmItem = rhythm.items[rhythmIndex];
    const pitchGroup = pitchGroups[pitchIndex];
    const onset: MusicalPosition = {
      quarterNotes: multiplyRational(pulseUnit.quarterNotes, attack.at),
    };
    // The slot runs from this attack to the end of its last tied item, never across a rest.
    const slot = { quarterNotes: multiplyRational(pulseUnit.quarterNotes, attack.slot) };
    const soundingDuration = {
      quarterNotes: multiplyRational(slot.quarterNotes, articulation),
    };
    return {
      id: `${instanceId}:note-group:${rhythmItem.id}:${pitchGroup.item.id}:${eventIndex}`,
      value: {
        onset,
        interOnset: slot,
        duration: soundingDuration,
        pitches: pitchGroup.value.pitches,
        velocity: 1,
      },
      label: `${pitchGroup.value.label} @ ${onset.quarterNotes.numerator}/${onset.quarterNotes.denominator}`,
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
            rhythmOrigin: origin,
          },
        },
      ],
    };
  });

  const lastAttack = attacks[pairings.at(-1)!.attackIndex];
  const lastEndPulses = lastAttack.atPulses + lastAttack.slotPulses;
  const endPulses =
    allocation === 'cycle'
      ? single.endPulses
      : allocation === 'cartesian'
        ? spine.endPulses
        : lastEndPulses;
  const musicalExtent = pulsesToMusicalDuration(endPulses, pulseUnit);
  const usedAllAttacks = allocation === 'zip' ? pairings.length === attacksPerCycle : true;
  const topology =
    allocation !== 'cycle-rhythm' && rhythm.frame?.topology === 'cyclic' && usedAllAttacks
      ? 'cyclic'
      : 'linear';
  const warnings = [...rhythm.warnings, ...pitches.warnings, ...single.warnings];
  const messages: string[] = [];
  if (allocation === 'zip' && attacksPerCycle > pairings.length) {
    const unused = attacksPerCycle - pairings.length;
    messages.push(`${unused} trailing rhythm item${unused === 1 ? '' : 's'} unused by Zip.`);
  }
  if (allocation === 'zip' && pitchCount > pairings.length) {
    const unused = pitchCount - pairings.length;
    messages.push(`${unused} trailing pitch group${unused === 1 ? '' : 's'} unused by Zip.`);
  }

  const sourceGrouping = rhythm.frame?.grouping;
  const outputPulseExtent =
    allocation === 'cycle-rhythm'
      ? lastEndPulses - origin
      : allocation === 'cartesian'
        ? spine.spanPulses
        : single.spanPulses;
  const sourcePulseExtent = rhythm.frame?.extent ?? single.spanPulses;
  const groupingBoundaries =
    sourceGrouping && (allocation === 'cycle-rhythm' || allocation === 'cartesian')
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
        // Grouping units and boundaries are pulse counts that may be fractions (an edited rhythm's
        // grouping follows its notes), so they become exact rationals rather than integer ratios.
        musicalUnits: {
          quarterNotes: multiplyRational(
            pulseUnit.quarterNotes,
            rationalFromNumber(sourceGrouping.units)
          ),
        },
        musicalBoundaries: groupingBoundaries!.map((boundary) => ({
          quarterNotes: multiplyRational(pulseUnit.quarterNotes, rationalFromNumber(boundary)),
        })),
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

/**
 * Turns a rhythm and a pitch list into note events. Anything that goes wrong while resolving time
 * comes back as an error on the result, never as an exception: this runs while a module renders, and
 * a throw there would take the whole page down.
 */
export function melodicize(options: Parameters<typeof melodicizeUnguarded>[0]): MelodicizationResult {
  try {
    return melodicizeUnguarded(options);
  } catch (error) {
    return emptyResult([
      `Melodicization could not place these notes: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }
}

export const melodicizationPulseOptions = [
  { value: '1/1', label: 'Quarter note', duration: musicalDuration(1) },
  { value: '1/2', label: 'Eighth note', duration: musicalDuration(1, 2) },
  { value: '1/4', label: 'Sixteenth note', duration: musicalDuration(1, 4) },
  { value: '1/8', label: 'Thirty-second note', duration: musicalDuration(1, 8) },
];
