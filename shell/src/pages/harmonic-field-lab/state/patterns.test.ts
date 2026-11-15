import { describe, expect, it } from 'vitest';
import { PRESET_PATTERNS, type Note } from '../../../lib/harmonic-field';
import { emptyShelf, shelfReduce } from './chordShelf';
import { initialState, labReducer, type Action, type LabState } from './labState';
import {
  MAX_PATTERNS,
  canonicalPattern,
  chosenPattern,
  defaultPatterns,
  patternsReduce,
  type PatternsState,
} from './patterns';
import { sketchPositionalPitches } from './sketchChord';

const run = (s: LabState, ...a: Action[]) => a.reduce(labReducer, s);
const edo12: Note[] = Array.from({ length: 12 }, (_, i) => ({ m: null, c: i * 100 }));
const rep: Note = { m: null, c: 1200 };
const cents = (n: Note[] | null) => n && n.map((x) => Math.round(x.c));

describe('pattern list reducer', () => {
  it('defaults are the presets', () => {
    expect(defaultPatterns().list).toEqual([...PRESET_PATTERNS]);
    expect(PRESET_PATTERNS).toEqual(['2-2', '2-2-2', '2-2-2-2', '2-3', '3-2', '1-1', '3-3']);
  });
  it('adds a typed custom pattern (canonical text), refuses invalid and duplicate with a reason', () => {
    let s = defaultPatterns();
    s = patternsReduce(s, { type: 'patterns/add', text: ' 2-3-2 ' });
    expect(s.list.at(-1)).toBe('2-3-2');
    expect(s.refusal).toBeNull();
    const bad = patternsReduce(s, { type: 'patterns/add', text: '2--3' });
    expect(bad.list).toBe(s.list);
    expect(bad.refusal?.reason).toMatch(/not a pattern/);
    const dup = patternsReduce(s, { type: 'patterns/add', text: '2-2' });
    expect(dup.list).toBe(s.list);
    expect(dup.refusal?.reason).toMatch(/already/);
    // the next good action clears the refusal
    expect(patternsReduce(dup, { type: 'patterns/add', text: '1-2' }).refusal).toBeNull();
  });
  it('caps at 40', () => {
    let s: PatternsState = { list: [], refusal: null };
    for (let a = 1; a <= 9; a++) {
      for (let b = 1; b <= 9; b++) {
        s = patternsReduce(s, { type: 'patterns/add', text: `${a}-${b}` });
      }
    }
    expect(s.list).toHaveLength(MAX_PATTERNS);
  });
  it('edit, delete, move, restore defaults', () => {
    let s = defaultPatterns();
    s = patternsReduce(s, { type: 'patterns/edit', at: 0, text: '2-4' });
    expect(s.list[0]).toBe('2-4');
    expect(patternsReduce(s, { type: 'patterns/edit', at: 0, text: '2-3' }).refusal).not.toBeNull();
    expect(patternsReduce(s, { type: 'patterns/edit', at: 0, text: 'x' }).list).toBe(s.list);
    expect(patternsReduce(s, { type: 'patterns/edit', at: 99, text: '2-5' })).toBe(s);
    s = patternsReduce(s, { type: 'patterns/delete', at: 1 });
    expect(s.list).not.toContain('2-2-2');
    s = patternsReduce(s, { type: 'patterns/move', from: 0, to: 99 });
    expect(s.list.at(-1)).toBe('2-4');
    s = patternsReduce(s, { type: 'patterns/restore' });
    expect(s.list).toEqual([...PRESET_PATTERNS]);
    expect(patternsReduce(s, { type: 'patterns/restore' })).toBe(s);
  });
  it('canonical and chosen pattern fall back to the first', () => {
    expect(canonicalPattern('2-3')).toBe('2-3');
    expect(canonicalPattern('0')).toBeNull();
    expect(chosenPattern(['2-2', '3-3'], '3-3')).toBe('3-3');
    expect(chosenPattern(['2-2', '3-3'], '9-9')).toBe('2-2');
    expect(chosenPattern(['2-2', '3-3'], null)).toBe('2-2');
    expect(chosenPattern([], '2-2')).toBeNull();
  });
  it('works through labReducer; unchanged state keeps identity', () => {
    const s0 = initialState();
    const s1 = run(s0, { type: 'patterns/add', text: '2-3-2' });
    expect(s1.patterns.list).toContain('2-3-2');
    expect(run(s1, { type: 'patterns/restore' }).patterns.list).toEqual([...PRESET_PATTERNS]);
    expect(labReducer(s0, { type: 'patterns/restore' })).toBe(s0);
    expect(labReducer(s0, { type: 'patterns/delete', at: 99 })).toBe(s0);
  });
});

