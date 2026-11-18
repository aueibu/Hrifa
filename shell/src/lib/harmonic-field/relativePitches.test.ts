/** M8a: the Relative pitches logic as data. Scenarios rows are cited; expected cents are computed, not typed. */
import { describe, expect, it } from 'vitest';
import { centsNote, fmtRatio, oddLimit, parseInterval, ratioNote } from './intervals';
import { generatorKey, type GeneratorInputs } from './library';
import {
  ALREADY_IN_FIELD,
  KEEP_UNISON,
  MONZO_PRIMES,
  MONZO_RANGE,
  RELATIVE_MAX_NOTES,
  TYPED_STEP_ERROR,
  addRelativeNote,
  cleanRingStep,
  hasPitch,
  landingPitch,
  landingReadout,
  monzoLanding,
  monzoStep,
  noteText,
  parseTypedStep,
  readNoteText,
  relativeNotes,
  relativeRingAt,
  relativeRingSequence,
  primeRingIndex,
  RELATIVE_RING_MAX,
  relativeRings,
  removeRelativePitch,
  sanitizeRelativeNotes,
  zeroMonzo,
  type MonzoExps,
} from './relativePitches';
import type { Note } from './types';

const REP = ratioNote(2, 1);
const r = (t: string): Note => {
  const n = parseInterval(t);
  if (!n) {
    throw new Error(t);
  }
  return n;
};
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const cents = (n: number, d: number) => 1200 * Math.log2(n / d);
const monzo = (e: Partial<MonzoExps>): MonzoExps => ({ ...zeroMonzo(), ...e });

