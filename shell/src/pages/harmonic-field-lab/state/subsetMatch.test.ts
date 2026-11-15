import { describe, expect, it } from 'vitest';
import { matchLevel, matchSentence } from './subsetMatch';

const r = (a: number, b: number) => ({ m: { '2': -1, '3': 1 }, c: a / b });

describe('subset match', () => {
  it('classifies full, partial and none', () => {
    expect(matchLevel(7, 7)).toBe('full');
    expect(matchLevel(0, 0)).toBe('full');
    expect(matchLevel(5, 7)).toBe('partial');
    expect(matchLevel(0, 7)).toBe('none');
  });

  it('words the tooltip: counts and missing pitches, or nothing in common', () => {
    expect(matchSentence(7, [])).toBe('');
    expect(matchSentence(0, [r(1, 1)])).toBe('No notes in common with these settings.');
    const miss = [{ m: null, c: 123.45 }, r(1, 1)];
    expect(matchSentence(5, miss)).toBe('5 of 7 notes in these settings. Missing: 123.5 c, 3/2.');
    const many = Array.from({ length: 10 }, (_, i) => ({ m: null, c: i }));
    expect(matchSentence(2, many)).toMatch(/Missing: .*, 7.0 c and 2 more\.$/);
  });
});
