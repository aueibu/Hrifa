/**
 * The Stage layout: one ordered row of columns, left to right, each holding one to three module slots (a stack, top
 * first). Plain serialisable data plus the pure rules that edit it. Every operation returns a new Layout and never
 * mutates its input; an unknown id or an impossible request returns the very same object (so `next === prev` means "did
 * nothing"). No React, no storage; persistence is persist.ts.
 *
 * The lab had a left side and a right side around a fixed workspace. The Stage has no fixed middle, so that concept is
 * dropped: `columns` is the whole row. Operations that took a side now take a direction in that row.
 *
 * A column may carry `width` (rem; absent means DEFAULT_COLUMN_REM) and `shares` (stack heights summing to 1; absent
 * means even). Shares are dropped whenever the column's slots change, since they no longer describe it.
 */
import type { ModuleId } from './registry';
import {
  DEFAULT_COLUMN_REM,
  clampColumnWidth,
  clampShares,
  dragColumnWidths,
  dragSplitter,
  evenShares,
  isEvenShares,
  nudgeColumnWidths,
  nudgeSplitter,
} from './splitters';

export const LAYOUT_VERSION = 1;
/** Most slots one column can hold. */
export const MAX_STACK = 3;
/** The grid gap each column pays in the fit rule, rem. */
export const COLUMN_GAP_REM = 0.25;

export interface Column {
  /** One to MAX_STACK module ids, top first. */
  slots: ModuleId[];
  /** Width in rem; absent means DEFAULT_COLUMN_REM. */
  width?: number;
  /** Stack height shares, one per slot, summing to 1; absent means even. */
  shares?: number[];
}

export interface Layout {
  version: number;
  columns: Column[];
}

export const DEFAULT_LAYOUT: Layout = { version: LAYOUT_VERSION, columns: [] };

export const columnWidth = (c: Column): number =>
  c.width === undefined ? DEFAULT_COLUMN_REM : clampColumnWidth(c.width);

export const moduleIds = (l: Layout): ModuleId[] => l.columns.flatMap((c) => c.slots);

/** Where a module is: its column index, its slot index in the stack (0 is the top) and the stack size. */
export function locate(
  l: Layout,
  id: ModuleId
): { column: number; index: number; count: number } | null {
  for (let column = 0; column < l.columns.length; column++) {
    const index = l.columns[column].slots.indexOf(id);
    if (index >= 0) {
      return { column, index, count: l.columns[column].slots.length };
    }
  }
  return null;
}

/** A column with new slots; its shares are dropped, its width kept. */
const withSlots = (c: Column, slots: ModuleId[]): Column => {
  const { shares: _s, ...rest } = c;
  void _s;
  return { ...rest, slots };
};

const withColumns = (l: Layout, columns: Column[]): Layout => ({ ...l, columns });

/** Add a module as its own column, at the end or at `index` (clamped). A module already in the layout is a no-op. */
export function addModule(l: Layout, id: ModuleId, index?: number): Layout {
  if (locate(l, id)) {
    return l;
  }
  const at =
    index === undefined || !Number.isFinite(index)
      ? l.columns.length
      : Math.min(l.columns.length, Math.max(0, Math.trunc(index)));
  const cols = [...l.columns];
  cols.splice(at, 0, { slots: [id] });
  return withColumns(l, cols);
}

/** Remove a module; the rest of its stack stays together in the column. */
export function removeModule(l: Layout, id: ModuleId): Layout {
  const at = locate(l, id);
  if (!at) {
    return l;
  }
  const col = l.columns[at.column];
  const cols = [...l.columns];
  if (col.slots.length === 1) {
    cols.splice(at.column, 1);
  } else {
    cols[at.column] = withSlots(
      col,
      col.slots.filter((x) => x !== id)
    );
  }
  return withColumns(l, cols);
}

/** Move the whole column holding `id` one place left or right (swapping with its neighbour). No-op at the edges. */
export function moveColumn(l: Layout, id: ModuleId, dir: 'left' | 'right'): Layout {
  const at = locate(l, id);
  if (!at) {
    return l;
  }
  const to = at.column + (dir === 'right' ? 1 : -1);
  if (to < 0 || to >= l.columns.length) {
    return l;
  }
  const cols = [...l.columns];
  [cols[at.column], cols[to]] = [cols[to], cols[at.column]];
  return withColumns(l, cols);
}

