/** M6b: the words for the gear's tooltip and description (`filterSummary`). */
import { describe, expect, it } from 'vitest';
import { PRIME_SLOTS, defaultGen, filterSummary } from './generate';

const mask = (on: number[]) => Array.from({ length: PRIME_SLOTS }, (_, i) => on.includes(i));

describe('filterSummary', () => {
  it('is null with every prime on and no odd limit', () => {
    expect(filterSummary(defaultGen())).toBeNull();
    expect(
      filterSummary({ mask: mask([...Array(PRIME_SLOTS).keys()]), oddLimit: undefined })
    ).toBeNull();
  });
  it('names the primes that are on when some are off', () => {
    expect(filterSummary({ mask: mask([0, 1, 2]) })).toBe('Filtering: primes 2 3 5');
    // the shared 97+ slot reads as it does on its chip
    expect(filterSummary({ mask: mask([0, 24]) })).toBe('Filtering: primes 2 97+');
    expect(filterSummary({ mask: mask([]) })).toBe('Filtering: primes none');
  });
  it('names the odd limit alone', () => {
    expect(filterSummary({ ...defaultGen(), oddLimit: 9 })).toBe('Filtering: odd limit 9');
  });
  it('names both, primes first', () => {
    expect(filterSummary({ mask: mask([0, 1, 2]), oddLimit: 9 })).toBe(
      'Filtering: primes 2 3 5, odd limit 9'
    );
  });
  it('ignores an odd limit that is not a usable number (the reducer never stores one)', () => {
    expect(filterSummary({ ...defaultGen(), oddLimit: 0 })).toBeNull();
    expect(filterSummary({ ...defaultGen(), oddLimit: 9999 })).toBe('Filtering: odd limit 4095');
  });
});
