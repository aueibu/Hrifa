import { derivation, derivedLineage } from '../dataBlock';
import { defaultAuditionContext } from '../dataBlocks/auditionPlans';
import { deleteBlockFromProject, type RefsProject } from '../dataBlocks/dataBlockRefs';
import {
  chooseTypeId,
  duplicateBlock,
  getDataBlockType,
  isPacketBlock,
  type AuditionContext,
  type PacketBlock,
  type Ref,
  type StoredDataBlock,
} from '../dataBlocks/registry';
import { NOTES_TYPE_ID } from '../dataBlocks/types/notes';
import {
  addRational,
  compareRational,
  rational,
  subtractRational,
  type Rational,
} from '../musicalTime';
import { getModifierDef, runModifierStack } from './modifiers';
import {
  collectionDataOf,
  createBlankCollection,
  createBlankObject,
  createBlankScene,
  blankStrip,
  chainPlacement,
  findStrip,
  objectDataOf,
  sceneDataOf,
  stripChain,
  stripWorldStart,
  type CollectionData,
  type ModifierInstance,
  type ObjectData,
  type ObjectMapping,
  type Strip,
  type StripParent,
} from './sceneTypes';

/**
 * The Outliner's edits as pure functions (workbench O2a): each takes the blocks and returns the next
 * blocks, with the ids it created, or a plain reason it refused. No React, no storage. The panel
 * applies a result through ONE undo-grouped `applyDataBlockList`, so one edit is one undo step.
 */

export interface OpEnv {
  newId(): string;
  /** ISO time stamped on created blocks. */
  now: string;
}

export type SceneOpResult =
  | { ok: true; blocks: StoredDataBlock[]; created: string[] }
  | { ok: false; error: string };

type Blocks = readonly StoredDataBlock[];

const fail = (error: string): SceneOpResult => ({ ok: false, error });
const done = (blocks: StoredDataBlock[], created: string[] = []): SceneOpResult => ({
  ok: true,
  blocks,
  created,
});

