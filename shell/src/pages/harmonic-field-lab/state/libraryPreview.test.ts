/**
 * M7c-b: the placed chord of the library dialog (root rule, ring and hold-1 identity). The 5-limit major scale at
 * tolerance 0, as SCENARIOS.M7c.md; the numbers are its rows.
 */
import { describe, expect, it } from 'vitest';
import {
  libraryEntries,
  parseInterval,
  ratioNote,
  rotateSubset,
  type Note,
} from '../../../lib/harmonic-field';
import {
  compareNotes,
  dotSounds,
  fallbackRoot,
  libraryPreview,
  soundsSignature,
  stepperRootIdx,
  type PreviewBase,
} from './libraryPreview';

const note = (s: string): Note => parseInterval(s) as Note;
const FIELD = ['1/1', '9/8', '5/4', '4/3', '3/2', '5/3', '15/8'].map(note);
const REP = ratioNote(2, 1);
const base = (idx: number[] = [0, 1, 2, 3, 4, 5, 6]): PreviewBase => ({
  field: FIELD,
  rep: REP,
  repC: REP.c,
  idx,
  rel: rotateSubset(FIELD, idx, 0, REP),
  ratios: FIELD.map((n) => n.c.toFixed(1)),
});
const entry = (text: string) => libraryEntries(1200).find((e) => e.text === text)!;

describe('libraryPreview', () => {
  it('row 1: found on 5/4 and 5/3, nothing chosen: the lowest root, exact notes', () => {
    const p = libraryPreview(base(), entry('10:12:15'), null, 0, 'field')!;
    expect(p.root).toMatchObject({ idx: 2, source: 'found' });
    expect(p.ring.notes.map((n) => n.pitch)).toEqual(['5/4', '3/2', '15/8']);
    expect(p.targetKey).toBe(`lib:${entry('10:12:15').key}:2`);
  });

  it('row 2: the stepper root is one of the found roots', () => {
    const p = libraryPreview(base(), entry('10:12:15'), 5, 0, 'field')!;
    expect(p.root.idx).toBe(5);
    expect(p.targetKey.endsWith(':5')).toBe(true);
  });

  it('row 5: not found, the stepper root 5/4: pitches 386.3, 772.6, 1088.3 and 155.1 c', () => {
    const p = libraryPreview(base(), entry('4:5:6:7'), 2, 0, 'field')!;
    expect(p.root).toMatchObject({ idx: 2, source: 'stepper' });
    expect(p.ring.pitches.map((c) => Math.round(c * 10) / 10)).toEqual([
      386.3, 772.6, 1088.3, 1355.1,
    ]);
    expect(p.ring.notes.map((n) => n.direction)).toEqual(['exact', 'above', 'exact', 'below']);
  });

  it('row 13: a folding entry is never checked: the stepper root, and one merged dot for 1 and 2', () => {
    const p = libraryPreview(base(), entry('1:2:3'), 0, 0, 'field')!;
    expect(p.root.source).toBe('stepper');
    expect(p.ring.dots.map((d) => d.label)).toEqual(['1, 2', '3']);
    expect(p.ring.notes[2].pitch).toBe('3/2');
  });

  it('row 9: the comparison set is the whole field or only the subset', () => {
    const sub = base([0, 4]);
    expect(compareNotes(sub, 'field')).toHaveLength(7);
    expect(compareNotes(sub, 'subset')).toEqual([FIELD[0], FIELD[4]]);
    const f = libraryPreview(sub, entry('6:7:9'), 0, 0, 'field')!;
    const s = libraryPreview(sub, entry('6:7:9'), 0, 0, 'subset')!;
    expect(f.ring.notes[1].near).toBe('9/8');
    expect(s.ring.notes[1].near).toBe('1/1');
    expect(s.ring.notes[1].err).toBeCloseTo(266.87, 1);
  });

  it('M7d row 3: a root override places the chord on that found root (ring, pitches and hold-1 key)', () => {
    // tolerance 25: 10:12:15 is found on 9/8 (index 1), 5/4 (2) and 5/3 (5); the default is the lowest, 9/8
    const e = entry('10:12:15');
    expect(libraryPreview(base(), e, null, 25, 'field')!.root.idx).toBe(1);
    const p = libraryPreview(base(), e, null, 25, 'field', 5)!;
    expect(p.root).toMatchObject({ idx: 5, source: 'found' });
    // 10:12:15 from 5/3: 5/3, 2 (= 5/3 x 6/5) and 5/2, folded into the repeat
    expect(p.ring.notes.map((n) => n.pitch)).toEqual(['5/3', '1/1', '5/4']);
    expect(p.targetKey).toBe(`lib:${e.key}:5`);
  });

  it('an override that is not a found root, or null, changes nothing', () => {
    const e = entry('10:12:15');
    const plain = libraryPreview(base(), e, null, 25, 'field')!;
    // 1/1 (index 0) is not a root of the minor triad
    expect(libraryPreview(base(), e, null, 25, 'field', 0)).toEqual(plain);
    expect(libraryPreview(base(), e, null, 25, 'field', null)).toEqual(plain);
    expect(libraryPreview(base(), e, null, 25, 'field', 99)).toEqual(plain);
    // a folding entry is never checked: the override is ignored
    const fold = libraryPreview(base(), entry('1:2:3'), 0, 0, 'field')!;
    expect(libraryPreview(base(), entry('1:2:3'), 0, 0, 'field', 3)).toEqual(fold);
  });

  it('stepperRootIdx wraps the degree and is null for an empty subset', () => {
    expect(stepperRootIdx(base(), 9)).toBe(2);
    expect(stepperRootIdx(base([]), 0)).toBeNull();
  });
});

