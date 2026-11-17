/**
 * M7c-a: the preview root and the ring data of a library chord. The numbers are the rows of SCENARIOS.M7c.md (field = the
 * 5-limit major scale, computed by script there); the readout uses the true minus sign (U+2212) of the chord chips.
 */
import { describe, expect, it } from 'vitest';
import { centsNote, parseInterval, ratioNote } from './intervals';
import { errorBand, libraryRing, previewRoot } from './libraryRing';
import type { Note } from './types';

const note = (s: string): Note => parseInterval(s) as Note;
const FIELD = ['1/1', '9/8', '5/4', '4/3', '3/2', '5/3', '15/8'].map(note);
const REP = ratioNote(2, 1);
const ring = (text: string, root: string, compare: readonly Note[] = FIELD) =>
  libraryRing(text, note(root), REP, compare)!;

describe('previewRoot (rows 1 to 6)', () => {
  // 10:12:15 is found on 5/4 (field index 2) and 5/3 (index 5)
  const found = [2, 5];

  it('row 1: found on several roots, nothing selected: the lowest', () => {
    const r = previewRoot(found, null, FIELD);
    expect(r).toMatchObject({ idx: 2, source: 'found' });
    expect(r.root).toBe(FIELD[2]);
  });
  it('row 2: the stepper root is one of them: that one', () => {
    expect(previewRoot(found, 5, FIELD)).toMatchObject({ idx: 5, source: 'found' });
  });
  it('row 3: the stepper root is 1/1, not one of them: the lowest of them', () => {
    expect(previewRoot(found, 0, FIELD)).toMatchObject({ idx: 2, source: 'found' });
  });
  it('the lowest is by pitch, not by the order Check lists the hits in', () => {
    expect(previewRoot([5, 2], null, FIELD).idx).toBe(2);
    expect(previewRoot([6, 4], 1, FIELD).idx).toBe(4);
  });
  it('row 4: not found, stepper root 1/1: 1/1', () => {
    expect(previewRoot([], 0, FIELD)).toMatchObject({ idx: 0, source: 'stepper' });
  });
  it('row 5: not found, stepper root 5/4: 5/4', () => {
    const r = previewRoot([], 2, FIELD);
    expect(r).toMatchObject({ idx: 2, source: 'stepper' });
    expect(r.root).toBe(FIELD[2]);
  });
  it('row 6: not found and nothing selected: 1/1 (its field index when the field has it)', () => {
    const r = previewRoot([], null, FIELD);
    expect(r).toMatchObject({ idx: 0, source: 'default' });
    expect(r.root.c).toBe(0);
    expect(previewRoot([], null, FIELD.slice(1))).toMatchObject({ idx: null, source: 'default' });
    expect(previewRoot([], null, [])).toMatchObject({ idx: null, source: 'default' });
  });
  it('a found or stepper index outside the field is ignored', () => {
    expect(previewRoot([99], 98, FIELD)).toMatchObject({ source: 'default' });
    expect(previewRoot([99, 5], 98, FIELD)).toMatchObject({ idx: 5, source: 'found' });
  });
});

describe('errorBand', () => {
  it('has the thresholds of the lab severity: exact under 1e-6, then 5, 15, 30 c', () => {
    expect([0, 1e-7, 0.5, 4.99, 5, 14.99, 15, 29.99, 30, 500].map(errorBand)).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3, 4, 4,
    ]);
  });
});

