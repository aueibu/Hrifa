import { duplicateBlock, type StoredDataBlock } from '../dataBlocks/registry';
import { rational } from '../musicalTime';
import {
  addMember,
  collectionOf,
  copyModifiers,
  done,
  fail,
  mapData,
  objectsOnTrack,
  ref,
  targetCollection,
  uniqueName,
  update,
  type Blocks,
  type OpEnv,
  type SceneOpResult,
} from './sceneOps';
import {
  OBJECT_TYPE_ID,
  TRACK_TYPE_ID,
  collectionDataOf,
  createBlankObject,
  createBlankTrack,
  objectDataOf,
  trackDataOf,
  type CollectionData,
  type ObjectData,
  type TrackData,
} from './sceneTypes';

/**
 * Track ops (TK1b-2, W-82), pure like `sceneOps`. A Collection lists Tracks and sub-collections; a Track
 * holds Objects only through `ObjectData.trackRef` (the one truth, never listed by the Track). Objects on
 * one Track may overlap, so nothing here clamps or searches for a free slot.
 */

/** A new Track at the end of the target collection (the scene's root when none is given). */
export function addTrack(
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
  const created = createBlankTrack({
    id,
    name: uniqueName(blocks, TRACK_TYPE_ID, 'Track'),
    createdAt: env.now,
    length: rational(4),
  });
  return done(addMember(blocks, into, id).concat(created), [id]);
}

/** An Empty object on a Track. It is not listed by any collection: the Track reaches it. */
export function addEmptyOnTrack(blocks: Blocks, env: OpEnv, trackId: string): SceneOpResult {
  if (!trackDataOf(blocks.find((block) => block.id === trackId))) {
    return fail('Select a track to add an object to.');
  }
  const id = env.newId();
  const object = mapData<ObjectData>(
    createBlankObject({
      id,
      name: uniqueName(blocks, OBJECT_TYPE_ID, 'Empty'),
      createdAt: env.now,
      length: rational(4),
    }),
    (data) => ({ ...data, trackRef: ref(trackId) })
  );
  return done([...blocks, object], [id]);
}

/**
 * Puts an object on a Track: start, name, data and modifiers are kept, the stored `lane` is cleared, and
 * any direct listing in a collection (the old shape) is removed so it is reached only through the Track.
 * Overlap is allowed. Moving to the Track it is already on changes nothing.
 */
export function moveObjectToTrack(
  blocks: Blocks,
  objectId: string,
  trackId: string
): SceneOpResult {
  const data = objectDataOf(blocks.find((block) => block.id === objectId));
  if (!data) {
    return fail('Only an object can be moved onto a track.');
  }
  if (!trackDataOf(blocks.find((block) => block.id === trackId))) {
    return fail('Move it onto a track.');
  }
  if (data.trackRef?.id === trackId) {
    return done(blocks as StoredDataBlock[]);
  }
  return done(
    blocks.map((block) => {
      if (block.id === objectId) {
        return mapData<ObjectData>(block, (object) => {
          const { lane: _lane, ...rest } = object;
          return { ...rest, trackRef: ref(trackId) };
        });
      }
      return collectionDataOf(block)?.memberRefs.some((member) => member.id === objectId)
        ? mapData<CollectionData>(block, (collection) => ({
            ...collection,
            memberRefs: collection.memberRefs.filter((member) => member.id !== objectId),
          }))
        : block;
    })
  );
}

/** Moves a Track (with its objects, through `trackRef`) to the end of another collection's list. */
export function moveTrackToCollection(
  blocks: Blocks,
  trackId: string,
  collectionId: string
): SceneOpResult {
  if (!trackDataOf(blocks.find((block) => block.id === trackId))) {
    return fail('Only a track can be moved this way.');
  }
  if (!collectionDataOf(blocks.find((block) => block.id === collectionId))) {
    return fail('Move it into a collection.');
  }
  const without = blocks.map((block) =>
    collectionDataOf(block)?.memberRefs.some((member) => member.id === trackId)
      ? mapData<CollectionData>(block, (collection) => ({
          ...collection,
          memberRefs: collection.memberRefs.filter((member) => member.id !== trackId),
        }))
      : block
  );
  return done(addMember(without, collectionId, trackId));
}

export function setTrackMute(blocks: Blocks, trackId: string, mute: boolean): SceneOpResult {
  if (!trackDataOf(blocks.find((block) => block.id === trackId))) {
    return fail('Select a track first.');
  }
  return done(
    update(blocks, trackId, (block) => mapData<TrackData>(block, (data) => ({ ...data, mute })))
  );
}

