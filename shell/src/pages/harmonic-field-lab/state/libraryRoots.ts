/**
 * M7d: "Found on N roots" for the chord the library dialog shows (the last hovered or checked row). Pure, no React.
 *
 * The finder runs for the shown chord alone (one template, cheap) as soon as it is shown: the row is NOT checked. The roots
 * are Check's hits (`CheckHit`, subset order low to high) with each root's Worst and Avg error. A root can be previewed
 * (hover) or pinned (click); both are runtime state of the dialog and nothing is stored (see `ChordLibrary.tsx`).
 */
import type { LibraryEntry } from '../../../lib/harmonic-field';
import type { Base } from './derive';
import { checkEntry, type CheckHit } from './libraryCheck';

/** What stands in the roots table's place, or the rows: out of the finder's range, a folding chord, none found, or the hits. */
export type RootsView =
  | { kind: 'fold' }
  | { kind: 'range' }
  | { kind: 'none'; truncated: boolean }
  | { kind: 'found'; hits: CheckHit[]; truncated: boolean };

/**
 * The roots of `entry` on the subset at `tol` cents. A folding entry is never searched (`fold`; the dialog's own note); a
 * subset of fewer than 2 or more than 128 notes gives `range`; otherwise `none` or the hits in subset order.
 */
export function shownRoots(
  base: Pick<Base, 'rel' | 'repC' | 'ratios'>,
  entry: Pick<LibraryEntry, 'text' | 'folds'>,
  tol: number
): RootsView {
  if (entry.folds) {
    return { kind: 'fold' };
  }
  const r = checkEntry(base, entry, tol);
  if (!r) {
    return { kind: 'range' };
  }
  return r.count === 0
    ? { kind: 'none', truncated: r.truncated }
    : { kind: 'found', hits: r.hits, truncated: r.truncated };
}

/** The table's title: `In your subset: found on 5 roots`, `In your subset: found on 1 root`. */
export const rootsTitle = (n: number): string =>
  `In your subset: found on ${n} ${n === 1 ? 'root' : 'roots'}`;

/** The field indices of a view's roots (none for any view but `found`). */
export const rootIndices = (view: RootsView | null): number[] =>
  view && view.kind === 'found' ? view.hits.map((h) => h.rootIdx) : [];

/** A pinned or hovered root that is no longer one of the found roots is dropped. */
export function keepRoot(root: number | null, view: RootsView | null): number | null {
  return root !== null && rootIndices(view).includes(root) ? root : null;
}

/** The root the ring, the readout and hold 1 use, when a root is chosen: the hovered root, else the pinned one, else null (the default rule applies). */
export function chosenRoot(
  hover: number | null,
  pinned: number | null,
  view: RootsView | null
): number | null {
  return keepRoot(hover, view) ?? keepRoot(pinned, view);
}

/** A click on a root row: it pins that root, or unpins it when it is the pinned one. */
export const togglePin = (pinned: number | null, idx: number): number | null =>
  pinned === idx ? null : idx;