describe('libraryRing against the whole field', () => {
  it('row 1: 10:12:15 on 5/4 is three exact notes, no flags', () => {
    const r = ring('10:12:15', '5/4');
    expect(r.readout).toEqual(['1 is exact', '6/5 is exact', '3/2 is exact']);
    expect(r.notes.map((n) => n.direction)).toEqual(['exact', 'exact', 'exact']);
    expect(r.notes.map((n) => n.band)).toEqual([0, 0, 0]);
    expect(r.notes.map((n) => n.err)).toEqual([0, 0, 0]);
    expect(r.notes.map((n) => n.pitch)).toEqual(['5/4', '3/2', '15/8']);
    expect(r.notes.map((n) => n.folded)).toEqual([
      expect.closeTo(386.3137, 3),
      expect.closeTo(701.955, 3),
      expect.closeTo(1088.2687, 3),
    ]);
    expect(r.dots).toHaveLength(3);
  });

  it('row 4: 4:5:6:7 on 1/1, 7/4 is orange with a flag back to 5/3', () => {
    const r = ring('4:5:6:7', '1/1');
    expect(r.notes.map((n) => n.ratio)).toEqual(['1', '5/4', '3/2', '7/4']);
    expect(r.notes.map((n) => n.direction)).toEqual(['exact', 'exact', 'exact', 'above']);
    const seven = r.notes[3];
    expect(seven.folded).toBeCloseTo(968.826, 2);
    expect(seven.err).toBeCloseTo(84.467, 2);
    expect(seven.near).toBe('5/3');
    expect(seven.nearIdx).toBe(5);
    expect(seven.band).toBe(4);
    expect(seven.line).toBe('7/4 is +84.5 c from 5/3');
    expect(r.readout.slice(0, 3)).toEqual(['1 is exact', '5/4 is exact', '3/2 is exact']);
  });

  it('row 5: the same chord on 5/4: 25/16 orange to 3/2, 35/32 teal to 9/8, exact pitches kept', () => {
    const r = ring('4:5:6:7', '5/4');
    expect(r.notes.map((n) => n.pitch)).toEqual(['5/4', '25/16', '15/8', '35/32']);
    expect(r.notes.map((n) => n.folded)).toEqual([
      expect.closeTo(386.3, 1),
      expect.closeTo(772.6, 1),
      expect.closeTo(1088.3, 1),
      expect.closeTo(155.1, 1),
    ]);
    expect(r.notes.map((n) => n.direction)).toEqual(['exact', 'above', 'exact', 'below']);
    expect(r.notes[1].near).toBe('3/2');
    expect(r.notes[1].line).toBe('5/4 is +70.7 c from 3/2');
    expect(r.notes[3].near).toBe('9/8');
    expect(r.notes[3].line).toBe('7/4 is −48.8 c from 9/8');
    expect(r.notes[1].band).toBe(4);
    expect(r.notes[3].band).toBe(4);
    // hold 1 sounds the exact pitches with their real octave: 35/16 is above 2/1
    expect(r.pitches).toEqual([
      expect.closeTo(386.3, 1),
      expect.closeTo(772.6, 1),
      expect.closeTo(1088.3, 1),
      expect.closeTo(1355.1, 1),
    ]);
    expect(r.pitches[3]).toBeGreaterThan(1200);
  });

  it('row 7: 8:10:12:13, 13/8 is teal to 5/3', () => {
    const n = ring('8:10:12:13', '1/1').notes[3];
    expect(n.folded).toBeCloseTo(840.5, 1);
    expect(n.direction).toBe('below');
    expect(n.line).toBe('13/8 is −43.8 c from 5/3');
  });

  it('row 8: 6:7:9, 7/6 is orange to 9/8 and 3/2 is exact', () => {
    const r = ring('6:7:9', '1/1');
    expect(r.notes[1].folded).toBeCloseTo(266.9, 1);
    expect(r.notes[1].direction).toBe('above');
    expect(r.notes[1].line).toBe('7/6 is +63.0 c from 9/8');
    expect(r.notes[2].line).toBe('3/2 is exact');
  });

  it('a note a hair off a field note (within the 0.5 c match) reads exact, as the Sketch row does', () => {
    const r = libraryRing('1:2', centsNote(0), REP, [centsNote(0), centsNote(0.3)])!;
    expect(r.notes.map((n) => n.direction)).toEqual(['exact', 'exact']);
  });

  it('the error wraps on the repeat: 1/1 against only 15/8 is 111.7 c above it', () => {
    const n = libraryRing('4:5', note('1/1'), REP, [note('15/8')])!.notes[0];
    expect(n.direction).toBe('above');
    expect(n.err).toBeCloseTo(111.731, 2);
    expect(n.line).toBe('1 is +111.7 c from 15/8');
  });
});

