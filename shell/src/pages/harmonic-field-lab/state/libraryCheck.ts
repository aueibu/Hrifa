/**
 * M7: Check a chord library entry against the current subset without adding it. Pure; it reads the base and the entry and
 * never touches `state.templates`.
 */
import { findChordVoicings, type LibraryEntry } from '../../../lib/harmonic-field';
import { MAX_CHORDS, type Base } from './derive';

export interface CheckHit {
  /** Field index of the root. */
  rootIdx: number;
  /** The root's ratio text (as the chord chips show it). */
  root: string;
  /** The largest error, in cents, of the chord on that root. */
  maxErr: number;
}

export interface CheckResult {
  /** One hit per root where the entry is found within the tolerance, in the order of the subset (low to high). */
  hits: CheckHit[];
  count: number;
  /** The finder's voicing cap cut the search (the same cap the chips have): the list may be incomplete. */
  truncated: boolean;
}

/** The most roots the Check line names; the rest is counted ("+3 more") so the line stays one line. */
export const CHECK_ROOTS_SHOWN = 8;

/**
 * The one line under a checked row: `none found`, or `2 found: on 5/4, 5/3`, with `(worst 21.5 c)` when the worst error
 * rounds to more than 0 and `; search cut short` when the finder's cap cut the search.
 */
export function checkSentence(r: CheckResult): string {
  if (r.count === 0) {
    return r.truncated ? 'none found; search cut short' : 'none found';
  }
  const shown = r.hits.slice(0, CHECK_ROOTS_SHOWN).map((h) => h.root);
  const more = r.hits.length - shown.length;
  const worst = Math.round(Math.max(...r.hits.map((h) => h.maxErr)) * 10) / 10;
  return (
    `${r.count} found: on ${shown.join(', ')}${more > 0 ? `, +${more} more` : ''}` +
    `${worst > 0 ? ` (worst ${worst.toFixed(1)} c)` : ''}${r.truncated ? '; search cut short' : ''}`
  );
}

/**
 * Runs the lib's voicing finder for exactly this one entry on the subset (`base.rel`, `base.repC`) at `tol` cents, the
 * same finder and tolerance rule the chord chips use. A root with several voicings counts once, at its best (smallest)
 * error. Null when the subset has fewer than 2 or more than `MAX_CHORDS` (128) notes: the usual hint is shown instead.
 * A folding entry finds nothing (zero hits); the dialog disables Check for it before getting here.
 */
export function checkEntry(
  base: Pick<Base, 'rel' | 'repC' | 'ratios'>,
  entry: Pick<LibraryEntry, 'text'> & Partial<Pick<LibraryEntry, 'names' | 'family'>>,
  tol: number
): CheckResult | null {
  const { rel, repC, ratios } = base;
  if (rel.length < 2 || rel.length > MAX_CHORDS) {
    return null;
  }
  const { chords: found, truncated } = findChordVoicings(rel, repC, [{ text: entry.text }], tol);
  const best = new Map<number, number>();
  for (const c of found) {
    const have = best.get(c.root);
    if (have === undefined || c.maxErr < have) {
      best.set(c.root, c.maxErr);
    }
  }
  const hits: CheckHit[] = rel
    .filter((n) => best.has(n.src))
    .map((n) => ({ rootIdx: n.src, root: ratios[n.src], maxErr: best.get(n.src) as number }));
  return { hits, count: hits.length, truncated };
}
