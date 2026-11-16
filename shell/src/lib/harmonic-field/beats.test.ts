import { describe, expect, it } from 'vitest';
import {
  addedCells,
  autoBeatTarget,
  beatCell,
  beatCellName,
  beatSummary,
  beatWords,
  centsNote,
  drawnAdded,
  intervalPairs,
  locateInterval,
  parsePitchText,
  ratioNote,
  rotateSubset,
  type BeatTarget,
  type Note,
} from './index';

const REP = ratioNote(2, 1);
const edo12: Note[] = Array.from({ length: 12 }, (_, i) => centsNote(100 * i));
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const fiveLimit: Note[] = [
  ratioNote(1, 1),
  ratioNote(9, 8),
  ratioNote(5, 4),
  ratioNote(4, 3),
  ratioNote(3, 2),
  ratioNote(5, 3),
  ratioNote(15, 8),
];

function grid(field: Note[], idx: number[]) {
  const rel = rotateSubset(field, idx, 0, REP);
  const m = intervalPairs(rel, REP)!;
  /** Field place of degree i (not mode dependent). */
  const place = (i: number) => field[rel[i].src].c;
  return { rel, m, place };
}

type Opts = {
  tolC: number;
  picked?: BeatTarget | null;
  baseHz?: number;
  partialLimit?: number | null;
};
function cellOf(g: ReturnType<typeof grid>, from: number, to: number, o: Opts) {
  const cell = g.m.cells[from][to]!;
  const lo = g.place(from);
  return beatCell(lo, lo + cell.c, { repC: REP.c, baseHz: o.baseHz ?? 261.6256, ...o });
}
/** The beats of the cells a Find at `p/q` locates, as the Pairs panel would compute them. */
function found(g: ReturnType<typeof grid>, p: number, q: number, o: Opts) {
  const loc = locateInterval(g.m, (1200 * Math.log2(p / q)) % 1200, o.tolC);
  return loc.cells.map((c) => ({
    c,
    b: cellOf(g, c.from, c.to, { ...o, picked: { p, q } })!,
  }));
}
const r2 = (x: number) => Number(x.toFixed(2));

