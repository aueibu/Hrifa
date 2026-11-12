import { markerColorNames } from '../../theme/markers';

/**
 * Scale-degree colours for the note editor. A note's degree is its pitch in steps of the EDO, counted
 * from C and repeating every octave. Its colour is one of the theme's 12 categorical hues, INTERLEAVED
 * (not walked around the wheel) so that neighbouring degrees always read as different, as in Bitwig.
 * There is no tonic setting yet, so C is degree 0.
 *
 * Twelve-slot table (slot = pitch class at 12-EDO), ONE table to edit: C yellow, C# teal, D grape,
 * D# indigo, E green, F orange, F# cyan, G red, G# lime, A blue, A# pink, B violet. The human pinned
 * C yellow, E green, F orange, A blue, A# pink and B violet; the rest keep adjacent pitch classes (B to C included) apart.
 *
 * Other EDOs:
 *  - edo < 12: degree d takes slot round(d * 12 / edo), so the hues are spread over the degrees and
 *    stay distinct (the slot spacing is at least 1).
 *  - edo > 12: degree d takes slot d mod 12, cycling the interleave order, so neighbouring degrees
 *    are always distinct and a hue repeats only after all 12 have been used. If that would make the
 *    last degree share its hue with degree 0 across the octave (edo = 1 mod 12), it takes slot 6.
 */
const HUE_SLOTS = [
  'yellow',
  'teal',
  'grape',
  'indigo',
  'green',
  'orange',
  'cyan',
  'red',
  'lime',
  'blue',
  'pink',
  'violet',
] as const satisfies readonly (typeof markerColorNames)[number][];

/** The step count from C, modulo the octave: `round(midicents * edo / 1200) mod edo`. */
export function scaleDegree(pitchMidicents: number, edo: number): number {
  const steps = Number.isInteger(edo) && edo >= 1 ? edo : 12;
  if (!Number.isFinite(pitchMidicents)) {
    return 0;
  }
  const degree = Math.round((pitchMidicents * steps) / 1200) % steps;
  // JavaScript's remainder keeps the sign, and -0 must not leak out.
  return degree < 0 ? degree + steps : degree + 0;
}

/** The hue name for a degree, by the rule in the file comment. */
export function degreeHueName(degree: number, edo: number): (typeof markerColorNames)[number] {
  const steps = Number.isInteger(edo) && edo >= 1 ? edo : 12;
  const wrapped = ((Math.round(degree) % steps) + steps) % steps;
  if (steps <= 12) {
    return HUE_SLOTS[Math.round((wrapped * 12) / steps) % 12];
  }
  if (wrapped === steps - 1 && wrapped % 12 === 0) {
    return HUE_SLOTS[6];
  }
  return HUE_SLOTS[wrapped % 12];
}

/** The CSS colour (a `--mark-<hue>` role, so it follows the colour scheme) of a pitch's degree. */
export function scaleDegreeColor(pitchMidicents: number, edo: number): string {
  const steps = Number.isInteger(edo) && edo >= 1 ? edo : 12;
  return `var(--mark-${degreeHueName(scaleDegree(pitchMidicents, steps), steps)})`;
}