describe('rings (row 16 and the table)', () => {
  const counts = (step: number) => relativeRings(step).map((x) => x.length);

  it('step 5: 3-5 | 7-9 | 11-15 | 17-19, counts as computed', () => {
    expect(counts(5)).toEqual([6, 12, 30, 34]);
    const rings = relativeRings(5);
    expect(rings[0].map((x) => x.text)).toEqual(['6/5', '5/4', '4/3', '3/2', '8/5', '5/3']);
    expect(
      rings.map((x) => [Math.min(...x.map((y) => y.odd)), Math.max(...x.map((y) => y.odd))])
    ).toEqual([
      [3, 5],
      [7, 9],
      [11, 15],
      [17, 19],
    ]);
  });

  it('step 4: odd limits 3 | 5-7 | 9-11 | 13-15, counts as computed', () => {
    expect(counts(4)).toEqual([2, 10, 16, 20]);
    expect(relativeRings(4)[0].map((x) => x.text)).toEqual(['4/3', '3/2']);
  });

  it('every ratio is strictly between 1/1 and 2/1, sorted by pitch, odd limit at least 3, no repeats', () => {
    for (const step of [2, 5, 10]) {
      const all = relativeRings(step).flat();
      expect(new Set(all.map((x) => x.text)).size).toBe(all.length);
      for (const ring of relativeRings(step)) {
        for (let i = 0; i < ring.length; i++) {
          expect(ring[i].note.c).toBeGreaterThan(0);
          expect(ring[i].note.c).toBeLessThan(1200);
          expect(ring[i].odd).toBeGreaterThanOrEqual(3);
          expect(ring[i].odd).toBe(Number(oddLimit(ring[i].note)));
          if (i) {
            expect(ring[i].note.c).toBeGreaterThan(ring[i - 1].note.c);
          }
        }
      }
    }
  });

  it('ring 2 holds the table ratios; 16/9 is odd limit 9', () => {
    const t = relativeRings(5)[1].map((x) => x.text);
    for (const x of [
      '7/4',
      '7/5',
      '7/6',
      '8/7',
      '10/7',
      '12/7',
      '9/8',
      '10/9',
      '9/7',
      '14/9',
      '9/5',
      '16/9',
    ]) {
      expect(t).toContain(x);
    }
    expect(relativeRings(5)[1].find((x) => x.text === '16/9')?.odd).toBe(9);
  });

  it('ring sequence, step 5: levels 1-3 are one group each, then one group per odd number', () => {
    const seq = relativeRingSequence(5);
    expect(seq.slice(0, 3).map((g) => g.label)).toEqual(['3–5', '7–9', '11–15']);
    expect(seq.slice(0, 3).map((g) => g.ratios.length)).toEqual([6, 12, 30]);
    expect(seq.slice(3, 8).map((g) => g.label)).toEqual(['17', '19', '21', '23', '25']);
    const sum = (labels: string[]) =>
      seq.filter((g) => labels.includes(g.label)).reduce((a, g) => a + g.ratios.length, 0);
    expect(sum(['17', '19'])).toBe(34);
    expect(sum(['21', '23', '25'])).toBe(54);
    expect(seq.slice(3, 8).map((g) => g.level)).toEqual([4, 4, 5, 5, 5]);
  });

  it('the 17 and 19 groups start with the expected ratios, in pitch order', () => {
    const seq = relativeRingSequence(5);
    const first = (label: string) =>
      seq
        .find((g) => g.label === label)
        ?.ratios.slice(0, 5)
        .map((x) => x.text);
    expect(first('17')).toEqual(['18/17', '17/16', '17/15', '20/17', '17/14']);
    expect(first('19')).toEqual(['20/19', '19/18', '19/17', '22/19', '19/16']);
    for (const g of seq) {
      for (let i = 0; i < g.ratios.length; i++) {
        expect(g.ratios[i].note.c).toBeGreaterThan(0);
        expect(g.ratios[i].note.c).toBeLessThan(1200);
        expect(g.odds).toContain(g.ratios[i].odd);
        if (i) {
          expect(g.ratios[i].note.c).toBeGreaterThan(g.ratios[i - 1].note.c);
        }
      }
    }
  });

  it('the sequence stops at the odd cap (63 by default)', () => {
    const seq = relativeRingSequence(5);
    expect(seq[seq.length - 1].label).toBe('63');
    expect(Math.max(...seq.flatMap((g) => g.odds))).toBe(63);
    // 53, 59 and 61 have more than 48 ratios and are split in two
    expect(seq.length).toBe(3 + 24 + 3);
    expect(seq.map((g) => g.label)).toContain('53b');
    expect(relativeRingSequence(5, 21).map((g) => g.label)).toEqual([
      '3–5',
      '7–9',
      '11–15',
      '17',
      '19',
      '21',
    ]);
  });

  it('a ring over 48 ratios is dealt in pitch order: 53 gives 53a and 53b of 26, 127 gives three parts', () => {
    const seq = relativeRingSequence(5, 55);
    const a = seq.find((g) => g.label === '53a');
    const b = seq.find((g) => g.label === '53b');
    expect(a?.ratios.length).toBe(26);
    expect(b?.ratios.length).toBe(26);
    expect(seq.find((g) => g.label === '53')).toBeUndefined();
    for (const g of [a!, b!]) {
      expect(g.parts).toBe(2);
      for (let i = 1; i < g.ratios.length; i++) {
        expect(g.ratios[i].note.c).toBeGreaterThan(g.ratios[i - 1].note.c);
      }
    }
    // dealt: the two parts together are all 52 ratios, and they interleave in pitch
    const all = [...a!.ratios, ...b!.ratios].sort((x, y) => x.note.c - y.note.c);
    expect(all.length).toBe(52);
    expect(new Set(all.map((x) => x.text)).size).toBe(52);
    expect(all.map((x) => x.text).filter((_, i) => i % 2 === 0)).toEqual(
      a!.ratios.map((x) => x.text)
    );
    // 127 is prime: 126 ratios, three rings of 42
    const parts: string[] = [];
    for (let i = 0; i < 400 && parts.length < 3; i++) {
      const g = relativeRingAt(5, i);
      if (g.odds[0] === 127) {
        parts.push(g.label);
        expect(g.ratios.length).toBe(42);
      }
    }
    expect(parts).toEqual(['127a', '127b', '127c']);
  });

  it('there is no end: a ring far out exists, every ring has at most 48 ratios, counts are exact', () => {
    const far = relativeRingAt(5, 2000);
    expect(far.ratios.length).toBeGreaterThan(0);
    expect(far.ratios.length).toBeLessThanOrEqual(RELATIVE_RING_MAX);
    const phi = (n: number) => {
      let c = 0;
      for (let k = 1; k <= n; k++) {
        if (gcd(n, k) === 1) {
          c++;
        }
      }
      return c;
    };
    // an unsplit odd L holds phi(L) ratios (odd a below L coprime to L, two foldings each)
    let full = 0;
    for (let i = 3; i < 60; i++) {
      const g = relativeRingAt(5, i);
      if (g.parts === 1) {
        expect(g.ratios.length).toBe(phi(g.odds[0]));
      }
      full += g.ratios.length;
    }
    expect(full).toBeGreaterThan(0);
  });

  it('prime jumps: the next ring whose odd limit is prime, by one or by five', () => {
    // step 5: ring 3 is 17, 4 is 19, 5 is 21 (not prime), 6 is 23
    expect(relativeRingAt(5, 3).label).toBe('17');
    expect(primeRingIndex(5, 0, 1)).toBe(3);
    expect(primeRingIndex(5, 3, 1)).toBe(4);
    expect(relativeRingAt(5, primeRingIndex(5, 4, 1)).label).toBe('23');
    // five primes from the start: 17, 19, 23, 29, 31
    expect(relativeRingAt(5, primeRingIndex(5, 0, 1, 5)).label).toBe('31');
    expect(relativeRingAt(5, primeRingIndex(5, 3, 1, 5)).label).toBe('37');
    // back: from 19 to 17, and past the first prime ring to the very start
    expect(primeRingIndex(5, 4, -1)).toBe(3);
    expect(primeRingIndex(5, 3, -1)).toBe(0);
    expect(primeRingIndex(5, 2, -1, 5)).toBe(0);
    // a split prime lands on its first part
    const i = primeRingIndex(5, relativeRingSequence(5, 51).length - 1, 1);
    expect(relativeRingAt(5, i).label).toBe('53a');
  });

  it('a bad step is the nearest allowed whole number or the default', () => {
    expect(cleanRingStep(1)).toBe(2);
    expect(cleanRingStep(99)).toBe(10);
    expect(cleanRingStep(4.4)).toBe(4);
    expect(cleanRingStep('x')).toBe(5);
    expect(cleanRingStep(undefined)).toBe(5);
  });
});

