/**
 * Pinned panel columns: the arrangement (which panels are pinned, on which side, in which order), the pure rules that
 * edit it, the width-to-columns rule, and its persistence. No React here.
 *
 * `left` runs outer to inner (index 0 is at the screen edge, the last is next to the generator); `right` runs inner to
 * outer (index 0 is next to the generator).
 */
export type PanelId = 'chords' | 'spectrum' | 'keys' | 'lattice' | 'retuner';
export const PANEL_IDS: readonly PanelId[] = ['chords', 'spectrum', 'keys', 'lattice', 'retuner'];

export interface Layout {
  left: PanelId[];
  right: PanelId[];
}
export const DEFAULT_LAYOUT: Layout = { left: ['keys', 'chords'], right: ['lattice', 'spectrum'] };
export const LAYOUT_KEY = 'hrifa.harmonic-field-lab.mock.layout.v1';

/* ------------------------------------------------------------------------------------------ width to columns */
/** Rem the fixed parts take: rail 9.5, switcher column 24, workspace minimum 64, grid padding and gaps 1. */
export const FIXED_REM = 9.5 + 24 + 64 + 1;
/** One pinned column: 24 rem plus the 0.25 rem grid gap. */
export const COLUMN_REM = 24.25;

/** How many pinned columns fit in a window `widthRem` wide (1700 px is about 106 rem: none; 2560 px: 2; 3840 px: 5). */
export function fitColumns(widthRem: number): number {
  if (!(widthRem > FIXED_REM)) {
    return 0;
  }
  return Math.max(0, Math.floor((widthRem - FIXED_REM) / COLUMN_REM));
}

/* ----------------------------------------------------------------------------------------------- arrangement */
export const pinnedIds = (l: Layout): PanelId[] => [...l.left, ...l.right];

/**
 * The pins that get a column when `count` columns fit: nearest the generator first, alternating left and right, so a
 * narrow screen keeps the inner pair. The rest stay pinned but are reachable only through the switcher.
 */
export function visiblePins(l: Layout, count: number): Set<PanelId> {
  const out = new Set<PanelId>();
  for (let k = 0; out.size < count && (k < l.left.length || k < l.right.length); k++) {
    const inL = l.left[l.left.length - 1 - k];
    const inR = l.right[k];
    if (inL && out.size < count) {
      out.add(inL);
    }
    if (inR && out.size < count) {
      out.add(inR);
    }
  }
  return out;
}

const without = (l: Layout, id: PanelId): Layout => ({
  left: l.left.filter((x) => x !== id),
  right: l.right.filter((x) => x !== id),
});

/** Pin a panel on the outer end of the side with fewer pins (right on a tie). No-op if already pinned. */
export function pin(l: Layout, id: PanelId): Layout {
  if (pinnedIds(l).includes(id)) {
    return l;
  }
  return l.right.length <= l.left.length
    ? { ...l, right: [...l.right, id] }
    : { ...l, left: [id, ...l.left] };
}

export function unpin(l: Layout, id: PanelId): Layout {
  return without(l, id);
}

/**
 * Move a pinned panel one place left or right on screen. On the left side, "right" is inward and "left" outward; on the
 * right side the reverse. Moving inward past the innermost column crosses to the innermost place on the other side.
 * Moving outward past the screen edge does nothing.
 */
export function move(l: Layout, id: PanelId, dir: 'left' | 'right'): Layout {
  const li = l.left.indexOf(id);
  if (li >= 0) {
    const left = [...l.left];
    if (dir === 'left') {
      if (li === 0) {
        return l;
      }
      [left[li - 1], left[li]] = [left[li], left[li - 1]];
      return { ...l, left };
    }
    if (li < left.length - 1) {
      [left[li + 1], left[li]] = [left[li], left[li + 1]];
      return { ...l, left };
    }
    return { left: left.slice(0, -1), right: [id, ...l.right] };
  }
  const ri = l.right.indexOf(id);
  if (ri < 0) {
    return l;
  }
  const right = [...l.right];
  if (dir === 'right') {
    if (ri === right.length - 1) {
      return l;
    }
    [right[ri + 1], right[ri]] = [right[ri], right[ri + 1]];
    return { ...l, right };
  }
  if (ri > 0) {
    [right[ri - 1], right[ri]] = [right[ri], right[ri - 1]];
    return { ...l, right };
  }
  return { left: [...l.left, id], right: right.slice(1) };
}

/** True when moving `dir` does something (the outer edge buttons are disabled). */
export function canMove(l: Layout, id: PanelId, dir: 'left' | 'right'): boolean {
  const next = move(l, id, dir);
  return next !== l;
}

/* ----------------------------------------------------------------------------------------------- persistence */
/** Validate a stored layout: two arrays of known, unique panel ids. Anything else gives the defaults. */
export function parseLayout(raw: string | null | undefined): Layout {
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
    const ok =
      all.every((x) => typeof x === 'string' && (PANEL_IDS as readonly string[]).includes(x)) &&
      new Set(all).size === all.length;
    return ok ? { left: left as PanelId[], right: right as PanelId[] } : DEFAULT_LAYOUT;
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function loadLayout(): Layout {
  try {
    return parseLayout(window.localStorage.getItem(LAYOUT_KEY));
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
