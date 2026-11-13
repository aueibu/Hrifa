import { describe, expect, it } from 'vitest';
import { buildField } from './field';
import { genHarmonic } from './generators';
import { fmtRatio, parseInterval } from './intervals';
import type { Note } from './types';
import {
  axisChoices3d,
  bestEdos,
  curveMinima,
  defaultAxes3d,
  dissonanceCurve,
  edoErrors,
  edoFit,
  fmtHidden,
  latticeCoords2d,
  stemAngle2d,
  stemDir3d,
  isoGrid,
  isoPitch,
  isoQ,
  latticeCoords3d,
  nearestFieldNote,
} from './visual';

const N = (s: string) => parseInterval(s) as Note;
const cents = (...r: string[]) => r.map((s) => N(s).c);
const OCT = N('2/1');

describe('latticeCoords3d', () => {
  const field = buildField(genHarmonic(8, OCT, false), OCT, Array<boolean>(25).fill(true)).notes;
  const by = (r: string) => field.findIndex((n) => fmtRatio(n) === r);

  it('picks 3, 5, 7 as the default axes and lists every prime the field uses', () => {
    const L = latticeCoords3d(field, OCT);
    expect(L.axes).toEqual([3, 5, 7]);
    expect(L.available).toEqual([3, 5, 7, 11, 13]);
    expect(defaultAxes3d([5, 11, 13, 17])).toEqual([5, 11, 13]);
    expect(defaultAxes3d([3])).toEqual([3]);
  });

  it('places a note at its exponents on the chosen axes; a note on the axes has no stem', () => {
    const L = latticeCoords3d(field, OCT);
    const at = (r: string) => L.pts.find((p) => p.i === by(r))!;
    expect(at('1/1').pos).toEqual([0, 0, 0]);
    expect(at('3/2').pos).toEqual([1, 0, 0]);
    expect(at('5/4').pos).toEqual([0, 1, 0]);
    expect(at('7/4').pos).toEqual([0, 0, 1]);
    expect(at('9/8').pos).toEqual([2, 0, 0]);
    expect(at('15/8').pos).toEqual([1, 1, 0]);
    for (const r of ['1/1', '3/2', '5/4', '7/4', '9/8', '15/8']) {
      expect(at(r).stems).toEqual([]);
      expect(at(r).hidden).toEqual([]);
      expect(at(r).folded).toBe(false);
      expect(at(r).base).toEqual(at(r).pos);
    }
    expect(L.skipped).toBe(0);
  });

  it('draws 11/8 on a stem: base at the origin, one 11 segment, tip one step out', () => {
    const L = latticeCoords3d(field, OCT);
    const p = L.pts.find((q) => q.i === by('11/8'))!;
    expect(p.folded).toBe(true);
    expect(p.base).toEqual([0, 0, 0]);
    expect(p.hidden).toEqual([{ prime: 11, exp: 1 }]);
    expect(p.stems).toHaveLength(1);
    expect(p.stems[0].prime).toBe(11);
    expect(p.stems[0].from).toEqual([0, 0, 0]);
    expect(p.stems[0].to).toEqual(p.pos);
    expect(Math.hypot(...p.pos)).toBeCloseTo(1, 9);
    expect(p.pos).toEqual(stemDir3d(11));
    // 13/8 gets its own direction
    const q = L.pts.find((x) => x.i === by('13/8'))!;
    expect(q.pos).toEqual(stemDir3d(13));
    expect(q.pos).not.toEqual(p.pos);
  });

  it('every stem direction is oblique (no component zero) and different per prime', () => {
    const seen = new Set<string>();
    for (const p of [11, 13, 17, 19, 23, 29, 31, 37, 41]) {
      const d = stemDir3d(p);
      expect(Math.hypot(...d)).toBeCloseTo(1, 9);
      expect(d.every((c) => Math.abs(c) > 0.1)).toBe(true);
      seen.add(d.join());
    }
    expect(seen.size).toBe(9);
  });

  it('reverses the stem for a negative exponent, doubles it for a square, and chains hidden primes', () => {
    const notes = [N('1/1'), N('11/8'), N('8/11'), N('121/64'), N('143/128')];
    const L = latticeCoords3d(notes, OCT, [3, 5, 7]);
    const [, a, b, c, d] = L.pts;
    expect(a.pos).toEqual(stemDir3d(11));
    expect(b.hidden).toEqual([{ prime: 11, exp: -1 }]);
    b.pos.forEach((v, k) => expect(v).toBeCloseTo(-stemDir3d(11)[k], 9));
    expect(b.stems[0].to).toEqual(b.pos);
    expect(c.hidden).toEqual([{ prime: 11, exp: 2 }]);
    c.pos.forEach((v, k) => expect(v).toBeCloseTo(2 * stemDir3d(11)[k], 9));
    expect(d.stems).toHaveLength(2);
    expect(d.stems.map((s) => s.prime)).toEqual([11, 13]);
    expect(d.stems[1].from).toEqual(d.stems[0].to);
    expect(d.stems[0].from).toEqual(d.base);
    d.pos.forEach((v, k) => expect(v).toBeCloseTo(stemDir3d(11)[k] + stemDir3d(13)[k], 9));
    expect(d.pos).toEqual(d.stems[1].to);
  });

  it('moves a note onto an axis when its prime is chosen, and hides the 7 instead', () => {
    const M = latticeCoords3d(field, OCT, [3, 5, 11]);
    const e = M.pts.find((q) => q.i === by('11/8'))!;
    expect(e.pos).toEqual([0, 0, 1]);
    expect(e.stems).toEqual([]);
    const s = M.pts.find((q) => q.i === by('7/4'))!;
    expect(s.hidden).toEqual([{ prime: 7, exp: 1 }]);
    expect(s.base).toEqual([0, 0, 0]);
  });

  it('joins notes one prime step apart, on any prime', () => {
    const L = latticeCoords3d(field, OCT);
    const has = (a: string, b: string, p: number) =>
      L.edges.some(([x, y, ax]) => x === by(a) && y === by(b) && ax === p);
    expect(has('1/1', '3/2', 3)).toBe(true);
    expect(has('3/2', '9/8', 3)).toBe(true);
    expect(has('1/1', '5/4', 5)).toBe(true);
    expect(has('3/2', '15/8', 5)).toBe(true);
    expect(has('1/1', '9/8', 3)).toBe(false); // two steps
  });

  it('offers every triple of primes once, default first, and copes with irrational fields', () => {
    const c = axisChoices3d([3, 5, 7, 11, 13]);
    expect(c[0]).toEqual([3, 5, 7]);
    expect(c.length).toBe(10);
    expect(new Set(c.map((t) => t.join())).size).toBe(10);
    const edo = [{ m: null, c: 100 }] as Note[];
    expect(latticeCoords3d(edo, OCT).pts).toEqual([]);
  });
});