describe('beats from the confirmed Values table', () => {
  const scale = grid(edo12, [0, 2, 4, 5, 7, 9, 11]);

  it('row 1: 12-EDO scale, Find 3/2, tolerance 25', () => {
    const f = found(scale, 3, 2, { tolC: 25 });
    expect(
      f.map((x) => [NAMES[scale.rel[x.c.from].src], NAMES[scale.rel[x.c.to].src], r2(x.b.hz)])
    ).toEqual([
      ['C', 'G', -0.89],
      ['D', 'A', -0.99],
      ['E', 'B', -1.12],
      ['F', 'C', -1.18],
      ['G', 'D', -1.33],
      ['A', 'E', -1.49],
    ]);
    const s = beatSummary(f.map((x) => x.b));
    expect(s.count).toBe(6);
    expect([r2(s.total), r2(s.average), r2(s.highest)]).toEqual([7.0, 1.17, 1.49]);
  });

  it('row 2: Find 5/4, tolerance 15', () => {
    const f = found(scale, 5, 4, { tolC: 15 });
    expect(f.map((x) => r2(x.b.hz))).toEqual([10.38, 13.86, 15.56]);
    const s = beatSummary(f.map((x) => x.b));
    expect([r2(s.total), r2(s.average), r2(s.highest)]).toEqual([39.8, 13.27, 15.56]);
  });

  it('rows 3 and 4: 5-limit scale, Find 3/2, tolerance 25 then 3', () => {
    const g = grid(fiveLimit, [0, 1, 2, 3, 4, 5, 6]);
    const wide = found(g, 3, 2, { tolC: 25 });
    expect(
      wide
        .map((x) => r2(x.b.hz) + 0)
        .sort((a, b) => a - b)
        .map((v) => (v === 0 ? 0 : v))
    ).toEqual([-10.9, 0, 0, 0, 0, 0]);
    const s = beatSummary(wide.map((x) => x.b));
    expect([r2(s.total), r2(s.average), r2(s.highest)]).toEqual([10.9, 1.82, 10.9]);
    const tight = found(g, 3, 2, { tolC: 3 });
    expect(tight.length).toBe(5);
    const t = beatSummary(tight.map((x) => x.b));
    expect([r2(t.total), r2(t.average), r2(t.highest)]).toEqual([0, 0, 0]);
  });

  it('row 5: 12-EDO triad, automatic targets at tolerance 20', () => {
    const g = grid(edo12, [0, 4, 7]);
    const at = (a: number, b: number) => cellOf(g, a, b, { tolC: 20 })!;
    const want: [number, number, number, string][] = [
      [0, 1, 10.38, '5/4'],
      [0, 2, -0.89, '3/2'],
      [1, 0, -20.76, '8/5'],
      [1, 2, -17.79, '6/5'],
      [2, 0, 1.77, '4/3'],
      [2, 1, 17.79, '5/3'],
    ];
    for (const [a, b, hz, ratio] of want) {
      const c = at(a, b);
      expect(r2(c.hz)).toBe(hz);
      expect(`${c.target.p}/${c.target.q}`).toBe(ratio);
      expect(c.source).toBe('auto');
    }
  });

  it('row 6: triad with the added pure 3/2, including the two unison cells', () => {
    const g = grid(edo12, [0, 4, 7]);
    const added = drawnAdded(['3/2'], [0, 400, 700], REP.c);
    expect(added).toHaveLength(1);
    expect(added[0].c).toBeCloseTo(701.955, 3);
    const cells = addedCells([0, 400, 700], added, REP.c, 20);
    expect(cells).toHaveLength(6);
    const get = (fk: string, fi: number, tk: string, ti: number) => {
      const c = cells.find(
        (x) => x.from.kind === fk && x.from.i === fi && x.to.kind === tk && x.to.i === ti
      )!;
      return beatCell(c.loC, c.hiC, { repC: REP.c, baseHz: 261.6256, tolC: 20 })!;
    };
    const exp: [string, number, string, number, number, string][] = [
      ['subset', 0, 'added', 0, 0.0, '3/2'],
      ['subset', 1, 'added', 0, -15.57, '6/5'],
      ['subset', 2, 'added', 0, 0.44, '1/1'],
      ['added', 0, 'subset', 0, -0.0, '4/3'],
      ['added', 0, 'subset', 1, 15.57, '5/3'],
      ['added', 0, 'subset', 2, -0.44, '1/1'],
    ];
    for (const [fk, fi, tk, ti, hz, ratio] of exp) {
      const c = get(fk, fi, tk, ti);
      expect(r2(c.hz)).toBeCloseTo(hz, 2);
      expect(`${c.target.p}/${c.target.q}`).toBe(ratio);
    }
    // the subset cells are as in row 5 (an added pitch changes none of them)
    expect(r2(cellOf(g, 0, 1, { tolC: 20 })!.hz)).toBe(10.38);
    expect(g.m.N).toBe(3);
  });

  it('row 8: Find 15/8 shows +26.68 and +35.62, flagged only with a partial limit', () => {
    const f = found(scale, 15, 8, { tolC: 15 });
    expect(f.map((x) => r2(x.b.hz))).toEqual([26.68, 35.62]);
    for (const x of f) {
      expect(x.b.partials).toEqual([15, 8]);
      expect(x.b.theoretical).toBe(false);
    }
    const lim7 = found(scale, 15, 8, { tolC: 15, partialLimit: 7 });
    expect(lim7.map((x) => x.b.theoretical)).toEqual([true, true]);
    expect(lim7.map((x) => r2(x.b.hz))).toEqual([26.68, 35.62]);
    expect(found(scale, 15, 8, { tolC: 15, partialLimit: 15 }).map((x) => x.b.theoretical)).toEqual(
      [false, false]
    );
    const s = beatSummary(f.map((x) => x.b));
    expect([r2(s.total), r2(s.average), r2(s.highest)]).toEqual([62.3, 31.15, 35.62]);
    // 3/2 uses partials 3 and 2: not above a limit of 7
    expect(cellOf(scale, 0, 3, { tolC: 25, partialLimit: 7 })!.theoretical).toBe(false);
  });

  it('row 9: 1/1 at 440 Hz scales every beat by 440 / 261.6256', () => {
    const f = found(scale, 3, 2, { tolC: 25, baseHz: 440 });
    expect(r2(f[0].b.hz)).toBe(-1.49);
    expect(r2(f[5].b.hz)).toBe(-2.51);
  });

  it('row 15: the mirror cell is the upper note one repeat higher', () => {
    const g = grid(edo12, [0, 4, 7]);
    expect(r2(cellOf(g, 0, 2, { tolC: 20 })!.hz)).toBe(-0.89); // C -> G
    expect(r2(cellOf(g, 2, 0, { tolC: 20 })!.hz)).toBe(1.77); // G -> C, 4/3
  });

  it('a picked ratio applies only within the tolerance; other cells use the automatic target', () => {
    const g = grid(edo12, [0, 4, 7]);
    // Find 3/2 at tolerance 20: C->G is picked; C->E (400 c) falls back to automatic 5/4
    const pick = { p: 3, q: 2 };
    expect(cellOf(g, 0, 2, { tolC: 20, picked: pick })!.source).toBe('picked');
    const e = cellOf(g, 0, 1, { tolC: 20, picked: pick })!;
    expect(e.source).toBe('auto');
    expect(e.target).toEqual({ p: 5, q: 4 });
  });

  it('no target gives null', () => {
    expect(beatCell(0, 123.456, { repC: 1200, baseHz: 261.6256, tolC: 0.01 })).toBeNull();
  });
});

