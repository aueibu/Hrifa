// M1 scenarios (arcs/harmonic-field-lab/SCENARIOS.M1.md), 5-limit major scale: 1/1 9/8 5/4 4/3 3/2 5/3 15/8, repeat 2/1.
// Degrees are numbered 1 to 7 in the table; the code is 0-based.
import { describe, expect, it } from 'vitest';
import {
  PAIRS_CAP,
  centsNote,
  pairCoverage,
  findChords,
  intervalPairs,
  TINT_MAX,
  TINT_MIDDLE,
  TINT_MIN,
  tintStrengths,
  wheelPositions,
  locateInterval,
  parseInterval,
  rotateSubset,
  stepsTable,
  type IntervalPairs,
  type Note,
} from './index';

const P = (s: string): Note => parseInterval(s) as Note;
const rep = P('2/1');
const MAJOR = ['1/1', '9/8', '5/4', '4/3', '3/2', '5/3', '15/8'].map(P);
const rel = (field: Note[], mode = 0) =>
  rotateSubset(
    field,
    field.map((_, i) => i),
    mode,
    rep
  );
const major = () => intervalPairs(rel(MAJOR), rep, 9) as IntervalPairs;
const cellsOf = (m: IntervalPairs, ratio: string) =>
  m.groups.find((g) => g.ratio === ratio)?.cells.map((c) => [c.from + 1, c.to + 1]);

