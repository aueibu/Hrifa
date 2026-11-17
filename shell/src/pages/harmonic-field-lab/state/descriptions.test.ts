import { describe, expect, it } from 'vitest';
import {
  emptyShelf,
  shelfReduce,
  stashChord,
  type ShelfChord,
  type StashInput,
} from './chordShelf';
import { genFromPreset, presetByName } from './generate';
import {
  MAX_DESCRIPTION,
  cleanDescription,
  describePreset,
  emptyLibrary,
  saveUserPreset,
} from './generatorLibrary';
import { initialState, labReducer, type Action, type LabState } from './labState';
import { libraryToStored, sanitizeLibrary } from './libraryStore';
import { sanitizeShelf, shelfToStored } from './shelfStore';

const H = genFromPreset(presetByName('Harmonics 8–15')!);
const run = (s: LabState, ...a: Action[]) => a.reduce(labReducer, s);
const input = (over: Partial<StashInput> = {}): StashInput => ({
  pitches: [
    { m: { '2': 0 }, c: 0 },
    { m: { '2': -2, '5': 1 }, c: 386.3137 },
    { m: { '2': -1, '3': 1 }, c: 701.955 },
  ],
  template: '4:5:6',
  rootDeg: 0,
  tol: 18,
  date: '2026-11-16T10:00:00.000Z',
  refHz: 261.6256,
  frame: 'parallel',
  parent: null,
  source: null,
  ...over,
});
const chordsOf = (s: LabState) => s.shelf.chords as ShelfChord[];
const storedChord = (s: { chords: unknown }) => (s.chords as Record<string, unknown>[])[0];

describe('cleanDescription (the one cleaner)', () => {
  it('trims, collapses line breaks and whitespace runs, cuts at 300, empty gives undefined', () => {
    expect(cleanDescription('  bright\r\n\n cadence \t chord  ')).toBe('bright cadence chord');
    expect(cleanDescription('   \n\t ')).toBeUndefined();
    expect(cleanDescription('')).toBeUndefined();
    expect(cleanDescription(5)).toBeUndefined();
    expect(cleanDescription(undefined)).toBeUndefined();
    expect(MAX_DESCRIPTION).toBe(300);
  });

  it('row 15: 400 characters are cut at 300 (and the cut does not leave a trailing space)', () => {
    expect(cleanDescription('x'.repeat(400))).toHaveLength(300);
    const spaced = `${'y'.repeat(299)} ${'z'.repeat(100)}`;
    expect(cleanDescription(spaced)).toBe('y'.repeat(299));
  });
});

describe('shelf chord description (rows 1 to 3, 13, 15)', () => {
  const stashed = (d?: string): LabState => ({
    ...initialState(),
    shelf: stashChord(emptyShelf(), input({ description: d })),
  });

  it('row 1: describe sets the text; the name stays; a reload of the stored shelf has it', () => {
    let s = stashed();
    expect(chordsOf(s)[0].name).toBe('Chord 1');
    expect(chordsOf(s)[0].description).toBeUndefined();
    s = labReducer(s, { type: 'shelf/describe', id: 'c1', description: ' bright cadence chord ' });
    expect(chordsOf(s)[0].description).toBe('bright cadence chord');
    expect(chordsOf(s)[0].name).toBe('Chord 1');
    const stored = JSON.parse(JSON.stringify(shelfToStored(s.shelf))) as { chords: unknown };
    expect(storedChord(stored).description).toBe('bright cadence chord');
    expect(sanitizeShelf(stored)!.chords).toEqual(s.shelf.chords);
  });

  it('row 2: a shelf stored before M5 loads unchanged and is written back without the field', () => {
    const before = shelfToStored(stashed().shelf);
    expect('description' in storedChord(before as { chords: unknown })).toBe(false);
    const loaded = sanitizeShelf(JSON.parse(JSON.stringify(before)))!;
    expect(loaded.chords[0].description).toBeUndefined();
    expect('description' in loaded.chords[0]).toBe(false);
    expect(shelfToStored(loaded)).toEqual(before);
  });

  it('row 3: clearing the text removes the field from the slot and from storage', () => {
    let s = stashed('bright');
    s = labReducer(s, { type: 'shelf/describe', id: 'c1', description: '' });
    expect('description' in chordsOf(s)[0]).toBe(false);
    const stored = shelfToStored(s.shelf);
    expect('description' in storedChord(stored as { chords: unknown })).toBe(false);
    // whitespace only clears too
    const again = labReducer(stashed('x'), {
      type: 'shelf/describe',
      id: 'c1',
      description: ' \n ',
    });
    expect('description' in chordsOf(again)[0]).toBe(false);
  });

  it('describe: unknown id and unchanged text return the same state; text is cleaned and cut', () => {
    const s = stashed('same');
    expect(labReducer(s, { type: 'shelf/describe', id: 'zz', description: 'x' })).toBe(s);
    expect(labReducer(s, { type: 'shelf/describe', id: 'c1', description: ' same ' })).toBe(s);
    const long = labReducer(s, { type: 'shelf/describe', id: 'c1', description: 'q'.repeat(400) });
    expect(chordsOf(long)[0].description).toHaveLength(300);
    expect(
      shelfReduce(s.shelf, { type: 'shelf/describe', id: 'c1', description: 'n' }).chords[0]
        .description
    ).toBe('n');
  });

  it('a stash can carry a description (cleaned); other chords are untouched by describe', () => {
    let s = stashed('  first  one ');
    expect(chordsOf(s)[0].description).toBe('first one');
    s = { ...s, shelf: stashChord(s.shelf, input()) };
    const t = labReducer(s, { type: 'shelf/describe', id: 'c2', description: 'second' });
    expect(chordsOf(t)[0]).toBe(chordsOf(s)[0]);
    expect(chordsOf(t)[1].description).toBe('second');
  });

  it('load: a stored description is cleaned and cut; a non-string is ignored', () => {
    const stored = JSON.parse(JSON.stringify(shelfToStored(stashed().shelf))) as {
      chords: Record<string, unknown>[];
    };
    stored.chords[0].description = `  a\n b ${'k'.repeat(400)}`;
    const a = sanitizeShelf(stored)!.chords[0].description!;
    expect(a).toHaveLength(300);
    expect(a.startsWith('a b k')).toBe(true);
    stored.chords[0].description = 12;
    expect(sanitizeShelf(stored)!.chords[0].description).toBeUndefined();
  });
});