export const canMoveColumn = (l: Layout, id: ModuleId, dir: 'left' | 'right'): boolean =>
  moveColumn(l, id, dir) !== l;

/**
 * Put `id` at the bottom of the column holding `targetId`, if that column has room (fewer than MAX_STACK). The module
 * leaves its old column (the rest stay together; a single module's old column disappears). A no-op when either module is
 * absent, they are the same or already share a column, or the target column is full.
 */
export function stackOnto(l: Layout, id: ModuleId, targetId: ModuleId): Layout {
  const from = locate(l, id);
  const to = locate(l, targetId);
  if (!from || !to || id === targetId || from.column === to.column) {
    return l;
  }
  if (l.columns[to.column].slots.length >= MAX_STACK) {
    return l;
  }
  const cols = l.columns.map((c, i) => {
    if (i === to.column) {
      return withSlots(c, [...c.slots, id]);
    }
    if (i === from.column) {
      return withSlots(
        c,
        c.slots.filter((x) => x !== id)
      );
    }
    return c;
  });
  return withColumns(
    l,
    cols.filter((c) => c.slots.length > 0)
  );
}

export const canStackOnto = (l: Layout, id: ModuleId, targetId: ModuleId): boolean =>
  stackOnto(l, id, targetId) !== l;

/** The modules `id` could stack onto: every other module whose column has room, with its column index and size. */
export function stackTargets(
  l: Layout,
  id: ModuleId
): { id: ModuleId; column: number; count: number }[] {
  const out: { id: ModuleId; column: number; count: number }[] = [];
  l.columns.forEach((c, column) => {
    if (c.slots.length < MAX_STACK && !c.slots.includes(id)) {
      c.slots.forEach((t) => out.push({ id: t, column, count: c.slots.length }));
    }
  });
  return out;
}

/** Take a module out of a stack into its own column immediately right of the column it leaves. No-op if not stacked. */
export function unstack(l: Layout, id: ModuleId): Layout {
  const at = locate(l, id);
  if (!at || at.count < 2) {
    return l;
  }
  const col = l.columns[at.column];
  const cols = [...l.columns];
  cols.splice(
    at.column,
    1,
    withSlots(
      col,
      col.slots.filter((x) => x !== id)
    ),
    { slots: [id] }
  );
  return withColumns(l, cols);
}

/** Move a module one slot up or down inside its stack; its share moves with it. No-op for a single or at the end. */
export function moveInStack(l: Layout, id: ModuleId, dir: 'up' | 'down'): Layout {
  const at = locate(l, id);
  if (!at) {
    return l;
  }
  const col = l.columns[at.column];
  const to = at.index + (dir === 'down' ? 1 : -1);
  if (col.slots.length < 2 || to < 0 || to >= col.slots.length) {
    return l;
  }
  const slots = [...col.slots];
  [slots[at.index], slots[to]] = [slots[to], slots[at.index]];
  const next: Column = { ...col, slots };
  if (col.shares) {
    const shares = [...col.shares];
    [shares[at.index], shares[to]] = [shares[to], shares[at.index]];
    next.shares = shares;
  }
  const cols = [...l.columns];
  cols[at.column] = next;
  return withColumns(l, cols);
}

/* ------------------------------------------------------------------------------------------------ column widths */
/** Set a column's width in rem (clamped to the limits). Column index; out of range is a no-op. */
export function setColumnWidth(l: Layout, column: number, rem: number): Layout {
  const col = l.columns[column];
  if (!col || !Number.isFinite(rem)) {
    return l;
  }
  const width = clampColumnWidth(rem);
  if (col.width === width) {
    return l;
  }
  const cols = [...l.columns];
  cols[column] = { ...col, width };
  return withColumns(l, cols);
}

function setPairWidths(l: Layout, index: number, pair: [number, number]): Layout {
  const a = l.columns[index];
  const b = l.columns[index + 1];
  if (columnWidth(a) === pair[0] && columnWidth(b) === pair[1]) {
    return l;
  }
  const cols = [...l.columns];
  cols[index] = { ...a, width: pair[0] };
  cols[index + 1] = { ...b, width: pair[1] };
  return withColumns(l, cols);
}

/**
 * Drag the splitter between column `index` and `index + 1` so the left column is `leftRem` wide. The right column takes
 * what the left gives up: their total width is constant and both stay within the column limits.
 */
