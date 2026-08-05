import {
  defaultWordsA,
  defaultWordsB,
  deriveUsernameFromMilliseconds,
  cycleDurationMilliseconds,
  getInterleaveStride,
  greatestCommonDivisor,
  parseWordList,
} from './usernameSeeds';

describe('greatestCommonDivisor', () => {
  it('computes the GCD of two numbers', () => {
    expect(greatestCommonDivisor(12, 18)).toBe(6);
    expect(greatestCommonDivisor(7, 13)).toBe(1);
    expect(greatestCommonDivisor(9, 3)).toBe(3);
  });
});

describe('getInterleaveStride', () => {
  it('returns a stride coprime with the list length', () => {
    for (const length of [1, 2, 3, 4, 7, 12, 14]) {
      const stride = getInterleaveStride(length);
      expect(greatestCommonDivisor(stride, length)).toBe(1);
    }
  });
});

describe('deriveUsernameFromMilliseconds', () => {
  it('is deterministic for a given millisecond offset', () => {
    const first = deriveUsernameFromMilliseconds(90_000, defaultWordsA, defaultWordsB);
    const second = deriveUsernameFromMilliseconds(90_000, defaultWordsA, defaultWordsB);
    expect(first).toEqual(second);
  });

  it('produces a username made of one A word and one B word', () => {
    const result = deriveUsernameFromMilliseconds(5_000_000, defaultWordsA, defaultWordsB);
    expect(result.username).toBe(`${result.wordA}${result.wordB}`);
    expect(defaultWordsA).toContain(result.wordA);
    expect(defaultWordsB).toContain(result.wordB);
  });

  it('wraps around at the cycle boundary', () => {
    const start = deriveUsernameFromMilliseconds(0, defaultWordsA, defaultWordsB);
    const wrapped = deriveUsernameFromMilliseconds(
      cycleDurationMilliseconds,
      defaultWordsA,
      defaultWordsB
    );
    expect(wrapped.aIndex).toBe(start.aIndex);
    expect(wrapped.bIndex).toBe(start.bIndex);
    expect(wrapped.username).toBe(start.username);
  });

  it('covers the full Cartesian product across a cycle', () => {
    // Sized so cycleDurationMilliseconds / totalCombinations is an integer,
    // avoiding float round-trip error through the ms <-> flatIndex conversion.
    const wordsA = ['a0', 'a1', 'a2', 'a3'];
    const wordsB = ['b0', 'b1', 'b2'];
    const totalCombinations = wordsA.length * wordsB.length;
    const seen = new Set<string>();
    for (let i = 0; i < totalCombinations; i += 1) {
      const ms = (i / totalCombinations) * cycleDurationMilliseconds;
      const result = deriveUsernameFromMilliseconds(ms, wordsA, wordsB);
      seen.add(`${result.aIndex}-${result.bIndex}`);
    }
    expect(seen.size).toBe(totalCombinations);
  });
});

describe('parseWordList', () => {
  it('splits on newlines and commas, trims, and drops empties', () => {
    expect(parseWordList('foo, bar\nbaz\n\n , qux ')).toEqual(['foo', 'bar', 'baz', 'qux']);
  });
});
