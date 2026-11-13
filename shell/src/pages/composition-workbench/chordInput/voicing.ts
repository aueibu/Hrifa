/**
 * Voicing engine: a Chord (exact EDO steps) to ordered ascending midicent pitches.
 * Pure: no UI, no React, no rounding. Pitch = anchor + (step difference) * (1200 / edo),
 * so non-12 EDOs stay exact; the caller may round at the placement edge.
 *
 * Pipeline, all in integer EDO steps:
 *  1. Inversion k (0 = root position). With n tones, r = k mod n and wraps = floor(k / n).
 *     Tone r becomes the bass; every tone with a lower index is raised by whole octaves
 *     (edo steps) until it lies above the bass. That stack is the "close" voicing (smallest
 *     span for the inversion). Chords with 9ths (steps beyond the octave) are handled the
 *     same way; the voices are sorted ascending.
 *  2. Spread style, applied to the close voicing (V0 = lowest ... Vn-1 = highest):
 *     - close: unchanged.
 *     - drop2: Vn-2 (second from the top) moves down one octave. Needs >= 3 voices,
 *       otherwise unchanged.
 *     - drop3: Vn-3 (third from the top) moves down one octave. Needs >= 4 voices,
 *       otherwise unchanged.
 *     - open: the voices at odd positions from the bottom (V1, V3, ...) move up one octave,
 *       so a triad raises its middle voice, a seventh raises 2nd and 4th. Needs >= 2 voices,
 *       otherwise unchanged.
 *     The result is re-sorted ascending.
 *  3. Anchor (the register is fixed by the anchor, not by the inversion):
 *     - { kind: 'bass', midicents }: the LOWEST SOUNDING voice lands at midicents. For close
 *       and open that is the chord's bass tone (root in root position, the inverted bass
 *       otherwise); after a drop voicing the dropped voice is lowest and is the one anchored.
 *     - { kind: 'tone', index, midicents }: chord tone `index` (index into chord.steps,
 *       0 = root) lands exactly at midicents, whatever the inversion or spread.
 *
 *   A 'bass' anchor pins the LOWEST sounding voice and ignores pitch class: the caller must
 *   already know which tone ends up lowest. Root-mode and common-tone placement (M5/M6) must
 *   therefore use a 'tone' anchor (e.g. { kind: 'tone', index: 0, midicents: clickedPitch }
 *   for root mode; chordToneIndex finds the index of a pitch class).
 *
 * Wrapping: an inversion k >= n is the same set of pitch classes as k mod n. Because the
 * anchor fixes the register, the extra octaves cancel and the output equals that of
 * inversion (k mod n); `wraps` only shifts which octave the unanchored stack sits in.
 */
import type { Chord } from './chords';

export type SpreadStyle = 'close' | 'open' | 'drop2' | 'drop3';

const SPREADS: readonly string[] = ['close', 'open', 'drop2', 'drop3'];

/** Index into chord.steps/pcs of the tone with pitch class `pc`. Throws if absent. */
export function chordToneIndex(chord: Chord, pc: number): number {
  const i = chord.pcs.indexOf(pc);
  if (i < 0) {
    throw new RangeError(`pitch class ${pc} is not in the chord`);
  }
  return i;
}

export interface VoicingSpec {
  /**
   * 0 = root position. Inversions >= chord size wrap, but under an anchor the wraps cancel:
   * inversion n + k * size gives the same pitches as inversion n.
   */
  inversion: number;
  spread: SpreadStyle;
}

export type VoicingAnchor =
  | { kind: 'bass'; midicents: number }
  | { kind: 'tone'; index: number; midicents: number };

export interface VoicedTone {
  /** Index into chord.steps (0 = root). */
  index: number;
  midicents: number;
}

interface Voice {
  index: number;
  step: number;
}

const byStep = (a: Voice, b: Voice) => a.step - b.step || a.index - b.index;

/** Close voicing of inversion `inversion`, as ascending voices in steps from the root. */
function closeVoicing(steps: readonly number[], edo: number, inversion: number): Voice[] {
  const n = steps.length;
  const wraps = Math.floor(inversion / n);
  const r = inversion % n;
  const bass = steps[r];
  const voices = steps.map((step, index): Voice => {
    let s = step;
    if (index < r && s <= bass) {
      s += edo * Math.ceil((bass - s + 1) / edo);
    }
    return { index, step: s + wraps * edo };
  });
  return voices.sort(byStep);
}

function spreadVoicing(voices: Voice[], edo: number, spread: SpreadStyle): Voice[] {
  const n = voices.length;
  const out = voices.map((v) => ({ ...v }));
  if (spread === 'drop2' && n >= 3) {
    out[n - 2].step -= edo;
  } else if (spread === 'drop3' && n >= 4) {
    out[n - 3].step -= edo;
  } else if (spread === 'open') {
    for (let i = 1; i < n; i += 2) {
      out[i].step += edo;
    }
  }
  return out.sort(byStep);
}

/** Like voiceChord, but keeps each voice's chord-tone index. Ascending by pitch. */
export function voiceChordTones(
  chord: Chord,
  anchor: VoicingAnchor,
  spec: VoicingSpec
): VoicedTone[] {
  const { steps, edo } = chord;
  const n = steps.length;
  if (!Number.isInteger(edo) || edo <= 0) {
    throw new RangeError(`edo must be a positive integer, got ${edo}`);
  }
  if (!SPREADS.includes(spec.spread)) {
    throw new RangeError(`unknown spread style ${String(spec.spread)}`);
  }
  for (let i = 1; i < n; i++) {
    if (!(steps[i] > steps[i - 1])) {
      throw new RangeError('chord steps must be strictly ascending');
    }
  }
  if (n === 0) {
    return [];
  }
  if (!Number.isInteger(spec.inversion) || spec.inversion < 0) {
    throw new RangeError(`inversion must be a non-negative integer, got ${spec.inversion}`);
  }
  const voices = spreadVoicing(closeVoicing(steps, edo, spec.inversion), edo, spec.spread);
  let anchorStep: number;
  if (anchor.kind === 'bass') {
    anchorStep = voices[0].step;
  } else {
    const found = voices.find((v) => v.index === anchor.index);
    if (!found) {
      throw new RangeError(`tone index ${anchor.index} is not in the chord`);
    }
    anchorStep = found.step;
  }
  const stepCents = 1200 / edo;
  return voices.map((v) => ({
    index: v.index,
    midicents: anchor.midicents + (v.step - anchorStep) * stepCents,
  }));
}

/** Ordered ascending midicent pitches (unrounded) for `chord` voiced per `spec`. */
export function voiceChord(chord: Chord, anchor: VoicingAnchor, spec: VoicingSpec): number[] {
  return voiceChordTones(chord, anchor, spec).map((t) => t.midicents);
}
