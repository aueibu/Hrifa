import { describe, expect, it } from 'vitest';
import { parseInterval, type Note } from '../../../lib/harmonic-field';
import { ghostCents, ghostKey, ghostsOf } from './ghosts';
import { initialState, labReducer } from './labState';

const N = (s: string) => parseInterval(s) as Note;
const field = ['1/1', '9/8', '5/4', '3/2'].map(N);

describe('ghost keys', () => {
  it('count one pitch as one key to 0.01 c and give the cents back', () => {
    expect(ghostKey(386.3137)).toBe(ghostKey(386.314));
    expect(ghostCents(ghostKey(386.31))).toBeCloseTo(386.31, 6);
  });
});

describe('ghostsOf', () => {
  it('reduces into the repeat, de-duplicates octaves, sorts, and gives the signed distance to the nearest field note', () => {
    const c7 = 1200 * Math.log2(7 / 4); // 968.8 c, nearest field note is 3/2 at 701.96 (below) or the repeat (above)
    const g = ghostsOf(field, 1200, [c7 + 1200, c7, 100]);
    expect(g.map((x) => Math.round(x.c))).toEqual([100, 969]);
    expect(g[0].dist).toBeCloseTo(-100, 1); // 1/1 at 0 is 100 c below 100 c
    expect(g[1].dist).toBeCloseTo(1200 - c7, 1); // the repeat (1/1 again) is 231 c above
    expect(g[1].turn).toBeCloseTo(c7 / 1200, 6);
    expect(g[0].text).toMatch(/outside the field, nearest field note 100\.0 c below/);
  });

  it('is empty without a repeat, skips non-finite pitches and has no distance with an empty field', () => {
    expect(ghostsOf(field, 0, [100])).toEqual([]);
    expect(ghostsOf(field, 1200, [Number.NaN])).toEqual([]);
    expect(Number.isNaN(ghostsOf([], 1200, [100])[0].dist)).toBe(true);
  });
});

describe('sounding action carries ghosts', () => {
  it('stores them, ignores an identical report, and clears them with an empty one', () => {
    const s0 = initialState();
    expect(s0.soundingGhosts).toEqual([]);
    const s1 = labReducer(s0, { type: 'sounding', idx: [], ghosts: [386.31, 968.83] });
    expect(s1.soundingGhosts).toEqual([386.31, 968.83]);
    expect(labReducer(s1, { type: 'sounding', idx: [], ghosts: [386.31, 968.83] })).toBe(s1);
    expect(labReducer(s1, { type: 'sounding', idx: [] }).soundingGhosts).toEqual([]);
  });
});
