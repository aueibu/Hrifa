import { describe, expect, it } from 'vitest';
import type { StoredDataBlock } from '../dataBlocks/registry';
import { rational, rationalToNumber } from '../musicalTime';
import { outlinerRows } from './outlinerRows';
import {
  addChildEmpty,
  addCollection,
  addEmpty,
  createScene,
  deleteSummary,
  deleteHierarchy,
  deleteSelected,
  moveToCollection,
  renameBlock,
  setMapping,
  setMute,
  setParent,
  setPrimaryData,
  setRegisterMapping,
  setRegisterSpan,
  setTimeSpan,
  type OpEnv,
  type SceneOpResult,
} from './sceneOps';
import { claveBlock } from './sceneTestHelpers';
import { collectionDataOf, objectDataOf, sceneDataOf } from './sceneTypes';

function env(): OpEnv {
  let n = 0;
  return { newId: () => `id${(n += 1)}`, now: '2026-11-24T00:00:00Z' };
}

function ok(result: SceneOpResult) {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result;
}

/** A scene with a clave on the desk, built through the ops. */
function start() {
  const e = env();
  const created = ok(createScene([claveBlock()], e));
  return { e, blocks: created.blocks, sceneId: created.created[0], rootId: created.created[1] };
}

const byId = (blocks: readonly StoredDataBlock[], id: string) =>
  blocks.find((block) => block.id === id);

describe('scene ops', () => {
  it('creates a scene with its root collection and numbers names like Blender', () => {
    const { e, blocks, sceneId, rootId } = start();
    expect(sceneDataOf(byId(blocks, sceneId))?.rootCollectionRef?.id).toBe(rootId);
    expect(collectionDataOf(byId(blocks, rootId))?.memberRefs).toEqual([]);
    const second = ok(createScene(blocks, e));
    expect(byId(second.blocks, second.created[0])?.name).toBe('Scene.001');
  });

  it('adds Empty objects with unique names on a Track of the root, or of the selected collection', () => {
    const { e, blocks, sceneId, rootId } = start();
    const a = ok(addEmpty(blocks, e, sceneId, null));
    const b = ok(addEmpty(a.blocks, e, sceneId, null));
    expect(byId(b.blocks, a.created[0])?.name).toBe('Empty');
    expect(byId(b.blocks, b.created[0])?.name).toBe('Empty.001');
    // The first add makes the root's Track (same undo step); the second reuses it. Objects are held by it.
    const trackId = a.created[1];
    expect(byId(b.blocks, trackId)?.typeId).toBe('track');
    expect(b.created).toHaveLength(1);
    expect(collectionDataOf(byId(b.blocks, rootId))?.memberRefs.map((m) => m.id)).toEqual([
      trackId,
    ]);
    expect(objectDataOf(byId(b.blocks, b.created[0]))?.trackRef).toEqual({ id: trackId });
    const group = ok(addCollection(b.blocks, e, sceneId, null));
    const inside = ok(addEmpty(group.blocks, e, sceneId, group.created[0]));
    expect(
      collectionDataOf(byId(inside.blocks, group.created[0]))?.memberRefs.map((m) => m.id)
    ).toEqual([inside.created[1]]);
    expect(objectDataOf(byId(inside.blocks, inside.created[0]))?.trackRef).toEqual({
      id: inside.created[1],
    });
    const object = objectDataOf(byId(inside.blocks, inside.created[0]));
    expect(object?.mapping).toBe('loop');
    expect(object?.primaryDataRef).toBeNull();
  });

  it('adds a child under the selected object at relative start 0, on the same Track', () => {
    const { e, blocks, sceneId, rootId } = start();
    const parent = ok(addEmpty(blocks, e, sceneId, null));
    const child = ok(addChildEmpty(parent.blocks, e, sceneId, parent.created[0]));
    const data = objectDataOf(byId(child.blocks, child.created[0]));
    expect(data?.parentRef?.id).toBe(parent.created[0]);
    expect(rationalToNumber(data?.timeSpan.start ?? rational(9))).toBe(0);
    expect(data?.trackRef).toEqual(objectDataOf(byId(child.blocks, parent.created[0]))?.trackRef);
    expect(collectionDataOf(byId(child.blocks, rootId))?.memberRefs).toHaveLength(1);
    expect(addChildEmpty(child.blocks, e, sceneId, rootId).ok).toBe(false);
  });

  it('renames, sets span, mapping, data and mute; refuses a zero duration and an empty name', () => {
    const { e, blocks, sceneId } = start();
    const made = ok(addEmpty(blocks, e, sceneId, null));
    const id = made.created[0];
    let next = ok(renameBlock(made.blocks, id, '  Bass  ')).blocks;
    next = ok(setTimeSpan(next, id, { start: rational(1, 2), duration: rational(8) })).blocks;
    next = ok(setMapping(next, id, 'stretch')).blocks;
    next = ok(setPrimaryData(next, id, 'clave')).blocks;
    next = ok(setMute(next, id, true)).blocks;
    const object = objectDataOf(byId(next, id));
    expect(byId(next, id)?.name).toBe('Bass');
    expect(object?.timeSpan).toEqual({ start: rational(1, 2), duration: rational(8) });
    expect(object?.mapping).toBe('stretch');
    expect(object?.primaryDataRef?.id).toBe('clave');
    expect(object?.mute).toBe(true);
    expect(setTimeSpan(next, id, { duration: rational(0) }).ok).toBe(false);
    expect(renameBlock(next, id, '  ').ok).toBe(false);
    expect(ok(setPrimaryData(next, id, null)).blocks.length).toBe(next.length);
  });

  it('mutes a collection', () => {
    const { e, blocks, sceneId } = start();
    const group = ok(addCollection(blocks, e, sceneId, null));
    const next = ok(setMute(group.blocks, group.created[0], true)).blocks;
    expect(collectionDataOf(byId(next, group.created[0]))?.mute).toBe(true);
  });

  it('refuses a parent cycle with the reason, and allows clearing the parent', () => {
    const { e, blocks, sceneId } = start();
    const a = ok(addEmpty(blocks, e, sceneId, null));
    const b = ok(addChildEmpty(a.blocks, e, sceneId, a.created[0]));
    const loop = setParent(b.blocks, a.created[0], b.created[0]);
    expect(loop.ok).toBe(false);
    expect(!loop.ok && loop.error).toMatch(/loop/);
    expect(setParent(b.blocks, a.created[0], a.created[0]).ok).toBe(false);
    const cleared = ok(setParent(b.blocks, b.created[0], null)).blocks;
    expect(objectDataOf(byId(cleared, b.created[0]))?.parentRef).toBeNull();
  });

  it('moves a collection into another (membership only), refuses itself and an object', () => {
    const { e, blocks, sceneId, rootId } = start();
    const group = ok(addCollection(blocks, e, sceneId, null));
    const other = ok(addCollection(group.blocks, e, sceneId, null));
    const made = ok(addEmpty(other.blocks, e, sceneId, null));
    const moved = ok(moveToCollection(made.blocks, other.created[0], group.created[0])).blocks;
    expect(collectionDataOf(byId(moved, rootId))?.memberRefs.map((m) => m.id)).toEqual([
      group.created[0],
      made.created[1],
    ]);
    expect(collectionDataOf(byId(moved, group.created[0]))?.memberRefs.map((m) => m.id)).toEqual([
      other.created[0],
    ]);
    expect(moveToCollection(moved, group.created[0], group.created[0]).ok).toBe(false);
    expect(moveToCollection(moved, made.created[0], group.created[0]).ok).toBe(false);
  });
});

