import { describe, expect, it } from 'vitest';
import {
  decodeOneToken,
  decodeScale,
  fmtClassLong,
  fmtOneToken,
  fmtShort,
  nameOf,
  parseName,
} from './names';
import { ratioStr } from './ratios';

const slots15 = [0, 3, 6, 10, 11, 12];

describe('15·6 example', () => {
  const n = nameOf(slots15, 15);
  it('long class name', () => {
    expect(fmtClassLong(n)).toBe('15·6 1-1-3-3-3-4');
    expect(n.L).toBe(15);
    expect(n.k).toBe(6);
  });
  it('scale, rhythm, class short forms', () => {
    expect(fmtShort(n.scale)).toBe('3-3-4-1-1-3');
    expect(fmtShort(n.rhythm)).toBe('1-1-3-3-3-4');
    expect(fmtShort(n.cls)).toBe('1-1-3-3-3-4');
  });
  it('one-token form with a barline before the root gap', () => {
    expect(n.rootAt).toBe(3);
    expect(fmtOneToken(n)).toBe('1-1-3|3-3-4');
  });
  it('scale decodes to slots 0 3 6 10 11 12 and the ratios', () => {
    const d = decodeScale(parseName('3-3-4-1-1-3')!.gaps);
    expect(d.L).toBe(15);
    expect(d.slots).toEqual(slots15);
    expect(d.ratios.map(ratioStr)).toEqual(['1/1', '6/5', '7/5', '5/3', '26/15', '9/5']);
  });
  it('one-token decodes to the same scale', () => {
    expect(decodeOneToken('1-1-3|3-3-4')!.slots).toEqual(slots15);
  });
});

describe('72 example', () => {
  const n = nameOf([0, 8, 9, 18, 36], 72);
  it('scale 8-1-9-18-36, rhythm 1-9-18-36-8, class 1-8-36-18-9', () => {
    expect(fmtShort(n.scale)).toBe('8-1-9-18-36');
    expect(fmtShort(n.rhythm)).toBe('1-9-18-36-8');
    expect(fmtShort(n.cls)).toBe('1-8-36-18-9');
    expect(n.mirrored).toBe(true);
    expect(fmtClassLong(n)).toBe('72·5 1-8-36-18-9');
  });
  it('one-token form', () => {
    expect(fmtOneToken(n)).toBe('1-9-18-36|8');
  });
  it('scale and one-token round-trip', () => {
    const p = parseName('8-1-9-18-36')!;
    expect(p.gaps).toEqual([8, 1, 9, 18, 36]);
    expect(decodeScale(p.gaps).slots).toEqual([0, 8, 9, 18, 36]);
    expect(decodeOneToken('1-9-18-36|8')!.slots).toEqual([0, 8, 9, 18, 36]);
    expect(decodeOneToken('1-9-18-36 | 8')!.slots).toEqual([0, 8, 9, 18, 36]);
  });
  it('still reads the old artifact text (angle brackets, spaced gaps)', () => {
    expect(parseName('⟨8 1 9 18 36⟩')!.gaps).toEqual([8, 1, 9, 18, 36]);
    expect(parseName('72·5 ⟨1 8 36 18 9⟩')!.gaps).toEqual([1, 8, 36, 18, 9]);
  });
});

describe('reduction, symmetry and parsing', () => {
  it('divides gaps by their GCD first', () => {
    const n = nameOf([0, 16, 18, 36, 72], 144);
    expect(n.factor).toBe(2);
    expect(n.L).toBe(72);
    expect(fmtShort(n.scale)).toBe('8-1-9-18-36');
  });
  it('a rhythm with rotational symmetry takes the first equivalent position', () => {
    const n = nameOf([0, 1, 3, 4, 6, 7], 9);
    expect(n.rhythm).toEqual([1, 2, 1, 2, 1, 2]);
    expect(n.rootAt).toBe(0);
    expect(fmtOneToken(n)).toBe('|1-2-1-2-1-2');
    const m = nameOf([0, 2, 3, 5, 6, 8], 9);
    expect(m.scale).toEqual([2, 1, 2, 1, 2, 1]);
    expect(m.rootAt).toBe(1);
    expect(fmtOneToken(m)).toBe('1|2-1-2-1-2');
  });
  it('a leading barline decodes with the root on the first gap', () => {
    expect(decodeOneToken('|1-2-1-2-1-2')!.slots).toEqual([0, 1, 3, 4, 6, 7]);
  });
  it('parse rejects junk', () => {
    expect(parseName('')).toBeNull();
    expect(parseName('⟨⟩')).toBeNull();
    expect(parseName('3-x-4')).toBeNull();
    expect(parseName('3--4')).toBeNull();
    expect(parseName('1|2|3')).toBeNull();
    expect(parseName('0-3')).toBeNull();
  });
  it('a run of digits with no separator is one gap', () => {
    expect(parseName('334113')!.gaps).toEqual([334113]);
    expect(parseName('15·6 1-1-3-3-3-4')!.gaps).toEqual([1, 1, 3, 3, 3, 4]);
  });
  it('encode/decode round trip', () => {
    for (const [slots, L] of [
      [slots15, 15],
      [[0, 8, 9, 18, 36], 72],
    ] as const) {
      const n = nameOf([...slots], L);
      const back = decodeScale(parseName(fmtShort(n.scale))!.gaps);
      expect(back.slots).toEqual(slots);
      expect(decodeOneToken(fmtOneToken(n))!.slots).toEqual(slots);
    }
  });
  it.each([
    [[0, 12], 13, '1|12'],
    [[0, 13], 25, '12|13'],
  ])('one-token round trip with two onsets: %j on %i', (slots, L, text) => {
    const n = nameOf(slots, L);
    expect(fmtOneToken(n)).toBe(text);
    const back = decodeOneToken(text)!;
    expect(back.L).toBe(L);
    expect(back.slots).toEqual(slots);
  });
});
