/**
 * Pinned panel columns: the arrangement (which panels are pinned, on which side, in which order, and which share a
 * column), the pure rules that edit it, the width-to-columns rule, and its persistence. No React here.
 *
 * A column holds one panel, or two stacked (top, bottom). `left` runs outer to inner (index 0 is at the screen edge,
 * the last column is next to the generator); `right` runs inner to outer (index 0 is next to the generator).
 */
export type PanelId = 'chords' | 'spectrum' | 'keys' | 'lattice' | 'retuner';
export const PANEL_IDS: readonly PanelId[] = ['chords', 'spectrum', 'keys', 'lattice', 'retuner'];

/** One or two panels, top first. */
export type Column = PanelId[];

export interface Layout {
  left: Column[];
  right: Column[];
  /** Optional top-panel share (0..1) of a stacked column, keyed by the column's top panel. Absent means 0.5. */
  splits?: Partial<Record<PanelId, number>>;
}
export const DEFAULT_LAYOUT: Layout = {
  left: [['keys'], ['chords']],
  right: [['lattice'], ['spectrum']],
};
export const LAYOUT_KEY = 'hrifa.harmonic-field-lab.mock.layout.v2';
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

/**
 * The pins that get a column when `count` columns fit: whole columns (a stack shows both panels or neither), nearest
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

/** Where is this panel: its side, its column, and the other panel of the column if stacked. */
export function locate(
  l: Layout,
  id: PanelId
): { side: 'left' | 'right'; other: PanelId | null } | null {
  const s = find(l, id);
  if (!s) {
    return null;
  }
  const col = l[s.side][s.ci];
  return { side: s.side, other: col.length === 2 ? col[1 - s.pi] : null };
}

/** Forget the stored split of the column(s) these panels were in (it no longer describes them). */
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

/** Pin a panel as its own column on the outer end of the side with fewer columns (right on a tie). */
export function pin(l: Layout, id: PanelId): Layout {
  if (find(l, id)) {
    return l;
  }
  return l.right.length <= l.left.length
    ? { ...l, right: [...l.right, [id]] }
    : { ...l, left: [[id], ...l.left] };
}

/** Remove a pin; the other panel of a stack stays alone in its column. */
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