describe('latticeCoords2d (the same layout on a plane)', () => {
  const field = buildField(genHarmonic(8, OCT, false), OCT, Array<boolean>(25).fill(true)).notes;
  const by = (r: string) => field.findIndex((n) => fmtRatio(n) === r);

  it('puts axis notes on lines at 0, 60 and 120 degrees and gives them no stem', () => {
    const L = latticeCoords2d(field, OCT);
    const at = (r: string) => L.pts.find((p) => p.i === by(r))!;
    expect(at('1/1').pos).toEqual([0, 0]);
    expect(at('3/2').pos[1]).toBeCloseTo(0, 9);
    expect(at('3/2').pos[0]).toBeGreaterThan(0);
    expect(Math.atan2(at('5/4').pos[1], at('5/4').pos[0])).toBeCloseTo(Math.PI / 3, 9);
    expect(Math.atan2(at('7/4').pos[1], at('7/4').pos[0])).toBeCloseTo((2 * Math.PI) / 3, 9);
    expect(at('15/8').stems).toEqual([]);
  });

  it('draws 11/8 and 13/8 on stems at fixed angles away from the axes, a unit long', () => {
    const L = latticeCoords2d(field, OCT);
    for (const [r, prime] of [
      ['11/8', 11],
      ['13/8', 13],
    ] as const) {
      const p = L.pts.find((q) => q.i === by(r))!;
      expect(p.base).toEqual([0, 0]);
      expect(p.stems).toHaveLength(1);
      expect(Math.hypot(...p.pos)).toBeCloseTo(1, 9);
      const deg = ((stemAngle2d(prime) % 360) + 360) % 360;
      const off = deg % 60;
      expect(off).toBeGreaterThanOrEqual(10);
      expect(off).toBeLessThanOrEqual(50);
      expect(Math.atan2(p.pos[1], p.pos[0]) * (180 / Math.PI) + 360).toBeCloseTo(
        deg + (deg > 180 ? 0 : 360),
        6
      );
    }
    expect(stemAngle2d(11)).not.toBe(stemAngle2d(13));
  });
});

