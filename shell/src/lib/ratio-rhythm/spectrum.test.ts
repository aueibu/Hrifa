import { describe, expect, it } from 'vitest';
import { euclidSlots } from './euclid';
import {
  dft,
  distanceCounts,
  foldedDistances,
  fmtChips,
  hasTwoSizesPerStep,
  intervalSpectrum,
  propriety,
  proprietyLabel,
  spectrum,
} from './spectrum';

describe('interval content of 3-3-2 on 8', () => {
  const slots = [0, 3, 6];
  it('folded distances: 2 x1, 3 x2', () => {
    expect(fmtChips(foldedDistances(slots, 8))).toBe('2 ×1, 3 ×2');
    expect(distanceCounts(slots, 8)).toEqual([0, 0, 1, 2, 0]);
  });
  it('per-step spectrum: 1st step 2 x1, 3 x2; 2nd step 5 x2, 6 x1', () => {
    const rows = intervalSpectrum(slots, 8);
    expect(rows.map((r) => r.k)).toEqual([1, 2]);
    expect(fmtChips(rows[0].sizes)).toBe('2 ×1, 3 ×2');
    expect(fmtChips(rows[1].sizes)).toBe('5 ×2, 6 ×1');
    expect(rows.map((r) => r.variety)).toEqual([2, 2]);
  });
  it('is strictly proper and has at most two sizes per step', () => {
    const rows = intervalSpectrum(slots, 8);
    expect(propriety(rows).verdict).toBe('strictly proper');
    expect(proprietyLabel(propriety(rows))).toBe('strictly proper');
    expect(hasTwoSizesPerStep(rows)).toBe(true);
  });
});

describe('propriety', () => {
  it('E(5, 53) has two sizes per step and is strictly proper', () => {
    const rows = intervalSpectrum(euclidSlots(5, 53), 53);
    expect(rows.length).toBe(4);
    expect(hasTwoSizesPerStep(rows)).toBe(true);
    expect(rows[0].sizes.map((s) => s.size)).toEqual([10, 11]);
    expect(rows[1].sizes.map((s) => s.size)).toEqual([21, 22]);
    expect(propriety(rows).verdict).toBe('strictly proper');
  });
  it('the worked example (gaps 8 1 9 18 36) is not proper: a 2-step is smaller than a 1-step', () => {
    const rows = intervalSpectrum([0, 8, 9, 18, 36], 72);
    expect(rows[0].sizes.map((s) => s.size)).toEqual([1, 8, 9, 18, 36]);
    const p = propriety(rows);
    expect(p.verdict).toBe('improper');
    expect(proprietyLabel(p)).toBe('not proper');
    expect(p.pairs.length).toBeGreaterThan(0);
  });
  it('proper but not strict: an equal pair across steps', () => {
    // gaps 2 2 4 on 8: 1-steps 2, 2, 4; 2-steps 4, 6, 6: the 1-step 4 equals the 2-step 4
    const rows = intervalSpectrum([0, 2, 4], 8);
    expect(propriety(rows).verdict).toBe('proper');
  });
  it('fewer than two onsets gives no rows', () => {
    expect(intervalSpectrum([0], 8)).toEqual([]);
  });
});

describe('Fourier view', () => {
  it('has floor(L/2) independent strengths; j = 0 is the onset count', () => {
    expect(spectrum([0, 3, 6], 8).length).toBe(4);
    expect(dft([0, 3, 6], 8, 0).mag).toBeCloseTo(3, 12);
  });
  it('j and L - j mirror each other', () => {
    for (let j = 1; j < 8; j++) {
      expect(dft([0, 1, 4, 6], 12, j).mag).toBeCloseTo(dft([0, 1, 4, 6], 12, 12 - j).mag, 9);
    }
  });
  it('k equal steps put all the strength on multiples of k', () => {
    expect(dft([0, 3, 6, 9], 12, 4).mag).toBeCloseTo(4, 9);
    expect(dft([0, 3, 6, 9], 12, 1).mag).toBeCloseTo(0, 9);
  });
});
