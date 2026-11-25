import { describe, expect, it } from 'vitest';
import type { MusicalPerformancePlan } from '../audio/types';
import {
  deleteBlockFromProject,
  dataBlockUsers,
  makeSingleUser,
} from '../dataBlocks/dataBlockRefs';
import { validateBlock, type StoredDataBlock } from '../dataBlocks/registry';
import { rational, rationalToNumber } from '../musicalTime';
import { evaluateScene, modifierProblems } from './evaluateScene';
import { MELODICIZE_ID } from './modifiers';
import {
  addEmpty,
  addModifier,
  addStrip,
  applyAll,
  applyModifier,
  createScene,
  deleteSelected,
  deleteStrip,
  duplicateStrip,
  duplicateStripLinked,
  moveStrip,
  moveStripToObject,
  resizeSharedEdge,
  setMapping,
  setModifierRef,
  setMute,
  setStripMute,
  setStripParent,
  setTimeSpan,
  stripRoom,
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
  stripOf,
} from './sceneTestHelpers';
import { objectDataOf, stripWorldStart, type Strip } from './sceneTypes';

/**
 * The strip scenarios (`SCENARIOS.strips.md`, S0): the confirmed rows that are not UI, each with the
 * clave (cycle 4 quarters, attacks at 0, 0.75, 1.5, 2.5, 3), the pitch set P = 6000, 6400, 6700 and the
 * object Clave with strip S1 (data Clave, start 4, duration 8, Loop). Real ops, real evaluator.
 */

const P = pitchSetBlock('P', [6000, 6400, 6700]);
const ATTACKS_4_TO_12 = [4, 4.75, 5.5, 6.5, 7, 8, 8.75, 9.5, 10.5, 11];

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

/** The value of a refs result, or a thrown reason. */
function ok2<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) {
    throw new Error('expected the refs operation to succeed');
  }
  return result as Extract<T, { ok: true }>;
}

const refused = (result: SceneOpResult) => (result.ok ? null : result.error);

/** The Clave object: strip s1 plays the clave from 4 to 12, Loop. */
const clave = (strips: Strip[] = [claveStrip()], id = 'o') =>
  objectBlock(id, { strips }, id === 'o' ? 'Clave' : id);
function claveStrip(patch: Parameters<typeof stripOf>[0] = {}): Strip {
  return stripOf({ id: 's1', dataRef: { id: 'clave' }, start: 4, duration: 8, ...patch });
}

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

const stripsOf = (blocks: readonly StoredDataBlock[], id = 'o') =>
  objectDataOf(blocks.find((block) => block.id === id))!.strips;
const stripAt = (blocks: readonly StoredDataBlock[], id: string, stripId: string) =>
  stripsOf(blocks, id).find((strip) => strip.id === stripId)!;
const span = (strip: Strip) => [
  rationalToNumber(strip.start),
  rationalToNumber(strip.start) + rationalToNumber(strip.duration),
];
const play = (blocks: StoredDataBlock[]) => evaluateScene(blocks, 'scene');
const eventsOf = (plan: MusicalPerformancePlan, prefix: string) =>
  plan.events.filter((event) => event.id.startsWith(prefix));
const starts = (events: MusicalPerformancePlan['events']) =>
  events.map((event) => rationalToNumber(event.at.quarterNotes));
const pitches = (events: MusicalPerformancePlan['events']) =>
  events.map((event) => event.pitchMidicents);
const project = (dataBlocks: StoredDataBlock[]) => ({ dataBlocks, instances: [] });
const planLength = (blocks: StoredDataBlock[]) =>
  rationalToNumber(play(blocks).plan.duration.quarterNotes);

describe('row 1: an Empty is an object with ONE silent strip', () => {
  const made = () => {
    const e = env();
    const created = ok(createScene([claveBlock()], e));
    const added = ok(addEmpty(created.blocks, e, created.created[0], null));
    return { blocks: added.blocks, id: added.created[0], sceneId: created.created[0] };
  };

  it('one strip: no data, start 0, duration 4, Loop, silent, valid', () => {
    const { blocks, id, sceneId } = made();
    const strips = stripsOf(blocks, id);
    expect(strips).toHaveLength(1);
    expect(strips[0]).toMatchObject({
      dataRef: null,
      start: rational(0),
      duration: rational(4),
      mapping: 'loop',
      contentOffset: rational(0),
      modifiers: [],
      mute: false,
      parentStrip: null,
    });
    expect(validateBlock(blocks.find((block) => block.id === id)!)).toBeNull();
    const { plan, warnings } = evaluateScene(blocks, sceneId);
    expect(plan.events).toEqual([]);
    expect(warnings).toEqual([]);
    expect(rationalToNumber(plan.duration.quarterNotes)).toBe(4);
  });

  it('deleting its only strip leaves the object, a silent Empty with no span', () => {
    const { blocks, id, sceneId } = made();
    const next = ok(deleteStrip(blocks, id, stripsOf(blocks, id)[0].id)).blocks;
    expect(stripsOf(next, id)).toEqual([]);
    expect(validateBlock(next.find((block) => block.id === id)!)).toBeNull();
    const { plan } = evaluateScene(next, sceneId);
    expect(plan.events).toEqual([]);
    expect(rationalToNumber(plan.duration.quarterNotes)).toBe(0);
  });

  it('Add strip puts a blank silent strip in the first free space that fits 4 quarters', () => {
    const { blocks, id } = made();
    const e = env();
    const added = ok(addStrip(blocks, e, id));
    expect(added.created).toEqual(['n1']);
    const strips = stripsOf(added.blocks, id);
    expect(strips.map((strip) => strip.id)).toEqual([strips[0].id, 'n1']);
    expect(span(strips[1])).toEqual([4, 8]);
    expect(strips[1].dataRef).toBeNull();
    // A gap of 4 before a later strip is used first.
    const gap = ok(setTimeSpan(added.blocks, id, 'n1', { start: rational(8) })).blocks;
    expect(span(stripAt(ok(addStrip(gap, e, id)).blocks, id, 'n2'))).toEqual([4, 8]);
  });
});

