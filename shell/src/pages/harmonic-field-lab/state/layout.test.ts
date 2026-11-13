import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LAYOUT,
  canMove,
  fitColumns,
  migrateV1,
  migrateV2,
  stackWith,
  canStackWith,
  stackTargets,
  move,
  parseLayout,
  pin,
  pinnedIds,
  unpin,
  unstack,
  DEFAULT_VIEWS,
  VIZ_VIEWS,
  setView,
  viewOf,
  clampShares,
  dragSplitter,
  evenShares,
  minShare,
  moveInStack,
  nudgeSplitter,
  splitterAt,
  splitterRange,
  setSplit,
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
    expect([...visiblePins(DEFAULT_LAYOUT, 2)]).toEqual(['chords', 'viz1']);
    expect([...visiblePins(DEFAULT_LAYOUT, 3)]).toEqual(['chords', 'viz1', 'keys']);
    expect(visiblePins(DEFAULT_LAYOUT, 9).size).toBe(4);
  });

  it('counts a stack as one column and shows both of its panels or neither', () => {
    const l: Layout = { left: [['keys', 'chords']], right: [['viz1', 'spectrum']] };
    expect([...visiblePins(l, 1)]).toEqual(['keys', 'chords']);
    expect([...visiblePins(l, 2)]).toEqual(['keys', 'chords', 'viz1', 'spectrum']);
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
      right: [['viz1'], ['spectrum'], ['retuner']],
    });
    expect(pin(a, 'retuner')).toBe(a);
    const b = pin({ left: [['keys']], right: [['viz1'], ['spectrum']] }, 'chords');
    expect(b.left).toEqual([['chords'], ['keys']]);
  });

  it('unpins; the other panel of a stack stays alone in its column', () => {
    expect(unpin(l, 'viz1')).toEqual({ left: [['keys'], ['chords']], right: [['spectrum']] });
    const s: Layout = { left: [['keys', 'chords']], right: [] };
    expect(unpin(s, 'keys')).toEqual({ left: [['chords']], right: [] });
    expect(unpin(s, 'chords')).toEqual({ left: [['keys']], right: [] });
  });

  it('reorders columns within a side, and the screen edge stops outward moves', () => {
    expect(move(l, 'keys', 'right').left).toEqual([['chords'], ['keys']]);
    expect(move(l, 'keys', 'left')).toBe(l);
    expect(move(l, 'viz1', 'right').right).toEqual([['spectrum'], ['viz1']]);
    expect(move(l, 'spectrum', 'right')).toBe(l);
    expect(move(l, 'spectrum', 'left').right).toEqual([['spectrum'], ['viz1']]);
    expect(canMove(l, 'keys', 'left')).toBe(false);
    expect(canMove(l, 'keys', 'right')).toBe(true);
  });

  it('crosses the generator when moving inward past the innermost column', () => {
    expect(move(l, 'chords', 'right')).toEqual({
      left: [['keys']],
      right: [['chords'], ['viz1'], ['spectrum']],
    });
    expect(move(l, 'viz1', 'left')).toEqual({
      left: [['keys'], ['chords'], ['viz1']],
      right: [['spectrum']],
    });
  });
});

