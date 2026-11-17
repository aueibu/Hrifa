import { describe, expect, it } from 'vitest';
import {
  GENUS_HINT,
  GENUS_MAX_PRIME,
  MAXN,
  PRIMES,
  buildField,
  centsNote,
  cleanGenusN,
  cleanOddLimit,
  fmtGenus,
  fmtRatio,
  genEdo,
  genusCount,
  genusFromN,
  genusNotes,
  genusSummary,
  generatorKey,
  oddLimit,
  parseGenusN,
  parseInterval,
  passesOddLimit,
  ratioNote,
  type GeneratorInputs,
  type Note,
} from './index';

const OCT = ratioNote(2, 1);
const ALL = Array<boolean>(25).fill(true);
const ratios = (ns: readonly Note[]) => ns.map(fmtRatio);
const r = (n: number, d: number): Note => ratioNote(n, d);
const ok = (text: string) => {
  const g = parseGenusN(text);
  if ('error' in g) {
    throw new Error(`parse failed: ${g.error}`);
  }
  return g;
};

describe('genusNotes (scenario rows 1 to 5)', () => {
  it('row 1: 45 gives six notes', () => {
    expect(ratios(genusNotes(45n))).toEqual(['1/1', '9/8', '5/4', '45/32', '3/2', '15/8']);
  });
  it('row 2: 105 gives eight notes', () => {
    expect(ratios(genusNotes(105n))).toEqual([
      '1/1',
      '35/32',
      '5/4',
      '21/16',
      '3/2',
      '105/64',
      '7/4',
      '15/8',
    ]);
  });
  it('row 3: 225 gives nine notes', () => {
    expect(ratios(genusNotes(225n))).toEqual([
      '1/1',
      '9/8',
      '75/64',
      '5/4',
      '45/32',
      '3/2',
      '25/16',
      '225/128',
      '15/8',
    ]);
  });
  it('row 4: n = 1 is one note, 1/1', () => {
    expect(ratios(genusNotes(1n))).toEqual(['1/1']);
  });
  it('row 5: n = 32 is one note (powers of 2 vanish in the octave)', () => {
    expect(ratios(genusNotes(32n))).toEqual(['1/1']);
    // mixed: 2^5 x 3 is the same field as 3
    expect(ratios(genusNotes(96n))).toEqual(['1/1', '3/2']);
  });
  it('takes the number as digits too, and as a plain number', () => {
    expect(ratios(genusNotes('45'))).toEqual(ratios(genusNotes(45n)));
    expect(ratios(genusNotes(45))).toEqual(ratios(genusNotes(45n)));
  });
  it('notes are exact monzos, ascending, inside [1, repeat)', () => {
    const ns = genusNotes(225n);
    expect(ns.every((n) => n.m !== null)).toBe(true);
    expect(ns.map((n) => n.c)).toEqual([...ns.map((n) => n.c)].sort((a, b) => a - b));
    expect(ns.every((n) => n.c >= 0 && n.c < 1200)).toBe(true);
    // 45/32 as a monzo: 3^2 5 2^-5
    expect(ns[4].m).toEqual({ '2': -5, '3': 2, '5': 1 });
  });
  it('folds by the repeat: 45 in a tritave (3/1) is two notes, since powers of 3 vanish', () => {
    const tri = parseInterval('3/1') as Note;
    expect(ratios(genusNotes(45n, tri))).toEqual(['1/1', '5/3']);
  });
  it('folds by a repeat that is not a prime (4/1): powers of 2 do not vanish', () => {
    const quad = parseInterval('4/1') as Note;
    // divisors of 6: 1, 2, 3, 6 folded into [1, 4): 1, 2, 3, 3/2
    expect(ratios(genusNotes(6n, quad))).toEqual(['1/1', '3/2', '2/1', '3/1']);
  });
  it('a cents repeat keeps what is exact and turns the folded notes into cents', () => {
    const ns = genusNotes(15n, centsNote(700));
    expect(ns.length).toBe(4);
    expect(ns.every((n) => n.c >= 0 && n.c < 700)).toBe(true);
  });
});

