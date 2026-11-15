import { describe, expect, it } from 'vitest';
import { ratioNote, type Note } from '../../../lib/harmonic-field';
import { emptyShelf, stashChord, type StashInput } from './chordShelf';
import { sanitizeShelf, shelfToStored } from './shelfStore';

const edo = (...c: number[]): Note[] => c.map((x) => ({ m: null, c: x }));
const base: StashInput = {
  pitches: edo(0, 400, 700),
  template: '2-2 on 1',
  rootDeg: 0,
  pattern: '2-2',
  tail: '7 of 12-EDO · 400-300 c',
  tol: 18,
  date: '2026-11-15T10:00:00.000Z',
  refHz: 261.6256,
  frame: 'parallel',
  parent: null,
  source: null,
};

const stored = (tail?: unknown) => ({
  version: 1,
  chords: [
    {
      id: 'c1',
      name: 'x',
      pitches: [{ m: null, c: 0 }],
      template: null,
      rootDeg: null,
      ...(tail === undefined ? {} : { tail }),
    },
  ],
});

describe('scenario f: the stash keeps the positional tail', () => {
  it('a positional chord keeps `7 of 12-EDO · 400-300 c` through a store round trip', () => {
    const s = stashChord(emptyShelf(), base);
    expect(s.chords[0].tail).toBe('7 of 12-EDO · 400-300 c');
    const back = sanitizeShelf(JSON.parse(JSON.stringify(shelfToStored(s))))!;
    expect(back.chords[0].tail).toBe('7 of 12-EDO · 400-300 c');
    expect(back.chords[0].pattern).toBe('2-2');
  });

  it('a ratio chord has no tail and writes no tail key (stored as before)', () => {
    const s = stashChord(emptyShelf(), {
      ...base,
      pitches: [ratioNote(1, 1), ratioNote(5, 4), ratioNote(3, 2)],
      template: '4:5:6',
      pattern: null,
      tail: undefined,
    });
    expect(s.chords[0].tail).toBeNull();
    const out = shelfToStored(s) as { chords: object[] };
    expect('tail' in out.chords[0]).toBe(false);
  });

  it('old stored chords load with tail null; a damaged tail is dropped', () => {
    expect(sanitizeShelf(stored())!.chords[0].tail).toBeNull();
    expect(sanitizeShelf(stored(7))!.chords[0].tail).toBeNull();
    expect(sanitizeShelf(stored('y'.repeat(200)))!.chords[0].tail).toBeNull();
    expect(sanitizeShelf(stored(' t '))!.chords[0].tail).toBe('t');
  });
});
