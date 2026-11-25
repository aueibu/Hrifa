import { describe, expect, it, vi } from 'vitest';
import type { MusicalPerformancePlan } from '../audio/types';
import { auditionBlock } from '../dataBlocks/audition';
import { deleteBlockFromProject } from '../dataBlocks/dataBlockRefs';
import { validateBlock, type StoredDataBlock } from '../dataBlocks/registry';
import { musicalDuration, rational, rationalToNumber } from '../musicalTime';
import { groupEventsByObject } from './arrangerPreview';
import { createSceneEvaluator, evaluateScene } from './evaluateScene';
import {
  claveBlock,
  collectionBlock,
  emptyRhythmBlock,
  objectBlock,
  replaceBlock,
  sceneBlock,
} from './sceneTestHelpers';
import { objectWorldStart } from './sceneTypes';

const starts = (plan: MusicalPerformancePlan) =>
  plan.events.map((event) => rationalToNumber(event.at.quarterNotes));
const durations = (plan: MusicalPerformancePlan) =>
  plan.events.map((event) => rationalToNumber(event.duration.quarterNotes));
const planLength = (plan: MusicalPerformancePlan) => rationalToNumber(plan.duration.quarterNotes);

function sceneOf(...objects: StoredDataBlock[]): StoredDataBlock[] {
  return [
    claveBlock(),
    ...objects,
    collectionBlock(
      'root',
      objects.filter((block) => block.typeId === 'object').map((block) => block.id)
    ),
    sceneBlock('scene', 'root'),
  ];
}

const clave = (id: string, patch: Parameters<typeof objectBlock>[1] = {}) =>
  objectBlock(id, { primaryDataRef: { id: 'clave' }, ...patch });

describe('row 1: a clave in a 64-quarter object', () => {
  it('Loop (default): 16 cycles, 80 attacks, the last cycle starts at quarter 60', () => {
    const { plan, warnings } = evaluateScene(sceneOf(clave('o', { duration: 64 })), 'scene');
    expect(plan.events).toHaveLength(80);
    expect(starts(plan)[75]).toBe(60);
    expect(Math.max(...starts(plan))).toBe(63);
    expect(plan.events[75].at.quarterNotes).toEqual(rational(60));
    expect(planLength(plan)).toBe(64);
    expect(warnings).toEqual([]);
  });

  it('Stretch: one cycle scaled x16, 5 attacks at 0, 12, 24, 40, 48; durations scale, pitch does not', () => {
    const blocks = sceneOf(clave('o', { duration: 64, mapping: 'stretch' }));
    const { plan } = evaluateScene(blocks, 'scene');
    const cycle = auditionBlock(claveBlock());
    const base = cycle.ok ? cycle.plan.events : [];
    expect(starts(plan)).toEqual([0, 12, 24, 40, 48]);
    expect(durations(plan)).toEqual(
      base.map((event) => rationalToNumber(event.duration.quarterNotes) * 16)
    );
    expect(plan.events.map((event) => event.pitchMidicents)).toEqual(
      base.map((event) => event.pitchMidicents)
    );
  });

  it('One-shot: 5 attacks in quarters 0 to 3, nothing after, the span stays 64', () => {
    const { plan } = evaluateScene(
      sceneOf(clave('o', { duration: 64, mapping: 'one-shot' })),
      'scene'
    );
    expect(starts(plan)).toEqual([0, 0.75, 1.5, 2.5, 3]);
    expect(planLength(plan)).toBe(64);
  });

  it('names the object as the source of every event', () => {
    const { plan } = evaluateScene(sceneOf(clave('o', { mapping: 'one-shot' })), 'scene');
    expect(plan.events.every((event) => event.provenance.at(-1)?.sourceNodeInstance === 'o')).toBe(
      true
    );
    expect(plan.sourceId).toBe('scene');
  });
});

describe('row 2: a child follows its parent', () => {
  const build = (parentStart: number) =>
    sceneOf(
      objectBlock('verse', { start: parentStart, duration: 64 }),
      clave('child', { parentRef: { id: 'verse' }, start: 4, duration: 4, mapping: 'one-shot' })
    );

  it('relative start 4 under a parent at 0 starts at 4; the parent at 16 puts it at 20', () => {
    expect(starts(evaluateScene(build(0), 'scene').plan)[0]).toBe(4);
    const moved = evaluateScene(build(16), 'scene').plan;
    expect(starts(moved)[0]).toBe(20);
    expect(rationalToNumber(objectWorldStart(build(16), 'child')!)).toBe(20);
  });
});

