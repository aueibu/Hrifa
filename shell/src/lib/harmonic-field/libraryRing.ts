/**
 * M7c-a: what the chord library dialog needs to hear and draw ONE library chord. Pure; no React, no DOM, no storage.
 *
 *  - `previewRoot`: where the chord is placed (for the sound and for the ring, the same root for both).
 *  - `libraryRing`: the chord's notes against a comparison set (the whole field, or the subset): exact pitches, the
 *    nearest note and the signed error, the direction and heat band of each, the merged dots and the readout lines.
 *
 * The nearest-note measurement is the Sketch row's own (`matchToField`: a pitch within `MATCH_TOL` of a note is that note,
 * otherwise the nearest note of the set around the repeat), so the ring and the stepper never disagree.
 */
import { parseTemplate } from './chords';
import { EPS, fmtRatio, ratioNote, reduceInto } from './intervals';
import { matchToField, sketchPitches } from './sketch';
import type { Note } from './types';

/* ---------------------------------------------------------------------------------------------------- bands */
/**
 * Error band by absolute cents: 0 exact, 1 under 5, 2 under 15, 3 under 30, 4 beyond. The lab's `severity()` is this
 * function (components/ui.tsx re-exports it), so the ring and every other heat view share the thresholds.
 */
export const errorBand = (c: number): 0 | 1 | 2 | 3 | 4 =>
  c < 1e-6 ? 0 : c < 5 ? 1 : c < 15 ? 2 : c < 30 ? 3 : 4;

/* ---------------------------------------------------------------------------------------------------- root */
export type PreviewRootSource = 'found' | 'stepper' | 'default';

export interface PreviewRoot {
  /** The root note the chord is placed on. */
  root: Note;
  /** Its field index, or null for the 1/1 default when the field has no 1/1. */
  idx: number | null;
  /** Why this root: where Check found the chord, the stepper's root, or the 1/1 default. */
  source: PreviewRootSource;
}

/**
 * The preview root of a library chord, for the sound AND the ring (M7c, rows 1 to 6):
 *  1. the root where Check finds it (`found` = the field indices of its hits);
 *  2. found on several roots: the stepper's root when it is one of them, else the lowest one (lowest pitch);
 *  3. not found: the stepper's root (`stepper` = a field index, null when nothing is selected);
 *  4. no selection: 1/1.
 * A found or stepper index that is not in the field is ignored.
 */
export function previewRoot(
  found: readonly number[],
  stepper: number | null,
  field: readonly Note[]
): PreviewRoot {
  const ok = (i: number | null): i is number => i !== null && Number.isInteger(i) && !!field[i];
  const hits = found.filter(ok);
  if (hits.length) {
    const pick =
      stepper !== null && hits.includes(stepper)
        ? stepper
        : hits.reduce((lo, i) => (field[i].c < field[lo].c - EPS ? i : lo));
    return { root: field[pick], idx: pick, source: 'found' };
  }
  if (ok(stepper)) {
    return { root: field[stepper], idx: stepper, source: 'stepper' };
  }
  const unison = field.findIndex((n) => Math.abs(n.c) < EPS);
  return { root: ratioNote(1, 1), idx: unison >= 0 ? unison : null, source: 'default' };
}

/* ---------------------------------------------------------------------------------------------------- ring */
/** `above` = the chord note is above its nearest note (orange), `below` = under it (teal), `exact` = neutral, `none` = nothing to compare with (an empty comparison set). */
export type RingDirection = 'above' | 'below' | 'exact' | 'none';

export interface RingNote {
  /** The interval above the chord's root as the template writes it, in lowest terms: `1`, `6/5`, `3/2`, `2` (never `1/1`). */
  ratio: string;
  /** The same pitch in the repeat, as a field note is written (`35/32`, or `386.3 c` for a note with no ratio). */
  pitch: string;
  /** Cents above 1/1 as heard (the root's pitch plus the interval, real octaves kept). */
  cents: number;
  /** Cents above 1/1 folded into [0, repeat): the ring position. */
  folded: number;
  /** Index of the nearest note in the comparison set (the note itself when exact), null for an empty set. */
  nearIdx: number | null;
  /** The nearest note as the lab writes a note (`5/3`, or `700.0 c` for a note with no ratio), null for an empty set. */
  near: string | null;
  /** Chord note minus nearest note in cents, wrapped on the repeat (positive: the chord note is above it); 0 when exact, null for an empty set. */
  err: number | null;
  direction: RingDirection;
  /** Heat band from `errorBand` of the absolute error (0 exact to 4), null for an empty set. */
  band: 0 | 1 | 2 | 3 | 4 | null;
  /** The readout line: `7/4 is +84.5 c from 5/3`, `3/2 is exact`. */
  line: string;
}

export interface RingDot {
  /** The ratios of its notes joined with `, ` (`1, 2` when an octave folds two notes onto one pitch). */
  label: string;
  /** Indices into `LibraryRing.notes` of the notes this dot stands for (several when they merge). */
  notes: number[];
  folded: number;
  nearIdx: number | null;
  near: string | null;
  err: number | null;
  direction: RingDirection;
  band: 0 | 1 | 2 | 3 | 4 | null;
}

