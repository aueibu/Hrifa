import { describe, expect, it } from 'vitest';
import { diamondTargets, reachOf } from './jiReach';

const c = (r: number) => 1200 * Math.log2(r);
const harmonics = (hs: number[]) => hs.map((h) => c(h / hs[0]));
const edo = (n: number) => Array.from({ length: n }, (_, k) => (k * 1200) / n);
const H8_15 = harmonics([8, 9, 10, 11, 12, 13, 14, 15]);
const find = (r: ReturnType<typeof reachOf>, ratio: string) =>
  r.targets.find((t) => t.ratio === ratio)!;
/** A pair as "from>to" in harmonics of the 8-15 field (degree + 8), with ^ for a wrap. */
const hname = (p: { fromDeg: number; toDeg: number; wrap: boolean }) =>
  `${p.fromDeg + 8}>${p.toDeg + 8}${p.wrap ? '^' : ''}`;
const line = (r: ReturnType<typeof reachOf>, limit: number) =>
  r.lines.find((l) => l.limit === limit)!;

describe('diamondTargets', () => {
  it('has 6, 12 and 40 targets for the 5, 7 and 13 limits, sorted by cents, 1/1 left out', () => {
    expect(diamondTargets(5)).toHaveLength(6);
    expect(diamondTargets(7)).toHaveLength(12);
    expect(diamondTargets(13)).toHaveLength(40);
    const t = diamondTargets(7);
    expect(t.map((x) => x.ratio)).toEqual([
      '8/7',
      '7/6',
      '6/5',
      '5/4',
      '4/3',
      '7/5',
      '10/7',
      '3/2',
      '8/5',
      '5/3',
      '12/7',
      '7/4',
    ]);
    expect(t.every((x, i) => i === 0 || x.cents >= t[i - 1].cents)).toBe(true);
    expect(t.every((x) => x.cents > 0 && x.cents < 1200)).toBe(true);
  });
});

describe('reachOf: Harmonics 8-15', () => {
  const r = reachOf(H8_15, 0, 7, 15);
  it('R1: 7/6 is played exactly by 12>14 and from the root is the 9/8, 63 c flat', () => {
    const t = find(r, '7/6');
    expect(t.best!.error).toBeCloseTo(0, 6);
    expect(t.root!.error).toBeCloseTo(-63.0, 1);
    expect(t.root!.toDeg).toBe(1);
  });
  it('R2: every 7-limit target is reachable by some pair, only 3 from the root', () => {
    const l = line(r, 7);
    expect(l.targets).toBe(12);
    expect(l.within).toBe(12);
    expect(l.withinRoot).toBe(3);
  });
  it('R8: the misfit is 0 at every limit', () => {
    const all = reachOf(H8_15, 0, 13, 15);
    for (const l of all.lines) {
      expect(l.misfit).toBeCloseTo(0, 6);
    }
  });
  it('R14: every occurrence, in the confirmed order, with the wrap marked', () => {
    expect(find(r, '3/2').pairs.map(hname)).toEqual(['8>12', '10>15', '12>9^']);
    expect(find(r, '5/4').pairs.map(hname)).toEqual(['8>10', '12>15']);
    expect(find(r, '6/5').pairs.map(hname)).toEqual(['10>12', '15>9^']);
    expect(find(r, '7/6').pairs.map(hname)).toEqual(['12>14']);
  });
  it('a tolerance of 0 keeps exact pairs only; a wide one adds near pairs sorted by size of error', () => {
    expect(find(reachOf(H8_15, 0, 7, 0), '3/2').pairs).toHaveLength(3);
    const wide = find(reachOf(H8_15, 0, 7, 60), '3/2').pairs;
    expect(wide.length).toBeGreaterThan(3);
    const errs = wide.map((p) => Math.round(Math.abs(p.error) * 1e6));
    expect([...errs].sort((a, b) => a - b)).toEqual(errs);
  });
});

describe('reachOf: subsets and modes', () => {
  it('R3: {8, 10, 12, 14} reaches all 12 targets by pairs, 3 from the root', () => {
    const r = reachOf(harmonics([8, 10, 12, 14]), 0, 7, 15);
    const l = line(r, 7);
    expect(l.within).toBe(12);
    expect(l.withinRoot).toBe(3);
    expect(find(r, '6/5').pairs).toHaveLength(1);
    expect(find(r, '7/5').pairs.length).toBeGreaterThan(0);
  });
  it('R5: one note reaches nothing', () => {
    const r = reachOf([0], 0, 7, 15);
    expect(r.targets).toHaveLength(12);
    for (const t of r.targets) {
      expect(t.pairs).toEqual([]);
      expect(t.best).toBeNull();
      expect(t.root).toBeNull();
    }
    expect(line(r, 7).within).toBe(0);
    expect(line(r, 7).misfit).toBeNull();
    expect(line(r, 7).worst).toBeNull();
  });
  it('From the root follows the mode root: from degree 4 (12) the 8-15 field plays 4/3 to 16/12 = 8', () => {
    const r = reachOf(H8_15, 4, 5, 15);
    // from 12: 15/12 = 5/4 is the note 15; 8 above wrapped (8 -> 16/12 = 4/3)
    expect(find(r, '5/4').root!.error).toBeCloseTo(0, 6);
    expect(find(r, '4/3').root!.error).toBeCloseTo(0, 6);
    expect(find(r, '4/3').root!.toDeg).toBe(4);
  });
});

