/**
 * Pinned panel columns: the arrangement (which panels are pinned, on which side, in which order, and which share a
 * column), the pure rules that edit it, the width-to-columns rule, and its persistence. No React here.
 *
 * A column holds one to three panels, top to bottom (a stack). `left` runs outer to inner (index 0 is at the screen edge,
 * the last column is next to the generator); `right` runs inner to outer (index 0 is next to the generator).
 */
export type VizId = 'viz1' | 'viz2' | 'viz3';
export type PanelId = 'chords' | 'spectrum' | 'keys' | 'retuner' | VizId;
export const VIZ_IDS: readonly VizId[] = ['viz1', 'viz2', 'viz3'];
export const PANEL_IDS: readonly PanelId[] = ['chords', 'spectrum', 'keys', 'retuner', ...VIZ_IDS];
export const isViz = (id: PanelId): id is VizId => (VIZ_IDS as readonly string[]).includes(id);

/** What a visualizer panel shows. */
export type VizView = 'lattice' | 'edo' | 'dissonance' | 'iso';
export const VIZ_VIEWS: readonly VizView[] = ['lattice', 'edo', 'dissonance', 'iso'];
export const VIZ_VIEW_LABEL: Record<VizView, string> = {
  lattice: 'Lattice',
  edo: 'EDO fit',
  dissonance: 'Dissonance curve',
  iso: 'Isomorphic keyboard',
};
/** A visualizer's name: its number and its current view, e.g. "Visualizer 2 \u2013 EDO fit". */
export const vizName = (id: VizId, view: VizView): string =>
  `Visualizer ${VIZ_IDS.indexOf(id) + 1} \u2013 ${VIZ_VIEW_LABEL[view]}`;
export const DEFAULT_VIEWS: Record<VizId, VizView> = {
  viz1: 'lattice',
  viz2: 'edo',
  viz3: 'dissonance',
};

/** One or two panels, top first. */
export type Column = PanelId[];

export interface Layout {
  left: Column[];
  right: Column[];
  /**
   * Optional shares of a stacked column's height, one per panel top to bottom, summing to 1, keyed by the column's TOP
   * panel (dropped whenever the column's panels change). Absent means even shares.
   */
  splits?: Partial<Record<PanelId, number[]>>;
  /** Optional view of each visualizer panel; a missing entry means that panel's default (DEFAULT_VIEWS). */
  views?: Partial<Record<VizId, VizView>>;
}
export const DEFAULT_LAYOUT: Layout = {
  left: [['keys'], ['chords']],
  right: [['viz1'], ['spectrum']],
};
/** The view a visualizer panel shows now. */
export const viewOf = (l: Layout, id: VizId): VizView => l.views?.[id] ?? DEFAULT_VIEWS[id];

/** Set one visualizer's view; the default view is stored as no entry. */
export function setView(l: Layout, id: VizId, view: VizView): Layout {
  if (viewOf(l, id) === view) {
    return l;
  }
  const views = { ...l.views, [id]: view };
  if (view === DEFAULT_VIEWS[id]) {
    delete views[id];
  }
  const { views: _old, ...rest } = l;
  void _old;
  return Object.keys(views).length ? { ...rest, views } : rest;
}
export const LAYOUT_KEY = 'hrifa.harmonic-field-lab.mock.layout.v3';
export const LAYOUT_KEY_V2 = 'hrifa.harmonic-field-lab.mock.layout.v2';
export const LAYOUT_KEY_V1 = 'hrifa.harmonic-field-lab.mock.layout.v1';

/* ------------------------------------------------------------------------------------------ width to columns */
/** Rem the fixed parts take: rail 9.5, switcher column 24, workspace minimum 64, grid padding and gaps 1. */
export const FIXED_REM = 9.5 + 24 + 64 + 1;
/** One pinned column: 24 rem plus the 0.25 rem grid gap. A stacked column is still one column. */
export const COLUMN_REM = 24.25;

/** How many pinned columns fit in a window `widthRem` wide (1700 px is about 106 rem: none; 2560 px: 2; 3840 px: 5). */
export function fitColumns(widthRem: number): number {
  if (!(widthRem > FIXED_REM)) {
    return 0;
  }
  return Math.max(0, Math.floor((widthRem - FIXED_REM) / COLUMN_REM));
}

/* ----------------------------------------------------------------------------------------------- arrangement */
export const pinnedIds = (l: Layout): PanelId[] => [...l.left, ...l.right].flat();