/**
 * M7e: what hold 1 (own), hold 4 (rounded) and hold 5 (exact) play, against the REAL finder. Figures are the rows of
 * SCENARIOS.M7e.md (5-limit major scale: 1/1 0, 9/8 203.9, 5/4 386.3, 4/3 498.0, 3/2 702.0, 5/3 884.4, 15/8 1088.3 c).
 */
describe('librarySounds (M7e rows 1 to 11)', () => {
  const close = (got: readonly number[], want: number[]) => {
    expect(got).toHaveLength(want.length);
    want.forEach((w, i) => expect(got[i]).toBeCloseTo(w, 1));
  };
  const sounds = (
    text: string,
    o: {
      tol?: number;
      stepper?: number | null;
      cmp?: 'field' | 'subset';
      idx?: number[];
      root?: number | null;
      b?: PreviewBase;
    } = {}
  ) => {
    const p = libraryPreview(
      o.b ?? base(o.idx),
      entry(text),
      o.stepper === undefined ? null : o.stepper,
      o.tol ?? 25,
      o.cmp ?? 'field',
      o.root
    )!;
    return { p, s: p.sounds };
  };

  it('row 1: 10:12:15 at 25 c, default root 9/8: the finder voicing on 9/8 is 9/8, 4/3, 5/3', () => {
    const { p, s } = sounds('10:12:15');
    expect(p.root.idx).toBe(1);
    close(s.own, [203.9, 498.0, 884.4]);
    expect(s.fallback).toBe(false);
  });

  it('row 2 (stepper on the ring root 9/8): hold 4 gives 9/8, 4/3, 5/3 too (the nearest notes)', () => {
    close(sounds('10:12:15', { stepper: 1 }).s.rounded, [203.9, 498.0, 884.4]);
  });

  it('row 3 (stepper on the ring root 9/8): hold 5 is exact: 9/8, 27/20 (519.5 c), 27/16 (905.9 c), 21.5 c above the finder notes', () => {
    const { s } = sounds('10:12:15', { stepper: 1 });
    close(s.exact, [203.9, 519.55, 905.87]);
    expect(s.exact[1] - s.own[1]).toBeCloseTo(21.5, 1);
    expect(s.exact[2] - s.own[2]).toBeCloseTo(21.5, 1);
  });

  it('M7e rows 2 and 3, keys 4 and 5 follow the Sketch stepper: stepper 1/1 (not a found root) plays 1/1, 5/4, 3/2 rounded and 1/1, 6/5, 3/2 exact; key 1 stays on the ring root 9/8', () => {
    const { p, s } = sounds('10:12:15', { stepper: 0 });
    expect(p.root).toMatchObject({ idx: 1, source: 'found' });
    // key 1: the finder's notes on the ring's root 9/8
    close(s.own, [203.9, 498.0, 884.4]);
    // key 4: 6/5 on 1/1 rounds to 5/4 (70.7 c away)
    close(s.rounded, [0, 386.3, 702.0]);
    // key 5: exact, 6/5 = 315.6 c
    close(s.exact, [0, 315.64, 702.0]);
    // the ring and the roots table keep the chord on its own root
    expect(p.ring.root.c).toBeCloseTo(203.9, 1);
    expect(p.ring.pitches[0]).toBeCloseTo(203.9, 1);
  });

  it('M7e row 2: stepper 5/3 (a found root): keys 4 and 5 play 5/3, 1/1, 5/4 in pitch', () => {
    const { p, s } = sounds('10:12:15', { stepper: 5 });
    // 5/3 is a found root, so it is also the ring's root: all keys start there
    expect(p.root.idx).toBe(5);
    close(s.rounded, [884.4, 1200, 1586.3]);
    close(s.exact, [884.4, 1200, 1586.3]);
    close(s.own, [884.4, 1200, 1586.3]);
  });

  it('M7e: the stepper on 3/2 (not a found root): the ring stays on 9/8 and key 1 with it, keys 4 and 5 play from 3/2', () => {
    const { p, s } = sounds('10:12:15', { stepper: 4 });
    expect(p.root.idx).toBe(1);
    close(s.own, [203.9, 498.0, 884.4]);
    // exact from 3/2 (702.0 c): 3/2, 9/5 (1017.6 c), 9/4 (1403.9 c)
    close(s.exact, [701.96, 1017.6, 1403.9]);
    // rounded: 3/2 and 9/4 (= 9/8 an octave up) are field notes; 1017.6 c rounds to 15/8 (1088.3 c, 70.7 c away)
    close(s.rounded, [701.96, 1088.27, 1403.91]);
  });

  it('M7e row 4: a root row (hover or pin) is an explicit choice: all three keys play from it, the stepper is ignored', () => {
    const on53 = sounds('10:12:15', { root: 5, stepper: 0 }).s;
    for (const list of [on53.own, on53.rounded, on53.exact]) {
      close(list, [884.4, 1200, 1586.3]);
    }
    const on54 = sounds('10:12:15', { root: 2, stepper: 5 }).s;
    for (const list of [on54.own, on54.rounded, on54.exact]) {
      close(list, [386.3, 702.0, 1088.3]);
    }
  });

  it('M7e: an empty subset (no stepper root) plays keys 4 and 5 from 1/1', () => {
    const { s } = sounds('10:12:15', { stepper: null, idx: [], cmp: 'subset' });
    close(s.exact, [0, 315.64, 702.0]);
  });

  it('the signature follows the stepper (the held key re-arms when the stepper moves)', () => {
    const a = sounds('10:12:15', { stepper: 0 }).s;
    const b = sounds('10:12:15', { stepper: 4 }).s;
    expect(soundsSignature(a)).not.toBe(soundsSignature(b));
  });

  it('row 4: the pointer on the 5/3 row of the roots table: all three play from 5/3, then from 5/4', () => {
    const on53 = sounds('10:12:15', { root: 5 }).s;
    close(on53.own, [884.4, 1200, 1586.3]);
    close(on53.rounded, [884.4, 1200, 1586.3]);
    close(on53.exact, [884.4, 1200, 1586.3]);
    const on54 = sounds('10:12:15', { root: 2 }).s;
    close(on54.own, [386.3, 702.0, 1088.3]);
    close(on54.exact, [386.3, 702.0, 1088.3]);
  });

  it('row 5: tolerance 0, stepper 5/4, 4:5:6:7 is not found: hold 1 plays the rounded chord on 1/1', () => {
    const { p, s } = sounds('4:5:6:7', { tol: 0, stepper: 2 });
    expect(p.root).toMatchObject({ idx: 2, source: 'stepper' });
    expect(s.fallback).toBe(true);
    // 1/1, 5/4, 3/2 and 7/4 rounded to 5/3 (84.5 c flat)
    close(s.own, [0, 386.3, 702.0, 884.4]);
  });

  it('row 6: hold 4 is rounded from the ring root 5/4: 5/4, 3/2, 15/8, 9/4 (9/8 an octave up)', () => {
    close(sounds('4:5:6:7', { tol: 0, stepper: 2 }).s.rounded, [386.3, 702.0, 1088.3, 1403.9]);
  });

  it('row 7: hold 5 is exact on 5/4: 5/4, 25/16, 15/8, 35/16', () => {
    close(sounds('4:5:6:7', { tol: 0, stepper: 2 }).s.exact, [386.3, 772.6, 1088.3, 1355.1]);
  });

  it('row 8: subset 1/1, 5/4, 3/2 on Subset: not found, 7/4 rounds to 2/1; on Field it rounds to 5/3', () => {
    const sub = sounds('4:5:6:7', { tol: 0, stepper: 0, idx: [0, 2, 4], cmp: 'subset' });
    expect(sub.s.fallback).toBe(true);
    close(sub.s.own, [0, 386.3, 702.0, 1200]);
    const fld = sounds('4:5:6:7', { tol: 0, stepper: 0, idx: [0, 2, 4], cmp: 'field' });
    close(fld.s.own, [0, 386.3, 702.0, 884.4]);
  });

  it('row 9: hold 4 is the same rounding from the ring root 1/1, hold 5 is exact 1/1, 5/4, 3/2, 7/4', () => {
    const { s } = sounds('4:5:6:7', { tol: 0, stepper: 0, idx: [0, 2, 4], cmp: 'subset' });
    close(s.rounded, [0, 386.3, 702.0, 1200]);
    close(s.exact, [0, 386.3, 702.0, 968.8]);
  });

  it('row 10: a field with no 1/1 and a chord not found: hold 1 is rooted on the stepper root', () => {
    const field = FIELD.slice(1);
    const b: PreviewBase = {
      field,
      rep: REP,
      repC: REP.c,
      idx: field.map((_, i) => i),
      rel: rotateSubset(
        field,
        field.map((_, i) => i),
        0,
        REP
      ),
      ratios: field.map((n) => n.c.toFixed(1)),
    };
    // field index 1 is 5/4; the 1/1 note is not there
    expect(fallbackRoot(b, 1)).toBe(field[1]);
    const { s } = sounds('4:5:6:7', { tol: 0, stepper: 1, b });
    expect(s.fallback).toBe(true);
    // 5/4, 25/16 rounded to 3/2, 15/8, 35/16 rounded to 9/8 an octave up
    close(s.own, [386.3, 702.0, 1088.3, 1403.9]);
  });

  it('row 11: a folding row never reads the finder: hold 5 keeps the real octaves, 1 and 4 round and are never empty', () => {
    const { s } = sounds('1:2:3', { tol: 0, stepper: 0 });
    expect(s.fallback).toBe(true);
    close(s.exact, [0, 1200, 1902.0]);
    close(s.rounded, [0, 1200, 1902.0]);
    close(s.own, [0, 1200, 1902.0]);
    // with the stepper on 5/4: hold 4 is rounded from the ring root 5/4, hold 1 from the field's 1/1
    const off = sounds('1:2:3', { tol: 0, stepper: 2 }).s;
    close(off.rounded, [386.3, 1586.3, 2288.3]);
    close(off.own, [0, 1200, 1902.0]);
    close(off.exact, [386.3, 1586.3, 2288.3]);
  });

  it('the fallback root: the field 1/1, else the stepper root, else a plain 1/1 (an empty subset)', () => {
    expect(fallbackRoot(base(), 4)).toBe(FIELD[0]);
    expect(fallbackRoot({ field: FIELD.slice(1) }, 2)).toBe(FIELD[3]);
    expect(fallbackRoot({ field: FIELD.slice(1) }, null).c).toBe(0);
    expect(fallbackRoot({ field: [] }, null).c).toBe(0);
  });

  it('an empty comparison set rounds nothing: hold 1 and 4 play the exact notes (never silent)', () => {
    const { s } = sounds('4:5:6:7', { tol: 0, stepper: 0, idx: [], cmp: 'subset' });
    close(s.rounded, [0, 386.3, 702.0, 968.8]);
    close(s.own, [0, 386.3, 702.0, 968.8]);
  });

  it('the signature changes with the sounds (so a held key follows a change under a resting pointer)', () => {
    const a = sounds('4:5:6:7', { tol: 0, stepper: 0, idx: [0, 2, 4], cmp: 'subset' }).s;
    const b = sounds('4:5:6:7', { tol: 0, stepper: 0, idx: [0, 2, 4], cmp: 'field' }).s;
    expect(soundsSignature(a)).not.toBe(soundsSignature(b));
    expect(soundsSignature(a)).toBe(soundsSignature({ ...a }));
  });
});

