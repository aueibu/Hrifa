import { describe, expect, it } from 'vitest';
import {
  MAX_STACK,
  addModule,
  canMoveColumn,
  canStackOnto,
  clampColumnShares,
  columnShares,
  columnWidth,
  dragColumnSplitter,
  dragStackSplitter,
  fitColumns,
  locate,
  moduleIds,
  moveColumn,
  moveInStack,
  nudgeColumnSplitter,
  nudgeStackSplitter,
  removeModule,
  setColumnShares,
  setColumnWidth,
  stackOnto,
  stackTargets,
  unstack,
  visibleColumns,
  type Layout,
} from './layout';

const L = (...cols: string[][]): Layout => ({
  version: 1,
  columns: cols.map((slots) => ({ slots })),
});
const slotsOf = (l: Layout) => l.columns.map((c) => c.slots);

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
}

describe('add and remove', () => {
  it('adds at the end or at an index (clamped); a repeat is a no-op', () => {
    const l = L(['a'], ['b']);
    expect(slotsOf(addModule(l, 'c'))).toEqual([['a'], ['b'], ['c']]);
    expect(slotsOf(addModule(l, 'c', 0))).toEqual([['c'], ['a'], ['b']]);
    expect(slotsOf(addModule(l, 'c', 1))).toEqual([['a'], ['c'], ['b']]);
    expect(slotsOf(addModule(l, 'c', 99))).toEqual([['a'], ['b'], ['c']]);
    expect(slotsOf(addModule(l, 'c', -4))).toEqual([['c'], ['a'], ['b']]);
    expect(addModule(l, 'a')).toBe(l);
  });
  it('removes; the rest of a stack stays together in its column', () => {
    expect(slotsOf(removeModule(L(['a'], ['b']), 'a'))).toEqual([['b']]);
    expect(slotsOf(removeModule(L(['a', 'b']), 'a'))).toEqual([['b']]);
    const l = L(['a']);
    expect(removeModule(l, 'zz')).toBe(l);
  });
  it('keeps the width of a column that loses a member, drops its shares', () => {
    const l: Layout = {
      version: 1,
      columns: [{ slots: ['a', 'b'], width: 20, shares: [0.3, 0.7] }],
    };
    expect(removeModule(l, 'a').columns[0]).toEqual({ slots: ['b'], width: 20 });
  });
});

describe('moving columns', () => {
  const l = L(['a'], ['b', 'c'], ['d']);
  it('swaps with the neighbour and stops at the edges', () => {
    expect(slotsOf(moveColumn(l, 'a', 'right'))).toEqual([['b', 'c'], ['a'], ['d']]);
    expect(slotsOf(moveColumn(l, 'c', 'left'))).toEqual([['b', 'c'], ['a'], ['d']]);
    expect(moveColumn(l, 'a', 'left')).toBe(l);
    expect(moveColumn(l, 'd', 'right')).toBe(l);
    expect(moveColumn(l, 'zz', 'right')).toBe(l);
    expect(canMoveColumn(l, 'a', 'left')).toBe(false);
    expect(canMoveColumn(l, 'a', 'right')).toBe(true);
  });
});