/**
 * Moves a Track or sub-collection to `toIndex` inside its collection's list (the index is clamped).
 * Staying where it is returns the same blocks.
 */
export function reorderMember(
  blocks: Blocks,
  collectionId: string,
  memberId: string,
  toIndex: number
): SceneOpResult {
  const collection = collectionDataOf(blocks.find((block) => block.id === collectionId));
  const member = blocks.find((block) => block.id === memberId);
  if (!collection) {
    return fail('Select a collection first.');
  }
  if (!trackDataOf(member) && !collectionDataOf(member)) {
    return fail('Only a track or a collection can be reordered.');
  }
  const from = collection.memberRefs.findIndex((entry) => entry.id === memberId);
  if (from < 0) {
    return fail('That collection does not list it.');
  }
  const to = Math.min(Math.max(Math.trunc(toIndex), 0), collection.memberRefs.length - 1);
  if (to === from) {
    return done(blocks as StoredDataBlock[]);
  }
  const memberRefs = [...collection.memberRefs];
  const [moved] = memberRefs.splice(from, 1);
  memberRefs.splice(to, 0, moved);
  return done(
    update(blocks, collectionId, (block) =>
      mapData<CollectionData>(block, (data) => ({ ...data, memberRefs }))
    )
  );
}

/**
 * Duplicate Track: a new Track right after the original in the same collection, holding a copy of every
 * object on it (same start, own data-block copy named "<name> (copy)", own modifier ids). A copied
 * object whose parent is also copied points at the parent's copy; a parent outside the Track stays.
 */
export function duplicateTrack(blocks: Blocks, env: OpEnv, trackId: string): SceneOpResult {
  const source = blocks.find((block) => block.id === trackId);
  if (!source || !trackDataOf(source)) {
    return fail('Select a track first.');
  }
  const holder = collectionOf(blocks, trackId);
  if (!holder) {
    return fail('That track is in no collection.');
  }
  const newTrackId = env.newId();
  const created = [newTrackId];
  const sourceIds = objectsOnTrack(blocks, trackId);
  const copyIds = new Map(sourceIds.map((id) => [id, env.newId()]));
  const list: StoredDataBlock[] = [...blocks];
  const copies: StoredDataBlock[] = [];
  for (const objectId of sourceIds) {
    const object = blocks.find((block) => block.id === objectId)!;
    const data = objectDataOf(object)!;
    const copyId = copyIds.get(objectId)!;
    created.push(copyId);
    let primaryDataRef = data.primaryDataRef;
    const original = data.primaryDataRef
      ? blocks.find((block) => block.id === data.primaryDataRef?.id)
      : undefined;
    if (original) {
      const dataId = env.newId();
      const dataCopy = duplicateBlock(original, { id: dataId, createdAt: env.now });
      const name = uniqueName(list, original.typeId, `${original.name} (copy)`);
      const at = list.findIndex((block) => block.id === original.id);
      list.splice(at + 1, 0, { ...dataCopy, name });
      primaryDataRef = ref(dataId);
      created.push(dataId);
    } else {
      primaryDataRef = null;
    }
    copies.push(
      mapData<ObjectData>(
        {
          ...object,
          id: copyId,
          name: uniqueName(blocks, OBJECT_TYPE_ID, object.name),
          createdAt: env.now,
        },
        (entry) => ({
          ...entry,
          primaryDataRef,
          trackRef: ref(newTrackId),
          parentRef:
            entry.parentRef && copyIds.has(entry.parentRef.id)
              ? ref(copyIds.get(entry.parentRef.id)!)
              : entry.parentRef,
          modifiers: copyModifiers(env, entry.modifiers),
        })
      )
    );
  }
  const track: StoredDataBlock = {
    ...source,
    id: newTrackId,
    name: uniqueName(blocks, TRACK_TYPE_ID, source.name),
    createdAt: env.now,
  };
  const next = list.map((block) =>
    block.id === holder.id
      ? mapData<CollectionData>(block, (collection) => {
          const at = collection.memberRefs.findIndex((member) => member.id === trackId);
          const memberRefs = [...collection.memberRefs];
          memberRefs.splice(at + 1, 0, ref(newTrackId));
          return { ...collection, memberRefs };
        })
      : block
  );
  return done([...next, track, ...copies], created);
}