describe('row 2: Duplicate Strip and Duplicate Linked', () => {
  const stackedClave = () => {
    const modifier = modifierOf('m1', MELODICIZE_ID, { pitches: 'P' });
    return world(clave([claveStrip({ mapping: 'stretch', modifiers: [modifier] })]));
  };

  it('Duplicate Strip: S2 right after S1, its OWN data-block "Clave (copy)", same mapping, new modifier ids', () => {
    const blocks = stackedClave();
    const e = env();
    const result = ok(duplicateStrip(blocks, e, 'o', 's1'));
    const [s1, s2] = stripsOf(result.blocks);
    expect(result.created).toEqual(['n1', 'n2']);
    expect(span(s2)).toEqual([12, 20]);
    expect(s2.mapping).toBe('stretch');
    const copy = result.blocks.find((block) => block.id === 'n2')!;
    expect(copy.name).toBe('Clave (copy)');
    expect(copy.typeId).toBe('rhythm');
    expect(s2.dataRef).toEqual({ id: 'n2' });
    expect(s1.dataRef).toEqual({ id: 'clave' });
    // The copy sits right after the original on the desk.
    const ids = result.blocks.map((block) => block.id);
    expect(ids.indexOf('n2')).toBe(ids.indexOf('clave') + 1);
    // The modifier stack is copied with new ids; its settings and references stay.
    expect(s2.modifiers).toHaveLength(1);
    expect(s2.modifiers[0].id).toBe('n3');
    expect({ ...s2.modifiers[0], id: 'm1' }).toEqual(s1.modifiers[0]);
    expect(s2.modifiers[0].params).not.toBe(s1.modifiers[0].params);
    // Independent: the original data-block has one user; the copy has one.
    expect(dataBlockUsers(project(result.blocks), 'clave')).toHaveLength(1);
    expect(dataBlockUsers(project(result.blocks), 'n2')).toHaveLength(1);
    // The name stays unique per type the second time.
    const again = ok(duplicateStrip(result.blocks, e, 'o', 's1'));
    expect(again.blocks.find((block) => block.id === again.created[1])!.name).toBe(
      'Clave (copy).001'
    );
    expect(result.blocks.every((block) => validateBlock(block) === null)).toBe(true);
  });

  it('Duplicate Linked: the same data-block (Used by 2), its own modifiers; Make single user detaches', () => {
    const blocks = stackedClave();
    const e = env();
    const result = ok(duplicateStripLinked(blocks, e, 'o', 's1'));
    const [s1, s2] = stripsOf(result.blocks);
    expect(result.created).toEqual(['n1']);
    expect(s2.dataRef).toEqual({ id: 'clave' });
    expect(span(s2)).toEqual([12, 20]);
    expect(s2.modifiers[0].id).not.toBe(s1.modifiers[0].id);
    expect(result.blocks.some((block) => block.name === 'Clave (copy)')).toBe(false);
    const users = dataBlockUsers(project(result.blocks), 'clave');
    expect(users.map((user) => user.slot)).toEqual(['strip:s1:data', 'strip:n1:data']);
    // Make single user on S2 only (the Properties button).
    const single = makeSingleUser(project(result.blocks), 'clave', users[1], {
      id: 'copy',
      createdAt: '2026-11-24T00:00:00Z',
    });
    const after = ok2(single).project.dataBlocks;
    expect(stripAt(after, 'o', 'n1').dataRef).toEqual({ id: 'copy' });
    expect(stripAt(after, 'o', 's1').dataRef).toEqual({ id: 'clave' });
  });

  it('goes to the first free space AFTER the original that fits', () => {
    // S1 4..12 and S3 14..18: a gap of 2 cannot hold 8, so the copy goes after S3.
    const tight = world(clave([claveStrip(), claveStrip({ id: 's3', start: 14, duration: 4 })]));
    expect(
      span(stripAt(ok(duplicateStripLinked(tight, env(), 'o', 's1')).blocks, 'o', 'n1'))
    ).toEqual([18, 26]);
    // S3 at 20..24 leaves 12..20, exactly 8: it fits.
    const roomy = world(clave([claveStrip(), claveStrip({ id: 's3', start: 20, duration: 4 })]));
    expect(
      span(stripAt(ok(duplicateStripLinked(roomy, env(), 'o', 's1')).blocks, 'o', 'n1'))
    ).toEqual([12, 20]);
  });

  it('keeps the parent: the copy is placed under the same parent strip', () => {
    const blocks = world(
      objectBlock('verse', { strips: [stripOf({ id: 'v', start: 10, duration: 64 })] }),
      objectBlock('kid', {
        strips: [stripOf({ id: 'k', dataRef: { id: 'clave' }, start: 4, duration: 4 })].map(
          (strip) => ({ ...strip, parentStrip: { objectId: 'verse', stripId: 'v' } })
        ),
      })
    );
    const result = ok(duplicateStripLinked(blocks, env(), 'kid', 'k'));
    const copy = stripAt(result.blocks, 'kid', 'n1');
    expect(copy.parentStrip).toEqual({ objectId: 'verse', stripId: 'v' });
    expect(span(copy)).toEqual([8, 12]);
    expect(rationalToNumber(stripWorldStart(result.blocks, 'kid', 'n1')!)).toBe(18);
  });

  it('refuses with "No room here." when its place cannot be worked out (a circular parent)', () => {
    const blocks = world(
      objectBlock('a', {
        strips: [{ ...stripOf({ id: 'a1' }), parentStrip: { objectId: 'b', stripId: 'b1' } }],
      }),
      objectBlock('b', {
        strips: [{ ...stripOf({ id: 'b1' }), parentStrip: { objectId: 'a', stripId: 'a1' } }],
      })
    );
    expect(refused(duplicateStrip(blocks, env(), 'a', 'a1'))).toBe('No room here.');
    expect(refused(duplicateStrip(blocks, env(), 'a', 'nope'))).toBe('That strip is gone.');
  });
});