describe('libraryRing against the subset (row 9)', () => {
  const subset = [note('1/1'), note('3/2')];
  it('7/6 is compared with 1/1 and 3/2: nearest 1/1, +266.9 c', () => {
    const r = ring('6:7:9', '1/1', subset);
    expect(r.notes[1]).toMatchObject({ near: '1/1', nearIdx: 0, direction: 'above', band: 4 });
    expect(r.notes[1].err).toBeCloseTo(266.871, 2);
    expect(r.notes[1].line).toBe('7/6 is +266.9 c from 1/1');
    // back on the field it is +63.0 from 9/8 again
    expect(ring('6:7:9', '1/1').notes[1].line).toBe('7/6 is +63.0 c from 9/8');
  });
  it('an empty comparison set has nothing to compare with', () => {
    const r = ring('4:5:6', '1/1', []);
    expect(r.notes.map((n) => n.direction)).toEqual(['none', 'none', 'none']);
    expect(r.notes[1]).toMatchObject({ err: null, band: null, near: null, nearIdx: null });
    expect(r.readout[1]).toBe('5/4 has no note to compare with');
  });
});

describe('libraryRing against 12-EDO (row 10)', () => {
  const edo = Array.from({ length: 12 }, (_, k) => centsNote(100 * k));
  it('3/2 is orange +2.0 c from the 700 note, 5/4 teal -13.7 c from 400', () => {
    const r = ring('4:5:6', '1/1', edo);
    // EDO notes have no ratio, so they are named as the Sketch row names them: cents to one decimal
    expect(r.notes[2]).toMatchObject({ direction: 'above', band: 1, near: '700.0 c' });
    expect(r.notes[2].line).toBe('3/2 is +2.0 c from 700.0 c');
    expect(r.notes[1]).toMatchObject({ direction: 'below', band: 2, near: '400.0 c' });
    expect(r.notes[1].line).toBe('5/4 is −13.7 c from 400.0 c');
    expect(r.notes[0].direction).toBe('exact');
  });
});

describe('a folding chord (row 13)', () => {
  it('1:2:3 draws one dot at 1/1 labeled `1, 2` and one at 3/2; the readout keeps a line per ratio', () => {
    const r = ring('1:2:3', '1/1');
    expect(r.notes.map((n) => n.ratio)).toEqual(['1', '2', '3']);
    expect(r.dots.map((d) => d.label)).toEqual(['1, 2', '3']);
    expect(r.dots[0].notes).toEqual([0, 1]);
    expect(r.dots[0].folded).toBe(0);
    expect(r.dots[1].folded).toBeCloseTo(701.955, 3);
    expect(r.readout).toEqual(['1 is exact', '2 is exact', '3 is exact']);
    // the sound keeps the real octaves
    expect(r.pitches).toEqual([0, 1200, expect.closeTo(1901.955, 3)]);
  });
  it('merged dots keep the first note’s flag', () => {
    // 1/1 against a field with only 9/8: both the 1 and the 2 sit 203.9 c below it
    const r = libraryRing('1:2:3', note('1/1'), REP, [note('9/8')])!;
    expect(r.dots[0]).toMatchObject({ label: '1, 2', direction: 'below', near: '9/8' });
    expect(r.dots[0].err).toBeCloseTo(-203.91, 2);
  });
  it('an octave folds onto the root even when the float sum is a hair under the repeat', () => {
    const r = libraryRing('1:2', ratioNote(3, 2), REP, FIELD)!;
    // 3/2 and 3/1 are one pitch class
    expect(r.dots).toHaveLength(1);
    expect(r.dots[0].label).toBe('1, 2');
  });
});

