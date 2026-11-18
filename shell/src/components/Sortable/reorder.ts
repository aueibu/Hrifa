/**
 * The shell's reorder rule, as pure functions (no DOM, no dnd-kit). While dragging, the cards slide into the new order (live
 * `insert`). Resting `SWAP_DWELL_MS` on one card turns it into a swap target (`swap`): the others snap back to the original order and
 * the preview shows the trade. Moving onto another card resumes live insert. The order on screen is what the drop produces.
 */

/** `grid`: items in rows. `list`: one column. */
export type SortLayout = 'grid' | 'list';
/** `insert`: live rearrange. `swap`: the pointer has rested on a card. */
export type DragMode = 'insert' | 'swap';

/** How long the pointer must rest on one card before it becomes a swap target. */
export const SWAP_DWELL_MS = 800;

export interface Move {
  from: number;
  /** `insert`: the FINAL index of the moved item (`arrayMove`'s meaning). `swap`: the other item's index. */
  to: number;
  kind: DragMode;
}

export interface Point {
  x: number;
  y: number;
}
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}
export const pointInRect = (p: Point, r: Box): boolean =>
  p.x >= r.left && p.x <= r.left + r.width && p.y >= r.top && p.y <= r.top + r.height;

/** Which card the pointer is over, and since when (ms on any clock). */
export interface Dwell {
  overId: string | null;
  since: number;
}
export const noDwell: Dwell = { overId: null, since: 0 };

/** The pointer is now over `overId` (`null`: on no card, a gap or off the bar): a different value restarts the clock, the same keeps it. */
export function trackOver(dwell: Dwell, overId: string | null, now: number): Dwell {
  return dwell.overId === overId ? dwell : { overId, since: now };
}

/** `swap` (with its target) once the pointer has rested on a card other than the dragged one for `SWAP_DWELL_MS`; otherwise `insert`. */
export function dwellMode(
  dwell: Dwell,
  activeId: string,
  now: number
): { mode: DragMode; target: string | null } {
  if (dwell.overId !== null && dwell.overId !== activeId && now - dwell.since >= SWAP_DWELL_MS) {
    return { mode: 'swap', target: dwell.overId };
  }
  return { mode: 'insert', target: null };
}

/** Move the item at `from` so it ends at index `to`; the ones between shift by one. */
export function arrayMove<T>(list: readonly T[], from: number, to: number): T[] {
  const out = list.slice();
  if (from < 0 || from >= out.length || to < 0 || to >= out.length) {
    return out;
  }
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}

/** The order the screen shows (and a drop produces) with `activeId` over `overId` in `mode`. */
export function previewOrder(
  items: readonly string[],
  activeId: string,
  overId: string | null,
  mode: DragMode
): string[] {
  const from = items.indexOf(activeId);
  const to = overId === null ? -1 : items.indexOf(overId);
  if (from < 0 || to < 0 || from === to) {
    return items.slice();
  }
  if (mode === 'swap') {
    const out = items.slice();
    out[from] = items[to];
    out[to] = items[from];
    return out;
  }
  return arrayMove(items, from, to);
}

/** The move a drop makes, or `null` when it changes nothing. */
export function moveFor(
  items: readonly string[],
  activeId: string,
  overId: string | null,
  mode: DragMode
): Move | null {
  const from = items.indexOf(activeId);
  const to = overId === null ? -1 : items.indexOf(overId);
  return from < 0 || to < 0 || from === to ? null : { from, to, kind: mode };
}