describe('landing (rows 2 to 7)', () => {
  const land = (from: string, ratio: string, dir: 'above' | 'below') =>
    landingPitch(r(from), r(ratio), dir, REP);

  it('row 2: 3/2 above 1/1', () => {
    expect(fmtRatio(land('1/1', '3/2', 'above'))).toBe('3/2');
  });
  it('row 3: 11/6 above 3/2 folds 11/4 to 11/8', () => {
    const n = land('3/2', '11/6', 'above');
    expect(fmtRatio(n)).toBe('11/8');
    expect(n.c).toBeCloseTo(cents(11, 8), 9);
  });
  it('row 4: 11/6 below 3/2 is 18/11 (852.6 c)', () => {
    const n = land('3/2', '11/6', 'below');
    expect(fmtRatio(n)).toBe('18/11');
    expect(n.c.toFixed(1)).toBe('852.6');
  });
  it('row 5: 9/8 below 18/11 is 16/11, and the five notes', () => {
    const n = land('18/11', '9/8', 'below');
    expect(fmtRatio(n)).toBe('16/11');
    const five = ['1/1', '11/8', '16/11', '3/2', '18/11'].map(r);
    expect(five.map((x) => x.c.toFixed(1))).toEqual(['0.0', '551.3', '648.7', '702.0', '852.6']);
  });
  it('rows 6 and 7: 3/2 below 1/1 and 4/3 above 1/1 are the same note', () => {
    const a = land('1/1', '3/2', 'below');
    const b = land('1/1', '4/3', 'above');
    expect(fmtRatio(a)).toBe('4/3');
    expect(fmtRatio(b)).toBe('4/3');
    expect(a.c).toBeCloseTo(b.c, 9);
  });
  it('a cents note: plain cents arithmetic, no ratio', () => {
    const n = landingPitch(centsNote(700), r('3/2'), 'above', REP);
    expect(n.m).toBeNull();
    expect(n.c).toBeCloseTo((((700 + cents(3, 2)) % 1200) + 1200) % 1200, 9);
    const m = landingPitch(r('3/2'), centsNote(100), 'below', REP);
    expect(m.m).toBeNull();
    expect(m.c).toBeCloseTo(cents(3, 2) - 100, 9);
  });
  it('a different repeat folds into it', () => {
    const n = landingPitch(r('1/1'), r('3/2'), 'above', ratioNote(3, 1));
    expect(fmtRatio(n)).toBe('3/2');
    expect(fmtRatio(landingPitch(r('3/2'), r('3/2'), 'above', ratioNote(3, 1)))).toBe('9/4');
  });
  it('row 8: the readout', () => {
    const from = r('3/2');
    const to = land('3/2', '11/6', 'below');
    expect(landingReadout('11/6', 'below', from, to)).toBe(
      `11/6 below 3/2 = 18/11 (${to.c.toFixed(1)} c)`
    );
    expect(landingReadout('11/6', 'below', from, to)).toBe('11/6 below 3/2 = 18/11 (852.6 c)');
  });
});

