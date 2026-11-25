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
 * A modifier on a strip (O3, W-72; on the strip since W-75). `type` is a registered modifier id
 * (`scene/modifiers`), `params` its settings, and `refs` its references to other data-blocks by slot
 * name (a Pitch set for Snap, Harmonize and Melodicize); a blank slot is null. The slot is the key
 * `strip:<stripId>:modifier:<id>:<slot>` in the object's references, so a referenced block counts the
 * object as a user and a delete blanks just that slot (the modifier stays).
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

/** A strip's parent: another strip, named by its object and its id (strip ids are unique per object). */
export interface StripParent {
  objectId: string;
  stripId: string;
}

/**
 * One placement of content in time inside an object (workbench S0, W-75): Blender's NLA strip. Embedded
 * in the object record, NOT a data-block. Its data reference and modifier references count as users
 * (slots `strip:<id>:data`, `strip:<id>:modifier:<modifierId>:<slot>`, and `strip:<id>:parent` for the
 * parent's object), so a referenced block counts the object as a user and a delete blanks just that slot.
 */
export interface Strip {
  /** Unique within its object. */
  id: string;
  /** The data-block this strip plays, or null (a silent strip). */
  dataRef: Ref | null;
  /**
   * Relative to the parent strip's world start (or to the scene start with no parent), in exact quarter
   * notes; `duration` is above zero.
   */
  start: Rational;
  duration: Rational;
  mapping: ObjectMapping;
  /**
   * How far into the data (one cycle, after the modifier stack) the strip's own start falls, in exact
   * quarter notes (O2d, W-74). Loop: the cycle grid is anchored `-offset` mod cycle length from the
   * start. One-shot: the first `offset` quarters are skipped (a negative offset is leading silence).
   * Stretch ignores it.
   */
  contentOffset: Rational;
  modifiers: ModifierInstance[];
  /** Silences just this strip (the object's mute silences all of its strips). */
  mute: boolean;
  /** The strip this one is placed under, or null (a root-level strip). */
  parentStrip: StripParent | null;
}

export interface ObjectData {
  /** Stored and validated, NOT applied yet (what it does to notes outside it is undecided). */
  registerSpan: { lowMc: number; highMc: number };
  /** Silences every strip. */
  mute: boolean;
  /** Zero strips is a silent Empty. */
  strips: Strip[];
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
/** A silent strip: no data, start 0, 4 quarters, Loop, no modifiers, no parent. */
export const blankStrip = (id: string): Strip => ({
  id,
  dataRef: null,
  start: rational(0),
  duration: rational(4),
  mapping: 'loop',
  contentOffset: rational(0),
  modifiers: [],
  mute: false,
  parentStrip: null,
});

/** An Empty object: the whole register and ONE silent strip. */
export const blankObjectData = (stripId = 'strip-1'): ObjectData => ({
  registerSpan: { lowMc: 0, highMc: 12700 },
  mute: false,
  strips: [blankStrip(stripId)],
});

export const createBlankScene = (request: BlankRequest) =>
  recordBlock(request, SCENE_TYPE_ID, blankSceneData());
export const createBlankCollection = (request: BlankRequest) =>
  recordBlock(request, COLLECTION_TYPE_ID, blankCollectionData());
export const createBlankObject = (request: BlankRequest) =>
  recordBlock(request, OBJECT_TYPE_ID, blankObjectData());

/** A strip with the object that holds it. */
export interface PlacedStrip {
  objectId: string;
  strip: Strip;
}

/** One strip's key across objects (strip ids are unique per object only). */
export const stripKey = (objectId: string, stripId: string) => `${objectId}\u0000${stripId}`;

/** The strip an object plays first, or undefined (an object with no strips is a silent Empty). */
export const firstStripOf = (data: ObjectData): Strip | undefined => data.strips[0];

/** A strip of an object, or undefined. */
export function findStrip(
  byId: ReadonlyMap<string, StoredDataBlock>,
  objectId: string,
  stripId: string
): Strip | undefined {
  return objectDataOf(byId.get(objectId))?.strips.find((strip) => strip.id === stripId);
}

/**
 * The strips from `objectId`/`stripId` up through its parent strips, the strip itself first, or null
 * when the parent chain is circular. A parent that is missing (object or strip gone) ends the chain
 * (the strip is then a root). An empty list means the strip itself is missing.
 */
export function stripChain(
  byId: ReadonlyMap<string, StoredDataBlock>,
  objectId: string,
  stripId: string
): PlacedStrip[] | null {
  const chain: PlacedStrip[] = [];
  const seen = new Set<string>();
  let current: StripParent | null = { objectId, stripId };
  while (current !== null) {
    const key = stripKey(current.objectId, current.stripId);
    if (seen.has(key)) {
      return null;
    }
    seen.add(key);
    const strip = findStrip(byId, current.objectId, current.stripId);
    if (!strip) {
      break;
    }
    chain.push({ objectId: current.objectId, strip });
    current = strip.parentStrip;
  }
  return chain;
}

/** World start of a chain (sum of the relative starts), and the tightest end bound up the chain. */
export function chainPlacement(chain: readonly { strip: Strip }[]): {
  start: Rational;
  bound: Rational;
} {
  let start = rational(0);
  let bound: Rational | null = null;
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const { strip } = chain[index];
    start = addRational(start, strip.start);
    const end = addRational(start, strip.duration);
    bound = bound === null || compareRational(end, bound) < 0 ? end : bound;
  }
  return { start, bound: bound ?? rational(0) };
}

