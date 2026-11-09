/**
 * Fourier view of a pitch-class set. Component k wraps the twelve pitch classes around the circle k times;
 * its power says how strongly the set clusters at that period. |F_k|^2 = n + 2 * sum_{d=1..6} IC_d cos(pi k d / 6),
 * so the six powers are a linear function of the interval vector.
 */

export const SPECTRUM_COMPONENTS: { id: string; name: string; hint: string }[] = [
  { id: 'f1', name: 'Cluster', hint: 'Notes bunched in one region of the octave' },
  { id: 'f2', name: 'Tritone', hint: 'Two groups a tritone apart' },
  { id: 'f3', name: 'Augmented', hint: 'Three evenly spaced groups' },
  { id: 'f4', name: 'Diminished', hint: 'Four evenly spaced groups' },
  { id: 'f5', name: 'Diatonic', hint: 'Notes bunched along the circle of fifths' },
  { id: 'f6', name: 'Whole Tone', hint: 'Even against odd pitch classes' },
];

export interface FourierTerm {
  re: number;
  im: number;
  pow: number;
}

/** Component k (1-6) of a set. */
export function fourierTerm(pcs: number[], k: number): FourierTerm {
  let re = 0;
  let im = 0;
  pcs.forEach((p) => {
    const a = (2 * Math.PI * k * p) / 12;
    re += Math.cos(a);
    im += Math.sin(a);
  });
  return { re, im, pow: re * re + im * im };
}

/** Components 1 to 6. */
export const spectrumOf = (pcs: number[]): FourierTerm[] =>
  [1, 2, 3, 4, 5, 6].map((k) => fourierTerm(pcs, k));

/** Signed one-decimal power change with a true minus. */
export const signedPower = (d: number) => `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}`;

/** "f4 +1.0, f2 −1.0" style summary of how a set's power differs from the loaded one; empty if nothing moved. */
export function spectrumChange(from: FourierTerm[], to: FourierTerm[]): string[] {
  const out: string[] = [];
  for (let k = 0; k < 6; k++) {
    const d = to[k].pow - from[k].pow;
    if (Math.abs(d) > 0.05) {
      out.push(`${SPECTRUM_COMPONENTS[k].id} ${signedPower(d)}`);
    }
  }
  return out;
}