describe('monzo (rows 17 to 22)', () => {
  const land = (from: string, e: Partial<MonzoExps>) => monzoLanding(r(from), monzo(e), REP);

  it('row 17: 7 at +1 from 3/2 is 21/16 (470.8 c), named 7/4 above', () => {
    const n = land('3/2', { 7: 1 });
    expect(fmtRatio(n)).toBe('21/16');
    expect(n.c.toFixed(1)).toBe('470.8');
    const step = monzoStep(monzo({ 7: 1 }), REP);
    expect(step && [fmtRatio(step.ratio), step.dir]).toEqual(['7/4', 'above']);
    if (step) {
      expect(landingReadout(fmtRatio(step.ratio), step.dir, r('3/2'), n)).toBe(
        '7/4 above 3/2 = 21/16 (470.8 c)'
      );
    }
  });
  it('row 18: 7 at -1 from 3/2 is 12/7 (933.1 c), named 7/4 below', () => {
    const n = land('3/2', { 7: -1 });
    expect(fmtRatio(n)).toBe('12/7');
    expect(n.c.toFixed(1)).toBe('933.1');
    const step = monzoStep(monzo({ 7: -1 }), REP);
    expect(step && [fmtRatio(step.ratio), step.dir]).toEqual(['7/4', 'below']);
    // the same note by the ratio rule
    expect(landingPitch(r('3/2'), r('7/4'), 'below', REP).c).toBeCloseTo(n.c, 9);
  });
  it('row 19: 3 at +2 and 5 at -1 from 1/1 is 9/5 (1017.6 c)', () => {
    const n = land('1/1', { 3: 2, 5: -1 });
    expect(fmtRatio(n)).toBe('9/5');
    expect(n.c.toFixed(1)).toBe('1017.6');
  });
  it('row 20: 3 at +12 is 531441/524288 (23.5 c); exponents clamp at +-12', () => {
    const n = land('1/1', { 3: 12 });
    expect(fmtRatio(n)).toBe('531441/524288');
    expect(n.c.toFixed(1)).toBe('23.5');
    expect(MONZO_RANGE).toBe(12);
    expect(MONZO_PRIMES).toEqual([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41]);
    expect(Object.keys(zeroMonzo())).toHaveLength(13);
    expect(fmtRatio(land('1/1', { 3: 20 }))).toBe('531441/524288');
    expect(fmtRatio(land('1/1', { 3: -20 }))).toBe(fmtRatio(land('1/1', { 3: -12 })));
  });
  it('41 at +12 (about 2.25e19, past 2^53) stays exact and round-trips through the stored text', () => {
    const n = land('1/1', { 41: 12 });
    const num = 41n ** 12n;
    let den = 1n;
    while (num >= 2n * den) {
      den *= 2n;
    }
    expect(fmtRatio(n)).toBe(`${num}/${den}`);
    expect(n.c).toBeCloseTo((((12 * 1200 * Math.log2(41)) % 1200) + 1200) % 1200, 6);
    const text = noteText(n);
    expect(sanitizeRelativeNotes([text])).toEqual(['1/1', text]);
    const back = readNoteText(text) as Note;
    expect(fmtRatio(back)).toBe(`${num}/${den}`);
    expect(back.c).toBeCloseTo(n.c, 9);
    // a landing from it and the readout keep exactness too
    const step = monzoStep(monzo({ 41: -12 }), REP);
    expect(step && [fmtRatio(step.ratio), step.dir]).toEqual([`${num}/${den}`, 'below']);
  });
  it('twelve primes at +12 make a very long exact text that still stores', () => {
    const all = Object.fromEntries(MONZO_PRIMES.map((p) => [p, 12])) as MonzoExps;
    const n = monzoLanding(r('1/1'), all, REP);
    const text = noteText(n);
    expect(text.length).toBeGreaterThan(60);
    expect(sanitizeRelativeNotes([text])).toEqual(['1/1', text]);
    expect(fmtRatio(readNoteText(text) as Note)).toBe(fmtRatio(n));
  });
  it('the 2 strip: no effect with a 2/1 repeat, a real note with 3/1', () => {
    expect(fmtRatio(land('1/1', { 2: 1 }))).toBe('1/1');
    expect(fmtRatio(land('1/1', { 2: -3, 3: 1 }))).toBe('3/2');
    const tritave = ratioNote(3, 1);
    const two = monzoLanding(r('1/1'), monzo({ 2: 1 }), tritave);
    expect(fmtRatio(two)).toBe('2/1');
    expect(two.c).toBeCloseTo(1200, 9);
    // 3 has no effect with 3/1: 2 at +2 and 3 at -1 is 4/3 either way
    expect(fmtRatio(monzoLanding(r('1/1'), monzo({ 2: 2, 3: -1 }), tritave))).toBe('4/3');
    expect(fmtRatio(monzoLanding(r('1/1'), monzo({ 2: 2, 3: 3 }), tritave))).toBe('4/3');
  });
  it('11 works: 11 at +1 is 11/8', () => {
    expect(fmtRatio(land('1/1', { 11: 1 }))).toBe('11/8');
  });
  it('row 22: all zero is the clicked note itself and no step', () => {
    expect(monzoStep(zeroMonzo(), REP)).toBeNull();
    const from = r('3/2');
    expect(monzoLanding(from, zeroMonzo(), REP)).toBe(from);
  });
  it('row 21: 7 at +1 from 1/1 is 7/4 (968.8 c)', () => {
    const n = land('1/1', { 7: 1 });
    expect(fmtRatio(n)).toBe('7/4');
    expect(n.c.toFixed(1)).toBe('968.8');
  });
  it('a cents note keeps cents', () => {
    const n = monzoLanding(centsNote(100), monzo({ 3: 1 }), REP);
    expect(n.m).toBeNull();
    expect(n.c).toBeCloseTo(100 + cents(3, 2), 9);
  });
});

