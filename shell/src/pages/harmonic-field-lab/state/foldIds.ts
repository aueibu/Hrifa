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
