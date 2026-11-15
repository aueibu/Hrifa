import { describe, expect, it } from 'vitest';
import { ratioNote } from './intervals';
import {
  parsePattern,
  patternName,
  positionalChord,
  positionalChords,
  positionalNaming,
  rankPositional,
  ratioName,
  stepCents,
} from './positional';
import type { Note } from './types';

const edo12: Note[] = Array.from({ length: 12 }, (_, i) => ({ m: null, c: i * 100 }));
const rep: Note = { m: null, c: 1200 };
const cents = (n: Note[]) => n.map((x) => Math.round(x.c));
// C D E F G A B
const major = [0, 2, 4, 5, 7, 9, 11];
// C D E G A
const penta = [0, 2, 4, 7, 9];

describe('parsePattern', () => {
  it('accepts 2-3-2 and the presets', () => {
    expect(parsePattern('2-3-2')).toEqual([2, 3, 2]);
    expect(parsePattern(' 2-2 ')).toEqual([2, 2]);
    expect(parsePattern('1-1-1-1-1-1-1-1')).toHaveLength(8);
  });
  it('rejects 0, 10, empty, 2--3, letters, more than 8 steps', () => {
    for (const bad of ['0', '2-0', '10', '', '2--3', 'a', '2-b', '-2', '2-', '1-1-1-1-1-1-1-1-1']) {
      expect(parsePattern(bad)).toBeNull();
    }
    expect(parsePattern(null)).toBeNull();
  });
  it('names a pattern', () => {
    expect(patternName([2, 3, 2])).toBe('2-3-2');
  });
});

