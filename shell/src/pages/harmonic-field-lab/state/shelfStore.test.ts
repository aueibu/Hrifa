import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ratioNote, sketchPitches } from '../../../lib/harmonic-field';
import { MAX_CHORDS, stashChord, type ShelfState } from './chordShelf';
import { activeTab, initialState, labReducer, type Action, type LabState } from './labState';
import { KEY_CHORDSHELF, sanitizeTabs } from './persist';
import { loadShelf, sanitizeShelf, saveShelf, shelfToStored } from './shelfStore';

const run = (s: LabState, ...a: Action[]) => a.reduce(labReducer, s);

const sample = (): ShelfState => {
  let s = run(
    initialState(),
    { type: 'gen/preset', name: 'Harmonics 8–15' },
    { type: 'sel/set', idx: [0, 2, 4], mode: 1 },
    { type: 'tab/rename', index: 0, name: 'Src' },
    { type: 'ui', patch: { tol: 22, baseHz: 200, modePlayback: 'relative' } }
  );
  s = labReducer(s, {
    type: 'shelf/stash',
    stash: {
      pitches: sketchPitches(ratioNote(5, 4), '4:5:6')!,
      template: '4:5:6',
      rootDeg: 1,
      name: 'Major on 5/4',
      date: '2026-11-14T10:00:00.000Z',
    },
  });
  s = labReducer(s, { type: 'shelf/reload', id: 'c1' });
  s = labReducer(s, {
    type: 'shelf/stash',
    stash: { pitches: [{ m: null, c: 321.5 }], date: '2026-11-14T11:00:00.000Z' },
  });
  expect(activeTab(s).fromChord).toBe('c1');
  return s.shelf;
};

describe('chordshelf.v1 shape and round trip', () => {
  it('serialises to plain JSON and reads back the same chords', () => {
    const sh = sample();
    const json = JSON.parse(JSON.stringify(shelfToStored(sh))) as unknown;
    const back = sanitizeShelf(json)!;
    expect(back.chords).toEqual(sh.chords);
    expect(back.next).toBe(sh.next);
    // runtime parts start fresh
    expect(back.selected).toEqual([]);
    expect(back.sketch).toEqual({
      template: null,
      rootDeg: 0,
      armed: false,
      shape: null,
      exact: false,
      positional: null,
    });
  });

  it('is self-contained: pitches, provenance, generator inputs; no field positions', () => {
    const j = shelfToStored(sample()) as {
      version: number;
      chords: {
        pitches: { m: unknown; c: number }[];
        parent: string | null;
        frame: string;
        refHz: number;
        source: {
          gen: { gen: string; h: number };
          tab: string;
          subset: { pitches: unknown[]; root: unknown };
        };
      }[];
    };
    expect(j.version).toBe(1);
    expect(j.chords[0].pitches[0]).toEqual({ m: { '5': 1, '2': -2 }, c: expect.any(Number) });
    expect(j.chords[0].frame).toBe('relative');
    expect(j.chords[0].refHz).toBe(200);
    expect(j.chords[0].source.gen.h).toBe(8);
    expect(j.chords[0].source.tab).toBe('Src');
    expect(j.chords[0].source.subset.pitches).toHaveLength(3);
    expect(j.chords[1].parent).toBe('c1');
  });
});