describe('stacks', () => {
  it('stacks onto another column, at the bottom; the old single column disappears', () => {
    const l = L(['a'], ['b'], ['c']);
    expect(slotsOf(stackOnto(l, 'a', 'c'))).toEqual([['b'], ['c', 'a']]);
    expect(canStackOnto(l, 'a', 'b')).toBe(true);
  });
  it('limits a stack to MAX_STACK', () => {
    expect(MAX_STACK).toBe(3);
    const l = L(['a', 'b', 'c'], ['d']);
    expect(stackOnto(l, 'd', 'a')).toBe(l);
    expect(canStackOnto(l, 'd', 'a')).toBe(false);
    const two = L(['a', 'b'], ['d']);
    expect(slotsOf(stackOnto(two, 'd', 'b'))).toEqual([['a', 'b', 'd']]);
  });
  it('is a no-op for unknown, same, or same-column ids', () => {
    const l = L(['a', 'b'], ['c']);
    expect(stackOnto(l, 'a', 'a')).toBe(l);
    expect(stackOnto(l, 'a', 'b')).toBe(l);
    expect(stackOnto(l, 'zz', 'a')).toBe(l);
    expect(stackOnto(l, 'a', 'zz')).toBe(l);
  });
  it('leaves the rest of the old stack together when one member moves away', () => {
    const l = L(['a', 'b'], ['c']);
    expect(slotsOf(stackOnto(l, 'a', 'c'))).toEqual([['b'], ['c', 'a']]);
  });
  it('lists stack targets with room', () => {
    const l = L(['a'], ['b', 'c', 'd'], ['e', 'f']);
    expect(stackTargets(l, 'a')).toEqual([
      { id: 'e', column: 2, count: 2 },
      { id: 'f', column: 2, count: 2 },
    ]);
  });
  it('unstacks to its own column right of the old one', () => {
    const l = L(['a', 'b', 'c'], ['d']);
    expect(slotsOf(unstack(l, 'b'))).toEqual([['a', 'c'], ['b'], ['d']]);
    expect(slotsOf(unstack(l, 'a'))).toEqual([['b', 'c'], ['a'], ['d']]);
    expect(unstack(l, 'd')).toBe(l);
    expect(unstack(l, 'zz')).toBe(l);
  });
  it('moves within a stack; the share moves with the module', () => {
    const l: Layout = {
      version: 1,
      columns: [{ slots: ['a', 'b', 'c'], shares: [0.5, 0.3, 0.2] }],
    };
    const down = moveInStack(l, 'a', 'down');
    expect(down.columns[0]).toEqual({ slots: ['b', 'a', 'c'], shares: [0.3, 0.5, 0.2] });
    expect(moveInStack(l, 'a', 'up')).toBe(l);
    expect(moveInStack(l, 'c', 'down')).toBe(l);
    const single = L(['a']);
    expect(moveInStack(single, 'a', 'down')).toBe(single);
    expect(moveInStack(l, 'zz', 'down')).toBe(l);
  });
  it('drops shares when the stack membership changes', () => {
    const l: Layout = {
      version: 1,
      columns: [{ slots: ['a', 'b'], shares: [0.3, 0.7] }, { slots: ['c'] }],
    };
    expect(stackOnto(l, 'c', 'a').columns[0].shares).toBeUndefined();
    expect(unstack(l, 'b').columns[0].shares).toBeUndefined();
  });
  it('locate reports column, index and count', () => {
    expect(locate(L(['a'], ['b', 'c']), 'c')).toEqual({ column: 1, index: 1, count: 2 });
    expect(locate(L(['a']), 'x')).toBeNull();
    expect(moduleIds(L(['a'], ['b', 'c']))).toEqual(['a', 'b', 'c']);
  });
});

