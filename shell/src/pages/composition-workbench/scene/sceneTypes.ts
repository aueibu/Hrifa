import {
  DATA_BLOCK_SCHEMA_VERSION,
  registerDataBlockType,
  type BlankRequest,
  type Ref,
  type RecordBlock,
  type SlotRef,
  type StoredDataBlock,
} from '../dataBlocks/registry';
import { addRational, compareRational, rational, type Rational } from '../musicalTime';

/**
 * The scene, object and collection record types (workbench O1; W-66). Records only: the data holds
 * references under stable slots, so users, unlink, remap and delete-blanking come from the registry.
 * Pure: no React, no storage. The evaluator (`evaluateScene.ts`) is what turns a scene into sound.
 */

export const SCENE_TYPE_ID = 'scene';
export const OBJECT_TYPE_ID = 'object';
export const COLLECTION_TYPE_ID = 'collection';

export type ObjectMapping = 'loop' | 'stretch' | 'one-shot';

/**
 * A modifier on an object (O3, W-72). `type` is a registered modifier id (`scene/modifiers`),
 * `params` its settings, and `refs` its references to other data-blocks by slot name (a Pitch set
 * for Snap, Harmonize and Melodicize); a blank slot is null. The slot is the key
 * `modifier:<id>:<slot>` in the object's references, so a referenced block counts the object as a
 * user and a delete blanks just that slot (the modifier stays).
 */
export interface ModifierInstance {
  id: string;
  type: string;
  mute: boolean;
  params: Record<string, unknown>;
  refs: Record<string, Ref | null>;
}

const MODIFIER_SLOT_PREFIX = 'modifier:';
const modifierSlot = (modifierId: string, slot: string) =>
  `${MODIFIER_SLOT_PREFIX}${modifierId}:${slot}`;

export interface SceneData {
  rootCollectionRef: Ref | null;
  /** Reserved (validated as an array, nothing uses it yet). */
  markers: unknown[];
}

export interface CollectionData {
  /** Objects or collections, each at most once. */
  memberRefs: Ref[];
  mute: boolean;
}

export interface ObjectData {
  /** The object this one is placed relative to, or null (a root-level object). */
  parentRef: Ref | null;
  /** `start` is relative to the parent's world start (or to the scene start with no parent). */
  timeSpan: { start: Rational; duration: Rational };
  /** Stored and validated, NOT applied yet (what it does to notes outside it is undecided). */
  registerSpan: { lowMc: number; highMc: number };
  primaryDataRef: Ref | null;
  mapping: ObjectMapping;
  modifiers: ModifierInstance[];
  mute: boolean;
}

const MAPPINGS: readonly ObjectMapping[] = ['loop', 'stretch', 'one-shot'];

