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
  setStripParent,
  setPrimaryData,
  setTimeSpan,
  type OpEnv,
  type SceneOpResult,
} from './sceneOps';
import { claveBlock } from './sceneTestHelpers';
import { collectionDataOf, objectDataOf, sceneDataOf, type Strip } from './sceneTypes';

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

/** The first strip of an object made by `addEmpty` (its id comes from the env). */
const strip = (blocks: readonly StoredDataBlock[], id: string): Strip =>
  objectDataOf(byId(blocks, id))!.strips[0];
const sid = (blocks: readonly StoredDataBlock[], id: string) => strip(blocks, id).id;

describe('scene ops', () => {
  it('creates a scene with its root collection and numbers names like Blender', () => {
    const { e, blocks, sceneId, rootId } = start();
    expect(sceneDataOf(byId(blocks, sceneId))?.rootCollectionRef?.id).toBe(rootId);
    expect(collectionDataOf(byId(blocks, rootId))?.memberRefs).toEqual([]);
    const second = ok(createScene(blocks, e));
    expect(byId(second.blocks, second.created[0])?.name).toBe('Scene.001');
  });

  it('adds Empty objects with unique names to the root, or to the selected collection', () => {
    const { e, blocks, sceneId, rootId } = start();
    const a = ok(addEmpty(blocks, e, sceneId, null));
    const b = ok(addEmpty(a.blocks, e, sceneId, null));
    expect(byId(b.blocks, a.created[0])?.name).toBe('Empty');
    expect(byId(b.blocks, b.created[0])?.name).toBe('Empty.001');
    expect(collectionDataOf(byId(b.blocks, rootId))?.memberRefs.map((m) => m.id)).toEqual([
      a.created[0],
      b.created[0],
    ]);
    const group = ok(addCollection(b.blocks, e, sceneId, null));
    const inside = ok(addEmpty(group.blocks, e, sceneId, group.created[0]));
    expect(
      collectionDataOf(byId(inside.blocks, group.created[0]))?.memberRefs.map((m) => m.id)
    ).toEqual(inside.created);
    const object = objectDataOf(byId(inside.blocks, inside.created[0]));
    expect(object?.strips).toHaveLength(1);
    expect(object?.strips[0].mapping).toBe('loop');
    expect(object?.strips[0].dataRef).toBeNull();
    expect(rationalToNumber(object!.strips[0].duration)).toBe(4);
  });

  it('adds a child under the selected object at relative start 0, in the same collection', () => {
    const { e, blocks, sceneId, rootId } = start();
    const parent = ok(addEmpty(blocks, e, sceneId, null));
    const child = ok(addChildEmpty(parent.blocks, e, sceneId, parent.created[0]));
    const placed = strip(child.blocks, child.created[0]);
    expect(placed.parentStrip).toEqual({
      objectId: parent.created[0],
      stripId: sid(child.blocks, parent.created[0]),
    });
    expect(rationalToNumber(placed.start)).toBe(0);
    expect(collectionDataOf(byId(child.blocks, rootId))?.memberRefs).toHaveLength(2);
    expect(addChildEmpty(child.blocks, e, sceneId, rootId).ok).toBe(false);
  });

  it('renames, sets span, mapping, data and mute; refuses a zero duration and an empty name', () => {
    const { e, blocks, sceneId } = start();
    const made = ok(addEmpty(blocks, e, sceneId, null));
    const id = made.created[0];
    let next = ok(renameBlock(made.blocks, id, '  Bass  ')).blocks;
    const s = sid(next, id);
    next = ok(setTimeSpan(next, id, s, { start: rational(1, 2), duration: rational(8) })).blocks;
    next = ok(setMapping(next, id, s, 'stretch')).blocks;
    next = ok(setPrimaryData(next, id, s, 'clave')).blocks;
    next = ok(setMute(next, id, true)).blocks;
    const object = objectDataOf(byId(next, id));
    expect(byId(next, id)?.name).toBe('Bass');
    expect(object?.strips[0]).toMatchObject({
      start: rational(1, 2),
      duration: rational(8),
      mapping: 'stretch',
      dataRef: { id: 'clave' },
    });
    expect(object?.mute).toBe(true);
    expect(setTimeSpan(next, id, s, { duration: rational(0) }).ok).toBe(false);
    expect(renameBlock(next, id, '  ').ok).toBe(false);
    expect(ok(setPrimaryData(next, id, s, null)).blocks.length).toBe(next.length);
    expect(setMapping(next, id, 'nope', 'loop')).toEqual({
      ok: false,
      error: 'That strip is gone.',
    });
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
    const [aId, bId] = [a.created[0], b.created[0]];
    const aStrip = { objectId: aId, stripId: sid(b.blocks, aId) };
    const bStrip = { objectId: bId, stripId: sid(b.blocks, bId) };
    const loop = setStripParent(b.blocks, aId, aStrip.stripId, bStrip);
    expect(loop.ok).toBe(false);
    expect(!loop.ok && loop.error).toMatch(/loop/);
    const self = setStripParent(b.blocks, aId, aStrip.stripId, aStrip);
    expect(!self.ok && self.error).toBe('A strip cannot be its own parent.');
    const gone = setStripParent(b.blocks, aId, aStrip.stripId, { objectId: bId, stripId: 'nope' });
    expect(!gone.ok && gone.error).toBe('A parent must be a strip.');
    const cleared = ok(setStripParent(b.blocks, bId, bStrip.stripId, null)).blocks;
    expect(strip(cleared, bId).parentStrip).toBeNull();
  });

  it('moves an object between collections (membership only) and refuses a collection into itself', () => {
    const { e, blocks, sceneId, rootId } = start();
    const group = ok(addCollection(blocks, e, sceneId, null));
    const made = ok(addEmpty(group.blocks, e, sceneId, null));
    const moved = ok(moveToCollection(made.blocks, made.created[0], group.created[0])).blocks;
    expect(collectionDataOf(byId(moved, rootId))?.memberRefs.map((m) => m.id)).toEqual([
      group.created[0],
    ]);
    expect(collectionDataOf(byId(moved, group.created[0]))?.memberRefs.map((m) => m.id)).toEqual([
      made.created[0],
    ]);
    expect(moveToCollection(moved, group.created[0], group.created[0]).ok).toBe(false);
  });
});