describe('parseGenusN (scenario rows 6 and 7)', () => {
  it('accepts a plain number, powers, spaces and x', () => {
    for (const t of ['45', '3^2*5', '3 3 5', '3^2 x 5', '3^2 5', ' 3 ^ 2 * 5 ', '5*3*3', '3^2×5']) {
      const g = ok(t);
      expect(g.n).toBe(45n);
      expect(g.factors).toEqual([
        { p: 3, e: 2 },
        { p: 5, e: 1 },
      ]);
      expect(g.notes).toBe(6);
    }
  });
  it('a composite factor is fine (6 6 is 2^2 x 3^2)', () => {
    const g = ok('6 6');
    expect(g.n).toBe(36n);
    expect(g.factors).toEqual([
      { p: 2, e: 2 },
      { p: 3, e: 2 },
    ]);
    expect(g.notes).toBe(3);
  });
  it('1 and 32 are one note; 2^5 and a plain 32 agree', () => {
    expect(ok('1').notes).toBe(1);
    expect(ok('1').factors).toEqual([]);
    expect(ok('32').notes).toBe(1);
    expect(ok('2^5').n).toBe(32n);
    expect(ok('3^0').n).toBe(1n);
  });
  it('refuses what is not a whole number of at least 1, in one plain sentence', () => {
    for (const t of ['abc', '0', '-5', '3.5', '', '   ', '3^', '^2', '3^^2', 'x', '3 4a', '0^2']) {
      expect(parseGenusN(t)).toEqual({ error: GENUS_HINT });
    }
    expect(GENUS_HINT).toBe('Type a whole number such as 45 or 3^2*5.');
  });
  it('the largest allowed prime is the last entry of the lab prime table (89)', () => {
    expect(GENUS_MAX_PRIME).toBe(PRIMES[PRIMES.length - 1]);
    expect(GENUS_MAX_PRIME).toBe(89);
    expect(ok('89').notes).toBe(2);
    const e97 = parseGenusN('97');
    expect(e97).toEqual({
      error:
        'The largest prime allowed in a genus is 89; 97 is left after dividing out the primes 2 to 89.',
    });
    // a prime above 89 inside a longer expression, and inside a power
    expect('error' in parseGenusN('3^2*101')).toBe(true);
    expect('error' in parseGenusN('3 3 5 97')).toBe(true);
    expect('error' in parseGenusN('97^2')).toBe(true);
    // a composite of two large primes names what is left
    expect(parseGenusN('10403')).toEqual({
      error:
        'The largest prime allowed in a genus is 89; 10403 is left after dividing out the primes 2 to 89.',
    });
  });
  it('refuses an exponent above 4095', () => {
    expect(parseGenusN('3^4096')).toEqual({ error: 'Exponents above 4095 are not accepted.' });
    expect(parseGenusN('2^4096')).toEqual({ error: 'Exponents above 4095 are not accepted.' });
    expect(parseGenusN('3^2000000')).toEqual({ error: 'This number is too large.' });
    // but 2^4095 vanishes in the octave: one note
    expect(ok('2^4095').notes).toBe(1);
  });
  it('row 7: the cap is counted as the product of (e + 1) before anything is built', () => {
    expect(ok('3^10*5^10*7^10').notes).toBe(1331);
    expect(ok('3^11*5^11*7^11').notes).toBe(1728);
    const over = parseGenusN('3^12*5^12*7^12');
    expect(over).toEqual({ error: 'This genus has 2197 notes, the limit is 2048.' });
    expect(MAXN).toBe(2048);
    // a huge exponent is refused by the count without computing the number
    expect(parseGenusN('3^4000')).toEqual({
      error: 'This genus has 4001 notes, the limit is 2048.',
    });
  });
  it('row 7: 1331 and 1728 notes are really built; 2197 is refused with the same sentence', () => {
    const a = ok('3^10*5^10*7^10');
    const fa = buildField(genusNotes(a.n), OCT, ALL);
    expect(fa.notes.length).toBe(1331);
    expect(fa.truncated).toBe(false);
    const b = ok('3^11*5^11*7^11');
    expect(genusNotes(b.n).length).toBe(1728);
    const big = BigInt(3 ** 12) * BigInt(5 ** 12) * 7n ** 12n;
    expect(() => genusNotes(big)).toThrow('This genus has 2197 notes, the limit is 2048.');
  });
  it('powers of 2 are not counted against the cap (they vanish)', () => {
    expect(ok('2^100*3^10*5^10*7^10').notes).toBe(1331);
  });
  it('counts in a given repeat (the powers of the repeat prime vanish)', () => {
    const tri = parseInterval('3/1') as Note;
    expect(parseGenusN('3^12*5^12*7^12', tri)).toMatchObject({ notes: 169 });
    expect(genusCount([{ p: 3, e: 2 }], tri)).toBe(1n);
    expect(genusCount([{ p: 3, e: 2 }], OCT)).toBe(3n);
  });
  it('stored numbers read like typed ones', () => {
    expect(genusFromN('45')).toEqual(parseGenusN('45'));
    expect(genusFromN('abc')).toEqual({ error: GENUS_HINT });
    expect(genusFromN(undefined)).toEqual({ error: GENUS_HINT });
    expect(cleanGenusN('045')).toBeNull();
    expect(cleanGenusN(45)).toBe('45');
    expect(cleanGenusN(3.5)).toBeNull();
    expect(cleanGenusN(0)).toBeNull();
    expect(cleanGenusN('9'.repeat(6001))).toBeNull();
  });
  it('reads back what it says: the factor text and the summary', () => {
    expect(fmtGenus(ok('45').factors)).toBe('3^2 x 5');
    expect(genusSummary(ok('45'))).toBe('3^2 x 5, 6 notes');
    expect(genusSummary(ok('1'))).toBe('1, 1 note');
  });
});