describe('row 3: one object, two strips, treated differently', () => {
  it('S1 loops the clave 4 to 12 unchanged; S2 stretches ONE cycle into 4 quarters with pitches from P', () => {
    const e = env();
    const single = world(clave());
    const linked = ok(duplicateStripLinked(single, e, 'o', 's1')).blocks;
    let blocks = ok(setMapping(linked, 'o', 'n1', 'stretch')).blocks;
    blocks = ok(setTimeSpan(blocks, 'o', 'n1', { duration: rational(4) })).blocks;
    const added = ok(addModifier(blocks, e, 'o', 'n1', MELODICIZE_ID));
    blocks = ok(setModifierRef(added.blocks, 'o', 'n1', added.created[0], 'pitches', 'P')).blocks;
    const { plan, warnings } = play(blocks);
    expect(warnings).toEqual([]);
    const s1 = eventsOf(plan, 'o:s1:');
    const s2 = eventsOf(plan, 'o:n1:');
    expect(starts(s1)).toEqual(ATTACKS_4_TO_12);
    expect(starts(s2)).toEqual([12, 12.75, 13.5, 14.5, 15]);
    expect(new Set(pitches(s2))).toEqual(new Set([6000, 6400, 6700]));
    // S1 is exactly what it was with one strip: editing S2 never changes S1.
    const alone = eventsOf(play(single).plan, 'o:s1:');
    expect(s1).toEqual(alone);
    expect(new Set(pitches(s1)).size).toBe(1);
    // Event ids are unique across the strips.
    expect(new Set(plan.events.map((event) => event.id)).size).toBe(plan.events.length);
    // The scene is as long as the last strip.
    expect(rationalToNumber(plan.duration.quarterNotes)).toBe(16);
  });

  it('the modifier problems are per strip', () => {
    const e = env();
    const blocks = ok(duplicateStripLinked(world(clave()), e, 'o', 's1')).blocks;
    const added = ok(addModifier(blocks, e, 'o', 'n1', MELODICIZE_ID));
    expect(modifierProblems(added.blocks, 'o', 'n1').map((problem) => problem.text)).toEqual([
      'Melodicize: Pitch set is missing',
    ]);
    expect(modifierProblems(added.blocks, 'o', 's1')).toEqual([]);
    expect(play(added.blocks).warnings).toEqual([
      'Object "Clave": Melodicize: Pitch set is missing',
    ]);
    expect(starts(eventsOf(play(added.blocks).plan, 'o:s1:'))).toEqual(ATTACKS_4_TO_12);
  });
});

