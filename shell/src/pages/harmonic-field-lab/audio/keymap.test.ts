import { describe, expect, it } from 'vitest';
import { parseInterval, rotateSubset, type Note } from '../../../lib/harmonic-field';
import {
  CHORD_KEYS,
  KEYS,
  MAX_SHIFT,
  chordSlotOfEvent,
  clampShift,
  keyId,
  pageOfEvent,
  playsChords,
  playsMelody,
  shiftOfEvent,
  slotOfEvent,
  slotTarget,
} from './keymap';
import { slotPitch, type PitchBase } from './plan';

const N = (s: string) => parseInterval(s) as Note;
const base: PitchBase = { baseHz: 100, rootC: 0, modeAtBase: true };

describe('melody keys v2', () => {
  it('has 16 slots: the bottom row then the home row; the top row is the chord row', () => {
    expect(KEYS).toBe('zxcvbnmasdfghjkl');
    expect(KEYS).toHaveLength(16);
    expect(CHORD_KEYS).toBe('qwertyuiop');
    for (let i = 0; i < 16; i++) {
      expect(slotOfEvent({ key: KEYS[i], code: `Key${KEYS[i].toUpperCase()}` })).toBe(i);
    }
  });

  it('the shifts, the old long layout, the brackets and the top row are no melody slots', () => {
    for (const [key, code] of [
      [',', 'Comma'],
      ['.', 'Period'],
      ['/', 'Slash'],
      [';', 'Semicolon'],
      ["'", 'Quote'],
      ['[', 'BracketLeft'],
      [']', 'BracketRight'],
      ['q', 'KeyQ'],
      ['p', 'KeyP'],
    ]) {
      expect(slotOfEvent({ key, code })).toBe(-1);
      expect(slotOfEvent({ key })).toBe(-1);
    }
  });

  it('chord keys, shifts and pages are found by physical code (and by key when there is no code)', () => {
    expect(chordSlotOfEvent({ key: 'Q', code: 'KeyQ' })).toBe(0);
    expect(chordSlotOfEvent({ key: 'p', code: 'KeyP' })).toBe(9);
    expect(chordSlotOfEvent({ key: 'e' })).toBe(2);
    expect(chordSlotOfEvent({ key: 'z', code: 'KeyZ' })).toBe(-1);
    expect(shiftOfEvent({ key: '<', code: 'Comma' })).toBe(-1);
    expect(shiftOfEvent({ key: '>', code: 'Period' })).toBe(1);
    expect(shiftOfEvent({ key: ',' })).toBe(-1);
    expect(shiftOfEvent({ key: 'z', code: 'KeyZ' })).toBe(0);
    expect(pageOfEvent({ key: '{', code: 'BracketLeft' })).toBe(-1);
    expect(pageOfEvent({ key: ']' })).toBe(1);
    expect(pageOfEvent({ key: 'q', code: 'KeyQ' })).toBe(0);
    expect(keyId({ key: 'Z', code: 'KeyZ' })).toBe('KeyZ');
  });

  it('what each keyboard mode plays', () => {
    expect([playsMelody('notes'), playsChords('notes')]).toEqual([true, false]);
    expect([playsMelody('chords'), playsChords('chords')]).toEqual([false, true]);
    expect([playsMelody('split'), playsChords('split')]).toEqual([true, true]);
  });

  it('the shift is clamped to +/-4 repeats and a slot adds it to its repeat', () => {
    expect(MAX_SHIFT).toBe(4);
    expect(clampShift(9)).toBe(4);
    expect(clampShift(-9)).toBe(-4);
    expect(clampShift(NaN)).toBe(0);
    expect(slotTarget(0, 7, 2)).toEqual({ deg: 0, oct: 2 });
    expect(slotTarget(8, 7, -1)).toEqual({ deg: 1, oct: 0 });
    expect(slotTarget(16, 7, 0)).toBeNull();
  });

  it('a shift moves the pitch by exactly one repeat: 2/1 for an octave scale, 3/1 for Bohlen-Pierce', () => {
    const oct = rotateSubset([N('1/1'), N('9/8'), N('5/4')], [0, 1, 2], 0, N('2/1'));
    const tri = rotateSubset([N('1/1'), N('9/7'), N('7/5')], [0, 1, 2], 0, N('3/1'));
    const hz = (rel: typeof oct, rep: string, shift: number) =>
      slotPitch(1, rel, N(rep).c, base, shift)!.hz;
    expect(hz(oct, '2/1', 1) / hz(oct, '2/1', 0)).toBeCloseTo(2, 9);
    expect(hz(oct, '2/1', -2) / hz(oct, '2/1', 0)).toBeCloseTo(1 / 4, 9);
    expect(hz(tri, '3/1', 1) / hz(tri, '3/1', 0)).toBeCloseTo(3, 9);
    expect(hz(tri, '3/1', 1)).toBeCloseTo(100 * (9 / 7) * 3, 6);
  });
});
