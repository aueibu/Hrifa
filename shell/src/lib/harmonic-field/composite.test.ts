import { describe, expect, it } from 'vitest';
import {
  clampMergeTol,
  compositeNotes,
  compositeRepeat,
  mergeComposite,
  previewAdd,
  ratioNote,
  samePitches,
  type MergeItem,
  type Note,
} from './index';

const oct = ratioNote(2, 1);
const tritave = ratioNote(3, 1);
const edo = (...c: number[]): Note[] => c.map((x) => ({ m: null, c: x }));
const ji = (...r: [number, number][]): Note[] => r.map(([a, b]) => ratioNote(a, b));
const r1 = (x: number) => Math.round(x * 10) / 10;
const cents = (items: MergeItem[], tol: number, keep: 'first' | 'recent' = 'first') =>
  mergeComposite(items, oct, { tol, keep }).notes.map((n) => r1(n.note.c));

// the confirmed scenarios (human, 2026-11-15)
const cMajor12: MergeItem = { id: 'a', pitches: edo(0, 400, 700), rep: oct };
const ji456: MergeItem = { id: 'b', pitches: ji([1, 1], [5, 4], [3, 2]), rep: oct };

describe('mergeComposite: 12-EDO C major + JI 4:5:6', () => {
  it('at 5 c: 400 and 386.3 stay separate (13.7 c apart), 700 and 702 merge, 700 is kept', () => {
    const r = mergeComposite([cMajor12, ji456], oct, { tol: 5 });
    // the distinct notes are 0, 386.3, 400, 700 = 4 (the two 0 c merge, 400 and 386.3 do not, 700 and 702 do);
    // the scenario table's earlier "5 notes" was a counting slip, corrected in ARC.md
    expect(r.notes.map((n) => r1(n.note.c))).toEqual([0, 386.3, 400, 700]);
    const fifth = r.notes[3];
    expect(fifth.note.c).toBe(700); // first added is kept
    expect(fifth.note.m).toBeNull(); // cents-only stays cents-only
    expect(fifth.origins).toEqual(['a', 'b']);
    expect(r.notes[1].origins).toEqual(['b']);
    expect(r.notes[2].origins).toEqual(['a']);
  });

  it('at 15 c: 400 and 386.3 merge too, giving 3 notes', () => {
    expect(cents([cMajor12, ji456], 15)).toEqual([0, 400, 700]);
  });

  it('keep "recent" keeps 702 (the JI fifth, with its exact monzo)', () => {
    const r = mergeComposite([cMajor12, ji456], oct, { tol: 5, keep: 'recent' });
    const fifth = r.notes.find((n) => n.origins.length === 2 && n.note.c > 600)!;
    expect(fifth.note.c).toBeCloseTo(701.955, 3);
    expect(fifth.note.m).toEqual({ '2': -1, '3': 1 });
  });

  it('the tolerance edge is inclusive: 13.7 merges 400 and 386.3, 13.6 does not', () => {
    expect(cents([cMajor12, ji456], 13.7)).toEqual([0, 400, 700]);
    expect(cents([cMajor12, ji456], 13.6)).toEqual([0, 386.3, 400, 700]);
  });
});

describe('mergeComposite: exact monzos and cents-only', () => {
  it('keeps the exact monzo of the kept note, and upgrades a cents-only twin of the same size', () => {
    const j = mergeComposite([{ id: 'j', pitches: ji([3, 2]), rep: oct }, cMajor12], oct);
    expect(j.notes.find((n) => n.note.c > 600)!.note.m).toEqual({ '2': -1, '3': 1 });
    const up = mergeComposite(
      [
        { id: 'e', pitches: [{ m: null, c: ratioNote(3, 2).c }], rep: oct },
        { id: 'j', pitches: ji([3, 2]), rep: oct },
      ],
      oct
    );
    expect(up.notes).toHaveLength(1);
    expect(up.notes[0].note.m).toEqual({ '2': -1, '3': 1 });
    expect(up.notes[0].origins).toEqual(['e', 'j']);
  });

  it('a cents-only note is never given a monzo, and notes come out plain {m, c}', () => {
    const r = mergeComposite([{ id: 'e', pitches: edo(0, 350.5), rep: oct }], oct);
    expect(r.notes.map((n) => n.note)).toEqual([
      { m: null, c: 0 },
      { m: null, c: 350.5 },
    ]);
    expect(compositeNotes(r)).toEqual(r.notes.map((n) => n.note));
  });
});