describe('row 5: the empty parent keeps the form its length', () => {
  it('an Empty Verse 0..64 and a one-shot clave 0..4: 64 quarters, 5 events, no warnings', () => {
    const blocks = sceneOf(
      objectBlock('verse', { duration: 64 }, 'Verse'),
      clave('c', { duration: 4, mapping: 'one-shot' })
    );
    const { plan, warnings } = evaluateScene(blocks, 'scene');
    expect(planLength(plan)).toBe(64);
    expect(plan.events).toHaveLength(5);
    expect(warnings).toEqual([]);
  });
});

describe('row 6: deleting a parent keeps the child in place', () => {
  const child = (parent: string) =>
    clave('child', { parentRef: { id: parent }, start: 4, duration: 4, mapping: 'one-shot' });

  it('child at relative 4 under a parent at 16: still at 20, now a root object', () => {
    const blocks = sceneOf(objectBlock('parent', { start: 16, duration: 64 }), child('parent'));
    const next = deleteBlockFromProject({ dataBlocks: blocks, instances: [] }, 'parent');
    expect(starts(evaluateScene(next.dataBlocks, 'scene').plan)[0]).toBe(20);
    const kept = next.dataBlocks.find((block) => block.id === 'child')!;
    const data =
      kept.payload.kind === 'record' ? (kept.payload.data as { parentRef: unknown }) : null;
    expect(data?.parentRef).toBeNull();
    expect(validateBlock(kept)).toBeNull();
  });

  it('a grandparent chain: the child takes the parent world start (grandparent plus parent)', () => {
    const blocks = sceneOf(
      objectBlock('grand', { start: 10, duration: 100 }),
      objectBlock('parent', { parentRef: { id: 'grand' }, start: 6, duration: 64 }),
      child('parent')
    );
    expect(starts(evaluateScene(blocks, 'scene').plan)[0]).toBe(20);
    const next = deleteBlockFromProject({ dataBlocks: blocks, instances: [] }, 'parent');
    expect(starts(evaluateScene(next.dataBlocks, 'scene').plan)[0]).toBe(20);
    // Deleting the grandparent: the parent keeps world 16, the child (still under it) stays at 20.
    const after = deleteBlockFromProject({ dataBlocks: blocks, instances: [] }, 'grand');
    expect(starts(evaluateScene(after.dataBlocks, 'scene').plan)[0]).toBe(20);
    expect(rationalToNumber(objectWorldStart(after.dataBlocks, 'parent')!)).toBe(16);
  });

  it('deleting the primary data blanks the slot: the object stays, silent', () => {
    const blocks = sceneOf(clave('o', { mapping: 'one-shot' }));
    const next = deleteBlockFromProject({ dataBlocks: blocks, instances: [] }, 'clave');
    expect(next.dataBlocks.some((block) => block.id === 'o')).toBe(true);
    const { plan, warnings } = evaluateScene(next.dataBlocks, 'scene');
    expect(plan.events).toEqual([]);
    expect(planLength(plan)).toBe(4);
    expect(warnings).toEqual([]);
  });
});

describe('row 7 (W-79): a parent is structure, not a mask', () => {
  it('a child past its parent end plays its full length (bars 1 to 4 parent, child at quarter 8 for 16)', () => {
    const blocks = sceneOf(
      objectBlock('parent', { start: 0, duration: 16 }),
      clave('child', { parentRef: { id: 'parent' }, start: 8, duration: 16 })
    );
    const { plan } = evaluateScene(blocks, 'scene');
    // Four 4-quarter cycles of 5 attacks, the last cycle at quarter 20 (attack at 23).
    expect(plan.events).toHaveLength(20);
    expect(Math.min(...starts(plan))).toBe(8);
    expect(Math.max(...starts(plan))).toBe(23);
    expect(starts(plan).filter((at) => at >= 16)).toHaveLength(10);
    expect(planLength(plan)).toBe(24);
  });

  it('a child ends at its OWN end: an event crossing it is shortened there', () => {
    const blocks = sceneOf(
      objectBlock('parent', { start: 0, duration: 1 }),
      clave('child', {
        parentRef: { id: 'parent' },
        start: 0,
        duration: 3.25,
        mapping: 'one-shot',
      })
    );
    const { plan } = evaluateScene(blocks, 'scene');
    const last = plan.events.at(-1)!;
    expect(plan.events).toHaveLength(5);
    expect(
      rationalToNumber(last.at.quarterNotes) + rationalToNumber(last.duration.quarterNotes)
    ).toBeLessThanOrEqual(3.25);
  });

  it('a parent that starts later still places the child, and does not end it', () => {
    const blocks = sceneOf(
      objectBlock('parent', { start: 10, duration: 2 }),
      clave('child', { parentRef: { id: 'parent' }, start: 0, duration: 32 })
    );
    const { plan } = evaluateScene(blocks, 'scene');
    expect(Math.min(...starts(plan))).toBe(10);
    expect(Math.max(...starts(plan))).toBeGreaterThan(12);
  });
});