describe('sanitizeShelf: bad data', () => {
  it('not a shelf gives null (the caller starts empty)', () => {
    for (const raw of [undefined, null, 5, 'x', [], {}, { chords: 'no' }]) {
      expect(sanitizeShelf(raw)).toBeNull();
    }
    expect(sanitizeShelf({ chords: [] })?.chords).toEqual([]);
  });

  it('drops a chord with damaged pitches, repairs the rest entry by entry', () => {
    const good = shelfToStored(sample()).chords as Record<string, unknown>[];
    const bad = [
      5,
      null,
      { ...good[0], id: 'c7', pitches: [] },
      { ...good[0], id: 'c8', pitches: [{ m: null, c: 'x' }] },
      { ...good[0], id: 'c9', pitches: [{ m: null, c: 100 }, { c: Infinity }] },
      {
        ...good[1],
        id: 'c1',
        name: 5,
        frame: 'weird',
        tol: -4,
        refHz: 'no',
        date: 7,
        parent: 'x',
        rootDeg: 1.5,
        template: 4,
      },
      { ...good[1], id: 'c1', source: { gen: 'bad' } },
    ];
    const sh = sanitizeShelf({ chords: [good[0], ...bad], next: 'zz' })!;
    expect(sh.chords).toHaveLength(3);
    expect(sh.chords[0]).toEqual(sanitizeShelf({ chords: [good[0]] })!.chords[0]);
    const fixed = sh.chords[1];
    expect(fixed.id).not.toBe('c1');
    expect(fixed.name).toBe('Chord 2');
    expect(fixed.frame).toBe('parallel');
    expect(fixed.tol).toBe(18);
    expect(fixed.refHz).toBe(261.6256);
    expect(fixed.date).toBe('');
    expect(fixed.parent).toBeNull();
    expect(fixed.rootDeg).toBeNull();
    expect(fixed.template).toBeNull();
    // an unusable source only loses the source: the chord still plays
    expect(sh.chords[2].source).toBeNull();
    expect(sh.chords[2].pitches).toHaveLength(
      good[1].pitches ? (good[1].pitches as unknown[]).length : 0
    );
    expect(new Set(sh.chords.map((c) => c.id)).size).toBe(3);
    expect(sh.next).toBeGreaterThan(Math.max(...sh.chords.map((c) => Number(c.id.slice(1)))));
  });

  it('a non-plain monzo loses its monzo and keeps its cents', () => {
    const sh = sanitizeShelf({
      chords: [
        {
          id: 'c1',
          name: 'x',
          pitches: [
            { m: { '4': 1 }, c: 100 },
            { m: { '3': 1.5 }, c: 5 },
          ],
        },
      ],
    })!;
    expect(sh.chords[0].pitches).toEqual([
      { m: null, c: 100 },
      { m: null, c: 5 },
    ]);
  });

  it('caps are enforced at load and equal the in-memory caps', () => {
    const one = { pitches: [{ m: null, c: 1 }] };
    const sh = sanitizeShelf({ chords: Array.from({ length: MAX_CHORDS + 5 }, () => one) })!;
    expect(sh.chords).toHaveLength(MAX_CHORDS);
    const tooMany = { pitches: Array.from({ length: 65 }, () => ({ m: null, c: 1 })) };
    expect(sanitizeShelf({ chords: [tooMany] })!.chords).toHaveLength(0);
  });

  it('a well-formed entry (even with an unknown future generator) is kept and written back', () => {
    const j = shelfToStored(sample()) as { chords: { source: { gen: Record<string, unknown> } }[] };
    j.chords[0].source.gen.gen = 'from-the-future';
    const sh = sanitizeShelf(j)!;
    // the generator falls back to defaults (as in generators.v1); the chord and its source stay
    expect(sh.chords).toHaveLength(2);
    expect(sh.chords[0].source).not.toBeNull();
    expect(shelfToStored(sh).chords).toHaveLength(2);
  });
});

describe('load and save', () => {
  const store = new Map<string, string>();
  const writes: string[] = [];
  beforeEach(() => {
    store.clear();
    writes.length = 0;
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => {
          writes.push(k);
          store.set(k, v);
        },
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('absent, corrupt or foreign data loads an empty shelf and writes nothing', () => {
    expect(loadShelf().chords).toEqual([]);
    store.set(KEY_CHORDSHELF, '{not json');
    expect(loadShelf().chords).toEqual([]);
    store.set(KEY_CHORDSHELF, '[1,2]');
    expect(loadShelf().chords).toEqual([]);
    expect(writes).toEqual([]);
  });

  it('save then load gives the same shelf; the key is the documented one', () => {
    const sh = sample();
    expect(saveShelf(sh)).toBe(true);
    expect(writes).toEqual(['hrifa.harmonic-field-lab.chordshelf.v1']);
    expect(loadShelf().chords).toEqual(sh.chords);
  });

  it('a save after a bad-data load writes only the kept chords, never fewer than loaded', () => {
    const j = shelfToStored(sample()) as { chords: unknown[] };
    store.set(
      KEY_CHORDSHELF,
      JSON.stringify({ ...j, chords: [...j.chords, { id: 'c5', pitches: [] }] })
    );
    const loaded = loadShelf();
    expect(loaded.chords).toHaveLength(2);
    saveShelf(loaded);
    expect(loadShelf().chords).toEqual(loaded.chords);
  });

  it('a failing write reports false', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('full');
        },
      },
    });
    expect(saveShelf(sample())).toBe(false);
  });
});

describe('tabs.v1 `from` (the chord a tab was reloaded from)', () => {
  it('is stored beside link, read back, and a malformed value is dropped', () => {
    const snap = {};
    const ok = sanitizeTabs({ active: 0, list: [{ id: 't1', name: null, from: 'c12', snap }] });
    expect(ok?.tabs[0].from).toBe('c12');
    const bad = sanitizeTabs({ active: 0, list: [{ id: 't1', name: null, from: 'x', snap }] });
    expect(bad?.tabs[0].from).toBeUndefined();
    const none = sanitizeTabs({ active: 0, list: [{ id: 't1', name: null, snap }] });
    expect('from' in none!.tabs[0]).toBe(false);
  });
});

