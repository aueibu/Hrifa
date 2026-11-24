import { packet, type DataPacket } from '../model';
import { rational } from '../musicalTime';
import type {
  BlankRequest,
  DataBlockTypeDef,
  PacketBlock,
  RecordBlock,
  Ref,
  SlotRef,
  StoredDataBlock,
} from './registry';

/** Types used only by tests. Real registrations arrive in R1. */

function packetBlock(request: BlankRequest, typeId: string, p: DataPacket): PacketBlock {
  return {
    schemaVersion: 1,
    id: request.id,
    typeId,
    name: request.name,
    createdAt: request.createdAt,
    payload: { kind: 'packet', packet: p },
  };
}

export const pitchSetTestType: DataBlockTypeDef = {
  id: 'pitch-set-test',
  label: 'Pitch set',
  payload: 'packet',
  accepts: (p) => p.kind === 'list' && p.domain === 'pitch',
  createBlank: (request) => packetBlock(request, 'pitch-set-test', packet('list', 'pitch', [])),
  audition: {
    // The A8 case: an empty block has nothing to hear.
    refuse: (block) =>
      block.payload.kind === 'packet' && block.payload.packet.items.length === 0
        ? 'This data-block is empty, so there is nothing to play yet.'
        : null,
  },
};

export const rhythmTestType: DataBlockTypeDef = {
  id: 'rhythm-test',
  label: 'Rhythm',
  payload: 'packet',
  accepts: (p) => p.kind === 'list' && p.domain === 'duration',
  createBlank: (request) => packetBlock(request, 'rhythm-test', packet('list', 'duration', [])),
  noAuditionReason: 'Rhythm needs a pitch to be heard.',
};

export const notesTestType: DataBlockTypeDef = {
  id: 'notes-test',
  label: 'Notes',
  payload: 'packet',
  accepts: (p) => p.kind === 'events' && p.domain === 'note',
  createBlank: (request) => packetBlock(request, 'notes-test', packet('events', 'note', [])),
  editorId: 'note-roll',
  audition: {},
};

export interface CollectionTestData {
  entries: { slot: string; role: string; ref: Ref | null }[];
}

export const collectionTestType: DataBlockTypeDef = {
  id: 'collection-test',
  label: 'Collection',
  payload: 'record',
  validate: (data) => {
    const entries = (data as Partial<CollectionTestData> | undefined)?.entries;
    return Array.isArray(entries) &&
      entries.every((entry) => typeof entry.role === 'string' && entry.role !== '')
      ? null
      : 'A collection holds a list of entries, each with a role name.';
  },
  createBlank: (request) => collectionBlock(request.id, request.name, []),
  refs: (data) =>
    (data as CollectionTestData).entries.flatMap((entry): SlotRef[] =>
      entry.ref === null ? [] : [{ slot: entry.slot, ref: entry.ref }]
    ),
  mapRefs: (data, fn) => ({
    entries: (data as CollectionTestData).entries.map((entry) =>
      entry.ref === null ? entry : { ...entry, ref: fn(entry.slot, entry.ref) }
    ),
  }),
};

/** A collection block. Entries: `[slot, role, ref]`; a role name may repeat, a slot may not. */
export function collectionBlock(
  id: string,
  name: string,
  entries: [string, string, Ref | string | null][]
): RecordBlock {
  const data: CollectionTestData = {
    entries: entries.map(([slot, role, ref]) => ({
      slot,
      role,
      ref: typeof ref === 'string' ? { id: ref } : ref,
    })),
  };
  return {
    schemaVersion: 1,
    id,
    typeId: 'collection-test',
    name,
    createdAt: '2026-11-24T00:00:00Z',
    payload: { kind: 'record', data },
  };
}

export function collectionData(block: StoredDataBlock): CollectionTestData {
  if (block.payload.kind !== 'record') {
    throw new Error('not a record');
  }
  return block.payload.data as CollectionTestData;
}

export const blankRequest: BlankRequest = {
  id: 'new',
  createdAt: '2026-11-24T00:00:00Z',
  name: 'New',
  length: rational(16),
};
