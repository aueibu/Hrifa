/**
 * Chord placement (root mode): turns a chord and a clicked cell into the voiced notes that the
 * picker previews and inserts. Pure: no React, no audio.
 *
 * Register rule (human decision, M4): the clicked pitch is the chord's ROOT tone and stays exactly
 * at the click; inversion and spread put the other voices around it, the inverted ones below. So Am
 * in first inversion at A4 is C4 E4 A4, and C major in first inversion at C4 is E3 G3 C4.
 */
import type { Chord } from './chords';
import { normalizePc } from './pitchSet';
import { voiceChord, type VoicingSpec } from './voicing';

export const DEFAULT_VOICING: VoicingSpec = { inversion: 0, spread: 'close' };

/** The pitch class (an exact EDO step) nearest a pitch in midicents. */
export function pitchClassOf(midicents: number, edo: number): number {
  return normalizePc(midicents / (1200 / edo), edo);
}

/**
 * The spec as it applies to one chord: an inversion past the chord's last one (a triad has two,
 * a seventh chord three) is held at the last, so one global choice works across chords of any size.
 */
export function voicingFor(chord: Chord, spec: VoicingSpec): VoicingSpec {
  return { ...spec, inversion: Math.min(spec.inversion, Math.max(0, chord.steps.length - 1)) };
}

/** A pitch snapped to the nearest step of the EDO grid (identity on the 12-row grid at 12-EDO). */
export function snapToEdo(midicents: number, edo: number): number {
  const step = 1200 / edo;
  return Math.round(midicents / step) * step;
}

/**
 * The chord's pitches in midicents, ascending, with its root tone at the EDO step nearest
 * `anchorMidicents` (a click between steps of a non-12 EDO is snapped first, so the voices sit on
 * exact EDO pitches). Whole-midicent rounding happens later, when notes are added to the packet.
 */
export function voiceAtAnchor(chord: Chord, anchorMidicents: number, spec: VoicingSpec): number[] {
  return voiceChord(
    chord,
    { kind: 'tone', index: 0, midicents: snapToEdo(anchorMidicents, chord.edo) },
    voicingFor(chord, spec)
  ).filter((pitch) => pitch >= 0 && pitch <= 12700);
}

export interface PlacedNote {
  pitchMidicents: number;
  start: number;
  duration: number;
}

/** The notes a chord placed at an anchor makes: one per voice, all at the anchor's onset. */
export function chordNotes(
  chord: Chord,
  anchor: { pitchMidicents: number; start: number },
  spec: VoicingSpec,
  duration: number
): PlacedNote[] {
  return voiceAtAnchor(chord, anchor.pitchMidicents, spec).map((pitchMidicents) => ({
    pitchMidicents,
    start: anchor.start,
    duration,
  }));
}

/** How many inversions the longest chord offers (a triad 3, a seventh 4, a ninth 5). */
export function inversionCount(chords: readonly Chord[]): number {
  return chords.reduce((most, chord) => Math.max(most, chord.steps.length), 0);
}