describe('mergeComposite: repeat', () => {
  it('uses the first item repeat, the fallback when empty or the first has none', () => {
    expect(compositeRepeat([cMajor12], tritave).c).toBeCloseTo(1200, 6);
    expect(compositeRepeat([], tritave).c).toBeCloseTo(1901.955, 3);
    expect(compositeRepeat([{ id: 'x', pitches: edo(0) }], tritave).c).toBeCloseTo(1901.955, 3);
    expect(mergeComposite([], tritave).notes).toEqual([]);
  });

  it('reduces a Bohlen-Pierce (3/1) chord into an octave composite', () => {
    // 3:5:7 in BP: 1/1, 5/3 (884.4 c), 7/3 (1466.9 c, above the octave)
    const bp: MergeItem = { id: 'bp', pitches: ji([1, 1], [5, 3], [7, 3]), rep: tritave };
    const r = mergeComposite([cMajor12, bp], oct, { tol: 0 });
    expect(r.rep.c).toBeCloseTo(1200, 6);
    const c = r.notes.map((n) => n.note.c);
    expect(Math.max(...c)).toBeLessThan(1200);
    // 7/3 became 7/6 (266.9 c) with its exact monzo
    const seventh = r.notes.find((n) => Math.abs(n.note.c - 266.871) < 0.01)!;
    expect(seventh.note.m).toEqual({ '2': -1, '3': -1, '7': 1 });
    expect(seventh.origins).toEqual(['bp']);
    expect(r.notes.some((n) => Math.abs(n.note.c - 884.359) < 0.01)).toBe(true);
  });

  it('a BP chord first makes a tritave composite and an octave item is reduced into it', () => {
    const bp: MergeItem = { id: 'bp', pitches: ji([1, 1], [5, 3]), rep: tritave };
    const r = mergeComposite([bp, { id: 'o', pitches: edo(0, 1500), rep: oct }], oct);
    expect(r.rep.c).toBeCloseTo(1901.955, 3);
    // 1500 c is inside a tritave: it stays
    expect(r.notes.map((n) => Math.round(n.note.c))).toEqual([0, 884, 1500]);
  });
});

describe('mergeComposite: order independence', () => {
  it('with tolerance 0 the pitch set does not depend on the item order', () => {
    const items: MergeItem[] = [
      cMajor12,
      ji456,
      { id: 'c', pitches: ji([9, 8], [3, 2], [7, 4]), rep: oct },
    ];
    const a = cents(items, 0);
    expect(cents([items[2], items[0], items[1]], 0)).toEqual(a);
    expect(cents([items[1], items[2], items[0]], 0)).toEqual(a);
    expect(a).toEqual([...a].sort((x, y) => x - y));
  });
});

describe('previewAdd and samePitches', () => {
  it('reports added, common (merged into an existing note) and the item already being in it', () => {
    const p = previewAdd([cMajor12], ji456, oct, { tol: 5 });
    expect(p.added.map((n) => r1(n.c))).toEqual([386.3]);
    expect(p.common.map((x) => [Math.round(x.pitch.c), x.into.c])).toEqual([
      [0, 0],
      [702, 700],
    ]);
    expect(p.dropped).toEqual([]);
    expect(p.already).toBe(false);
    expect(p.before.map((n) => n.note.c)).toEqual([0, 400, 700]);
    expect(previewAdd([cMajor12], cMajor12, oct).already).toBe(true);
    // same pitches in another order
    expect(previewAdd([cMajor12], { pitches: edo(700, 0, 400) }, oct).already).toBe(true);
  });

  it('reports pitches dropped by reduction (an octave doubling lands on the root)', () => {
    const p = previewAdd([], { pitches: edo(0, 400, 1200) }, oct);
    expect(p.added.map((n) => n.c)).toEqual([0, 400]);
    expect(p.dropped.map((n) => n.c)).toEqual([0]);
    expect(p.common).toEqual([]);
  });

  it('reduces a candidate from another repeat and says what it lands on', () => {
    const p = previewAdd([cMajor12], { pitches: ji([1, 1], [7, 3]) }, oct, { tol: 5 });
    expect(p.added.map((n) => Math.round(n.c))).toEqual([267]);
    expect(p.common).toHaveLength(1);
  });

  it('into is the note as it was before the merge, also with keep recent', () => {
    const p = previewAdd([cMajor12], ji456, oct, { tol: 5, keep: 'recent' });
    expect(p.common[1].into.c).toBe(700);
  });

  it('samePitches compares by exact monzo or by cents within 0.01', () => {
    expect(samePitches(edo(0, 100), edo(100.005, 0))).toBe(true);
    expect(samePitches(edo(0, 100), edo(0, 100.5))).toBe(false);
    expect(samePitches(edo(0), edo(0, 0))).toBe(false);
  });

  it('clampMergeTol bounds to 0..50 and defaults to 5', () => {
    expect([clampMergeTol(-1), clampMergeTol(70), clampMergeTol(12.5)]).toEqual([0, 50, 12.5]);
    expect([clampMergeTol('x'), clampMergeTol(NaN), clampMergeTol(undefined)]).toEqual([5, 5, 5]);
  });
});
