/**
 * Pure rules of the Keys panel: how a key compares with the subset (common tones, would be added, would be dropped,
 * missing in the field), the Switch and Add results, and which key the big view shows. No React, no storage.
 */

/** One key against the subset, in field indices. */
export interface KeyDiff {
  /** Key notes the subset already has. */
  common: number[];
  /** Key notes the subset lacks (Add would join them). */
  added: number[];
  /** Subset notes the key does not use (Switch would drop them). */
  dropped: number[];
  /** Degrees of the key with no field note (they cannot be selected). */
  missing: number;
}

const asc = (a: number, b: number) => a - b;

/** The key's found notes (null = missing degree) against the subset (field indices). */
export function keyDiff(subset: readonly number[], keyIdx: readonly (number | null)[]): KeyDiff {
  const have = new Set(subset);
  const found = new Set(keyIdx.filter((i): i is number => i !== null));
  return {
    common: [...found].filter((i) => have.has(i)).sort(asc),
    added: [...found].filter((i) => !have.has(i)).sort(asc),
    dropped: [...have].filter((i) => !found.has(i)).sort(asc),
    missing: keyIdx.filter((i) => i === null).length,
  };
}

/** Common tones with the subset: the x of the small ring's `x|y` (y is the subset size). */
export const commonTones = (
  subset: readonly number[],
  keyIdx: readonly (number | null)[]
): number => keyDiff(subset, keyIdx).common.length;

/** "6 common · +1 added · −1 dropped · 0 missing": words, never x/y. */
export const keySummary = (d: KeyDiff): string =>
  `${d.common.length} common \u00b7 +${d.added.length} added \u00b7 \u2212${d.dropped.length} dropped \u00b7 ${d.missing} missing`;

/** Switch: the subset becomes the key's found notes, the key root is the mode root. */
export function switchTo(
  keyIdx: readonly (number | null)[],
  rootIdx: number
): { idx: number[]; mode: number } {
  const idx = [...new Set(keyIdx.filter((i): i is number => i !== null))].sort(asc);
  return { idx, mode: Math.max(0, idx.indexOf(rootIdx)) };
}

/** Add: the subset joined with the key's found notes; the mode root stays the same note. */
export function addTo(
  subset: readonly number[],
  mode: number,
  keyIdx: readonly (number | null)[]
): { idx: number[]; mode: number } {
  const root = subset.length
    ? subset[((mode % subset.length) + subset.length) % subset.length]
    : null;
  const idx = [...new Set([...subset, ...keyIdx.filter((i): i is number => i !== null)])].sort(asc);
  return { idx, mode: root === null ? 0 : Math.max(0, idx.indexOf(root)) };
}

/** What identifies "the subset" for the big view: the tab, its field and the notes with the mode. */
export const subsetSig = (tab: number, fieldKey: string, idx: readonly number[], mode: number) =>
  `${tab}|${fieldKey}|${idx.join(',')}|${mode}`;

/** The key last clicked, valid only for the subset it was clicked on (or produced). */
export interface ClickedKey {
  root: number;
  sig: string;
}

/**
 * The key the big view shows: the hovered one, else the last clicked one while the subset is still the one that click
 * left (a Switch or Add passes its resulting signature), else the current key (the subset itself, `current`).
 */
export function viewedKey(
  hover: number | null,
  clicked: ClickedKey | null,
  sig: string,
  current: number
): number {
  if (hover !== null) {
    return hover;
  }
  return clicked && clicked.sig === sig ? clicked.root : current;
}