describe('row 4: touching strips share an edge that drags both', () => {
  const touching = () =>
    world(clave([claveStrip(), claveStrip({ id: 's2', start: 12, duration: 8 })]));
  const edge = (blocks: StoredDataBlock[], at: number, minimum = 1) =>
    resizeSharedEdge(blocks, 'o', 's1', 's2', rational(at), rational(minimum));

  it('drag right by 2: S1 4 to 14, S2 14 to 20; S2 keeps its cycle grid (W-74 offset)', () => {
    const before = touching();
    const result = ok(edge(before, 14)).blocks;
    expect(span(stripAt(result, 'o', 's1'))).toEqual([4, 14]);
    expect(span(stripAt(result, 'o', 's2'))).toEqual([14, 20]);
    expect(stripAt(result, 'o', 's2').contentOffset).toEqual(rational(2));
    const was = starts(eventsOf(play(before).plan, 'o:s2:'));
    const now = starts(eventsOf(play(result).plan, 'o:s2:'));
    expect(now).toEqual(was.filter((time) => time >= 14));
    // S1 extends: one more cycle of the loop (12 to 14 reveals 12, 12.75, 13.5).
    expect(starts(eventsOf(play(result).plan, 'o:s1:'))).toEqual([
      ...ATTACKS_4_TO_12,
      12,
      12.75,
      13.5,
    ]);
  });

  it('drag left by 2: S1 4 to 10, S2 10 to 20, the earlier cycle of S2 is revealed', () => {
    const before = touching();
    const result = ok(edge(before, 10)).blocks;
    expect(span(stripAt(result, 'o', 's1'))).toEqual([4, 10]);
    expect(span(stripAt(result, 'o', 's2'))).toEqual([10, 20]);
    expect(stripAt(result, 'o', 's2').contentOffset).toEqual(rational(-2));
    const was = starts(eventsOf(play(before).plan, 'o:s2:'));
    expect(starts(eventsOf(play(result).plan, 'o:s2:'))).toEqual([10.5, 11, ...was]);
    expect(starts(eventsOf(play(result).plan, 'o:s1:'))).toEqual([
      4, 4.75, 5.5, 6.5, 7, 8, 8.75, 9.5,
    ]);
  });

  it('keeps at least one beat in each strip: the edge is clamped', () => {
    const far = ok(edge(touching(), 100)).blocks;
    expect(span(stripAt(far, 'o', 's1'))).toEqual([4, 19]);
    expect(span(stripAt(far, 'o', 's2'))).toEqual([19, 20]);
    const near = ok(edge(touching(), -100)).blocks;
    expect(span(stripAt(near, 'o', 's1'))).toEqual([4, 5]);
    expect(span(stripAt(near, 'o', 's2'))).toEqual([5, 20]);
  });

  it('a Stretch strip refits instead of moving its offset', () => {
    const blocks = world(
      clave([claveStrip(), claveStrip({ id: 's2', start: 12, duration: 8, mapping: 'stretch' })])
    );
    const result = ok(edge(blocks, 14)).blocks;
    expect(stripAt(result, 'o', 's2').contentOffset).toEqual(rational(0));
    expect(span(stripAt(result, 'o', 's2'))).toEqual([14, 20]);
  });

  it('refuses strips that do not touch, a missing strip, and strips too short to share an edge', () => {
    const apart = world(clave([claveStrip(), claveStrip({ id: 's2', start: 16, duration: 8 })]));
    expect(refused(edge(apart, 14))).toBe('These strips do not touch.');
    expect(refused(resizeSharedEdge(touching(), 'o', 's1', 'zz', rational(14), rational(1)))).toBe(
      'That strip is gone.'
    );
    const tiny = world(
      clave([claveStrip({ duration: 1 }), claveStrip({ id: 's2', start: 5, duration: 1 })])
    );
    expect(refused(edge(tiny, 5, 2))).toBe('These strips are too short to move their edge.');
  });

  it('the shared edge also works for strips under a parent (world time decides)', () => {
    const blocks = world(
      objectBlock('verse', { strips: [stripOf({ id: 'v', start: 10, duration: 64 })] }),
      objectBlock('kid', {
        strips: [
          {
            ...claveStrip({ id: 'a', start: 0, duration: 4 }),
            parentStrip: { objectId: 'verse', stripId: 'v' },
          },
          {
            ...claveStrip({ id: 'b', start: 4, duration: 4 }),
            parentStrip: { objectId: 'verse', stripId: 'v' },
          },
        ],
      })
    );
    // World: a 10..14, b 14..18. Drag the edge to world 16.
    const result = ok(resizeSharedEdge(blocks, 'kid', 'a', 'b', rational(16), rational(1))).blocks;
    expect(span(stripAt(result, 'kid', 'a'))).toEqual([0, 6]);
    expect(span(stripAt(result, 'kid', 'b'))).toEqual([6, 8]);
  });
});

