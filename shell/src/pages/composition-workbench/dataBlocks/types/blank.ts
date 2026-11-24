import type { DataPacket } from '../../model';
import {
  musicalDuration,
  musicalPosition,
  rationalToNumber,
  type Rational,
} from '../../musicalTime';
import {
  DATA_BLOCK_SCHEMA_VERSION,
  type BlankRequest,
  type PacketBlock,
  type StoredDataBlock,
} from '../registry';

/** A fresh packet block of `typeId` holding `packet`: no lineage (a never-edited block carries none). */
export function packetBlock(
  typeId: string,
  request: BlankRequest,
  packet: DataPacket
): PacketBlock {
  return {
    schemaVersion: DATA_BLOCK_SCHEMA_VERSION,
    id: request.id,
    typeId,
    name: request.name,
    createdAt: request.createdAt,
    payload: { kind: 'packet', packet },
  };
}

/** An empty packet with no frame, for the types that have no length of their own. */
export function emptyPacket(
  kind: DataPacket['kind'],
  domain: DataPacket['domain'],
  extra: Pick<DataPacket, 'role' | 'encoding'> = {}
): DataPacket {
  return { kind, domain, items: [], warnings: [], ...extra };
}

/** A blank notes packet's frame: linear, from zero, `length` long. */
export function blankFrame(length: Rational) {
  return {
    topology: 'linear' as const,
    unit: 'quarterNote' as const,
    extent: rationalToNumber(length),
    origin: 0,
    musicalExtent: musicalDuration(length.numerator, length.denominator),
    musicalOrigin: musicalPosition(0),
  };
}

/** The hearing refusal (A8): an empty block has nothing to play. */
export function refuseWhenEmpty(block: StoredDataBlock): string | null {
  return block.payload.kind === 'packet' && block.payload.packet.items.length === 0
    ? 'This data-block is empty, so there is nothing to play yet.'
    : null;
}
