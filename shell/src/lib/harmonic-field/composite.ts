/**
 * Composite gamuts (M8c): the merged pitches of several collected items (chords, subsets, single notes) reduced into ONE
 * repeat. Pure: no React, no DOM, no storage.
 *
 * Rules (human decisions, 2026-11-15):
 * - The repeat is the FIRST item's source repeat (`rep`), or the fallback repeat (the current tab's) when there is no item
 *   or the first item has none. Every pitch of every item is reduced into `[0, repeat)`, so a Bohlen-Pierce (3/1) chord in
 *   an octave composite lands inside the octave. Pitches keep their exact monzo through reduction when both the pitch and
 *   the repeat have one; otherwise they become cents-only (as everywhere in the lab, H-1).
 * - Pitches are placed one at a time, in item order. A pitch within `tol` cents (inclusive, linear distance inside the
 *   repeat, no wrap-around) of a note already placed is MERGED into it; otherwise it becomes a new note. `keep` decides which
 *   pitch the merged note shows: 'first' keeps the one placed first (default), 'recent' the one placed last. Exception: when
 *   the two are the same pitch within 1e-6 c and only the later one has an exact monzo, the monzo wins (so exact pitches are
 *   never lost to a cents-only twin). A cents-only note stays cents-only.
 * - Each merged note remembers the ids of the items it came from (`origins`, in first-seen order).
 * - With tolerance 0 only identical pitches (within 1e-6 c) merge, so the set of pitches is independent of the order.
 */
import { reduceInto, EPS } from './intervals';
import { samePitch } from './library';
import type { Note } from './types';

export const MERGE_TOL_DEFAULT = 5;
export const MERGE_TOL_MAX = 50;
export type MergeKeep = 'first' | 'recent';

/** A tolerance in cents inside 0..50 (anything that is not a finite number gives the default). */
export function clampMergeTol(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    return MERGE_TOL_DEFAULT;
  }
  return Math.min(MERGE_TOL_MAX, Math.max(0, v));
}

/** What the merge needs of an item: an id, its pitches (field-absolute) and the repeat of the field it came from. */
export interface MergeItem {
  id: string;
  pitches: readonly Note[];
  /** The repeat of the item's source field, when known. */
  rep?: Note | null;
}

export interface MergeOptions {
  /** Merge tolerance in cents (default 5). */
  tol?: number;
  /** Which pitch a merged note shows (default 'first'). */
  keep?: MergeKeep;
}

export interface MergedNote {
  note: Note;
  /** Ids of the items that contributed a pitch to this note. */
  origins: string[];
}

export interface Composite {
  rep: Note;
  notes: MergedNote[];
}

const plain = (n: Note): Note => ({ m: n.m ? { ...n.m } : null, c: n.c });

/** The repeat a composite uses: the first item's source repeat, else the fallback. */
export function compositeRepeat(items: readonly MergeItem[], fallback: Note): Note {
  const first = items[0]?.rep;
  return first && first.c > EPS ? plain(first) : plain(fallback);
}

/** A pitch reduced into the repeat, as a plain note `{ m, c }`. */
export const reducePitch = (n: Note, rep: Note): Note => plain(reduceInto(plain(n), rep));

interface Work {
  note: Note;
  origins: string[];
}

type Placed = { kind: 'added' | 'merged'; at: Work; prev: Note };

function place(list: Work[], p: Note, id: string, tol: number, keep: MergeKeep): Placed {
  // the nearest existing note within the tolerance
  let hit: Work | null = null;
  let best = Infinity;
  for (const w of list) {
    const d = Math.abs(w.note.c - p.c);
    if (d <= tol + 1e-9 && d < best) {
      best = d;
      hit = w;
    }
  }
  if (!hit) {
    const w: Work = { note: p, origins: [id] };
    list.push(w);
    return { kind: 'added', at: w, prev: p };
  }
  const prev = hit.note;
  const same = Math.abs(hit.note.c - p.c) < EPS;
  if (keep === 'recent') {
    hit.note = same && hit.note.m && !p.m ? hit.note : p;
  } else if (same && !hit.note.m && p.m) {
    hit.note = p;
  }
  if (!hit.origins.includes(id)) {
    hit.origins.push(id);
  }
  return { kind: 'merged', at: hit, prev };
}

const finish = (list: Work[]): MergedNote[] =>
  list
    .map((w) => ({ note: w.note, origins: w.origins.slice() }))
    .sort((a, b) => a.note.c - b.note.c);

/** The merged gamut of the items (see the rules above). `fallbackRep` is used when the first item has no repeat. */
export function mergeComposite(
  items: readonly MergeItem[],
  fallbackRep: Note,
  opts: MergeOptions = {}
): Composite {
  const tol = clampMergeTol(opts.tol);
  const keep = opts.keep ?? 'first';
  const rep = compositeRepeat(items, fallbackRep);
  const list: Work[] = [];
  for (const it of items) {
    for (const p of it.pitches) {
      place(list, reducePitch(p, rep), it.id, tol, keep);
    }
  }
  return { rep, notes: finish(list) };
}

/** The merged notes as plain notes (a field's input), sorted by cents. */
export const compositeNotes = (c: Composite): Note[] => c.notes.map((n) => plain(n.note));

/** True when `a` and `b` hold the same pitches (each pitch the same exact monzo, or the same cents within 0.01), in any order. */
export function samePitches(a: readonly Note[], b: readonly Note[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const byC = (x: Note, y: Note) => x.c - y.c;
  const pa = [...a].sort(byC);
  const pb = [...b].sort(byC);
  return pa.every((p, i) => samePitch(p, pb[i]));
}

export interface AddPreview {
  rep: Note;
  /** The composite's notes before the item is added. */
  before: MergedNote[];
  /** Candidate pitches (reduced) that become new notes. */
  added: Note[];
  /** Candidate pitches that merge into a note already in the composite: the pitch and the existing note it lands on. */
  common: { pitch: Note; into: Note }[];
  /** Candidate pitches that vanish because, once reduced into the repeat, they coincide with an earlier pitch of the same item
   *  (an octave doubling, a repeated pitch, two pitches closer than the tolerance). */
  dropped: Note[];
  /** True when an item with the same pitches is already in the composite. */
  already: boolean;
}

/**
 * What adding a candidate item to the composite would do (the popup preview): which pitches are added, which are common with
 * existing notes, which are dropped by reduction, and whether the item is already in it.
 */
export function previewAdd(
  items: readonly MergeItem[],
  candidate: { pitches: readonly Note[] },
  fallbackRep: Note,
  opts: MergeOptions = {}
): AddPreview {
  const tol = clampMergeTol(opts.tol);
  const keep = opts.keep ?? 'first';
  const rep = compositeRepeat(items, fallbackRep);
  const list: Work[] = [];
  for (const it of items) {
    for (const p of it.pitches) {
      place(list, reducePitch(p, rep), it.id, tol, keep);
    }
  }
  const before = finish(list);
  const existing = new Set(list);
  const out: AddPreview = {
    rep,
    before,
    added: [],
    common: [],
    dropped: [],
    already: items.some((it) => samePitches(it.pitches, candidate.pitches)),
  };
  for (const p of candidate.pitches) {
    const r = reducePitch(p, rep);
    const w = place(list, r, '\0candidate', tol, keep);
    if (w.kind === 'added') {
      out.added.push(r);
    } else if (existing.has(w.at)) {
      out.common.push({ pitch: r, into: plain(w.prev) });
    } else {
      out.dropped.push(r);
    }
  }
  return out;
}