describe('fmtHidden', () => {
  it('writes the prime with its signed exponent raised', () => {
    expect(fmtHidden({ prime: 11, exp: 1 })).toBe('11⁺¹');
    expect(fmtHidden({ prime: 11, exp: -1 })).toBe('11⁻¹');
    expect(fmtHidden({ prime: 11, exp: 2 })).toBe('11⁺²');
    expect(fmtHidden({ prime: 13, exp: 12 })).toBe('13⁺¹²');
  });
});

describe('EDO fit', () => {
  const row = (rows: ReturnType<typeof edoFit>, n: number) => rows.find((r) => r.n === n)!;

  it('covers 5 to 72 with the step size', () => {
    const rows = edoFit(cents('1/1', '5/4', '3/2'), 1200);
    expect(rows[0].n).toBe(5);
    expect(rows[rows.length - 1].n).toBe(72);
    expect(rows).toHaveLength(68);
    expect(row(rows, 12).step).toBe(100);
    expect(row(rows, 31).step).toBeCloseTo(38.71, 2);
  });

  it('puts a just major triad 13.7 c from 12-EDO (the third), as the tuner strip says', () => {
    const r = row(edoFit(cents('1/1', '5/4', '3/2'), 1200), 12);
    expect(r.worst).toBeCloseTo(13.69, 2);
    expect(r.mean).toBeCloseTo((0 + 13.686 + 1.955) / 3, 2);
    expect(r.worstRel).toBeCloseTo(0.1369, 3);
  });

  it('says 31-EDO beats 12-EDO for the harmonic seventh chord 4:5:6:7', () => {
    const rows = edoFit(cents('1/1', '5/4', '3/2', '7/4'), 1200);
    expect(row(rows, 31).worst).toBeLessThan(row(rows, 12).worst);
    expect(row(rows, 12).worst).toBeCloseTo(31.17, 1);
    expect(row(rows, 31).worst).toBeLessThan(6);
  });

  it('fits a 12-EDO scale exactly in 12, 24, 36, 48, 60 and 72', () => {
    const rows = edoFit([0, 200, 400, 500, 700, 900, 1100], 1200);
    for (const n of [12, 24, 36, 48, 60, 72]) {
      expect(row(rows, n).worst).toBeCloseTo(0, 9);
      expect(row(rows, n).mean).toBeCloseTo(0, 9);
    }
    expect(row(rows, 19).worst).toBeGreaterThan(5);
  });

  it('wraps a note near the repeat to the nearest step, and works for another repeat', () => {
    expect(edoErrors([1195], 1200, 12)[0]).toBeCloseTo(-5, 9);
    // a tritave (1901.955 c): 3/2 (701.955 c) in 13-ED3 (step 146.3 c): 702 / 146.3 = 4.8 -> 5 steps
    const e = edoErrors([701.955], 1901.955, 13)[0];
    expect(e).toBeCloseTo(701.955 - 5 * (1901.955 / 13), 6);
  });

  it('names a few best n: records only, ascending, at most k', () => {
    const rows = edoFit(cents('1/1', '5/4', '3/2', '7/4'), 1200);
    const best = bestEdos(rows, 4);
    expect(best.length).toBeLessThanOrEqual(4);
    expect([...best].sort((a, b) => a - b)).toEqual(best);
    for (const n of best) {
      const w = row(rows, n).worst;
      expect(rows.filter((r) => r.n < n).every((r) => r.worst > w)).toBe(true);
    }
    expect(bestEdos(rows, 1)).toHaveLength(1);
    expect(bestEdos([], 3)).toEqual([]);
  });
});

describe('dissonance curve', () => {
  const curve = dissonanceCurve();
  const dips = curveMinima(curve);
  const near = (c: number, tol = 6) => dips.find((d) => Math.abs(d.c - c) <= tol);

  it('runs 0 to 1200 c in 1 c steps and is zero-ish at the ends relative to its peak', () => {
    expect(curve.cents[0]).toBe(0);
    expect(curve.cents[curve.cents.length - 1]).toBe(1200);
    expect(curve.values).toHaveLength(1201);
    expect(curve.values[0]).toBeLessThan(curve.max * 0.2);
    expect(Math.max(...curve.values)).toBe(curve.max);
  });

  it('peaks in the beating zone a little above the unison (rough), not at the unison', () => {
    const peak = curve.values.indexOf(curve.max);
    expect(peak).toBeGreaterThan(15);
    expect(peak).toBeLessThan(150);
  });

  it('has dips at the simple just intervals, labelled with their ratios', () => {
    for (const [c, r] of [
      [315.64, '6/5'],
      [386.31, '5/4'],
      [498.04, '4/3'],
      [701.96, '3/2'],
      [884.36, '5/3'],
    ] as const) {
      const d = near(c);
      expect(d).toBeDefined();
      expect(d!.ratio).toBe(r);
    }
  });

  it('reads the octave as the last dip and finds no dip where the curve is rising', () => {
    expect(dips[dips.length - 1].c).toBe(1200);
    for (const d of dips) {
      expect(curve.values[d.idx]).toBeLessThanOrEqual(curve.values[Math.max(0, d.idx - 1)]);
    }
    expect(curveMinima({ cents: [0, 1, 2, 3], values: [1, 2, 3, 4], max: 4 })).toHaveLength(1);
    expect(curveMinima({ cents: [0, 1, 2], values: [5, 5, 5], max: 5 })).toHaveLength(0);
  });
});

