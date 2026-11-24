import {
  DATA_BLOCK_SCHEMA_VERSION,
  type PacketBlock,
  type RecordBlock,
  type StoredDataBlock,
} from '../dataBlocks/registry';
import '../dataBlocks/types';
import { packet } from '../model';
import { rationalFromNumber } from '../musicalTime';
import {
  blankCollectionData,
  blankObjectData,
  blankSceneData,
  COLLECTION_TYPE_ID,
  OBJECT_TYPE_ID,
  SCENE_TYPE_ID,
  type CollectionData,
  type ObjectData,
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

type ObjectPatch = Partial<Omit<ObjectData, 'timeSpan'>> & {
  /** Quarter notes. */
  start?: number;
  duration?: number;
};

export function objectBlock(id: string, patch: ObjectPatch = {}, name = id): RecordBlock {
  const { start, duration, ...rest } = patch;
  const blank = blankObjectData();
  const data: ObjectData = {
    ...blank,
    ...rest,
    timeSpan: {
      start: rationalFromNumber(start ?? 0),
      duration: rationalFromNumber(duration ?? 4),
    },
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
