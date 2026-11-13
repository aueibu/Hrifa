/**
 * PitchSet: the set of pitch classes ("key") that chord input offers chords from.
 *
 * Representation (shared contract, see DECISIONS): ABSOLUTE pitch classes, integers in
 * 0..edo-1 in exact EDO steps, sorted ascending and unique, plus the `edo`. Pitch class 0 is
 * C at 12-EDO (same convention as pitch.ts `pitchClassName`). Presets take a tonic pitch class
 * and are shortcuts that fill the set; after that the set is just pitches (toggle any on or off).
 *
 * (scaleConstruction.realizePitchClasses takes successive interval sizes, not offsets, so it is not reused.)
 * Presets are defined by 12-EDO step patterns. For any other EDO only `chromatic` is
 * defined: other presets fall back to chromatic (all pitches), because no standard
 * diatonic pattern exists there and picking one is a musical decision. Callers can build any
 * set with `makePitchSet` or `togglePitch`.
 */
import { pitchClassName } from '../pitch';

export interface PitchSet {
  edo: number;
  /** Absolute pitch classes, sorted ascending, unique, each in 0..edo-1. */
  pcs: number[];
}

export const PITCH_SET_PRESETS = [
  'major',
  'natural-minor',
  'harmonic-minor',
  'melodic-minor',
  'dorian',
  'phrygian',
  'lydian',
  'mixolydian',
  'locrian',
  'major-pentatonic',
  'minor-pentatonic',
  'chromatic',
] as const;

export type PitchSetPreset = (typeof PITCH_SET_PRESETS)[number];

/** 12-EDO step patterns (offsets from the tonic). */
const PRESET_STEPS_12: Record<Exclude<PitchSetPreset, 'chromatic'>, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  'natural-minor': [0, 2, 3, 5, 7, 8, 10],
  'harmonic-minor': [0, 2, 3, 5, 7, 8, 11],
  'melodic-minor': [0, 2, 3, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
  'major-pentatonic': [0, 2, 4, 7, 9],
  'minor-pentatonic': [0, 3, 5, 7, 10],
};

export function normalizePc(pc: number, edo: number): number {
  return ((Math.round(pc) % edo) + edo) % edo;
}

export function makePitchSet(edo: number, pcs: number[]): PitchSet {
  const unique = new Set(pcs.map((pc) => normalizePc(pc, edo)));
  return { edo, pcs: [...unique].sort((a, b) => a - b) };
}

export function chromaticSet(edo: number): PitchSet {
  return { edo, pcs: Array.from({ length: edo }, (_, i) => i) };
}

export function presetPitchSet(preset: PitchSetPreset, tonic = 0, edo = 12): PitchSet {
  if (preset === 'chromatic' || edo !== 12) {
    return chromaticSet(edo);
  }
  return makePitchSet(
    edo,
    PRESET_STEPS_12[preset].map((step) => tonic + step)
  );
}

export function hasPitch(set: PitchSet, pc: number): boolean {
  return set.pcs.includes(normalizePc(pc, set.edo));
}

export function addPitch(set: PitchSet, pc: number): PitchSet {
  return makePitchSet(set.edo, [...set.pcs, pc]);
}

export function removePitch(set: PitchSet, pc: number): PitchSet {
  const target = normalizePc(pc, set.edo);
  return { edo: set.edo, pcs: set.pcs.filter((value) => value !== target) };
}

export function togglePitch(set: PitchSet, pc: number): PitchSet {
  return hasPitch(set, pc) ? removePitch(set, pc) : addPitch(set, pc);
}

export function pitchSetLabel(set: PitchSet): string {
  return set.pcs.map((pc) => pitchClassName(pc, set.edo)).join(' ');
}
