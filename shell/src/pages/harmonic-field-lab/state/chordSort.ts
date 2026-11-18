/**
 * M4: the Chords panel Sort control and the per-note errors of a chord card. Pure, no React.
 *
 * Sort orders ONLY the cards inside a row (and the roots inside a shape group); family rows, size sections and folds never move.
 *  - Default: the order the row already has (ratio chords: tuning error, then scale position; CPS chords: the lib's order).
 *  - Root: the root's pitch above 1/1 in the field, low to high (`field[rootIdx].c`; the field is sorted by cents).
 *  - Simplicity: the chord's Tenney height, `log2` of the product of the chord's whole numbers in lowest terms, simplest first
 *    (4:5:6 gives log2(120)). It is read from the TEMPLATE text (`parseTemplate(...).otonal`), so a utonal 1/(4:5:6) is 10:12:15.
 *    A chord with no whole-number template (an irrational or unparsable one) sorts last.
 *  - Reverse flips whichever key is active, Default included.
 * Dashed cards (not found) always stay after the found cards and are sorted among themselves by the same key.
 */
import { EPS, exactShape, mulNotes, parseTemplate, type Note } from '../../../lib/harmonic-field';
import { chipOrder } from './chordGroups';
import { noteLabel, type ChordChip } from './derive';

export type ChordSort = 'default' | 'root' | 'simplicity';
export const CHORD_SORTS: readonly ChordSort[] = ['default', 'root', 'simplicity'];

/** Chord Tenney height of a template text: log2 of the product of its whole numbers in lowest terms; Infinity when it has none. */
export function templateHeight(template: string | null | undefined): number {
  const p = parseTemplate(template);
  if (!p.ok) {
    return Number.POSITIVE_INFINITY;
  }
  const nums = p.otonal.split(':').map(Number);
  if (!nums.length || nums.some((n) => !Number.isFinite(n) || n <= 0)) {
    return Number.POSITIVE_INFINITY;
  }
  return nums.reduce((a, n) => a + Math.log2(n), 0);
}

export interface SortOptions<T> {
  key: ChordSort;
  reverse: boolean;
  /** False for a dashed card: it stays after every found card. */
  found: (t: T) => boolean;
  /** The root's pitch in cents above 1/1. */
  rootC: (t: T) => number;
  /** The chord's Tenney height (Infinity when it has none). */
  height: (t: T) => number;
}

/** Cards in sort order: found cards by the key, then dashed cards by the same key; Reverse flips each part (dashed stay last). Never mutates. */
export function sortCards<T>(items: readonly T[], o: SortOptions<T>): T[] {
  const part = (list: T[]): T[] => {
    let out = list;
    if (o.key !== 'default') {
      const cmp =
        o.key === 'root'
          ? (a: T, b: T) => o.rootC(a) - o.rootC(b)
          : (a: T, b: T) => {
              const ha = o.height(a);
              const hb = o.height(b);
              if (ha === hb) {
                return o.rootC(a) - o.rootC(b);
              }
              return ha < hb ? -1 : 1; // Infinity sorts last
            };
      // Array.prototype.sort is stable: equal cards keep the row's own order
      out = [...list].sort(cmp);
    }
    return o.reverse ? [...out].reverse() : out;
  };
  return [...part(items.filter(o.found)), ...part(items.filter((t) => !o.found(t)))];
}

/**
 * Groups of a row in sort order: the roots inside each group are sorted, then the groups sort as units by their best member (the
 * first after the roots are sorted; the first of the reversed list under Reverse). A group of one is a plain card.
 */
export function sortGroups<T extends { members: readonly M[] }, M>(
  groups: readonly T[],
  o: SortOptions<M>
): (T & { members: M[] })[] {
  const inner = groups.map((g) => ({ ...g, members: sortCards(g.members, o) }));
  return sortCards(inner, {
    ...o,
    found: (g) => o.found(g.members[0]),
    rootC: (g) => o.rootC(g.members[0]),
    height: (g) => o.height(g.members[0]),
  });
}

/** `SortOptions` for ratio chips: a chip's root pitch is its field note's cents; its height comes from its template. */
export function chipSortOptions(
  key: ChordSort,
  reverse: boolean,
  field: readonly Note[]
): SortOptions<ChordChip> {
  return {
    key,
    reverse,
    found: (c) => c.found,
    rootC: (c) => field[c.rootIdx]?.c ?? 0,
    height: (c) => templateHeight(c.template),
  };
}