describe('reachOf: equal temperaments', () => {
  it('R4: every interval occurs from every note, so Any two notes equals From the root', () => {
    for (const n of [12, 31]) {
      const r = reachOf(edo(n), 0, 7, 15);
      for (const t of r.targets) {
        expect(Math.abs(t.best!.error)).toBeCloseTo(Math.abs(t.root!.error), 6);
      }
    }
  });
  it('R6: 12-EDO errors and cumulative misfit', () => {
    const r = reachOf(edo(12), 0, 13, 15);
    const err = (x: string) => find(r, x).best!.error;
    expect(err('3/2')).toBeCloseTo(-2.0, 1);
    expect(err('5/4')).toBeCloseTo(13.7, 1);
    expect(err('7/4')).toBeCloseTo(31.2, 1);
    expect(err('11/8')).toBeCloseTo(48.7, 1);
    expect(err('13/8')).toBeCloseTo(-40.5, 1);
    expect(r.lines.filter((l) => !l.overall).map((l) => l.misfit!.toFixed(1))).toEqual([
      '3.8',
      '191.1',
      '1163.0',
      '3532.9',
      '5175.4',
    ]);
  });
  it('R7: 31-EDO errors and cumulative misfit', () => {
    const r = reachOf(edo(31), 0, 13, 15);
    const err = (x: string) => find(r, x).best!.error;
    expect(err('3/2')).toBeCloseTo(-5.2, 1);
    expect(err('5/4')).toBeCloseTo(0.8, 1);
    expect(err('7/4')).toBeCloseTo(-1.1, 1);
    expect(err('11/8')).toBeCloseTo(-9.4, 1);
    expect(err('13/8')).toBeCloseTo(11.1, 1);
    expect(r.lines.map((l) => l.misfit!.toFixed(1))).toEqual([
      '26.8',
      '27.5',
      '28.6',
      '116.7',
      '239.5',
    ]);
  });
  it('R9 to R11: 12-EDO within 5 and 15 c, average and worst', () => {
    const at = (limit: number, tol: number) => line(reachOf(edo(12), 0, limit, tol), limit);
    expect(at(5, 5).within).toBe(2);
    expect(at(5, 15).within).toBe(4);
    expect(at(5, 15).avg).toBeCloseTo(10.4, 1);
    expect(at(5, 15).worst!.ratio).toBe('6/5');
    expect(Math.abs(at(5, 15).worst!.error)).toBeCloseTo(15.6, 1);
    expect(at(7, 5).within).toBe(2);
    expect(at(7, 15).within).toBe(4);
    expect(at(7, 15).avg).toBeCloseTo(18.8, 1);
    expect(Math.abs(at(7, 15).worst!.error)).toBeCloseTo(33.1, 1);
    expect(at(13, 5).within).toBe(4);
    expect(at(13, 15).within).toBe(8);
    expect(at(13, 15).avg).toBeCloseTo(28.4, 1);
    expect(Math.abs(at(13, 15).worst!.error)).toBeCloseTo(49.4, 1);
  });
  it('R12, R13: 31-EDO', () => {
    const at = (limit: number, tol: number) => line(reachOf(edo(31), 0, limit, tol), limit);
    expect(at(7, 5).within).toBe(8);
    expect(at(7, 15).within).toBe(12);
    expect(at(7, 15).avg).toBeCloseTo(3.2, 1);
    expect(at(7, 15).worst!.ratio).toBe('6/5');
    expect(Math.abs(at(7, 15).worst!.error)).toBeCloseTo(6.0, 1);
    expect(at(13, 5).within).toBe(12);
    expect(at(13, 15).within).toBe(34);
    expect(at(13, 15).avg).toBeCloseTo(8.4, 1);
    expect(Math.abs(at(13, 15).worst!.error)).toBeCloseTo(18.2, 1);
  });
  it('R14: in 12-EDO every target occurs from every note (12 pairs)', () => {
    const r = reachOf(edo(12), 0, 5, 50);
    expect(find(r, '3/2').pairs).toHaveLength(12);
    expect(find(r, '5/4').pairs).toHaveLength(12);
  });
});

describe('reachOf: lines', () => {
  it('a composite limit gets one line per prime plus its own', () => {
    expect(reachOf(edo(12), 0, 9, 15).lines.map((l) => [l.limit, l.overall])).toEqual([
      [3, false],
      [5, false],
      [7, false],
      [9, true],
    ]);
    expect(reachOf(edo(12), 0, 15, 15).lines.map((l) => l.limit)).toEqual([3, 5, 7, 11, 13, 15]);
    expect(reachOf(edo(12), 0, 7, 15).lines.map((l) => l.limit)).toEqual([3, 5, 7]);
  });
});
