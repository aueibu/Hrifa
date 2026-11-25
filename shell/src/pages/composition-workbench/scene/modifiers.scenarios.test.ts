import { describe, expect, it, vi } from 'vitest';
import type { MusicalPerformancePlan } from '../audio/types';
import { auditionBlock } from '../dataBlocks/audition';
import { defaultAuditionContext } from '../dataBlocks/auditionPlans';
import {
  dataBlockUsers,
  deleteBlockFromProject,
  type RefsProject,
} from '../dataBlocks/dataBlockRefs';
import {
  blockRefs,
  repointBlockRef,
  validateBlock,
  type StoredDataBlock,
} from '../dataBlocks/registry';
import { melodicize, type PitchAllocation } from '../melodicization';
import { packet } from '../model';
import { rational, rationalToNumber } from '../musicalTime';
import { createSceneEvaluator, evaluateScene, modifierProblems } from './evaluateScene';
import {
  HARMONIZE_ID,
  MELODICIZE_ID,
  SNAP_TO_PITCH_SET_ID,
  getModifierDef,
  modifierDefs,
  registerModifier,
  runModifierStack,
} from './modifiers';
import {
  addModifier,
  applyAll,
  applyModifier,
  moveModifier,
  removeModifier,
  setModifierMute,
  setModifierParam,
  setModifierRef,
  type OpEnv,
  type SceneOpResult,
} from './sceneOps';
import {
  claveBlock,
  collectionBlock,
  modifierOf,
  notesBlock,
  objectBlock,
  pitchClassesBlock,
  pitchSetBlock,
  replaceBlock,
  sceneBlock,
} from './sceneTestHelpers';
import { objectDataOf, type ModifierInstance } from './sceneTypes';

const P = pitchSetBlock('P', [6000, 6400, 6700], 'P');
const CLAVE_ATTACKS = [0, 0.75, 1.5, 2.5, 3];
const TRITAVE = 1901.955;

/** The scene with one object "o" named Bass: its data and modifiers, over the given extra blocks. */
function world(
  primaryId: string | null,
  modifiers: ModifierInstance[],
  extra: StoredDataBlock[] = [],
  patch: Parameters<typeof objectBlock>[1] = {}
): StoredDataBlock[] {
  return [
    claveBlock(),
    P,
    ...extra,
    objectBlock(
      'o',
      { primaryDataRef: primaryId === null ? null : { id: primaryId }, modifiers, ...patch },
      'Bass'
    ),
    collectionBlock('root', ['o']),
    sceneBlock('scene', 'root'),
  ];
}

/** [start, pitch] pairs of a plan, in order. */
const sounded = (plan: MusicalPerformancePlan) =>
  plan.events.map((event) => [rationalToNumber(event.at.quarterNotes), event.pitchMidicents]);
const pitchesOf = (plan: MusicalPerformancePlan) => sounded(plan).map(([, pitch]) => pitch);
const startsOf = (plan: MusicalPerformancePlan) => sounded(plan).map(([start]) => start);
const play = (blocks: StoredDataBlock[]) => evaluateScene(blocks, 'scene');

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

/** The object 'o'. */
const objectOf = (blocks: readonly StoredDataBlock[]) =>
  objectDataOf(blocks.find((block) => block.id === 'o'))!;

describe('the registry', () => {
  it('holds the three modifiers with their input kinds and reference slots', () => {
    expect(modifierDefs().map((def) => [def.id, def.label, def.input, def.output])).toEqual([
      [MELODICIZE_ID, 'Melodicize', 'rhythm', 'notes'],
      [SNAP_TO_PITCH_SET_ID, 'Snap to Pitch Set', 'notes', 'notes'],
      [HARMONIZE_ID, 'Harmonize', 'notes', 'notes'],
    ]);
    expect(getModifierDef(MELODICIZE_ID)?.refSlots).toEqual([
      { slot: 'pitches', label: 'Pitch set', accepts: ['pitch-set', 'pitch-classes'] },
    ]);
    expect(getModifierDef(HARMONIZE_ID)?.refSlots[0].slot).toBe('set');
  });

  it('a duplicate id throws', () => {
    const def = getModifierDef(HARMONIZE_ID)!;
    expect(() => registerModifier(def)).toThrow(/already registered/);
  });

  it('defaults: Cycle and 100 percent; repeat on, period 1200, Voices 3, Step 1', () => {
    expect(getModifierDef(MELODICIZE_ID)!.defaults()).toEqual({
      allocation: 'cycle',
      articulationPercent: 100,
    });
    expect(getModifierDef(SNAP_TO_PITCH_SET_ID)!.defaults()).toEqual({
      repeat: true,
      period: 1200,
    });
    expect(getModifierDef(HARMONIZE_ID)!.defaults()).toEqual({
      voices: 3,
      step: 1,
      repeat: true,
      period: 1200,
    });
  });

  it('validates params: voices 2 to 8, step 1 to 4, period above zero, allocation one of four', () => {
    const harmonize = getModifierDef(HARMONIZE_ID)!;
    const good = harmonize.defaults();
    expect(harmonize.validateParams(good)).toBeNull();
    expect(harmonize.validateParams({ ...good, voices: 1 })).not.toBeNull();
    expect(harmonize.validateParams({ ...good, voices: 9 })).not.toBeNull();
    expect(harmonize.validateParams({ ...good, voices: 2.5 })).not.toBeNull();
    expect(harmonize.validateParams({ ...good, step: 0 })).not.toBeNull();
    expect(harmonize.validateParams({ ...good, step: 5 })).not.toBeNull();
    expect(harmonize.validateParams({ ...good, period: 0 })).not.toBeNull();
    expect(harmonize.validateParams({ ...good, period: TRITAVE })).toBeNull();
    const melodicizeDef = getModifierDef(MELODICIZE_ID)!;
    expect(melodicizeDef.validateParams({ allocation: 'zip', articulationPercent: 50 })).toBeNull();
    expect(
      melodicizeDef.validateParams({ allocation: 'rows', articulationPercent: 50 })
    ).not.toBeNull();
    expect(
      melodicizeDef.validateParams({ allocation: 'zip', articulationPercent: 0 })
    ).not.toBeNull();
  });
});

