import { describe, expect, it } from 'vitest';
import type { MusicalPerformancePlan } from '../audio/types';
import { dataBlockUsers, makeSingleUser } from '../dataBlocks/dataBlockRefs';
import { validateBlock, type StoredDataBlock } from '../dataBlocks/registry';
import { rational, rationalToNumber } from '../musicalTime';
import { evaluateScene } from './evaluateScene';
import { MELODICIZE_ID } from './modifiers';
import {
  applyModifier,
  deleteSelected,
  duplicateObject,
  duplicateObjectLinked,
  moveToCollection,
  objectRoom,
  placeObjectNearest,
  resizeSharedEdge,
  setMute,
  setTimeSpan,
  type OpEnv,
  type SceneOpResult,
} from './sceneOps';
import {
  claveBlock,
  collectionBlock,
  modifierOf,
  objectBlock,
  pitchSetBlock,
  sceneBlock,
} from './sceneTestHelpers';
import { collectionDataOf, objectDataOf, objectWorldStart } from './sceneTypes';

/**
 * The placement scenarios (W-77, the object-level form of `SCENARIOS.strips.md` rows 2, 4, 4b, 4c, 9
 * and 10): Object = one placement, Collection = one lane. The clave has a 4-quarter cycle with attacks
 * at 0, 0.75, 1.5, 2.5, 3. Real ops, real evaluator.
 */

const P = pitchSetBlock('P', [6000, 6400, 6700]);
const beat = rational(1);

function env(): OpEnv {
  let n = 0;
  return { newId: () => `n${(n += 1)}`, now: '2026-11-24T00:00:00Z' };
}

function ok(result: SceneOpResult) {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result;
}

const refused = (result: SceneOpResult) => (result.ok ? null : result.error);

const clave = (id: string, start: number, duration: number, patch = {}) =>
  objectBlock(id, { primaryDataRef: { id: 'clave' }, start, duration, ...patch }, id);

function world(...objects: StoredDataBlock[]): StoredDataBlock[] {
  return [
    claveBlock(),
    P,
    ...objects,
    collectionBlock(
      'root',
      objects.map((block) => block.id)
    ),
    sceneBlock('scene', 'root'),
  ];
}

const data = (blocks: readonly StoredDataBlock[], id: string) =>
  objectDataOf(blocks.find((block) => block.id === id))!;
const span = (blocks: readonly StoredDataBlock[], id: string) => {
  const world = rationalToNumber(objectWorldStart(blocks, id)!);
  return [world, world + rationalToNumber(data(blocks, id).timeSpan.duration)];
};
const members = (blocks: readonly StoredDataBlock[], id = 'root') =>
  collectionDataOf(blocks.find((block) => block.id === id))!.memberRefs.map((ref) => ref.id);
const eventsOf = (plan: MusicalPerformancePlan, prefix: string) =>
  plan.events
    .filter((event) => event.id.startsWith(prefix))
    .map((event) => rationalToNumber(event.at.quarterNotes));
const play = (blocks: StoredDataBlock[]) => evaluateScene(blocks, 'scene').plan;