/** Most panels one column can hold. */
export const MAX_STACK = 3;

/**
 * The pins that get a column when `count` columns fit: whole columns (a stack shows all its panels or none), nearest
 * the generator first, alternating left and right, so a narrow screen keeps the inner pair. The rest stay pinned but
 * are reachable only through the switcher.
 */
export function visiblePins(l: Layout, count: number): Set<PanelId> {
  const out = new Set<PanelId>();
  let used = 0;
  for (let k = 0; used < count && (k < l.left.length || k < l.right.length); k++) {
    for (const col of [l.left[l.left.length - 1 - k], l.right[k]]) {
      if (col && used < count) {
        col.forEach((id) => out.add(id));
        used++;
      }
    }
  }
  return out;
}

interface Spot {
  side: 'left' | 'right';
  ci: number;
  pi: number;
}
function find(l: Layout, id: PanelId): Spot | null {
  for (const side of ['left', 'right'] as const) {
    for (let ci = 0; ci < l[side].length; ci++) {
      const pi = l[side][ci].indexOf(id);
      if (pi >= 0) {
        return { side, ci, pi };
      }
    }
  }
  return null;
}

/** Where is this panel: its side, its slot in its column (0 is the top) and how many panels the column holds. */
export function locate(
  l: Layout,
  id: PanelId
): { side: 'left' | 'right'; index: number; count: number } | null {
  const s = find(l, id);
  return s ? { side: s.side, index: s.pi, count: l[s.side][s.ci].length } : null;
}

/** Forget the stored shares of the column(s) these panels were in (they no longer describe them). */
function dropSplits(l: Layout, ...ids: PanelId[]): Layout {
  if (!l.splits || !ids.some((id) => id in l.splits!)) {
    return l;
  }
  const splits = { ...l.splits };
  ids.forEach((id) => delete splits[id]);
  const { splits: _old, ...rest } = l;
  void _old;
  return Object.keys(splits).length ? { ...rest, splits } : rest;
}

const withSide = (l: Layout, side: 'left' | 'right', cols: Column[]): Layout =>
  side === 'left' ? { ...l, left: cols } : { ...l, right: cols };

/**
 * Pin a panel as its own column. With a `side` it goes on the inner end of that side, next to the generator (where people
 * look first); without one, on the outer end of the side with fewer columns (right on a tie).
 */
export function pin(l: Layout, id: PanelId, side?: 'left' | 'right'): Layout {
  if (find(l, id)) {
    return l;
  }
  if (side === 'left') {
    return { ...l, left: [...l.left, [id]] };
  }
  if (side === 'right') {
    return { ...l, right: [[id], ...l.right] };
  }
  return l.right.length <= l.left.length
    ? { ...l, right: [...l.right, [id]] }
    : { ...l, left: [[id], ...l.left] };
}

/** Remove a pin; the other panels of a stack stay together in their column. */
export function unpin(l: Layout, id: PanelId): Layout {
  const s = find(l, id);
  if (!s) {
    return l;
  }
  const cols = l[s.side].map((c) => c.filter((x) => x !== id)).filter((c) => c.length > 0);
  return dropSplits(withSide(l, s.side, cols), ...l[s.side][s.ci]);
}

/**
 * Stack a single panel onto the column next to it toward the generator. Allowed only when this panel is alone in its
 * column and that column holds one panel; otherwise a no-op. The panel nearer the screen edge goes on top.
 */
export function stack(l: Layout, id: PanelId): Layout {
  const s = find(l, id);
  if (!s || l[s.side][s.ci].length !== 1) {
    return l;
  }
  const ni = s.side === 'left' ? s.ci + 1 : s.ci - 1;
  const neighbour = l[s.side][ni];
  if (!neighbour || neighbour.length !== 1) {
    return l;
  }
  const merged: Column = s.side === 'left' ? [id, neighbour[0]] : [neighbour[0], id];
  const cols = l[s.side].filter((_, i) => i !== s.ci);
  cols[s.side === 'left' ? ni - 1 : ni] = merged;
  return dropSplits(withSide(l, s.side, cols), ...merged);
}

export const canStack = (l: Layout, id: PanelId): boolean => stack(l, id) !== l;