describe('stacks', () => {
  it('unstacks to a column on the outer side of the one it leaves', () => {
    const left: Layout = { left: [['keys', 'chords']], right: [] };
    expect(unstack(left, 'chords').left).toEqual([['chords'], ['keys']]);
    expect(unstack(left, 'keys').left).toEqual([['keys'], ['chords']]);
    const right: Layout = { left: [], right: [['viz1', 'spectrum']] };
    expect(unstack(right, 'viz1').right).toEqual([['spectrum'], ['viz1']]);
    expect(unstack(right, 'spectrum').right).toEqual([['viz1'], ['spectrum']]);
    expect(unstack(DEFAULT_LAYOUT, 'keys')).toEqual(DEFAULT_LAYOUT);
  });

  it('swaps the two panels of a stack with moveInStack', () => {
    const s: Layout = { left: [['keys', 'chords']], right: [] };
    expect(moveInStack(s, 'keys', 'down').left).toEqual([['chords', 'keys']]);
    expect(moveInStack(s, 'chords', 'up').left).toEqual([['chords', 'keys']]);
    expect(moveInStack(DEFAULT_LAYOUT, 'keys', 'down')).toBe(DEFAULT_LAYOUT);
  });

  it('moving a panel out of a stack unstacks it first, to the side it was moved toward', () => {
    const s: Layout = { left: [['keys', 'chords']], right: [['viz1']] };
    expect(move(s, 'keys', 'left').left).toEqual([['keys'], ['chords']]);
    expect(move(s, 'keys', 'right').left).toEqual([['chords'], ['keys']]);
    expect(move(s, 'chords', 'right').left).toEqual([['keys'], ['chords']]);
    const r: Layout = { left: [], right: [['viz1', 'spectrum']] };
    expect(move(r, 'viz1', 'left').right).toEqual([['viz1'], ['spectrum']]);
    expect(move(r, 'viz1', 'right').right).toEqual([['spectrum'], ['viz1']]);
    expect(canMove(s, 'keys', 'left')).toBe(true);
  });

  it('moves a single column past a stack as one unit', () => {
    const s: Layout = { left: [['retuner'], ['keys', 'chords']], right: [] };
    expect(move(s, 'retuner', 'right').left).toEqual([['keys', 'chords'], ['retuner']]);
  });
});

describe('persistence shapes', () => {
  it('round-trips a good v2 value, stacks included', () => {
    const v: Layout = { left: [['chords']], right: [['keys', 'viz1']] };
    expect(parseLayout(JSON.stringify(v))).toEqual(v);
    expect(parseLayout(JSON.stringify({ left: [], right: [] }))).toEqual({ left: [], right: [] });
  });

  it('falls back to the defaults when nothing usable is stored', () => {
    for (const bad of [
      null,
      undefined,
      '',
      'not json',
      '5',
      '{"left":1,"right":2}',
      '{"left":[["nope"]],"right":[]}',
      '{"left":[[]],"right":[]}',
      '{"left":[["field"]],"right":[]}',
      '{"left":["chords"],"right":[]}',
    ]) {
      expect(parseLayout(bad)).toBe(DEFAULT_LAYOUT);
    }
  });

  it('drops only the bad entries: an unknown panel, a repeat, a fourth in a column (review finding 10)', () => {
    // a future panel id in the middle of a good layout does not wipe it
    expect(parseLayout('{"left":[["keys"],["future","chords"]],"right":[["viz1"]]}')).toEqual({
      left: [['keys'], ['chords']],
      right: [['viz1']],
    });
    expect(parseLayout('{"left":[["chords"]],"right":[["chords"]]}')).toEqual({
      left: [['chords']],
      right: [],
    });
    expect(parseLayout('{"left":[["chords","chords"]],"right":[]}')).toEqual({
      left: [['chords']],
      right: [],
    });
    expect(parseLayout('{"left":[["chords","keys","viz1","viz2"]],"right":[]}')).toEqual({
      left: [['chords', 'keys', 'viz1']],
      right: [],
    });
    // a side that is not a list is empty, the other side is kept
    expect(parseLayout('{"left":1,"right":[["keys"]]}')).toEqual({ left: [], right: [['keys']] });
    // a non-list column entry is skipped
    expect(parseLayout('{"left":["chords",["keys"]],"right":[]}')).toEqual({
      left: [['keys']],
      right: [],
    });
  });

  it('migrates v1 (flat lists): every pin becomes a one-panel column', () => {
    expect(migrateV1('{"left":["chords"],"right":["keys","lattice"]}')).toEqual({
      left: [['chords']],
      right: [['keys'], ['viz1']],
    });
    expect(migrateV1('{"left":["nope"],"right":[]}')).toBe(DEFAULT_LAYOUT);
    expect(migrateV1('{"left":["chords"],"right":["chords"]}')).toEqual({
      left: [['chords']],
      right: [],
    });
    expect(migrateV1('junk')).toBe(DEFAULT_LAYOUT);
  });
});

