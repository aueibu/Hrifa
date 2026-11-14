import { describe, expect, it } from 'vitest';
import {
  createRegistry,
  columnWidth,
  stackOnto,
  type Layout,
  type ModuleMeta,
  type SlotSize,
} from '../../lib/stage';
import {
  addWithMin,
  columnSplitterBounds,
  dragColumnSplitterMin,
  guarded,
  minHeightRem,
  minProblems,
  minWidthRem,
  moveToFront,
  nudgeStackSplitterMin,
  dragStackSplitterMin,
  stackSplitterBounds,
  nudgeColumnSplitterMin,
  shownColumnCount,
  unstackWithMin,
} from './stageOps';

const all: SlotSize[] = [{ width: 'wide', height: 'tall' }];
const meta = (id: string, minSize: SlotSize): ModuleMeta => ({
  id,
  title: id,
  sizes: all,
  minSize,
});
const registry = createRegistry([
  meta('a', { width: 'narrow', height: 'short' }),
  meta('b', { width: 'regular', height: 'short' }),
  meta('w', { width: 'wide', height: 'regular' }),
]);
const layout = (cols: { slots: string[]; width?: number }[]): Layout => ({
  version: 1,
  columns: cols,
});

describe('minimum size floors', () => {
  it('reads the class as the scale boundary in rem', () => {
    expect(minWidthRem(registry.get('a')!)).toBe(12);
    expect(minWidthRem(registry.get('b')!)).toBe(30);
    expect(minWidthRem(registry.get('w')!)).toBe(42);
    expect(minHeightRem(registry.get('a')!)).toBe(6);
    expect(minHeightRem(registry.get('w')!)).toBe(30);
  });
});

describe('guarded (refuse)', () => {
  it('refuses a stack that would put a module in a column narrower than its minimum', () => {
    const l = layout([
      { slots: ['a'], width: 24 },
      { slots: ['b'], width: 36 },
    ]);
    const next = stackOnto(l, 'b', 'a');
    expect(next).not.toBe(l);
    expect(guarded(l, next, registry, 0)).toBe(l);
  });

  it('allows the stack the other way round and a move that changes no width', () => {
    const l = layout([
      { slots: ['a'], width: 24 },
      { slots: ['b'], width: 36 },
    ]);
    const next = stackOnto(l, 'a', 'b');
    expect(guarded(l, next, registry, 0)).toBe(next);
  });

  it('refuses a stack whose slots would get less height than a module minimum', () => {
    const l = layout([
      { slots: ['w'], width: 48 },
      { slots: ['a'], width: 36 },
    ]);
    // 50 rem split two ways is 25 rem each: 'w' wants 30
    const next = stackOnto(l, 'a', 'w');
    expect(minProblems(next, registry, 50)).toContain('h:w');
    expect(guarded(l, next, registry, 50)).toBe(l);
    expect(guarded(l, next, registry, 0)).toBe(next); // height unknown: not checked
  });

  it('does not refuse for a problem that already existed', () => {
    const l = layout([
      { slots: ['b'], width: 20 },
      { slots: ['a'], width: 20 },
    ]);
    expect(minProblems(l, registry, 0)).toEqual(['w:b']);
    const moved = stackOnto(l, 'a', 'b');
    expect(guarded(l, moved, registry, 0)).toBe(moved);
  });
});

describe('column splitter (clamp)', () => {
  const l = layout([
    { slots: ['a'], width: 24 },
    { slots: ['b'], width: 36 },
  ]);

  it('reports bounds that respect both columns minimums', () => {
    expect(columnSplitterBounds(l, registry, 0)).toEqual({ now: 24, min: 12, max: 30 });
  });

  it('clamps End and a long drag so the right column keeps its minimum', () => {
    const end = nudgeColumnSplitterMin(l, registry, 0, 'End');
    expect(columnWidth(end.columns[0])).toBe(30);
    expect(columnWidth(end.columns[1])).toBe(30);
    const drag = dragColumnSplitterMin(l, registry, 0, 80);
    expect(columnWidth(drag.columns[0])).toBe(30);
  });

  it('moves one rem on an arrow and goes to the minimum on Home', () => {
    expect(columnWidth(nudgeColumnSplitterMin(l, registry, 0, 'ArrowRight').columns[0])).toBe(25);
    expect(columnWidth(nudgeColumnSplitterMin(l, registry, 0, 'Home').columns[0])).toBe(12);
  });

  it('refuses when the two minimums do not fit the pair', () => {
    const tight = layout([
      { slots: ['w'], width: 42 },
      { slots: ['w2'], width: 12 },
    ]);
    const reg = createRegistry([
      meta('w', { width: 'wide', height: 'short' }),
      meta('w2', { width: 'wide', height: 'short' }),
    ]);
    expect(dragColumnSplitterMin(tight, reg, 0, 30)).toBe(tight);
  });
});

