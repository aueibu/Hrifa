import { describe, expect, it } from 'vitest';
import { rational } from '../musicalTime';
import {
  PIXELS_PER_QUARTER,
  beatStep,
  DRAG_THRESHOLD_PX,
  cutExtent,
  dragCancel,
  dragLive,
  dragMove,
  dragRelease,
  dragStart,
  dragOutcome,
  dragStep,
  playheadQuarters,
  pxToQuarters,
  quartersToPx,
  rulerMarks,
  sceneLengthQuarters,
  snapToStep,
} from './arrangerGeometry';
import { objectBlock } from './sceneTestHelpers';
import { chainPlacement, objectChain } from './sceneTypes';

const beat = beatStep('4/4');
const q = (n: number, d = 1) => rational(n, d);

describe('pixels and quarter notes', () => {
  it('round-trip at the fixed scale', () => {
    expect(quartersToPx(q(3, 2))).toBe(1.5 * PIXELS_PER_QUARTER);
    expect(pxToQuarters(quartersToPx(q(5)))).toBe(5);
  });
});

describe('the grid', () => {
  it('is one beat of the meter in exact quarters', () => {
    expect(beat).toEqual(q(1));
    expect(beatStep('6/8')).toEqual(q(1, 2));
    expect(beatStep('nonsense')).toEqual(q(1));
  });

  it('snaps to the nearest multiple, exactly', () => {
    expect(snapToStep(q(7, 4), beat)).toEqual(q(2));
    expect(snapToStep(q(5, 4), beat)).toEqual(q(1));
    expect(snapToStep(q(3, 2), beat)).toEqual(q(2));
    expect(snapToStep(q(-1, 4), beat)).toEqual(q(0));
  });

  it('is off while Shift is held (Bitwig: Shift inverts the snap)', () => {
    expect(dragStep('4/4', false)).toEqual(q(1));
    expect(dragStep('4/4', true)).toBeNull();
  });
});

describe('moving a block', () => {
  const base = { worldStart: q(4), relativeStart: q(1), duration: q(2) };

  it('changes the relative start by the same amount as the world start, snapped', () => {
    // 1.4 quarters of pixels from world 4 is 5.4: snaps to 5, so relative 1 becomes 2.
    const out = dragOutcome('move', base, 1.4 * PIXELS_PER_QUARTER, beat, beat);
    expect(out.start).toEqual(q(2));
    expect(out.duration).toEqual(q(2));
  });

  it('a child moves without touching its parent (only its own start is in the result)', () => {
    const out = dragOutcome('move', base, -PIXELS_PER_QUARTER, beat, beat);
    expect(out).toEqual({ start: q(0), duration: q(2) });
  });

  it('is free at tick resolution with snapping off', () => {
    const out = dragOutcome('move', base, 0.25 * PIXELS_PER_QUARTER, null, beat);
    expect(out.start).toEqual(q(5, 4));
  });

  it('never moves the world start before the scene start', () => {
    const out = dragOutcome('move', base, -10 * PIXELS_PER_QUARTER, beat, beat);
    expect(out.start).toEqual(q(-3));
    // World start = 4 + (-3 - 1) = 0.
  });
});

describe('resizing the right edge', () => {
  const base = { worldStart: q(4), relativeStart: q(1), duration: q(2) };

  it('changes the duration only, with the end on the grid', () => {
    const out = dragOutcome('resize', base, 1.6 * PIXELS_PER_QUARTER, beat, beat);
    expect(out.start).toEqual(q(1));
    expect(out.duration).toEqual(q(4));
  });

  it('never goes below one beat, also free, and never zero or negative', () => {
    expect(dragOutcome('resize', base, -50 * PIXELS_PER_QUARTER, beat, beat).duration).toEqual(
      beat
    );
    expect(dragOutcome('resize', base, -2 * PIXELS_PER_QUARTER, null, beat).duration).toEqual(beat);
  });

  it('is free at tick resolution with snapping off', () => {
    const out = dragOutcome('resize', base, 0.5 * PIXELS_PER_QUARTER, null, beat);
    expect(out.duration).toEqual(q(5, 2));
  });
});

describe('ruler and length', () => {
  it('marks bars and beats of the meter', () => {
    const marks = rulerMarks('3/4', 6);
    expect(marks).toHaveLength(7);
    expect(marks[0]).toMatchObject({ bar: 1, beat: 1, isBar: true });
    expect(marks[3]).toMatchObject({ quarters: 3, bar: 2, beat: 1, isBar: true });
    expect(marks[4]).toMatchObject({ bar: 2, beat: 2, isBar: false });
  });

  it('counts beats of the denominator note in compound meters', () => {
    const marks = rulerMarks('6/8', 3);
    expect(marks[1].quarters).toBe(0.5);
    expect(marks[6]).toMatchObject({ quarters: 3, bar: 2, beat: 1, isBar: true });
  });

  it('adds a margin of bars to the plan length', () => {
    expect(sceneLengthQuarters(0, '4/4')).toBe(16);
    expect(sceneLengthQuarters(9, '4/4')).toBe(28);
  });
});

describe('the playhead position', () => {
  it('is quarters since the engine clock started, null before it', () => {
    expect(playheadQuarters(2000, 1000, 120)).toBe(2);
    expect(playheadQuarters(900, 1000, 120)).toBeNull();
  });
});

