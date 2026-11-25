import {
  DATA_BLOCK_SCHEMA_VERSION,
  type PacketBlock,
  type Ref,
  type RecordBlock,
  type StoredDataBlock,
} from '../dataBlocks/registry';
import '../dataBlocks/types';
import { packet } from '../model';
import { rationalFromNumber, type Rational } from '../musicalTime';
import { getModifierDef } from './modifiers';
import {
  blankCollectionData,
  blankObjectData,
  blankSceneData,
  blankStrip,
  COLLECTION_TYPE_ID,
  OBJECT_TYPE_ID,
  SCENE_TYPE_ID,
  type CollectionData,
  type ModifierInstance,
  type ObjectData,
  type Strip,
  type StripParent,
} from './sceneTypes';

/** Test helpers only: the 3-2 son clave and small scene builders. */

const CREATED = '2026-11-24T00:00:00Z';

/** Son clave in sixteenths: durations 3 3 4 2 4, cyclic frame of 16 pulses. Attacks at 0, 3/4, 3/2, 5/2, 3 quarters; cycle 4. */
export function claveBlock(id = 'clave', name = 'Clave'): PacketBlock {
  return {
    schemaVersion: DATA_BLOCK_SCHEMA_VERSION,
    id,
    typeId: 'rhythm',
    name,
    createdAt: CREATED,
    payload: {
      kind: 'packet',
      packet: packet(
        'list',
        'duration',
        [3, 3, 4, 2, 4].map((value, index) => ({ id: `i${index}`, value, provenance: [] })),
        [],
        undefined,
        { frame: { topology: 'cyclic', unit: 'pulse', extent: 16 } }
      ),
    },
  };
}

export function emptyRhythmBlock(id = 'empty-rhythm'): PacketBlock {
  const base = claveBlock(id, 'Empty rhythm');
  return {
    ...base,
    payload: {
      kind: 'packet',
      packet: packet('list', 'duration', [], [], undefined, {
        frame: { topology: 'cyclic', unit: 'pulse', extent: 16 },
      }),
    },
  };
}

/** The id every helper-built first strip has. */
export const S1 = 's1';

interface StripPatch {
  id?: string;
  dataRef?: Ref | null;
  /** Quarter notes. */
  start?: number;
  duration?: number;
  mapping?: Strip['mapping'];
  contentOffset?: Rational;
  modifiers?: ModifierInstance[];
  mute?: boolean;
  parentStrip?: StripParent | null;
}

/** A strip: start 0, 4 quarters, Loop, silent, unless `patch` says otherwise. */
export function stripOf(patch: StripPatch = {}): Strip {
  const { start, duration, id, ...rest } = patch;
  return {
    ...blankStrip(id ?? S1),
    ...rest,
    start: rationalFromNumber(start ?? 0),
    duration: rationalFromNumber(duration ?? 4),
  };
}

type ObjectPatch = Partial<Omit<ObjectData, 'strips'>> &
  Omit<StripPatch, 'id'> & {
    /** Several strips instead of the one the other fields describe. */
    strips?: Strip[];
    /** Shorthand for `dataRef`. */
    primaryDataRef?: Ref | null;
    /** Shorthand: the first strip of this object is the parent. */
    parentRef?: Ref | null;
  };

/** An object with the strips of `patch.strips`, else ONE strip `s1` built from the strip fields of `patch`. */
export function objectBlock(id: string, patch: ObjectPatch = {}, name = id): RecordBlock {
  const { strips, primaryDataRef, parentRef, registerSpan, mute, ...stripFields } = patch;
  const data: ObjectData = {
    ...blankObjectData(),
    ...(registerSpan === undefined ? {} : { registerSpan }),
    ...(mute === undefined ? {} : { mute }),
    strips: strips ?? [
      stripOf({
        ...stripFields,
        ...(primaryDataRef === undefined ? {} : { dataRef: primaryDataRef }),
        ...(parentRef ? { parentStrip: { objectId: parentRef.id, stripId: S1 } } : {}),
      }),
    ],
  };
  return record(id, OBJECT_TYPE_ID, name, data);
}

