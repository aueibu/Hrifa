/** M8g: fold ids of the Chords panel (ids as `Fold.tsx` stores them in `ui.folds`) and the list Collapse all writes. */
import { MAX_FOLD_ID, MAX_FOLDS } from './persist';

/** The storage id of a section: parts joined with `:`, cut to the stored length cap. */
export const foldId = (...parts: string[]): string => parts.join(':').slice(0, MAX_FOLD_ID);

export interface ChordFoldInput {
  /** The CPS section exists (CPS method). */
  cps: boolean;
  /** Positional pattern groups listed. */
  patterns: readonly string[];
  /** The ratio chips shown now: only size and family matter. */
  chips: readonly { size: string; family: string }[];
  /** Sizes in display order. */
  sizes: readonly string[];
}

/** Every fold id the panel renders for what it shows now (derived, never hard-coded), without duplicates. */
export function chordFoldIds({ cps, patterns, chips, sizes }: ChordFoldInput): string[] {
  const ids = new Set<string>();
  if (cps) {
    ids.add('cps');
  }
  ids.add('positional');
  for (const p of patterns) {
    ids.add(foldId('pos', p));
  }
  ids.add('families');
  for (const size of sizes) {
    const inSize = chips.filter((c) => c.size === size);
    if (!inSize.length) {
      continue;
    }
    ids.add(foldId('size', size));
    for (const f of new Set(inSize.map((c) => c.family))) {
      ids.add(foldId('fam', size, f));
    }
  }
  return [...ids];
}

/** The `ui.folds` record for Collapse all: exactly these ids folded (capped at MAX_FOLDS; ids beyond the cap stay open). Expand all is `{}`. */
export function collapseAll(ids: readonly string[]): Record<string, boolean> {
  return Object.fromEntries(ids.slice(0, MAX_FOLDS).map((id) => [id, true]));
}

/**
 * Expand all (M8i): the sections open (no section id stored) and every shape group that exists now expanded (`grp:` ids, a stored
 * id = expanded). Capped at MAX_FOLDS: sections hold no entries, so up to 256 groups open; groups beyond the cap stay collapsed.
 */
export function expandAll(groupIds: readonly string[]): Record<string, boolean> {
  return Object.fromEntries([...new Set(groupIds)].slice(0, MAX_FOLDS).map((id) => [id, true]));
}

/**
 * Add one id to the `ui.folds` record. When the record is full (MAX_FOLDS) the OLDEST `grp:` entries (insertion order) are dropped to
 * make room; with no `grp:` entry left to drop the add is refused (null).
 */
export function addFold(
  folds: Record<string, boolean>,
  id: string
): Record<string, boolean> | null {
  const next = { ...folds };
  const keys = Object.keys(next);
  if (keys.length >= MAX_FOLDS) {
    const old = keys.filter((k) => k.startsWith('grp:')).slice(0, keys.length - MAX_FOLDS + 1);
    if (old.length < keys.length - MAX_FOLDS + 1) {
      return null;
    }
    for (const k of old) {
      delete next[k];
    }
  }
  next[id] = true;
  return next;
}