describe('odd limit (scenario rows 8 to 13)', () => {
  const harmonics = Array.from({ length: 16 }, (_, i) => r(i + 1, 1));
  it('cleanOddLimit and passesOddLimit', () => {
    expect(cleanOddLimit(9)).toBe(9);
    for (const x of [0, -3, 2.5, NaN, Infinity, '9', null, undefined]) {
      expect(cleanOddLimit(x)).toBeNull();
    }
    expect(oddLimit(r(15, 8))).toBe(15n);
    expect(passesOddLimit(r(15, 8), 15)).toBe(true);
    expect(passesOddLimit(r(15, 8), 14)).toBe(false);
    expect(passesOddLimit(r(1, 1), 1)).toBe(true);
    expect(passesOddLimit(centsNote(386.3), 1)).toBe(true);
  });
  it('row 8: harmonics 1 to 16 with limit 9', () => {
    expect(ratios(buildField(harmonics, OCT, ALL).notes)).toEqual([
      '1/1',
      '9/8',
      '5/4',
      '11/8',
      '3/2',
      '13/8',
      '7/4',
      '15/8',
    ]);
    expect(ratios(buildField(harmonics, OCT, ALL, 9).notes)).toEqual([
      '1/1',
      '9/8',
      '5/4',
      '3/2',
      '7/4',
    ]);
  });
  const major = [r(1, 1), r(9, 8), r(5, 4), r(4, 3), r(3, 2), r(5, 3), r(15, 8)];
  it('row 9: the 5-limit major scale with limit 5', () => {
    expect(ratios(buildField(major, OCT, ALL, 5).notes)).toEqual([
      '1/1',
      '5/4',
      '4/3',
      '3/2',
      '5/3',
    ]);
  });
  it('row 10: the same scale with limit 15 keeps all seven', () => {
    expect(buildField(major, OCT, ALL, 15).notes.length).toBe(7);
    expect(buildField(major, OCT, ALL, 14).notes.length).toBe(6);
  });
  it('row 11: no limit (absent, null, zero, not whole) keeps all seven', () => {
    const base = ratios(buildField(major, OCT, ALL).notes);
    expect(base.length).toBe(7);
    for (const x of [undefined, null, 0, -1, 2.5]) {
      expect(ratios(buildField(major, OCT, ALL, x).notes)).toEqual(base);
    }
  });
  it('row 12: 12-EDO with limit 5 keeps all 12 (a note with no ratio is kept)', () => {
    expect(buildField(genEdo(12, OCT), OCT, ALL, 5).notes.length).toBe(12);
    // a mixed field: the ratio note is judged, the cents note is kept
    const mixed = buildField([r(1, 1), r(15, 8), centsNote(701.9)], OCT, ALL, 5);
    expect(mixed.notes.map((n) => n.m === null)).toEqual([false, true]);
  });
  it('row 13: the prime filter and the odd limit add up', () => {
    const raw = [r(1, 1), r(9, 8), r(81, 64), r(3, 2), r(27, 16), r(5, 4), r(7, 4), r(15, 8)];
    const three = ALL.map((_, i) => i < 2); // primes 2 and 3 only
    expect(ratios(buildField(raw, OCT, three).notes)).toEqual([
      '1/1',
      '9/8',
      '81/64',
      '3/2',
      '27/16',
    ]);
    expect(ratios(buildField(raw, OCT, ALL, 9).notes)).toEqual(['1/1', '9/8', '5/4', '3/2', '7/4']);
    expect(ratios(buildField(raw, OCT, three, 9).notes)).toEqual(['1/1', '9/8', '3/2']);
  });
  it('a limit that leaves nothing gives an empty field, never a throw', () => {
    const noOne = [r(9, 8), r(5, 4)];
    expect(buildField(noOne, OCT, ALL, 3).notes).toEqual([]);
  });
});