describe('intervalPairs: 5-limit major scale', () => {
  it('row 1: 7 by 7, empty diagonal, 42 cells, 18 distinct intervals', () => {
    const m = major();
    expect(m.N).toBe(7);
    expect(m.cells.every((r, i) => r[i] === null)).toBe(true);
    expect(m.cells.flat().filter(Boolean)).toHaveLength(42);
    expect(m.groups).toHaveLength(18);
  });

  it('row 2: the table is simplest first, with the counts of the scenario', () => {
    const got = major().groups.map((g) => `${g.ratio} x${g.count}`);
    expect(got).toEqual([
      '3/2 x5',
      '4/3 x5',
      '5/3 x3',
      '5/4 x3',
      '6/5 x3',
      '8/5 x3',
      '9/5 x2',
      '9/8 x3',
      '10/9 x2',
      '15/8 x2',
      '16/9 x3',
      '16/15 x2',
      '27/16 x1',
      '27/20 x1',
      '32/27 x1',
      '40/27 x1',
      '45/32 x1',
      '64/45 x1',
    ]);
  });

  it('row 3: pick 3/2: five cells, 5 of 7 degrees have one above, covered 7, used twice 3, highest 2', () => {
    const m = major();
    expect(cellsOf(m, '3/2')).toEqual([
      [1, 5],
      [3, 7],
      [4, 1],
      [5, 2],
      [6, 3],
    ]);
    expect(pairCoverage(m.groups[0].cells, m.N)).toEqual({
      matches: 5,
      above: 5,
      N: 7,
      covered: 7,
      multi: 3,
      highest: 2,
    });
  });

  it('row 4: cell (4,1) reads 3/2 and wraps; all wrap-around fifths are below the diagonal', () => {
    const m = major();
    const c = m.cells[3][0];
    expect(c?.ratio).toBe('3/2');
    expect(c?.wrap).toBe(true);
    expect(c?.c).toBeCloseTo(701.955, 2);
    expect(m.cells[0][4]?.wrap).toBe(false);
    for (const [i, j] of [
      [4, 1],
      [5, 2],
      [6, 3],
    ]) {
      expect(m.cells[i - 1][j - 1]?.wrap).toBe(true);
      expect(m.cells[i - 1][j - 1]?.ratio).toBe('3/2');
    }
    // wrap is exactly "to lies below from"
    expect(m.cells.flat().every((x) => !x || x.wrap === x.to < x.from)).toBe(true);
  });

  it('row 5: pick 5/4: cells (1,3) (4,6) (5,7), 3 of 7 above, covered 6, none twice, highest 1', () => {
    const m = major();
    expect(cellsOf(m, '5/4')).toEqual([
      [1, 3],
      [4, 6],
      [5, 7],
    ]);
    expect(pairCoverage(m.groups.find((g) => g.ratio === '5/4')!.cells, 7)).toEqual({
      matches: 3,
      above: 3,
      N: 7,
      covered: 6,
      multi: 0,
      highest: 1,
    });
  });

  it('row 6: pairs and chords differ: 5 fifths against 3 chords of 4:5:6', () => {
    const chords = findChords(rel(MAJOR), 1200, ['4:5:6'], 1);
    expect(chords).toHaveLength(3);
    expect(major().groups[0].count).toBe(5);
  });

  it('row 7: the steps column: 4-step intervals and 1-step intervals', () => {
    const m = major();
    const rows = stepsTable(m);
    const text = (k: number) =>
      rows[k - 1].items.map((i) => `${m.groups[i.group].ratio} x${i.count}`);
    expect(text(4)).toEqual(['3/2 x5', '40/27 x1', '64/45 x1']);
    expect(text(1)).toEqual(['9/8 x3', '10/9 x2', '16/15 x2']);
    expect(rows.every((r) => r.items.reduce((s, i) => s + i.count, 0) === 7)).toBe(true);
  });

  it('row 8: search 700 c at 3 c finds only the five 3/2 cells (2 c off)', () => {
    const l = locateInterval(major(), 700, 3);
    expect(l.cells).toHaveLength(5);
    expect(l.cells.every((c) => c.ratio === '3/2')).toBe(true);
    expect(l.worst).toBeCloseTo(1.955, 2);
  });

  it('row 9: search 700 c at 25 c adds cell (2,6), 40/27 at 680.4 c', () => {
    const l = locateInterval(major(), 700, 25);
    expect(l.cells).toHaveLength(6);
    const extra = l.cells.find((c) => c.ratio === '40/27')!;
    expect([extra.from + 1, extra.to + 1]).toEqual([2, 6]);
    expect(extra.c).toBeCloseTo(680.45, 1);
  });

  it('row 15: error against the nearest ratio at odd limit 9', () => {
    const m = major();
    const errOf = (ratio: string) => Math.abs(m.groups.find((g) => g.ratio === ratio)!.err);
    for (const r of ['32/27', '27/20', '40/27', '27/16']) {
      expect(errOf(r)).toBeCloseTo(21.506, 2);
    }
    for (const r of ['45/32', '64/45']) {
      expect(errOf(r)).toBeCloseTo(7.7, 1);
    }
    for (const r of ['16/15', '15/8']) {
      expect(errOf(r)).toBeCloseTo(70.67, 1);
    }
    for (const r of ['3/2', '4/3', '5/4', '5/3', '6/5', '8/5', '9/8', '10/9', '16/9', '9/5']) {
      expect(errOf(r)).toBeLessThan(1e-6);
    }
  });

  it('row 16 (size wheel): hue is the size over the repeat; equal match, near sizes are near, inversions mirror', () => {
    const m = major();
    const pos = wheelPositions(m, 1200, 'size');
    const at = (r: string) => pos[m.groups.find((g) => g.ratio === r)!.id];
    expect(at('3/2')).toBeCloseTo(701.955 / 1200, 5);
    expect(at('4/3') * 360).toBeCloseTo(149.41, 1);
    expect(at('3/2') * 360).toBeCloseTo(210.59, 1);
    expect(Math.abs(at('9/8') - at('10/9')) * 360).toBeLessThan(7); // 204 c against 182 c
    expect(at('4/3') + at('3/2')).toBeCloseTo(1, 5); // inversion mirrors
    expect(pos.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it('row 16 (rank): sizes sorted small to large, rank r at frac(r * 0.381966); neighbors contrast', () => {
    const m = major();
    const pos = wheelPositions(m, 1200, 'rank');
    const bySize = [...m.groups].sort((a, b) => a.c - b.c);
    bySize.forEach((g, r) => expect(pos[g.id]).toBeCloseTo((r * 0.381966) % 1, 6));
    expect(pos[bySize[0].id]).toBe(0);
    for (let r = 1; r < bySize.length; r++) {
      const d = Math.abs(pos[bySize[r].id] - pos[bySize[r - 1].id]);
      expect(Math.min(d, 1 - d)).toBeGreaterThan(0.1); // never two neighbors close together
    }
  });

  it('row 16b: strong = simplest ratio vivid, most complex faint; faint is the reverse', () => {
    const m = major();
    const strong = tintStrengths(m, 'strong');
    const faint = tintStrengths(m, 'faint');
    const id = (r: string) => m.groups.find((g) => g.ratio === r)!.id;
    expect(strong[id('3/2')]).toBeCloseTo(TINT_MAX, 6); // T 2.58, the lowest
    expect(strong[id('64/45')]).toBeCloseTo(TINT_MIN, 6); // T 11.49, the highest
    expect(faint[id('3/2')]).toBeCloseTo(TINT_MIN, 6);
    expect(faint[id('64/45')]).toBeCloseTo(TINT_MAX, 6);
    expect(strong[id('4/3')]).toBeGreaterThan(strong[id('5/4')]);
  });

  it('an EDO field has no ratios: every group gets the fixed middle strength', () => {
    const edo = [0, 200, 400, 500, 700, 900, 1100].map(centsNote);
    const m = intervalPairs(rel(edo), rep, 9)!;
    expect(tintStrengths(m, 'strong').every((s) => s === TINT_MIDDLE)).toBe(true);
    expect(tintStrengths(m, 'faint').every((s) => s === TINT_MIDDLE)).toBe(true);
    expect(wheelPositions(m, 1200, 'size')[0]).toBeCloseTo(100 / 1200, 6);
  });
});

describe('intervalPairs: other subsets', () => {
  it('12-EDO major scale: irrational groups by size, no ratio text, no crash', () => {
    const edo = [0, 200, 400, 500, 700, 900, 1100].map(centsNote);
    const m = intervalPairs(rel(edo), rep, 9)!;
    expect(m.cells.flat().filter(Boolean)).toHaveLength(42);
    expect(m.groups.every((g) => g.ratio === null && g.h === null)).toBe(true);
    expect(m.groups.map((g) => Math.round(g.c))).toEqual([
      100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100,
    ]);
    const count = (c: number) => m.groups.find((g) => Math.round(g.c) === c)!.count;
    expect(count(700)).toBe(6);
    expect(count(600)).toBe(2);
    expect(m.groups.reduce((s, g) => s + g.count, 0)).toBe(42);
    expect(m.cells[0][1]?.ratio).toBeNull();
  });

  it('irrational intervals sort after the rational ones', () => {
    const mixed = [P('1/1'), P('3/2'), centsNote(350)];
    const m = intervalPairs(rel(mixed), rep, 9)!;
    const firstIrr = m.groups.findIndex((g) => g.ratio === null);
    expect(firstIrr).toBeGreaterThan(0);
    expect(m.groups.slice(firstIrr).every((g) => g.ratio === null)).toBe(true);
  });

  it('one note: an empty matrix; two notes: two cells, a note and its wrap', () => {
    const one = intervalPairs(rel([P('1/1')]), rep)!;
    expect(one.N).toBe(1);
    expect(one.groups).toEqual([]);
    const two = intervalPairs(rel([P('1/1'), P('3/2')]), rep)!;
    expect(two.groups.map((g) => g.ratio)).toEqual(['3/2', '4/3']);
    expect(two.cells[1][0]?.wrap).toBe(true);
    expect(stepsTable(two)).toHaveLength(1);
  });

  it('an empty subset and more than the cap give null', () => {
    expect(intervalPairs([], rep)).toBeNull();
    const big = Array.from({ length: PAIRS_CAP + 1 }, (_, i) => centsNote((i * 1200) / 33));
    expect(intervalPairs(rel(big), rep)).toBeNull();
    const ok = Array.from({ length: PAIRS_CAP }, (_, i) => centsNote((i * 1200) / 32));
    expect(intervalPairs(rel(ok), rep)).not.toBeNull();
  });

  it('a mode starts the scale on another degree: the same intervals, other cells', () => {
    const m = intervalPairs(rel(MAJOR, 4), rep, 9)!;
    expect(m.groups).toHaveLength(18);
    expect(m.groups[0].ratio).toBe('3/2');
    expect(m.groups[0].count).toBe(5);
  });
});
