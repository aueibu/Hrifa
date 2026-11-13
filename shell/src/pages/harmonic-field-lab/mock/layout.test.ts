import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYOUT,
  canMove,
  canStack,
  fitColumns,
  migrateV1,
  move,
  parseLayout,
  pin,
  pinnedIds,
  stack,
  swapInStack,
  unpin,
  unstack,
  clampSplit,
  nudgeSplit,
  setSplit,
  splitLimits,
  splitOf,
  visiblePins,
  type Layout,
} from './layout';

const px = (w: number) => w / 16;

describe('fitColumns (width in rem to pinned columns)', () => {
  it('fits none at 1700 px, so the page looks as it does without pins', () => {
    expect(fitColumns(px(1100))).toBe(0);
    expect(fitColumns(px(1500))).toBe(0);
    expect(fitColumns(px(1700))).toBe(0);
  });

  it('adds a 24 rem column for every 24.25 rem beyond rail + workspace minimum + switcher', () => {
    expect(fitColumns(px(2560))).toBe(2);
    expect(fitColumns(px(3440))).toBe(4);
    expect(fitColumns(px(3840))).toBe(5);
    // the first column appears at 98.5 + 24.25 = 122.75 rem
    expect(fitColumns(122.74)).toBe(0);
    expect(fitColumns(122.75)).toBe(1);
  });

  it('never goes negative or NaN', () => {
    expect(fitColumns(0)).toBe(0);
    expect(fitColumns(Number.NaN)).toBe(0);
  });
});

describe('visiblePins (whole columns)', () => {
  it('shows the columns nearest the generator first, alternating sides', () => {
    expect([...visiblePins(DEFAULT_LAYOUT, 0)]).toEqual([]);
    expect([...visiblePins(DEFAULT_LAYOUT, 1)]).toEqual(['chords']);
    expect([...visiblePins(DEFAULT_LAYOUT, 2)]).toEqual(['chords', 'lattice']);
    expect([...visiblePins(DEFAULT_LAYOUT, 3)]).toEqual(['chords', 'lattice', 'keys']);
    expect(visiblePins(DEFAULT_LAYOUT, 9).size).toBe(4);
  });

  it('counts a stack as one column and shows both of its panels or neither', () => {
    const l: Layout = { left: [['keys', 'chords']], right: [['lattice', 'spectrum']] };
    expect([...visiblePins(l, 1)]).toEqual(['keys', 'chords']);
    expect([...visiblePins(l, 2)]).toEqual(['keys', 'chords', 'lattice', 'spectrum']);
    expect(visiblePins(l, 0).size).toBe(0);
    // four panels, two columns: the same width as two singles
    expect(pinnedIds(l)).toHaveLength(4);
  });
});

describe('arrangement rules', () => {
  const l: Layout = DEFAULT_LAYOUT;

  it('pins as a one-panel column on the outer end of the side with fewer columns (right on a tie)', () => {
    const a = pin(l, 'retuner');
    expect(a).toEqual({
      left: [['keys'], ['chords']],
      right: [['lattice'], ['spectrum'], ['retuner']],
    });
    expect(pin(a, 'retuner')).toBe(a);
    const b = pin({ left: [['keys']], right: [['lattice'], ['spectrum']] }, 'chords');
    expect(b.left).toEqual([['chords'], ['keys']]);
  });

  it('unpins; the other panel of a stack stays alone in its column', () => {
    expect(unpin(l, 'lattice')).toEqual({ left: [['keys'], ['chords']], right: [['spectrum']] });
    const s: Layout = { left: [['keys', 'chords']], right: [] };
    expect(unpin(s, 'keys')).toEqual({ left: [['chords']], right: [] });
    expect(unpin(s, 'chords')).toEqual({ left: [['keys']], right: [] });
  });

  it('reorders columns within a side, and the screen edge stops outward moves', () => {
    expect(move(l, 'keys', 'right').left).toEqual([['chords'], ['keys']]);
    expect(move(l, 'keys', 'left')).toBe(l);
    expect(move(l, 'lattice', 'right').right).toEqual([['spectrum'], ['lattice']]);
    expect(move(l, 'spectrum', 'right')).toBe(l);
    expect(move(l, 'spectrum', 'left').right).toEqual([['spectrum'], ['lattice']]);
    expect(canMove(l, 'keys', 'left')).toBe(false);
    expect(canMove(l, 'keys', 'right')).toBe(true);
  });

  it('crosses the generator when moving inward past the innermost column', () => {
    expect(move(l, 'chords', 'right')).toEqual({
      left: [['keys']],
      right: [['chords'], ['lattice'], ['spectrum']],
    });
    expect(move(l, 'lattice', 'left')).toEqual({
      left: [['keys'], ['chords'], ['lattice']],
      right: [['spectrum']],
    });
  });
});

