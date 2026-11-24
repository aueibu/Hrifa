import { duplicateDataBlock, type DataBlockLineage, type DataBlockOrigin } from '../dataBlock';
import type { Operator } from '../dataBlockOperators';
import type { DataPacket } from '../model';
import type { Rational } from '../musicalTime';

/**
 * The data-block registry (rebuild, R0; W-58, W-59). One definition per kind of data-block,
 * registered with one call. A block STORES its type id; every consumer (the desk, the picker, the
 * delete confirm, the users walk, a node's input check) asks the definition and never branches on a
 * type id. No React here: a preview or an editor is named by an id the UI resolves.
 */

/** A pointer at a data-block. `version` pins a version; absent follows the head. */
export interface Ref {
  id: string;
  version?: string;
}

/** One reference a record holds, under the stable key `slot` (told apart from its siblings by it). */
export interface SlotRef {
  slot: string;
  ref: Ref;
}

/**
 * The stored envelope version. Bumped from 1 to 2 by the registry rebuild (R1, W-60): version 1 was
 * the legacy shape (no `typeId`, packet at the top level), and nothing migrates it (baseline reset).
 */
export const DATA_BLOCK_SCHEMA_VERSION = 2;

/** The stored fields every block has, whatever its type. */
interface BlockBase {
  schemaVersion: typeof DATA_BLOCK_SCHEMA_VERSION;
  id: string;
  /** The registered type this block is. Stored: registering another type later never changes it. */
  typeId: string;
  name: string;
  note?: string;
  createdAt: string;
  origin?: DataBlockOrigin;
}

/** A block of a packet type. Only packets have a version tree. */
export interface PacketBlock extends BlockBase {
  payload: { kind: 'packet'; packet: DataPacket };
  lineage?: DataBlockLineage;
}

/** A block of a record type. Records have no version tree and no lineage. */
export interface RecordBlock extends BlockBase {
  payload: { kind: 'record'; data: unknown };
  lineage?: never;
}

/** The stored envelope: the payload is exactly one of packet or record. */
export type StoredDataBlock = PacketBlock | RecordBlock;

/** What `createBlank` is given. Id and time are caller-supplied so it stays pure. */
export interface BlankRequest {
  id: string;
  createdAt: string;
  name: string;
  /** Length in quarter notes (exact). Types without a length ignore it. */
  length: Rational;
  timeSignature?: string;
}

/** What the UI resolves into a thumbnail: an id, or an id with options. */
export type PreviewRef = string | { id: string; options?: Record<string, unknown> };

/**
 * How a type is heard. Both hooks are pure. `build` and its settings type are defined with the
 * audition milestone (R2); until then it is optional and untyped.
 */
export interface AuditionHooks {
  /** Why this particular block cannot be heard now (such as empty), or null. */
  refuse?(block: StoredDataBlock): string | null;
  build?(block: StoredDataBlock, settings: unknown): unknown;
}

export interface DuplicateRequest {
  id: string;
  createdAt: string;
}

/** What a composer browses by. Never decides a stored type (the stored `typeId` does). */
export type DataBlockFamily = 'pitch' | 'time' | 'placed' | 'composite' | 'generic';

/** A channel a type holds (design note channels, sections 2 and 5). */
export type DataBlockChannel = 'onset' | 'duration' | 'pitch' | 'amplitude' | 'timbre';

