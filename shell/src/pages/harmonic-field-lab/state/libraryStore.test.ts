import { describe, expect, it } from 'vitest';
import { ratioNote, type Note } from '../../../lib/harmonic-field';
import { genFromPreset, presetByName } from './generate';
import {
  addSubset,
  emptyLibrary,
  ensureUntitled,
  pushRecent,
  saveUserPreset,
  type GenLibrary,
} from './generatorLibrary';
import {
  genFromStored,
  genToStored,
  libraryToStored,
  sanitizeLibrary,
  sanitizePitch,
} from './libraryStore';

const r = (n: number, d: number): Note => ratioNote(n, d);
const H = genFromPreset(presetByName('Harmonics 8–15')!);

const sample = (): GenLibrary => {
  let lib = emptyLibrary();
  const p = saveUserPreset(lib, {
    name: 'Pool',
    folder: 'Pools/Seven',
    gen: { ...H, preset: '', h: 12 },
  });
  lib = p.lib;
  const u = ensureUntitled(lib, { ...H, preset: '', h: 9 });
  lib = u.lib;
  lib = addSubset(
    lib,
    p.key!,
    { pitches: [r(1, 1), r(5, 4), { m: null, c: 701.9 }], root: r(5, 4) },
    'Triad'
  ).lib;
  lib = addSubset(lib, u.key!, { pitches: [r(1, 1)], root: r(1, 1) }).lib;
  lib = addSubset(lib, 'b:Harmonics 8–15', { pitches: [r(1, 1), r(3, 2)], root: null }).lib;
  lib = pushRecent(lib, p.key!);
  return pushRecent(lib, 'b:Harmonics 8–15');
};

describe('generators.v1 shape and round trip', () => {
  it('serialises to plain JSON and reads back the same library', () => {
    const lib = sample();
    const json = JSON.parse(JSON.stringify(libraryToStored(lib))) as unknown;
    expect(sanitizeLibrary(json)).toEqual(lib);
  });

  it('the stored shape is self-contained (pitches, owners, folder as a plain string, no field positions)', () => {
    const j = libraryToStored(sample()) as {
      version: number;
      presets: { folder: string; gen: { gen: string; h: number } }[];
      subsets: { owner: string; pitches: { m: unknown; c: number }[]; root: unknown }[];
      recents: string[];
    };
    expect(j.version).toBe(1);
    expect(j.presets[0].folder).toBe('Pools/Seven');
    expect(j.presets[0].gen).toMatchObject({ gen: 'harmonic', h: 12 });
    expect(j.subsets[0].owner).toBe('p:p1');
    expect(j.subsets[0].pitches[1]).toEqual({ m: { '2': -2, '5': 1 }, c: expect.any(Number) });
    expect(j.subsets[0].pitches[2].m).toBeNull();
    expect(j.recents).toEqual(['b:Harmonics 8–15', 'p:p1']);
    expect(Object.keys(j.presets[0].gen)).not.toContain('selCents');
  });

  it('a generator survives the stored form', () => {
    const g = { ...H, preset: '', h: 17, mask: H.mask.map((b, i) => i !== 3 && b) };
    expect(genFromStored(JSON.parse(JSON.stringify(genToStored(g))))).toEqual(g);
  });
});