describe('deleting through the existing path', () => {
  it('a deleted parent leaves the child in place and out of the collection list', () => {
    const { e, blocks, sceneId, rootId } = start();
    const parent = ok(addEmpty(blocks, e, sceneId, null));
    const timed = ok(setTimeSpan(parent.blocks, parent.created[0], { start: rational(4) })).blocks;
    const child = ok(addChildEmpty(timed, e, sceneId, parent.created[0]));
    const next = deleteSelected({ dataBlocks: child.blocks, instances: [] }, parent.created[0]);
    const kept = objectDataOf(byId(next.dataBlocks, child.created[0]));
    expect(kept?.parentRef).toBeNull();
    expect(rationalToNumber(kept?.timeSpan.start ?? rational(9))).toBe(4);
    expect(byId(next.dataBlocks, parent.created[0])).toBeUndefined();
    // The child is held by the Track, not listed by the collection: it stays on it.
    expect(collectionDataOf(byId(next.dataBlocks, rootId))?.memberRefs.map((m) => m.id)).toEqual([
      parent.created[1],
    ]);
    expect(kept?.trackRef).toEqual({ id: parent.created[1] });
    expect(deleteSummary(child.blocks, parent.created[0])).toMatchObject({
      kind: 'object',
      members: 0,
      children: 1,
    });
  });

  it('Delete Hierarchy on a collection removes the objects it lists; data-blocks stay', () => {
    const { e, blocks, sceneId, rootId } = start();
    const group = ok(addCollection(blocks, e, sceneId, null));
    const made = ok(addEmpty(group.blocks, e, sceneId, group.created[0]));
    const withData = ok(setPrimaryData(made.blocks, made.created[0], 'clave')).blocks;
    const next = deleteHierarchy({ dataBlocks: withData, instances: [] }, group.created[0]);
    expect(byId(next.dataBlocks, made.created[0])).toBeUndefined();
    expect(byId(next.dataBlocks, group.created[0])).toBeUndefined();
    expect(byId(next.dataBlocks, 'clave')).toBeDefined();
    expect(collectionDataOf(byId(next.dataBlocks, rootId))?.memberRefs).toEqual([]);
    expect(outlinerRows(next.dataBlocks, sceneId)).toEqual([]);
  });

  it('Delete on a collection removes only it: its items move up, in its place', () => {
    const { e, blocks, sceneId, rootId } = start();
    const before = ok(addEmpty(blocks, e, sceneId, null));
    const group = ok(addCollection(before.blocks, e, sceneId, null));
    const inside = ok(addEmpty(group.blocks, e, sceneId, group.created[0]));
    const after = ok(addEmpty(inside.blocks, e, sceneId, null));
    expect(deleteSummary(after.blocks, group.created[0])).toMatchObject({
      kind: 'collection',
      members: 1,
      movesTo: byId(after.blocks, rootId)?.name,
    });
    const next = deleteSelected({ dataBlocks: after.blocks, instances: [] }, group.created[0]);
    expect(byId(next.dataBlocks, group.created[0])).toBeUndefined();
    expect(byId(next.dataBlocks, inside.created[0])).toBeDefined();
    expect(collectionDataOf(byId(next.dataBlocks, rootId))?.memberRefs.map((m) => m.id)).toEqual([
      before.created[1],
      inside.created[1],
    ]);
    expect(objectDataOf(byId(next.dataBlocks, after.created[0]))?.trackRef).toEqual({
      id: before.created[1],
    });
  });

  it('Delete on a nested collection moves its items up one level, without duplicates', () => {
    const { e, blocks, sceneId, rootId } = start();
    const outer = ok(addCollection(blocks, e, sceneId, null));
    const inner = ok(addCollection(outer.blocks, e, sceneId, outer.created[0]));
    const leaf = ok(addEmpty(inner.blocks, e, sceneId, inner.created[0]));
    const next = deleteSelected({ dataBlocks: leaf.blocks, instances: [] }, inner.created[0]);
    const outerMembers = collectionDataOf(byId(next.dataBlocks, outer.created[0]))?.memberRefs;
    expect(outerMembers?.map((m) => m.id)).toEqual([leaf.created[1]]);
    const rootMembers = collectionDataOf(byId(next.dataBlocks, rootId))?.memberRefs;
    expect(rootMembers?.map((m) => m.id)).toEqual(outer.created);
  });

  it('Delete on a collection nobody lists only removes it', () => {
    const { e, blocks, sceneId, rootId } = start();
    const group = ok(addCollection(blocks, e, sceneId, null));
    const made = ok(addEmpty(group.blocks, e, sceneId, group.created[0]));
    // Take the collection out of the root list so it has no parent.
    const orphaned = made.blocks.map((block) =>
      block.id === rootId
        ? {
            ...block,
            payload: { kind: 'record', data: { ...collectionDataOf(block), memberRefs: [] } },
          }
        : block
    ) as typeof made.blocks;
    const next = deleteSelected({ dataBlocks: orphaned, instances: [] }, group.created[0]);
    expect(byId(next.dataBlocks, group.created[0])).toBeUndefined();
    expect(byId(next.dataBlocks, made.created[0])).toBeDefined();
  });
});