describe('typed input (rows 10 to 12)', () => {
  it('row 10: 700 is cents with no ratio; above 1/1 it lands on 700.0 c', () => {
    const t = parseTypedStep('700');
    expect(t.ok).toBe(true);
    if (t.ok) {
      expect(t.ratio.m).toBeNull();
      const n = landingPitch(r('1/1'), t.ratio, 'above', REP);
      expect(n.c.toFixed(1)).toBe('700.0');
      expect(n.m).toBeNull();
      expect(noteText(n)).toBe('700 c');
    }
    expect(parseTypedStep('700 c').ok).toBe(true);
    expect(parseTypedStep('700.5c').ok).toBe(true);
  });
  it('row 11: 23/16 and 23:16 are ratios beyond the four rings', () => {
    for (const text of ['23/16', '23:16']) {
      const t = parseTypedStep(text);
      expect(t.ok).toBe(true);
      if (t.ok) {
        expect(fmtRatio(landingPitch(r('1/1'), t.ratio, 'above', REP))).toBe('23/16');
      }
    }
  });
  it('row 12: abc, 0, 3/0 and empty are refused with the message', () => {
    for (const text of ['abc', '0', '0.0', '3/0', '0/3', '', '  ', '3/', '1/2/3']) {
      expect(parseTypedStep(text)).toEqual({ ok: false, message: TYPED_STEP_ERROR });
    }
    expect(TYPED_STEP_ERROR).toBe('Type a ratio such as 3/2, or cents such as 700');
  });
});