describe('sanitising (entry by entry)', () => {
  it('not a library gives null (the caller falls back to the legacy list or empty)', () => {
    for (const bad of [
      null,
      undefined,
      7,
      'x',
      [],
      {},
      { version: 1 },
      { presets: 'x', subsets: 4 },
    ]) {
      expect(sanitizeLibrary(bad)).toBeNull();
    }
    expect(sanitizeLibrary({ presets: [] })).toEqual(emptyLibrary());
  });

  it('a bad entry never loses the others', () => {
    const j = libraryToStored(sample()) as Record<string, unknown[]>;
    const lib = sanitizeLibrary({
      ...j,
      presets: [null, 4, { id: 'p1', name: 'no gen' }, ...j.presets, { name: 'x', gen: 'nope' }],
      untitled: ['x', ...j.untitled],
      subsets: [{ id: 's9', owner: 'nonsense', name: 'bad owner', pitches: [] }, ...j.subsets, 7],
      recents: [5, 'bad', ...j.recents, 'p:p1'],
    })!;
    expect(lib.presets.map((p) => p.name)).toEqual(['Pool']);
    expect(lib.untitled).toHaveLength(1);
    expect(lib.subsets.map((s) => s.name)).toEqual(['Triad', 'Subset 1', 'Subset 1']);
    expect(lib.recents).toEqual(['b:Harmonics 8–15', 'p:p1']);
  });

  it('bad pitches are dropped one by one, a plain-less monzo keeps its cents, a foreign root is repaired to none', () => {
    const lib = sanitizeLibrary({
      subsets: [
        {
          id: 's1',
          owner: 'b:Harmonics 8–15',
          name: 'x',
          pitches: [
            { m: {}, c: 0 },
            { c: 'x' },
            null,
            { m: { '4': 1 }, c: 400 },
            { m: { '3': 1.5 }, c: 5 },
            { m: null, c: Infinity },
          ],
          root: { m: { '3': 1 }, c: 702 },
        },
      ],
    })!;
    expect(lib.subsets[0].pitches).toEqual([
      { m: {}, c: 0 },
      { m: null, c: 400 },
      { m: null, c: 5 },
    ]);
    expect(lib.subsets[0].root).toBeNull();
    expect(sanitizePitch({ m: { '3': 1, '2': -1 }, c: 701.955 })).toEqual({
      m: { '3': 1, '2': -1 },
      c: 701.955,
    });
    expect(sanitizePitch({ m: { '3': 0 }, c: 1 })?.m).toBeNull();
  });

  it('duplicate or missing ids are renumbered, names and folders are cleaned, counters clear every id', () => {
    const g = genToStored(H);
    const lib = sanitizeLibrary({
      presets: [
        { id: 'p3', name: '  A   B ', folder: ' x // y ', gen: g },
        { id: 'p3', name: '', folder: 7, gen: g },
      ],
      subsets: [{ id: 's5', owner: 'p:p3', name: '', pitches: [] }],
      next: { preset: 1 },
    })!;
    expect(lib.presets.map((p) => [p.id, p.name, p.folder])).toEqual([
      ['p3', 'A B', 'x/y'],
      ['p2', 'Preset 2', ''],
    ]);
    expect(lib.subsets[0]).toMatchObject({ id: 's5', name: 'Subset 1' });
    expect(lib.next).toEqual({ preset: 4, untitled: 1, subset: 6 });
  });

  it('keeps well-formed entries it cannot use now (a gone owner, an unknown built-in), so a later save writes them back', () => {
    const raw = {
      presets: [],
      subsets: [
        { id: 's1', owner: 'p:p42', name: 'orphan', pitches: [{ m: {}, c: 0 }], root: null },
        {
          id: 's2',
          owner: 'b:Removed preset',
          name: 'gone',
          pitches: [{ m: null, c: 5 }],
          root: null,
        },
      ],
      recents: ['p:p42'],
    };
    const lib = sanitizeLibrary(raw)!;
    expect(lib.subsets.map((s) => s.owner)).toEqual(['p:p42', 'b:Removed preset']);
    const again = sanitizeLibrary(JSON.parse(JSON.stringify(libraryToStored(lib))))!;
    expect(again).toEqual(lib);
    expect(again.recents).toEqual(['p:p42']);
  });

  it('keeps every subset on load (no hidden cap at the old 650 level)', () => {
    const subsets = Array.from({ length: 1500 }, (_, i) => ({
      id: `s${i + 1}`,
      owner: 'b:Harmonics 8–15',
      name: `n${i}`,
      pitches: [{ m: null, c: i }],
      root: null,
    }));
    expect(sanitizeLibrary({ subsets })!.subsets).toHaveLength(1500);
  });
});
