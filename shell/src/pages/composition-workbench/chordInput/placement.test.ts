import { describe, expect, it } from 'vitest';
import { chordsOnRoot, type Chord } from './chords';
import { makePitchSet } from './pitchSet';
import { chordNotes, inversionCount, pitchClassOf, voiceAtAnchor, voicingFor } from './placement';

const cMajor = makePitchSet(12, [0, 2, 4, 5, 7, 9, 11]);
const chord = (root: number, name: string): Chord => {
  const found = chordsOnRoot(cMajor, root).find((entry) => entry.name === name);
  if (!found) {
    throw new Error(`${name} is not offered on ${root}`);
  }
  return found;
};
const close = (inversion: number) => ({ inversion, spread: 'close' as const });

describe('chord placement (root mode)', () => {
  it('keeps the clicked pitch as the root tone in root position', () => {
    expect(voiceAtAnchor(chord(0, 'C'), 6000, close(0))).toEqual([6000, 6400, 6700]);
  });

  it('puts the other voices below the click under inversion: C major first inversion at C4', () => {
    // E and G below the C, the C exactly at the click.
    expect(voiceAtAnchor(chord(0, 'C'), 6000, close(1))).toEqual([5200, 5500, 6000]);
  });

  it('Am first inversion at A4 is C4 E4 A4', () => {
    expect(voiceAtAnchor(chord(9, 'Am'), 6900, close(1))).toEqual([6000, 6400, 6900]);
  });

  it('second inversion: G3 C4 E4, the root still exactly at the click', () => {
    expect(voiceAtAnchor(chord(0, 'C'), 6000, close(2))).toEqual([5500, 6000, 6400]);
  });

  it('an inversion past the last one is held at the last (a triad has 0 to 2)', () => {
    const triad = chord(0, 'C');
    expect(voicingFor(triad, close(4)).inversion).toBe(2);
    expect(voiceAtAnchor(triad, 6000, close(4))).toEqual(voiceAtAnchor(triad, 6000, close(2)));
    expect(inversionCount([triad, chord(0, 'Cmaj7')])).toBe(4);
  });

  it('notes carry the anchor onset and the given length, one per voice', () => {
    expect(chordNotes(chord(0, 'C'), { pitchMidicents: 6000, start: 1.5 }, close(0), 0.5)).toEqual([
      { pitchMidicents: 6000, start: 1.5, duration: 0.5 },
      { pitchMidicents: 6400, start: 1.5, duration: 0.5 },
      { pitchMidicents: 6700, start: 1.5, duration: 0.5 },
    ]);
  });

  it('drops voices that would fall outside the pitch range instead of clamping them onto each other', () => {
    expect(voiceAtAnchor(chord(0, 'C'), 12700, close(0))).toEqual([12700]);
  });

  it('converts the click to the nearest EDO step', () => {
    expect(pitchClassOf(6900, 12)).toBe(9);
    expect(pitchClassOf(6900, 24)).toBe(18);
    expect(pitchClassOf(0, 12)).toBe(0);
  });
});

describe('chord placement in a non-12 EDO', () => {
  const edo19 = makePitchSet(
    19,
    Array.from({ length: 19 }, (_unused, pc) => pc)
  );
  const step = 1200 / 19;

  it('snaps a click between steps to the nearest 19-EDO step before voicing', () => {
    // 6100 midicents is 96.6 steps up: nearest step 97, at 97 * step.
    const anchor = Math.round(6100 / step) * step;
    const root = pitchClassOf(6100, 19);
    expect(root).toBe(97 % 19);
    const offered = chordsOnRoot(edo19, root);
    expect(offered.length).toBeGreaterThan(0);
    const voiced = voiceAtAnchor(offered[0], 6100, close(0));
    expect(voiced[0]).toBeCloseTo(anchor, 6);
    // Every voice is an exact multiple of the 19-EDO step. (addNotes later rounds to whole midicents.)
    voiced.forEach((pitch) => expect(pitch / step).toBeCloseTo(Math.round(pitch / step), 6));
  });
});