export interface LibraryRing {
  /** The root the chord was placed on. */
  root: Note;
  /** One record per chord note, in the template's order (root first). */
  notes: RingNote[];
  /** The dots to draw: notes on the same pitch merge into one, in order of first appearance. */
  dots: RingDot[];
  /** The exact pitches in cents above 1/1, real octaves kept, NOT folded: what hold 5 sounds on a library row (M7e). */
  pitches: number[];
  /**
   * M7e: each chord note rounded to the nearest note of the comparison set (the one the flags and the readout use), the
   * chord note's own octave kept: its pitch minus its signed error (a note within `MATCH_TOL` of a note snaps onto it). One
   * per chord note, in the same order as `pitches`. An empty comparison set rounds nothing: these are then the exact
   * `pitches`. What hold 4 sounds on a library row.
   */
  rounded: number[];
  /** `notes[i].line`, one per ratio (a merged dot still has one line per ratio). */
  readout: string[];
}

/** A note as the lab writes it (`derive.noteLabel`): its ratio, or its cents to one decimal when it has none. */
const noteText = (n: Note): string => (n.m ? fmtRatio(n) : `${n.c.toFixed(1)} c`);

/** A signed one-decimal error with the true minus sign (U+2212) the chord chips and the Sketch row print: `+84.5`, `−48.8`. */
const signedC1 = (e: number): string => `${e < 0 ? '−' : '+'}${Math.abs(e).toFixed(1)}`;

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** A pitch folded into [0, repeat); a value a hair under the repeat counts as 0. */
function fold(c: number, repC: number): number {
  if (!(repC > EPS)) {
    return c;
  }
  const f = ((c % repC) + repC) % repC;
  return repC - f < EPS ? 0 : f;
}

/**
 * A chord note moved onto its nearest note of `compare`, keeping its own octave: the nearest note's pitch lifted by whole
 * repeats to the one nearest the chord note (for an inexact note this is `cents - err`, since `err` is that distance). A
 * note with no nearest note (an empty set) stays where it is.
 */
function roundedCents(n: RingNote, compare: readonly Note[], repC: number): number {
  if (n.nearIdx === null) {
    return n.cents;
  }
  const near = compare[n.nearIdx].c;
  return repC > EPS ? near + Math.round((n.cents - near) / repC) * repC : near;
}

/**
 * One library chord (`text`, as `LibraryEntry.text`) placed at `root`, set against `compare` (the whole field, or the
 * subset's notes: the caller picks, M7c rows 4 to 10). The chord's notes are its EXACT ratios; each note's nearest note and
 * signed error come from `matchToField` (the Sketch row's measurement), the error wrapped on the repeat `rep`. Notes on the
 * same pitch (an octave folded in) merge into one dot. Null when the text does not parse.
 */
export function libraryRing(
  text: string,
  root: Note,
  rep: Note,
  compare: readonly Note[]
): LibraryRing | null {
  const pt = parseTemplate(text);
  const placed = pt.ok ? sketchPitches(root, text) : null;
  if (!pt.ok || !placed) {
    return null;
  }
  const ints = pt.otonal.split(':').map(Number);
  const low = ints[0];
  const match = matchToField(compare, rep, placed);
  const notes: RingNote[] = placed.map((p, i) => {
    const g = gcd(ints[i], low) || 1;
    const num = ints[i] / g;
    const den = low / g;
    const ratio = den === 1 ? `${num}` : `${num}/${den}`;
    const m = match[i];
    const nearIdx = m.near;
    const err = nearIdx === null ? null : m.idx !== null ? 0 : -m.dist;
    const direction: RingDirection =
      err === null ? 'none' : Math.abs(err) < EPS ? 'exact' : err > 0 ? 'above' : 'below';
    const near = nearIdx === null ? null : noteText(compare[nearIdx]);
    const line =
      direction === 'none'
        ? `${ratio} has no note to compare with`
        : direction === 'exact'
          ? `${ratio} is exact`
          : `${ratio} is ${signedC1(err as number)} c from ${near}`;
    return {
      ratio,
      pitch: noteText(rep.c > EPS ? reduceInto(p, rep) : p),
      cents: p.c,
      folded: fold(p.c, rep.c),
      nearIdx,
      near,
      err: direction === 'exact' ? 0 : err,
      direction,
      band: err === null ? null : errorBand(Math.abs(err)),
      line,
    };
  });
  const dots: RingDot[] = [];
  notes.forEach((n, i) => {
    const same = dots.find((d) => Math.abs(d.folded - n.folded) < EPS);
    if (same) {
      same.notes.push(i);
      same.label = `${same.label}, ${n.ratio}`;
      return;
    }
    dots.push({
      label: n.ratio,
      notes: [i],
      folded: n.folded,
      nearIdx: n.nearIdx,
      near: n.near,
      err: n.err,
      direction: n.direction,
      band: n.band,
    });
  });
  return {
    root,
    notes,
    dots,
    pitches: notes.map((n) => n.cents),
    rounded: notes.map((n) => roundedCents(n, compare, rep.c)),
    readout: notes.map((n) => n.line),
  };
}