function isRecordOf(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRef(value: unknown): value is Ref {
  return (
    isRecordOf(value) &&
    typeof value.id === 'string' &&
    value.id !== '' &&
    (value.version === undefined || typeof value.version === 'string')
  );
}

function isNullableRef(value: unknown): boolean {
  return value === null || isRef(value);
}

function isRationalValue(value: unknown): value is Rational {
  return (
    isRecordOf(value) &&
    Number.isSafeInteger(value.numerator) &&
    Number.isSafeInteger(value.denominator) &&
    (value.denominator as number) > 0
  );
}

function recordBlock(
  request: BlankRequest,
  typeId: string,
  data: SceneData | CollectionData | ObjectData
): RecordBlock {
  return {
    schemaVersion: DATA_BLOCK_SCHEMA_VERSION,
    id: request.id,
    typeId,
    name: request.name,
    createdAt: request.createdAt,
    payload: { kind: 'record', data },
  };
}

/** The data of a block of `typeId`, or null when it is another type or not a record. */
export function recordDataOf<T>(block: StoredDataBlock | undefined, typeId: string): T | null {
  return block !== undefined && block.typeId === typeId && block.payload.kind === 'record'
    ? (block.payload.data as T)
    : null;
}

export const sceneDataOf = (block: StoredDataBlock | undefined) =>
  recordDataOf<SceneData>(block, SCENE_TYPE_ID);
export const collectionDataOf = (block: StoredDataBlock | undefined) =>
  recordDataOf<CollectionData>(block, COLLECTION_TYPE_ID);
export const objectDataOf = (block: StoredDataBlock | undefined) =>
  recordDataOf<ObjectData>(block, OBJECT_TYPE_ID);

export const blankSceneData = (): SceneData => ({ rootCollectionRef: null, markers: [] });
export const blankCollectionData = (): CollectionData => ({ memberRefs: [], mute: false });
/** An Empty object: start 0, 4 quarters, the whole register, Loop, no data (it is silent). */
export const blankObjectData = (): ObjectData => ({
  parentRef: null,
  timeSpan: { start: rational(0), duration: rational(4) },
  registerSpan: { lowMc: 0, highMc: 12700 },
  primaryDataRef: null,
  mapping: 'loop',
  modifiers: [],
  mute: false,
});

export const createBlankScene = (request: BlankRequest) =>
  recordBlock(request, SCENE_TYPE_ID, blankSceneData());
export const createBlankCollection = (request: BlankRequest) =>
  recordBlock(request, COLLECTION_TYPE_ID, blankCollectionData());
export const createBlankObject = (request: BlankRequest) =>
  recordBlock(request, OBJECT_TYPE_ID, blankObjectData());

/**
 * The objects from `blockId` up through its parent refs, the block itself first, or null when the
 * parent chain is circular. A parent that is missing or not an object ends the chain (the reference is
 * blank or dangling: the object is then a root).
 */
export function objectChain(
  byId: ReadonlyMap<string, StoredDataBlock>,
  blockId: string
): { id: string; data: ObjectData }[] | null {
  const chain: { id: string; data: ObjectData }[] = [];
  const seen = new Set<string>();
  let currentId: string | null = blockId;
  while (currentId !== null) {
    if (seen.has(currentId)) {
      return null;
    }
    seen.add(currentId);
    const data = objectDataOf(byId.get(currentId));
    if (!data) {
      break;
    }
    chain.push({ id: currentId, data });
    currentId = data.parentRef?.id ?? null;
  }
  return chain;
}

/** World start of a chain (sum of the relative starts), and the tightest end bound up the chain. */
export function chainPlacement(chain: readonly { data: ObjectData }[]): {
  start: Rational;
  bound: Rational;
} {
  let start = rational(0);
  let bound: Rational | null = null;
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const { timeSpan } = chain[index].data;
    start = addRational(start, timeSpan.start);
    const end = addRational(start, timeSpan.duration);
    bound = bound === null || compareRational(end, bound) < 0 ? end : bound;
  }
  return { start, bound: bound ?? rational(0) };
}

/** The world start of an object (the parent chain's relative starts summed), or null when circular. */
export function objectWorldStart(
  blocks: readonly StoredDataBlock[],
  objectId: string
): Rational | null {
  const chain = objectChain(new Map(blocks.map((block) => [block.id, block])), objectId);
  return chain === null || chain.length === 0 ? null : chainPlacement(chain).start;
}

function validateSceneData(data: unknown): string | null {
  if (!isRecordOf(data) || !isNullableRef(data.rootCollectionRef) || !Array.isArray(data.markers)) {
    return 'A scene holds a root collection reference (or none) and a list of markers.';
  }
  return null;
}

function validateCollectionData(data: unknown): string | null {
  if (
    !isRecordOf(data) ||
    typeof data.mute !== 'boolean' ||
    !Array.isArray(data.memberRefs) ||
    !data.memberRefs.every(isRef)
  ) {
    return 'A collection holds a list of member references and a mute flag.';
  }
  const ids = (data.memberRefs as Ref[]).map((ref) => ref.id);
  return new Set(ids).size === ids.length ? null : 'A collection lists each member once.';
}

function validateObjectData(data: unknown): string | null {
  if (!isRecordOf(data)) {
    return 'An object holds placement data.';
  }
  const { timeSpan, registerSpan } = data;
  if (
    !isRecordOf(timeSpan) ||
    !isRationalValue(timeSpan.start) ||
    !isRationalValue(timeSpan.duration)
  ) {
    return 'An object has a start and a duration in exact quarter notes.';
  }
  if (timeSpan.duration.numerator <= 0) {
    return 'An object lasts longer than zero.';
  }
  if (
    !isRecordOf(registerSpan) ||
    !Number.isFinite(registerSpan.lowMc) ||
    !Number.isFinite(registerSpan.highMc) ||
    (registerSpan.lowMc as number) > (registerSpan.highMc as number)
  ) {
    return 'An object has a register span with the low pitch at or below the high pitch.';
  }
  if (!isNullableRef(data.parentRef) || !isNullableRef(data.primaryDataRef)) {
    return 'An object parent and data are references or blank.';
  }
  if (!MAPPINGS.includes(data.mapping as ObjectMapping)) {
    return 'An object maps its data as loop, stretch or one-shot.';
  }
  if (typeof data.mute !== 'boolean') {
    return 'An object has a mute flag.';
  }
  const modifiers = data.modifiers;
  if (
    !Array.isArray(modifiers) ||
    !modifiers.every(
      (modifier) =>
        isRecordOf(modifier) &&
        typeof modifier.id === 'string' &&
        typeof modifier.type === 'string' &&
        typeof modifier.mute === 'boolean' &&
        isRecordOf(modifier.params) &&
        isRecordOf(modifier.refs) &&
        Object.values(modifier.refs).every(isNullableRef)
    ) ||
    new Set(modifiers.map((modifier: { id: string }) => modifier.id)).size !== modifiers.length
  ) {
    return 'An object holds a list of modifiers.';
  }
  return null;
}