/**
 * Move a pinned panel into the column of another pinned panel, if that column has room (fewer than MAX_STACK panels):
 * the moved panel goes at the bottom. Works across the generator and at any distance. A panel that was in a stack leaves
 * it (the rest stay together); a single panel's old column disappears. A no-op when either panel is not pinned, they
 * are the same or already share a column, or the target's column is full.
 */
export function stackWith(l: Layout, id: PanelId, targetId: PanelId): Layout {
  const from = find(l, id);
  const to = find(l, targetId);
  if (!from || !to || id === targetId) {
    return l;
  }
  const target = l[to.side][to.ci];
  if (target.includes(id) || target.length >= MAX_STACK) {
    return l;
  }
  const oldColumn = l[from.side][from.ci];
  const strip = (cols: Column[]): Column[] =>
    cols.map((c) => c.filter((x) => x !== id)).filter((c) => c.length > 0);
  const next: Layout = { ...l, left: strip(l.left), right: strip(l.right) };
  const at = find(next, targetId)!;
  const cols = [...next[at.side]];
  cols[at.ci] = [...cols[at.ci], id];
  return dropSplits(withSide(next, at.side, cols), ...oldColumn, ...target, id);
}

export const canStackWith = (l: Layout, id: PanelId, targetId: PanelId): boolean =>
  stackWith(l, id, targetId) !== l;

/**
 * The panels `id` could stack with: every other panel whose column has room, with its side and how many panels the
 * column holds now (the moved panel would make it one more).
 */
export function stackTargets(
  l: Layout,
  id: PanelId
): { id: PanelId; side: 'left' | 'right'; count: number }[] {
  const out: { id: PanelId; side: 'left' | 'right'; count: number }[] = [];
  for (const side of ['left', 'right'] as const) {
    for (const c of l[side]) {
      if (c.length < MAX_STACK && !c.includes(id)) {
        c.forEach((t) => out.push({ id: t, side, count: c.length }));
      }
    }
  }
  return out;
}

/** Take one panel out of a stack into its own column, left or right (on screen) of the column that stays. */
function splitOut(l: Layout, id: PanelId, dir: 'left' | 'right'): Layout {
  const s = find(l, id);
  if (!s || l[s.side][s.ci].length < 2) {
    return l;
  }
  const column = l[s.side][s.ci];
  const rest = column.filter((x) => x !== id);
  const pair: Column[] = dir === 'left' ? [[id], rest] : [rest, [id]];
  const cols = [...l[s.side]];
  cols.splice(s.ci, 1, ...pair);
  return dropSplits(withSide(l, s.side, cols), ...column);
}

/**
 * Split a stacked panel into its own column next to its former column, on the outer side (nearer the screen edge).
 * No-op for a panel that is not stacked.
 */
export function unstack(l: Layout, id: PanelId): Layout {
  const s = find(l, id);
  if (!s) {
    return l;
  }
  return splitOut(l, id, s.side === 'left' ? 'left' : 'right');
}

/**
 * Move a panel one slot up or down inside its stack (in a stack of two, that swaps the pair). Each panel keeps its own
 * share of the column height. A no-op for a single panel or at the top or bottom slot.
 */
export function moveInStack(l: Layout, id: PanelId, dir: 'up' | 'down'): Layout {
  const s = find(l, id);
  if (!s) {
    return l;
  }
  const col = l[s.side][s.ci];
  const to = s.pi + (dir === 'down' ? 1 : -1);
  if (col.length < 2 || to < 0 || to >= col.length) {
    return l;
  }
  const next = [...col];
  [next[s.pi], next[to]] = [next[to], next[s.pi]];
  const cols = [...l[s.side]];
  cols[s.ci] = next;
  const out = withSide(l, s.side, cols);
  const shares = l.splits?.[col[0]];
  if (!shares) {
    return out;
  }
  const moved = [...shares];
  [moved[s.pi], moved[to]] = [moved[to], moved[s.pi]];
  const cleared = dropSplits(out, col[0]);
  return { ...cleared, splits: { ...cleared.splits, [next[0]]: moved } };
}

/** Swap the two panels of a two-panel stack (top and bottom). No-op otherwise. */
export function swapInStack(l: Layout, id: PanelId): Layout {
  const s = find(l, id);
  if (!s || l[s.side][s.ci].length !== 2) {
    return l;
  }
  return moveInStack(l, id, s.pi === 0 ? 'down' : 'up');
}

