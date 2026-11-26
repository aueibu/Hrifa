import { describe, expect, it } from 'vitest';
import {
  alignToReference,
  chronotonicDistance,
  hamming,
  rescaleSlots,
  slotTimes,
  swapDistance,
} from './distance';
import { euclidSlots } from './euclid';
import { lcm } from './ratios';
import { quantize } from './tuning';

// One 500 ms beat at 120 BPM; the worked example on the 72 ring: slots 0 8 9 18 36
const ring = { L: 72, slots: [0, 8, 9, 18, 36] };
const CYCLE = 500;
const orig = slotTimes(ring.slots, 72, CYCLE);
const gridOf = (a: number, b: number) => Number(lcm(BigInt(a), BigInt(b)));

describe('Canon 5 table at 120 BPM', () => {
  it('onset times 0, 55.6, 62.5, 125, 250 ms', () => {
    expect(orig.map((t) => Math.round(t * 10) / 10)).toEqual([0, 55.6, 62.5, 125, 250]);
  });

  it('A: the 16 grid (merge): Hamming 1, swap 6.9 ms, chronotonic 772 ms^2', () => {
    const q = quantize(ring, 16);
    expect(q.targets).toEqual([0, 2, 2, 4, 8]);
    const timesA = slotTimes(q.targets, 16, CYCLE);
    const M = gridOf(72, 16); // 144
    expect(hamming(rescaleSlots(ring.slots, 72, M), rescaleSlots(q.targets, 16, M))).toBe(1);
    const swap = swapDistance(orig, timesA, CYCLE)!;
    expect(swap.cost.toFixed(1)).toBe('6.9');
    expect(Math.round(chronotonicDistance(orig, timesA, CYCLE))).toBe(772);
  });

  it('B: the 1/64 beat grid (0.87 ms shift): Hamming 2, swap 0.87 ms, chronotonic 95 ms^2', () => {
    const q = quantize(ring, 64);
    expect(q.targets).toEqual([0, 7, 8, 16, 32]);
    // 1-based 64ths 1, 8, 9, 17, 33 as in the canon
    expect(q.targets.map((t) => t + 1)).toEqual([1, 8, 9, 17, 33]);
    const timesB = slotTimes(q.targets, 64, CYCLE);
    const M = gridOf(72, 64); // 576
    expect(hamming(rescaleSlots(ring.slots, 72, M), rescaleSlots(q.targets, 64, M))).toBe(2);
    const swap = swapDistance(orig, timesB, CYCLE)!;
    expect(swap.cost.toFixed(2)).toBe('0.87');
    expect(Math.round(chronotonicDistance(orig, timesB, CYCLE))).toBe(95);
  });

  it('chronotonic area checked by hand: the merge of 10/9 onto 9/8', () => {
    // steps differ on [0, 55.56) by 62.5 - 55.56 and on [55.56, 62.5) by 62.5 - 6.94
    const d = 2 * (500 / 9) * (62.5 - 500 / 9);
    expect(d).toBeCloseTo(771.6, 0);
    const timesA = slotTimes([0, 2, 2, 4, 8], 16, CYCLE);
    expect(chronotonicDistance(orig, timesA, CYCLE)).toBeCloseTo(d, 6);
  });
});

describe('swap distance and the reference rhythm', () => {
  it('zero for the same rhythm, rotation-aware for a Euclidean reference', () => {
    expect(swapDistance([0, 10, 21, 31, 42], [0, 10, 21, 31, 42], 53)!.cost).toBe(0);
    const e = euclidSlots(5, 53);
    const rotated = e.map((x) => (x + 7) % 53).sort((a, b) => a - b);
    expect(alignToReference(rotated, e, 53)!.cost).toBe(0);
  });
  it('worked example against E(5, 72) costs a positive whole number of slots', () => {
    const al = alignToReference(ring.slots, euclidSlots(5, 72), 72)!;
    expect(al.cost).toBeGreaterThan(0);
    expect(Number.isInteger(al.cost)).toBe(true);
  });
  it('different counts have no distance', () => {
    expect(swapDistance([0, 1], [0, 1, 2], 8)).toBeNull();
  });
});