describe('renaming keeps names unique per type', () => {
  it('a rename onto a taken name gets the .001 suffix; renaming to its own name keeps it', () => {
    const { e, blocks, sceneId } = start();
    const first = ok(addEmpty(blocks, e, sceneId, null));
    const second = ok(addEmpty(first.blocks, e, sceneId, null));
    const taken = ok(renameBlock(second.blocks, second.created[0], 'Empty'));
    expect(byId(taken.blocks, second.created[0])?.name).toBe('Empty.001');
    const same = ok(renameBlock(taken.blocks, first.created[0], 'Empty'));
    expect(byId(same.blocks, first.created[0])?.name).toBe('Empty');
  });
});

describe('U7b-1: register ops', () => {
  it('sets the register span and mapping; refuses low above high and a non-object', () => {
    const { e, blocks, sceneId } = start();
    const added = ok(addEmpty(blocks, e, sceneId, null));
    const id = added.created[0];
    const made = added.blocks;
    let next = ok(setRegisterSpan(made, id, 6200, 7000)).blocks;
    next = ok(setRegisterMapping(next, id, 'fold')).blocks;
    const object = objectDataOf(byId(next, id));
    expect(object?.registerSpan).toEqual({ lowMc: 6200, highMc: 7000 });
    expect(object?.registerMapping).toBe('fold');
    expect(setRegisterSpan(made, id, 7000, 6200).ok).toBe(false);
    expect(setRegisterMapping(made, 'nope', 'filter').ok).toBe(false);
  });
});
