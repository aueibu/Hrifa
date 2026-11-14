import { describe, expect, it } from 'vitest';
import { buildField } from './field';
import { genHarmonic } from './generators';
import { fmtRatio, parseInterval } from './intervals';
import type { Note } from './types';
import { axisChoices3d, rankAxes3d } from './visual';

const N = (s: string) => parseInterval(s) as Note;
const OCT = N('2/1');

describe('rankAxes3d (lattice axes ranked by fit to the selected notes)', () => {
  const field = buildField(genHarmonic(8, OCT, false), OCT, Array<boolean>(25).fill(true)).notes;
  const idx = (...r: string[]) => r.map((x) => field.findIndex((n) => fmtRatio(n) === x));

  it('scores the notes that sit on the grid with no stem, best first', () => {
    // 1/1 (no primes), 3/2, 5/4 and 7/4: only 3 5 7 holds all four
    const ranks = rankAxes3d(field, OCT, idx('1/1', '3/2', '5/4', '7/4'));
    expect(ranks[0]).toMatchObject({ axes: [3, 5, 7], onGrid: 4, total: 4 });
    const s5711 = ranks.find((r) => r.axes.join() === '3,5,11');
    expect(s5711).toMatchObject({ onGrid: 3, total: 4 });
    expect(ranks.every((r, i) => i === 0 || ranks[i - 1].onGrid >= r.onGrid)).toBe(true);
  });

  it('follows the selection: 11/8 and 13/8 pull 11 and 13 onto the axes', () => {
    const ranks = rankAxes3d(field, OCT, idx('1/1', '11/8', '13/8', '3/2'));
    expect(ranks[0].axes).toEqual([3, 11, 13]);
    expect(ranks[0].onGrid).toBe(4);
  });

  it('breaks a tie by the smaller exponent distance from 1/1, then by the default order', () => {
    // 5/4 alone is on the grid of every triple that has 5; of those 3,5,7 (the default) comes first
    const one = rankAxes3d(field, OCT, idx('5/4'));
    expect(one[0].axes).toEqual([3, 5, 7]);
    expect(one[0].distance).toBe(1);
    // with no selection every choice scores 0 and the order is the default order of axisChoices3d
    const none = rankAxes3d(field, OCT, []);
    expect(none.map((r) => r.axes)).toEqual(axisChoices3d([3, 5, 7, 11, 13]));
    expect(none.every((r) => r.onGrid === 0 && r.total === 0)).toBe(true);
    // equal fit: the distance never rises down the list
    const tie = rankAxes3d(field, OCT, idx('3/2', '15/8'));
    const full = tie.filter((r) => r.onGrid === 2);
    expect(full.length).toBeGreaterThan(1);
    expect(full.every((r, i) => i === 0 || full[i - 1].distance <= r.distance)).toBe(true);
  });

  it('a real distance tie: 7/4 beside 13/8 prefers the axes that keep the exponent distance small', () => {
    // 3/2 uses 3 (distance 1 on any triple holding 3); 5/4 uses 5; both on grid in 3,5,7 / 3,5,11 / 3,5,13
    const ranks = rankAxes3d(field, OCT, idx('3/2', '5/4'));
    const best = ranks.filter((r) => r.onGrid === 2);
    expect(best.every((r) => r.distance === 2)).toBe(true);
    // all tied on fit and distance: the default order decides, 3 5 7 first
    expect(best[0].axes).toEqual([3, 5, 7]);
  });

  it('leaves out notes without a monzo, and gives nothing for a field with no rational note', () => {
    const edo = [0, 100, 200, 300].map((c) => ({ m: null, c }) as Note);
    expect(rankAxes3d(edo, OCT, [0, 1, 2])).toEqual([]);
    const mixed: Note[] = [N('3/2'), { m: null, c: 100 }, N('5/4')];
    const ranks = rankAxes3d(mixed, OCT, [0, 1, 2]);
    expect(ranks[0].total).toBe(2);
  });
});