describe('deleting through the existing path', () => {
  it('a deleted parent leaves the child in place and out of the collection list', () => {
    const { e, blocks, sceneId, rootId } = start();
    const parent = ok(addEmpty(blocks, e, sceneId, null));
    const timed = ok(
      setTimeSpan(parent.blocks, parent.created[0], sid(parent.blocks, parent.created[0]), {
        start: rational(4),
      })
    ).blocks;
    const child = ok(addChildEmpty(timed, e, sceneId, parent.created[0]));
    const next = deleteSelected({ dataBlocks: child.blocks, instances: [] }, parent.created[0]);
    const kept = strip(next.dataBlocks, child.created[0]);
    expect(kept.parentStrip).toBeNull();
    expect(rationalToNumber(kept.start)).toBe(4);
    expect(byId(next.dataBlocks, parent.created[0])).toBeUndefined();
    expect(collectionDataOf(byId(next.dataBlocks, rootId))?.memberRefs.map((m) => m.id)).toEqual(
      child.created
    );
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
    const withData = ok(
      setPrimaryData(made.blocks, made.created[0], sid(made.blocks, made.created[0]), 'clave')
    ).blocks;
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
      before.created[0],
      inside.created[0],
      after.created[0],
    ]);
  });

  it('Delete on a nested collection moves its items up one level, without duplicates', () => {
    const { e, blocks, sceneId, rootId } = start();
    const outer = ok(addCollection(blocks, e, sceneId, null));
    const inner = ok(addCollection(outer.blocks, e, sceneId, outer.created[0]));
    const leaf = ok(addEmpty(inner.blocks, e, sceneId, inner.created[0]));
    const next = deleteSelected({ dataBlocks: leaf.blocks, instances: [] }, inner.created[0]);
    const outerMembers = collectionDataOf(byId(next.dataBlocks, outer.created[0]))?.memberRefs;
    expect(outerMembers?.map((m) => m.id)).toEqual(leaf.created);
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