describe('column widths and the column splitter', () => {
  it('uses the default width when none is stored and clamps set widths', () => {
    const l = L(['a'], ['b']);
    expect(columnWidth(l.columns[0])).toBe(36);
    expect(setColumnWidth(l, 0, 2).columns[0].width).toBe(12);
    expect(setColumnWidth(l, 0, 1000).columns[0].width).toBe(96);
    expect(setColumnWidth(l, 5, 20)).toBe(l);
    expect(setColumnWidth(l, 0, Number.NaN)).toBe(l);
    const w = setColumnWidth(l, 0, 20);
    expect(setColumnWidth(w, 0, 20)).toBe(w);
  });
  it('drag keeps the total width and respects both minimums', () => {
    const l = L(['a'], ['b'], ['c']);
    const a = dragColumnSplitter(l, 0, 50);
    expect(columnWidth(a.columns[0]) + columnWidth(a.columns[1])).toBeCloseTo(72, 9);
    expect(columnWidth(a.columns[0])).toBe(50);
    expect(columnWidth(a.columns[2])).toBe(36);
    const lo = dragColumnSplitter(l, 0, 0);
    expect(columnWidth(lo.columns[0])).toBe(12);
    expect(columnWidth(lo.columns[1])).toBe(60);
    const hi = dragColumnSplitter(l, 0, 999);
    expect(columnWidth(hi.columns[1])).toBe(12);
    expect(dragColumnSplitter(l, 2, 40)).toBe(l);
    expect(dragColumnSplitter(l, -1, 40)).toBe(l);
    expect(dragColumnSplitter(l, 0, 36)).toBe(l);
  });
  it('keyboard nudges 1 rem and Home/End go to the limits', () => {
    const l = L(['a'], ['b']);
    const r = nudgeColumnSplitter(l, 0, 'ArrowRight');
    expect([columnWidth(r.columns[0]), columnWidth(r.columns[1])]).toEqual([37, 35]);
    const h = nudgeColumnSplitter(l, 0, 'End');
    expect([columnWidth(h.columns[0]), columnWidth(h.columns[1])]).toEqual([60, 12]);
    expect(nudgeColumnSplitter(h, 0, 'ArrowRight')).toBe(h);
    expect(nudgeColumnSplitter(l, 3, 'Home')).toBe(l);
  });
});

describe('stack share splitters on a layout', () => {
  const l = L(['a', 'b', 'c']);
  it('reads even shares when none are stored', () => {
    expect(columnShares(l, 0)).toEqual([0.3333, 0.3333, 0.3333]);
    expect(columnShares(l, 4)).toEqual([]);
  });
  it('drags within the clamp and stores the result', () => {
    const a = dragStackSplitter(l, 0, 0, 0.5, 40);
    expect(columnShares(a, 0)[1]).toBe(0.2);
    expect(columnShares(a, 0)[2]).toBeCloseTo(0.3333, 3);
    expect(columnShares(a, 0)[0]).toBeCloseTo(0.4667, 3);
    const far = dragStackSplitter(l, 0, 0, 0.99, 40);
    expect(columnShares(far, 0)[1]).toBeGreaterThanOrEqual(0.2 - 1e-9);
    expect(columnShares(far, 0).reduce((x, y) => x + y, 0)).toBeCloseTo(1, 3);
  });
  it('nudges 5% and returns to no stored shares when back to even', () => {
    const two = L(['a', 'b']);
    const down = nudgeStackSplitter(two, 0, 0, 'ArrowDown', 40);
    expect(down.columns[0].shares).toEqual([0.55, 0.45]);
    const back = nudgeStackSplitter(down, 0, 0, 'ArrowUp', 40);
    expect(back.columns[0].shares).toBeUndefined();
    expect(nudgeStackSplitter(two, 3, 0, 'Home', 40)).toBe(two);
  });
  it('refuses bad shares and singles', () => {
    expect(setColumnShares(l, 0, [0.5, 0.5])).toBe(l);
    expect(setColumnShares(l, 0, [0.5, 0.5, 0.5])).toBe(l);
    expect(setColumnShares(l, 0, [Number.NaN, 0.5, 0.5])).toBe(l);
    const single = L(['a']);
    expect(setColumnShares(single, 0, [1])).toBe(single);
  });
  it('clampColumnShares repairs stored shares for a height', () => {
    const bad: Layout = { version: 1, columns: [{ slots: ['a', 'b'], shares: [0.05, 0.95] }] };
    expect(clampColumnShares(bad, 0, 40).columns[0].shares).toEqual([0.2, 0.8]);
  });
});

