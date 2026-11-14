/**
 * Pure rules the Stage adds on top of the layout core (src/lib/stage): minSize enforcement (the M2 core does not know
 * module minimums), the visible column count, move-to-front, and column splitter bounds. No React, no DOM.
 *
 * minSize policy (ARCHITECTURE.md section 10): a module's `minSize` is a size class, read as a floor in rem
 * (width: narrow 12, regular 30, wide 42; height: short 6, regular 30, tall 42; the boundaries of the size scale).
 *  - Moves, stacks, unstacks and stack splitter changes are REFUSED when they would give a slot less than its module's
 *    minimum (the layout is returned unchanged), unless the slot already broke the minimum before the change.
 *  - A column width splitter CLAMPS to the minimum widths of the modules in its two columns.
 *  - Modules that start a new column (add, unstack) get that column widened to their minimum width.
 */
import {
  HEIGHT_CLASSES,
  SIZE_LARGE_MIN_REM,
  SIZE_MIN_HEIGHT_REM,
  SIZE_MIN_WIDTH_REM,
  SIZE_SMALL_MAX_REM,
  WIDTH_CLASSES,
  addModule,
  columnShares,
  columnSplitterRange,
  columnWidth,
  dragColumnSplitter,
  dragStackSplitter,
  locate,
  minShare,
  moveColumn,
  setColumnWidth,
  splitterAt,
  unstack,
  type Column,
  type Layout,
  type ModuleMeta,
  type ModuleRegistry,
} from '../../lib/stage';

const WIDTH_FLOOR_REM = [SIZE_MIN_WIDTH_REM, SIZE_SMALL_MAX_REM, SIZE_LARGE_MIN_REM] as const;
const HEIGHT_FLOOR_REM = [SIZE_MIN_HEIGHT_REM, SIZE_SMALL_MAX_REM, SIZE_LARGE_MIN_REM] as const;
const EPS = 0.01;

/** The least width (rem) a module's `minSize` asks for. */
export const minWidthRem = (m: ModuleMeta): number =>
  WIDTH_FLOOR_REM[Math.max(0, WIDTH_CLASSES.indexOf(m.minSize.width))];

/** The least height (rem, header strip included) a module's `minSize` asks for. */
export const minHeightRem = (m: ModuleMeta): number =>
  HEIGHT_FLOOR_REM[Math.max(0, HEIGHT_CLASSES.indexOf(m.minSize.height))];

/** The widest minimum among a column's modules (0 for unknown ids). */
export const columnMinWidth = (col: Column, registry: ModuleRegistry): number =>
  Math.max(0, ...col.slots.map((id) => (registry.has(id) ? minWidthRem(registry.get(id)!) : 0)));

/**
 * Slots whose room is below their module's minimum: `w:<id>` for width, `h:<id>` for height. Heights are only checked
 * when the column height `heightRem` is known (greater than 0); a stack's slots get their share of it.
 */
export function minProblems(l: Layout, registry: ModuleRegistry, heightRem: number): string[] {
  const out: string[] = [];
  l.columns.forEach((col, c) => {
    const width = columnWidth(col);
    const shares = columnShares(l, c);
    col.slots.forEach((id, i) => {
      const m = registry.get(id);
      if (!m) {
        return;
      }
      if (width < minWidthRem(m) - EPS) {
        out.push(`w:${id}`);
      }
      if (heightRem > 0 && heightRem * shares[i] < minHeightRem(m) - EPS) {
        out.push(`h:${id}`);
      }
    });
  });
  return out;
}

/** `next`, unless it gives some slot less than its module's minimum that it had before; then `prev` (refused). */
export function guarded(
  prev: Layout,
  next: Layout,
  registry: ModuleRegistry,
  heightRem: number
): Layout {
  if (next === prev) {
    return prev;
  }
  const before = new Set(minProblems(prev, registry, heightRem));
  return minProblems(next, registry, heightRem).every((p) => before.has(p)) ? next : prev;
}

const widenToMin = (l: Layout, id: string, registry: ModuleRegistry): Layout => {
  const at = locate(l, id);
  const m = registry.get(id);
  if (!at || !m) {
    return l;
  }
  return setColumnWidth(l, at.column, Math.max(columnWidth(l.columns[at.column]), minWidthRem(m)));
};

/** Add a module as its own column, wide enough for its minimum. */
export const addWithMin = (l: Layout, registry: ModuleRegistry, id: string, index?: number) =>
  widenToMin(addModule(l, id, index), id, registry);

/** Unstack, giving the new column at least the module's minimum width. */
export const unstackWithMin = (l: Layout, registry: ModuleRegistry, id: string) => {
  const next = unstack(l, id);
  return next === l ? l : widenToMin(next, id, registry);
};

/** Move the column holding `id` to the front (a repeated swap with its left neighbour). */
export function moveToFront(l: Layout, id: string): Layout {
  let cur = l;
  for (let n = 0; n < l.columns.length; n++) {
    const at = locate(cur, id);
    if (!at || at.column === 0) {
      break;
    }
    cur = moveColumn(cur, id, 'left');
  }
  return cur;
}

