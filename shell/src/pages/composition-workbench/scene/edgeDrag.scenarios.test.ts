import { describe, expect, it } from 'vitest';
import type { StoredDataBlock } from '../dataBlocks/registry';
import { rational, rationalToNumber } from '../musicalTime';
import {
  PIXELS_PER_QUARTER,
  dragLive,
  dragMove,
  dragOutcome,
  dragRelease,
  dragStart,
  beatStep,
  type DragKind,
} from './arrangerGeometry';
import { evaluateScene } from './evaluateScene';
import { setTimeSpan } from './sceneOps';
import { S1, claveBlock, collectionBlock, objectBlock, sceneBlock } from './sceneTestHelpers';
import { chainPlacement, objectDataOf, stripChain } from './sceneTypes';

/**
 * Edge drags (workbench O2d, W-74): the confirmed rows, each through the real drag machine, the real
 * commit op and the real evaluator. The clave cycle is 4 quarters with attacks at 0, 0.75, 1.5, 2.5, 3;
 * the object starts at 4 for 8 quarters.
 */

const px = PIXELS_PER_QUARTER;
const mapping = (value: 'loop' | 'stretch' | 'one-shot') => value;

function scene(patch: Parameters<typeof objectBlock>[1]): StoredDataBlock[] {
  return [
    claveBlock(),
    objectBlock('o', { primaryDataRef: { id: 'clave' }, start: 4, duration: 8, ...patch }),
    collectionBlock('root', ['o']),
    sceneBlock('scene', 'root'),
  ];
}