describe('row 4b: a strip stops where it touches a neighbor and never pushes it', () => {
  const gap = () => world(clave([claveStrip(), claveStrip({ id: 's2', start: 16, duration: 8 })]));

  it('the room around a strip is the end of the strip before it and the start of the one after', () => {
    expect(stripRoom(gap(), 'o', 's1')).toEqual({ before: null, after: rational(16) });
    expect(stripRoom(gap(), 'o', 's2')).toEqual({ before: rational(12), after: null });
    expect(stripRoom(gap(), 'o', 'nope')).toBeNull();
  });

  it('S1 right edge toward 16: the typed duration is refused past it, accepted at it (touching)', () => {
    expect(refused(setTimeSpan(gap(), 'o', 's1', { duration: rational(14) }))).toBe(
      'No room here.'
    );
    const touching = ok(setTimeSpan(gap(), 'o', 's1', { duration: rational(12) })).blocks;
    expect(span(stripAt(touching, 'o', 's1'))).toEqual([4, 16]);
    expect(span(stripAt(touching, 'o', 's2'))).toEqual([16, 24]);
  });

  it('S2 dragged left over S1 stops at 12; S1 dragged right stops at 8 (it ends at 16)', () => {
    const left = ok(moveStrip(gap(), 'o', 's2', rational(6))).blocks;
    expect(span(stripAt(left, 'o', 's2'))).toEqual([12, 20]);
    expect(span(stripAt(left, 'o', 's1'))).toEqual([4, 12]);
    const right = ok(moveStrip(gap(), 'o', 's1', rational(30))).blocks;
    expect(span(stripAt(right, 'o', 's1'))).toEqual([8, 16]);
    expect(span(stripAt(right, 'o', 's2'))).toEqual([16, 24]);
  });

  it('moves freely where there is room, and a move onto a spot it cannot reach changes nothing', () => {
    const free = ok(moveStrip(gap(), 'o', 's2', rational(30))).blocks;
    expect(span(stripAt(free, 'o', 's2'))).toEqual([30, 38]);
    const stuck = ok(moveStrip(touchingPair(), 'o', 's2', rational(8))).blocks;
    expect(span(stripAt(stuck, 'o', 's2'))).toEqual([12, 20]);
  });

  it('typing a start that overlaps is refused with "No room here."', () => {
    expect(refused(setTimeSpan(gap(), 'o', 's2', { start: rational(10) }))).toBe('No room here.');
    expect(refused(setTimeSpan(gap(), 'o', 's2', { start: rational(12) }))).toBeNull();
  });

  it('strips of other objects never block each other', () => {
    const two = world(
      clave(),
      objectBlock('bass', {
        strips: [stripOf({ id: 'b', dataRef: { id: 'clave' }, start: 0, duration: 8 })],
      })
    );
    expect(
      refused(setTimeSpan(two, 'bass', 'b', { start: rational(6), duration: rational(8) }))
    ).toBeNull();
  });
});

function touchingPair() {
  return world(clave([claveStrip(), claveStrip({ id: 's2', start: 12, duration: 8 })]));
}

describe('row 4c: a strip moves to another object row', () => {
  const rows = () =>
    world(
      clave([
        claveStrip({
          mapping: 'stretch',
          modifiers: [modifierOf('m1', MELODICIZE_ID, { pitches: 'P' })],
        }),
        claveStrip({
          id: 's2',
          start: 16,
          duration: 8,
          mapping: 'stretch',
          modifiers: [modifierOf('m2', MELODICIZE_ID, { pitches: 'P' })],
        }),
      ]),
      objectBlock(
        'bass',
        { strips: [stripOf({ id: 'b1', dataRef: { id: 'clave' }, start: 0, duration: 8 })] },
        'Bass'
      )
    );

  it('S2 (16 to 24) joins Bass at the same position, keeping data, mapping and modifiers', () => {
    const result = ok(moveStripToObject(rows(), env(), 'o', 's2', 'bass'));
    expect(stripsOf(result.blocks, 'o').map((strip) => strip.id)).toEqual(['s1']);
    expect(stripsOf(result.blocks, 'bass').map((strip) => strip.id)).toEqual(['b1', 's2']);
    const moved = stripAt(result.blocks, 'bass', 's2');
    expect(span(moved)).toEqual([16, 24]);
    expect(moved.dataRef).toEqual({ id: 'clave' });
    expect(moved.mapping).toBe('stretch');
    expect(moved.modifiers.map((modifier) => modifier.id)).toEqual(['m2']);
    expect(result.blocks.every((block) => validateBlock(block) === null)).toBe(true);
    // The pitch set now lists Bass as the owner of that modifier slot.
    expect(
      dataBlockUsers(project(result.blocks), 'P').map((user) => [user.ownerId, user.slot])
    ).toEqual([
      ['o', 'strip:s1:modifier:m1:pitches'],
      ['bass', 'strip:s2:modifier:m2:pitches'],
    ]);
  });

  it('dropped where Bass has no room, it is refused and nothing changes', () => {
    const crowded = world(
      clave([claveStrip({ id: 's2', start: 16, duration: 8 })]),
      objectBlock('bass', {
        strips: [stripOf({ id: 'b1', dataRef: { id: 'clave' }, start: 12, duration: 8 })],
      })
    );
    expect(refused(moveStripToObject(crowded, env(), 'o', 's2', 'bass'))).toBe('No room here.');
    // Touching is fine (20 is where b1 ends and s2 would have to start, it starts at 16: overlap).
    const touching = world(
      clave([claveStrip({ id: 's2', start: 16, duration: 8 })]),
      objectBlock('bass', {
        strips: [stripOf({ id: 'b1', dataRef: { id: 'clave' }, start: 8, duration: 8 })],
      })
    );
    expect(refused(moveStripToObject(touching, env(), 'o', 's2', 'bass'))).toBeNull();
  });

  it('refuses the same object, a missing strip and a missing target', () => {
    expect(refused(moveStripToObject(rows(), env(), 'o', 's2', 'o'))).toBe(
      'Choose another object to move the strip to.'
    );
    expect(refused(moveStripToObject(rows(), env(), 'o', 'nope', 'bass'))).toBe(
      'That strip is gone.'
    );
    expect(refused(moveStripToObject(rows(), env(), 'o', 's2', 'zz'))).toBe(
      'Select an object first.'
    );
  });

  it('Clave stays an object with no strips left; the whole move is one result (one undo step)', () => {
    const one = world(clave(), objectBlock('bass', { strips: [] }, 'Bass'));
    const result = moveStripToObject(one, env(), 'o', 's1', 'bass');
    expect(result.ok).toBe(true);
    const blocks = ok(result).blocks;
    expect(stripsOf(blocks, 'o')).toEqual([]);
    expect(span(stripAt(blocks, 'bass', 's1'))).toEqual([4, 12]);
    expect(blocks.every((block) => validateBlock(block) === null)).toBe(true);
    // It still sounds the same: now from Bass.
    expect(starts(play(blocks).plan.events)).toEqual(ATTACKS_4_TO_12);
  });

  it('children follow by strip id and keep their world start', () => {
    const blocks = world(
      clave([claveStrip({ id: 's2', start: 16, duration: 8 })]),
      objectBlock('bass', { strips: [stripOf({ id: 'b1', start: 0, duration: 8 })] }),
      objectBlock('kid', {
        strips: [
          {
            ...stripOf({
              id: 'k',
              dataRef: { id: 'clave' },
              start: 2,
              duration: 4,
              mapping: 'one-shot',
            }),
            parentStrip: { objectId: 'o', stripId: 's2' },
          },
        ],
      })
    );
    expect(rationalToNumber(stripWorldStart(blocks, 'kid', 'k')!)).toBe(18);
    const result = ok(moveStripToObject(blocks, env(), 'o', 's2', 'bass')).blocks;
    expect(stripAt(result, 'kid', 'k').parentStrip).toEqual({ objectId: 'bass', stripId: 's2' });
    expect(rationalToNumber(stripWorldStart(result, 'kid', 'k')!)).toBe(18);
    expect(validateBlock(result.find((block) => block.id === 'kid')!)).toBeNull();
  });

  it('a strip id already used in the target gets a new id, and its children follow it', () => {
    const blocks = world(
      clave([claveStrip({ id: 's2', start: 16, duration: 8 })]),
      objectBlock('bass', { strips: [stripOf({ id: 's2', start: 0, duration: 8 })] }),
      objectBlock('kid', {
        strips: [
          {
            ...stripOf({ id: 'k', start: 2, duration: 4 }),
            parentStrip: { objectId: 'o', stripId: 's2' },
          },
        ],
      })
    );
    const result = ok(moveStripToObject(blocks, env(), 'o', 's2', 'bass')).blocks;
    expect(stripsOf(result, 'bass').map((strip) => strip.id)).toEqual(['s2', 'n1']);
    expect(stripAt(result, 'kid', 'k').parentStrip).toEqual({ objectId: 'bass', stripId: 'n1' });
    expect(rationalToNumber(stripWorldStart(result, 'kid', 'k')!)).toBe(18);
  });
});

