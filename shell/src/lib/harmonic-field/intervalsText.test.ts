import { describe, expect, it } from 'vitest';
import {
  centsNote,
  fmtMonzoVector,
  fmtTenney,
  fmtTopBottom,
  nameMonzoVector,
  nameTopBottom,
  parseInterval,
} from './intervals';

const note = (s: string) => {
  const n = parseInterval(s);
  if (!n) {
    throw new Error(s);
  }
  return n;
};

// [ratio, top / bottom, monzo vector, Tenney]: the confirmed M2 values table
const VALUES: [string, string, string, string][] = [
  ['1/1', '1', '[ ⟩', '0.00'],
  ['9/8', '3² / 2³', '[-3 2⟩', '6.17'],
  ['5/4', '5 / 2²', '[-2 0 1⟩', '4.32'],
  ['4/3', '2² / 3', '[2 -1⟩', '3.58'],
  ['3/2', '3 / 2', '[-1 1⟩', '2.58'],
  ['5/3', '5 / 3', '[0 -1 1⟩', '3.91'],
  ['15/8', '3·5 / 2³', '[-3 1 1⟩', '6.91'],
  ['11/8', '11 / 2³', '[-3 0 0 0 1⟩', '6.46'],
  ['13/8', '13 / 2³', '[-3 0 0 0 0 1⟩', '6.70'],
  ['7/4', '7 / 2²', '[-2 0 0 1⟩', '4.81'],
  ['7/5', '7 / 5', '[0 0 -1 1⟩', '5.13'],
  ['531441/524288', '3¹² / 2¹⁹', '[-19 12⟩', '38.02'],
];

describe('prime factorization text', () => {
  it.each(VALUES)('%s', (r, tb, v, t) => {
    const n = note(r);
    expect(fmtTopBottom(n)).toBe(tb);
    expect(fmtMonzoVector(n)).toBe(v);
    expect(fmtTenney(n)).toBe(t);
  });

  it('a note with no monzo has no text', () => {
    const n = centsNote(700);
    expect(fmtTopBottom(n)).toBeNull();
    expect(fmtMonzoVector(n)).toBeNull();
    expect(fmtTenney(n)).toBeNull();
    expect(nameTopBottom(n)).toBeNull();
    expect(nameMonzoVector(n)).toBeNull();
  });

  it('accessible names are words', () => {
    expect(nameTopBottom(note('9/8'))).toBe('3 to the 2, over 2 to the 3');
    expect(nameTopBottom(note('15/8'))).toBe('3 times 5, over 2 to the 3');
    expect(nameTopBottom(note('3/2'))).toBe('3, over 2');
    expect(nameTopBottom(note('1/1'))).toBe('1');
    expect(nameMonzoVector(note('9/8'))).toBe('monzo: exponents of 2 and 3, minus 3 and 2');
    expect(nameMonzoVector(note('15/8'))).toBe('monzo: exponents of 2, 3 and 5, minus 3, 1 and 1');
    expect(nameMonzoVector(note('1/1'))).toBe('monzo: no exponents, the ratio is 1/1');
  });
});