describe('row 2: Rhythm object + Melodicize with P', () => {
  const blocks = world('clave', [modifierOf('m1', MELODICIZE_ID, { pitches: 'P' })]);

  it('five notes at the five clave attack times: 6000, 6400, 6700, 6000, 6400', () => {
    const { plan, warnings } = play(blocks);
    expect(warnings).toEqual([]);
    expect(startsOf(plan)).toEqual(CLAVE_ATTACKS);
    expect(pitchesOf(plan)).toEqual([6000, 6400, 6700, 6000, 6400]);
  });

  it.each(['cycle', 'cycle-rhythm', 'zip', 'cartesian'] as PitchAllocation[])(
    'Allocation %s runs and matches the node melodicize for the same input',
    (allocation) => {
      const byId = new Map(blocks.map((block) => [block.id, block]));
      const modifier = modifierOf('m1', MELODICIZE_ID, { pitches: 'P' }, { allocation });
      const result = runModifierStack(byId.get('clave')!, [modifier], byId, defaultAuditionContext);
      if (!result.ok) {
        throw new Error('the stack must run');
      }
      const clavePacket = claveBlock().payload.packet;
      const expected = melodicize({
        instanceId: 'm1',
        rhythm: { ...clavePacket, role: 'interOnset' },
        pitches: P.payload.packet,
        allocation,
        pulseUnit: defaultAuditionContext.pulseUnit,
        articulationPercent: 100,
      });
      expect(expected.errors).toEqual([]);
      expect(result.packet).toEqual(expected.packet);
    }
  );

  it('non-12: Pitch classes of a 19-EDO block are placed above C4 in 19-EDO steps', () => {
    const classes = pitchClassesBlock('pc19', [0, 4, 8], 19);
    const { plan } = play(
      world('clave', [modifierOf('m1', MELODICIZE_ID, { pitches: 'pc19' })], [classes])
    );
    const pitches = pitchesOf(plan) as number[];
    expect(pitches).toHaveLength(5);
    expect(pitches[0]).toBeCloseTo(6000, 9);
    expect(pitches[1]).toBeCloseTo(6000 + 4 * (1200 / 19), 9);
    expect(pitches[2]).toBeCloseTo(6000 + 8 * (1200 / 19), 9);
    expect(pitches[3]).toBeCloseTo(6000, 9);
  });

  it('non-12: quarter-tone pitches in a Pitch set play as stored', () => {
    const quarter = pitchSetBlock('Q', [6050, 6350]);
    const { plan } = play(
      world('clave', [modifierOf('m1', MELODICIZE_ID, { pitches: 'Q' })], [quarter])
    );
    expect(pitchesOf(plan)).toEqual([6050, 6350, 6050, 6350, 6050]);
  });
});