export function collectionBlock(
  id: string,
  members: string[],
  patch: Partial<CollectionData> = {},
  name = id
): RecordBlock {
  return record(id, COLLECTION_TYPE_ID, name, {
    ...blankCollectionData(),
    memberRefs: members.map((member) => ({ id: member })),
    ...patch,
  });
}

export function sceneBlock(id: string, root: string | null, name = id): RecordBlock {
  return record(id, SCENE_TYPE_ID, name, {
    ...blankSceneData(),
    rootCollectionRef: root === null ? null : { id: root },
  });
}

function record(id: string, typeId: string, name: string, data: unknown): RecordBlock {
  return {
    schemaVersion: DATA_BLOCK_SCHEMA_VERSION,
    id,
    typeId,
    name,
    createdAt: CREATED,
    payload: { kind: 'record', data },
  };
}

export function replaceBlock(
  blocks: readonly StoredDataBlock[],
  next: StoredDataBlock
): StoredDataBlock[] {
  return blocks.map((block) => (block.id === next.id ? next : block));
}

/** A Pitch set of midicents (one item per pitch), the way the desk stores it. */
export function pitchSetBlock(id: string, pitches: number[], name = id): PacketBlock {
  return {
    schemaVersion: DATA_BLOCK_SCHEMA_VERSION,
    id,
    typeId: 'pitch-set',
    name,
    createdAt: CREATED,
    payload: {
      kind: 'packet',
      packet: packet(
        'list',
        'pitch',
        pitches.map((value, index) => ({ id: `${id}-${index}`, value, provenance: [] })),
        [],
        undefined,
        { encoding: 'midicent' }
      ),
    },
  };
}

/** A Pitch classes block of the given EDO (`chromatic-N`). */
export function pitchClassesBlock(
  id: string,
  pitchClasses: number[],
  edo: number,
  name = id
): PacketBlock {
  return {
    schemaVersion: DATA_BLOCK_SCHEMA_VERSION,
    id,
    typeId: 'pitch-classes',
    name,
    createdAt: CREATED,
    payload: {
      kind: 'packet',
      packet: packet(
        'list',
        'pitchClass',
        pitchClasses.map((value, index) => ({ id: `${id}-${index}`, value, provenance: [] })),
        [],
        undefined,
        { encoding: `chromatic-${edo}` as const }
      ),
    },
  };
}

/** A Notes block: one note per entry, `at` in quarters, one quarter long, amplitude as given. */
export function notesBlock(
  id: string,
  notes: { at: number; pitches: number[]; velocity?: number; length?: number }[],
  name = id
): PacketBlock {
  return {
    schemaVersion: DATA_BLOCK_SCHEMA_VERSION,
    id,
    typeId: 'notes',
    name,
    createdAt: CREATED,
    payload: {
      kind: 'packet',
      packet: packet(
        'events',
        'note',
        notes.map((note, index) => ({
          id: `${id}-${index}`,
          value: {
            onset: { quarterNotes: rationalFromNumber(note.at) },
            interOnset: { quarterNotes: rationalFromNumber(1) },
            duration: { quarterNotes: rationalFromNumber(note.length ?? 1) },
            pitches: note.pitches,
            velocity: note.velocity ?? 0.8,
          },
          provenance: [],
        })),
        [],
        undefined,
        {
          frame: {
            topology: 'linear',
            unit: 'quarterNote',
            extent: 4,
            origin: 0,
            musicalExtent: { quarterNotes: rationalFromNumber(4) },
            musicalOrigin: { quarterNotes: rationalFromNumber(0) },
          },
        }
      ),
    },
  };
}

/** A modifier instance with its type's defaults, overridden by `params`, its slots set by `refs` (block ids). */
export function modifierOf(
  id: string,
  type: string,
  refs: Record<string, string | null> = {},
  params: Record<string, unknown> = {},
  mute = false
): ModifierInstance {
  const def = getModifierDef(type);
  if (!def) {
    throw new Error(`no modifier ${type}`);
  }
  return {
    id,
    type,
    mute,
    params: { ...def.defaults(), ...params },
    refs: Object.fromEntries(
      def.refSlots.map((slot) => [
        slot.slot,
        refs[slot.slot] ? { id: refs[slot.slot] as string } : null,
      ])
    ),
  };
}
