/**
 * Added pitches of the Pairs panel (M3 of the Scala-tools arc): pitches typed in an "Add pitch" box that are NOT in the
 * subset. Parsing (shared with the Find box), the stored canonical text, the checks, and the cells between added pitches
 * and the subset. Pure; none of this touches `intervalPairs`.
 */
import { fmtRatio, mulNotes, parseInterval } from './intervals';
import type { Note } from './types';

/** At most this many added pitches. */
export const ADDED_MAX = 4;
/** Two pitches closer than this (cents) are the same pitch. */
export const ADDED_SAME_TOL = 0.01;

/** A number with an optional unit: "700", "700 c", "700c", "700.5", "-100 cents". */
const CENTS = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(?:c|cents?)?$/i;

export interface PitchText {
  /** The size in cents (not reduced into the repeat). */
  c: number;
  /** The ratio as typed, or the cents as "700 c". */
  label: string;
  /** The text to store: the reduced ratio "p/q", or the cents as "700 c". */
  canon: string;
}

/**
 * Text with a slash or colon is a ratio; anything else is cents (a bare "2" is 2 cents, never 2/1). The empty text is
 * null, junk is 'bad'. Used by the Find box and by Add pitch.
 */
export function parsePitchText(text: string): PitchText | 'bad' | null {
  const t = text.trim();
  if (t === '') {
    return null;
  }
  if (/[/:]/.test(t)) {
    const n = parseInterval(t);
    return n && n.m ? { c: n.c, label: t, canon: fmtRatio(n) } : 'bad';
  }
  const m = CENTS.exec(t);
  if (!m) {
    return 'bad';
  }
  const c = Number(m[1]);
  if (!Number.isFinite(c)) {
    return 'bad';
  }
  return { c, label: `${c} c`, canon: `${Number(c.toFixed(6))} c` };
}

/** A pitch's place in [0, repC). */
export const pitchPlace = (c: number, repC: number): number => {
  const r = c - Math.floor(c / repC) * repC;
  return r >= repC ? 0 : r;
};

/** Distance in cents between two places on the repeat circle. */
function circleDist(a: number, b: number, repC: number): number {
  const d = Math.abs(pitchPlace(a, repC) - pitchPlace(b, repC));
  return Math.min(d, repC - d);
}

export type AddedPitchCheck =
  | { ok: true; canon: string }
  | { ok: false; kind: 'empty' | 'bad' | 'duplicate' | 'subset' | 'full'; message: string };

/**
 * The checks of Add pitch. `subsetNotes` = the subset notes' places in cents above 1/1, `existingAdded` = the stored
 * canonical texts. A 'duplicate' is silently ignorable (no message to show); 'empty' is no input.
 */
export function addedPitchError(
  text: string,
  subsetNotes: readonly number[],
  existingAdded: readonly string[],
  repC = 1200
): AddedPitchCheck {
  const p = parsePitchText(text);
  if (p === null) {
    return { ok: false, kind: 'empty', message: '' };
  }
  if (p === 'bad') {
    return { ok: false, kind: 'bad', message: 'Not a ratio or cents. Try 3/2 or 702.' };
  }
  const dup = existingAdded.some((t) => {
    const e = parsePitchText(t);
    return e !== null && e !== 'bad' && circleDist(e.c, p.c, repC) < ADDED_SAME_TOL;
  });
  if (dup) {
    return { ok: false, kind: 'duplicate', message: '' };
  }
  if (subsetNotes.some((c) => circleDist(c, p.c, repC) < ADDED_SAME_TOL)) {
    return { ok: false, kind: 'subset', message: 'That pitch is already in the subset.' };
  }
  if (existingAdded.length >= ADDED_MAX) {
    return { ok: false, kind: 'full', message: `At most ${ADDED_MAX} added pitches.` };
  }
  return { ok: true, canon: p.canon };
}

