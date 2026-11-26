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
  OBJECT_TYPE_ID,
  TRACK_TYPE_ID,
  chainPlacement,
  collectionDataOf,
  createBlankCollection,
  createBlankObject,
  createBlankScene,
  createBlankTrack,
  objectChain,
  objectDataOf,
  sceneDataOf,
  trackDataOf,
  type CollectionData,
  type ModifierInstance,
  type ObjectData,
  type ObjectMapping,
  type RegisterMapping,
  type TrackData,
} from './sceneTypes';
import { layoutSubLanes } from './subLanes';

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

export type Blocks = readonly StoredDataBlock[];

export const fail = (error: string): SceneOpResult => ({ ok: false, error });
export const done = (blocks: StoredDataBlock[], created: string[] = []): SceneOpResult => ({
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

export function update(
  blocks: Blocks,
  id: string,
  change: (block: StoredDataBlock) => StoredDataBlock
): StoredDataBlock[] {
  return blocks.map((block) => (block.id === id ? change(block) : block));
}

export function mapData<T>(block: StoredDataBlock, change: (data: T) => T): StoredDataBlock {
  return block.payload.kind === 'record'
    ? ({
        ...block,
        payload: { kind: 'record', data: change(block.payload.data as T) },
      } as StoredDataBlock)
    : block;
}

export const ref = (id: string): Ref => ({ id });

/** Adds `memberId` to `collectionId`'s members (the end of the list). */
export function addMember(
  blocks: Blocks,
  collectionId: string,
  memberId: string
): StoredDataBlock[] {
  return update(blocks, collectionId, (block) =>
    mapData<CollectionData>(block, (data) => ({
      ...data,
      memberRefs: [...data.memberRefs, ref(memberId)],
    }))
  );
}

/** The collection that lists `id`, or undefined. */
export function collectionOf(blocks: Blocks, id: string): StoredDataBlock | undefined {
  return blocks.find((block) =>
    collectionDataOf(block)?.memberRefs.some((member) => member.id === id)
  );
}

/** Which collection an add goes to: `target` when it is a collection, else the scene's root. */
export function targetCollection(
  blocks: Blocks,
  sceneId: string,
  target: string | null
): string | null {
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

/**
 * The Track an add lands on (W-82): the selected Track; the Track of a selected object; else the first Track
 * of the selected collection (or the scene's root), made when it has none. Returns the Track id and the
 * blocks with that Track added when it had to be made.
 */
function trackForAdd(
  blocks: Blocks,
  env: OpEnv,
  sceneId: string,
  selectedId: string | null
): { trackId: string; blocks: StoredDataBlock[]; created: string[] } | null {
  const selected =
    selectedId === null ? undefined : blocks.find((block) => block.id === selectedId);
  if (selected && trackDataOf(selected)) {
    return { trackId: selected.id, blocks: [...blocks], created: [] };
  }
  const own = objectDataOf(selected)?.trackRef?.id;
  if (own !== undefined && trackDataOf(blocks.find((block) => block.id === own))) {
    return { trackId: own, blocks: [...blocks], created: [] };
  }
  const into = targetCollection(blocks, sceneId, selectedId);
  if (into === null) {
    return null;
  }
  const first = collectionDataOf(blocks.find((block) => block.id === into))?.memberRefs.find(
    (member) => trackDataOf(blocks.find((block) => block.id === member.id))
  );
  if (first) {
    return { trackId: first.id, blocks: [...blocks], created: [] };
  }
  const trackId = env.newId();
  const track = createBlankTrack({
    id: trackId,
    name: uniqueName(blocks, TRACK_TYPE_ID, 'Track'),
    createdAt: env.now,
    length: rational(4),
  });
  return { trackId, blocks: addMember(blocks, into, trackId).concat(track), created: [trackId] };
}

/**
 * An Empty object on a Track (one undo step, also when the Track is made; the object is `created[0]`): `selectedId` may be a Track, an
 * object (its own Track), a collection (its first Track, made when it has none) or null (the root's).
 */
export function addEmpty(
  blocks: Blocks,
  env: OpEnv,
  sceneId: string,
  selectedId: string | null
): SceneOpResult {
  const target = trackForAdd(blocks, env, sceneId, selectedId);
  if (target === null) {
    return fail('That scene has no root collection.');
  }
  const id = env.newId();
  const object = mapData<ObjectData>(
    createBlankObject({
      id,
      name: uniqueName(blocks, 'object', 'Empty'),
      createdAt: env.now,
      length: rational(4),
    }),
    (data) => ({ ...data, trackRef: ref(target.trackId) })
  );
  return done([...target.blocks, object], [id, ...target.created]);
}

/** An Empty placed under `parentId` (start 0, relative to it), on the parent's Track. */
export function addChildEmpty(
  blocks: Blocks,
  env: OpEnv,
  _sceneId: string,
  parentId: string
): SceneOpResult {
  const parent = blocks.find((block) => block.id === parentId);
  if (!objectDataOf(parent)) {
    return fail('Select an object to add a child to.');
  }
  const id = env.newId();
  const trackRef = objectDataOf(parent)?.trackRef ?? null;
  const created = mapData<ObjectData>(
    createBlankObject({
      id,
      name: uniqueName(blocks, 'object', 'Empty'),
      createdAt: env.now,
      length: rational(4),
    }),
    (data) => ({ ...data, parentRef: ref(parentId), trackRef })
  );
  // On the parent's Track (the Track reaches it). A parent no Track holds is a legacy direct listing.
  const into = trackRef === null ? collectionOf(blocks, parentId)?.id : undefined;
  return done(into ? addMember(blocks, into, id).concat(created) : [...blocks, created], [id]);
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

// ---- Object placement (W-82): objects on one Track may overlap; the Arranger draws sub-rows by itself ----

const blockMap = (blocks: Blocks) => new Map(blocks.map((block) => [block.id, block]));

const maxRational = (a: Rational, b: Rational) => (compareRational(a, b) >= 0 ? a : b);
const minRational = (a: Rational, b: Rational) => (compareRational(a, b) <= 0 ? a : b);

interface Span {
  start: Rational;
  end: Rational;
}

/** An object's world span, or null when its parent chain is circular or the object is gone. */
function worldSpan(blocks: Blocks, objectId: string): Span | null {
  const chain = objectChain(blockMap(blocks), objectId);
  if (chain === null || chain.length === 0) {
    return null;
  }
  const start = chainPlacement(chain).start;
  return { start, end: addRational(start, chain[0].data.timeSpan.duration) };
}

/** The ids sharing an object's row group: its Track's objects (an object no Track holds: its collection's). */
function peersOf(blocks: Blocks, objectId: string): string[] {
  const trackId = objectDataOf(blocks.find((block) => block.id === objectId))?.trackRef?.id;
  if (trackId !== undefined) {
    return objectsOnTrack(blocks, trackId);
  }
  const members = collectionDataOf(collectionOf(blocks, objectId))?.memberRefs ?? [];
  return members
    .map((member) => member.id)
    .filter((id) => objectDataOf(blocks.find((block) => block.id === id)));
}

/** The world spans of an object's peers (itself included), earliest first. */
function peerSpans(blocks: Blocks, objectId: string): (Span & { id: string })[] {
  return peersOf(blocks, objectId)
    .flatMap((id) => {
      const span = worldSpan(blocks, id);
      return span ? [{ id, ...span }] : [];
    })
    .sort((left, right) => compareRational(left.start, right.start));
}

/** The display sub-row of an object among its peers (automatic: start time, then id), or undefined. */
function ownSubLane(blocks: Blocks, objectId: string): number | undefined {
  return layoutSubLanes(peerSpans(blocks, objectId)).subLaneOf.get(objectId);
}

/** The earliest world start at or after `from` where `duration` fits between the (sorted) spans. */
function firstFreeStart(spans: readonly Span[], from: Rational, duration: Rational): Rational {
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
 * Start, duration and/or content offset of an object in exact quarter notes (the start is relative to
 * its parent); the duration must be above zero. Objects may overlap on a Track (W-82), so nothing is
 * refused for room.
 */
export function setTimeSpan(
  blocks: Blocks,
  id: string,
  span: { start?: Rational; duration?: Rational; contentOffset?: Rational }
): SceneOpResult {
  if (span.duration && span.duration.numerator <= 0) {
    return fail('A duration must be longer than zero.');
  }
  const data = objectDataOf(blocks.find((block) => block.id === id));
  if (!data) {
    return fail('Select an object first.');
  }
  const start = span.start ?? data.timeSpan.start;
  const duration = span.duration ?? data.timeSpan.duration;
  return editObject(blocks, id, (object) => ({
    ...object,
    timeSpan: { start, duration },
    contentOffset: span.contentOffset ?? object.contentOffset,
  }));
}

export function setMapping(blocks: Blocks, id: string, mapping: ObjectMapping): SceneOpResult {
  return editObject(blocks, id, (data) => ({ ...data, mapping }));
}

/** The register span (midicents, inclusive); low above high is refused, as validation does. */
export function setRegisterSpan(
  blocks: Blocks,
  id: string,
  lowMc: number,
  highMc: number
): SceneOpResult {
  if (!Number.isFinite(lowMc) || !Number.isFinite(highMc) || lowMc > highMc) {
    return fail('The low end of a register must not be above its high end.');
  }
  return editObject(blocks, id, (data) => ({ ...data, registerSpan: { lowMc, highMc } }));
}

export function setRegisterMapping(
  blocks: Blocks,
  id: string,
  registerMapping: RegisterMapping
): SceneOpResult {
  return editObject(blocks, id, (data) => ({ ...data, registerMapping }));
}

/** The primary data-block (null: Empty). */
export function setPrimaryData(blocks: Blocks, id: string, dataId: string | null): SceneOpResult {
  return editObject(blocks, id, (data) => ({
    ...data,
    primaryDataRef: dataId === null ? null : ref(dataId),
  }));
}

/** The parent object (null: none). Refuses itself and any parent that would make a cycle. */
export function setParent(blocks: Blocks, id: string, parentId: string | null): SceneOpResult {
  if (parentId !== null) {
    if (parentId === id) {
      return fail('An object cannot be its own parent.');
    }
    if (!objectDataOf(blocks.find((block) => block.id === parentId))) {
      return fail('A parent must be an object.');
    }
    const chain = objectChain(blockMap(blocks), parentId);
    if (chain === null || chain.some((link) => link.id === id)) {
      return fail('That would make a loop: the parent is already placed under this object.');
    }
  }
  return editObject(blocks, id, (data) => ({
    ...data,
    parentRef: parentId === null ? null : ref(parentId),
  }));
}

/** The modifiers of a copied object: the same settings, new ids. */
export const copyModifiers = (
  env: OpEnv,
  modifiers: readonly ModifierInstance[]
): ModifierInstance[] =>
  modifiers.map((modifier) => ({
    ...modifier,
    id: env.newId(),
    params: structuredClone(modifier.params),
    refs: { ...modifier.refs },
  }));

/**
 * A copy of an object on the same Track, at the first free space after it in time that fits it among
 * that Track's objects, with its own copy of the modifier stack. `independent` also
 * copies the data-block (named "<name> (copy)", unique per type, placed right after the original);
 * otherwise the copy shares the data-block (linked).
 */
function copyObject(
  blocks: Blocks,
  env: OpEnv,
  objectId: string,
  independent: boolean
): SceneOpResult {
  const source = blocks.find((block) => block.id === objectId);
  const data = objectDataOf(source);
  if (!source || !data) {
    return fail('Select an object first.');
  }
  const own = worldSpan(blocks, objectId);
  if (!own) {
    return fail('That object has no place in time.');
  }
  if (!peersOf(blocks, objectId).includes(objectId)) {
    return fail('No room here.');
  }
  // Only the sub-row the object is on counts (a parent and its children sit on other sub-rows).
  const layout = layoutSubLanes(peerSpans(blocks, objectId));
  const sameRow = peerSpans(blocks, objectId).filter(
    (peer) => layout.subLaneOf.get(peer.id) === layout.subLaneOf.get(objectId)
  );
  const free = firstFreeStart(sameRow, own.end, data.timeSpan.duration);
  const id = env.newId();
  const created = [id];
  let list: StoredDataBlock[] = [...blocks];
  let primaryDataRef = data.primaryDataRef;
  const original = data.primaryDataRef
    ? blocks.find((block) => block.id === data.primaryDataRef?.id)
    : undefined;
  if (independent && original) {
    const copyId = env.newId();
    const copy = duplicateBlock(original, { id: copyId, createdAt: env.now });
    const at = list.findIndex((block) => block.id === original.id);
    list.splice(at + 1, 0, {
      ...copy,
      name: uniqueName(blocks, original.typeId, `${original.name} (copy)`),
    });
    primaryDataRef = ref(copyId);
    created.push(copyId);
  } else if (independent) {
    primaryDataRef = null;
  }
  const placed = mapData<ObjectData>(
    {
      ...source,
      id,
      name: uniqueName(blocks, OBJECT_TYPE_ID, source.name),
      createdAt: env.now,
    },
    (object) => ({
      ...object,
      primaryDataRef,
      timeSpan: {
        start: addRational(object.timeSpan.start, subtractRational(free, own.start)),
        duration: object.timeSpan.duration,
      },
      modifiers: copyModifiers(env, object.modifiers),
    })
  );
  // The copy keeps the source's Track. Only a legacy direct listing needs a collection entry.
  list = list.map((block) =>
    collectionDataOf(block)?.memberRefs.some((member) => member.id === objectId)
      ? mapData<CollectionData>(block, (collection) => {
          const at = collection.memberRefs.findIndex((member) => member.id === objectId);
          const memberRefs = [...collection.memberRefs];
          memberRefs.splice(at + 1, 0, ref(id));
          return { ...collection, memberRefs };
        })
      : block
  );
  return done([...list, placed], created);
}

/** Duplicate Object (Blender's Shift+D): independent, with its own copy of the data-block. */
export const duplicateObject = (blocks: Blocks, env: OpEnv, objectId: string) =>
  copyObject(blocks, env, objectId, true);

/** Duplicate Linked (Blender's Alt+D): shares the data-block; the mapping and modifiers are its own. */
export const duplicateObjectLinked = (blocks: Blocks, env: OpEnv, objectId: string) =>
  copyObject(blocks, env, objectId, false);

/**
 * Free move (a body drag): the object goes to the RELATIVE start `relativeStart` (the same meaning as
 * `setTimeSpan`'s). Objects may overlap on a Track (W-82), so nothing is pushed or searched for; only the
 * world start is kept at or above 0.
 */
export function placeObjectNearest(
  blocks: Blocks,
  id: string,
  relativeStart: Rational
): SceneOpResult {
  const data = objectDataOf(blocks.find((block) => block.id === id));
  if (!data) {
    return fail('Select an object first.');
  }
  const own = worldSpan(blocks, id);
  if (!own) {
    return editObject(blocks, id, (object) => ({
      ...object,
      timeSpan: { ...object.timeSpan, start: relativeStart },
    }));
  }
  const desired = addRational(own.start, subtractRational(relativeStart, data.timeSpan.start));
  const landed = maxRational(desired, rational(0));
  return editObject(blocks, id, (object) => ({
    ...object,
    timeSpan: {
      ...object.timeSpan,
      start: addRational(object.timeSpan.start, subtractRational(landed, own.start)),
    },
  }));
}

/**
 * Drags the edge two touching objects of one Track share: the left object's end and the right
 * object's start move to `edgeWorld` (world quarter notes). One extends while the other trims, with the
 * W-74 left-edge rules for the right one (a Stretch object refits, any other keeps its data in place by
 * moving the content offset). Each keeps at least `minimum` (one beat: the caller passes it); the edge
 * is clamped.
 */
export function resizeSharedEdge(
  blocks: Blocks,
  leftId: string,
  rightId: string,
  edgeWorld: Rational,
  minimum: Rational
): SceneOpResult {
  const left = objectDataOf(blocks.find((block) => block.id === leftId));
  const right = objectDataOf(blocks.find((block) => block.id === rightId));
  if (!left || !right) {
    return fail('Select an object first.');
  }
  const leftSpan = worldSpan(blocks, leftId);
  const rightSpan = worldSpan(blocks, rightId);
  const sameGroup = peersOf(blocks, leftId).includes(rightId);
  if (
    !leftSpan ||
    !rightSpan ||
    !sameGroup ||
    compareRational(leftSpan.end, rightSpan.start) !== 0 ||
    ownSubLane(blocks, leftId) !== ownSubLane(blocks, rightId)
  ) {
    return fail('These objects do not touch.');
  }
  const earliest = addRational(leftSpan.start, minimum);
  const latest = subtractRational(rightSpan.end, minimum);
  if (compareRational(earliest, latest) > 0) {
    return fail('These objects are too short to move their edge.');
  }
  const landed = minRational(maxRational(edgeWorld, earliest), latest);
  const shift = subtractRational(landed, rightSpan.start);
  return done(
    blocks.map((block) => {
      if (block.id === leftId) {
        return mapData<ObjectData>(block, (object) => ({
          ...object,
          timeSpan: { ...object.timeSpan, duration: subtractRational(landed, leftSpan.start) },
        }));
      }
      if (block.id === rightId) {
        return mapData<ObjectData>(block, (object) => ({
          ...object,
          timeSpan: {
            start: addRational(object.timeSpan.start, shift),
            duration: subtractRational(rightSpan.end, landed),
          },
          contentOffset:
            object.mapping === 'stretch'
              ? object.contentOffset
              : addRational(object.contentOffset, shift),
        }));
      }
      return block;
    })
  );
}

/** Mute an object, a track or a collection. */
export function setMute(blocks: Blocks, id: string, mute: boolean): SceneOpResult {
  const block = blocks.find((candidate) => candidate.id === id);
  if (objectDataOf(block)) {
    return editObject(blocks, id, (data) => ({ ...data, mute }));
  }
  if (trackDataOf(block)) {
    return done(
      update(blocks, id, (target) => mapData<TrackData>(target, (data) => ({ ...data, mute })))
    );
  }
  if (collectionDataOf(block)) {
    return done(
      update(blocks, id, (target) => mapData<CollectionData>(target, (data) => ({ ...data, mute })))
    );
  }
  return fail('Only an object, a track or a collection can be muted.');
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

/**
 * Moves a collection into another collection, with its members' times. An object moves with
 * `moveObjectToTrack` (trackOps), never by collection.
 */
export function moveToCollection(blocks: Blocks, id: string, collectionId: string): SceneOpResult {
  const moved = blocks.find((block) => block.id === id);
  if (!collectionDataOf(moved)) {
    return fail('Only a collection can be moved into a collection.');
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
  kind: 'object' | 'collection' | 'track';
  /** A collection: how many items it lists directly (they move up). */
  members: number;
  /** An object: how many objects are placed under it (they keep their place). */
  children: number;
  /** A collection: the name of the collection its items move up to, or null. */
  movesTo: string | null;
  /** A track only: how many objects sit on it (deleted with it). */
  objects?: number;
} | null {
  const target = blocks.find((block) => block.id === id);
  const kind = objectDataOf(target)
    ? 'object'
    : collectionDataOf(target)
      ? 'collection'
      : trackDataOf(target)
        ? 'track'
        : null;
  if (!target || kind === null) {
    return null;
  }
  if (kind === 'track') {
    return {
      name: target.name,
      kind,
      members: 0,
      children: 0,
      movesTo: null,
      objects: objectsOnTrack(blocks, id).length,
    };
  }
  const members = collectionDataOf(target)?.memberRefs.length ?? 0;
  const children =
    kind === 'object'
      ? blocks.filter((block) => objectDataOf(block)?.parentRef?.id === id).length
      : 0;
  const movesTo = kind === 'collection' ? (collectionOf(blocks, id)?.name ?? null) : null;
  return { name: target.name, kind, members, children, movesTo };
}

/** The ids of the objects whose `trackRef` is `trackId`, in stored order. */
export function objectsOnTrack(blocks: Blocks, trackId: string): string[] {
  return blocks
    .filter((block) => objectDataOf(block)?.trackRef?.id === trackId)
    .map((block) => block.id);
}

/** `id` first, then (for a collection or track) everything listed under it, each once. */
function membersToDelete(blocks: Blocks, id: string): string[] {
  const out: string[] = [];
  const visit = (current: string) => {
    if (out.includes(current)) {
      return;
    }
    out.push(current);
    const block = blocks.find((candidate) => candidate.id === current);
    collectionDataOf(block)?.memberRefs.forEach((member) => visit(member.id));
    // A track deletes with its objects (they come after it, so they go first when reversed).
    if (trackDataOf(block)) {
      objectsOnTrack(blocks, current).forEach(visit);
    }
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
  if (!objectDataOf(target) && !collectionDataOf(target) && !trackDataOf(target)) {
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
  if (trackDataOf(target)) {
    // A track has no items to move up: it goes with its objects, as in deleteHierarchy.
    return deleteHierarchy(project, id);
  }
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

// ---- Modifiers (O3, W-72) ----

function editModifier(
  blocks: Blocks,
  objectId: string,
  modifierId: string,
  change: (modifier: ModifierInstance, all: ModifierInstance[]) => ModifierInstance[] | string
): SceneOpResult {
  const data = objectDataOf(blocks.find((block) => block.id === objectId));
  if (!data) {
    return fail('Select an object first.');
  }
  const target = data.modifiers.find((modifier) => modifier.id === modifierId);
  if (!target) {
    return fail('That modifier is gone.');
  }
  const next = change(target, data.modifiers);
  return typeof next === 'string'
    ? fail(next)
    : editObject(blocks, objectId, (object) => ({ ...object, modifiers: next }));
}

/** A new modifier at the BOTTOM of the stack (it runs last), with its defaults and empty references. */
export function addModifier(
  blocks: Blocks,
  env: OpEnv,
  objectId: string,
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
  const result = editObject(blocks, objectId, (object) => ({
    ...object,
    modifiers: [...object.modifiers, modifier],
  }));
  return result.ok ? { ...result, created: [id] } : result;
}

export function removeModifier(
  blocks: Blocks,
  objectId: string,
  modifierId: string
): SceneOpResult {
  return editModifier(blocks, objectId, modifierId, (_modifier, all) =>
    all.filter((modifier) => modifier.id !== modifierId)
  );
}

/** One place up or down in the stack. */
export function moveModifier(
  blocks: Blocks,
  objectId: string,
  modifierId: string,
  direction: 'up' | 'down'
): SceneOpResult {
  return editModifier(blocks, objectId, modifierId, (_modifier, all) => {
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
  modifierId: string,
  mute: boolean
): SceneOpResult {
  return editModifier(blocks, objectId, modifierId, (_modifier, all) =>
    all.map((modifier) => (modifier.id === modifierId ? { ...modifier, mute } : modifier))
  );
}

/** One setting of a modifier; the result must pass the modifier's own validation, else the reason. */
export function setModifierParam(
  blocks: Blocks,
  objectId: string,
  modifierId: string,
  key: string,
  value: unknown
): SceneOpResult {
  return editModifier(blocks, objectId, modifierId, (modifier, all) => {
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
  modifierId: string,
  slotName: string,
  blockId: string | null
): SceneOpResult {
  return editModifier(blocks, objectId, modifierId, (modifier, all) => {
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
 * Bakes ONE cycle of `toRun` over the object's data into a new Notes data-block named
 * "<data name> (applied)" (unique per type), placed after the data it came from, and points the
 * object at it. The baked packet is the stack's own packet (not the audible plan). The original
 * data-blocks stay untouched. `remaining` is what is left in the stack.
 */
function bake(
  blocks: Blocks,
  env: OpEnv,
  objectId: string,
  toRun: ModifierInstance[],
  remaining: ModifierInstance[],
  context: Pick<AuditionContext, 'pulseUnit'>
): SceneOpResult {
  const map = blockMap(blocks);
  const object = objectDataOf(map.get(objectId));
  const primary = object?.primaryDataRef ? map.get(object.primaryDataRef.id) : undefined;
  if (!object || !primary) {
    return fail('This object has no data to apply the modifiers to.');
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
  const pointed = editObject(withBaked, objectId, (entry) => ({
    ...entry,
    primaryDataRef: ref(id),
    modifiers: remaining,
  }));
  return pointed.ok ? { ...pointed, created: [id] } : pointed;
}

/**
 * Apply (Blender: applying a modifier that is not first ignores the stack order), allowed only on the
 * TOP modifier of the object. A muted top modifier is refused (turn it on first). The mapping and the
 * rest of the stack stay.
 */
export function applyModifier(
  blocks: Blocks,
  env: OpEnv,
  objectId: string,
  modifierId: string,
  context: Pick<AuditionContext, 'pulseUnit'> = defaultAuditionContext
): SceneOpResult {
  const data = objectDataOf(blocks.find((block) => block.id === objectId));
  if (!data) {
    return fail('Select an object first.');
  }
  if (!data.modifiers.some((modifier) => modifier.id === modifierId)) {
    return fail('That modifier is gone.');
  }
  const top = data.modifiers[0];
  if (top.id !== modifierId) {
    return fail('Apply the modifiers above it first.');
  }
  if (top.mute) {
    return fail('Turn the modifier on to apply it.');
  }
  return bake(blocks, env, objectId, [top], data.modifiers.slice(1), context);
}

/** Apply All: bakes the object's whole unmuted stack (muted ones are dropped) and clears the modifiers. */
export function applyAll(
  blocks: Blocks,
  env: OpEnv,
  objectId: string,
  context: Pick<AuditionContext, 'pulseUnit'> = defaultAuditionContext
): SceneOpResult {
  const data = objectDataOf(blocks.find((block) => block.id === objectId));
  if (!data) {
    return fail('Select an object first.');
  }
  if (data.modifiers.length === 0) {
    return fail('There are no modifiers to apply.');
  }
  const active = data.modifiers.filter((modifier) => !modifier.mute);
  if (active.length === 0) {
    return editObject(blocks, objectId, (entry) => ({ ...entry, modifiers: [] }));
  }
  return bake(blocks, env, objectId, active, [], context);
}