describe('row 6: a child strip is placed under a parent strip and cut at its end', () => {
  const family = () =>
    world(
      clave(),
      objectBlock('child', {
        strips: [
          {
            ...stripOf({ id: 'c1', dataRef: { id: 'clave' }, start: 4, duration: 8 }),
            parentStrip: { objectId: 'o', stripId: 's1' },
          },
        ],
      })
    );

  it('moving S1 from 4 to 20 moves C1 from world 8 to 24', () => {
    const before = family();
    expect(rationalToNumber(stripWorldStart(before, 'child', 'c1')!)).toBe(8);
    const moved = ok(moveStrip(before, 'o', 's1', rational(20))).blocks;
    expect(span(stripAt(moved, 'o', 's1'))).toEqual([20, 28]);
    expect(rationalToNumber(stripWorldStart(moved, 'child', 'c1')!)).toBe(24);
    expect(span(stripAt(moved, 'child', 'c1'))).toEqual([4, 12]);
  });

  it('C1 plays only to its parent strip end', () => {
    const { plan } = play(family());
    const kid = starts(eventsOf(plan, 'child:c1:'));
    // C1 loops from world 8; the parent strip ends at 12, so nothing sounds from 12 on.
    expect(kid).toEqual([8, 8.75, 9.5, 10.5, 11]);
    const moved = ok(moveStrip(family(), 'o', 's1', rational(20))).blocks;
    expect(starts(eventsOf(play(moved).plan, 'child:c1:'))).toEqual([24, 24.75, 25.5, 26.5, 27]);
  });

  it('setStripParent: refuses itself, a missing strip and a loop; clearing keeps the relative start', () => {
    const blocks = family();
    expect(refused(setStripParent(blocks, 'o', 's1', { objectId: 'o', stripId: 's1' }))).toBe(
      'A strip cannot be its own parent.'
    );
    expect(refused(setStripParent(blocks, 'o', 's1', { objectId: 'child', stripId: 'zz' }))).toBe(
      'A parent must be a strip.'
    );
    expect(
      refused(setStripParent(blocks, 'o', 's1', { objectId: 'child', stripId: 'c1' }))
    ).toMatch(/loop/);
    const set = ok(setStripParent(blocks, 'o', 's1', null)).blocks;
    expect(stripAt(set, 'o', 's1').parentStrip).toBeNull();
    // A parent in the same object is a strip like any other.
    const sibling = world(clave([claveStrip(), claveStrip({ id: 's2', start: 20, duration: 4 })]));
    const under = ok(setStripParent(sibling, 'o', 's2', { objectId: 'o', stripId: 's1' })).blocks;
    expect(rationalToNumber(stripWorldStart(under, 'o', 's2')!)).toBe(24);
  });

  it('a circular parent chain in stored data is silent with a warning, never a hang', () => {
    const blocks = world(
      objectBlock(
        'a',
        {
          strips: [
            {
              ...stripOf({ id: 'a1', dataRef: { id: 'clave' } }),
              parentStrip: { objectId: 'b', stripId: 'b1' },
            },
          ],
        },
        'A'
      ),
      objectBlock(
        'b',
        {
          strips: [
            {
              ...stripOf({ id: 'b1', dataRef: { id: 'clave' } }),
              parentStrip: { objectId: 'a', stripId: 'a1' },
            },
          ],
        },
        'B'
      )
    );
    const { plan, warnings } = play(blocks);
    expect(plan.events).toEqual([]);
    expect(warnings).toEqual([
      'Object "A" has a circular parent chain and is silent.',
      'Object "B" has a circular parent chain and is silent.',
    ]);
    expect(stripWorldStart(blocks, 'a', 'a1')).toBeNull();
  });
});