describe('splitters (pure)', () => {
  it('limits each panel to 20% or 6 rem, whichever is larger; a column too short is shared evenly', () => {
    expect(minShare(40, 2)).toBe(0.2);
    expect(minShare(20, 2)).toBe(0.3);
    expect(minShare(40, 3)).toBe(0.2);
    expect(minShare(25, 3)).toBeCloseTo(0.24, 9);
    expect(minShare(15, 2)).toBeCloseTo(0.4, 9);
    expect(minShare(12, 2)).toBe(0.5); // two minimums fill the column
    expect(minShare(18, 3)).toBeCloseTo(1 / 3, 9); // three minimums fill it
    expect(minShare(0, 2)).toBe(0.2);
  });

  it('repairs shares: lifts a panel to its minimum, takes the cost from the others, sums to 1', () => {
    expect(clampShares([0.5, 0.5], 40)).toEqual([0.5, 0.5]);
    expect(clampShares([0.05, 0.95], 40)).toEqual([0.2, 0.8]);
    expect(clampShares([0.97, 0.03], 40)).toEqual([0.8, 0.2]);
    expect(clampShares([0.05, 0.5, 0.45], 40)[0]).toBe(0.2);
    for (const s of [
      [0.05, 0.9, 0.05],
      [0.1, 0.1, 0.8],
      [0.8, 0.1, 0.1],
    ]) {
      const c = clampShares(s, 40);
      expect(c.every((v) => v >= 0.2 - 1e-9)).toBe(true);
      expect(c.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    }
    expect(clampShares([0.1, 0.9], 10)).toEqual([0.5, 0.5]); // too short
    expect(clampShares([Number.NaN, 0.5], 40)).toEqual([0.5, 0.5]);
  });

  it('drags one splitter by trading space between its two neighbours only', () => {
    const even3 = evenShares(3);
    expect(even3).toEqual([0.3333, 0.3333, 0.3333]);
    // the first splitter to 0.5: panel 1 grows, panel 2 shrinks, panel 3 is untouched
    const a = dragSplitter([0.3, 0.4, 0.3], 0, 0.5, 40);
    expect(a).toEqual([0.5, 0.2, 0.3]);
    // dragging far past the neighbour stops at its minimum (20% of the column)
    expect(dragSplitter([0.3, 0.4, 0.3], 0, 0.95, 40)).toEqual([0.5, 0.2, 0.3]);
    expect(dragSplitter([0.3, 0.4, 0.3], 0, 0, 40)).toEqual([0.2, 0.5, 0.3]);
    // the second splitter works on panels 2 and 3 only
    expect(dragSplitter([0.3, 0.4, 0.3], 1, 0.5, 40)).toEqual([0.3, 0.2, 0.5]);
    expect(dragSplitter([0.3, 0.4, 0.3], 1, 1, 40)).toEqual([0.3, 0.5, 0.2]);
    // a two-panel stack behaves as before
    expect(dragSplitter([0.5, 0.5], 0, 0.05, 40)).toEqual([0.2, 0.8]);
    expect(dragSplitter([0.5, 0.5], 0, 0.97, 40)).toEqual([0.8, 0.2]);
    expect(dragSplitter([0.5, 0.5], 0, Number.NaN, 40)).toEqual([0.5, 0.5]);
    expect(dragSplitter([0.5, 0.5], 3, 0.3, 40)).toEqual([0.5, 0.5]);
  });

  it('reports the range and the position of each splitter', () => {
    expect(splitterRange([0.3, 0.4, 0.3], 0, 40)).toEqual({ min: 0.2, max: 0.5 });
    expect(splitterRange([0.3, 0.4, 0.3], 1, 40)).toEqual({ min: 0.5, max: 0.8 });
    expect(splitterAt([0.3, 0.4, 0.3], 0)).toBe(0.3);
    expect(splitterAt([0.3, 0.4, 0.3], 1)).toBe(0.7);
  });

  it('nudges 5% with Up and Down (Up shrinks the panel above), jumps with Home and End, per splitter', () => {
    expect(nudgeSplitter([0.5, 0.5], 0, 'ArrowUp', 40)).toEqual([0.45, 0.55]);
    expect(nudgeSplitter([0.5, 0.5], 0, 'ArrowDown', 40)).toEqual([0.55, 0.45]);
    expect(nudgeSplitter([0.5, 0.5], 0, 'Home', 40)).toEqual([0.2, 0.8]);
    expect(nudgeSplitter([0.5, 0.5], 0, 'End', 40)).toEqual([0.8, 0.2]);
    expect(nudgeSplitter([0.2, 0.8], 0, 'ArrowUp', 40)).toEqual([0.2, 0.8]);
    const three = [0.3, 0.4, 0.3];
    expect(nudgeSplitter(three, 0, 'ArrowDown', 40)).toEqual([0.35, 0.35, 0.3]);
    expect(nudgeSplitter(three, 1, 'ArrowUp', 40)).toEqual([0.3, 0.35, 0.35]);
    expect(nudgeSplitter(three, 0, 'End', 40)).toEqual([0.5, 0.2, 0.3]);
    expect(nudgeSplitter(three, 1, 'Home', 40)).toEqual([0.3, 0.2, 0.5]);
    // never drifts past the minimums with repeated nudges
    let v = three;
    for (let i = 0; i < 10; i++) {
      v = nudgeSplitter(v, 0, 'ArrowDown', 40);
    }
    expect(v).toEqual([0.5, 0.2, 0.3]);
  });
});

describe('stored splits', () => {
  const s: Layout = { left: [['keys', 'chords']], right: [['viz1'], ['spectrum']] };
  const s3: Layout = { left: [['keys', 'chords', 'retuner']], right: [] };

  it('stores shares for the column a panel tops; even shares clear them; other panels are a no-op', () => {
    const a = setSplit(s, 'keys', [0.3, 0.7]);
    expect(a.splits).toEqual({ keys: [0.3, 0.7] });
    expect(splitOf(a, 'keys')).toEqual([0.3, 0.7]);
    expect(splitOf(s, 'keys')).toEqual([0.5, 0.5]);
    expect(setSplit(a, 'keys', [0.3, 0.7])).toBe(a);
    expect(setSplit(a, 'keys', [0.5, 0.5])).toEqual(s);
    expect(setSplit(s, 'chords', [0.3, 0.7])).toBe(s); // bottom panel
    expect(setSplit(s, 'viz1', [0.3, 0.7])).toBe(s); // a single column
    expect(setSplit(s, 'keys', [Number.NaN, 0.5])).toBe(s);
    expect(setSplit(s, 'keys', [0.3, 0.3, 0.4])).toBe(s); // wrong length
    expect(setSplit(s, 'keys', [0.3, 0.3])).toBe(s); // does not sum to 1
  });

  it('stores three shares for a three-panel stack and reads them back', () => {
    const a = setSplit(s3, 'keys', [0.2, 0.5, 0.3]);
    expect(a.splits).toEqual({ keys: [0.2, 0.5, 0.3] });
    expect(splitOf(a, 'keys')).toEqual([0.2, 0.5, 0.3]);
    expect(splitOf(s3, 'keys')).toEqual([0.3333, 0.3333, 0.3333]);
    expect(setSplit(a, 'keys', evenShares(3))).toEqual(s3);
  });

  it('moves each panel with its share inside a stack, and forgets them when the column changes', () => {
    const a = setSplit(s, 'keys', [0.3, 0.7]);
    expect(moveInStack(a, 'keys', 'down')).toEqual({
      left: [['chords', 'keys']],
      right: [['viz1'], ['spectrum']],
      splits: { chords: [0.7, 0.3] },
    });
    const b = setSplit(s3, 'keys', [0.2, 0.5, 0.3]);
    expect(moveInStack(b, 'keys', 'down').left).toEqual([['chords', 'keys', 'retuner']]);
    expect(moveInStack(b, 'keys', 'down').splits).toEqual({ chords: [0.5, 0.2, 0.3] });
    expect(moveInStack(b, 'retuner', 'up').splits).toEqual({ keys: [0.2, 0.3, 0.5] });
    expect(moveInStack(b, 'retuner', 'down')).toBe(b);
    expect(moveInStack(b, 'keys', 'up')).toBe(b);
    expect(moveInStack(s, 'viz1', 'down')).toBe(s);
    expect(unstack(a, 'keys').splits).toBeUndefined();
    expect(unpin(a, 'chords').splits).toBeUndefined();
    expect(move(a, 'keys', 'left').splits).toBeUndefined();
    expect(stackWith(a, 'viz1', 'keys').splits).toBeUndefined();
    const two: Layout = {
      left: [['retuner'], ['keys', 'chords']],
      right: [],
      splits: { keys: [0.3, 0.7] },
    };
    // moving a single column past a stack keeps the stack's shares
    expect(move(two, 'retuner', 'right').splits).toEqual({ keys: [0.3, 0.7] });
  });

  it('round-trips through JSON; shares for a panel that does not top a stack are dropped', () => {
    expect(setSplit(s, 'viz1', [0.3, 0.7])).toBe(s);
    const stored = JSON.stringify({ ...s, splits: { keys: [0.25, 0.75] } });
    expect(parseLayout(stored)).toEqual({ ...s, splits: { keys: [0.25, 0.75] } });
    expect(parseLayout(JSON.stringify({ ...s, splits: { chords: [0.25, 0.75] } }))).toEqual(s);
    expect(parseLayout(JSON.stringify({ ...s, splits: {} }))).toEqual(s);
    // shares for a different number of panels than the column holds are dropped
    expect(parseLayout(JSON.stringify({ ...s, splits: { keys: [0.2, 0.5, 0.3] } }))).toEqual(s);
  });

  it('migrates a stored single split number to [v, 1 - v]', () => {
    expect(parseLayout(JSON.stringify({ ...s, splits: { keys: 0.3 } }))).toEqual({
      ...s,
      splits: { keys: [0.3, 0.7] },
    });
    expect(
      migrateV2('{"left":[["keys","chords"]],"right":[["lattice"]],"splits":{"keys":0.25}}')
    ).toEqual({ left: [['keys', 'chords']], right: [['viz1']], splits: { keys: [0.25, 0.75] } });
    // a legacy split on a single column is dropped as before
    expect(parseLayout(JSON.stringify({ ...s, splits: { viz1: 0.3 } }))).toEqual(s);
  });

  it('drops a bad split entry (the layout stays), including shares that do not sum to about 1', () => {
    for (const bad of [
      { keys: 1.5 },
      { keys: -0.1 },
      { keys: 'x' },
      { keys: null },
      { keys: [0.5] },
      { keys: [0.5, 0.5, 0.5, 0.5] },
      { keys: [0.3, 0.3] },
      { keys: [0.6, 0.6] },
      { keys: [-0.2, 1.2] },
      { keys: [0.5, 'x'] },
      { keys: [0.5, null] },
      { nope: 0.5 },
      { nope: [0.5, 0.5] },
      [0.5],
      'half',
      5,
      null,
    ]) {
      expect(parseLayout(JSON.stringify({ ...s, splits: bad }))).toEqual(s);
    }
  });
});

describe('three-panel stacks', () => {
  const base: Layout = {
    left: [['keys'], ['chords']],
    right: [['viz1'], ['viz2'], ['viz3']],
  };

  it('builds a three-stack by stacking onto a column with room, the moved panel at the bottom', () => {
    const a = stackWith(base, 'viz2', 'viz1');
    expect(a.right).toEqual([['viz1', 'viz2'], ['viz3']]);
    const b = stackWith(a, 'viz3', 'viz2'); // any panel of the target column will do
    expect(b.right).toEqual([['viz1', 'viz2', 'viz3']]);
    expect(b.left).toEqual(base.left);
  });

  it('refuses a fourth panel in a column, and the same column', () => {
    const three: Layout = { left: [['keys']], right: [['viz1', 'viz2', 'viz3']] };
    expect(stackWith(three, 'keys', 'viz1')).toBe(three);
    expect(stackWith(three, 'keys', 'viz3')).toBe(three);
    expect(canStackWith(three, 'keys', 'viz2')).toBe(false);
    // already in the same column
    const two: Layout = { left: [], right: [['viz1', 'viz2']] };
    expect(stackWith(two, 'viz1', 'viz2')).toBe(two);
    expect(stackTargets(three, 'keys')).toEqual([]);
  });

  it('lists every panel whose column has room with its side and size', () => {
    const l: Layout = {
      left: [['keys', 'chords']],
      right: [['viz1', 'viz2', 'viz3'], ['spectrum']],
    };
    expect(stackTargets(l, 'retuner')).toEqual([
      { id: 'keys', side: 'left', count: 2 },
      { id: 'chords', side: 'left', count: 2 },
      { id: 'spectrum', side: 'right', count: 1 },
    ]);
    expect(stackTargets(l, 'keys')).toEqual([{ id: 'spectrum', side: 'right', count: 1 }]);
  });

  it('takes one panel out of a three-stack: the other two stay stacked', () => {
    const l: Layout = { left: [], right: [['viz1', 'viz2', 'viz3'], ['spectrum']] };
    expect(unstack(l, 'viz2').right).toEqual([['viz1', 'viz3'], ['viz2'], ['spectrum']]);
    expect(move(l, 'viz3', 'right').right).toEqual([['viz1', 'viz2'], ['viz3'], ['spectrum']]);
    expect(move(l, 'viz1', 'left').right).toEqual([['viz1'], ['viz2', 'viz3'], ['spectrum']]);
    expect(unpin(l, 'viz2').right).toEqual([['viz1', 'viz3'], ['spectrum']]);
    // from a stack into another column with room
    const m = stackWith(l, 'viz3', 'spectrum');
    expect(m.right).toEqual([
      ['viz1', 'viz2'],
      ['spectrum', 'viz3'],
    ]);
  });

  it('accepts one to three panels in a column on load; a fourth and a repeat are dropped', () => {
    const three: Layout = { left: [['keys', 'chords', 'retuner']], right: [['viz1']] };
    expect(parseLayout(JSON.stringify(three))).toEqual(three);
    expect(parseLayout('{"left":[["keys","chords","retuner","spectrum"]],"right":[]}')).toEqual({
      left: [['keys', 'chords', 'retuner']],
      right: [],
    });
    expect(parseLayout('{"left":[["keys","chords","keys"]],"right":[]}')).toEqual({
      left: [['keys', 'chords']],
      right: [],
    });
  });
});

describe('visualizer views (v3)', () => {
  it('defaults: viz1 pinned where Lattice was showing Lattice; viz2 and viz3 unpinned (EDO fit, Dissonance curve)', () => {
    expect(DEFAULT_LAYOUT.right[0]).toEqual(['viz1']);
    expect(pinnedIds(DEFAULT_LAYOUT)).not.toContain('viz2');
    expect(pinnedIds(DEFAULT_LAYOUT)).not.toContain('viz3');
    expect(DEFAULT_VIEWS).toEqual({ viz1: 'lattice', viz2: 'edo', viz3: 'dissonance' });
    expect(viewOf(DEFAULT_LAYOUT, 'viz2')).toBe('edo');
  });

  it('sets a view per instance; the default view stores nothing', () => {
    const a = setView(DEFAULT_LAYOUT, 'viz1', 'iso');
    expect(a.views).toEqual({ viz1: 'iso' });
    expect(viewOf(a, 'viz1')).toBe('iso');
    expect(viewOf(a, 'viz2')).toBe('edo');
    expect(setView(a, 'viz1', 'iso')).toBe(a);
    expect(setView(a, 'viz1', 'lattice')).toEqual(DEFAULT_LAYOUT);
    expect(VIZ_VIEWS).toHaveLength(4);
  });

  it('keeps views through unpin, move and stack, and round-trips through JSON', () => {
    const l = setView({ left: [['keys']], right: [['viz1'], ['viz2']] }, 'viz2', 'dissonance');
    const l2 = setView(l, 'viz1', 'edo');
    expect(unpin(l2, 'viz2').views).toEqual(l2.views);
    expect(move(l2, 'viz2', 'right').views).toEqual(l2.views);
    expect(stackWith(l2, 'viz2', 'keys').views).toEqual(l2.views);
    expect(parseLayout(JSON.stringify(l2))).toEqual(l2);
    // a stored default view is dropped on load
    expect(
      parseLayout(JSON.stringify({ ...l, views: { viz1: 'lattice', viz2: 'dissonance' } }))
    ).toEqual(l);
  });

  it('drops a bad view entry and keeps the layout', () => {
    for (const bad of [
      { viz1: 'nope' },
      { lattice: 'iso' },
      { viz9: 'iso' },
      { viz1: 3 },
      ['iso'],
      'iso',
      null,
    ]) {
      expect(parseLayout(JSON.stringify({ ...DEFAULT_LAYOUT, views: bad }))).toEqual(
        DEFAULT_LAYOUT
      );
    }
    // one good entry beside a bad one is kept
    expect(
      parseLayout(JSON.stringify({ ...DEFAULT_LAYOUT, views: { viz1: 'nope', viz2: 'iso' } })).views
    ).toEqual({ viz2: 'iso' });
  });

  it('migrates v2: lattice becomes viz1, in columns and in stored splits', () => {
    expect(
      migrateV2(
        '{"left":[["keys","chords"]],"right":[["lattice","spectrum"]],"splits":{"lattice":0.3}}'
      )
    ).toEqual({
      left: [['keys', 'chords']],
      right: [['viz1', 'spectrum']],
      splits: { viz1: [0.3, 0.7] },
    });
    expect(migrateV2('{"left":[],"right":[["lattice"],["retuner"]]}')).toEqual({
      left: [],
      right: [['viz1'], ['retuner']],
    });
  });

  it('migrates v2 defensively: unusable data gives the defaults, bad entries are dropped', () => {
    for (const bad of [null, undefined, '', 'junk', '5', '{"left":[["nope"]],"right":[]}']) {
      expect(migrateV2(bad)).toBe(DEFAULT_LAYOUT);
    }
    // lattice and viz1 are the same panel: the repeat is dropped
    expect(migrateV2('{"left":[["lattice"]],"right":[["viz1"]]}')).toEqual({
      left: [['viz1']],
      right: [],
    });
    expect(migrateV2('{"left":[["lattice","chords","keys","retuner"]],"right":[]}')).toEqual({
      left: [['viz1', 'chords', 'keys']],
      right: [],
    });
    expect(migrateV2('{"left":[["lattice","keys"]],"right":[],"splits":{"lattice":2}}')).toEqual({
      left: [['viz1', 'keys']],
      right: [],
    });
    expect(migrateV2('{"left":[["lattice","keys"]],"right":[],"splits":[1]}')).toEqual({
      left: [['viz1', 'keys']],
      right: [],
    });
  });
});

describe('stackWith (stack across sides and at a distance)', () => {
  const base: Layout = {
    left: [['keys'], ['chords']],
    right: [['viz1'], ['spectrum'], ['viz3']],
  };

  it('moves a single panel under a single panel on the other side, at any distance; the new panel is at the bottom', () => {
    const a = stackWith(base, 'viz3', 'chords');
    expect(a.left).toEqual([['keys'], ['chords', 'viz3']]);
    expect(a.right).toEqual([['viz1'], ['spectrum']]); // the emptied column disappears
    const b = stackWith(base, 'keys', 'viz3');
    expect(b.left).toEqual([['chords']]);
    expect(b.right).toEqual([['viz1'], ['spectrum'], ['viz3', 'keys']]);
    // the common case: Dissonance onto Lattice, two columns apart on the same side
    expect(stackWith(base, 'viz3', 'viz1').right).toEqual([['viz1', 'viz3'], ['spectrum']]);
  });

  it('takes one half out of a stack and puts it under another single; the other half stays alone', () => {
    const l: Layout = { left: [['keys', 'chords']], right: [['viz1'], ['spectrum']] };
    const a = stackWith(l, 'chords', 'viz1');
    expect(a.left).toEqual([['keys']]);
    expect(a.right).toEqual([['viz1', 'chords'], ['spectrum']]);
    const b = stackWith(l, 'keys', 'spectrum');
    expect(b.left).toEqual([['chords']]);
    expect(b.right).toEqual([['viz1'], ['spectrum', 'keys']]);
  });

  it('forgets the stored splits of the columns it changes', () => {
    const l: Layout = {
      left: [['keys', 'chords']],
      right: [['viz1']],
      splits: { keys: [0.3, 0.7] },
    };
    expect(stackWith(l, 'chords', 'viz1').splits).toBeUndefined();
  });

  it('is a no-op (same object) when the target column is full, ids are unpinned or equal', () => {
    const l: Layout = { left: [['keys', 'chords', 'retuner']], right: [['viz1']] };
    expect(stackWith(l, 'viz1', 'keys')).toBe(l); // target column holds three
    expect(stackWith(l, 'viz1', 'viz1')).toBe(l);
    expect(stackWith(l, 'spectrum', 'viz1')).toBe(l); // not pinned
    expect(stackWith(l, 'viz1', 'spectrum')).toBe(l); // target not pinned
    expect(canStackWith(l, 'viz1', 'keys')).toBe(false);
    expect(canStackWith({ left: [['keys', 'chords']], right: [['viz1']] }, 'viz1', 'keys')).toBe(
      true
    );
    expect(canStackWith(base, 'viz3', 'viz1')).toBe(true);
  });

  it('lists the panels alone in their column, with their side', () => {
    expect(stackTargets(base, 'viz3')).toEqual([
      { id: 'keys', side: 'left', count: 1 },
      { id: 'chords', side: 'left', count: 1 },
      { id: 'viz1', side: 'right', count: 1 },
      { id: 'spectrum', side: 'right', count: 1 },
    ]);
    expect(stackTargets({ left: [['keys', 'chords']], right: [['viz1']] }, 'viz1')).toEqual([
      { id: 'keys', side: 'left', count: 2 },
      { id: 'chords', side: 'left', count: 2 },
    ]);
    expect(stackTargets({ left: [], right: [['viz1']] }, 'viz1')).toEqual([]);
  });

  it('pins on the inner end of the chosen side, next to the generator', () => {
    expect(pin(base, 'retuner', 'left').left).toEqual([['keys'], ['chords'], ['retuner']]);
    expect(pin(base, 'retuner', 'right').right).toEqual([
      ['retuner'],
      ['viz1'],
      ['spectrum'],
      ['viz3'],
    ]);
    expect(pin(base, 'viz1', 'left')).toBe(base); // already pinned
    expect(pin(base, 'retuner').right.length + pin(base, 'retuner').left.length).toBe(6);
  });
});