/** The per-note errors of a chip in the card's note order (`chipOrder`: root first, then upward), or null when it has none. */
export function chipErrors(
  chip: Pick<ChordChip, 'rootIdx' | 'memberIdx' | 'errors'>,
  field: readonly Note[],
  repC: number
): number[] | null {
  const errs = chip.errors;
  if (!errs || errs.length !== chip.memberIdx.length) {
    return null;
  }
  const order = chipOrder(chip, field, repC);
  const out = order.map((i) => errs[chip.memberIdx.indexOf(i)]);
  return out.every((e) => typeof e === 'number') ? out : null;
}

/**
 * Signed (H-38). Worst = the signed error of the note with the largest size (the first one on a tie); avg = the SIGNED mean over the
 * NON-root notes (index 0 is the root, 0 by construction), so +20 and -20 average to 0. Anything that sorts or filters by error
 * takes the size (`Math.abs`) of these values.
 */
export function errorStats(errors: readonly number[]): { worst: number; avg: number } {
  const worst = errors.reduce((w, e) => (Math.abs(e) > Math.abs(w) ? e : w), 0);
  const rest = errors.slice(1);
  const avg = rest.length ? rest.reduce((a, e) => a + e, 0) / rest.length : 0;
  return { worst, avg };
}

/** The word between an error and its ideal in a chip tooltip sentence (`13/11 is −26.4 c from 6/5`). One constant so the wording is a one-word change. */
export const NOTE_ERROR_WORD = 'from';

/** Below this many cents a note is written as exact in the tooltip sentence. */
export const EXACT_NOTE_C = 0.05;

/** One non-root note of a found chord, for the tooltip sentence `<member> is <error> c <word> <ideal>` (or `<member> is exact`). */
export interface NoteErrorLine {
  /** The field note as the card writes it (ratio, else cents). */
  member: string;
  /** The template position's ideal, placed on the chord's root and reduced into the repeat, written as a field note (ratio when exact, else cents). */
  ideal: string;
  /** Signed error in cents: the field note minus the ideal. */
  error: number;
}

/**
 * The per-note lines of a found chord's tooltip, in the finder's template order (the first note, the root, is left out). The k-th
 * note of the template's exact shape is the ideal of the k-th member: `members`, `memberIdx` and `errors` are all in that order
 * (lib `findChords`: template order, root first). Null when there is nothing to say: no errors, an unparsable template, or a
 * shape whose length does not match the member count.
 */
export function noteErrorLines(
  chip: Pick<ChordChip, 'template' | 'rootIdx' | 'members' | 'errors'>,
  field: readonly Note[],
  rep: Note
): NoteErrorLine[] | null {
  const root = field[chip.rootIdx];
  const errs = chip.errors;
  const shape = root ? exactShape(chip.template) : null;
  if (
    !root ||
    !errs ||
    !shape ||
    shape.length !== chip.members.length ||
    errs.length !== shape.length
  ) {
    return null;
  }
  const repC = rep.c;
  return shape.slice(1).map((iv, k) => {
    // the finder matched the template's pitch class, so the ideal is reduced into the repeat like the field note is
    let ideal = mulNotes(root, iv);
    if (repC > EPS) {
      while (ideal.c >= repC - 1e-6) {
        ideal = mulNotes(ideal, rep, -1);
      }
    }
    return { member: chip.members[k + 1], ideal: noteLabel(ideal), error: errs[k + 1] };
  });
}

/** `+6.4` / `−28.8`: a signed one-decimal error with a true minus sign (U+2212). */
export const signedC1 = (e: number): string => `${e < 0 ? '−' : '+'}${Math.abs(e).toFixed(1)}`;

/** The tolerance (whole cents) a chord with this worst error appears at, the ladder rung `ceil(maxErr - 1e-9)`; 0 for an exact chord (any tolerance). */
export const appearsAtTolerance = (maxErr: number): number =>
  maxErr < 1e-6 ? 0 : Math.ceil(maxErr - 1e-9);

/** `0, +6.4, -28.8 c`: signed one-decimal errors, a zero (the root, or an exact note) written `0`. */
export function fmtErrors(errors: readonly number[]): string {
  return `${errors
    .map((e) => (Math.abs(e) < 1e-6 ? '0' : `${e < 0 ? '-' : '+'}${Math.abs(e).toFixed(1)}`))
    .join(', ')} c`;
}
