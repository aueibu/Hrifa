import { pitchClassMidicents } from '../../dataBlocks/auditionPlans';
import { defaultAuditionSettings, type StoredDataBlock } from '../../dataBlocks/registry';
import { PITCH_CLASSES_TYPE_ID, edoOf } from '../../dataBlocks/types/pitchClasses';
import { PITCH_SET_TYPE_ID } from '../../dataBlocks/types/pitchSet';
import { rhythmPulseLength } from '../../dataBlocks/types/rhythm';
import { melodicize, type NoteEventValue, type PitchAllocation } from '../../melodicization';
import { packet, type DataItem, type DataPacket } from '../../model';
import {
  pitchClassGroupToArray,
  pitchGroupToArray,
  type PitchClassItemValue,
  type PitchItemValue,
} from '../../pitch';
import { DEFAULT_PERIOD, harmonizePitch, nearestMember } from './pitchMath';
import { registerModifier, type ModifierDef, type ModifierRunResult } from './registry';

export const MELODICIZE_ID = 'melodicize';
export const SNAP_TO_PITCH_SET_ID = 'snap-to-pitch-set';
export const HARMONIZE_ID = 'harmonize';

const PITCH_SOURCES = [PITCH_SET_TYPE_ID, PITCH_CLASSES_TYPE_ID] as const;
const ALLOCATIONS: readonly PitchAllocation[] = ['cycle', 'cycle-rhythm', 'zip', 'cartesian'];

/** What the pitch input holds, however it is stored. */
interface PitchInput {
  /** One group of midicents per item, in order (Pitch classes placed as the audition places them). */
  groups: number[][];
  /** Pitch classes repeat every period by definition. */
  classes: boolean;
}

/**
 * The pitch input of a modifier. A Pitch set is its exact midicents; Pitch classes are placed as the
 * audition core places them (`pitchClassMidicents`: base octave 4, no offset, steps of the block's
 * own EDO, 12 when it has no `chromatic-N`). Item order and groups are kept (an audition plays a
 * set, Melodicize needs the sequence).
 */
function pitchInputOf(block: StoredDataBlock): PitchInput {
  if (block.payload.kind !== 'packet') {
    return { groups: [], classes: false };
  }
  const source = block.payload.packet;
  if (block.typeId === PITCH_CLASSES_TYPE_ID) {
    const edo = edoOf(source);
    const groups = source.items.map((item) =>
      pitchClassMidicents(
        source.kind === 'events'
          ? ((item.value as { pitchClasses?: number[] }).pitchClasses ?? [])
          : pitchClassGroupToArray(item.value as PitchClassItemValue),
        defaultAuditionSettings,
        edo
      )
    );
    return { groups, classes: true };
  }
  return {
    groups: source.items.map((item) => pitchGroupToArray(item.value as PitchItemValue)),
    classes: false,
  };
}

function pitchPacketOf(input: PitchInput, origin: StoredDataBlock): DataPacket {
  const sourceItems = origin.payload.kind === 'packet' ? origin.payload.packet.items : [];
  const items: DataItem[] = input.groups.map((pitches, index) => ({
    id: sourceItems[index]?.id ?? `p${index}`,
    value: pitches.length === 1 ? pitches[0] : pitches,
    provenance: sourceItems[index]?.provenance ?? [],
  }));
  return packet('list', 'pitch', items, [], undefined, { encoding: 'midicent' });
}

const unique = (values: number[]) =>
  values.filter((value, index) => values.indexOf(value) === index);

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function validateSetParams(params: Record<string, unknown>): string | null {
  if (typeof params.repeat !== 'boolean') {
    return 'Repeat must be on or off.';
  }
  if (!isPositiveFinite(params.period)) {
    return 'Period must be a number of cents above zero.';
  }
  return null;
}

/** A Pitch classes block is built from steps of 1200/N cents, so its own period is the octave. */
const CLASS_PERIOD = 1200;

/** The set a Snap or Harmonize works against: members in cents, whether it repeats, its period. */
function setOf(
  block: StoredDataBlock,
  params: Record<string, unknown>
): { members: number[]; repeat: boolean; period: number } | null {
  const input = pitchInputOf(block);
  const members = unique(input.groups.flat().filter((value) => Number.isFinite(value)));
  if (members.length === 0) {
    return null;
  }
  return {
    members,
    repeat: input.classes || params.repeat === true,
    // Pitch classes are N steps per OCTAVE (their encoding), so they repeat at 1200 whatever Period says;
    // Period applies to a Pitch set (use one for a non-octave scale).
    period: input.classes ? CLASS_PERIOD : (params.period as number),
  };
}

function mapNotes(
  input: DataPacket,
  instanceId: string,
  transformation: string,
  parameters: Record<string, unknown>,
  change: (pitches: number[]) => number[]
): DataPacket {
  const items = (input as DataPacket<NoteEventValue>).items.map((item) => ({
    ...item,
    value: { ...item.value, pitches: unique(change(item.value.pitches)) },
    provenance: [
      ...item.provenance,
      { sourceNodeInstance: instanceId, sourceItemIds: [item.id], transformation, parameters },
    ],
  }));
  return { ...input, items };
}

