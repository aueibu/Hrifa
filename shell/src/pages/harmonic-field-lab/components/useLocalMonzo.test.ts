import { describe, expect, it } from 'vitest';
import { zeroMonzo } from '../../../lib/harmonic-field';
import { negateMonzo, previewMonzo, shownMonzoOf } from './useLocalMonzo';

describe('previewMonzo (M9e)', () => {
  it('is null without a hovered cell', () => {
    expect(previewMonzo(zeroMonzo(), null)).toBeNull();
  });

  it('sets only the hovered prime and leaves the painted monzo untouched', () => {
    // 81/80 painted = [-4 4 -1>, pointer on the 7 column at +1
    const painted = { ...zeroMonzo(), 2: -4, 3: 4, 5: -1 };
    const p = previewMonzo(painted, { prime: 7, value: 1 })!;
    expect(p).toMatchObject({ 2: -4, 3: 4, 5: -1, 7: 1 });
    expect(painted[7]).toBe(0);
    // the hovered prime's painted value is replaced, not added to
    expect(previewMonzo(painted, { prime: 5, value: 2 })![5]).toBe(2);
  });
});

describe('negateMonzo / shownMonzoOf (K13)', () => {
  const m8180 = { ...zeroMonzo(), 2: -4, 3: 4, 5: -1 };

  it('81/80 [-4 4 -1> shows as 80/81 [4 -4 1>, zeros stay +0, the input is untouched', () => {
    const n = negateMonzo(m8180);
    expect(n).toEqual({ ...zeroMonzo(), 2: 4, 3: -4, 5: 1 });
    expect(Object.is(n[7], 0)).toBe(true);
    expect(m8180[3]).toBe(4);
  });

  it('is its own inverse', () => {
    expect(negateMonzo(negateMonzo(m8180))).toEqual(m8180);
  });

  it('shownMonzoOf returns the same object when not inverted', () => {
    expect(shownMonzoOf(m8180, false)).toBe(m8180);
    expect(shownMonzoOf(m8180, true)).toEqual(negateMonzo(m8180));
  });

  it('painting the shown row r stores -r (what you see is what you set)', () => {
    // the shown view is the inverse; the user paints prime 7 at shown +1: the store gets -1, and the shown view then reads +1
    const stored = { ...m8180, 7: -1 };
    expect(shownMonzoOf(stored, true)[7]).toBe(1);
    expect(shownMonzoOf(stored, true)).toMatchObject({ 2: 4, 3: -4, 5: 1, 7: 1 });
  });
});