describe('isomorphic keyboard', () => {
  const field = cents('1/1', '9/8', '5/4', '4/3', '3/2', '5/3', '15/8');
  const g1 = N('3/2').c;

  it('maps hex coordinates to pitch: right is g1, up-right is g2', () => {
    expect(isoPitch(0, 0, 700, 1200)).toBe(0);
    expect(isoPitch(1, 0, 700, 1200)).toBe(700);
    expect(isoPitch(0, 1, 700, 1200)).toBe(1200);
    expect(isoPitch(-1, 1, 700, 1200)).toBe(500);
    expect(isoPitch(3, 1, 700, 1200, 3, 1)).toBe(0);
  });

  it('keeps rows rectangular: a row up shifts half a hex, q = col - floor(row / 2)', () => {
    expect([0, 1, 2, 3].map((r) => isoQ(5, r))).toEqual([5, 5, 4, 4]);
  });

  it('builds 6 rows of 10 with 1/1 at column 3, row 1; its right-hand neighbour is g1 up', () => {
    const g = isoGrid(field, 1200, { g1, g2: 1200 });
    expect(g).toHaveLength(60);
    const at = (col: number, row: number) => g.find((c) => c.col === col && c.row === row)!;
    expect(at(3, 1).pitch).toBeCloseTo(0, 9);
    expect(at(4, 1).pitch).toBeCloseTo(g1, 9);
    expect(at(3, 1).note).toBe(0);
    expect(at(4, 1).note).toBe(4); // 3/2
    expect(at(4, 1).err).toBeCloseTo(0, 6);
    // up and to the right of the origin (row 2 is even, so one column further along) is g2 = one octave up: still 1/1
    expect(at(4, 2).pitch).toBeCloseTo(1200, 9);
    expect(at(4, 2).note).toBe(0);
  });

  it('with 5/4 as the second generator, up-right of 1/1 is 5/4 and up-left is 5/4 over 3/2', () => {
    const g = isoGrid(field, 1200, { g1, g2: N('5/4').c });
    const origin = g.find((c) => c.col === 3 && c.row === 1)!;
    // the cell one row up and to the right: row 2 is even, so up-right is col 3 + 0 ... find by axial coordinates
    const upRight = g.find((c) => c.q === origin.q && c.r === origin.r + 1)!;
    expect(upRight.note).toBe(2);
    expect(upRight.pitch).toBeCloseTo(N('5/4').c, 9);
    const upLeft = g.find((c) => c.q === origin.q - 1 && c.r === origin.r + 1)!;
    expect(upLeft.pitch).toBeCloseTo(N('5/4').c - g1, 9);
    expect(upLeft.note).toBe(5); // 5/4 over 3/2 is 5/6, an octave up: 5/3
  });

  it('shows a note only within the tolerance, the nearest one, and wraps around the repeat', () => {
    expect(nearestFieldNote(1195, [0, 400], 1200, 10)).toEqual({ note: 0, err: -5 });
    expect(nearestFieldNote(1195, [0, 400], 1200, 4).note).toBeNull();
    expect(nearestFieldNote(390, [0, 386.31, 400], 1200, 20).note).toBe(1);
    expect(nearestFieldNote(250, [], 1200, 20).note).toBeNull();
  });

  it('tighter tolerance blanks more hexes', () => {
    const count = (tol: number) =>
      isoGrid(field, 1200, { g1, g2: N('5/4').c, tol }).filter((c) => c.note !== null).length;
    expect(count(5)).toBeLessThan(count(20));
    expect(count(20)).toBeLessThanOrEqual(count(35));
  });
});