/** Hold 1, 4, 5 with the pointer on a field dot of the library ring: the shown chord rooted on that dot (an explicit root choice). */
describe('dotSounds', () => {
  const close = (got: readonly number[], want: number[]) => {
    expect(got).toHaveLength(want.length);
    want.forEach((w, i) => expect(got[i]).toBeCloseTo(w, 1));
  };

  it('4:5:6:7 on the 5/3 dot (Field): hold 1 is 5/3, hold 5 is 5/3, 25/12, 5/2, 35/12, hold 4 rounds each to the field, octave kept', () => {
    const s = dotSounds(base(), entry('4:5:6:7'), 5, 'field')!;
    close(s.own, [884.4]);
    close(s.exact, [884.4, 1270.7, 1586.3, 1853.18]);
    // 25/12 (70.7 c above 1/1) rounds to 1/1 an octave up; 35/12 (653.2 c) rounds to 3/2 (702.0 c, 48.8 c away), an octave up
    close(s.rounded, [884.4, 1200, 1586.3, 1902.0]);
  });

  it('Subset comparison rounds to the subset notes only (1/1, 5/4, 3/2), even for a dot outside the subset', () => {
    const b = base([0, 2, 4]);
    const s = dotSounds(b, entry('4:5:6:7'), 5, 'subset')!;
    close(s.own, [884.4]);
    close(s.exact, [884.4, 1270.7, 1586.3, 1853.18]);
    // 884.4 c rounds to 3/2 (182.4 c away; 1/1 an octave up is 315.6 c away), 1270.7 to 1/1 an octave up
    close(s.rounded, [702.0, 1200, 1586.3, 1902.0]);
    // the same dot on Field gives a different rounding of the first note
    close(dotSounds(b, entry('4:5:6:7'), 5, 'field')!.rounded, [884.4, 1200, 1586.3, 1902.0]);
  });

  it('a dot is an explicit root: the chord is rooted on it, whatever the chord is found on', () => {
    // 10:12:15 on 9/8 (index 1): 9/8, 27/20 (519.5 c), 27/16 (905.9 c); rounded to 4/3 (498.0) and 5/3 (884.4)
    const s = dotSounds(base(), entry('10:12:15'), 1, 'field')!;
    close(s.exact, [203.9, 519.55, 905.87]);
    close(s.rounded, [203.9, 498.0, 884.4]);
    close(s.own, [203.9]);
  });

  it('a folding entry still plays: the exact ratios keep their real octaves, rounded is not empty', () => {
    const s = dotSounds(base(), entry('1:2:3'), 5, 'field')!;
    close(s.exact, [884.4, 2084.4, 2786.3]);
    close(s.rounded, [884.4, 2084.4, 2786.3]);
    close(s.own, [884.4]);
  });

  it('no chord shown: only hold 1 (the note) has a sound; holds 4 and 5 have none', () => {
    for (const none of [null, undefined]) {
      const s = dotSounds(base(), none, 5, 'field')!;
      close(s.own, [884.4]);
      expect(s.rounded).toEqual([]);
      expect(s.exact).toEqual([]);
    }
  });

  it('an index that is not in the field gives nothing', () => {
    expect(dotSounds(base(), entry('4:5:6:7'), 99, 'field')).toBeNull();
  });

  it('the signature follows the dot and the comparison set (a held key re-arms)', () => {
    const e = entry('4:5:6:7');
    const sig = (i: number, cmp: 'field' | 'subset') =>
      soundsSignature(dotSounds(base([0, 2, 4]), e, i, cmp)!);
    expect(sig(5, 'field')).not.toBe(sig(5, 'subset'));
    expect(sig(5, 'field')).not.toBe(sig(2, 'field'));
  });
});