describe('row 3: Snap to Pitch Set', () => {
  const two = notesBlock('n', [
    { at: 0, pitches: [6250] },
    { at: 1, pitches: [7250] },
  ]);
  const snap = (params: Record<string, unknown> = {}, set = 'P', extra: StoredDataBlock[] = []) =>
    play(world('n', [modifierOf('m1', SNAP_TO_PITCH_SET_ID, { set }, params)], [two, ...extra]));

  it('Repeat ON (default): 6250 to 6400, 7250 to 7200', () => {
    expect(pitchesOf(snap().plan)).toEqual([6400, 7200]);
  });

  it('Repeat OFF: 6250 to 6400, 7250 to 6700', () => {
    expect(pitchesOf(snap({ repeat: false }).plan)).toEqual([6400, 6700]);
  });

  it('non-12: a tritave period moves 7950 to 7901.955, not 7900', () => {
    const high = notesBlock('n', [{ at: 0, pitches: [7950] }]);
    const run = (period: number) =>
      play(world('n', [modifierOf('m1', SNAP_TO_PITCH_SET_ID, { set: 'P' }, { period })], [high]));
    expect(pitchesOf(run(1200).plan)).toEqual([7900]);
    expect(pitchesOf(run(TRITAVE).plan)[0]).toBeCloseTo(6000 + TRITAVE, 6);
  });

  it('non-12: quarter-tone pitches snap by cents (6050 is a tie and goes down)', () => {
    const quarter = notesBlock('n', [
      { at: 0, pitches: [6050] },
      { at: 1, pitches: [6240] },
    ]);
    const set = pitchSetBlock('Q', [6000, 6100, 6350]);
    const { plan } = play(
      world(
        'n',
        [modifierOf('m1', SNAP_TO_PITCH_SET_ID, { set: 'Q' }, { repeat: false })],
        [quarter, set]
      )
    );
    expect(pitchesOf(plan)).toEqual([6000, 6350]);
  });

  it('non-12: a 19-EDO Pitch classes set always repeats, whatever Repeat says', () => {
    const classes = pitchClassesBlock('pc19', [0, 4, 8, 11], 19);
    const notes = notesBlock('n', [
      { at: 0, pitches: [6300] },
      { at: 1, pitches: [7260] },
    ]);
    const { plan } = play(
      world(
        'n',
        [modifierOf('m1', SNAP_TO_PITCH_SET_ID, { set: 'pc19' }, { repeat: false })],
        [notes, classes]
      )
    );
    const pitches = pitchesOf(plan) as number[];
    expect(pitches[0]).toBeCloseTo(6000 + 4 * (1200 / 19), 9);
    expect(pitches[1]).toBeCloseTo(7200, 9);
  });

  it('keeps start, length and amplitude, and appends a provenance step', () => {
    const byId = new Map([...world('n', [], [two])].map((block) => [block.id, block]));
    const result = runModifierStack(
      byId.get('n')!,
      [modifierOf('m1', SNAP_TO_PITCH_SET_ID, { set: 'P' })],
      byId,
      defaultAuditionContext
    );
    if (!result.ok) {
      throw new Error('must run');
    }
    const item = result.packet.items[0] as {
      value: { pitches: number[] };
      provenance: { transformation: string }[];
    };
    expect(item.value.pitches).toEqual([6400]);
    expect(item.provenance.at(-1)?.transformation).toBe('snap-to-pitch-set');
  });

  it('an empty set is a problem, not a crash', () => {
    const empty = pitchSetBlock('E', []);
    const result = snap({}, 'E', [empty]);
    expect(result.plan.events).toEqual([]);
    expect(result.warnings).toEqual(['Object "Bass": Snap to Pitch Set: Pitch set is empty']);
  });
});

describe('row 4: Harmonize', () => {
  const run = (
    pitches: number[][],
    params: Record<string, unknown> = {},
    set = 'P',
    extra: StoredDataBlock[] = []
  ) => {
    const notes = notesBlock(
      'n',
      pitches.map((pitch, index) => ({ at: index, pitches: pitch }))
    );
    return play(world('n', [modifierOf('m1', HARMONIZE_ID, { set }, params)], [notes, ...extra]));
  };

  it('6000 gives 6000, 6400, 6700; 6400 gives 6400, 6700, 7200', () => {
    expect(sounded(run([[6000], [6400]]).plan)).toEqual([
      [0, 6000],
      [0, 6400],
      [0, 6700],
      [1, 6400],
      [1, 6700],
      [1, 7200],
    ]);
  });

  it('Step 2: 6000 gives 6000, 6700, 7600', () => {
    expect(pitchesOf(run([[6000]], { step: 2 }).plan)).toEqual([6000, 6700, 7600]);
  });

  it('Repeat off adds fewer, no wrap: 6400 gives 6400, 6700', () => {
    expect(pitchesOf(run([[6400]], { repeat: false }).plan)).toEqual([6400, 6700]);
  });

  it('added pitches ride in the SAME note event (start, length, amplitude)', () => {
    const notes = notesBlock('n', [{ at: 1, pitches: [6000], velocity: 0.5, length: 2 }]);
    const byId = new Map(world('n', [], [notes]).map((block) => [block.id, block]));
    const result = runModifierStack(
      byId.get('n')!,
      [modifierOf('m1', HARMONIZE_ID, { set: 'P' })],
      byId,
      defaultAuditionContext
    );
    if (!result.ok) {
      throw new Error('must run');
    }
    expect(result.packet.items).toHaveLength(1);
    const value = result.packet.items[0].value as {
      onset: { quarterNotes: unknown };
      duration: { quarterNotes: unknown };
      velocity: number;
      pitches: number[];
    };
    expect(value.pitches).toEqual([6000, 6400, 6700]);
    expect(value.velocity).toBe(0.5);
    expect(rationalToNumber(value.onset.quarterNotes as never)).toBe(1);
    expect(rationalToNumber(value.duration.quarterNotes as never)).toBe(2);
  });

  it('non-12: a tritave period and a 19-EDO Pitch classes set', () => {
    expect(
      pitchesOf(run([[6000]], { voices: 4, period: TRITAVE }).plan).map(Number)[3]
    ).toBeCloseTo(6000 + TRITAVE, 6);
    const classes = pitchClassesBlock('pc19', [0, 7, 11], 19);
    const pitches = pitchesOf(run([[6000]], {}, 'pc19', [classes]).plan) as number[];
    expect(pitches[1]).toBeCloseTo(6000 + 7 * (1200 / 19), 9);
    expect(pitches[2]).toBeCloseTo(6000 + 11 * (1200 / 19), 9);
  });

  it('non-12: quarter-tone notes and members', () => {
    const quarter = pitchSetBlock('Q', [6050, 6350]);
    expect(pitchesOf(run([[6050]], {}, 'Q', [quarter]).plan)).toEqual([6050, 6350, 7250]);
  });
});