describe('stacks', () => {
  const l: Layout = DEFAULT_LAYOUT;

  it('stacks a panel onto the neighbouring column toward the generator, nearer-the-edge panel on top', () => {
    expect(stack(l, 'keys')).toEqual({
      left: [['keys', 'chords']],
      right: [['lattice'], ['spectrum']],
    });
    expect(stack(l, 'spectrum')).toEqual({
      left: [['keys'], ['chords']],
      right: [['lattice', 'spectrum']],
    });
  });

  it('refuses when there is no neighbour toward the generator, or either column already holds two', () => {
    expect(stack(l, 'chords')).toBe(l);
    expect(stack(l, 'lattice')).toBe(l);
    expect(canStack(l, 'chords')).toBe(false);
    expect(canStack(l, 'keys')).toBe(true);
    const three: Layout = { left: [['retuner'], ['keys'], ['chords']], right: [] };
    const merged = stack(three, 'retuner'); // [retuner, keys] over chords
    expect(merged.left).toEqual([['retuner', 'keys'], ['chords']]);
    expect(stack(merged, 'chords')).toBe(merged);
    expect(canStack(merged, 'retuner')).toBe(false);
    // neighbour is a stack: no
    const nb: Layout = { left: [['retuner'], ['keys', 'chords']], right: [] };
    expect(stack(nb, 'retuner')).toBe(nb);
  });

  it('unstacks to a column on the outer side of the one it leaves', () => {
    const left: Layout = { left: [['keys', 'chords']], right: [] };
    expect(unstack(left, 'chords').left).toEqual([['chords'], ['keys']]);
    expect(unstack(left, 'keys').left).toEqual([['keys'], ['chords']]);
    const right: Layout = { left: [], right: [['lattice', 'spectrum']] };
    expect(unstack(right, 'lattice').right).toEqual([['spectrum'], ['lattice']]);
    expect(unstack(right, 'spectrum').right).toEqual([['lattice'], ['spectrum']]);
    expect(unstack(DEFAULT_LAYOUT, 'keys')).toEqual(DEFAULT_LAYOUT);
  });

  it('swaps the two panels of a stack', () => {
    const s: Layout = { left: [['keys', 'chords']], right: [] };
    expect(swapInStack(s, 'keys').left).toEqual([['chords', 'keys']]);
    expect(swapInStack(s, 'chords').left).toEqual([['chords', 'keys']]);
    expect(swapInStack(DEFAULT_LAYOUT, 'keys')).toBe(DEFAULT_LAYOUT);
  });

  it('moving a panel out of a stack unstacks it first, to the side it was moved toward', () => {
    const s: Layout = { left: [['keys', 'chords']], right: [['lattice']] };
    expect(move(s, 'keys', 'left').left).toEqual([['keys'], ['chords']]);
    expect(move(s, 'keys', 'right').left).toEqual([['chords'], ['keys']]);
    expect(move(s, 'chords', 'right').left).toEqual([['keys'], ['chords']]);
    const r: Layout = { left: [], right: [['lattice', 'spectrum']] };
    expect(move(r, 'lattice', 'left').right).toEqual([['lattice'], ['spectrum']]);
    expect(move(r, 'lattice', 'right').right).toEqual([['spectrum'], ['lattice']]);
    expect(canMove(s, 'keys', 'left')).toBe(true);
  });

  it('moves a single column past a stack as one unit', () => {
    const s: Layout = { left: [['retuner'], ['keys', 'chords']], right: [] };
    expect(move(s, 'retuner', 'right').left).toEqual([['keys', 'chords'], ['retuner']]);
  });
});

describe('persistence shapes', () => {
  it('round-trips a good v2 value, stacks included', () => {
    const v: Layout = { left: [['chords']], right: [['keys', 'lattice']] };
    expect(parseLayout(JSON.stringify(v))).toEqual(v);
    expect(parseLayout(JSON.stringify({ left: [], right: [] }))).toEqual({ left: [], right: [] });
  });

  it('falls back to the defaults for anything invalid, including three in a column or repeats', () => {
    for (const bad of [
      null,
      undefined,
      '',
      'not json',
      '5',
      '{"left":1,"right":[]}',
      '{"left":[["nope"]],"right":[]}',
      '{"left":[["chords"]],"right":[["chords"]]}',
      '{"left":[["chords","chords"]],"right":[]}',
      '{"left":[["chords","keys","lattice"]],"right":[]}',
      '{"left":[[]],"right":[]}',
      '{"left":[["field"]],"right":[]}',
      '{"left":["chords"],"right":[]}',
    ]) {
      expect(parseLayout(bad)).toBe(DEFAULT_LAYOUT);
    }
  });

  it('migrates v1 (flat lists): every pin becomes a one-panel column', () => {
    expect(migrateV1('{"left":["chords"],"right":["keys","lattice"]}')).toEqual({
      left: [['chords']],
      right: [['keys'], ['lattice']],
    });
    expect(migrateV1('{"left":["nope"],"right":[]}')).toBe(DEFAULT_LAYOUT);
    expect(migrateV1('{"left":["chords"],"right":["chords"]}')).toBe(DEFAULT_LAYOUT);
    expect(migrateV1('junk')).toBe(DEFAULT_LAYOUT);
  });
});