describe('ids and stash sanitising', () => {
  it('a repaired id never collides with a later valid id and is never reused', () => {
    const p = [{ m: null, c: 1 }];
    const sh = sanitizeShelf({
      chords: [
        { pitches: p },
        { id: 'c1', pitches: p },
        { id: 'c1', pitches: p },
        { id: 'c2', pitches: p },
      ],
      next: 3,
    })!;
    expect(sh.chords.map((c) => c.id)).toEqual(['c3', 'c1', 'c4', 'c2']);
    expect(new Set(sh.chords.map((c) => c.id)).size).toBe(4);
    expect(sh.next).toBe(5);
  });

  it('a stash is sanitised like a load: bad pitch refused, long template and all-bad source dropped', () => {
    const base = sample();
    const c = base.chords[0];
    const input = {
      pitches: c.pitches,
      template: 'x'.repeat(81),
      rootDeg: 0,
      tol: 18,
      date: '',
      refHz: 261.6,
      frame: 'parallel' as const,
      parent: null,
      source: { ...c.source!, subset: { pitches: [{ m: null, c: NaN }], root: null } },
    };
    const out = stashChord(base, input).chords.at(-1)!;
    expect(out.template).toBeNull();
    expect(out.source).toBeNull();
    const bad = stashChord(base, { ...input, pitches: [{ m: null, c: NaN }] });
    expect(bad.chords).toHaveLength(base.chords.length);
    expect(bad.refusal).not.toBeNull();
    // what a stash stored is what a reload gives back
    const kept = stashChord(base, { ...input, template: '4:5:6', source: c.source });
    expect(sanitizeShelf(JSON.parse(JSON.stringify(shelfToStored(kept))))!.chords).toEqual(
      kept.chords
    );
  });
});

describe('chordshelf.v1: the additive positional pattern (M9)', () => {
  const oldChord = {
    id: 'c1',
    name: 'Old',
    pitches: [
      { m: null, c: 0 },
      { m: null, c: 400 },
    ],
    template: '4:5:6',
    rootDeg: 0,
    tol: 18,
    date: '2026-11-14T10:00:00.000Z',
    refHz: 261.6256,
    frame: 'parallel',
    parent: null,
    source: null,
  };

  it('old data without a pattern loads with null and is stored back unchanged (no pattern key)', () => {
    const old = { version: 1, chords: [oldChord], next: 2 };
    const back = sanitizeShelf(JSON.parse(JSON.stringify(old)))!;
    expect(back.chords[0].pattern).toBeNull();
    expect(shelfToStored(back)).toEqual(old);
    expect('pattern' in (shelfToStored(back).chords as object[])[0]).toBe(false);
  });

  it('a stored pattern round-trips; a bad one loads as null', () => {
    const raw = {
      version: 1,
      chords: [
        { ...oldChord, id: 'c1', template: '2-2 on 4', pattern: '2-2' },
        { ...oldChord, id: 'c2', pattern: 'abc' },
        { ...oldChord, id: 'c3', pattern: 7 },
      ],
      next: 4,
    };
    const back = sanitizeShelf(JSON.parse(JSON.stringify(raw)))!;
    expect(back.chords.map((c) => c.pattern)).toEqual(['2-2', null, null]);
    const again = sanitizeShelf(JSON.parse(JSON.stringify(shelfToStored(back))))!;
    expect(again.chords).toEqual(back.chords);
    expect((shelfToStored(back).chords as { pattern?: string }[])[0].pattern).toBe('2-2');
  });

  it('a stash with a pattern keeps it (canonical text); an invalid one stashes without', () => {
    let s = run(initialState(), {
      type: 'shelf/stash',
      stash: {
        pitches: [
          { m: null, c: 200 },
          { m: null, c: 500 },
        ],
        template: '2-2 on 2',
        pattern: ' 2-2 ',
        date: '2026-11-15T10:00:00.000Z',
      },
    });
    s = labReducer(s, {
      type: 'shelf/stash',
      stash: { pitches: [{ m: null, c: 0 }], pattern: 'x', date: '2026-11-15T10:00:00.000Z' },
    });
    expect(s.shelf.chords.map((c) => [c.template, c.pattern])).toEqual([
      ['2-2 on 2', '2-2'],
      [null, null],
    ]);
  });
});