/** Place one panel of a stack in its own column, left or right (on screen) of the one that stays. */
function splitOut(l: Layout, id: PanelId, dir: 'left' | 'right'): Layout {
  const s = find(l, id);
  if (!s || l[s.side][s.ci].length !== 2) {
    return l;
  }
  const other = l[s.side][s.ci][1 - s.pi];
  const pair: Column[] = dir === 'left' ? [[id], [other]] : [[other], [id]];
  const cols = [...l[s.side]];
  cols.splice(s.ci, 1, ...pair);
  return dropSplits(withSide(l, s.side, cols), id, other);
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

/** Swap the two panels of a stack (top and bottom). No-op for a single panel. */
export function swapInStack(l: Layout, id: PanelId): Layout {
  const s = find(l, id);
  if (!s || l[s.side][s.ci].length !== 2) {
    return l;
  }
  const cols = [...l[s.side]];
  const [top, bottom] = cols[s.ci];
  cols[s.ci] = [bottom, top];
  const next = withSide(l, s.side, cols);
  const share = l.splits?.[top];
  if (share === undefined) {
    return next;
  }
  // the share belongs to the top panel: after the swap the old top has the other part
  const flipped = dropSplits(next, top);
  return { ...flipped, splits: { ...flipped.splits, [bottom]: 1 - share } };
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
  if (l[s.side][s.ci].length === 2) {
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

/* --------------------------------------------------------------------------------------------------- splitter */
export const SPLIT_DEFAULT = 0.5;
export const SPLIT_STEP = 0.05;
/** Each half keeps at least this share of the column height ... */
export const SPLIT_MIN_SHARE = 0.2;
/** ... or this many rem, whichever is larger. */
export const SPLIT_MIN_REM = 6;

const round4 = (x: number) => Math.round(x * 10000) / 10000;

/** The smallest and largest top share for a column `heightRem` tall (a column too short for two minimums is fixed at 50/50). */
export function splitLimits(heightRem: number): { min: number; max: number } {
  const m = Math.max(SPLIT_MIN_SHARE, SPLIT_MIN_REM / (heightRem > 0 ? heightRem : Infinity));
  return m >= 0.5 ? { min: 0.5, max: 0.5 } : { min: m, max: 1 - m };
}

export function clampSplit(v: number, heightRem: number): number {
  const { min, max } = splitLimits(heightRem);
  return round4(Math.min(max, Math.max(min, Number.isFinite(v) ? v : SPLIT_DEFAULT)));
}

/** Keyboard on the splitter: Up and Down move it 5% (Up shrinks the top panel), Home and End jump to the limits. */
export function nudgeSplit(
  v: number,
  key: 'ArrowUp' | 'ArrowDown' | 'Home' | 'End',
  heightRem: number
): number {
  const { min, max } = splitLimits(heightRem);
  const next =
    key === 'ArrowUp'
      ? v - SPLIT_STEP
      : key === 'ArrowDown'
        ? v + SPLIT_STEP
        : key === 'Home'
          ? min
          : max;
  return clampSplit(next, heightRem);
}

/** The top panel's share of the stacked column it tops (0.5 when none is stored). */
export const splitOf = (l: Layout, topId: PanelId): number => l.splits?.[topId] ?? SPLIT_DEFAULT;

/** Store a split for the column topped by `topId`; 0.5 removes it. A no-op unless that panel tops a stack. */
export function setSplit(l: Layout, topId: PanelId, v: number): Layout {
  const isTop = [...l.left, ...l.right].some((c) => c.length === 2 && c[0] === topId);
  const value = round4(Math.min(1, Math.max(0, v)));
  if (!isTop || !Number.isFinite(v) || splitOf(l, topId) === value) {
    return l;
  }
  if (value === SPLIT_DEFAULT) {
    return dropSplits(l, topId);
  }
  return { ...l, splits: { ...l.splits, [topId]: value } };
}

/* ----------------------------------------------------------------------------------------------- persistence */
const isId = (x: unknown): x is PanelId =>
  typeof x === 'string' && (PANEL_IDS as readonly string[]).includes(x);

/** Validate a stored v2 layout: columns of one or two known panel ids, none repeated. Anything else is the defaults. */
export function parseLayout(raw: string | null | undefined): Layout {
  try {
    const v: unknown = JSON.parse(raw ?? 'null');
    if (!v || typeof v !== 'object') {
      return DEFAULT_LAYOUT;
    }
    const { left, right, splits } = v as { left?: unknown; right?: unknown; splits?: unknown };
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return DEFAULT_LAYOUT;
    }
    const cols = [...left, ...right];
    const okCols = cols.every(
      (c) => Array.isArray(c) && c.length >= 1 && c.length <= 2 && c.every(isId)
    );
    if (!okCols) {
      return DEFAULT_LAYOUT;
    }
    const all = (cols as PanelId[][]).flat();
    if (new Set(all).size !== all.length) {
      return DEFAULT_LAYOUT;
    }
    const layout: Layout = { left: left as Column[], right: right as Column[] };
    if (splits === undefined) {
      return layout;
    }
    // splits: an object of known panel ids to numbers in 0..1; any other value is bad data
    if (!splits || typeof splits !== 'object' || Array.isArray(splits)) {
      return DEFAULT_LAYOUT;
    }
    let out = layout;
    for (const [k, val] of Object.entries(splits)) {
      if (!isId(k) || typeof val !== 'number' || !(val >= 0 && val <= 1)) {
        return DEFAULT_LAYOUT;
      }
      out = setSplit(out, k, val); // a split for a panel that does not top a stack is dropped
    }
    return out;
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
    const all = [...left, ...right];
    if (!all.every(isId) || new Set(all).size !== all.length) {
      return DEFAULT_LAYOUT;
    }
    return {
      left: (left as PanelId[]).map((id) => [id]),
      right: (right as PanelId[]).map((id) => [id]),
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

/** v2 if stored; otherwise a v1 value migrated; otherwise the defaults. Never throws. */
export function loadLayout(): Layout {
  try {
    const v2 = window.localStorage.getItem(LAYOUT_KEY);
    if (v2 !== null) {
      return parseLayout(v2);
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