describe('row 2: Duplicate Object and Duplicate Linked', () => {
  const stack = [modifierOf('m1', MELODICIZE_ID, { pitches: 'P' })];
  const blocks = world(clave('c', 4, 8, { modifiers: stack }));

  it('Duplicate Object: right after the original in the same collection, its OWN "Clave (copy)" data, new modifier ids', () => {
    const result = ok(duplicateObject(blocks, env(), 'c'));
    const [copyId, dataId] = result.created;
    expect(members(result.blocks)).toEqual(['c', copyId]);
    const copy = data(result.blocks, copyId);
    expect(copy.primaryDataRef).toEqual({ id: dataId });
    expect(result.blocks.find((block) => block.id === dataId)!.name).toBe('Clave (copy)');
    const order = result.blocks.map((block) => block.id);
    expect(order.indexOf(dataId)).toBe(order.indexOf('clave') + 1);
    expect(span(result.blocks, copyId)).toEqual([12, 20]);
    expect(copy.mapping).toBe('loop');
    expect(copy.modifiers).toHaveLength(1);
    expect(copy.modifiers[0].id).not.toBe('m1');
    expect(copy.modifiers[0].refs).toEqual({ pitches: { id: 'P' } });
    expect(result.blocks.find((block) => block.id === copyId)!.name).toBe('c.001');
    expect(validateBlock(result.blocks.find((block) => block.id === copyId)!)).toBeNull();
  });

  it('Duplicate Linked: the same data-block (Used by 2), its own modifiers; Make single user detaches', () => {
    const result = ok(duplicateObjectLinked(blocks, env(), 'c'));
    const [copyId] = result.created;
    expect(result.created).toHaveLength(1);
    expect(data(result.blocks, copyId).primaryDataRef).toEqual({ id: 'clave' });
    const project = { dataBlocks: result.blocks, instances: [] };
    expect(dataBlockUsers(project, 'clave').map((user) => user.ownerId)).toEqual(['c', copyId]);
    const users = dataBlockUsers(project, 'clave');
    const single = makeSingleUser(project, 'clave', users[1], {
      id: 'copy',
      createdAt: '2026-11-24T00:00:00Z',
    });
    expect(single.ok).toBe(true);
    if (single.ok) {
      expect(data(single.project.dataBlocks, copyId).primaryDataRef).toEqual({ id: 'copy' });
      expect(data(single.project.dataBlocks, 'c').primaryDataRef).toEqual({ id: 'clave' });
    }
  });

  it('goes to the first free space AFTER the original that fits (the lane is never overlapped)', () => {
    const crowded = world(clave('c', 4, 8), clave('d', 12, 4));
    const result = ok(duplicateObject(crowded, env(), 'c'));
    expect(span(result.blocks, result.created[0])).toEqual([16, 24]);
  });

  it('keeps the parent: the copy is placed under the same parent', () => {
    const under = world(clave('par', 0, 40), clave('c', 4, 8, { parentRef: { id: 'par' } }));
    const result = ok(duplicateObject(under, env(), 'c'));
    expect(data(result.blocks, result.created[0]).parentRef).toEqual({ id: 'par' });
    // L3: only the same sub-lane counts. The parent (0 to 40) is on sub-lane 0 and the child on sub-lane 1,
    // so the first free space on the child's sub-lane is right after it, at 12.
    expect(data(result.blocks, result.created[0]).timeSpan.start).toEqual(rational(12));
  });

  it('an object in no collection refuses with "No room here."', () => {
    const loose = [claveBlock(), clave('c', 0, 4)];
    expect(refused(duplicateObject(loose, env(), 'c'))).toBe('No room here.');
  });
});

describe('row 4: touching objects of one collection share an edge that drags both', () => {
  const two = () => world(clave('L', 4, 8), clave('R', 12, 8));

  it('drag right by 2: L 4 to 14, R 14 to 20; R keeps its cycle grid (offset 2)', () => {
    const next = ok(resizeSharedEdge(two(), 'L', 'R', rational(14), beat)).blocks;
    expect(span(next, 'L')).toEqual([4, 14]);
    expect(span(next, 'R')).toEqual([14, 20]);
    expect(data(next, 'R').contentOffset).toEqual(rational(2));
    expect(eventsOf(play(next), 'R:')).toEqual([14.5, 15, 16, 16.75, 17.5, 18.5, 19]);
  });

  it('drag left by 2: L 4 to 10, R 10 to 20, the earlier cycle of R is revealed (offset -2)', () => {
    const next = ok(resizeSharedEdge(two(), 'L', 'R', rational(10), beat)).blocks;
    expect(span(next, 'L')).toEqual([4, 10]);
    expect(span(next, 'R')).toEqual([10, 20]);
    expect(data(next, 'R').contentOffset).toEqual(rational(-2));
    expect(eventsOf(play(next), 'R:')).toEqual([
      10.5, 11, 12, 12.75, 13.5, 14.5, 15, 16, 16.75, 17.5, 18.5, 19,
    ]);
  });

  it('keeps at least one beat in each object: the edge is clamped', () => {
    expect(span(ok(resizeSharedEdge(two(), 'L', 'R', rational(100), beat)).blocks, 'L')).toEqual([
      4, 19,
    ]);
    expect(span(ok(resizeSharedEdge(two(), 'L', 'R', rational(-100), beat)).blocks, 'R')).toEqual([
      5, 20,
    ]);
  });

  it('a Stretch object refits instead of moving its offset', () => {
    const stretched = world(clave('L', 4, 8), clave('R', 12, 8, { mapping: 'stretch' }));
    const next = ok(resizeSharedEdge(stretched, 'L', 'R', rational(14), beat)).blocks;
    expect(data(next, 'R').contentOffset).toEqual(rational(0));
    expect(span(next, 'R')).toEqual([14, 20]);
  });

  it('refuses objects that do not touch, are in different collections, or are too short', () => {
    const apart = world(clave('L', 4, 8), clave('R', 14, 8));
    expect(refused(resizeSharedEdge(apart, 'L', 'R', rational(13), beat))).toBe(
      'These objects do not touch.'
    );
    const split = [
      ...world(clave('L', 4, 8), clave('R', 12, 8)).filter((block) => block.id !== 'root'),
      collectionBlock('root', ['L']),
      collectionBlock('other', ['R']),
    ];
    expect(refused(resizeSharedEdge(split, 'L', 'R', rational(13), beat))).toBe(
      'These objects do not touch.'
    );
    const short = world(clave('L', 4, 4), clave('R', 8, 4));
    expect(refused(resizeSharedEdge(short, 'L', 'R', rational(9), rational(5)))).toBe(
      'These objects are too short to move their edge.'
    );
    expect(refused(resizeSharedEdge(two(), 'L', 'nope', rational(9), beat))).toBe(
      'Select an object first.'
    );
  });
});