/**
 * Move a pinned panel one place left or right on screen, as its own column. A panel in a stack first leaves the stack:
 * it becomes its own column on the side it was moved toward. A single column swaps with its neighbour; moving inward
 * past the innermost column crosses to the innermost place on the other side; moving outward past the screen edge does
 * nothing.
 */
export function move(l: Layout, id: PanelId, dir: 'left' | 'right'): Layout {
  const s = find(l, id);
  if (!s) {
    return l;
  }
  if (l[s.side][s.ci].length >= 2) {
    return splitOut(l, id, dir);
  }
  const cols = [...l[s.side]];
  // array order is screen order on both sides, so right is the next index and left the previous one
  const delta = dir === 'right' ? 1 : -1;
  const ni = s.ci + delta;
  if (ni >= 0 && ni < cols.length) {
    [cols[ni], cols[s.ci]] = [cols[s.ci], cols[ni]];
    return withSide(l, s.side, cols);
  }
  if (ni < 0 && s.side === 'right') {
    // inward past the generator: join the left side's inner end
    return { ...l, left: [...l.left, [id]], right: cols.slice(1) };
  }
  if (ni >= cols.length && s.side === 'left') {
    return { ...l, left: cols.slice(0, -1), right: [[id], ...l.right] };
  }
  return l;
}

/** True when moving `dir` does something (the outer edge buttons are disabled). */
export function canMove(l: Layout, id: PanelId, dir: 'left' | 'right'): boolean {
  return move(l, id, dir) !== l;
}

/* --------------------------------------------------------------------------------------------------- splitters */
/**
 * A stacked column's shares: one per panel, top to bottom, summing to 1, stored keyed by the column's TOP panel (the
 * key is dropped when the column's panels change, since the shares no longer describe it). A column with no stored
 * shares is shared evenly.
 */
export const SPLIT_STEP = 0.05;
/** Each panel keeps at least this share of the column height ... */
export const SPLIT_MIN_SHARE = 0.2;
/** ... or this many rem, whichever is larger. */
export const SPLIT_MIN_REM = 6;

const round4 = (x: number) => Math.round(x * 10000) / 10000;

/** Even shares for `n` panels. */
export const evenShares = (n: number): number[] => Array.from({ length: n }, () => round4(1 / n));
const isEven = (s: readonly number[]) => s.every((v) => Math.abs(v - 1 / s.length) < 1e-3);

/** The smallest share one panel may have in a column `heightRem` tall holding `n` panels (even shares when too short). */
export function minShare(heightRem: number, n: number): number {
  const m = Math.max(SPLIT_MIN_SHARE, SPLIT_MIN_REM / (heightRem > 0 ? heightRem : Infinity));
  return m * n >= 1 ? 1 / n : m;
}

/**
 * Repair shares so each is at least the minimum and they sum to 1: panels below the minimum are lifted to it, and what
 * that costs is taken from the others in proportion to their room above the minimum. A column too short for the
 * minimums is shared evenly; non-numbers are repaired to even.
 */
export function clampShares(shares: readonly number[], heightRem: number): number[] {
  const n = shares.length;
  const m = minShare(heightRem, n);
  if (n < 2 || !shares.every(Number.isFinite) || m * n >= 1 - 1e-9) {
    return evenShares(n);
  }
  const total = shares.reduce((a, b) => a + b, 0) || 1;
  let s = shares.map((v) => Math.max(0, v) / total);
  for (let pass = 0; pass < n; pass++) {
    const low = s.map((v) => v < m);
    if (!low.some(Boolean)) {
      break;
    }
    const room = s.reduce((a, v, i) => a + (low[i] ? 0 : v - m), 0);
    const need = s.reduce((a, v, i) => a + (low[i] ? m - v : 0), 0);
    s = s.map((v, i) => (low[i] ? m : v - (room > 0 ? ((v - m) / room) * need : 0)));
  }
  const out = s.map(round4);
  out[out.length - 1] = round4(1 - out.slice(0, -1).reduce((a, b) => a + b, 0));
  return out;
}

/** The boundary positions a splitter may take: between its two neighbours, each keeping its minimum. */
export function splitterRange(
  shares: readonly number[],
  index: number,
  heightRem: number
): { min: number; max: number } {
  const m = minShare(heightRem, shares.length);
  const before = shares.slice(0, index).reduce((a, b) => a + b, 0);
  const after = before + shares[index] + shares[index + 1];
  return { min: round4(before + m), max: round4(after - m) };
}

