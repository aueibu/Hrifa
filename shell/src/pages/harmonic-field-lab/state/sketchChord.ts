/**
 * The Sketch row's chord as it would sound now: the root note (the subset's degree `rootDeg`, wrapped), the shape (as in the
 * field, or exact) placed on it, and the root degree used. Pure; shared by the Stash key and anything else outside the row.
 */
import {
  parsePattern,
  placeShape,
  positionalChord,
  sketchShape,
  type Note,
  type RelNote,
} from '../../../lib/harmonic-field';
import type { Sketch } from './chordShelf';

export function sketchChord(
  field: readonly Note[],
  rep: Note,
  rel: readonly RelNote[],
  sketch: Pick<Sketch, 'shape' | 'rootDeg' | 'exact'> & { template: string | null },
  tol: number
): { pitches: Note[]; deg: number } | null {
  const n = rel.length;
  const root = n ? field[rel[sketch.rootDeg % n].src] : undefined;
  if (!root || !sketch.template) {
    return null;
  }
  const shape = sketchShape(
    field,
    rep,
    root,
    sketch.template,
    sketch.shape,
    tol,
    sketch.exact ? 'exact' : 'field'
  );
  return shape ? { pitches: placeShape(root, shape), deg: sketch.rootDeg % n } : null;
}

/**
 * M9: the sketch chord's pitches when it is POSITIONAL (`Sketch.positional`): the pattern at the sketch root degree of the
 * active subset (`subsetIdx` in field order, `mode` = the mode root degree), stacked above the root in root position
 * (lib `positionalChord`), field-absolute, root first. Null when the sketch is not positional, the pattern is invalid or the
 * subset is empty. The Play sketch, hold 4 / hold 5 and Stash paths (step 2) read this when it is not null.
 */
export function sketchPositionalPitches(
  field: readonly Note[],
  rep: Note,
  subsetIdx: readonly number[],
  mode: number,
  sketch: Pick<Sketch, 'rootDeg' | 'positional'>
): Note[] | null {
  const n = subsetIdx.length;
  const pattern = sketch.positional ? parsePattern(sketch.positional.pattern) : null;
  // too big for the subset (a step that is a whole turn comes back to the same note): no chord
  if (!n || !pattern || pattern.some((s) => s % n === 0)) {
    return null;
  }
  return positionalChord(field, subsetIdx, pattern, sketch.rootDeg % n, mode, rep)?.pitches ?? null;
}