/** Drags the left or right edge by `quarters` and commits it the way the Arranger does. */
function drag(
  blocks: StoredDataBlock[],
  kind: DragKind,
  quarters: number,
  shift = false
): StoredDataBlock[] {
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const chain = stripChain(byId, 'o', S1)!;
  const strip = chain[0].strip;
  const base = {
    worldStart: chainPlacement(chain).start,
    relativeStart: strip.start,
    duration: strip.duration,
    contentOffset: strip.contentOffset,
    mapping: strip.mapping,
  };
  const state = dragStart('o', kind, base, 1000, shift);
  const commit = dragRelease(
    dragMove(state, 1000 + quarters * px, shift),
    1000 + quarters * px,
    shift,
    '4/4'
  );
  if (commit === null) {
    return blocks;
  }
  const result = setTimeSpan(blocks, 'o', S1, {
    ...(kind === 'resize' ? {} : { start: commit.start }),
    duration: commit.duration,
    contentOffset: commit.contentOffset,
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.blocks;
}

const span = (blocks: StoredDataBlock[]) => {
  const strip = objectDataOf(blocks.find((block) => block.id === 'o'))!.strips[0];
  return {
    start: rationalToNumber(strip.start),
    duration: rationalToNumber(strip.duration),
    offset: rationalToNumber(strip.contentOffset),
  };
};
const attacks = (blocks: StoredDataBlock[]) =>
  evaluateScene(blocks, 'scene').plan.events.map((event) =>
    rationalToNumber(event.at.quarterNotes)
  );

describe('Loop, the cycle grid stays put', () => {
  it('row 1: left edge OUT by 1 reveals the earlier cycle (start 3, duration 9)', () => {
    const before = scene({ mapping: mapping('loop') });
    expect(attacks(before).slice(0, 5)).toEqual([4, 4.75, 5.5, 6.5, 7]);
    const after = drag(before, 'resize-left', -1);
    expect(span(after)).toEqual({ start: 3, duration: 9, offset: -1 });
    // The cycle that began at 4 still begins at 4; the one before it, from 0, is revealed from 3.
    expect(attacks(after)).toEqual([3, 4, 4.75, 5.5, 6.5, 7, 8, 8.75, 9.5, 10.5, 11]);
  });

  it('row 2: left edge IN by 1 trims the front, nothing shifts (start 5, duration 7)', () => {
    const after = drag(scene({ mapping: mapping('loop') }), 'resize-left', 1);
    expect(span(after)).toEqual({ start: 5, duration: 7, offset: 1 });
    expect(attacks(after)).toEqual([5.5, 6.5, 7, 8, 8.75, 9.5, 10.5, 11]);
  });

  it('row 3: the right edge changes only the duration, and the grid does not move', () => {
    const after = drag(scene({ mapping: mapping('loop') }), 'resize', 4);
    expect(span(after)).toEqual({ start: 4, duration: 12, offset: 0 });
    expect(attacks(after).slice(-5)).toEqual([12, 12.75, 13.5, 14.5, 15]);
  });

  it('a left drag out and back in lands on the original object', () => {
    const out = drag(scene({ mapping: mapping('loop') }), 'resize-left', -2);
    const back = drag(out, 'resize-left', 2);
    expect(span(back)).toEqual({ start: 4, duration: 8, offset: 0 });
  });

  it('a cycle that is not an even number of quarters stays anchored (offset reduced exactly)', () => {
    // Out by 1 then in by 3 leaves offset 2: start 6, the cycle grid at 4 (still anchored).
    const out = drag(scene({ mapping: mapping('loop') }), 'resize-left', -1);
    const inward = drag(out, 'resize-left', 3);
    expect(span(inward)).toEqual({ start: 6, duration: 6, offset: 2 });
    expect(attacks(inward)).toEqual([6.5, 7, 8, 8.75, 9.5, 10.5, 11]);
  });
});

describe('One-shot, the left edge trims and adds silence', () => {
  it('row 4: left edge IN by 1 trims the first quarter; notes keep their absolute time', () => {
    const before = scene({ mapping: mapping('one-shot') });
    expect(attacks(before)).toEqual([4, 4.75, 5.5, 6.5, 7]);
    const after = drag(before, 'resize-left', 1);
    expect(span(after)).toEqual({ start: 5, duration: 7, offset: 1 });
    expect(attacks(after)).toEqual([5.5, 6.5, 7]);
  });

  it('row 5: left edge OUT past the data start grows the block, the extra is silent', () => {
    const after = drag(scene({ mapping: mapping('one-shot') }), 'resize-left', -2);
    expect(span(after)).toEqual({ start: 2, duration: 10, offset: -2 });
    expect(attacks(after)).toEqual([4, 4.75, 5.5, 6.5, 7]);
  });

  it('a trim then a drag back out brings the trimmed notes back', () => {
    const trimmed = drag(scene({ mapping: mapping('one-shot') }), 'resize-left', 2);
    expect(attacks(trimmed)).toEqual([6.5, 7]);
    const back = drag(trimmed, 'resize-left', -2);
    expect(attacks(back)).toEqual([4, 4.75, 5.5, 6.5, 7]);
  });

  it('the right edge works as before (duration only)', () => {
    const after = drag(scene({ mapping: mapping('one-shot') }), 'resize', 2);
    expect(span(after)).toEqual({ start: 4, duration: 10, offset: 0 });
  });
});

describe('Stretch, either edge refits the one cycle', () => {
  it('row 6: left edge IN by 2 shrinks the span to 6 and keeps no offset', () => {
    const after = drag(scene({ mapping: mapping('stretch') }), 'resize-left', 2);
    expect(span(after)).toEqual({ start: 6, duration: 6, offset: 0 });
    // One cycle (4 quarters) refit to 6: factor 1.5, from 6.
    expect(attacks(after)).toEqual([6, 7.125, 8.25, 9.75, 10.5]);
  });

  it('row 6: right edge refits the same way', () => {
    const after = drag(scene({ mapping: mapping('stretch') }), 'resize', -4);
    expect(span(after)).toEqual({ start: 4, duration: 4, offset: 0 });
    expect(attacks(after)).toEqual([4, 4.75, 5.5, 6.5, 7]);
  });

  it('a stored offset is ignored by Stretch', () => {
    const a = attacks(scene({ mapping: mapping('stretch') }));
    const b = attacks(scene({ mapping: mapping('stretch'), contentOffset: rational(3) }));
    expect(b).toEqual(a);
  });
});

describe('row 7: dragging the middle moves the block with its content', () => {
  it.each(['loop', 'one-shot', 'stretch'] as const)('%s: the offset does not change', (kind) => {
    const blocks = scene({ mapping: mapping(kind), contentOffset: rational(1) });
    const byId = new Map(blocks.map((block) => [block.id, block]));
    const chain = stripChain(byId, 'o', S1)!;
    const base = {
      worldStart: chainPlacement(chain).start,
      relativeStart: chain[0].strip.start,
      duration: chain[0].strip.duration,
      contentOffset: chain[0].strip.contentOffset,
      mapping: kind,
    };
    const commit = dragRelease(
      dragMove(dragStart('o', 'move', base, 0, false), 2 * px, false),
      2 * px,
      false,
      '4/4'
    );
    expect(commit?.start).toEqual(rational(6));
    expect(commit?.contentOffset).toBeUndefined();
    const moved = setTimeSpan(blocks, 'o', S1, { start: commit!.start });
    expect(moved.ok && span(moved.blocks)).toEqual({ start: 6, duration: 8, offset: 1 });
  });
});

describe('the left-edge drag itself', () => {
  const base = {
    worldStart: rational(4),
    relativeStart: rational(4),
    duration: rational(8),
    contentOffset: rational(0),
    mapping: 'loop' as const,
  };
  const beat = beatStep('4/4');

  it('snaps to the beat grid, and Shift gives the free tick step', () => {
    const snapped = dragOutcome('resize-left', base, -0.6 * px, beat, beat);
    expect(snapped.start).toEqual(rational(3));
    expect(snapped.contentOffset).toEqual(rational(-1));
    const free = dragOutcome('resize-left', base, -0.25 * px, null, beat);
    expect(free.start).toEqual(rational(15, 4));
    expect(free.duration).toEqual(rational(33, 4));
    expect(free.contentOffset).toEqual(rational(-1, 4));
  });

  it('the right end stays fixed, the block never gets shorter than one beat or starts before 0', () => {
    const past = dragOutcome('resize-left', base, 50 * px, beat, beat);
    expect(past.duration).toEqual(beat);
    expect(rationalToNumber(past.start) + rationalToNumber(past.duration)).toBe(12);
    const early = dragOutcome('resize-left', base, -50 * px, beat, beat);
    expect(early.start).toEqual(rational(0));
    expect(early.duration).toEqual(rational(12));
  });

  it('a child keeps its parent: the relative start changes by the same amount as the world start', () => {
    const child = { ...base, worldStart: rational(6), relativeStart: rational(2) };
    const out = dragOutcome('resize-left', child, -px, beat, beat);
    expect(out.start).toEqual(rational(1));
    expect(out.duration).toEqual(rational(9));
  });

  it('shows the old span until the threshold, and a click commits nothing', () => {
    const state = dragStart('o', 'resize-left', base, 0, false);
    expect(dragLive(state, '4/4')).toEqual({ start: rational(4), duration: rational(8) });
    expect(dragRelease(state, 3, false, '4/4')).toBeNull();
    expect(dragRelease(state, 0, false, '4/4')).toBeNull();
  });

  it('Shift at release decides snapping', () => {
    const state = dragStart('o', 'resize-left', base, 0, false);
    const snapped = dragRelease(state, -0.6 * px, false, '4/4');
    const free = dragRelease(state, -0.6 * px, true, '4/4');
    expect(snapped?.start).toEqual(rational(3));
    expect(free?.start).not.toEqual(rational(3));
  });
});

describe('the new field', () => {
  it('a strip starts with offset 0', () => {
    const strip = objectDataOf(scene({})[1])!.strips[0];
    expect(strip.contentOffset).toEqual(rational(0));
  });
});