export function dragColumnSplitter(l: Layout, index: number, leftRem: number): Layout {
  if (!l.columns[index] || !l.columns[index + 1]) {
    return l;
  }
  return setPairWidths(
    l,
    index,
    dragColumnWidths(columnWidth(l.columns[index]), columnWidth(l.columns[index + 1]), leftRem)
  );
}

/** Keyboard on a column splitter: Left/Right move it 1 rem, Home/End jump to its limits. */
export function nudgeColumnSplitter(
  l: Layout,
  index: number,
  key: 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End'
): Layout {
  if (!l.columns[index] || !l.columns[index + 1]) {
    return l;
  }
  return setPairWidths(
    l,
    index,
    nudgeColumnWidths(columnWidth(l.columns[index]), columnWidth(l.columns[index + 1]), key)
  );
}

/* ------------------------------------------------------------------------------------------------ stack shares */
/** The shares of a column (even when none are stored). */
export function columnShares(l: Layout, column: number): number[] {
  const col = l.columns[column];
  if (!col) {
    return [];
  }
  return col.shares && col.shares.length === col.slots.length
    ? col.shares
    : evenShares(col.slots.length);
}

/** Store shares for a stacked column; even shares remove them. No-op for a single or for shares that do not fit. */
export function setColumnShares(l: Layout, column: number, shares: readonly number[]): Layout {
  const col = l.columns[column];
  if (!col || col.slots.length < 2 || shares.length !== col.slots.length) {
    return l;
  }
  if (!shares.every(Number.isFinite) || shares.some((v) => v < 0 || v > 1)) {
    return l;
  }
  const value = shares.map((v) => Math.round(v * 10000) / 10000);
  if (Math.abs(value.reduce((a, b) => a + b, 0) - 1) > 0.01) {
    return l;
  }
  if (columnShares(l, column).every((v, i) => v === value[i])) {
    return l;
  }
  const cols = [...l.columns];
  if (isEvenShares(value)) {
    const { shares: _s, ...rest } = col;
    void _s;
    cols[column] = rest;
  } else {
    cols[column] = { ...col, shares: value };
  }
  return withColumns(l, cols);
}

/** Drag a stack splitter (between slot `index` and `index + 1` of a column) to `boundary`, a fraction of its height. */
export function dragStackSplitter(
  l: Layout,
  column: number,
  index: number,
  boundary: number,
  heightRem: number
): Layout {
  if (!l.columns[column]) {
    return l;
  }
  return setColumnShares(
    l,
    column,
    dragSplitter(columnShares(l, column), index, boundary, heightRem)
  );
}

/** Keyboard on a stack splitter: Up/Down move it 5%, Home/End jump to its limits. */
export function nudgeStackSplitter(
  l: Layout,
  column: number,
  index: number,
  key: 'ArrowUp' | 'ArrowDown' | 'Home' | 'End',
  heightRem: number
): Layout {
  if (!l.columns[column]) {
    return l;
  }
  return setColumnShares(l, column, nudgeSplitter(columnShares(l, column), index, key, heightRem));
}

/** Repair a column's stored shares for a column `heightRem` tall (see clampShares); unchanged when already fine. */
export function clampColumnShares(l: Layout, column: number, heightRem: number): Layout {
  return setColumnShares(l, column, clampShares(columnShares(l, column), heightRem));
}

/* ---------------------------------------------------------------------------------------------- width to columns */
/**
 * Which whole columns fit a window `widthRem` wide. Each column costs its width plus COLUMN_GAP_REM. Columns are taken
 * left to right and the first one that does not fit ends the list (order is never changed and no column is skipped to
 * fit a later one); the rest stay in the layout and are reported hidden. A stack is one column, so it is never split.
 * Returns how many leading columns are visible (0 when not even the first fits or the width is not a number).
 */
export function fitColumns(widthRem: number, l: Layout): number {
  if (!Number.isFinite(widthRem)) {
    return 0;
  }
  let used = 0;
  let count = 0;
  for (const c of l.columns) {
    used += columnWidth(c) + COLUMN_GAP_REM;
    if (used > widthRem + 1e-9) {
      break;
    }
    count++;
  }
  return count;
}

/** The columns that fit `widthRem` and the ones that do not (hidden but still in the layout), both in layout order. */
export function visibleColumns(
  l: Layout,
  widthRem: number
): { visible: Column[]; hidden: Column[] } {
  const n = fitColumns(widthRem, l);
  return { visible: l.columns.slice(0, n), hidden: l.columns.slice(n) };
}