describe('fitColumns and visibleColumns', () => {
  const l: Layout = {
    version: 1,
    columns: [{ slots: ['a'], width: 24 }, { slots: ['b', 'c'], width: 30 }, { slots: ['d'] }],
  };
  it('counts leading whole columns that fit, each paying a 0.25 rem gap', () => {
    expect(fitColumns(0, l)).toBe(0);
    expect(fitColumns(24.24, l)).toBe(0);
    expect(fitColumns(24.25, l)).toBe(1);
    expect(fitColumns(54.49, l)).toBe(1);
    expect(fitColumns(54.5, l)).toBe(2);
    expect(fitColumns(90.74, l)).toBe(2);
    expect(fitColumns(90.75, l)).toBe(3);
    expect(fitColumns(Number.NaN, l)).toBe(0);
  });
  it('keeps left-to-right order and never splits a stack', () => {
    const { visible, hidden } = visibleColumns(l, 60);
    expect(visible.map((c) => c.slots)).toEqual([['a'], ['b', 'c']]);
    expect(hidden.map((c) => c.slots)).toEqual([['d']]);
    const narrowFit = visibleColumns(l, 30);
    expect(narrowFit.visible.map((c) => c.slots)).toEqual([['a']]);
    expect(narrowFit.hidden.map((c) => c.slots)).toEqual([['b', 'c'], ['d']]);
  });
  it('does not skip a wide column to show a later narrow one', () => {
    const w: Layout = {
      version: 1,
      columns: [
        { slots: ['a'], width: 80 },
        { slots: ['b'], width: 12 },
      ],
    };
    expect(fitColumns(60, w)).toBe(0);
  });
});

describe('purity', () => {
  it('every operation returns a new object and leaves a frozen input unchanged', () => {
    const base: Layout = {
      version: 1,
      columns: [
        { slots: ['a', 'b'], shares: [0.3, 0.7], width: 30 },
        { slots: ['c'] },
        { slots: ['d'] },
      ],
    };
    const snapshot = JSON.stringify(base);
    const l = deepFreeze(structuredClone(base));
    const changed: Layout[] = [
      addModule(l, 'e'),
      removeModule(l, 'a'),
      moveColumn(l, 'c', 'right'),
      stackOnto(l, 'c', 'a'),
      unstack(l, 'a'),
      moveInStack(l, 'a', 'down'),
      setColumnWidth(l, 1, 20),
      dragColumnSplitter(l, 1, 40),
      nudgeColumnSplitter(l, 1, 'ArrowRight'),
      dragStackSplitter(l, 0, 0, 0.5, 40),
      nudgeStackSplitter(l, 0, 0, 'ArrowDown', 40),
      setColumnShares(l, 0, [0.4, 0.6]),
    ];
    for (const next of changed) {
      expect(next).not.toBe(l);
    }
    expect(JSON.stringify(l)).toBe(snapshot);
  });
  it('unknown input returns the same object', () => {
    const l = deepFreeze(L(['a'], ['b']));
    expect(removeModule(l, 'zz')).toBe(l);
    expect(moveColumn(l, 'zz', 'left')).toBe(l);
    expect(unstack(l, 'zz')).toBe(l);
  });
});

describe('review additions', () => {
  it('stackOnto keeps the target column width while dropping its shares', () => {
    const l: Layout = {
      version: 1,
      columns: [{ slots: ['a', 'b'], width: 20, shares: [0.3, 0.7] }, { slots: ['c'] }],
    };
    expect(stackOnto(l, 'c', 'a').columns[0]).toEqual({ slots: ['a', 'b', 'c'], width: 20 });
  });
  it('moveInStack up actually moves', () => {
    expect(slotsOf(moveInStack(L(['a', 'b', 'c']), 'c', 'up'))).toEqual([['a', 'c', 'b']]);
  });
  it('unstack gives the new column the default width', () => {
    const l: Layout = { version: 1, columns: [{ slots: ['a', 'b'], width: 20 }] };
    const next = unstack(l, 'b');
    expect(next.columns[0].width).toBe(20);
    expect(next.columns[1].width).toBeUndefined();
  });
  it('shares [0, 1] are accepted as given (current behaviour); M3 must call clampColumnShares', () => {
    const l = setColumnShares(L(['a', 'b']), 0, [0, 1]);
    expect(l.columns[0].shares).toEqual([0, 1]);
    expect(clampColumnShares(l, 0, 40).columns[0].shares).toEqual([0.2, 0.8]);
  });
});
