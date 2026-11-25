import { deleteBlockFromProject, type RefsProject } from '../dataBlocks/dataBlockRefs';
import type { Ref, StoredDataBlock } from '../dataBlocks/registry';
import { rational, type Rational } from '../musicalTime';
import {
  collectionDataOf,
  createBlankCollection,
  createBlankObject,
  createBlankScene,
  objectChain,
  objectDataOf,
  sceneDataOf,
  type CollectionData,
  type ObjectData,
  type ObjectMapping,
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

/** An Empty object in the selected collection (or the scene's root collection). */
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
  const object = createBlankObject({
    id,
    name: uniqueName(blocks, 'object', 'Empty'),
    createdAt: env.now,
    length: rational(4),
  });
  return done(addMember(blocks, into, id).concat(object), [id]);
}

/** An Empty placed under `parentId` (start 0, relative to it), listed in the parent's collection. */
export function addChildEmpty(
  blocks: Blocks,
  env: OpEnv,
  sceneId: string,
  parentId: string
): SceneOpResult {
  const parent = blocks.find((block) => block.id === parentId);
  if (!objectDataOf(parent)) {
    return fail('Select an object to add a child to.');
  }
  const into = collectionOf(blocks, parentId)?.id ?? targetCollection(blocks, sceneId, null);
  if (into === null) {
    return fail('That scene has no root collection.');
  }
  const id = env.newId();
  const created = mapData<ObjectData>(
    createBlankObject({
      id,
      name: uniqueName(blocks, 'object', 'Empty'),
      createdAt: env.now,
      length: rational(4),
    }),
    (data) => ({ ...data, parentRef: ref(parentId) })
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

/** Start and/or duration in exact quarter notes; the duration must be above zero. */
export function setTimeSpan(
  blocks: Blocks,
  id: string,
  span: { start?: Rational; duration?: Rational }
): SceneOpResult {
  if (span.duration && span.duration.numerator <= 0) {
    return fail('A duration must be longer than zero.');
  }
  return editObject(blocks, id, (data) => ({
    ...data,
    timeSpan: {
      start: span.start ?? data.timeSpan.start,
      duration: span.duration ?? data.timeSpan.duration,
    },
  }));
}

export function setMapping(blocks: Blocks, id: string, mapping: ObjectMapping): SceneOpResult {
  return editObject(blocks, id, (data) => ({ ...data, mapping }));
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
    const byId = new Map(blocks.map((block) => [block.id, block]));
    const chain = objectChain(byId, parentId);
    if (chain === null || chain.some((link) => link.id === id)) {
      return fail('That would make a loop: the parent is already placed under this object.');
    }
  }
  return editObject(blocks, id, (data) => ({
    ...data,
    parentRef: parentId === null ? null : ref(parentId),
  }));
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
  /** An object: how many objects are placed under it (they keep their place). */
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
      ? blocks.filter((block) => objectDataOf(block)?.parentRef?.id === id).length
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