/** Where splitter `index` (between panel `index` and `index + 1`) currently sits: the share above it. */
export const splitterAt = (shares: readonly number[], index: number): number =>
  round4(shares.slice(0, index + 1).reduce((a, b) => a + b, 0));

/**
 * Drag splitter `index` to `boundary` (a fraction of the column height from the top). Only the two panels beside it
 * trade space; the others keep their shares; neither goes below the minimum.
 */
export function dragSplitter(
  shares: readonly number[],
  index: number,
  boundary: number,
  heightRem: number
): number[] {
  const base = clampShares(shares, heightRem);
  if (index < 0 || index >= base.length - 1) {
    return base;
  }
  const { min, max } = splitterRange(base, index, heightRem);
  const b = Math.min(
    max,
    Math.max(min, Number.isFinite(boundary) ? boundary : splitterAt(base, index))
  );
  const before = base.slice(0, index).reduce((a, v) => a + v, 0);
  const next = [...base];
  next[index] = round4(b - before);
  next[index + 1] = round4(base[index] + base[index + 1] - next[index]);
  return next;
}

/** Keyboard on one splitter: Up and Down move it 5% (Up shrinks the panel above it), Home and End jump to its limits. */
export function nudgeSplitter(
  shares: readonly number[],
  index: number,
  key: 'ArrowUp' | 'ArrowDown' | 'Home' | 'End',
  heightRem: number
): number[] {
  const base = clampShares(shares, heightRem);
  const { min, max } = splitterRange(base, index, heightRem);
  const at = splitterAt(base, index);
  const to =
    key === 'ArrowUp'
      ? at - SPLIT_STEP
      : key === 'ArrowDown'
        ? at + SPLIT_STEP
        : key === 'Home'
          ? min
          : max;
  return dragSplitter(base, index, to, heightRem);
}

const topOf = (l: Layout, topId: PanelId): Column | undefined =>
  [...l.left, ...l.right].find((c) => c.length >= 2 && c[0] === topId);

/** The shares of the stacked column topped by `topId` (even when none are stored or it tops no stack). */
export function splitOf(l: Layout, topId: PanelId): number[] {
  const col = topOf(l, topId);
  const stored = l.splits?.[topId];
  return col && stored && stored.length === col.length ? stored : evenShares(col?.length ?? 2);
}

/** Store shares for the column topped by `topId`; even shares remove them. A no-op unless that panel tops a stack. */
export function setSplit(l: Layout, topId: PanelId, shares: readonly number[]): Layout {
  const col = topOf(l, topId);
  if (!col || shares.length !== col.length || !shares.every(Number.isFinite)) {
    return l;
  }
  const value = shares.map(round4);
  if (value.some((v) => v < 0 || v > 1) || Math.abs(value.reduce((a, b) => a + b, 0) - 1) > 0.01) {
    return l;
  }
  const same = splitOf(l, topId).every((v, i) => v === value[i]);
  if (same) {
    return l;
  }
  if (isEven(value)) {
    return dropSplits(l, topId);
  }
  return { ...l, splits: { ...l.splits, [topId]: value } };
}

/* ----------------------------------------------------------------------------------------------- persistence */
const isId = (x: unknown): x is PanelId =>
  typeof x === 'string' && (PANEL_IDS as readonly string[]).includes(x);
const isView = (x: unknown): x is VizView =>
  typeof x === 'string' && (VIZ_VIEWS as readonly string[]).includes(x);
const isVizId = (x: unknown): x is VizId =>
  typeof x === 'string' && (VIZ_IDS as readonly string[]).includes(x);

