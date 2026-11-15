/**
 * Linked melody (M8b): the melody keys play a shelf chord's SOURCE subset instead of the active tab's. Pure, no React.
 *
 * The chord stores its source subset as field-absolute pitches plus the mode root (provenance, `source.subset`) and the source
 * generator's inputs (`source.gen`), whose repeat is the interval a melody key one octave up climbs by. The scale is the
 * subset read from its base (the mode root for Transpose, the chord's root note for Re-root, see `linkedScale`): each pitch's
 * cents above it, reduced into [0, repeat), sorted, root first, sounding on the chord's root. Frame (the live Parallel | Relative
 * switch): Relative sounds the root at its own pitch above 1/1, Parallel puts it on 1/1 (this melody's own rule, unchanged by the
 * chord frame rule). Lights always use the field-absolute pitch (H-2).
 */
import type { Note } from '../../../lib/harmonic-field';
import { hzOf } from '../audio/engine';
import type { LinkedRoot } from '../audio/keymap';
import type { ShelfChord } from './chordShelf';
import { generateField } from './generate';

export interface LinkedScale {
  /** Cents above the mode root of each degree, root (0) first, ascending, inside [0, repC). */
  rel: number[];
  /** The mode root's field-absolute pitch (cents above 1/1) in the source field. */
  rootC: number;
  /** The source generator's repeat in cents. */
  repC: number;
}

const DEDUPE = 0.01;

/** Re-root accepts the chord's root as a member of the source subset within this many cents (the merge tolerance). */
export const REROOT_TOL = 5;

/** Cents above `baseC` of every pitch, reduced into [0, repC), sorted, base (0) first, de-duplicated. */
function relFrom(cents: readonly number[], baseC: number, repC: number): number[] {
  return (
    [0, ...cents.map((c) => (((c - baseC) % repC) + repC) % repC)]
      .sort((a, b) => a - b)
      .filter((c, i, all) => i === 0 || c - all[i - 1] > DEDUPE)
      // a pitch just under the repeat is the root again one repeat up
      .filter((c) => repC - c > DEDUPE)
  );
}

/**
 * The source subset of `chord` as a scale ON THE CHORD'S ROOT (`chord.pitches[0]`, field-absolute), or null when the chord has
 * no source (no source, no pitches, unusable repeat): the melody then stays on the active subset. `repC` is the repeat of
 * `chord.source.gen` (the caller builds the field once).
 * - `transpose`: the subset keeps its shape and moves rigidly so its mode root lands on the chord's root (C major over C, D
 *   major over D); with the chord on the source's own mode root it is the subset as stored.
 * - `reroot`: the same subset notes rotated to start on the chord's root (D E F G A B C over D), when that root is one of them
 *   within `REROOT_TOL`; otherwise this chord falls back to `transpose`.
 */
export function linkedScale(
  chord: ShelfChord | undefined,
  repC: number,
  mode: LinkedRoot = 'transpose'
): LinkedScale | null {
  const src = chord?.source;
  if (!src || !(repC > 0) || !Number.isFinite(repC) || src.subset.pitches.length === 0) {
    return null;
  }
  const cents = src.subset.pitches.map((p: Note) => p.c).filter((c) => Number.isFinite(c));
  if (cents.length === 0) {
    return null;
  }
  const modeRootC =
    src.subset.root && Number.isFinite(src.subset.root.c) ? src.subset.root.c : Math.min(...cents);
  const chordRootC = chord && Number.isFinite(chord.pitches[0]?.c) ? chord.pitches[0].c : modeRootC;
  if (mode === 'reroot') {
    // the subset note the chord's root coincides with (mod the repeat)
    const member = cents.find((c) => {
      const d = (((c - chordRootC) % repC) + repC) % repC;
      return Math.min(d, repC - d) < REROOT_TOL;
    });
    if (member !== undefined) {
      return { rel: relFrom(cents, member, repC), rootC: member, repC };
    }
  }
  // transpose: the shape from the source's mode root, sounding from the chord's root
  return { rel: relFrom(cents, modeRootC, repC), rootC: chordRootC, repC };
}

/**
 * The sound of melody slot `slot` (degree `slot mod N`, `floor(slot / N) + shift` repeats up): its Hz in the given frame and
 * the field-absolute pitch (cents above 1/1) for the lights. Null for a bad slot.
 */
export function linkedPitch(
  sc: LinkedScale,
  slot: number,
  shift: number,
  frame: 'parallel' | 'relative',
  baseHz: number
): { hz: number; abs: number } | null {
  const n = sc.rel.length;
  if (!Number.isInteger(slot) || slot < 0 || n < 1) {
    return null;
  }
  const relC = sc.rel[slot % n] + (Math.floor(slot / n) + shift) * sc.repC;
  return { hz: hzOf(baseHz, (frame === 'relative' ? sc.rootC : 0) + relC), abs: sc.rootC + relC };
}

/** The repeat of each source's generator, built once per source object (a field build is not cheap). */
const sourceReps = new WeakMap<object, number>();

/** `linkedScale` for a shelf chord, building its source generator's repeat once (cached per source). Null as `linkedScale` is. */
export function linkedScaleOf(
  chord: ShelfChord | undefined,
  mode: LinkedRoot = 'transpose'
): LinkedScale | null {
  const src = chord?.source;
  if (!chord || !src) {
    return null;
  }
  let repC = sourceReps.get(src);
  if (repC === undefined) {
    const g = generateField(src.gen);
    repC = g.ok ? g.rep.c : 0;
    sourceReps.set(src, repC);
  }
  return linkedScale(chord, repC, mode);
}