/** "Empty", then "Empty.001", "Empty.002" ... the first not already used by a block of `typeId`. */
export function uniqueName(blocks: Blocks, typeId: string, base: string): string {
  const used = new Set(blocks.filter((block) => block.typeId === typeId).map((b) => b.name));
  if (!used.has(base)) {
    return base;
  }
  for (let n = 1; ; n += 1) {
    const candidate = `${base}.${String(n).padStart(3, '0')}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }
}

function update(
  blocks: Blocks,
  id: string,
  change: (block: StoredDataBlock) => StoredDataBlock
): StoredDataBlock[] {
  return blocks.map((block) => (block.id === id ? change(block) : block));
}

function mapData<T>(block: StoredDataBlock, change: (data: T) => T): StoredDataBlock {
  return block.payload.kind === 'record'
    ? ({
        ...block,
        payload: { kind: 'record', data: change(block.payload.data as T) },
      } as StoredDataBlock)
    : block;
}

const ref = (id: string): Ref => ({ id });

/** Adds `memberId` to `collectionId`'s members (the end of the list). */
function addMember(blocks: Blocks, collectionId: string, memberId: string): StoredDataBlock[] {
  return update(blocks, collectionId, (block) =>
    mapData<CollectionData>(block, (data) => ({
      ...data,
      memberRefs: [...data.memberRefs, ref(memberId)],
    }))
  );
}

/** The collection that lists `id`, or undefined. */
function collectionOf(blocks: Blocks, id: string): StoredDataBlock | undefined {
  return blocks.find((block) =>
    collectionDataOf(block)?.memberRefs.some((member) => member.id === id)
  );
}

/** Which collection an add goes to: `target` when it is a collection, else the scene's root. */
function targetCollection(blocks: Blocks, sceneId: string, target: string | null): string | null {
  const targetBlock = target === null ? undefined : blocks.find((block) => block.id === target);
  if (targetBlock && collectionDataOf(targetBlock)) {
    return targetBlock.id;
  }
  return sceneDataOf(blocks.find((block) => block.id === sceneId))?.rootCollectionRef?.id ?? null;
}

/** A new scene with its own root collection. The scene is the first created id. */
export function createScene(blocks: Blocks, env: OpEnv): SceneOpResult {
  const sceneId = env.newId();
  const rootId = env.newId();
  const root = createBlankCollection({
    id: rootId,
    name: 'Scene Collection',
    createdAt: env.now,
    length: rational(4),
  });
  const scene = createBlankScene({
    id: sceneId,
    name: uniqueName(blocks, 'scene', 'Scene'),
    createdAt: env.now,
    length: rational(4),
  });
  const linked = mapData<{ rootCollectionRef: Ref | null; markers: unknown[] }>(scene, (data) => ({
    ...data,
    rootCollectionRef: ref(rootId),
  }));
  return done([...blocks, root, linked], [sceneId, rootId]);
}

/** An object block whose one strip has the id `stripId` (a blank object brings a placeholder id). */
function withStripId(block: StoredDataBlock, stripId: string): StoredDataBlock {
  return mapData<ObjectData>(block, (data) => ({
    ...data,
    strips: data.strips.map((strip, index) => (index === 0 ? { ...strip, id: stripId } : strip)),
  }));
}

/** An Empty object (ONE silent strip) in the selected collection (or the scene's root collection). */
export function addEmpty(
  blocks: Blocks,
  env: OpEnv,
  sceneId: string,
  collectionId: string | null
): SceneOpResult {
  const into = targetCollection(blocks, sceneId, collectionId);
  if (into === null) {
    return fail('That scene has no root collection.');
  }
  const id = env.newId();
  const object = withStripId(
    createBlankObject({
      id,
      name: uniqueName(blocks, 'object', 'Empty'),
      createdAt: env.now,
      length: rational(4),
    }),
    env.newId()
  );
  return done(addMember(blocks, into, id).concat(object), [id]);
}

/**
 * An Empty whose one strip is placed under the parent object's first strip (start 0, relative to it),
 * listed in the parent's collection.
 */
export function addChildEmpty(
  blocks: Blocks,
  env: OpEnv,
  sceneId: string,
  parentId: string
): SceneOpResult {
  const parent = blocks.find((block) => block.id === parentId);
  const parentData = objectDataOf(parent);
  if (!parentData) {
    return fail('Select an object to add a child to.');
  }
  const parentStrip = parentData.strips[0];
  if (!parentStrip) {
    return fail('That object has no strip to place this under.');
  }
  const into = collectionOf(blocks, parentId)?.id ?? targetCollection(blocks, sceneId, null);
  if (into === null) {
    return fail('That scene has no root collection.');
  }
  const id = env.newId();
  const stripId = env.newId();
  const created = mapData<ObjectData>(
    createBlankObject({
      id,
      name: uniqueName(blocks, 'object', 'Empty'),
      createdAt: env.now,
      length: rational(4),
    }),
    (data) => ({
      ...data,
      strips: [
        { ...blankStrip(stripId), parentStrip: { objectId: parentId, stripId: parentStrip.id } },
      ],
    })
  );
  return done(addMember(blocks, into, id).concat(created), [id]);
}

export function addCollection(
  blocks: Blocks,
  env: OpEnv,
  sceneId: string,
  collectionId: string | null
): SceneOpResult {
  const into = targetCollection(blocks, sceneId, collectionId);
  if (into === null) {
    return fail('That scene has no root collection.');
  }
  const id = env.newId();
  const created = createBlankCollection({
    id,
    name: uniqueName(blocks, 'collection', 'Collection'),
    createdAt: env.now,
    length: rational(4),
  });
  return done(addMember(blocks, into, id).concat(created), [id]);
}

export function renameBlock(blocks: Blocks, id: string, name: string): SceneOpResult {
  const trimmed = name.trim();
  if (trimmed === '') {
    return fail('A name cannot be empty.');
  }
  const target = blocks.find((block) => block.id === id);
  if (!target) {
    return fail('That item is gone.');
  }
  // Names stay unique per type after a rename too (Blender adds .001), so the Parent list never shows
  // two of the same name.
  const unique = uniqueName(
    blocks.filter((block) => block.id !== id),
    target.typeId,
    trimmed
  );
  return done(update(blocks, id, (block) => ({ ...block, name: unique })));
}

function editObject(
  blocks: Blocks,
  id: string,
  change: (data: ObjectData) => ObjectData
): SceneOpResult {
  if (!objectDataOf(blocks.find((block) => block.id === id))) {
    return fail('Select an object first.');
  }
  return done(update(blocks, id, (block) => mapData<ObjectData>(block, change)));
}

const GONE_STRIP = 'That strip is gone.';

/** Changes one strip of an object; `change` may return a reason instead (a refusal). */
function editStrip(
  blocks: Blocks,
  objectId: string,
  stripId: string,
  change: (strip: Strip, data: ObjectData) => Strip | string
): SceneOpResult {
  const data = objectDataOf(blocks.find((block) => block.id === objectId));
  if (!data) {
    return fail('Select an object first.');
  }
  const target = data.strips.find((strip) => strip.id === stripId);
  if (!target) {
    return fail(GONE_STRIP);
  }
  const next = change(target, data);
  if (typeof next === 'string') {
    return fail(next);
  }
  return editObject(blocks, objectId, (object) => ({
    ...object,
    strips: object.strips.map((strip) => (strip.id === stripId ? next : strip)),
  }));
}

// ---- Strip placement (W-75): no overlap in a row, measured in WORLD time ----

const NO_ROOM = 'No room here.';

const blockMap = (blocks: Blocks) => new Map(blocks.map((block) => [block.id, block]));

/** Every object record changed by `change`; every other block is left as it is. */
function mapObjects(
  blocks: Blocks,
  change: (objectId: string, data: ObjectData) => ObjectData
): StoredDataBlock[] {
  return blocks.map((block) =>
    objectDataOf(block) ? mapData<ObjectData>(block, (data) => change(block.id, data)) : block
  );
}
const maxRational = (a: Rational, b: Rational) => (compareRational(a, b) >= 0 ? a : b);
const minRational = (a: Rational, b: Rational) => (compareRational(a, b) <= 0 ? a : b);

/** A strip's world span, or null when its parent chain is circular or the strip is gone. */
function worldSpan(
  blocks: Blocks,
  objectId: string,
  stripId: string
): { start: Rational; end: Rational } | null {
  const chain = stripChain(blockMap(blocks), objectId, stripId);
  if (chain === null || chain.length === 0) {
    return null;
  }
  const start = chainPlacement(chain).start;
  return { start, end: addRational(start, chain[0].strip.duration) };
}

/** The world spans of an object's strips, except `exceptId`, earliest first. */
function rowSpans(
  blocks: Blocks,
  objectId: string,
  exceptId: string | null
): { id: string; start: Rational; end: Rational }[] {
  const data = objectDataOf(blocks.find((block) => block.id === objectId));
  return (data?.strips ?? [])
    .filter((strip) => strip.id !== exceptId)
    .flatMap((strip) => {
      const span = worldSpan(blocks, objectId, strip.id);
      return span ? [{ id: strip.id, ...span }] : [];
    })
    .sort((left, right) => compareRational(left.start, right.start));
}

/** Two spans overlap when they share time; touching (one ends where the other starts) is fine. */
const overlaps = (a: { start: Rational; end: Rational }, b: { start: Rational; end: Rational }) =>
  compareRational(a.start, b.end) < 0 && compareRational(b.start, a.end) < 0;

/** The earliest world start at or after `from` where `duration` fits between a row's other strips. */
function firstFreeStart(
  spans: readonly { start: Rational; end: Rational }[],
  from: Rational,
  duration: Rational
): Rational {
  let cursor = from;
  for (const span of spans) {
    if (compareRational(span.end, cursor) <= 0) {
      continue;
    }
    if (compareRational(subtractRational(span.start, cursor), duration) >= 0) {
      return cursor;
    }
    cursor = maxRational(cursor, span.end);
  }
  return cursor;
}

/**
 * How far a strip may move or grow in its row (S1 uses it to clamp a drag): the end of the neighbor
 * before it and the start of the neighbor after it, in world quarter notes (null: no neighbor on that
 * side). Null when the strip is gone or its parent chain is circular.
 */
export function stripRoom(
  blocks: Blocks,
  objectId: string,
  stripId: string
): { before: Rational | null; after: Rational | null } | null {
  const own = worldSpan(blocks, objectId, stripId);
  if (!own) {
    return null;
  }
  let before: Rational | null = null;
  let after: Rational | null = null;
  for (const span of rowSpans(blocks, objectId, stripId)) {
    if (compareRational(span.end, own.start) <= 0) {
      before = before === null ? span.end : maxRational(before, span.end);
    } else if (compareRational(span.start, own.end) >= 0) {
      after = after === null ? span.start : minRational(after, span.start);
    }
  }
  return { before, after };
}

/**
 * Start, duration and/or content offset of a strip in exact quarter notes (the start is relative to its
 * parent strip); the duration must be above zero. Refused with "No room here." when the new span would
 * overlap another strip of the same object (the Arranger clamps a drag first; typed values meet this).
 */
export function setTimeSpan(
  blocks: Blocks,
  objectId: string,
  stripId: string,
  span: { start?: Rational; duration?: Rational; contentOffset?: Rational }
): SceneOpResult {
  if (span.duration && span.duration.numerator <= 0) {
    return fail('A duration must be longer than zero.');
  }
  return editStrip(blocks, objectId, stripId, (strip) => {
    const next: Strip = {
      ...strip,
      start: span.start ?? strip.start,
      duration: span.duration ?? strip.duration,
      contentOffset: span.contentOffset ?? strip.contentOffset,
    };
    const was = worldSpan(blocks, objectId, stripId);
    if (was) {
      const start = addRational(was.start, subtractRational(next.start, strip.start));
      const placed = { start, end: addRational(start, next.duration) };
      if (rowSpans(blocks, objectId, stripId).some((other) => overlaps(placed, other))) {
        return NO_ROOM;
      }
    }
    return next;
  });
}

export function setMapping(
  blocks: Blocks,
  objectId: string,
  stripId: string,
  mapping: ObjectMapping
): SceneOpResult {
  return editStrip(blocks, objectId, stripId, (strip) => ({ ...strip, mapping }));
}

/** Mute one strip (the object's mute silences all of its strips). */
export function setStripMute(
  blocks: Blocks,
  objectId: string,
  stripId: string,
  mute: boolean
): SceneOpResult {
  return editStrip(blocks, objectId, stripId, (strip) => ({ ...strip, mute }));
}

/** The strip's data-block (null: a silent strip). */
export function setPrimaryData(
  blocks: Blocks,
  objectId: string,
  stripId: string,
  dataId: string | null
): SceneOpResult {
  return editStrip(blocks, objectId, stripId, (strip) => ({
    ...strip,
    dataRef: dataId === null ? null : ref(dataId),
  }));
}

/** The parent strip (null: none). Refuses itself and any parent that would make a cycle. */
export function setStripParent(
  blocks: Blocks,
  objectId: string,
  stripId: string,
  parent: StripParent | null
): SceneOpResult {
  if (parent !== null) {
    if (parent.objectId === objectId && parent.stripId === stripId) {
      return fail('A strip cannot be its own parent.');
    }
    if (!findStrip(blockMap(blocks), parent.objectId, parent.stripId)) {
      return fail('A parent must be a strip.');
    }
    const chain = stripChain(blockMap(blocks), parent.objectId, parent.stripId);
    if (
      chain === null ||
      chain.some((link) => link.objectId === objectId && link.strip.id === stripId)
    ) {
      return fail('That would make a loop: the parent is already placed under this strip.');
    }
  }
  return editStrip(blocks, objectId, stripId, (strip) => ({
    ...strip,
    parentStrip: parent === null ? null : { objectId: parent.objectId, stripId: parent.stripId },
  }));
}

/**
 * A new silent strip (no data, 4 quarters, Loop, no parent) in the first free space of the object's row
 * that fits it, counted from the scene start.
 */
export function addStrip(blocks: Blocks, env: OpEnv, objectId: string): SceneOpResult {
  if (!objectDataOf(blocks.find((block) => block.id === objectId))) {
    return fail('Select an object first.');
  }
  const id = env.newId();
  const strip = {
    ...blankStrip(id),
    start: firstFreeStart(rowSpans(blocks, objectId, null), rational(0), rational(4)),
  };
  const result = editObject(blocks, objectId, (object) => ({
    ...object,
    strips: [...object.strips, strip],
  }));
  return result.ok ? { ...result, created: [id] } : result;
}

/**
 * Deletes a strip. A strip placed under it keeps its place (it takes its world start) and becomes
 * unparented. The object stays, even with no strips left (a silent Empty).
 */
export function deleteStrip(blocks: Blocks, objectId: string, stripId: string): SceneOpResult {
  const data = objectDataOf(blocks.find((block) => block.id === objectId));
  if (!data) {
    return fail('Select an object first.');
  }
  if (!data.strips.some((strip) => strip.id === stripId)) {
    return fail(GONE_STRIP);
  }
  const worldStart = stripWorldStart(blocks, objectId, stripId);
  const placedUnder = (strip: Strip) =>
    strip.parentStrip?.objectId === objectId && strip.parentStrip.stripId === stripId;
  return done(
    mapObjects(blocks, (holderId, object) => ({
      ...object,
      strips: object.strips
        .filter((strip) => !(holderId === objectId && strip.id === stripId))
        .map((strip) =>
          placedUnder(strip)
            ? {
                ...strip,
                start: worldStart === null ? strip.start : addRational(strip.start, worldStart),
                parentStrip: null,
              }
            : strip
        ),
    }))
  );
}

/** The modifiers of a copied strip: the same settings, new ids. */
const copyModifiers = (env: OpEnv, modifiers: readonly ModifierInstance[]): ModifierInstance[] =>
  modifiers.map((modifier) => ({
    ...modifier,
    id: env.newId(),
    params: structuredClone(modifier.params),
    refs: { ...modifier.refs },
  }));

/**
 * A copy of a strip in the first free space after it that fits (the same row, the same parent), with
 * its own copy of the modifier stack. `independent` also copies the data-block (named "<name> (copy)",
 * unique per type, placed right after the original); otherwise the copy shares the data-block (linked).
 */
function copyStrip(
  blocks: Blocks,
  env: OpEnv,
  objectId: string,
  stripId: string,
  independent: boolean
): SceneOpResult {
  const data = objectDataOf(blocks.find((block) => block.id === objectId));
  if (!data) {
    return fail('Select an object first.');
  }
  const strip = data.strips.find((entry) => entry.id === stripId);
  if (!strip) {
    return fail(GONE_STRIP);
  }
  const own = worldSpan(blocks, objectId, stripId);
  if (!own) {
    return fail(NO_ROOM);
  }
  const free = firstFreeStart(rowSpans(blocks, objectId, null), own.end, strip.duration);
  const id = env.newId();
  const created = [id];
  let list: StoredDataBlock[] = [...blocks];
  let dataRef = strip.dataRef;
  const original = strip.dataRef
    ? blocks.find((block) => block.id === strip.dataRef?.id)
    : undefined;
  if (independent && original) {
    const copyId = env.newId();
    const copy = duplicateBlock(original, { id: copyId, createdAt: env.now });
    const at = list.findIndex((block) => block.id === original.id);
    list.splice(at + 1, 0, {
      ...copy,
      name: uniqueName(blocks, original.typeId, `${original.name} (copy)`),
    });
    dataRef = ref(copyId);
    created.push(copyId);
  } else if (independent) {
    dataRef = null;
  }
  const placed: Strip = {
    ...strip,
    id,
    dataRef,
    start: addRational(strip.start, subtractRational(free, own.start)),
    modifiers: copyModifiers(env, strip.modifiers),
  };
  list = update(list, objectId, (block) =>
    mapData<ObjectData>(block, (object) => {
      const at = object.strips.findIndex((entry) => entry.id === stripId);
      const strips = [...object.strips];
      strips.splice(at + 1, 0, placed);
      return { ...object, strips };
    })
  );
  return done(list, created);
}

/** Duplicate Strip (Blender's Shift+D): independent, with its own copy of the data-block. */
export const duplicateStrip = (blocks: Blocks, env: OpEnv, objectId: string, stripId: string) =>
  copyStrip(blocks, env, objectId, stripId, true);

/** Duplicate Linked (Blender's Alt+D): shares the data-block; the mapping and modifiers are its own. */
export const duplicateStripLinked = (
  blocks: Blocks,
  env: OpEnv,
  objectId: string,
  stripId: string
) => copyStrip(blocks, env, objectId, stripId, false);

/**
 * Moves a strip within its row to the RELATIVE start `start` (the same meaning as `setTimeSpan`'s). It
 * stops where it touches a neighbor and never pushes one; a move that cannot go anywhere changes nothing.
 */
export function moveStrip(
  blocks: Blocks,
  objectId: string,
  stripId: string,
  start: Rational
): SceneOpResult {
  return editStrip(blocks, objectId, stripId, (strip) => {
    const room = stripRoom(blocks, objectId, stripId);
    if (!room) {
      return { ...strip, start };
    }
    const delta = subtractRational(start, strip.start);
    const own = worldSpan(blocks, objectId, stripId);
    if (!own || delta.numerator === 0) {
      return strip;
    }
    let landed = addRational(own.start, delta);
    if (delta.numerator < 0 && room.before !== null) {
      landed = maxRational(landed, room.before);
    } else if (delta.numerator > 0 && room.after !== null) {
      landed = minRational(landed, subtractRational(room.after, strip.duration));
    }
    return { ...strip, start: addRational(strip.start, subtractRational(landed, own.start)) };
  });
}

/**
 * Moves a strip to another object's row at the same world start, keeping its data, mapping, modifiers
 * and parent. Refused with "No room here." when it would overlap a strip there. Strips placed under it
 * follow (their parent becomes the strip in its new object) and keep their world start. One result:
 * the caller applies it as one undo step. The strip keeps its id unless the target already uses it.
 */
export function moveStripToObject(
  blocks: Blocks,
  env: OpEnv,
  fromObjectId: string,
  stripId: string,
  toObjectId: string
): SceneOpResult {
  const from = objectDataOf(blocks.find((block) => block.id === fromObjectId));
  const to = objectDataOf(blocks.find((block) => block.id === toObjectId));
  if (!from || !to) {
    return fail('Select an object first.');
  }
  if (fromObjectId === toObjectId) {
    return fail('Choose another object to move the strip to.');
  }
  const strip = from.strips.find((entry) => entry.id === stripId);
  if (!strip) {
    return fail(GONE_STRIP);
  }
  const own = worldSpan(blocks, fromObjectId, stripId);
  if (!own || rowSpans(blocks, toObjectId, null).some((other) => overlaps(own, other))) {
    return fail(NO_ROOM);
  }
  const newId = to.strips.some((entry) => entry.id === stripId) ? env.newId() : stripId;
  const followed = (child: Strip): Strip =>
    child.parentStrip?.objectId === fromObjectId && child.parentStrip.stripId === stripId
      ? { ...child, parentStrip: { objectId: toObjectId, stripId: newId } }
      : child;
  return done(
    mapObjects(blocks, (holderId, object) => {
      let strips = object.strips.map(followed);
      if (holderId === fromObjectId) {
        strips = strips.filter((entry) => entry.id !== stripId);
      } else if (holderId === toObjectId) {
        strips = [...strips, { ...followed(strip), id: newId }];
      }
      return { ...object, strips };
    })
  );
}

/**
 * Drags the edge two touching strips share (W-75): the left strip's end and the right strip's start move
 * to `edge` (world quarter notes). One extends while the other trims, with the W-74 left-edge rules for
 * the right strip (a Stretch strip refits, any other keeps its data in place by moving the content
 * offset). Each strip keeps at least `minimum` (one beat: the caller passes it); the edge is clamped.
 */
export function resizeSharedEdge(
  blocks: Blocks,
  objectId: string,
  leftStripId: string,
  rightStripId: string,
  edge: Rational,
  minimum: Rational
): SceneOpResult {
  const data = objectDataOf(blocks.find((block) => block.id === objectId));
  if (!data) {
    return fail('Select an object first.');
  }
  const left = data.strips.find((strip) => strip.id === leftStripId);
  const right = data.strips.find((strip) => strip.id === rightStripId);
  if (!left || !right) {
    return fail(GONE_STRIP);
  }
  const leftSpan = worldSpan(blocks, objectId, leftStripId);
  const rightSpan = worldSpan(blocks, objectId, rightStripId);
  if (!leftSpan || !rightSpan || compareRational(leftSpan.end, rightSpan.start) !== 0) {
    return fail('These strips do not touch.');
  }
  const earliest = addRational(leftSpan.start, minimum);
  const latest = subtractRational(rightSpan.end, minimum);
  if (compareRational(earliest, latest) > 0) {
    return fail('These strips are too short to move their edge.');
  }
  const landed = minRational(maxRational(edge, earliest), latest);
  const shift = subtractRational(landed, rightSpan.start);
  return done(
    update(blocks, objectId, (block) =>
      mapData<ObjectData>(block, (object) => ({
        ...object,
        strips: object.strips.map((strip) => {
          if (strip.id === leftStripId) {
            return { ...strip, duration: subtractRational(landed, leftSpan.start) };
          }
          if (strip.id === rightStripId) {
            return {
              ...strip,
              start: addRational(strip.start, shift),
              duration: subtractRational(rightSpan.end, landed),
              contentOffset:
                strip.mapping === 'stretch'
                  ? strip.contentOffset
                  : addRational(strip.contentOffset, shift),
            };
          }
          return strip;
        }),
      }))
    )
  );
}

/** Mute an object or a collection. */
export function setMute(blocks: Blocks, id: string, mute: boolean): SceneOpResult {
  const block = blocks.find((candidate) => candidate.id === id);
  if (objectDataOf(block)) {
    return editObject(blocks, id, (data) => ({ ...data, mute }));
  }
  if (collectionDataOf(block)) {
    return done(
      update(blocks, id, (target) => mapData<CollectionData>(target, (data) => ({ ...data, mute })))
    );
  }
  return fail('Only an object or a collection can be muted.');
}

/** Every collection id under `id` (itself included), each once. */
function collectionTree(blocks: Blocks, id: string): Set<string> {
  const found = new Set<string>();
  const visit = (current: string) => {
    if (found.has(current)) {
      return;
    }
    const data = collectionDataOf(blocks.find((block) => block.id === current));
    if (!data) {
      return;
    }
    found.add(current);
    data.memberRefs.forEach((member) => visit(member.id));
  };
  visit(id);
  return found;
}

/** Moves an object or collection to another collection (membership only: times stay as they are). */
export function moveToCollection(blocks: Blocks, id: string, collectionId: string): SceneOpResult {
  const moved = blocks.find((block) => block.id === id);
  if (!objectDataOf(moved) && !collectionDataOf(moved)) {
    return fail('Only an object or a collection can be moved.');
  }
  if (!collectionDataOf(blocks.find((block) => block.id === collectionId))) {
    return fail('Move it into a collection.');
  }
  if (collectionTree(blocks, id).has(collectionId)) {
    return fail('A collection cannot be moved into itself.');
  }
  const without = blocks.map((block) =>
    collectionDataOf(block)?.memberRefs.some((member) => member.id === id)
      ? mapData<CollectionData>(block, (data) => ({
          ...data,
          memberRefs: data.memberRefs.filter((member) => member.id !== id),
        }))
      : block
  );
  return done(addMember(without, collectionId, id));
}

/** What a delete will do, in numbers (the confirm line). */
export function deleteSummary(
  blocks: Blocks,
  id: string
): {
  name: string;
  kind: 'object' | 'collection';
  /** A collection: how many items it lists directly (they move up). */
  members: number;
  /** An object: how many objects have a strip placed under it (the strips keep their place). */
  children: number;
  /** A collection: the name of the collection its items move up to, or null. */
  movesTo: string | null;
} | null {
  const target = blocks.find((block) => block.id === id);
  const kind = objectDataOf(target) ? 'object' : collectionDataOf(target) ? 'collection' : null;
  if (!target || kind === null) {
    return null;
  }
  const members = collectionDataOf(target)?.memberRefs.length ?? 0;
  const children =
    kind === 'object'
      ? blocks.filter((block) =>
          objectDataOf(block)?.strips.some((strip) => strip.parentStrip?.objectId === id)
        ).length
      : 0;
  const movesTo = kind === 'collection' ? (collectionOf(blocks, id)?.name ?? null) : null;
  return { name: target.name, kind, members, children, movesTo };
}

/** `id` first, then (for a collection) everything listed under it, each once. */
function membersToDelete(blocks: Blocks, id: string): string[] {
  const out: string[] = [];
  const visit = (current: string) => {
    if (out.includes(current)) {
      return;
    }
    out.push(current);
    collectionDataOf(blocks.find((block) => block.id === current))?.memberRefs.forEach((member) =>
      visit(member.id)
    );
  };
  visit(id);
  return out;
}

/**
 * Delete through the EXISTING path (`deleteBlockFromProject`): children keep their place, slots that
 * held the block are blanked. A collection also deletes what it lists (Blender's Delete Hierarchy;
 * no command offers it yet). One call, one result: the panel applies it as a single undo step.
 */
export function deleteHierarchy(project: RefsProject, id: string): RefsProject {
  const target = project.dataBlocks.find((block) => block.id === id);
  if (!objectDataOf(target) && !collectionDataOf(target)) {
    return project;
  }
  // Members before the collection: each removal sees the full list, so a child keeps its world place.
  return membersToDelete(project.dataBlocks, id)
    .reverse()
    .reduce((next, doomedId) => deleteBlockFromProject(next, doomedId), project);
}

/**
 * Delete (Blender's plain Delete, `editors/outliner/editing.rst`): the selected block only. An
 * object's children keep their place (the delete hook). A collection's items move up into the
 * collection that listed it, in its place, before it is removed; nothing else is deleted.
 */
export function deleteSelected(project: RefsProject, id: string): RefsProject {
  const target = project.dataBlocks.find((block) => block.id === id);
  if (!objectDataOf(target) && !collectionDataOf(target)) {
    return project;
  }
  let next = project;
  const members = collectionDataOf(target)?.memberRefs;
  const parent = members ? collectionOf(project.dataBlocks, id) : undefined;
  if (members && parent) {
    next = {
      ...project,
      dataBlocks: update(project.dataBlocks, parent.id, (block) =>
        mapData<CollectionData>(block, (data) => ({
          ...data,
          memberRefs: data.memberRefs
            .flatMap((entry) => (entry.id === id ? members : [entry]))
            .filter(
              (entry, index, all) => all.findIndex((other) => other.id === entry.id) === index
            ),
        }))
      ),
    };
  }
  return deleteBlockFromProject(next, id);
}

// ---- Modifiers (O3, W-72; on the strip since W-75) ----

function editModifier(
  blocks: Blocks,
  objectId: string,
  stripId: string,
  modifierId: string,
  change: (modifier: ModifierInstance, all: ModifierInstance[]) => ModifierInstance[] | string
): SceneOpResult {
  return editStrip(blocks, objectId, stripId, (strip) => {
    const target = strip.modifiers.find((modifier) => modifier.id === modifierId);
    if (!target) {
      return 'That modifier is gone.';
    }
    const next = change(target, strip.modifiers);
    return typeof next === 'string' ? next : { ...strip, modifiers: next };
  });
}

/** A new modifier at the BOTTOM of the stack (it runs last), with its defaults and empty references. */
export function addModifier(
  blocks: Blocks,
  env: OpEnv,
  objectId: string,
  stripId: string,
  type: string
): SceneOpResult {
  const def = getModifierDef(type);
  if (!def) {
    return fail('That modifier does not exist.');
  }
  const id = env.newId();
  const modifier: ModifierInstance = {
    id,
    type,
    mute: false,
    params: def.defaults(),
    refs: Object.fromEntries(def.refSlots.map((slot) => [slot.slot, null])),
  };
  const result = editStrip(blocks, objectId, stripId, (strip) => ({
    ...strip,
    modifiers: [...strip.modifiers, modifier],
  }));
  return result.ok ? { ...result, created: [id] } : result;
}

export function removeModifier(
  blocks: Blocks,
  objectId: string,
  stripId: string,
  modifierId: string
): SceneOpResult {
  return editModifier(blocks, objectId, stripId, modifierId, (_modifier, all) =>
    all.filter((modifier) => modifier.id !== modifierId)
  );
}

/** One place up or down in the stack. */
export function moveModifier(
  blocks: Blocks,
  objectId: string,
  stripId: string,
  modifierId: string,
  direction: 'up' | 'down'
): SceneOpResult {
  return editModifier(blocks, objectId, stripId, modifierId, (_modifier, all) => {
    const index = all.findIndex((modifier) => modifier.id === modifierId);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= all.length) {
      return direction === 'up' ? 'It is already at the top.' : 'It is already at the bottom.';
    }
    const next = [...all];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
}

export function setModifierMute(
  blocks: Blocks,
  objectId: string,
  stripId: string,
  modifierId: string,
  mute: boolean
): SceneOpResult {
  return editModifier(blocks, objectId, stripId, modifierId, (_modifier, all) =>
    all.map((modifier) => (modifier.id === modifierId ? { ...modifier, mute } : modifier))
  );
}

/** One setting of a modifier; the result must pass the modifier's own validation, else the reason. */
export function setModifierParam(
  blocks: Blocks,
  objectId: string,
  stripId: string,
  modifierId: string,
  key: string,
  value: unknown
): SceneOpResult {
  return editModifier(blocks, objectId, stripId, modifierId, (modifier, all) => {
    const def = getModifierDef(modifier.type);
    if (!def) {
      return 'That modifier does not exist.';
    }
    if (!(key in def.defaults())) {
      return 'That modifier has no such setting.';
    }
    const params = { ...modifier.params, [key]: value };
    const problem = def.validateParams(params);
    if (problem !== null) {
      return problem;
    }
    return all.map((other) => (other.id === modifierId ? { ...other, params } : other));
  });
}

/** Points a modifier's reference slot at a block of an accepted type (null blanks it). */
export function setModifierRef(
  blocks: Blocks,
  objectId: string,
  stripId: string,
  modifierId: string,
  slotName: string,
  blockId: string | null
): SceneOpResult {
  return editModifier(blocks, objectId, stripId, modifierId, (modifier, all) => {
    const slot = getModifierDef(modifier.type)?.refSlots.find((entry) => entry.slot === slotName);
    if (!slot) {
      return 'That modifier has no such reference.';
    }
    if (blockId !== null) {
      const target = blocks.find((block) => block.id === blockId);
      if (!target) {
        return 'That data-block is gone.';
      }
      if (!slot.accepts.includes(target.typeId)) {
        const labels = slot.accepts.map((id) => getDataBlockType(id)?.label ?? id).join(' or ');
        return `${slot.label} must be a ${labels} data-block.`;
      }
    }
    return all.map((other) =>
      other.id === modifierId
        ? { ...other, refs: { ...other.refs, [slotName]: blockId === null ? null : ref(blockId) } }
        : other
    );
  });
}

/**
 * Bakes ONE cycle of `toRun` over the strip's data into a new Notes data-block named
 * "<data name> (applied)" (unique per type), placed after the data it came from, and points the
 * strip at it. The baked packet is the stack's own packet (not the audible plan). The original
 * data-blocks stay untouched. `remaining` is what is left in the stack.
 */
function bake(
  blocks: Blocks,
  env: OpEnv,
  objectId: string,
  stripId: string,
  toRun: ModifierInstance[],
  remaining: ModifierInstance[],
  context: Pick<AuditionContext, 'pulseUnit'>
): SceneOpResult {
  const map = blockMap(blocks);
  const strip = objectDataOf(map.get(objectId))?.strips.find((entry) => entry.id === stripId);
  const primary = strip?.dataRef ? map.get(strip.dataRef.id) : undefined;
  if (!strip || !primary) {
    return fail('This strip has no data to apply the modifiers to.');
  }
  const result = runModifierStack(primary, toRun, map, context);
  if (!result.ok) {
    return fail(result.problems[0].text);
  }
  const packet = structuredClone(result.packet);
  const typeId = chooseTypeId(packet);
  const def = typeId === undefined ? undefined : getDataBlockType(typeId);
  if (typeId !== NOTES_TYPE_ID || !def) {
    return fail('The modifiers did not produce Notes, so nothing was baked.');
  }
  const id = env.newId();
  const blank = def.createBlank({
    id,
    name: uniqueName(blocks, typeId, `${primary.name} (applied)`),
    createdAt: env.now,
    length: rational(4),
  });
  if (!isPacketBlock(blank) || !isPacketBlock(primary)) {
    return fail('The modifiers did not produce Notes, so nothing was baked.');
  }
  const baked: PacketBlock = {
    ...blank,
    payload: { kind: 'packet', packet },
    origin: { nodeInstance: objectId },
    lineage: derivedLineage(id, env.now, 'apply-modifiers', derivation(primary, 'apply-modifiers')),
  };
  const at = blocks.findIndex((block) => block.id === primary.id);
  const withBaked = [...blocks.slice(0, at + 1), baked, ...blocks.slice(at + 1)];
  const pointed = editStrip(withBaked, objectId, stripId, (entry) => ({
    ...entry,
    dataRef: ref(id),
    modifiers: remaining,
  }));
  return pointed.ok ? { ...pointed, created: [id] } : pointed;
}

/**
 * Apply (Blender: applying a modifier that is not first ignores the stack order), allowed only on the
 * TOP modifier of the strip. A muted top modifier is refused (turn it on first). The mapping and the
 * rest of the stack stay; other strips are untouched.
 */
export function applyModifier(
  blocks: Blocks,
  env: OpEnv,
  objectId: string,
  stripId: string,
  modifierId: string,
  context: Pick<AuditionContext, 'pulseUnit'> = defaultAuditionContext
): SceneOpResult {
  const data = objectDataOf(blocks.find((block) => block.id === objectId));
  if (!data) {
    return fail('Select an object first.');
  }
  const strip = data.strips.find((entry) => entry.id === stripId);
  if (!strip) {
    return fail(GONE_STRIP);
  }
  if (!strip.modifiers.some((modifier) => modifier.id === modifierId)) {
    return fail('That modifier is gone.');
  }
  const top = strip.modifiers[0];
  if (top.id !== modifierId) {
    return fail('Apply the modifiers above it first.');
  }
  if (top.mute) {
    return fail('Turn the modifier on to apply it.');
  }
  return bake(blocks, env, objectId, stripId, [top], strip.modifiers.slice(1), context);
}

/** Apply All: bakes the strip's whole unmuted stack (muted ones are dropped) and clears the modifiers. */
export function applyAll(
  blocks: Blocks,
  env: OpEnv,
  objectId: string,
  stripId: string,
  context: Pick<AuditionContext, 'pulseUnit'> = defaultAuditionContext
): SceneOpResult {
  const data = objectDataOf(blocks.find((block) => block.id === objectId));
  if (!data) {
    return fail('Select an object first.');
  }
  const strip = data.strips.find((entry) => entry.id === stripId);
  if (!strip) {
    return fail(GONE_STRIP);
  }
  if (strip.modifiers.length === 0) {
    return fail('There are no modifiers to apply.');
  }
  const active = strip.modifiers.filter((modifier) => !modifier.mute);
  if (active.length === 0) {
    return editStrip(blocks, objectId, stripId, (entry) => ({ ...entry, modifiers: [] }));
  }
  return bake(blocks, env, objectId, stripId, active, [], context);
}