describe('stacks, order, mute (rows 1, 5, 6)', () => {
  const stack = (muteHarmonize = false) => [
    modifierOf('m1', MELODICIZE_ID, { pitches: 'P' }),
    modifierOf('m2', HARMONIZE_ID, { set: 'P' }, {}, muteHarmonize),
  ];

  it('Rhythm, Melodicize, Harmonize: 15 pitches over 5 events', () => {
    const { plan } = play(world('clave', stack()));
    expect(plan.events).toHaveLength(15);
    expect(new Set(startsOf(plan))).toEqual(new Set(CLAVE_ATTACKS));
  });

  it('a muted modifier is skipped: five single notes', () => {
    const { plan, warnings } = play(world('clave', stack(true)));
    expect(warnings).toEqual([]);
    expect(pitchesOf(plan)).toEqual([6000, 6400, 6700, 6000, 6400]);
  });

  it('Rhythm, Harmonize, Melodicize (wrong order): silent with the exact message', () => {
    const { plan, warnings } = play(world('clave', [stack()[1], stack()[0]]));
    expect(plan.events).toEqual([]);
    expect(warnings).toEqual(['Object "Bass": Harmonize needs Notes; the data so far is a Rhythm']);
  });

  it('Melodicize on Notes is silent too, and Properties can ask why', () => {
    const blocks = world(
      'n',
      [modifierOf('m1', MELODICIZE_ID, { pitches: 'P' })],
      [notesBlock('n', [{ at: 0, pitches: [6000] }])]
    );
    expect(play(blocks).warnings).toEqual([
      'Object "Bass": Melodicize needs Rhythm; the data so far is Notes',
    ]);
    expect(modifierProblems(blocks, 'o')).toEqual([
      { modifierId: 'm1', text: 'Melodicize needs Rhythm; the data so far is Notes' },
    ]);
  });

  it('a Pitch set as the object data names its own kind', () => {
    const blocks = world('P', [modifierOf('m1', HARMONIZE_ID, { set: 'P' })]);
    expect(play(blocks).warnings).toEqual([
      'Object "Bass": Harmonize needs Notes; the data so far is a Pitch set',
    ]);
  });

  it('invalid params, a blank slot and a wrong-type block each silence the object with a reason', () => {
    const bad = modifierOf('m1', HARMONIZE_ID, { set: 'P' }, { voices: 99 });
    expect(play(world('clave', [bad])).warnings[0]).toMatch(/^Object "Bass": Harmonize: Voices/);
    const blank = modifierOf('m1', MELODICIZE_ID, {});
    expect(play(world('clave', [blank])).warnings).toEqual([
      'Object "Bass": Melodicize: Pitch set is missing',
    ]);
    const wrong = modifierOf('m1', MELODICIZE_ID, { pitches: 'clave' });
    expect(play(world('clave', [wrong])).warnings[0]).toMatch(
      /^Object "Bass": Melodicize: Pitch set must be a Pitch set or Pitch classes data-block; "Clave" is a Rhythm$/
    );
  });

  it('every static problem of the stack is listed, and an unknown modifier is a problem', () => {
    const blocks = world('clave', [
      modifierOf('m1', MELODICIZE_ID, {}),
      { id: 'm2', type: 'mystery', mute: false, params: {}, refs: {} },
    ]);
    expect(modifierProblems(blocks, 'o').map((problem) => problem.modifierId)).toEqual([
      'm1',
      'm2',
    ]);
    expect(modifierProblems(world('clave', []), 'o')).toEqual([]);
  });

  it('an object with an old empty modifier list plays and validates as before', () => {
    const blocks = world('clave', []);
    expect(blocks.every((block) => validateBlock(block) === null)).toBe(true);
    expect(startsOf(play(blocks).plan).slice(0, 5)).toEqual(CLAVE_ATTACKS);
  });
});