describe('the cut at the parent end', () => {
  const place = (blocks: ReturnType<typeof objectBlock>[], id: string) => {
    const chain = objectChain(new Map(blocks.map((block) => [block.id, block])), id) ?? [];
    const { start, bound } = chainPlacement(chain);
    return cutExtent(start, chain[0].data.timeSpan.duration, bound);
  };

  it('a child inside its parent is all visible', () => {
    const blocks = [
      objectBlock('p', { start: 0, duration: 8 }),
      objectBlock('c', { parentRef: { id: 'p' }, start: 1, duration: 2 }),
    ];
    expect(place(blocks, 'c')).toEqual({ visible: q(2), cut: q(0) });
  });

  it('a child crossing the parent end is cut there', () => {
    const blocks = [
      objectBlock('p', { start: 0, duration: 4 }),
      objectBlock('c', { parentRef: { id: 'p' }, start: 2, duration: 4 }),
    ];
    expect(place(blocks, 'c')).toEqual({ visible: q(2), cut: q(2) });
  });

  it('a child starting past the parent end is all cut', () => {
    const blocks = [
      objectBlock('p', { start: 0, duration: 4 }),
      objectBlock('c', { parentRef: { id: 'p' }, start: 6, duration: 2 }),
    ];
    expect(place(blocks, 'c')).toEqual({ visible: q(0), cut: q(2) });
  });

  it('nested parents: the tightest end up the chain wins', () => {
    const blocks = [
      objectBlock('g', { start: 0, duration: 8 }),
      objectBlock('p', { parentRef: { id: 'g' }, start: 2, duration: 8 }),
      objectBlock('c', { parentRef: { id: 'p' }, start: 1, duration: 10 }),
    ];
    // World start 3; ends: own 13, p 10, g 8.
    expect(place(blocks, 'c')).toEqual({ visible: q(5), cut: q(5) });
    expect(place(blocks, 'p')).toEqual({ visible: q(6), cut: q(2) });
  });

  it('a root object is never cut', () => {
    expect(place([objectBlock('r', { start: 3, duration: 5 })], 'r')).toEqual({
      visible: q(5),
      cut: q(0),
    });
  });
});

describe('the drag state machine', () => {
  const off = { worldStart: q(3, 4), relativeStart: q(3, 4), duration: q(1, 2) };
  const px = PIXELS_PER_QUARTER;

  it('a click without movement commits nothing, on a start off the grid and a sub-beat duration', () => {
    const move = dragStart('a', 'move', off, 100, false);
    expect(dragLive(move, '4/4')).toEqual({ start: q(3, 4), duration: q(1, 2) });
    expect(dragRelease(move, 100, false, '4/4')).toBeNull();
    const resize = dragStart('a', 'resize', off, 100, false);
    expect(dragLive(resize, '4/4')).toEqual({ start: q(3, 4), duration: q(1, 2) });
    expect(dragRelease(resize, 100, false, '4/4')).toBeNull();
  });

  it('movement below the threshold is still a click', () => {
    const state = dragMove(
      dragStart('a', 'move', off, 100, false),
      100 + DRAG_THRESHOLD_PX - 1,
      false
    );
    expect(state.moved).toBe(false);
    expect(dragRelease(state, 100 + DRAG_THRESHOLD_PX - 1, false, '4/4')).toBeNull();
  });

  it('movement past the threshold shows live and commits once on release', () => {
    let state = dragStart('a', 'move', off, 100, false);
    state = dragMove(state, 100 + px, false);
    expect(state.moved).toBe(true);
    // World 0.75 + 1 = 1.75 snaps to 2: relative start 2.
    expect(dragLive(state, '4/4').start).toEqual(q(2));
    expect(dragRelease(state, 100 + px, false, '4/4')).toEqual({ start: q(2), duration: q(1, 2) });
  });

  it('once past the threshold the drag stays a drag; ending where it began commits nothing', () => {
    let state = dragStart(
      'a',
      'move',
      { ...off, worldStart: q(1), relativeStart: q(1) },
      100,
      false
    );
    state = dragMove(state, 100 + 3 * DRAG_THRESHOLD_PX, false);
    expect(dragRelease(state, 100, false, '4/4')).toBeNull();
  });

  it('Shift held at release decides snapping off, whatever it was before', () => {
    let state = dragStart('a', 'move', off, 100, true);
    state = dragMove(state, 100 + px, true);
    const free = dragRelease(state, 100 + px, false, '4/4');
    expect(free?.start).toEqual(q(2));
    const shifted = dragRelease(dragMove(state, 100 + px, false), 100 + px, true, '4/4');
    expect(shifted?.start).toEqual(q(7, 4));
  });

  it('a resize past the threshold never goes below one beat', () => {
    let state = dragStart('a', 'resize', off, 100, false);
    state = dragMove(state, 100 + 2 * DRAG_THRESHOLD_PX, false);
    expect(dragRelease(state, 100 + 2 * DRAG_THRESHOLD_PX, false, '4/4')?.duration).toEqual(beat);
  });

  it('cancel throws the drag away with nothing to commit', () => {
    expect(dragCancel()).toBeNull();
  });
});