describe('row 7: deleting a parent strip (or its object) keeps the child in place', () => {
  const moved = () =>
    ok(
      moveStrip(
        world(
          clave(),
          objectBlock('child', {
            strips: [
              {
                ...stripOf({
                  id: 'c1',
                  dataRef: { id: 'clave' },
                  start: 4,
                  duration: 4,
                  mapping: 'one-shot',
                }),
                parentStrip: { objectId: 'o', stripId: 's1' },
              },
            ],
          })
        ),
        'o',
        's1',
        rational(20)
      )
    ).blocks;

  it('Delete strip S1: C1 stays at world 24 and becomes unparented', () => {
    const blocks = moved();
    expect(rationalToNumber(stripWorldStart(blocks, 'child', 'c1')!)).toBe(24);
    const next = ok(deleteStrip(blocks, 'o', 's1')).blocks;
    const kept = stripAt(next, 'child', 'c1');
    expect(kept.parentStrip).toBeNull();
    expect(rationalToNumber(kept.start)).toBe(24);
    expect(starts(play(next).plan.events)).toEqual([24, 24.75, 25.5, 26.5, 27]);
    expect(stripsOf(next, 'o')).toEqual([]);
    expect(next.every((block) => validateBlock(block) === null)).toBe(true);
  });

  it('Delete the object Clave: every strip placed under any of its strips keeps its place', () => {
    const blocks = world(
      clave([claveStrip({ start: 4 }), claveStrip({ id: 's2', start: 20, duration: 8 })]),
      objectBlock('c1', {
        strips: [
          {
            ...stripOf({ id: 'x', start: 1, duration: 4 }),
            parentStrip: { objectId: 'o', stripId: 's1' },
          },
          {
            ...stripOf({ id: 'y', start: 10, duration: 4 }),
            parentStrip: { objectId: 'o', stripId: 's2' },
          },
          stripOf({ id: 'z', start: 99, duration: 1 }),
        ],
      })
    );
    expect(
      ['x', 'y', 'z'].map((id) => rationalToNumber(stripWorldStart(blocks, 'c1', id)!))
    ).toEqual([5, 30, 99]);
    const next = deleteSelected(project(blocks), 'o').dataBlocks;
    expect(next.some((block) => block.id === 'o')).toBe(false);
    const strips = stripsOf(next, 'c1');
    expect(strips.map((strip) => strip.parentStrip)).toEqual([null, null, null]);
    expect(strips.map((strip) => rationalToNumber(strip.start))).toEqual([5, 30, 99]);
    expect(next.every((block) => validateBlock(block) === null)).toBe(true);
  });

  it('a grandparent chain: the child takes the parent strip world start (grandparent plus parent)', () => {
    const blocks = world(
      objectBlock('grand', { strips: [stripOf({ id: 'g', start: 10, duration: 100 })] }),
      objectBlock('parent', {
        strips: [
          {
            ...stripOf({ id: 'p', start: 6, duration: 64 }),
            parentStrip: { objectId: 'grand', stripId: 'g' },
          },
        ],
      }),
      objectBlock('child', {
        strips: [
          {
            ...stripOf({ id: 'k', start: 4, duration: 4 }),
            parentStrip: { objectId: 'parent', stripId: 'p' },
          },
        ],
      })
    );
    expect(rationalToNumber(stripWorldStart(blocks, 'child', 'k')!)).toBe(20);
    const noParent = deleteBlockFromProject(project(blocks), 'parent').dataBlocks;
    expect(rationalToNumber(stripWorldStart(noParent, 'child', 'k')!)).toBe(20);
    const noGrand = deleteBlockFromProject(project(blocks), 'grand').dataBlocks;
    expect(rationalToNumber(stripWorldStart(noGrand, 'parent', 'p')!)).toBe(16);
    expect(rationalToNumber(stripWorldStart(noGrand, 'child', 'k')!)).toBe(20);
  });

  it('deleting a strip leaves every other strip, and a strip of another parent, untouched', () => {
    const blocks = world(clave([claveStrip(), claveStrip({ id: 's2', start: 16, duration: 8 })]));
    const next = ok(deleteStrip(blocks, 'o', 's1')).blocks;
    expect(stripsOf(next, 'o')).toEqual([stripAt(blocks, 'o', 's2')]);
    expect(refused(deleteStrip(next, 'o', 's1'))).toBe('That strip is gone.');
  });
});