describe('automatic target', () => {
  it('simplest ratio, not the closest: 400 c is 5/4 and not 63/50', () => {
    expect(autoBeatTarget(400, 20)).toEqual({ p: 5, q: 4 });
    // the closest ratio to 400 c with terms up to 64 is not 5/4 (that is what `simplest` avoids)
    expect(autoBeatTarget(400, 0.5)).not.toEqual({ p: 5, q: 4 });
  });

  it('a unison, including a slightly negative interval, is 1/1', () => {
    expect(autoBeatTarget(0.4, 3)).toEqual({ p: 1, q: 1 });
    expect(autoBeatTarget(-1.955, 20)).toEqual({ p: 1, q: 1 });
  });

  it('respects a repeat of 3/1', () => {
    const rep3 = 1200 * Math.log2(3);
    expect(autoBeatTarget(rep3 - 1, 5, rep3)).toEqual({ p: 3, q: 1 });
    expect(autoBeatTarget(rep3 + 300, 5, rep3)).toBeNull();
  });
});

describe('summary and words', () => {
  it('an empty list is zeros', () => {
    expect(beatSummary([])).toEqual({ count: 0, total: 0, average: 0, highest: 0 });
  });
  it('sizes ignore signs', () => {
    expect(beatSummary([{ hz: -3 }, { hz: 1 }])).toEqual({
      count: 2,
      total: 4,
      average: 2,
      highest: 3,
    });
  });
  it('number words and the accessible name (row 14)', () => {
    expect(beatWords(-0.8866)).toBe('minus 0.89 hertz');
    expect(beatWords(10.38)).toBe('plus 10.38 hertz');
    expect(beatWords(-0.0001)).toBe('0.00 hertz');
    expect(beatCellName('C', 'G', -0.8866)).toBe('C to G, minus 0.89 hertz');
  });
  it('parsePitchText is what the Find box reads (a bare number is cents)', () => {
    expect(parsePitchText('3')).toMatchObject({ c: 3, canon: '3 c' });
    expect(parsePitchText('6/4')).toMatchObject({ canon: '3/2' });
  });
});
