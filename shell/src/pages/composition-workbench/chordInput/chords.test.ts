import { describe, expect, it } from 'vitest';
import { pitchClassName } from '../pitch';
import { chordsOnRoot, chordsWithCommonTone, findChords } from './chords';
import { CHORD_LIBRARY_12 } from './chordTemplates';
import { addPitch, makePitchSet, presetPitchSet, togglePitch } from './pitchSet';

const A = 9;
const cMajor = presetPitchSet('major', 0);

function names(chords: { name: string }[]) {
  return chords.map((chord) => chord.name);
}

describe('pitchSet presets', () => {
  it('builds major, minor and modes from 12-EDO patterns', () => {
    expect(cMajor.pcs).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(presetPitchSet('natural-minor', 9).pcs).toEqual(cMajor.pcs);
    expect(presetPitchSet('dorian', 2).pcs).toEqual(cMajor.pcs);
    expect(presetPitchSet('major-pentatonic', 0).pcs).toEqual([0, 2, 4, 7, 9]);
    expect(presetPitchSet('chromatic').pcs).toHaveLength(12);
  });

  it('toggles pitches and falls back to chromatic off 12-EDO', () => {
    expect(togglePitch(cMajor, 6).pcs).toContain(6);
    expect(togglePitch(togglePitch(cMajor, 6), 6)).toEqual(cMajor);
    expect(presetPitchSet('major', 0, 19).pcs).toHaveLength(19);
  });
});

describe('chordsOnRoot', () => {
  it('offers the library chords on A in C major with the right pitches', () => {
    const chords = chordsOnRoot(cMajor, A);
    const byName = Object.fromEntries(chords.map((chord) => [chord.name, chord.pcs]));
    expect(byName).toMatchObject({
      Am: [9, 0, 4],
      A5: [9, 4],
      Am7: [9, 0, 4, 7],
      Am9: [9, 0, 4, 7, 11],
      Asus2: [9, 11, 4],
      Asus4: [9, 2, 4],
      Amadd9: [9, 0, 4, 11],
    });
    expect(names(chords)).toEqual(['Am', 'A5', 'Asus2', 'Asus4', 'Am7', 'Am9', 'Amadd9']);
  });

  it('returns copies: mutating a chord does not corrupt the library or later results', () => {
    const first = chordsOnRoot(cMajor, A)[0];
    first.steps.push(99);
    first.roles.push('9th');
    first.pcs.push(99);
    const again = chordsOnRoot(cMajor, A)[0];
    expect(again.steps).toEqual([0, 3, 7]);
    expect(again.roles).toEqual(['root', '3rd', '5th']);
    expect(again.pcs).toEqual([9, 0, 4]);
    expect(Object.isFrozen(CHORD_LIBRARY_12)).toBe(true);
    expect(Object.isFrozen(CHORD_LIBRARY_12[0])).toBe(true);
    expect(Object.isFrozen(CHORD_LIBRARY_12[0].steps)).toBe(true);
  });

  // Aadd9 (A C# E B) and Am6 (A C E F#) contain C# / F#, which are not in C major.
  it('excludes chords with tones outside the set', () => {
    const chords = names(chordsOnRoot(cMajor, A));
    expect(chords).not.toContain('Aadd9');
    expect(chords).not.toContain('Am6');
    const withCsFs = makePitchSet(12, [...cMajor.pcs, 1, 6]);
    expect(names(chordsOnRoot(withCsFs, A))).toEqual(expect.arrayContaining(['Aadd9', 'Am6']));
  });

  it('offers both D and Dm when F# is added to C major', () => {
    const set = addPitch(cMajor, 6);
    const chords = chordsOnRoot(set, 2);
    expect(chords.find((chord) => chord.name === 'D')?.pcs).toEqual([2, 6, 9]);
    expect(chords.find((chord) => chord.name === 'Dm')?.pcs).toEqual([2, 5, 9]);
  });
});

describe('chordsWithCommonTone', () => {
  const column = (cols: ReturnType<typeof chordsWithCommonTone>, role: string) =>
    names(cols.find((col) => col.role === role)?.chords ?? []);

  it('groups by role in C major for A', () => {
    const cols = chordsWithCommonTone(cMajor, A);
    expect(column(cols, '5th')).toEqual(expect.arrayContaining(['Dm', 'Dm7', 'Dm9']));
    expect(column(cols, 'root')).toContain('Am');
    expect(column(cols, '3rd')).toEqual(expect.arrayContaining(['F', 'Fmaj7']));
    expect(cols.map((col) => col.role)).toEqual(
      [...cols.map((col) => col.role)].sort(
        (a, b) =>
          ['root', '2nd', '3rd', '4th', '5th', '6th', '7th', '9th'].indexOf(a) -
          ['root', '2nd', '3rd', '4th', '5th', '6th', '7th', '9th'].indexOf(b)
      )
    );
  });

  it('lists D and Dm under 5th for A when F# is added', () => {
    const cols = chordsWithCommonTone(addPitch(cMajor, 6), A);
    expect(column(cols, '5th')).toEqual(expect.arrayContaining(['D', 'Dm']));
  });

  it('shares the engine with root mode', () => {
    const viaRoot = names(chordsOnRoot(cMajor, A));
    const viaFind = names(findChords(cMajor, { root: A }));
    expect(viaRoot).toEqual(viaFind);
    const rootColumn = chordsWithCommonTone(cMajor, A).find((col) => col.role === 'root');
    expect(names(rootColumn?.chords ?? [])).toEqual(viaRoot);
  });
});

describe('non-12 EDO degree stacking', () => {
  const set19 = makePitchSet(19, [0, 3, 6, 8, 11, 14, 17]);
  const set31 = makePitchSet(31, [0, 5, 10, 13, 18, 23, 28]);

  it('stacks by degree with step-based names at 19-EDO', () => {
    const chords = chordsOnRoot(set19, 0);
    expect(chords.map((chord) => chord.steps)).toEqual([
      [0, 6, 11],
      [0, 6, 11, 17],
      [0, 6, 11, 17, 22],
    ]);
    expect(chords[0].pcs).toEqual([0, 6, 11]);
    expect(chords[2].pcs).toEqual([0, 6, 11, 17, 3]);
    expect(chords[0].name).toBe(`${pitchClassName(0, 19)}[0-6-11]`);
    expect(chordsOnRoot(set19, 3)[0].name).toBe(`${pitchClassName(3, 19)}[0-5-11]`);
    expect(chords[2].roles).toEqual(['root', '3rd', '5th', '7th', '9th']);
  });

  it('does not throw at 31-EDO, in either mode, with small and chromatic sets', () => {
    expect(chordsOnRoot(set31, 13).length).toBeGreaterThan(0);
    expect(chordsWithCommonTone(set31, 13).length).toBeGreaterThan(0);
    expect(() => chordsWithCommonTone(presetPitchSet('chromatic', 0, 31), 4)).not.toThrow();
    expect(chordsOnRoot(makePitchSet(19, [0, 5]), 0)).toEqual([]);
    expect(chordsOnRoot(set19, 1)).toEqual([]);
  });
});
