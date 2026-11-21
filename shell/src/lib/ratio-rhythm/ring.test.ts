import { describe, expect, it } from 'vitest';
import { parseRatios, ratioStr } from './ratios';
import {
  gapsOf,
  integerRing,
  linearRing,
  linearRingBig,
  logRing,
  minimalRing,
  onsetStats,
  ratesGrid,
  ringRatios,
  rotateRing,
  rotateToOnset,
  slotRatio,
} from './ring';

const example = parseRatios('1/1 10/9 9/8 5/4 3/2').ratios;

describe('linear ring', () => {
  it('worked example: L 72, slots 0 8 9 18 36, gaps 8 1 9 18 36', () => {
    const ring = linearRing(example)!;
    expect(ring.L).toBe(72);
    expect(ring.slots).toEqual([0, 8, 9, 18, 36]);
    expect(gapsOf(ring.slots, ring.L)).toEqual([8, 1, 9, 18, 36]);
    expect(ringRatios(ring).map(ratioStr)).toEqual(['1/1', '10/9', '9/8', '5/4', '3/2']);
    expect(ratioStr(slotRatio(15, 12))).toBe('9/5');
  });
  it('bigint form agrees and survives a huge LCD', () => {
    expect(linearRingBig(example)).toEqual({ L: 72n, slots: [0n, 8n, 9n, 18n, 36n] });
    const big = parseRatios('1 10000000019/10000000000').ratios;
    expect(linearRing(big)!.L).toBe(10000000000);
    const huge = parseRatios('1 3/2 100000000000000000001/100000000000000000000', {
      reduce: false,
    }).ratios;
    expect(linearRing(huge)).toBeNull();
    expect(linearRingBig(huge).L).toBe(100000000000000000000n);
  });
});

describe('integer ring and GCD', () => {
  it('24:28:32:36:44 on 24 reduces to 6:7:8:9:11 on 6', () => {
    const r = integerRing([24, 28, 32, 36, 44], 24);
    expect(r.L).toBe(6);
    expect(r.factor).toBe(4);
    expect(r.slots).toEqual([0, 1, 2, 3, 5]);
    expect(r.harmonics).toEqual([6, 7, 8, 9, 11]);
  });
  it('minimalRing reduces a ring by the GCD of slots and L', () => {
    expect(minimalRing({ L: 24, slots: [0, 4, 8, 12, 20] })).toEqual({
      L: 6,
      slots: [0, 1, 2, 3, 5],
      factor: 4,
    });
    expect(minimalRing({ L: 72, slots: [0, 8, 9, 18, 36] }).factor).toBe(1);
  });
});

describe('rates reading', () => {
  it('1/1 7/6 25/19 13/6 needs 259,350 slots', () => {
    const rs = parseRatios('1/1 7/6 25/19 13/6', { reduce: false }).ratios;
    const g = ratesGrid(rs);
    expect(g.pulses).toEqual([114n, 133n, 150n, 247n]);
    expect(g.slots).toBe(259350n);
    // Inclusion-exclusion by hand: 644 - 65 + 22 - 1 = 600 (the canon's "about 600").
    expect(g.occupied).toBe(600);
  });
  it('with 13/6 octave-reduced to 13/12 the grid doubles', () => {
    const rs = parseRatios('1/1 7/6 25/19 13/6').ratios;
    expect(ratesGrid(rs).slots).toBe(518700n);
  });
});

describe('log ring', () => {
  it('rounds cents to N steps and merges ratios on one step', () => {
    const on24 = logRing(example, 24);
    expect(on24.onsets.map((o) => o.slot)).toEqual([0, 4, 8, 14]);
    expect(on24.onsets[1].ratios.map(ratioStr)).toEqual(['10/9', '9/8']);
    const on53 = logRing(example, 53);
    expect(on53.onsets.map((o) => o.slot)).toEqual([0, 8, 9, 17, 31]);
  });
});

describe('rotation (not re-rooting)', () => {
  it('shifts slots, keeps L and the cyclic order of gaps', () => {
    const ring = linearRing(example)!;
    const r = rotateToOnset(ring, 2);
    expect(r.L).toBe(72);
    expect(r.slots).toEqual([0, 9, 27, 63, 71]);
    expect(gapsOf(r.slots, r.L)).toEqual([9, 18, 36, 8, 1]);
    expect(rotateRing(ring, 72).slots).toEqual(ring.slots);
  });
});

describe('onset statistics', () => {
  it('worked example', () => {
    const s = onsetStats(linearRing(example)!);
    expect(s.k).toBe(5);
    expect(s.minIoi).toBe(1);
    expect(s.maxIoi).toBe(36);
    expect(s.density).toBeCloseTo(5 / 72);
    expect(s.oversampling).toBe(1);
    expect(s.distinctGaps).toBe(5);
    expect(s.variance).toBeCloseTo(
      ((8 - 14.4) ** 2 + (1 - 14.4) ** 2 + (9 - 14.4) ** 2 + (18 - 14.4) ** 2 + (36 - 14.4) ** 2) /
        5
    );
  });
});
