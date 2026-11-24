import { describe, expect, it } from 'vitest';
import { positiveModulo } from './alignment';

describe('positiveModulo', () => {
  it('wraps negative and large values into 0 to modulus - 1', () => {
    expect(positiveModulo(-1, 8)).toBe(7);
    expect(positiveModulo(17, 8)).toBe(1);
  });
});
