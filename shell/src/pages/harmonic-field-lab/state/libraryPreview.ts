/**
 * M7c-b: one library chord placed for the dialog's ring panel and for the hold keys (the same root for both; M7e: holds 1, 4
 * and 5 play `sounds.own`, `.rounded` and `.exact`). Pure: it reads the base and the entry, and runs Check's finder for that
 * one entry.
 */
import {
  EPS,
  libraryRing,
  previewRoot,
  ratioNote,
  type LibraryEntry,
  type LibraryRing,
  type Note,
  type PreviewRoot,
} from '../../../lib/harmonic-field';
import type { Base } from './derive';
import { checkEntry, type CheckHit } from './libraryCheck';
import type { LibCmp } from './libraryState';

export type PreviewBase = Pick<Base, 'field' | 'rep' | 'repC' | 'idx' | 'rel' | 'ratios'>;

/**
 * M7e: the three sounds of a library chord (hold 1 on the ring's root; holds 4 and 5 on the Sketch stepper's root unless a
 * root row is chosen), as cents above 1/1 (real octaves, absolute pitch: the
 * Parallel | Relative switch is not applied). Which held key plays which set is `audio/plan.ts` `variantCents`.
 */
export interface LibrarySounds {
  /** Hold 1, like a chord card: the finder's voicing on this root (its field notes) when the chord is found there at the tolerance; else `rounded` rooted on the field's 1/1 (`fallback`). */
  own: number[];
  /** Hold 4: each chord note at the nearest note of the ring's comparison set, the chord note's octave kept (`LibraryRing.rounded`), from the Sketch stepper's root (a chosen root row overrides it). */
  rounded: number[];
  /** Hold 5: the exact ratios (`LibraryRing.pitches`) from the same root as hold 4. */
  exact: number[];
  /** `own` is the key-4 sound rooted on `fallbackRoot` because the chord is not found on this root at the tolerance (or it folds). */
  fallback: boolean;
}

export interface LibraryPreview {
  /** Where the chord is placed (found root, the stepper's, or 1/1). */
  root: PreviewRoot;
  ring: LibraryRing;
  /** The hold-1 target's identity: the entry and the root it sounds from. */
  targetKey: string;
  /** M7e: what hold 1, 4 and 5 play from this root. */
  sounds: LibrarySounds;
}

/**
 * Where hold 1 plays a chord the finder does not find (M7e): the field's 1/1 note; the Sketch stepper's root when the field
 * has no 1/1; a plain 1/1 when there is no stepper root either (an empty subset).
 */
export function fallbackRoot(base: Pick<Base, 'field'>, stepper: number | null): Note {
  const unison = base.field.find((n) => Math.abs(n.c) < EPS);
  if (unison) {
    return unison;
  }
  if (stepper !== null && base.field[stepper]) {
    return base.field[stepper];
  }
  return ratioNote(1, 1);
}

/**
 * The three sounds of a library chord on the ring's root (M7e). `hit` is Check's hit for that root (null when the chord is not
 * found there: not found at all, a folding entry, a subset outside 2 to 128 notes). `own` is the finder's voicing: each chord
 * note's exact pitch (real octave) moved by the voicing's signed error, i.e. the field note it found, in the chord note's own
 * octave; without a hit it is `rounded` rooted on `fallbackRoot`, so a row is never silent.
 */
export function librarySounds(
  base: PreviewBase,
  entry: Pick<LibraryEntry, 'text'>,
  ring: LibraryRing,
  hit: Pick<CheckHit, 'errors'> | null,
  stepper: number | null,
  cmp: LibCmp,
  explicit = false
): LibrarySounds {
  // Keys 4 and 5 play from the Sketch stepper's root (like the chord chips) unless a root row was chosen (`explicit`: hovered
  // or pinned), which all three keys follow; key 1 always plays the root the ring shows.
  const keyRing = explicit ? ring : stepperRing(base, entry, ring, stepper, cmp);
  const common = { rounded: keyRing.rounded, exact: keyRing.pitches };
  if (hit) {
    return {
      ...common,
      own: ring.pitches.map((c, k) => c + (hit.errors[k] ?? 0)),
      fallback: false,
    };
  }
  const from = libraryRing(
    entry.text,
    fallbackRoot(base, stepper),
    base.rep,
    compareNotes(base, cmp)
  );
  return { ...common, own: (from ?? ring).rounded, fallback: true };
}

/**
 * The chord placed on the Sketch stepper's root (a plain 1/1 when there is none: an empty subset), for holds 4 and 5. It is
 * `ring` itself when the ring already stands on that pitch (the chord is not found, or found on the stepper's root).
 */