/** The world start of a strip (the parent chain's relative starts summed), or null when circular or gone. */
export function stripWorldStart(
  blocks: readonly StoredDataBlock[],
  objectId: string,
  stripId: string
): Rational | null {
  const chain = stripChain(new Map(blocks.map((block) => [block.id, block])), objectId, stripId);
  return chain === null || chain.length === 0 ? null : chainPlacement(chain).start;
}

const STRIP_SLOT_PREFIX = 'strip:';
/** The reference slots of a strip, stable under its id. */
export const stripDataSlot = (stripId: string) => `${STRIP_SLOT_PREFIX}${stripId}:data`;
export const stripParentSlot = (stripId: string) => `${STRIP_SLOT_PREFIX}${stripId}:parent`;
const stripModifierSlot = (stripId: string, modifierId: string, slot: string) =>
  `${STRIP_SLOT_PREFIX}${stripId}:${modifierSlot(modifierId, slot)}`;

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

function isModifierList(modifiers: unknown): boolean {
  return (
    Array.isArray(modifiers) &&
    modifiers.every(
      (modifier) =>
        isRecordOf(modifier) &&
        typeof modifier.id === 'string' &&
        typeof modifier.type === 'string' &&
        typeof modifier.mute === 'boolean' &&
        isRecordOf(modifier.params) &&
        isRecordOf(modifier.refs) &&
        Object.values(modifier.refs).every(isNullableRef)
    ) &&
    new Set(modifiers.map((modifier: { id: string }) => modifier.id)).size === modifiers.length
  );
}

function validateStrip(strip: unknown): string | null {
  if (!isRecordOf(strip) || typeof strip.id !== 'string' || strip.id === '') {
    return 'A strip has an id.';
  }
  if (!isRationalValue(strip.start) || !isRationalValue(strip.duration)) {
    return 'A strip has a start and a duration in exact quarter notes.';
  }
  if (strip.duration.numerator <= 0) {
    return 'A strip lasts longer than zero.';
  }
  if (!isRationalValue(strip.contentOffset)) {
    return 'A strip content offset is an exact quarter-note amount.';
  }
  if (!isNullableRef(strip.dataRef)) {
    return 'A strip data is a reference or blank.';
  }
  if (!MAPPINGS.includes(strip.mapping as ObjectMapping)) {
    return 'A strip maps its data as loop, stretch or one-shot.';
  }
  if (typeof strip.mute !== 'boolean') {
    return 'A strip has a mute flag.';
  }
  const parent = strip.parentStrip;
  if (
    parent !== null &&
    !(
      isRecordOf(parent) &&
      typeof parent.objectId === 'string' &&
      parent.objectId !== '' &&
      typeof parent.stripId === 'string' &&
      parent.stripId !== ''
    )
  ) {
    return 'A strip parent is another strip or blank.';
  }
  return isModifierList(strip.modifiers) ? null : 'A strip holds a list of modifiers.';
}