describe('row 4b: no overlap among the objects of one collection, and the nearest free slot', () => {
  const lane = () => world(clave('L', 4, 8), clave('R', 12, 8), clave('X', 30, 4));

  it('the room around an object is the end of the one before it and the start of the one after', () => {
    const room = objectRoom(lane(), 'R')!;
    expect(room.before).toEqual(rational(12));
    expect(room.after).toEqual(rational(30));
    expect(objectRoom(lane(), 'L')!.before).toBeNull();
    expect(objectRoom(lane(), 'nope')).toBeNull();
  });

  it('typing a duration or start that overlaps a sibling is refused with "No room here."; touching is fine', () => {
    expect(refused(setTimeSpan(lane(), 'R', { duration: rational(19) }))).toBe('No room here.');
    expect(ok(setTimeSpan(lane(), 'R', { duration: rational(18) })).ok).toBe(true);
    expect(refused(setTimeSpan(lane(), 'R', { start: rational(8) }))).toBe('No room here.');
  });

  it('objects of another collection never block each other', () => {
    const split = [
      ...world(clave('L', 4, 8), clave('R', 12, 8)).filter((block) => block.id !== 'root'),
      collectionBlock('root', ['L']),
      collectionBlock('other', ['R']),
    ];
    expect(ok(setTimeSpan(split, 'R', { start: rational(6) })).ok).toBe(true);
  });

  it('a drop on a free spot lands there; a drop on a neighbor lands in the nearest free slot', () => {
    const free = ok(placeObjectNearest(lane(), 'R', rational(20))).blocks;
    expect(span(free, 'R')).toEqual([20, 28]);
    const next = ok(placeObjectNearest(lane(), 'R', rational(6))).blocks;
    expect(span(next, 'R')).toEqual([12, 20]);
    expect(span(next, 'L')).toEqual([4, 12]);
  });

  it('chooses the closest free gap, ties go to the earlier one, and never before 0', () => {
    const gaps = world(clave('A', 6, 4), clave('M', 20, 4));
    // Free: [0, 6) and [10, inf). Desired 6 for 4 quarters: before lands at 2 (4 away), after at 10 (4 away).
    expect(span(ok(placeObjectNearest(gaps, 'M', rational(6))).blocks, 'M')).toEqual([2, 6]);
    expect(span(ok(placeObjectNearest(gaps, 'M', rational(7))).blocks, 'M')).toEqual([10, 14]);
    expect(span(ok(placeObjectNearest(gaps, 'M', rational(-3))).blocks, 'M')).toEqual([0, 4]);
  });

  it('a parent moving its children never refuses, even when they then overlap', () => {
    const family = world(
      clave('par', 0, 20),
      clave('C1', 0, 4, { parentRef: { id: 'par' } }),
      clave('C2', 2, 4, { parentRef: { id: 'par' } })
    );
    const moved = ok(setTimeSpan(family, 'par', { start: rational(4) })).blocks;
    expect(span(moved, 'C1')).toEqual([4, 8]);
    expect(span(moved, 'C2')).toEqual([6, 10]);
  });
});