describe('silence rules', () => {
  it('a circular parent chain: the object is silent and the warning names it', () => {
    const blocks = sceneOf(
      clave('a', { parentRef: { id: 'b' } }),
      objectBlock('b', { parentRef: { id: 'a' } })
    );
    const { plan, warnings } = evaluateScene(blocks, 'scene');
    expect(plan.events).toEqual([]);
    expect(warnings.some((warning) => warning.includes('"a"'))).toBe(true);
  });

  it('a muted object is silent but still counts toward the length', () => {
    const { plan, warnings } = evaluateScene(
      sceneOf(clave('o', { mute: true, duration: 16 })),
      'scene'
    );
    expect(plan.events).toEqual([]);
    expect(planLength(plan)).toBe(16);
    expect(warnings).toEqual([]);
  });

  it('any object under a muted collection is silent, nested ones too', () => {
    const blocks: StoredDataBlock[] = [
      claveBlock(),
      clave('o', { mapping: 'one-shot' }),
      clave('p', { mapping: 'one-shot', start: 8 }),
      collectionBlock('inner', ['p']),
      collectionBlock('outer', ['o', 'inner'], { mute: true }),
      collectionBlock('root', ['outer']),
      sceneBlock('scene', 'root'),
    ];
    const { plan } = evaluateScene(blocks, 'scene');
    expect(plan.events).toEqual([]);
    expect(planLength(plan)).toBe(12);
  });

  it('includeMuted builds muted objects (own and collection mute) for the preview; plan length is unchanged', () => {
    const blocks: StoredDataBlock[] = [
      claveBlock(),
      clave('o', { mapping: 'one-shot', mute: true }),
      clave('p', { mapping: 'one-shot', start: 8 }),
      collectionBlock('inner', ['p'], { mute: true }),
      collectionBlock('root', ['o', 'inner']),
      sceneBlock('scene', 'root'),
    ];
    const playing = createSceneEvaluator().evaluate(blocks, 'scene');
    const preview = createSceneEvaluator().evaluate(blocks, 'scene', { includeMuted: true });
    expect(playing.plan.events).toEqual([]);
    const groups = groupEventsByObject(preview.plan.events);
    expect(groups.get('o')?.length).toBeGreaterThan(0);
    expect(groups.get('p')?.length).toBeGreaterThan(0);
    expect(planLength(preview.plan)).toBe(planLength(playing.plan));
  });

  it('a scene with no root collection is silent with length 0', () => {
    const { plan, warnings } = evaluateScene([sceneBlock('scene', null)], 'scene');
    expect(plan.events).toEqual([]);
    expect(planLength(plan)).toBe(0);
    expect(warnings).toEqual([]);
  });

  it('empty data is silent without a warning; data with no sound warns', () => {
    const empty = evaluateScene(
      [...sceneOf(clave('o')), emptyRhythmBlock('e')].map((block) =>
        block.id === 'clave' ? emptyRhythmBlock('clave') : block
      ),
      'scene'
    );
    expect(empty.plan.events).toEqual([]);
    expect(empty.warnings).toEqual([]);
    // An object pointing at a scene (a type with no audition).
    const silent = evaluateScene(
      sceneOf(objectBlock('o', { primaryDataRef: { id: 'scene' } }, 'Odd')),
      'scene'
    );
    expect(silent.plan.events).toEqual([]);
    expect(silent.warnings).toHaveLength(1);
    expect(silent.warnings[0]).toContain('Odd');
  });

  it('an object with no data (Empty) is silent with no warning', () => {
    const { warnings, plan } = evaluateScene(sceneOf(objectBlock('o')), 'scene');
    expect(plan.events).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('plays an object listed twice only once, with a warning', () => {
    const blocks: StoredDataBlock[] = [
      claveBlock(),
      clave('o', { mapping: 'one-shot' }),
      collectionBlock('a', ['o']),
      collectionBlock('root', ['a', 'o']),
      sceneBlock('scene', 'root'),
    ];
    const { plan, warnings } = evaluateScene(blocks, 'scene');
    expect(plan.events).toHaveLength(5);
    expect(warnings).toHaveLength(1);
  });
});

describe('spans that do not fit whole cycles, and starts before the timeline', () => {
  it('Loop over 6 quarters: a second, partial cycle; nothing starts at or after 6 and nothing ends after it', () => {
    const { plan } = evaluateScene(sceneOf(clave('o', { duration: 6 })), 'scene');
    expect(starts(plan)).toEqual([0, 0.75, 1.5, 2.5, 3, 4, 4.75, 5.5]);
    const ends = plan.events.map(
      (event) =>
        rationalToNumber(event.at.quarterNotes) + rationalToNumber(event.duration.quarterNotes)
    );
    expect(Math.max(...ends)).toBeLessThanOrEqual(6);
    expect(planLength(plan)).toBe(6);
  });

  it('a negative start drops the events before quarter 0 (the engine refuses them) and keeps the rest', () => {
    const { plan } = evaluateScene(sceneOf(clave('o', { start: -2, duration: 8 })), 'scene');
    expect(Math.min(...starts(plan))).toBeGreaterThanOrEqual(0);
    expect(starts(plan)).toEqual([0.5, 1, 2, 2.75, 3.5, 4.5, 5]);
    expect(planLength(plan)).toBe(6);
  });
});

describe('exact time', () => {
  it('uses the timeline option and adds no float drift to fractional starts', () => {
    const blocks = sceneOf(clave('o', { duration: 12, mapping: 'one-shot' }));
    const { plan } = evaluateScene(blocks, 'scene', {
      timeline: { id: 'custom', tempoMap: [], meterMap: [], displayTick: musicalDuration(1, 4) },
    });
    expect(plan.timebase.timeline.id).toBe('custom');
    const odd = objectBlock('o', {
      primaryDataRef: { id: 'clave' },
      mapping: 'one-shot',
      duration: 1,
    });
    const thirds: StoredDataBlock = {
      ...odd,
      payload: {
        kind: 'record',
        data: {
          ...(odd.payload.kind === 'record' ? (odd.payload.data as object) : {}),
          timeSpan: { start: rational(1, 3), duration: rational(4) },
        },
      },
    };
    const result = evaluateScene(sceneOf(thirds), 'scene').plan;
    expect(result.events[0].at.quarterNotes).toEqual(rational(1, 3));
    expect(result.events[1].at.quarterNotes).toEqual(rational(13, 12));
  });
});

describe('the two-stage memo', () => {
  const setup = () => {
    const spy = vi.fn(auditionBlock);
    const evaluator = createSceneEvaluator({ buildCycle: spy });
    return { spy, evaluator };
  };

  it('moving or resizing an object does not rebuild the cycle; editing its primary data does', () => {
    const { spy, evaluator } = setup();
    const blocks = sceneOf(clave('o', { duration: 16 }));
    evaluator.evaluate(blocks, 'scene');
    expect(spy).toHaveBeenCalledTimes(1);

    const moved = replaceBlock(blocks, clave('o', { duration: 16, start: 8 }));
    const movedPlan = evaluator.evaluate(moved, 'scene').plan;
    expect(spy).toHaveBeenCalledTimes(1);
    expect(starts(movedPlan)[0]).toBe(8);

    const resized = replaceBlock(moved, clave('o', { duration: 32, start: 8 }));
    evaluator.evaluate(resized, 'scene');
    expect(spy).toHaveBeenCalledTimes(1);

    const edited = replaceBlock(resized, claveBlock());
    evaluator.evaluate(edited, 'scene');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('two objects over one block build it once', () => {
    const { spy, evaluator } = setup();
    evaluator.evaluate(sceneOf(clave('a'), clave('b', { start: 8 })), 'scene');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('the same inputs return the same placed events', () => {
    const { evaluator } = setup();
    const blocks = sceneOf(clave('o', { duration: 16 }));
    const first = evaluator.evaluate(blocks, 'scene').plan.events[0];
    const second = evaluator.evaluate([...blocks], 'scene').plan.events[0];
    expect(second).toBe(first);
  });
});