function stepperRing(
  base: PreviewBase,
  entry: Pick<LibraryEntry, 'text'>,
  ring: LibraryRing,
  stepper: number | null,
  cmp: LibCmp
): LibraryRing {
  const root = (stepper !== null ? base.field[stepper] : undefined) ?? ratioNote(1, 1);
  if (Math.abs(root.c - ring.root.c) < EPS) {
    return ring;
  }
  return libraryRing(entry.text, root, base.rep, compareNotes(base, cmp)) ?? ring;
}

/**
 * A short identity of what the three sounds are (rounded to 0.01 c). The hold target's key carries it, so a held key follows a
 * change of tolerance, subset or the Field | Subset switch that keeps the same entry and root.
 */
export function soundsSignature(s: LibrarySounds): string {
  const r = (list: readonly number[]) => list.map((c) => Math.round(c * 100)).join(',');
  return `${r(s.own)}/${r(s.rounded)}/${r(s.exact)}`;
}

/**
 * The three sounds of a hovered field dot of the library ring (hold 1, 4, 5 with the pointer on a dot): `own` is that field
 * note alone (hold 1, as on the main ring); `rounded` and `exact` are the shown chord rooted on that note (the
 * `LibraryRing.rounded` and `.pitches` of `libraryRing(entry.text, note, rep, compare)`, real octaves kept; `rounded` uses the
 * ring's Field | Subset set). A dot is an explicit root choice: the Sketch stepper's root is not read. With no chord shown
 * (`entry` null or its text does not parse) only `own` sounds, and `rounded` and `exact` are empty (hold 4 and 5 are silent).
 */
export function dotSounds(
  base: Pick<Base, 'field' | 'rep' | 'idx'>,
  entry: Pick<LibraryEntry, 'text'> | null | undefined,
  fieldIdx: number,
  cmp: LibCmp
): LibrarySounds | null {
  const note = base.field[fieldIdx];
  if (!note) {
    return null;
  }
  const ring = entry ? libraryRing(entry.text, note, base.rep, compareNotes(base, cmp)) : null;
  return {
    own: [note.c],
    rounded: ring ? ring.rounded : [],
    exact: ring ? ring.pitches : [],
    fallback: false,
  };
}

/** The field index of the Sketch stepper's root (the subset's degree `rootDeg`, wrapped), or null for an empty subset. */
export function stepperRootIdx(base: Pick<Base, 'rel'>, rootDeg: number): number | null {
  const n = base.rel.length;
  return n ? base.rel[((rootDeg % n) + n) % n].src : null;
}

/** What the ring compares a chord against: every note of the field, or only the selected subset. */
export function compareNotes(base: Pick<Base, 'field' | 'idx'>, cmp: LibCmp): Note[] {
  return cmp === 'field' ? base.field : base.idx.map((i) => base.field[i]);
}

/**
 * The chord of `entry` placed by the root rule (M7c rows 1 to 6): the root where Check finds it, else the stepper's root, else
 * 1/1. A folding entry is never checked (its notes cannot be found here), so it takes the stepper's root or 1/1. Null when the
 * entry's text does not parse.
 *
 * M7d: `rootOverride` (a field index) places the chord on that root instead, but only when it is one of the roots where Check
 * finds the chord (the hovered or pinned row of "Found on N roots"); any other value, null or absent leaves the rule above.
 */
export function libraryPreview(
  base: PreviewBase,
  entry: Pick<LibraryEntry, 'text' | 'key' | 'folds'>,
  stepper: number | null,
  tol: number,
  cmp: LibCmp,
  rootOverride?: number | null
): LibraryPreview | null {
  const check = entry.folds ? null : checkEntry(base, entry, tol);
  const found = check ? check.hits.map((h) => h.rootIdx) : [];
  const forced =
    rootOverride != null && found.includes(rootOverride) && base.field[rootOverride]
      ? ({ root: base.field[rootOverride], idx: rootOverride, source: 'found' } as const)
      : null;
  const root = forced ?? previewRoot(found, stepper, base.field);
  const ring = libraryRing(entry.text, root.root, base.rep, compareNotes(base, cmp));
  if (!ring) {
    return null;
  }
  // the chord is found on the ring's root only when that root is one of Check's hits (`source` 'found')
  const hit =
    root.source === 'found' && check
      ? (check.hits.find((h) => h.rootIdx === root.idx) ?? null)
      : null;
  return {
    root,
    ring,
    targetKey: `lib:${entry.key}:${root.idx ?? 'none'}`,
    sounds: librarySounds(base, entry, ring, hit, stepper, cmp, forced !== null),
  };
}