describe('a modifier pitch set is a reference (users, mapRefs, delete)', () => {
  const blocks = world('clave', [modifierOf('m1', MELODICIZE_ID, { pitches: 'P' })]);
  const project = (list: StoredDataBlock[]): RefsProject => ({ dataBlocks: list, instances: [] });

  it('exposes the slot modifier:<id>:<slot>, only for non-blank refs', () => {
    const object = blocks.find((block) => block.id === 'o')!;
    expect(blockRefs(object).map((entry) => entry.slot)).toEqual(['data', 'modifier:m1:pitches']);
    const blank = world('clave', [modifierOf('m1', MELODICIZE_ID, {})]).find((b) => b.id === 'o')!;
    expect(blockRefs(blank).map((entry) => entry.slot)).toEqual(['data']);
  });

  it('the pitch set shows the object as a user', () => {
    expect(
      dataBlockUsers(project(blocks), 'P').map((entry) => [entry.ownerId, entry.slot])
    ).toEqual([['o', 'modifier:m1:pitches']]);
  });

  it('a mapped null clears the slot and the modifier stays', () => {
    const object = blocks.find((block) => block.id === 'o')!;
    const cleared = repointBlockRef(
      object,
      { slot: 'modifier:m1:pitches', ref: { id: 'P' } },
      null
    );
    const data = objectDataOf(cleared)!;
    expect(data.modifiers).toHaveLength(1);
    expect(data.modifiers[0].refs).toEqual({ pitches: null });
    expect(validateBlock(cleared)).toBeNull();
  });

  it('deleting the pitch set blanks the slot, keeps the modifier and silences the object', () => {
    const next = deleteBlockFromProject(project(blocks), 'P').dataBlocks;
    expect(objectOf(next).modifiers.map((modifier) => modifier.refs)).toEqual([{ pitches: null }]);
    const { plan, warnings } = play(next);
    expect(plan.events).toEqual([]);
    expect(warnings).toEqual(['Object "Bass": Melodicize: Pitch set is missing']);
  });
});

describe('the modifier ops', () => {
  const start = () => world('clave', []);

  it('Add Modifier appends at the BOTTOM with defaults and empty refs; each ref slot starts blank', () => {
    const e = env();
    const a = ok(addModifier(start(), e, 'o', MELODICIZE_ID));
    const b = ok(addModifier(a.blocks, e, 'o', HARMONIZE_ID));
    const modifiers = objectOf(b.blocks).modifiers;
    expect(modifiers.map((modifier) => modifier.type)).toEqual([MELODICIZE_ID, HARMONIZE_ID]);
    expect(modifiers[1]).toEqual({
      id: b.created[0],
      type: HARMONIZE_ID,
      mute: false,
      params: { voices: 3, step: 1, repeat: true, period: 1200 },
      refs: { set: null },
    });
    expect(validateBlock(b.blocks.find((block) => block.id === 'o')!)).toBeNull();
    expect(addModifier(start(), e, 'o', 'nope')).toEqual({
      ok: false,
      error: 'That modifier does not exist.',
    });
  });

  it('move, mute and remove', () => {
    const e = env();
    let blocks = ok(addModifier(start(), e, 'o', MELODICIZE_ID)).blocks;
    blocks = ok(addModifier(blocks, e, 'o', HARMONIZE_ID)).blocks;
    const [first, second] = objectOf(blocks).modifiers.map((modifier) => modifier.id);
    const moved = ok(moveModifier(blocks, 'o', second, 'up')).blocks;
    expect(objectOf(moved).modifiers.map((modifier) => modifier.id)).toEqual([second, first]);
    expect(moveModifier(moved, 'o', second, 'up').ok).toBe(false);
    expect(moveModifier(moved, 'o', first, 'down').ok).toBe(false);
    const muted = ok(setModifierMute(moved, 'o', first, true)).blocks;
    expect(objectOf(muted).modifiers[1].mute).toBe(true);
    const removed = ok(removeModifier(muted, 'o', first)).blocks;
    expect(objectOf(removed).modifiers.map((modifier) => modifier.id)).toEqual([second]);
    expect(removeModifier(removed, 'o', first)).toEqual({
      ok: false,
      error: 'That modifier is gone.',
    });
  });

  it('a setting is validated; a reference must exist and be of an accepted type', () => {
    const e = env();
    const added = ok(addModifier(start(), e, 'o', HARMONIZE_ID));
    const id = added.created[0];
    const good = ok(setModifierParam(added.blocks, 'o', id, 'voices', 5));
    expect(objectOf(good.blocks).modifiers[0].params.voices).toBe(5);
    expect(ok(setModifierParam(good.blocks, 'o', id, 'period', TRITAVE)).ok).toBe(true);
    expect(setModifierParam(good.blocks, 'o', id, 'voices', 9)).toEqual({
      ok: false,
      error: 'Voices must be a whole number from 2 to 8.',
    });
    expect(setModifierParam(good.blocks, 'o', id, 'colour', 1).ok).toBe(false);

    const pointed = ok(setModifierRef(added.blocks, 'o', id, 'set', 'P'));
    expect(objectOf(pointed.blocks).modifiers[0].refs).toEqual({ set: { id: 'P' } });
    expect(ok(setModifierRef(pointed.blocks, 'o', id, 'set', null)).ok).toBe(true);
    expect(setModifierRef(added.blocks, 'o', id, 'set', 'clave')).toEqual({
      ok: false,
      error: 'Pitch set must be a Pitch set or Pitch classes data-block.',
    });
    expect(setModifierRef(added.blocks, 'o', id, 'set', 'missing').ok).toBe(false);
    expect(setModifierRef(added.blocks, 'o', id, 'bogus', 'P').ok).toBe(false);
  });
});