/** Validate a stored layout value: columns of one or two known panel ids (none repeated), splits and views. */
function validate(v: unknown): Layout {
  if (!v || typeof v !== 'object') {
    return DEFAULT_LAYOUT;
  }
  const { left, right, splits, views } = v as {
    left?: unknown;
    right?: unknown;
    splits?: unknown;
    views?: unknown;
  };
  if (!Array.isArray(left) || !Array.isArray(right)) {
    return DEFAULT_LAYOUT;
  }
  const cols = [...left, ...right];
  const okCols = cols.every(
    (c) => Array.isArray(c) && c.length >= 1 && c.length <= MAX_STACK && c.every(isId)
  );
  if (!okCols) {
    return DEFAULT_LAYOUT;
  }
  const all = (cols as PanelId[][]).flat();
  if (new Set(all).size !== all.length) {
    return DEFAULT_LAYOUT;
  }
  let out: Layout = { left: left as Column[], right: right as Column[] };
  if (views !== undefined) {
    // views: an object of visualizer ids to known views; any other value is bad data
    if (!views || typeof views !== 'object' || Array.isArray(views)) {
      return DEFAULT_LAYOUT;
    }
    for (const [k, val] of Object.entries(views)) {
      if (!isVizId(k) || !isView(val)) {
        return DEFAULT_LAYOUT;
      }
      out = setView(out, k, val);
    }
  }
  if (splits === undefined) {
    return out;
  }
  // splits: an object of known panel ids to share arrays (numbers in 0..1 summing to about 1). An older single number is
  // the top share of a two-panel stack: [v, 1 - v]. Any other value is bad data.
  if (!splits || typeof splits !== 'object' || Array.isArray(splits)) {
    return DEFAULT_LAYOUT;
  }
  for (const [k, val] of Object.entries(splits)) {
    const shares: unknown = typeof val === 'number' ? [val, 1 - val] : val;
    if (
      !isId(k) ||
      !Array.isArray(shares) ||
      shares.length < 2 ||
      shares.length > MAX_STACK ||
      !shares.every((x) => typeof x === 'number' && x >= 0 && x <= 1) ||
      Math.abs((shares as number[]).reduce((a, b) => a + b, 0) - 1) > 0.02
    ) {
      return DEFAULT_LAYOUT;
    }
    // shares for a panel that does not top a stack of that size are dropped
    out = setSplit(out, k, shares as number[]);
  }
  return out;
}

/** Validate a stored v3 layout. Anything invalid is the defaults. Never throws. */
export function parseLayout(raw: string | null | undefined): Layout {
  try {
    return validate(JSON.parse(raw ?? 'null'));
  } catch {
    return DEFAULT_LAYOUT;
  }
}

/** v1 and v2 named the lattice panel `lattice`: it is now `viz1` (showing Lattice), and so is a split keyed by it. */
const renameLattice = (id: unknown): unknown => (id === 'lattice' ? 'viz1' : id);

/** Read a stored v2 layout: the same shape, with the one panel `lattice` now `viz1`. */
export function migrateV2(raw: string | null | undefined): Layout {
  try {
    const v: unknown = JSON.parse(raw ?? 'null');
    if (!v || typeof v !== 'object') {
      return DEFAULT_LAYOUT;
    }
    const { left, right, splits } = v as { left?: unknown; right?: unknown; splits?: unknown };
    const side = (s: unknown) =>
      Array.isArray(s) ? s.map((c) => (Array.isArray(c) ? c.map(renameLattice) : c)) : s;
    const moved =
      splits && typeof splits === 'object' && !Array.isArray(splits)
        ? Object.fromEntries(Object.entries(splits).map(([k, x]) => [renameLattice(k), x]))
        : splits;
    return validate({ left: side(left), right: side(right), splits: moved });
  } catch {
    return DEFAULT_LAYOUT;
  }
}

/** Read the old v1 shape (two flat arrays of panel ids): each pin becomes a one-panel column. */
export function migrateV1(raw: string | null | undefined): Layout {
  try {
    const v: unknown = JSON.parse(raw ?? 'null');
    if (!v || typeof v !== 'object') {
      return DEFAULT_LAYOUT;
    }
    const { left, right } = v as { left?: unknown; right?: unknown };
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return DEFAULT_LAYOUT;
    }
    const flat = (s: unknown[]) => s.map((id) => [renameLattice(id)]);
    return validate({ left: flat(left), right: flat(right) });
  } catch {
    return DEFAULT_LAYOUT;
  }
}

/** v3 if stored; otherwise a v2 value, then a v1 value, migrated; otherwise the defaults. Never throws. */
export function loadLayout(): Layout {
  try {
    const v3 = window.localStorage.getItem(LAYOUT_KEY);
    if (v3 !== null) {
      return parseLayout(v3);
    }
    const v2 = window.localStorage.getItem(LAYOUT_KEY_V2);
    if (v2 !== null) {
      return migrateV2(v2);
    }
    const v1 = window.localStorage.getItem(LAYOUT_KEY_V1);
    return v1 !== null ? migrateV1(v1) : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function saveLayout(l: Layout): void {
  try {
    window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(l));
  } catch {
    // storage may be unavailable (private window, blocked): the arrangement just is not remembered
  }
}