describe('libraryRing rounded (M7e: what hold 4 sounds, scenario rows 2, 6, 8)', () => {
  const ROUND_FIELD = FIELD.map((n) => n.c);
  const close = (got: number[], want: number[]) => {
    expect(got).toHaveLength(want.length);
    want.forEach((w, i) => expect(got[i]).toBeCloseTo(w, 2));
  };

  it('row 6: 4:5:6:7 from 5/4 in the major scale rounds to 5/4, 3/2, 15/8 and 9/8 an octave up', () => {
    const r = ring('4:5:6:7', '5/4');
    close(r.rounded, [ROUND_FIELD[2], ROUND_FIELD[4], ROUND_FIELD[6], ROUND_FIELD[1] + 1200]);
    // the exact pitches are untouched (hold 5)
    expect(r.pitches[3]).toBeCloseTo(1355.1, 1);
    expect(r.rounded[3]).toBeGreaterThan(1200);
  });

  it('is the exact pitch minus the signed error, note by note', () => {
    for (const [text, root] of [
      ['4:5:6:7', '5/4'],
      ['6:7:9', '1/1'],
      ['8:10:12:13', '3/2'],
    ]) {
      const r = ring(text, root);
      r.notes.forEach((n, i) => expect(r.rounded[i]).toBeCloseTo(n.cents - (n.err ?? 0), 6));
    }
  });

  it('row 8: 4:5:6:7 on 1/1: on the field 7/4 rounds to 5/3, on the subset 1/1, 5/4, 3/2 it rounds to 2/1', () => {
    const subset = [note('1/1'), note('5/4'), note('3/2')];
    close(ring('4:5:6:7', '1/1').rounded, [0, 386.31, 701.96, 884.36]);
    close(ring('4:5:6:7', '1/1', subset).rounded, [0, 386.31, 701.96, 1200]);
    // 7/4 is 231.2 c from 2/1 and 267 c from 3/2: the nearest wins
    expect(ring('4:5:6:7', '1/1', subset).notes[3].err).toBeCloseTo(-231.17, 1);
  });

  it('row 2: 10:12:15 on 9/8 rounds to 9/8, 4/3, 5/3 (the exact notes are 21.5 c above 4/3 and 5/3)', () => {
    const r = ring('10:12:15', '9/8');
    close(r.rounded, [ROUND_FIELD[1], ROUND_FIELD[3], ROUND_FIELD[5]]);
    expect(r.pitches[1] - r.rounded[1]).toBeCloseTo(21.51, 1);
  });

  it('an empty comparison set rounds nothing: the exact pitches', () => {
    const r = ring('4:5:6:7', '5/4', []);
    expect(r.rounded).toEqual(r.pitches);
  });

  it('a folding chord rounds too, with its real octaves (never silent)', () => {
    close(ring('1:2:3', '1/1').rounded, [0, 1200, 1901.955]);
  });

  it('a note within the 0.5 c match snaps onto the field note it matched', () => {
    const r = libraryRing('1:2', centsNote(0), REP, [centsNote(0.3)])!;
    close(r.rounded, [0.3, 1200.3]);
  });
});

describe('libraryRing other shapes', () => {
  it('an undertone entry is placed like its pitch set (lowest note the root)', () => {
    const r = ring('1/(4:5:6)', '1/1');
    expect(r.notes.map((n) => n.ratio)).toEqual(['1', '6/5', '3/2']);
    // 6/5 is not in the field: 70.7 c under 5/4
    expect(r.notes.map((n) => n.direction)).toEqual(['exact', 'below', 'exact']);
    expect(r.notes[1].line).toBe('6/5 is −70.7 c from 5/4');
  });
  it('a text that does not parse gives null', () => {
    expect(libraryRing('nonsense', note('1/1'), REP, FIELD)).toBeNull();
  });
});