const NO_AUDITION =
  'Play the scene instead; a scene, object or collection has no sound of its own.';

/**
 * Deleting an object that others are placed under: each child keeps its place by taking its WORLD
 * start as its own start, then loses the parent (W-68, row 6). Runs before the slot is blanked, while
 * the deleted block is still in `blocks`.
 */
function objectRefDeleted(
  data: unknown,
  slot: string,
  deleted: StoredDataBlock,
  blocks: readonly StoredDataBlock[]
): unknown {
  const object = data as ObjectData;
  if (slot !== 'parent') {
    return data;
  }
  const chain = objectChain(new Map(blocks.map((block) => [block.id, block])), deleted.id);
  if (chain === null || chain.length === 0) {
    return data;
  }
  const parentWorldStart = chainPlacement(chain).start;
  return {
    ...object,
    timeSpan: {
      ...object.timeSpan,
      start: addRational(object.timeSpan.start, parentWorldStart),
    },
  };
}

/** Registers scene, collection and object; returns the removers. Called by `dataBlocks/types`. */
export function registerSceneTypes(): () => void {
  const removers = [
    registerDataBlockType({
      id: SCENE_TYPE_ID,
      label: 'Scene',
      family: 'composite',
      channels: [],
      payload: 'record',
      noAuditionReason: NO_AUDITION,
      validate: validateSceneData,
      createBlank: createBlankScene,
      refs: (data): SlotRef[] => {
        const root = (data as SceneData).rootCollectionRef;
        return root === null ? [] : [{ slot: 'root', ref: root }];
      },
      mapRefs: (data, fn) => {
        const scene = data as SceneData;
        return {
          ...scene,
          rootCollectionRef:
            scene.rootCollectionRef === null ? null : fn('root', scene.rootCollectionRef),
        };
      },
    }),
    registerDataBlockType({
      id: COLLECTION_TYPE_ID,
      label: 'Collection',
      family: 'composite',
      channels: [],
      payload: 'record',
      noAuditionReason: NO_AUDITION,
      validate: validateCollectionData,
      createBlank: createBlankCollection,
      refs: (data): SlotRef[] =>
        (data as CollectionData).memberRefs.map((ref) => ({ slot: `member:${ref.id}`, ref })),
      mapRefs: (data, fn) => {
        const collection = data as CollectionData;
        const memberRefs: Ref[] = [];
        for (const ref of collection.memberRefs) {
          const next = fn(`member:${ref.id}`, ref);
          // A remap onto a member already listed would repeat it, which `validate` rejects (and
          // the desk would then drop the whole collection on reload): keep the first listing.
          if (next !== null && !memberRefs.some((kept) => kept.id === next.id)) {
            memberRefs.push(next);
          }
        }
        return { ...collection, memberRefs };
      },
    }),
    registerDataBlockType({
      id: OBJECT_TYPE_ID,
      label: 'Object',
      family: 'placed',
      channels: [],
      payload: 'record',
      noAuditionReason: NO_AUDITION,
      validate: validateObjectData,
      createBlank: createBlankObject,
      refs: (data): SlotRef[] => {
        const object = data as ObjectData;
        return [
          ...(object.parentRef === null ? [] : [{ slot: 'parent', ref: object.parentRef }]),
          ...(object.primaryDataRef === null ? [] : [{ slot: 'data', ref: object.primaryDataRef }]),
          ...object.modifiers.flatMap((modifier) =>
            Object.entries(modifier.refs).flatMap(([slot, ref]) =>
              ref === null ? [] : [{ slot: modifierSlot(modifier.id, slot), ref }]
            )
          ),
        ];
      },
      mapRefs: (data, fn) => {
        const object = data as ObjectData;
        return {
          ...object,
          parentRef: object.parentRef === null ? null : fn('parent', object.parentRef),
          primaryDataRef: object.primaryDataRef === null ? null : fn('data', object.primaryDataRef),
          // A mapped null clears the slot; the modifier itself stays.
          modifiers: object.modifiers.map((modifier) => ({
            ...modifier,
            refs: Object.fromEntries(
              Object.entries(modifier.refs).map(([slot, ref]) => [
                slot,
                ref === null ? null : fn(modifierSlot(modifier.id, slot), ref),
              ])
            ),
          })),
        };
      },
      onRefDeleted: objectRefDeleted,
    }),
  ];
  return () => removers.forEach((remove) => remove());
}