function validateObjectData(data: unknown): string | null {
  if (!isRecordOf(data)) {
    return 'An object holds placement data.';
  }
  const { registerSpan, strips } = data;
  if (
    !isRecordOf(registerSpan) ||
    !Number.isFinite(registerSpan.lowMc) ||
    !Number.isFinite(registerSpan.highMc) ||
    (registerSpan.lowMc as number) > (registerSpan.highMc as number)
  ) {
    return 'An object has a register span with the low pitch at or below the high pitch.';
  }
  if (typeof data.mute !== 'boolean') {
    return 'An object has a mute flag.';
  }
  if (!Array.isArray(strips)) {
    return 'An object holds a list of strips.';
  }
  for (const strip of strips) {
    const problem = validateStrip(strip);
    if (problem !== null) {
      return problem;
    }
  }
  const ids = strips.map((strip: { id: string }) => strip.id);
  return new Set(ids).size === ids.length ? null : 'An object lists each strip id once.';
}

const NO_AUDITION =
  'Play the scene instead; a scene, object or collection has no sound of its own.';

/**
 * Deleting an object that strips are placed under: each such strip keeps its place by taking its WORLD
 * start as its own start, then loses the parent (W-68 row 6, W-75 rows 6 and 7). Runs before the slot is
 * blanked, while the deleted block is still in `blocks`.
 */
function objectRefDeleted(
  data: unknown,
  slot: string,
  deleted: StoredDataBlock,
  blocks: readonly StoredDataBlock[]
): unknown {
  const object = data as ObjectData;
  const child = object.strips.find((strip) => stripParentSlot(strip.id) === slot);
  if (!child?.parentStrip) {
    return data;
  }
  const parentWorldStart = stripWorldStart(blocks, deleted.id, child.parentStrip.stripId);
  if (parentWorldStart === null) {
    return data;
  }
  return {
    ...object,
    strips: object.strips.map((strip) =>
      strip === child ? { ...strip, start: addRational(strip.start, parentWorldStart) } : strip
    ),
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
      refs: (data): SlotRef[] =>
        (data as ObjectData).strips.flatMap((strip) => [
          ...(strip.dataRef === null
            ? []
            : [{ slot: stripDataSlot(strip.id), ref: strip.dataRef }]),
          ...(strip.parentStrip === null
            ? []
            : [{ slot: stripParentSlot(strip.id), ref: { id: strip.parentStrip.objectId } }]),
          ...strip.modifiers.flatMap((modifier) =>
            Object.entries(modifier.refs).flatMap(([slot, ref]) =>
              ref === null ? [] : [{ slot: stripModifierSlot(strip.id, modifier.id, slot), ref }]
            )
          ),
        ]),
      mapRefs: (data, fn) => {
        const object = data as ObjectData;
        return {
          ...object,
          strips: object.strips.map((strip) => {
            // A parent is a strip of another object: a mapped null unparents it, and a remap onto a
            // different object cannot name a strip there, so it unparents too.
            const parentRef =
              strip.parentStrip === null
                ? null
                : fn(stripParentSlot(strip.id), { id: strip.parentStrip.objectId });
            return {
              ...strip,
              dataRef: strip.dataRef === null ? null : fn(stripDataSlot(strip.id), strip.dataRef),
              parentStrip:
                strip.parentStrip !== null && parentRef?.id === strip.parentStrip.objectId
                  ? strip.parentStrip
                  : null,
              // A mapped null clears the slot; the modifier itself stays.
              modifiers: strip.modifiers.map((modifier) => ({
                ...modifier,
                refs: Object.fromEntries(
                  Object.entries(modifier.refs).map(([slot, ref]) => [
                    slot,
                    ref === null ? null : fn(stripModifierSlot(strip.id, modifier.id, slot), ref),
                  ])
                ),
              })),
            };
          }),
        };
      },
      onRefDeleted: objectRefDeleted,
    }),
  ];
  return () => removers.forEach((remove) => remove());
}
