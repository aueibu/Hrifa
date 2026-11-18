import { describe, expect, it } from 'vitest';
import {
  MAX_PINS,
  addPin,
  braKet,
  canonicalPin,
  clearRow,
  movePin,
  removePin,
  sanitizePins,
  swapPins,
} from './pins';

describe('pin storage', () => {
  it('reads absent or damaged as empty lists and drops bad entries', () => {
    expect(sanitizePins(undefined)).toEqual({ ring: [], monzo: [] });
    expect(sanitizePins('x')).toEqual({ ring: [], monzo: [] });
    const p = sanitizePins({
      ring: ['81/80', '81/80', '2/4', 'junk', 7, '5/4'],
      monzo: ['81/80', '43/1', '3/2'],
    });
    expect(p.ring).toEqual(['81/80', '5/4']);
    // 43 is not a dialed prime
    expect(p.monzo).toEqual(['81/80', '3/2']);
  });
  it('keeps at most 128 per list', () => {
    const many = Array.from({ length: 300 }, (_, i) => `${i + 3}/${i + 2}`);
    expect(sanitizePins({ ring: many }).ring.length).toBeLessThanOrEqual(MAX_PINS);
  });
  it('canonical texts are exact, lowest terms, with BigInt-sized numbers', () => {
    expect(canonicalPin('6/4')).toBeNull();
    expect(canonicalPin('3/2')).toBe('3/2');
    const big = `${41n ** 12n}/1`;
    expect(canonicalPin(big)).toBe(big);
  });
});

describe('bra-ket text', () => {
  it('writes the exponents from 2 up to the largest prime used', () => {
    expect(braKet('81/80')).toBe('[-4 4 -1>');
    expect(braKet('3/2')).toBe('[-1 1>');
    expect(braKet('7/4')).toBe('[-2 0 0 1>');
    expect(braKet('2/1')).toBe('[1>');
    expect(braKet('43/1')).toBeNull();
  });
});

describe('pin list edits', () => {
  it('a repeat adds nothing and names the existing card; a full list refuses', () => {
    expect(addPin(['81/80'], '5/4')).toEqual({ result: 'added', list: ['81/80', '5/4'] });
    expect(addPin(['81/80'], '81/80')).toEqual({ result: 'duplicate', list: ['81/80'], at: 0 });
    const full = Array.from({ length: MAX_PINS }, (_, i) => `${i + 3}/${i + 2}`);
    expect(addPin(full, '1/3').result).toBe('full');
  });
  it('moves a card and shifts the ones between', () => {
    expect(movePin(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(movePin(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });
  it('swaps two cards', () => {
    const l = ['19/14', '26/19', '19/13', '27/17', '44/27'];
    expect(swapPins(l, 0, 4)).toEqual(['44/27', '26/19', '19/13', '27/17', '19/14']);
    expect(swapPins(l, 1, 1)).toEqual(l);
  });
  it('removes a card and clears a row of 8', () => {
    expect(removePin(['a', 'b', 'c'], 1)).toEqual(['a', 'c']);
    const ten = Array.from({ length: 10 }, (_, i) => String(i));
    expect(clearRow(ten, 0)).toEqual(['8', '9']);
    expect(clearRow(ten, 1)).toEqual(ten.slice(0, 8));
  });
});