describe('generatorKey with an odd limit and a genus', () => {
  const base = (): GeneratorInputs => ({
    method: 'harmonic',
    rep: '2/1',
    h: 8,
    edoN: 12,
    shape: 'box',
    axes: [
      { on: true, g: '3/2', n: 12, ctr: 0 },
      { on: true, g: '5/4', n: 3, ctr: 1 },
      { on: false, g: '7/4', n: 3, ctr: 1 },
    ],
    dist: 3,
    bidir: true,
    cpsF: '1 3 5 7',
    cpsK: 2,
    custom: '9/8 5/4',
    mask: Array<boolean>(25).fill(true),
  });
  const ones = '1'.repeat(25);

  it('row 15: the key of a spec from before M6 is byte-identical (pinned strings)', () => {
    const a = base();
    expect(generatorKey(a)).toBe(`{"m":"harmonic","r":"1200.000000","k":"${ones}","h":8}`);
    expect(generatorKey({ ...a, method: 'sub' })).toBe(
      `{"m":"sub","r":"1200.000000","k":"${ones}","h":8}`
    );
    expect(generatorKey({ ...a, method: 'edo' })).toBe(
      `{"m":"edo","r":"1200.000000","k":"${ones}","n":12}`
    );
    expect(generatorKey({ ...a, method: 'lattice' })).toBe(
      `{"m":"lattice","r":"1200.000000","k":"${ones}","s":"b","a":[["701.955001",12,0],["386.313714",3,1]]}`
    );
    expect(generatorKey({ ...a, method: 'lattice', shape: 'diamond' })).toBe(
      `{"m":"lattice","r":"1200.000000","k":"${ones}","s":"d","a":["701.955001","386.313714"],"d":3,"b":true}`
    );
    expect(generatorKey({ ...a, method: 'cps' })).toBe(
      `{"m":"cps","r":"1200.000000","k":"${ones}","f":["0.000000","1901.955001","2786.313714","3368.825906"],"ck":2}`
    );
    expect(generatorKey({ ...a, method: 'custom' })).toBe(
      `{"m":"custom","r":"1200.000000","k":"${ones}","t":["203.910002","386.313714"]}`
    );
  });
  it('an unset, null, zero or non-whole limit leaves the key as it was', () => {
    const a = base();
    const was = generatorKey(a);
    for (const oddLimit of [undefined, null, 0, -4, 2.5]) {
      expect(generatorKey({ ...a, oddLimit })).toBe(was);
    }
    // a genusN on a box or diamond lattice is not part of the key
    const lat = { ...a, method: 'lattice' as const };
    expect(generatorKey({ ...lat, genusN: '45' })).toBe(generatorKey(lat));
    expect(generatorKey({ ...lat, shape: 'diamond', genusN: '45' })).toBe(
      generatorKey({ ...lat, shape: 'diamond' })
    );
  });
  it('a set limit enters the key, for every method, and different limits differ', () => {
    for (const method of ['harmonic', 'sub', 'edo', 'lattice', 'cps', 'custom'] as const) {
      const a = { ...base(), method };
      expect(generatorKey({ ...a, oddLimit: 9 })).not.toBe(generatorKey(a));
      expect(generatorKey({ ...a, oddLimit: 9 })).toContain('"o":9');
      expect(generatorKey({ ...a, oddLimit: 9 })).not.toBe(generatorKey({ ...a, oddLimit: 15 }));
    }
  });
  it('the genus shape keys by its number (never as custom) and ignores the axes', () => {
    const g = { ...base(), method: 'lattice' as const, shape: 'genus' as const, genusN: '45' };
    const key = generatorKey(g);
    expect(key).toBe(`{"m":"lattice","r":"1200.000000","k":"${ones}","s":"g","n":"45"}`);
    expect(key).not.toContain('custom');
    expect(generatorKey({ ...g, genusN: '105' })).not.toBe(key);
    expect(generatorKey({ ...g, axes: g.axes.map((a) => ({ ...a, n: 99, ctr: 7 })) })).toBe(key);
    expect(generatorKey({ ...g, rep: '3/1' })).not.toBe(key);
    // digits are canonical: "045" is not a readable number
    expect(generatorKey({ ...g, genusN: '045' })).toBe(generatorKey({ ...g, genusN: undefined }));
    expect(generatorKey({ ...g, oddLimit: 9 })).toContain('"o":9');
  });
});
