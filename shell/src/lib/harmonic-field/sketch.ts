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