interface DataBlockTypeBase {
  /** Stable id, also what an input's `accepts` list names. */
  id: string;
  /** Wording in the picker. */
  label: string;
  /** For browsing and filtering only (W-61). */
  family: DataBlockFamily;
  /** The channels the type holds; empty for a type that holds none (values, generic lists). */
  channels: readonly DataBlockChannel[];
  createBlank(request: BlankRequest): StoredDataBlock;
  preview?: PreviewRef;
  editorId?: string;
  /**
   * The edit actions the inspector offers for this type (pure `(packet, context, params)` functions,
   * dataBlockOperators.ts). Types without any leave it absent and the inspector shows them disabled.
   */
  operators?: readonly Operator[];
  /** Absent means "no audition": `auditionSupport` reports `noAuditionReason` or a default. */
  audition?: AuditionHooks;
  noAuditionReason?: string;
  /**
   * A copy under a new id named "<name> (variation)" that shares no state with the original.
   * Default: packets go through `duplicateDataBlock` (provenance step, lineage derivedFrom),
   * records are a deep copy of the data with no lineage.
   */
  duplicate?(block: StoredDataBlock, request: DuplicateRequest): StoredDataBlock;
  /** Whether the block has nothing to use yet. Default: a packet with no items; a record is never empty. */
  isEmpty?(block: StoredDataBlock): boolean;
}

export interface PacketDataBlockType extends DataBlockTypeBase {
  payload: 'packet';
  /**
   * Whether a packet is this type. Used to choose a type when a node's packet is saved to the desk,
   * and to validate a block's packet against its stored type. Never used to infer a stored block's type.
   */
  accepts(packet: DataPacket): boolean;
}

export interface RecordDataBlockType extends DataBlockTypeBase {
  payload: 'record';
  /** Null when the data is well formed, otherwise why not. A missing reference is not malformed. */
  validate(data: unknown): string | null;
  /** Every reference the data holds, each under a stable slot. Feeds users. */
  refs?(data: unknown): SlotRef[];
  /** The data with every reference replaced by `fn(slot, ref)`; `null` clears it. */
  mapRefs?(data: unknown, fn: (slot: string, ref: Ref) => Ref | null): unknown;
}

export type DataBlockTypeDef = PacketDataBlockType | RecordDataBlockType;

const types = new Map<string, DataBlockTypeDef>();

/** Registers a type. A duplicate id throws. Returns a function that removes it again. */
export function registerDataBlockType(def: DataBlockTypeDef): () => void {
  if (types.has(def.id)) {
    throw new Error(`Data-block type "${def.id}" is already registered.`);
  }
  types.set(def.id, def);
  return () => {
    if (types.get(def.id) === def) {
      types.delete(def.id);
    }
  };
}

/** Every registered type, in registration order. */
export function dataBlockTypes(): readonly DataBlockTypeDef[] {
  return [...types.values()];
}

export function getDataBlockType(id: string): DataBlockTypeDef | undefined {
  return types.get(id);
}

/** The type of a block: the one its stored `typeId` names. */
export function dataBlockTypeOf(
  block: Pick<StoredDataBlock, 'typeId'>
): DataBlockTypeDef | undefined {
  return types.get(block.typeId);
}

/** The packet types that accept `packet`, in registration order. */
export function packetTypesAccepting(packet: DataPacket): PacketDataBlockType[] {
  return [...types.values()].filter(
    (def): def is PacketDataBlockType => def.payload === 'packet' && def.accepts(packet)
  );
}

/** Every registered type of a family, in registration order. Browsing only: it never decides a stored type. */
export function dataBlockTypesByFamily(family: DataBlockFamily): readonly DataBlockTypeDef[] {
  return dataBlockTypes().filter((def) => def.family === family);
}

/**
 * Chooses the type to store a node's packet under (W-61): the first matching NON-generic type, else
 * the first matching generic type (generic last, whatever the registering order), or undefined.
 * Only used at capture time; a stored `typeId` is never re-guessed.
 */
export function chooseTypeId(packet: DataPacket): string | undefined {
  const matches = packetTypesAccepting(packet);
  return (matches.find((def) => def.family !== 'generic') ?? matches[0])?.id;
}

export type AuditionSupport = { supported: true } | { supported: false; reason: string };

/** R3: whether a type can be heard, and when it cannot, why (Play shows the reason). */
export function auditionSupport(def: DataBlockTypeDef): AuditionSupport {
  return def.audition
    ? { supported: true }
    : { supported: false, reason: def.noAuditionReason ?? `${def.label} has no audition yet.` };
}