describe('positionalChord scenarios', () => {
  it('12-EDO C major, 2-2 degree 1 = C E G (0, 400, 700 c)', () => {
    const c = positionalChord(edo12, major, [2, 2], 0, 0, rep)!;
    expect(cents(c.pitches)).toEqual([0, 400, 700]);
    expect(c.members).toEqual([0, 4, 7]);
  });
  it('degree 2 = D F A (200, 500, 900 c)', () => {
    const c = positionalChord(edo12, major, [2, 2], 1, 0, rep)!;
    expect(cents(c.pitches)).toEqual([200, 500, 900]);
  });
  it('pentatonic C D E G A, 2-2 degree 2 = D G C (200, 700, 1200 c): top note above the root', () => {
    const c = positionalChord(edo12, penta, [2, 2], 1, 0, rep)!;
    expect(cents(c.pitches)).toEqual([200, 700, 1200]);
    expect(c.members).toEqual([2, 7, 0]);
  });
  it('wraps around the subset: B D F in C major (degree 7)', () => {
    const c = positionalChord(edo12, major, [2, 2], 6, 0, rep)!;
    expect(cents(c.pitches)).toEqual([1100, 1400, 1700]);
  });
  it('counts steps from the mode root: mode 2 subset starts at D, the same degree is another note', () => {
    // mode 1 (0-based) = D root; degree 0 = D
    const c = positionalChord(edo12, major, [2, 2], 0, 1, rep)!;
    expect(cents(c.pitches)).toEqual([200, 500, 900]);
    // degree 6 in mode 1 is the C at the top of the repeat: field-absolute root C (0 c), then E G above it
    const w = positionalChord(edo12, major, [2, 2], 6, 1, rep)!;
    expect(cents(w.pitches)).toEqual([0, 400, 700]);
  });
  it('degrees in a pattern longer than the subset keep stacking upward', () => {
    const c = positionalChord(edo12, [0, 7], [1, 1, 1], 0, 0, rep)!;
    expect(cents(c.pitches)).toEqual([0, 700, 1200, 1900]);
  });
  it('null for an empty subset or pattern; exact monzo kept; cents-only stays cents-only', () => {
    expect(positionalChord(edo12, [], [2, 2], 0, 0, rep)).toBeNull();
    expect(positionalChord(edo12, major, [], 0, 0, rep)).toBeNull();
    const ji: Note[] = [ratioNote(1, 1), ratioNote(5, 4), ratioNote(3, 2)];
    const r = positionalChord(ji, [0, 1, 2], [1, 1], 1, 0, ratioNote(2, 1))!;
    expect(r.pitches[2].m).toEqual(ratioNote(2, 1).m);
    expect(r.pitches[1].m).not.toBeNull();
    expect(r.pitches[2].c).toBeCloseTo(1200, 6);
    expect(positionalChord(edo12, major, [2, 2], 0, 0, rep)!.pitches[0].m).toBeNull();
  });
  it('all degrees', () => {
    expect(positionalChords(edo12, major, [2, 2], 0, rep).map((c) => c.degree)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
  });
});

describe('naming', () => {
  const harm: Note[] = Array.from({ length: 16 }, (_, i) => ratioNote(16 + i, 16));
  const hSub = [0, 2, 4, 6, 8, 10, 12];
  it('same main label, different tail in another tuning', () => {
    const a = positionalChord(edo12, major, [2, 2], 0, 0, rep)!;
    const b = positionalChord(harm, hSub, [2, 2], 0, 0, ratioNote(2, 1))!;
    const na = positionalNaming(a, 7, '12-EDO');
    const nb = positionalNaming(b, 7, 'harmonics from 16');
    expect(na.label).toBe('2-2 on 1');
    expect(nb.label).toBe('2-2 on 1');
    expect(na.tail).toBe('7 of 12-EDO · 400-300 c');
    expect(nb.tail).not.toBe(na.tail);
    expect(nb.tail.startsWith('7 of harmonics from 16 · ')).toBe(true);
  });
  it('main label is 1-based', () => {
    const c = positionalChord(edo12, major, [2, 2], 3, 0, rep)!;
    expect(positionalNaming(c, 7, 'x').label).toBe('2-2 on 4');
  });
  it('step cents are rounded whole cents', () => {
    expect(
      stepCents([
        { m: null, c: 0 },
        { m: null, c: 386.3 },
        { m: null, c: 702 },
      ])
    ).toEqual([386, 316]);
  });
  it('ratio name only within 5 c', () => {
    const ji = [ratioNote(1, 1), ratioNote(5, 4), ratioNote(3, 2)];
    expect(ratioName(ji)).toBe('~ 4:5:6');
    // 12-EDO major third is 13.7 c off: no name
    expect(ratioName(edo12.filter((_, i) => [0, 4, 7].includes(i)))).toBeNull();
    // within 5 c: 386 + 3 c
    const near: Note[] = [
      { m: null, c: 0 },
      { m: null, c: 389 },
      { m: null, c: 703 },
    ];
    expect(ratioName(near)).toBe('~ 4:5:6');
    const far: Note[] = [
      { m: null, c: 0 },
      { m: null, c: 392 },
      { m: null, c: 702 },
    ];
    expect(ratioName(far)).toBeNull();
    expect(positionalNaming({ pattern: [2, 2], degree: 0, pitches: ji }, 7, 'JI').ratio).toBe(
      '~ 4:5:6'
    );
  });
});

describe('rankPositional', () => {
  it('smoother first by roughness; the score is exposed', () => {
    const chords = positionalChords(edo12, major, [2, 2], 0, rep);
    const r = rankPositional(chords);
    expect(r).toHaveLength(7);
    for (let i = 1; i < r.length; i++) {
      expect(r[i].score).toBeGreaterThanOrEqual(r[i - 1].score);
    }
    expect(r.every((c) => Number.isFinite(c.score) && c.score > 0)).toBe(true);
    expect(r.map((c) => c.degree).sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
  it('register-independent: identical shapes tie (C, F, G major triads), then degree order', () => {
    const chords = positionalChords(edo12, major, [2, 2], 0, rep);
    const r = rankPositional(chords);
    const maj = r.filter((c) => [0, 3, 4].includes(c.degree));
    expect(maj[0].score).toBeCloseTo(maj[1].score, 9);
    expect(maj[1].score).toBeCloseTo(maj[2].score, 9);
    const at = (d: number) => r.findIndex((c) => c.degree === d);
    expect(at(0)).toBeLessThan(at(3));
    expect(at(3)).toBeLessThan(at(4));
    // a minor-shaped chord (D F A) differs from the major shape
    expect(r.find((c) => c.degree === 1)!.score).not.toBeCloseTo(maj[0].score, 6);
  });
  it('the mode does not change the order of equal shapes', () => {
    const order = (mode: number) =>
      rankPositional(positionalChords(edo12, major, [2, 2], mode, rep)).map((c) =>
        Math.round(c.score * 1e6)
      );
    // the same set of shapes in another rotation gives the same sorted scores
    expect(order(0)).toEqual(order(2));
  });
  it('a custom score still ties by degree', () => {
    const chords = positionalChords(edo12, major, [2, 2], 0, rep);
    const r = rankPositional(chords, 261.6, (p) => (p[1].c - p[0].c === 400 ? 1 : 2));
    expect(r.map((c) => c.degree)).toEqual([0, 3, 4, 1, 2, 5, 6]);
  });
});