describe('row 4c: an object moves to another collection (lane)', () => {
  const lanes = (...inOther: StoredDataBlock[]) => [
    claveBlock(),
    clave('O', 4, 8),
    ...inOther,
    collectionBlock('root', ['O', 'g2']),
    collectionBlock(
      'g2',
      inOther.map((block) => block.id)
    ),
    sceneBlock('scene', 'root'),
  ];

  it('lands at the same world start when the target lane is free there', () => {
    const next = ok(moveToCollection(lanes(clave('Q', 20, 4)), 'O', 'g2')).blocks;
    expect(members(next, 'g2')).toEqual(['Q', 'O']);
    expect(members(next)).toEqual(['g2']);
    expect(span(next, 'O')).toEqual([4, 12]);
  });

  it('lands in the nearest free slot when the target lane is taken there', () => {
    const next = ok(moveToCollection(lanes(clave('Q', 6, 4)), 'O', 'g2')).blocks;
    expect(span(next, 'O')).toEqual([10, 18]);
    expect(span(next, 'Q')).toEqual([6, 10]);
  });

  it('refuses a collection into itself and a target that is not a collection', () => {
    const blocks = lanes();
    expect(refused(moveToCollection(blocks, 'g2', 'g2'))).toBe(
      'A collection cannot be moved into itself.'
    );
    expect(refused(moveToCollection(blocks, 'O', 'O'))).toBe('Move it into a collection.');
  });
});

describe('row 9: mute', () => {
  it('a muted object is silent but the scene keeps its length', () => {
    const blocks = world(clave('a', 0, 4), clave('b', 8, 4));
    const muted = ok(setMute(blocks, 'b', true)).blocks;
    expect(eventsOf(play(muted), 'b:')).toEqual([]);
    expect(rationalToNumber(play(muted).duration.quarterNotes)).toBe(12);
  });
});

describe('row 10: Apply works on the object', () => {
  it('Apply on the top modifier bakes one cycle into "Clave (applied)" and points the object at it, mapping kept', () => {
    const blocks = world(
      clave('c', 4, 8, {
        mapping: 'stretch',
        modifiers: [modifierOf('m1', MELODICIZE_ID, { pitches: 'P' })],
      })
    );
    const result = ok(applyModifier(blocks, env(), 'c', 'm1'));
    const baked = result.blocks.find((block) => block.id === result.created[0])!;
    expect(baked.name).toBe('Clave (applied)');
    expect(data(result.blocks, 'c').primaryDataRef).toEqual({ id: baked.id });
    expect(data(result.blocks, 'c').modifiers).toEqual([]);
    expect(data(result.blocks, 'c').mapping).toBe('stretch');
  });
});

describe('deleting a parent re-roots its children at their world start', () => {
  it('the child keeps world 20 and loses the parent', () => {
    const blocks = world(clave('p', 16, 20), clave('k', 4, 4, { parentRef: { id: 'p' } }));
    const next = deleteSelected({ dataBlocks: blocks, instances: [] }, 'p').dataBlocks;
    expect(data(next, 'k').parentRef).toBeNull();
    expect(span(next, 'k')).toEqual([20, 24]);
  });
});

describe('a child inside its parent in one collection (parent chain is not an overlap)', () => {
  const family = () => [
    clave('p', 20, 8),
    clave('k', 2, 2, { parentRef: { id: 'p' } }), // world 22 to 24
  ];

  it('dragging the child to world 24 to 26 lands exactly there', () => {
    const blocks = world(...family());
    const next = ok(placeObjectNearest(blocks, 'k', rational(4)));
    expect(span(next.blocks, 'k')).toEqual([24, 26]);
  });

  it('an unrelated sibling at 24 to 26 pushes it to the nearest free slot', () => {
    const blocks = world(...family(), clave('s', 24, 2));
    const next = ok(placeObjectNearest(blocks, 'k', rational(4)));
    expect(span(next.blocks, 'k')).toEqual([22, 24]);
  });

  it('room, resize and the span edit ignore the parent', () => {
    const blocks = world(...family());
    expect(objectRoom(blocks, 'k')).toEqual({ before: null, after: null });
    expect(refused(setTimeSpan(blocks, 'k', { duration: rational(3) }))).toBeNull();
    expect(refused(setTimeSpan(blocks, 'p', { duration: rational(10) }))).toBeNull();
  });
});