describe('row 9: mute', () => {
  const two = () => world(clave([claveStrip(), claveStrip({ id: 's2', start: 16, duration: 8 })]));

  it('mute the object: every strip is silent; the scene keeps its length', () => {
    const muted = ok(setMute(two(), 'o', true)).blocks;
    expect(play(muted).plan.events).toEqual([]);
    expect(planLength(muted)).toBe(24);
  });

  it('mute only S2: S1 still plays; S2 is silent but still counts for the length', () => {
    const muted = ok(setStripMute(two(), 'o', 's2', true)).blocks;
    const { plan } = play(muted);
    expect(starts(plan.events)).toEqual(ATTACKS_4_TO_12);
    expect(rationalToNumber(plan.duration.quarterNotes)).toBe(24);
    expect(stripAt(muted, 'o', 's1').mute).toBe(false);
    expect(refused(setStripMute(two(), 'o', 'zz', true))).toBe('That strip is gone.');
  });
});

describe('row 10: Apply works on one strip', () => {
  const stacked = () => {
    const e = env();
    const linked = ok(duplicateStripLinked(world(clave()), e, 'o', 's1')).blocks;
    const a = ok(addModifier(linked, e, 'o', 'n1', MELODICIZE_ID));
    return {
      e,
      blocks: ok(setModifierRef(a.blocks, 'o', 'n1', a.created[0], 'pitches', 'P')).blocks,
      modifierId: a.created[0],
    };
  };

  it('Apply on S2 top modifier bakes one cycle into "Clave (applied)" and points S2 at it; S1 is untouched', () => {
    const { e, blocks, modifierId } = stacked();
    const result = ok(applyModifier(blocks, e, 'o', 'n1', modifierId));
    const baked = result.blocks.find((block) => block.id === result.created[0])!;
    expect(baked.name).toBe('Clave (applied)');
    expect(baked.typeId).toBe('notes');
    expect(stripAt(result.blocks, 'o', 'n1').dataRef).toEqual({ id: baked.id });
    expect(stripAt(result.blocks, 'o', 'n1').modifiers).toEqual([]);
    expect(stripAt(result.blocks, 'o', 's1')).toBe(stripAt(blocks, 'o', 's1'));
    expect(pitches(eventsOf(play(result.blocks).plan, 'o:n1:'))).toEqual(
      pitches(eventsOf(play(blocks).plan, 'o:n1:'))
    );
    expect(result.blocks.every((block) => validateBlock(block) === null)).toBe(true);
  });

  it('Apply All acts on the strip it names, and refuses a missing strip', () => {
    const { e, blocks } = stacked();
    const result = ok(applyAll(blocks, e, 'o', 'n1'));
    expect(stripAt(result.blocks, 'o', 'n1').modifiers).toEqual([]);
    expect(stripAt(result.blocks, 'o', 's1')).toBe(stripAt(blocks, 'o', 's1'));
    expect(refused(applyAll(blocks, e, 'o', 'zz'))).toBe('That strip is gone.');
    expect(refused(applyAll(blocks, e, 'o', 's1'))).toBe('There are no modifiers to apply.');
  });
});

describe('the scene is as long as its last strip, and strips are owners', () => {
  it('scene length = the end of the last strip, muted ones and Empties included', () => {
    expect(
      planLength(world(clave([claveStrip(), claveStrip({ id: 's2', start: 30, duration: 2 })])))
    ).toBe(32);
    expect(planLength(world(clave([])))).toBe(0);
  });

  it('deleting the data-block blanks the strip ref: the strip stays, silent', () => {
    const blocks = world(clave([claveStrip(), claveStrip({ id: 's2', start: 16, duration: 8 })]));
    const next = deleteBlockFromProject(project(blocks), 'clave').dataBlocks;
    expect(stripsOf(next, 'o').map((strip) => strip.dataRef)).toEqual([null, null]);
    expect(play(next).plan.events).toEqual([]);
    expect(next.every((block) => validateBlock(block) === null)).toBe(true);
  });

  it('every strip is a user of its data-block under its own slot', () => {
    const blocks = world(clave([claveStrip(), claveStrip({ id: 's2', start: 16, duration: 8 })]));
    expect(
      dataBlockUsers(project(blocks), 'clave').map((user) => [user.ownerId, user.slot])
    ).toEqual([
      ['o', 'strip:s1:data'],
      ['o', 'strip:s2:data'],
    ]);
  });
});