describe('splitter (pure)', () => {
  it('limits each half to 20% or 6 rem, whichever is larger, and fixes a too-short column at 50/50', () => {
    expect(splitLimits(40)).toEqual({ min: 0.2, max: 0.8 });
    expect(splitLimits(20)).toEqual({ min: 0.3, max: 0.7 });
    expect(splitLimits(15).min).toBeCloseTo(0.4, 9);
    expect(splitLimits(12)).toEqual({ min: 0.5, max: 0.5 });
    expect(splitLimits(6)).toEqual({ min: 0.5, max: 0.5 });
    expect(splitLimits(0)).toEqual({ min: 0.2, max: 0.8 });
  });

  it('clamps a share into the limits and repairs non-numbers', () => {
    expect(clampSplit(0.05, 40)).toBe(0.2);
    expect(clampSplit(0.97, 40)).toBe(0.8);
    expect(clampSplit(0.5, 40)).toBe(0.5);
    expect(clampSplit(0.1, 20)).toBe(0.3);
    expect(clampSplit(Number.NaN, 40)).toBe(0.5);
    expect(clampSplit(0.9, 10)).toBe(0.5);
  });

  it('nudges 5% with Up and Down (Up shrinks the top panel), jumps with Home and End, and never drifts', () => {
    expect(nudgeSplit(0.5, 'ArrowUp', 40)).toBe(0.45);
    expect(nudgeSplit(0.5, 'ArrowDown', 40)).toBe(0.55);
    expect(nudgeSplit(0.5, 'Home', 40)).toBe(0.2);
    expect(nudgeSplit(0.5, 'End', 40)).toBe(0.8);
    expect(nudgeSplit(0.2, 'ArrowUp', 40)).toBe(0.2);
    expect(nudgeSplit(0.8, 'ArrowDown', 40)).toBe(0.8);
    let v = 0.5;
    for (let i = 0; i < 3; i++) {
      v = nudgeSplit(v, 'ArrowUp', 40);
    }
    expect(v).toBe(0.35);
    for (let i = 0; i < 6; i++) {
      v = nudgeSplit(v, 'ArrowDown', 40);
    }
    expect(v).toBe(0.65);
    expect(nudgeSplit(0.5, 'Home', 20)).toBe(0.3);
  });
});

describe('stored splits', () => {
  const s: Layout = { left: [['keys', 'chords']], right: [['lattice'], ['spectrum']] };

  it('stores a split for the column a panel tops; 0.5 clears it; other panels are a no-op', () => {
    const a = setSplit(s, 'keys', 0.3);
    expect(a.splits).toEqual({ keys: 0.3 });
    expect(splitOf(a, 'keys')).toBe(0.3);
    expect(splitOf(s, 'keys')).toBe(0.5);
    expect(setSplit(a, 'keys', 0.3)).toBe(a);
    expect(setSplit(a, 'keys', 0.5)).toEqual(s);
    expect(setSplit(s, 'chords', 0.3)).toBe(s); // bottom panel
    expect(setSplit(s, 'lattice', 0.3)).toBe(s); // a single column
    expect(setSplit(s, 'keys', Number.NaN)).toBe(s);
  });

  it('follows the stack: swap flips the share, and unstack, unpin, move-out and re-stack forget it', () => {
    const a = setSplit(s, 'keys', 0.3);
    expect(swapInStack(a, 'keys')).toEqual({
      left: [['chords', 'keys']],
      right: [['lattice'], ['spectrum']],
      splits: { chords: 0.7 },
    });
    expect(unstack(a, 'keys').splits).toBeUndefined();
    expect(unpin(a, 'chords').splits).toBeUndefined();
    expect(move(a, 'keys', 'left').splits).toBeUndefined();
    const two: Layout = {
      left: [['retuner'], ['keys', 'chords']],
      right: [],
      splits: { keys: 0.3 },
    };
    // moving a single column past a stack keeps the stack's split
    expect(move(two, 'retuner', 'right').splits).toEqual({ keys: 0.3 });
  });

  it('round-trips through JSON and drops a split whose panel no longer tops a stack', () => {
    const a = setSplit(s, 'lattice', 0.3);
    expect(a).toBe(s);
    const stored = JSON.stringify({ ...s, splits: { keys: 0.25 } });
    expect(parseLayout(stored)).toEqual({ ...s, splits: { keys: 0.25 } });
    expect(parseLayout(JSON.stringify({ ...s, splits: { chords: 0.25 } }))).toEqual(s);
    expect(parseLayout(JSON.stringify({ ...s, splits: {} }))).toEqual(s);
  });

  it('falls back to the defaults for a bad splits value', () => {
    for (const bad of [
      { keys: 1.5 },
      { keys: -0.1 },
      { keys: 'x' },
      { keys: null },
      { nope: 0.5 },
      [0.5],
      'half',
      5,
      null,
    ]) {
      expect(parseLayout(JSON.stringify({ ...s, splits: bad }))).toBe(DEFAULT_LAYOUT);
    }
  });
});