const melodicizeModifier: ModifierDef = {
  id: MELODICIZE_ID,
  label: 'Melodicize',
  input: 'rhythm',
  output: 'notes',
  refSlots: [{ slot: 'pitches', label: 'Pitch set', accepts: PITCH_SOURCES }],
  // The Melodicization node's defaults: Cycle, articulation 100%.
  defaults: () => ({ allocation: 'cycle', articulationPercent: 100 }),
  validateParams: (params) => {
    if (!ALLOCATIONS.includes(params.allocation as PitchAllocation)) {
      return 'Allocation must be Cycle, Cycle rhythm, Zip or Cartesian.';
    }
    const percent = params.articulationPercent;
    return Number.isSafeInteger(percent) && (percent as number) > 0 && (percent as number) <= 200
      ? null
      : 'Articulation must be a whole number above 0 and up to 200 percent.';
  },
  run: (input, params, refs, context): ModifierRunResult => {
    if (input.kind !== 'list' || input.domain !== 'duration') {
      return { ok: false, problem: 'The rhythm must be a list of durations' };
    }
    const pitchBlock = refs.pitches;
    const pitches = pitchPacketOf(pitchInputOf(pitchBlock), pitchBlock);
    if (pitches.items.length === 0) {
      return { ok: false, problem: 'Pitch set is empty' };
    }
    const result = melodicize({
      instanceId: context.instanceId,
      // A rhythm block's durations are inter-onset by definition, even when a producer left the role off.
      rhythm: { ...input, role: input.role ?? 'interOnset' },
      pitches,
      allocation: params.allocation as PitchAllocation,
      // The rhythm's own pulse when its frame has one (as the Rhythm plays alone), else the transport's:
      // adding Melodicize never changes when the notes fall.
      pulseUnit: rhythmPulseLength(input, context.pulseUnit),
      articulationPercent: params.articulationPercent as number,
    });
    return result.errors.length > 0
      ? { ok: false, problem: result.errors.join(' ') }
      : { ok: true, packet: result.packet };
  },
};

const snapModifier: ModifierDef = {
  id: SNAP_TO_PITCH_SET_ID,
  label: 'Snap to Pitch Set',
  input: 'notes',
  output: 'notes',
  refSlots: [{ slot: 'set', label: 'Pitch set', accepts: PITCH_SOURCES }],
  defaults: () => ({ repeat: true, period: DEFAULT_PERIOD }),
  validateParams: validateSetParams,
  run: (input, params, refs, context): ModifierRunResult => {
    const set = setOf(refs.set, params);
    if (!set) {
      return { ok: false, problem: 'Pitch set is empty' };
    }
    return {
      ok: true,
      packet: mapNotes(
        input,
        context.instanceId,
        'snap-to-pitch-set',
        { repeat: set.repeat, period: set.period, setId: refs.set.id },
        (pitches) =>
          pitches.map((pitch) => nearestMember(pitch, set.members, set.repeat, set.period) ?? pitch)
      ),
    };
  },
};

const harmonizeModifier: ModifierDef = {
  id: HARMONIZE_ID,
  label: 'Harmonize',
  input: 'notes',
  output: 'notes',
  refSlots: [{ slot: 'set', label: 'Pitch set', accepts: PITCH_SOURCES }],
  defaults: () => ({ voices: 3, step: 1, repeat: true, period: DEFAULT_PERIOD }),
  validateParams: (params) => {
    const { voices, step } = params;
    if (!Number.isInteger(voices) || (voices as number) < 2 || (voices as number) > 8) {
      return 'Voices must be a whole number from 2 to 8.';
    }
    if (!Number.isInteger(step) || (step as number) < 1 || (step as number) > 4) {
      return 'Step must be a whole number from 1 to 4.';
    }
    return validateSetParams(params);
  },
  run: (input, params, refs, context): ModifierRunResult => {
    const set = setOf(refs.set, params);
    if (!set) {
      return { ok: false, problem: 'Pitch set is empty' };
    }
    const options = {
      voices: params.voices as number,
      step: params.step as number,
      repeat: set.repeat,
      period: set.period,
    };
    return {
      ok: true,
      packet: mapNotes(
        input,
        context.instanceId,
        'harmonize',
        { ...options, setId: refs.set.id },
        (pitches) => pitches.flatMap((pitch) => harmonizePitch(pitch, set.members, options))
      ),
    };
  },
};

/** Registers Melodicize, Snap to Pitch Set and Harmonize; returns the removers. */
export function registerBuiltinModifiers(): () => void {
  const removers = [melodicizeModifier, snapModifier, harmonizeModifier].map(registerModifier);
  return () => removers.forEach((remove) => remove());
}