describe('user preset description (rows 4, 13, 15)', () => {
  const lib0 = () =>
    saveUserPreset(emptyLibrary(), { name: 'Seven-limit pool', folder: 'Pools/Seven', gen: H }).lib;

  it('row 4: describePreset sets, cleans and clears; the field is absent when empty', () => {
    const lib = describePreset(lib0(), 'p1', '  ratios up to 7\nover 1/1 ');
    expect(lib.presets[0].description).toBe('ratios up to 7 over 1/1');
    expect(describePreset(lib, 'p1', 'ratios up to 7 over 1/1')).toBe(lib);
    expect(describePreset(lib, 'nope', 'x')).toBe(lib);
    const cleared = describePreset(lib, 'p1', ' ');
    expect('description' in cleared.presets[0]).toBe(false);
    expect(describePreset(lib0(), 'p1', '')).toEqual(lib0());
  });

  it('saving accepts an optional description; the name, folder and gen are kept', () => {
    const r = saveUserPreset(emptyLibrary(), {
      name: 'P',
      folder: 'A',
      gen: H,
      description: ' hi  there ',
    });
    expect(r.lib.presets[0]).toMatchObject({ name: 'P', folder: 'A', description: 'hi there' });
    expect(
      'description' in
        saveUserPreset(emptyLibrary(), { name: 'P', folder: '', gen: H }).lib.presets[0]
    ).toBe(false);
  });

  it('preset/save and preset/describe through the reducer; rename, move and update keep the description', () => {
    let s = run(initialState(), {
      type: 'preset/save',
      name: 'Pool',
      folder: 'Pools',
      description: 'seven',
    });
    expect(s.library.presets[0].description).toBe('seven');
    s = run(
      s,
      { type: 'preset/rename', id: 'p1', name: 'Pool 2' },
      { type: 'preset/move', id: 'p1', folder: 'Pools/Seven' },
      { type: 'gen/patch', patch: { h: 12 } },
      { type: 'preset/update' }
    );
    expect(s.library.presets[0]).toMatchObject({
      name: 'Pool 2',
      folder: 'Pools/Seven',
      description: 'seven',
    });
    s = run(s, { type: 'preset/describe', id: 'p1', description: 'seven and more' });
    expect(s.library.presets[0].description).toBe('seven and more');
    const before = s.library;
    expect(
      run(s, { type: 'preset/describe', id: 'p1', description: 'seven and more' }).library
    ).toBe(before);
    s = run(s, { type: 'preset/describe', id: 'p1', description: '' });
    expect('description' in s.library.presets[0]).toBe(false);
  });

  it('naming an Untitled generator keeps the description given with the name', () => {
    let s = run(
      initialState(),
      { type: 'gen/preset', name: 'Harmonics 8–15' },
      { type: 'gen/patch', patch: { h: 11 } },
      { type: 'sel/set', idx: [0, 2] },
      { type: 'subset/add' },
      { type: 'preset/save', name: 'Named', folder: '', description: 'from auto' }
    );
    expect(s.library.presets[0].description).toBe('from auto');
    s = run(s, { type: 'preset/save', name: 'Second', folder: '' });
    expect('description' in s.library.presets[1]).toBe(false);
  });

  it('round trip: stored only when set, read back equal; old data loads unchanged; cut at 300', () => {
    const plain = lib0();
    const plainStored = libraryToStored(plain) as { presets: Record<string, unknown>[] };
    expect('description' in plainStored.presets[0]).toBe(false);
    expect(sanitizeLibrary(JSON.parse(JSON.stringify(plainStored)))).toEqual(plain);

    const lib = describePreset(plain, 'p1', 'ratios up to 7 over 1/1');
    const stored = JSON.parse(JSON.stringify(libraryToStored(lib))) as {
      presets: Record<string, unknown>[];
    };
    expect(stored.presets[0].description).toBe('ratios up to 7 over 1/1');
    expect(sanitizeLibrary(stored)).toEqual(lib);

    stored.presets[0].description = `${'w'.repeat(400)}`;
    expect(sanitizeLibrary(stored)!.presets[0].description).toHaveLength(300);
    stored.presets[0].description = ['not', 'text'];
    expect(sanitizeLibrary(stored)!.presets[0].description).toBeUndefined();
  });
});
