/**
 * The Sketch row's chord as it would sound now: the root note (the subset's degree `rootDeg`, wrapped), the shape (as in the
 * field, or exact) placed on it, and the root degree used. Pure; shared by the Stash key and anything else outside the row.
 */
import { placeShape, sketchShape, type Note, type RelNote } from '../../../lib/harmonic-field';
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