describe('Sketch.positional', () => {
  it('is null by default; sketch/set can set and clear it', () => {
    let s = emptyShelf();
    expect(s.sketch.positional).toBeNull();
    s = shelfReduce(s, { type: 'sketch/set', patch: { positional: { pattern: '2-2' } } });
    expect(s.sketch.positional).toEqual({ pattern: '2-2' });
    expect(s.sketch.armed).toBe(false);
    // an invalid pattern clears positional mode
    const bad = shelfReduce(s, { type: 'sketch/set', patch: { positional: { pattern: 'x' } } });
    expect(bad.sketch.positional).toBeNull();
    // the ratio template stays as it was
    s = shelfReduce(s, { type: 'sketch/set', patch: { template: '4:5:6' } });
    expect(s.sketch.positional).toBeNull();
    expect(s.sketch.template).toBe('4:5:6');
  });
  it('sketch/armPositional keeps the ratio template; sketch/arm of a ratio template leaves positional mode', () => {
    let s = shelfReduce(emptyShelf(), { type: 'sketch/set', patch: { template: '4:5:6' } });
    s = shelfReduce(s, { type: 'sketch/armPositional', pattern: '3-3', rootDeg: 2 });
    expect(s.sketch).toMatchObject({
      template: '4:5:6',
      positional: { pattern: '3-3' },
      armed: true,
      rootDeg: 2,
    });
    expect(shelfReduce(s, { type: 'sketch/armPositional', pattern: 'bad' })).toBe(s);
    expect(shelfReduce(s, { type: 'sketch/armPositional', pattern: '3-3', rootDeg: 2 })).toBe(s);
    s = shelfReduce(s, { type: 'sketch/arm', template: '10:12:15' });
    expect(s.sketch.positional).toBeNull();
    // arming the same ratio template right after armPositional still leaves positional mode
    s = shelfReduce(emptyShelf(), { type: 'sketch/arm', template: '4:5:6' });
    s = shelfReduce(s, { type: 'sketch/armPositional', pattern: '2-2' });
    s = shelfReduce(s, { type: 'sketch/arm', template: '4:5:6' });
    expect(s.sketch.positional).toBeNull();
  });
  it('sketchPositionalPitches reads the pattern at the sketch root degree', () => {
    const major = [0, 2, 4, 5, 7, 9, 11];
    const sk = (rootDeg: number, pattern: string | null) => ({
      rootDeg,
      positional: pattern ? { pattern } : null,
    });
    expect(cents(sketchPositionalPitches(edo12, rep, major, 0, sk(0, '2-2')))).toEqual([
      0, 400, 700,
    ]);
    // the root degree wraps like the sketch row (rootDeg % N)
    expect(cents(sketchPositionalPitches(edo12, rep, major, 0, sk(8, '2-2')))).toEqual([
      200, 500, 900,
    ]);
    expect(sketchPositionalPitches(edo12, rep, major, 0, sk(0, null))).toBeNull();
    expect(sketchPositionalPitches(edo12, rep, [], 0, sk(0, '2-2'))).toBeNull();
    expect(sketchPositionalPitches(edo12, rep, major, 0, sk(0, 'x'))).toBeNull();
  });
});