/** The stored list read back: keeps parsable entries, drops one within 0.01 c of an earlier one, cuts to ADDED_MAX. */
export function sanitizeAdded(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: string[] = [];
  const cs: number[] = [];
  for (const v of raw) {
    if (typeof v !== 'string' || v.length > 40) {
      continue;
    }
    const p = parsePitchText(v);
    if (p === null || p === 'bad' || cs.some((c) => Math.abs(c - p.c) < ADDED_SAME_TOL)) {
      continue;
    }
    out.push(p.canon);
    cs.push(p.c);
    if (out.length >= ADDED_MAX) {
      break;
    }
  }
  return out;
}

export interface DrawnAdded {
  /** Index into the stored list. */
  index: number;
  text: string;
  /** Place in [0, repC) cents above 1/1. */
  c: number;
}

/** The added pitches to draw: a stored pitch that coincides with a subset note (or an earlier added one) is skipped. */
export function drawnAdded(
  stored: readonly string[],
  subsetNotes: readonly number[],
  repC: number
): DrawnAdded[] {
  const out: DrawnAdded[] = [];
  stored.forEach((text, index) => {
    const p = parsePitchText(text);
    if (p === null || p === 'bad') {
      return;
    }
    const c = pitchPlace(p.c, repC);
    const taken = subsetNotes.some((s) => circleDist(s, c, repC) < ADDED_SAME_TOL);
    if (!taken && !out.some((o) => circleDist(o.c, c, repC) < ADDED_SAME_TOL)) {
      out.push({ index, text, c });
    }
  });
  return out;
}

export type PitchRef = { kind: 'subset'; i: number } | { kind: 'added'; i: number };

export interface AddedCell {
  from: PitchRef;
  to: PitchRef;
  /** Places of the lower and upper note (the upper one repeat higher when wrapped): the input of `beatCell`. */
  loC: number;
  hiC: number;
  /** The interval, hiC - loC (slightly negative for a near unison with the upper note just below). */
  c: number;
  /** True when the upper note lies below the lower one and is read up to the next repeat (as a subset cell's `wrap`). */
  wrap: boolean;
}

/**
 * Every directed cell between each added pitch (index in `added`) and each subset note, and between added pitches, in
 * both directions. `subsetNotes` are the subset notes' places above 1/1. The upper note is the next one up, one repeat
 * higher when it lies below; except a pair that is only `tolC` cents (or less) below counts as a small negative interval.
 */
export function addedCells(
  subsetNotes: readonly number[],
  added: readonly { c: number }[],
  repC: number,
  tolC: number
): AddedCell[] {
  const cells: AddedCell[] = [];
  const tol = Math.max(0, tolC);
  const make = (from: PitchRef, to: PitchRef, a: number, b: number) => {
    let hi = b;
    const wrap = b - a < -tol;
    if (wrap) {
      hi += repC;
    }
    cells.push({ from, to, loC: a, hiC: hi, c: hi - a, wrap });
  };
  added.forEach((a, k) => {
    const ar: PitchRef = { kind: 'added', i: k };
    subsetNotes.forEach((s, i) => {
      const sr: PitchRef = { kind: 'subset', i };
      make(ar, sr, a.c, s);
      make(sr, ar, s, a.c);
    });
    added.forEach((b, l) => {
      if (l !== k) {
        make(ar, { kind: 'added', i: l }, a.c, b.c);
      }
    });
  });
  return cells;
}

/**
 * A note's ratio reduced into the repeat so that its cents match `placeC` (a size reduced into the repeat, as the cells
 * carry it): the note minus the whole repeats it lies above. Null when the note or the repeat has no ratio.
 */
export function reduceNote(n: Note, placeC: number, rep: Note): Note | null {
  if (!n.m) {
    return null;
  }
  const k = Math.round((n.c - placeC) / rep.c);
  if (k === 0) {
    return { m: n.m, c: placeC };
  }
  if (!rep.m) {
    return null;
  }
  const r = mulNotes(n, rep, -k);
  return { m: r.m, c: placeC };
}

/** The exact ratio of an added cell (`hi` over `lo`, reduced into the repeat), or null when either pitch has no ratio. */
export function addedCellNote(cell: AddedCell, lo: Note, hi: Note, rep: Note): Note | null {
  return reduceNote(mulNotes(hi, lo, -1), cell.c, rep);
}