describe('adding and unstacking widen to the minimum', () => {
  it('gives an added wide-minimum module a 42 rem column', () => {
    const l = addWithMin(layout([{ slots: ['a'] }]), registry, 'w');
    expect(columnWidth(l.columns[1])).toBe(42);
    expect(columnWidth(addWithMin(l, registry, 'b').columns[2])).toBe(36);
  });

  it('widens the new column when a wide-minimum module is unstacked', () => {
    const l = layout([{ slots: ['a', 'w'], width: 48 }]);
    const next = unstackWithMin(l, registry, 'w');
    expect(next.columns.map((c) => c.slots)).toEqual([['a'], ['w']]);
    expect(columnWidth(next.columns[1])).toBe(42);
  });
});

describe('moveToFront and shownColumnCount', () => {
  it('brings the column holding a module to the front, keeping the others in order', () => {
    const l = layout([{ slots: ['a'] }, { slots: ['b'] }, { slots: ['w'] }]);
    expect(moveToFront(l, 'w').columns.map((c) => c.slots[0])).toEqual(['w', 'a', 'b']);
    expect(moveToFront(l, 'a')).toBe(l);
  });

  it('always shows at least one column, never more than exist', () => {
    const l = layout([{ slots: ['a'] }, { slots: ['b'] }]);
    expect(shownColumnCount(l, 5)).toBe(1);
    expect(shownColumnCount(l, 500)).toBe(2);
    expect(shownColumnCount({ version: 1, columns: [] }, 100)).toBe(0);
  });
});

describe('shownColumnCount cost', () => {
  const l = layout([
    { slots: ['a'], width: 24 },
    { slots: ['b'], width: 42 },
  ]);

  it('counts widths, one splitter between columns and the stage padding', () => {
    // 24 + 0.5 + 42 + 0.5 padding = 67
    expect(shownColumnCount(l, 67)).toBe(2);
    expect(shownColumnCount(l, 66)).toBe(1);
    expect(shownColumnCount(l, 24.5)).toBe(1);
  });

  it('shows one column even when it does not fit, and takes the cost as an option', () => {
    expect(shownColumnCount(l, 3)).toBe(1);
    expect(shownColumnCount(l, 66, { splitterRem: 0, paddingRem: 0 })).toBe(2);
  });
});

describe('stack splitter (clamp to module minimums)', () => {
  const tall = createRegistry([
    meta('m30', { width: 'narrow', height: 'regular' }),
    meta('a', { width: 'narrow', height: 'short' }),
  ]);
  const l = layout([{ slots: ['m30', 'a'], width: 36 }]);

  it('reports bounds that keep a 30 rem module at 30 rem', () => {
    const b = stackSplitterBounds(l, tall, 0, 0, 100)!;
    expect(b.now).toBe(0.5);
    expect(b.min).toBeCloseTo(0.3);
    expect(b.max).toBeCloseTo(0.8); // the core's 20% for the lower slot
  });

  it('Home goes to the module minimum, not the core minimum, and a long drag clamps', () => {
    const home = nudgeStackSplitterMin(l, tall, 0, 0, 'Home', 100);
    expect(home.columns[0].shares).toEqual([0.3, 0.7]);
    const up = dragStackSplitterMin(l, tall, 0, 0, 0.05, 100);
    expect(up.columns[0].shares).toEqual([0.3, 0.7]);
  });

  it('uses only the core minimum while the height is unknown', () => {
    expect(stackSplitterBounds(l, tall, 0, 0, 0)!.min).toBeCloseTo(0.2);
  });

  it('refuses when the two minimums cannot both fit', () => {
    const two = createRegistry([
      meta('m30', { width: 'narrow', height: 'regular' }),
      meta('a', { width: 'narrow', height: 'regular' }),
    ]);
    expect(dragStackSplitterMin(l, two, 0, 0, 0.5, 50)).toBe(l);
  });
});