describe('row 7: Apply and Apply All', () => {
  const stack = () => [
    modifierOf('m1', MELODICIZE_ID, { pitches: 'P' }),
    modifierOf('m2', HARMONIZE_ID, { set: 'P' }),
  ];
  const before = () => world('clave', stack(), [], { mapping: 'stretch', duration: 8 });

  it('Apply is refused on a lower modifier with the exact text', () => {
    expect(applyModifier(before(), env(), 'o', 'm2')).toEqual({
      ok: false,
      error: 'Apply the modifiers above it first.',
    });
  });

  it('applying the top one bakes a Notes block, leaves Harmonize in the stack, keeps the sound', () => {
    const blocks = before();
    const applied = ok(applyModifier(blocks, env(), 'o', 'm1'));
    const baked = applied.blocks.find((block) => block.id === applied.created[0])!;
    expect(baked.typeId).toBe('notes');
    expect(baked.name).toBe('Clave (applied)');
    expect(baked.origin).toEqual({ nodeInstance: 'o' });
    expect(baked.lineage?.derivedFrom).toMatchObject({ dataBlockId: 'clave' });
    expect(validateBlock(baked)).toBeNull();
    expect(baked.payload.kind === 'packet' && baked.payload.packet.items).toHaveLength(5);
    const data = objectOf(applied.blocks);
    expect(data.primaryDataRef).toEqual({ id: baked.id });
    expect(data.modifiers.map((modifier) => modifier.id)).toEqual(['m2']);
    expect(data.mapping).toBe('stretch');
    // The original data-blocks are the same objects, and the object sounds the same.
    expect(applied.blocks.find((block) => block.id === 'clave')).toBe(
      blocks.find((b) => b.id === 'clave')
    );
    expect(applied.blocks.find((block) => block.id === 'P')).toBe(P);
    expect(sounded(play(applied.blocks).plan)).toEqual(sounded(play(blocks).plan));

    // Now Harmonize is on top; Apply All bakes the rest.
    const all = ok(applyAll(applied.blocks, env(), 'o'));
    expect(objectOf(all.blocks).modifiers).toEqual([]);
    expect(sounded(play(all.blocks).plan)).toEqual(sounded(play(blocks).plan));
  });

  it('Apply All bakes the whole stack: 15 pitches in 5 events, mapping kept, originals untouched', () => {
    const blocks = before();
    const all = ok(applyAll(blocks, env(), 'o'));
    const baked = all.blocks.find((block) => block.id === all.created[0])!;
    if (baked.payload.kind !== 'packet') {
      throw new Error('a packet');
    }
    const items = baked.payload.packet.items as { value: { pitches: number[] } }[];
    expect(items).toHaveLength(5);
    expect(items.flatMap((item) => item.value.pitches)).toHaveLength(15);
    expect(baked.name).toBe('Clave (applied)');
    const data = objectOf(all.blocks);
    expect(data.modifiers).toEqual([]);
    expect(data.mapping).toBe('stretch');
    expect(data.primaryDataRef).toEqual({ id: baked.id });
    expect(all.blocks.find((block) => block.id === 'clave')).toBe(
      blocks.find((b) => b.id === 'clave')
    );
    // Equal to the evaluated stack, event for event.
    expect(
      play(all.blocks).plan.events.map((event) => [event.at, event.duration, event.pitchMidicents])
    ).toEqual(
      play(blocks).plan.events.map((event) => [event.at, event.duration, event.pitchMidicents])
    );
    // Baked Notes can be modified again: Snap to P then Apply All.
    const e = env();
    const added = ok(addModifier(all.blocks, e, 'o', SNAP_TO_PITCH_SET_ID));
    const pointed = ok(setModifierRef(added.blocks, 'o', added.created[0], 'set', 'P'));
    const again = ok(applyAll(pointed.blocks, e, 'o'));
    expect(objectOf(again.blocks).modifiers).toEqual([]);
    expect(again.blocks.find((block) => block.id === again.created[0])?.name).toBe(
      'Clave (applied) (applied)'
    );
  });

  it('names stay unique per type', () => {
    const first = ok(applyAll(before(), env(), 'o'));
    const second = ok(
      applyAll(
        replaceBlock(
          first.blocks,
          objectBlock('o', { primaryDataRef: { id: 'clave' }, modifiers: stack() }, 'Bass')
        ),
        env(),
        'o'
      )
    );
    const name = second.blocks.find((block) => block.id === second.created[0])!.name;
    expect(name).toBe('Clave (applied).001');
  });

  it('Apply on a muted top modifier is refused; Apply All drops muted ones', () => {
    const mutedTop = world('clave', [
      modifierOf('m1', MELODICIZE_ID, { pitches: 'P' }, {}, true),
      modifierOf('m2', MELODICIZE_ID, { pitches: 'P' }),
    ]);
    expect(applyModifier(mutedTop, env(), 'o', 'm1')).toEqual({
      ok: false,
      error: 'Turn the modifier on to apply it.',
    });

    const half = world('clave', [
      modifierOf('m1', MELODICIZE_ID, { pitches: 'P' }),
      modifierOf('m2', HARMONIZE_ID, { set: 'P' }, {}, true),
    ]);
    const all = ok(applyAll(half, env(), 'o'));
    const baked = all.blocks.find((block) => block.id === all.created[0])!;
    expect(baked.payload.kind === 'packet' && baked.payload.packet.items).toHaveLength(5);
    expect(
      baked.payload.kind === 'packet' &&
        (baked.payload.packet.items as { value: { pitches: number[] } }[]).every(
          (item) => item.value.pitches.length === 1
        )
    ).toBe(true);
    const onlyMuted = world('clave', [modifierOf('m1', MELODICIZE_ID, { pitches: 'P' }, {}, true)]);
    const cleared = ok(applyAll(onlyMuted, env(), 'o'));
    expect(objectOf(cleared.blocks).modifiers).toEqual([]);
    expect(objectOf(cleared.blocks).primaryDataRef).toEqual({ id: 'clave' });
  });

  it('a stack with a problem refuses to apply, with the problem text', () => {
    const broken = world('clave', [
      modifierOf('m1', MELODICIZE_ID, { pitches: 'P' }),
      modifierOf('m2', MELODICIZE_ID, { pitches: 'P' }),
    ]);
    expect(applyAll(broken, env(), 'o')).toEqual({
      ok: false,
      error: 'Melodicize needs Rhythm; the data so far is Notes',
    });
    const blank = world('clave', [modifierOf('m1', MELODICIZE_ID, {})]);
    expect(applyModifier(blank, env(), 'o', 'm1')).toEqual({
      ok: false,
      error: 'Melodicize: Pitch set is missing',
    });
    expect(applyAll(world('clave', []), env(), 'o').ok).toBe(false);
  });
});

