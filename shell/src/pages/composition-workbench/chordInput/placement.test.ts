import { describe, expect, it } from 'vitest';
import { chordsOnRoot, findChords, type Chord } from './chords';
import { chromaticSet, makePitchSet } from './pitchSet';
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

describe('chord placement (common-tone mode)', () => {
  const pcOfA = 9;

  it('holds the clicked A exactly at the click as the 5th of Dm (D4 F4 A4)', () => {
    expect(voiceAtAnchor(chord(2, 'Dm'), 6900, close(0), pcOfA)).toEqual([6200, 6500, 6900]);
  });

  it('inversion rotates the chord and the anchored tone stays at the click', () => {
    // First inversion of Dm is F A D: with A held at A4 the F sits below and D above.
    expect(voiceAtAnchor(chord(2, 'Dm'), 6900, close(1), pcOfA)).toEqual([6500, 6900, 7400]);
    // Second inversion A D F: A is the bass, still at the click.
    expect(voiceAtAnchor(chord(2, 'Dm'), 6900, close(2), pcOfA)).toEqual([6900, 7400, 7700]);
  });

  it('with the root as the common tone it equals root mode', () => {
    expect(voiceAtAnchor(chord(9, 'Am'), 6900, close(1), 9)).toEqual(
      voiceAtAnchor(chord(9, 'Am'), 6900, close(1))
    );
  });

  it('keeps the anchored tone at the click under every spread', () => {
    (['close', 'open', 'drop2', 'drop3'] as const).forEach((spread) => {
      const notes = chordNotes(
        chord(2, 'Dm7'),
        { pitchMidicents: 6900, start: 0 },
        { inversion: 1, spread },
        1,
        pcOfA
      );
      expect(notes.map((note) => note.pitchMidicents)).toContain(6900);
    });
  });

  it('works in 19-EDO: the common tone lands exactly on the clicked EDO step', () => {
    const found = findChords(chromaticSet(19), { contains: 11 }).find(
      (entry) => entry.pcs.length === 3
    )!;
    const step = 1200 / 19;
    const click = 6000 + 11 * step;
    const voiced = voiceAtAnchor(found, click, close(1), 11);
    expect(voiced).toHaveLength(3);
    expect(voiced.some((pitch) => Math.abs(pitch - click) < 1e-9)).toBe(true);
    voiced.forEach((pitch) =>
      expect(Math.abs(pitch / step - Math.round(pitch / step))).toBeLessThan(1e-9)
    );
  });
});