/** What a visible column costs besides its width: a splitter between neighbours, and the stage padding once. */
export const STAGE_COLUMN_COST = { splitterRem: 0.5, paddingRem: 0.5 } as const;

/**
 * How many leading columns to show: the longest left-to-right prefix whose widths, splitters between them and the stage
 * padding fit `widthRem`, but never fewer than one (when there is any column) and never more than exist.
 */
export function shownColumnCount(
  l: Layout,
  widthRem: number,
  cost: { splitterRem: number; paddingRem: number } = STAGE_COLUMN_COST
): number {
  let used = cost.paddingRem;
  let n = 0;
  for (const c of l.columns) {
    used += columnWidth(c) + (n > 0 ? cost.splitterRem : 0);
    if (!(used <= widthRem + 1e-9)) {
      break;
    }
    n++;
  }
  return Math.min(l.columns.length, Math.max(1, n));
}

/** The left column's width, and the range it may take given both columns' limits and their modules' minimums. */
export function columnSplitterBounds(
  l: Layout,
  registry: ModuleRegistry,
  index: number
): { now: number; min: number; max: number } | null {
  const a = l.columns[index];
  const b = l.columns[index + 1];
  if (!a || !b) {
    return null;
  }
  const range = columnSplitterRange(columnWidth(a), columnWidth(b));
  const total = columnWidth(a) + columnWidth(b);
  return {
    now: columnWidth(a),
    min: Math.max(range.min, columnMinWidth(a, registry)),
    max: Math.min(range.max, total - columnMinWidth(b, registry)),
  };
}

/** Drag a column splitter, clamped so neither column goes below its modules' minimum width. */
export function dragColumnSplitterMin(
  l: Layout,
  registry: ModuleRegistry,
  index: number,
  leftRem: number
): Layout {
  const b = columnSplitterBounds(l, registry, index);
  if (!b || b.min > b.max) {
    return l;
  }
  return dragColumnSplitter(l, index, Math.min(b.max, Math.max(b.min, leftRem)));
}

export const COLUMN_NUDGE_REM = 1;

/** Keyboard on a column splitter: Left and Right 1 rem, Home and End to the (minimum-aware) limits. */
export function nudgeColumnSplitterMin(
  l: Layout,
  registry: ModuleRegistry,
  index: number,
  key: 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End'
): Layout {
  const b = columnSplitterBounds(l, registry, index);
  if (!b) {
    return l;
  }
  const to =
    key === 'ArrowLeft'
      ? b.now - COLUMN_NUDGE_REM
      : key === 'ArrowRight'
        ? b.now + COLUMN_NUDGE_REM
        : key === 'Home'
          ? b.min
          : b.max;
  return dragColumnSplitterMin(l, registry, index, to);
}

/**
 * Where stack splitter `index` of `column` may sit (fractions of the column height): its two slots each keep the larger
 * of the core minimum and their module's minimum height (header strip included). `heightRem` 0 means unknown, so only the
 * core minimum applies.
 */
export function stackSplitterBounds(
  l: Layout,
  registry: ModuleRegistry,
  column: number,
  index: number,
  heightRem: number
): { now: number; min: number; max: number } | null {
  const col = l.columns[column];
  if (!col || index < 0 || index + 1 >= col.slots.length) {
    return null;
  }
  const shares = columnShares(l, column);
  const floor = (i: number) => {
    const m = registry.get(col.slots[i]);
    return Math.max(
      minShare(heightRem, shares.length),
      m && heightRem > 0 ? minHeightRem(m) / heightRem : 0
    );
  };
  const before = shares.slice(0, index).reduce((a, b) => a + b, 0);
  const after = before + shares[index] + shares[index + 1];
  return {
    now: splitterAt(shares, index),
    min: before + floor(index),
    max: after - floor(index + 1),
  };
}

/** Drag a stack splitter to `boundary`, clamped to `stackSplitterBounds`; refused when the minimums do not fit. */
export function dragStackSplitterMin(
  l: Layout,
  registry: ModuleRegistry,
  column: number,
  index: number,
  boundary: number,
  heightRem: number
): Layout {
  const b = stackSplitterBounds(l, registry, column, index, heightRem);
  if (!b || b.min > b.max) {
    return l;
  }
  return dragStackSplitter(l, column, index, Math.min(b.max, Math.max(b.min, boundary)), heightRem);
}

/** Keyboard on a stack splitter: Up and Down 5%, Home and End to the minimum-aware limits. */
export function nudgeStackSplitterMin(
  l: Layout,
  registry: ModuleRegistry,
  column: number,
  index: number,
  key: 'ArrowUp' | 'ArrowDown' | 'Home' | 'End',
  heightRem: number
): Layout {
  const b = stackSplitterBounds(l, registry, column, index, heightRem);
  if (!b) {
    return l;
  }
  const to =
    key === 'ArrowUp'
      ? b.now - 0.05
      : key === 'ArrowDown'
        ? b.now + 0.05
        : key === 'Home'
          ? b.min
          : b.max;
  return dragStackSplitterMin(l, registry, column, index, to, heightRem);
}
