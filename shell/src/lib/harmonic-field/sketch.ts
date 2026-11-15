/**
 * Chord sketch helpers (M8a): the EXACT pitches of a template placed on any root, and how those pitches sit against a
 * field (found notes, or the distance in cents to the nearest field note). Pure: no React, no DOM, no storage.
 */
import { parseTemplate } from './chords';
import { EPS, mod, mulNotes, ratioNote } from './intervals';
import { indexField, resolvePitchesIn, MATCH_TOL } from './library';
import type { Note } from './types';

/**
 * The template's notes above `root`, root first then ascending, exact when the root and the template are (monzo times the
 * template's integer ratio; an irrational root keeps cents only). Not reduced into the repeat: this is the chord as
 * heard, stacked as the template is written. Null when the template does not parse.
 */
export function sketchPitches(root: Note, templateText: string): Note[] | null {
  const pt = parseTemplate(templateText);
  if (!pt.ok) {
    return null;
  }
  const ints = pt.otonal.split(':').map(Number);
  const low = ints[0];
  return ints.map((n) =>
    n === low ? { m: root.m ? { ...root.m } : null, c: root.c } : mulNotes(root, ratioNote(n, low))
  );
}

export interface SketchMatch {
  /** Field index of the note it lands on (within `tol` cents, repeat-aware), else null. */
  idx: number | null;
  /** Cents of the nearest field note minus the pitch (positive: the note is above it), repeat-aware; 0 when found. */
  dist: number;
}

/**
 * Each pitch against a field: found notes (exact monzo, else within `tol` cents; the pitch is reduced into the repeat
 * first), and for the others the signed distance in cents to the nearest field note, wrapping around the repeat. An empty
 * field gives `{ idx: null, dist: NaN }` for every pitch.
 */
export function matchToField(
  field: readonly Note[],
  rep: Note,
  pitches: readonly Note[],
  tol = MATCH_TOL
): SketchMatch[] {
  const ix = indexField(field);
  const repC = rep.c;
  const reduced = pitches.map((p) => {
    if (!(repC > EPS)) {
      return p;
    }
    // the field holds notes in [0, repeat): bring the pitch there with the repeat's own monzo when both are exact
    const k = Math.floor(p.c / repC + 1e-9);
    return k === 0 ? p : { ...mulNotes(p, rep, -k) };
  });
  const found = resolvePitchesIn(ix, reduced, tol).match;
  return reduced.map((p, i) => {
    const at = found[i];
    if (at !== null) {
      return { idx: at, dist: 0 };
    }
    if (!field.length) {
      return { idx: null, dist: NaN };
    }
    const pc = repC > EPS ? mod(p.c, repC) : p.c;
    let best = Infinity;
    for (const n of field) {
      const cands = repC > EPS ? [n.c - pc, n.c - pc + repC, n.c - pc - repC] : [n.c - pc];
      for (const d of cands) {
        if (Math.abs(d) < Math.abs(best)) {
          best = d;
        }
      }
    }
    return { idx: null, dist: best };
  });
}

/*
 * A chord is a template label (4:5:6) plus a REALIZATION: the pitches a field gives it. A realization is kept as a SHAPE: the
 * intervals above the chord's own root (root first, 1/1), so it can be placed on any other note rigidly, errors included.
 */

/** The template's exact intervals above its own root (1/1 first), or null when it does not parse. */
export function exactShape(templateText: string): Note[] | null {
  return sketchPitches(ratioNote(1, 1), templateText);
}

/** A shape placed on `root`: each interval times the root. */
export function placeShape(root: Note, shape: readonly Note[]): Note[] {
  return shape.map((iv) => mulNotes(root, iv));
}

/**
 * The shape of a chord found in a field in ROOT POSITION: its member notes as intervals above its root, root first then
 * ascending (a member below the root is lifted by the repeat). Placed on a note it stacks every note above that note, which
 * can differ from the chord chip's own field-reduced voicing (by design, pending the human's confirmation). Null when the
 * root is not a field note.
 */
export function chordShape(
  field: readonly Note[],
  rep: Note,
  rootIdx: number,
  memberIdx: Iterable<number>
): Note[] | null {
  const root = field[rootIdx];
  if (!root) {
    return null;
  }
  const ivs = [...new Set(memberIdx)]
    .filter((i) => i !== rootIdx && field[i])
    .map((i) => {
      let n = mulNotes(field[i], root, -1);
      while (rep.c > EPS && n.c < -EPS) {
        n = mulNotes(n, rep, 1);
      }
      return n;
    })
    .sort((a, b) => a.c - b.c);
  return [ratioNote(1, 1), ...ivs];
}

/**
 * The template as the field realizes it at `root`: each exact pitch is replaced by the nearest field note (at the pitch's own
 * octave) when it is within `tol` cents, else it stays exact. Returned as a shape. Null when the template does not parse.
 */
export function realizeTemplate(
  field: readonly Note[],
  rep: Note,
  root: Note,
  templateText: string,
  tol: number
): Note[] | null {
  const exact = exactShape(templateText);
  if (!exact) {
    return null;
  }
  if (!field.length || !(rep.c > EPS)) {
    return exact;
  }
  return exact.map((iv, i) => {
    if (i === 0) {
      return iv;
    }
    const p = mulNotes(root, iv);
    const pc = mod(p.c, rep.c);
    let best: Note | null = null;
    let bd = Infinity;
    for (const n of field) {
      for (const d of [n.c - pc, n.c - pc + rep.c, n.c - pc - rep.c]) {
        if (Math.abs(d) < Math.abs(bd)) {
          bd = d;
          best = n;
        }
      }
    }
    if (!best || Math.abs(bd) > tol) {
      return iv;
    }
    const k = Math.round((p.c + bd - best.c) / rep.c);
    return mulNotes(mulNotes(best, rep, k), root, -1);
  });
}

/**
 * The shape the Sketch row and hold 4 / 5 use: `exact` = the template's true ratios; `field` = the armed chord's shape when
 * there is one, else the template realized at the sketch root (exact where it cannot be derived).
 */
export function sketchShape(
  field: readonly Note[],
  rep: Note,
  sketchRoot: Note | undefined,
  templateText: string,
  armed: readonly Note[] | null,
  tol: number,
  how: 'field' | 'exact'
): Note[] | null {
  if (how === 'exact') {
    return exactShape(templateText);
  }
  if (armed) {
    return armed.map((n) => ({ m: n.m ? { ...n.m } : null, c: n.c }));
  }
  return sketchRoot
    ? realizeTemplate(field, rep, sketchRoot, templateText, tol)
    : exactShape(templateText);
}