/** Why this block cannot be auditioned now (no audition for its type, or the type refuses it), or null. */
export function auditionRefusal(block: StoredDataBlock): string | null {
  const def = dataBlockTypeOf(block);
  if (!def) {
    return 'This data-block has no registered type.';
  }
  const support = auditionSupport(def);
  return support.supported ? (def.audition?.refuse?.(block) ?? null) : support.reason;
}

/** Null when the block is well formed for its stored type, otherwise why not. */
export function validateBlock(block: StoredDataBlock): string | null {
  const def = dataBlockTypeOf(block);
  if (!def) {
    return 'This data-block has no registered type.';
  }
  if (def.payload !== block.payload.kind) {
    return `A ${def.label} data-block holds a ${def.payload}, not a ${block.payload.kind}.`;
  }
  if (def.payload === 'packet' && block.payload.kind === 'packet') {
    return def.accepts(block.payload.packet) ? null : `The packet is not a ${def.label}.`;
  }
  if (def.payload === 'record' && block.payload.kind === 'record') {
    return def.validate(block.payload.data);
  }
  return null;
}

/** Whether the block has nothing to use yet, by its type (an unregistered type counts as empty). */
export function isBlockEmpty(block: StoredDataBlock): boolean {
  const def = dataBlockTypeOf(block);
  if (!def) {
    return true;
  }
  if (def.isEmpty) {
    return def.isEmpty(block);
  }
  return block.payload.kind === 'packet' ? block.payload.packet.items.length === 0 : false;
}

/** Whether a stored block holds a packet (a narrowing guard). */
export function isPacketBlock(block: StoredDataBlock): block is PacketBlock {
  return block.payload.kind === 'packet';
}

/**
 * Why the block cannot be placed on the canvas as a source, or null when it can. An empty block
 * publishes nothing for a downstream node to read, so it waits until it has content.
 */
export function makeSourceRefusal(block: StoredDataBlock): string | null {
  return isBlockEmpty(block)
    ? 'This data-block is empty, so a source made from it would publish nothing yet.'
    : null;
}

/** A copy of the block as "<name> (variation)": the type's `duplicate`, or the default for its payload. */
export function duplicateBlock(block: StoredDataBlock, request: DuplicateRequest): StoredDataBlock {
  const custom = dataBlockTypeOf(block)?.duplicate;
  if (custom) {
    return custom(block, request);
  }
  if (isPacketBlock(block)) {
    return duplicateDataBlock(block, request);
  }
  const { origin, note } = block;
  return {
    schemaVersion: DATA_BLOCK_SCHEMA_VERSION,
    id: request.id,
    typeId: block.typeId,
    name: `${block.name} (variation)`,
    ...(note === undefined ? {} : { note }),
    createdAt: request.createdAt,
    ...(origin === undefined ? {} : { origin: structuredClone(origin) }),
    payload: { kind: 'record', data: structuredClone(block.payload.data) },
  };
}

/** The references a block holds (none for a packet block or a type without `refs`). */
export function blockRefs(block: StoredDataBlock): SlotRef[] {
  const def = dataBlockTypeOf(block);
  return def?.payload === 'record' && def.refs && block.payload.kind === 'record'
    ? def.refs(block.payload.data)
    : [];
}

/**
 * Points the one reference `from` (told apart by slot) at `toId`, or clears it (`null`). This is the
 * ONE place a pinned `version` is dropped: a version id means nothing on a copy or another block.
 * A block whose type cannot map references is returned unchanged.
 */
export function repointBlockRef(
  block: StoredDataBlock,
  from: SlotRef,
  toId: string | null
): StoredDataBlock {
  const def = dataBlockTypeOf(block);
  if (def?.payload !== 'record' || !def.mapRefs || isPacketBlock(block)) {
    return block;
  }
  const data = def.mapRefs(block.payload.data, (slot, ref) =>
    slot === from.slot && ref.id === from.ref.id ? (toId === null ? null : { id: toId }) : ref
  );
  return { ...block, payload: { kind: 'record', data } };
}