describe('the memo', () => {
  const stack = [modifierOf('m1', MELODICIZE_ID, { pitches: 'P' })];
  const setup = () => {
    const spy = vi.fn(auditionBlock);
    return { spy, evaluator: createSceneEvaluator({ buildCycle: spy }) };
  };
  const withObject = (blocks: StoredDataBlock[], patch: Parameters<typeof objectBlock>[1]) =>
    replaceBlock(
      blocks,
      objectBlock('o', { primaryDataRef: { id: 'clave' }, modifiers: stack, ...patch }, 'Bass')
    );

  it('start, duration and mapping do not rebuild; a pitch set, a setting, a mute or the order do', () => {
    const { spy, evaluator } = setup();
    const blocks = world('clave', stack, [], { duration: 16 });
    evaluator.evaluate(blocks, 'scene');
    expect(spy).toHaveBeenCalledTimes(1);

    const moved = withObject(blocks, { duration: 16, start: 8 });
    expect(startsOf(evaluator.evaluate(moved, 'scene').plan)[0]).toBe(8);
    const resized = withObject(moved, { duration: 32, start: 8 });
    evaluator.evaluate(resized, 'scene');
    const mapped = withObject(resized, { duration: 32, start: 8, mapping: 'stretch' });
    evaluator.evaluate(mapped, 'scene');
    expect(spy).toHaveBeenCalledTimes(1);

    const edited = replaceBlock(mapped, pitchSetBlock('P', [6000, 6500], 'P'));
    const result = evaluator.evaluate(edited, 'scene');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(pitchesOf(result.plan).slice(0, 3)).toEqual([6000, 6500, 6000]);
    evaluator.evaluate([...edited], 'scene');
    expect(spy).toHaveBeenCalledTimes(2);

    const retuned = withObject(edited, {
      modifiers: [modifierOf('m1', MELODICIZE_ID, { pitches: 'P' }, { allocation: 'zip' })],
    });
    evaluator.evaluate(retuned, 'scene');
    expect(spy).toHaveBeenCalledTimes(3);

    const reordered = withObject(edited, {
      modifiers: [
        modifierOf('m1', MELODICIZE_ID, { pitches: 'P' }),
        modifierOf('m2', HARMONIZE_ID, { set: 'P' }),
      ],
    });
    evaluator.evaluate(reordered, 'scene');
    expect(spy).toHaveBeenCalledTimes(4);
    const swapped = withObject(edited, {
      modifiers: [
        modifierOf('m2', HARMONIZE_ID, { set: 'P' }),
        modifierOf('m1', MELODICIZE_ID, { pitches: 'P' }),
      ],
    });
    const swappedRun = evaluator.evaluate(swapped, 'scene');
    // The swapped stack fails before the audition build: no new build, a problem instead.
    expect(spy).toHaveBeenCalledTimes(4);
    expect(swappedRun.warnings).toEqual([
      'Object "Bass": Harmonize needs Notes; the data so far is a Rhythm',
    ]);

    const muted = withObject(edited, {
      modifiers: [modifierOf('m1', MELODICIZE_ID, { pitches: 'P' }, {}, true)],
    });
    evaluator.evaluate(muted, 'scene');
    expect(spy).toHaveBeenCalledTimes(5);
  });

  it('a pitch set that only a muted modifier uses does not rebuild when it changes', () => {
    const { spy, evaluator } = setup();
    const muted = [
      modifierOf('m1', MELODICIZE_ID, { pitches: 'P' }),
      modifierOf('m2', HARMONIZE_ID, { set: 'Q' }, {}, true),
    ];
    const blocks = world('clave', muted, [pitchSetBlock('Q', [6000, 6200], 'Q')]);
    evaluator.evaluate(blocks, 'scene');
    expect(spy).toHaveBeenCalledTimes(1);
    evaluator.evaluate(replaceBlock(blocks, pitchSetBlock('Q', [6100], 'Q')), 'scene');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('choices made after the review (2026-11-24)', () => {
  it('Melodicize keeps the own pulse of a rhythm: adding it never changes when the notes fall', () => {
    // 12 pulses over 4 quarters: each pulse is a third of a quarter, durations 3 3 6 give attacks at 0, 1, 2.
    const own = claveBlock('own', 'Own pulse');
    const ownRhythm = {
      ...own,
      payload: {
        kind: 'packet' as const,
        packet: packet(
          'list',
          'duration',
          [3, 3, 6].map((value, index) => ({ id: `i${index}`, value, provenance: [] })),
          [],
          undefined,
          {
            frame: {
              topology: 'cyclic',
              unit: 'pulse',
              extent: 12,
              musicalExtent: { quarterNotes: rational(4) },
            },
          }
        ),
      },
    } as StoredDataBlock;
    const alone = play(world('own', [], [ownRhythm])).plan;
    const modified = play(
      world('own', [modifierOf('m1', MELODICIZE_ID, { pitches: 'P' })], [ownRhythm])
    ).plan;
    expect(startsOf(alone)).toEqual([0, 1, 2]);
    expect(startsOf(modified)).toEqual([0, 1, 2]);
    // The clave has no pulse of its own: it still follows the transport pulse.
    expect(
      startsOf(play(world('clave', [modifierOf('m1', MELODICIZE_ID, { pitches: 'P' })])).plan)
    ).toEqual(CLAVE_ATTACKS);
  });

  it('Pitch classes always repeat at their own octave: the Period field applies to a Pitch set only', () => {
    const classes = pitchClassesBlock('pc19', [0, 7, 11], 19);
    const harmonize = modifierOf(
      'm1',
      HARMONIZE_ID,
      { set: 'pc19' },
      { voices: 4, period: TRITAVE }
    );
    const notes = notesBlock('n', [{ at: 0, pitches: [6000] }]);
    const pitches = pitchesOf(play(world('n', [harmonize], [notes, classes])).plan) as number[];
    expect(pitches[1]).toBeCloseTo(6000 + 7 * (1200 / 19), 9);
    expect(pitches[2]).toBeCloseTo(6000 + 11 * (1200 / 19), 9);
    // The fourth voice is the next octave's class 0, not a tritave up.
    expect(pitches[3]).toBeCloseTo(7200, 6);
  });
});