describe('notes: add, remove, sanitize', () => {
  const rep = REP;
  const five = ['1/1', '11/8', '16/11', '3/2', '18/11'];

  it('row 1 / texts: stored text round trips', () => {
    expect(noteText(r('11/8'))).toBe('11/8');
    expect(noteText(centsNote(700))).toBe('700 c');
    expect(noteText(centsNote(701.9550008653874))).toBe('701.955001 c');
    expect(fmtRatio(readNoteText('11/8') as Note)).toBe('11/8');
    expect((readNoteText('700') as Note).c).toBe(700);
    expect((readNoteText('700 c') as Note).m).toBeNull();
    expect(readNoteText('x')).toBeNull();
    expect(relativeNotes(five).map(fmtRatio)).toEqual(five);
    expect(() => relativeNotes(['zz'])).toThrow(/zz/);
  });
  it('adds a note folded into the repeat', () => {
    const e = addRelativeNote(['1/1'], '11/4', rep);
    expect(e).toEqual({ notes: ['1/1', '11/8'], message: null });
    expect(addRelativeNote(['1/1'], '700 c', rep).notes).toEqual(['1/1', '700 c']);
  });
  it('row 9: a duplicate pitch changes nothing and says so (also across spellings)', () => {
    const notes = ['1/1', '3/2', '9/8'];
    const e = addRelativeNote(notes, '9/8', rep);
    expect(e.notes).toBe(notes);
    expect(e.message).toBe(ALREADY_IN_FIELD);
    expect(addRelativeNote(notes, '9/4', rep).message).toBe(ALREADY_IN_FIELD);
    expect(addRelativeNote(notes, '1200 c', rep).message).toBe(ALREADY_IN_FIELD);
    expect(hasPitch(notes, '3/2', rep)).toBe(true);
    expect(hasPitch(notes, '5/4', rep)).toBe(false);
  });
  it('an unreadable text is refused with the typed message; the 256 cap is refused', () => {
    expect(addRelativeNote(['1/1'], 'nope', rep).message).toBe(TYPED_STEP_ERROR);
    const full = Array.from({ length: RELATIVE_MAX_NOTES }, (_, i) => `${i + 1} c`);
    const e = addRelativeNote(full, '3/2', rep);
    expect(e.notes).toBe(full);
    expect(e.message).toContain('256');
  });
  it('row 13: removing 3/2 removes only 3/2', () => {
    const e = removeRelativePitch(five, r('3/2').c, rep);
    expect(e).toEqual({ notes: ['1/1', '11/8', '16/11', '18/11'], message: null });
  });
  it('removing 1/1 is refused (it always stays); removing an absent pitch is no change', () => {
    const e = removeRelativePitch(five, 0, rep);
    expect(e.notes).toBe(five);
    expect(e.message).toBe(KEEP_UNISON);
    expect(sanitizeRelativeNotes(['3/2', '5/4'])).toEqual(['1/1', '3/2', '5/4']);
    expect(sanitizeRelativeNotes(['5/4', '1/1'])).toEqual(['1/1', '5/4']);
    const none = removeRelativePitch(five, 5, rep);
    expect(none.notes).toBe(five);
    expect(none.message).toBeNull();
  });
  it('sanitize: bad entries dropped, duplicates once, cap 256, empty is 1/1', () => {
    expect(sanitizeRelativeNotes(['1/1', 'zz', 7, '3/2', '3:2', '700', '700 c'])).toEqual([
      '1/1',
      '3/2',
      '700 c',
    ]);
    expect(sanitizeRelativeNotes([])).toEqual(['1/1']);
    expect(sanitizeRelativeNotes('x')).toEqual(['1/1']);
    expect(sanitizeRelativeNotes(undefined)).toEqual(['1/1']);
    expect(sanitizeRelativeNotes(['bad'])).toEqual(['1/1']);
    const many = Array.from({ length: 400 }, (_, i) => `${i + 1} c`);
    expect(sanitizeRelativeNotes(many)).toHaveLength(RELATIVE_MAX_NOTES);
  });
});

describe('generatorKey (H-33)', () => {
  const base: GeneratorInputs = {
    method: 'harmonic',
    rep: '2/1',
    h: 8,
    edoN: 12,
    shape: 'box',
    axes: [{ on: true, g: '3/2', n: 12, ctr: 0 }],
    dist: 3,
    bidir: true,
    cpsF: '1 3 5 7',
    cpsK: 2,
    custom: '9/8 5/4',
    mask: Array<boolean>(25).fill(true),
  };

  it('notes are in the key only for the relative method; every other key is unchanged', () => {
    for (const method of ['harmonic', 'sub', 'edo', 'lattice', 'cps', 'custom'] as const) {
      const g = { ...base, method };
      expect(generatorKey({ ...g, notes: ['1/1', '3/2'] })).toBe(generatorKey(g));
    }
    expect(generatorKey(base)).toBe(
      JSON.stringify({ m: 'harmonic', r: '1200.000000', k: '1'.repeat(25), h: 8 })
    );
  });
  it('the relative key is the folded pitch set: order and spelling do not matter, content does', () => {
    const rel = (notes: string[]) => generatorKey({ ...base, method: 'relative', notes });
    expect(rel(['1/1', '3/2'])).toBe(rel(['3/2', '1/1']));
    expect(rel(['1/1', '3/2'])).toBe(rel(['1/1', '3:2', '3/2', '3/1']));
    expect(rel(['1/1', '3/2'])).not.toBe(rel(['1/1', '4/3']));
    expect(rel(['1/1'])).not.toBe(generatorKey({ ...base, method: 'custom' }));
    expect(generatorKey({ ...base, method: 'relative' })).toBe(rel(['1/1']));
  });
});
