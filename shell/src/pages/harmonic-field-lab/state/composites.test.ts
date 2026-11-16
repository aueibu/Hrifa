import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ratioNote, type Note } from '../../../lib/harmonic-field';
import {
  MAX_COMPOSITES,
  MAX_COMPOSITE_ITEMS,
  MAX_ITEM_PITCHES,
  compositesReduce,
  emptyComposites,
  type CompositeAction,
  type CompositesState,
  type ItemInput,
} from './composites';
import {
  compositesToStored,
  loadComposites,
  sanitizeComposites,
  saveComposites,
} from './compositeStore';
import { defaultGen, generateField } from './generate';
import {
  activeTab,
  initialState,
  labReducer,
  MAX_TABS,
  type Action,
  type LabState,
} from './labState';
import { genToStored } from './libraryStore';
import { KEY_COMPOSITES, sanitizeSnapshot, sanitizeTabs, toSnapshot } from './persist';
import { sanitizeShelf, shelfToStored } from './shelfStore';

const D = '2026-11-15T10:00:00.000Z';
const oct = ratioNote(2, 1);
const edo = (...c: number[]): Note[] => c.map((x) => ({ m: null, c: x }));
const ji = (...r: [number, number][]): Note[] => r.map(([a, b]) => ratioNote(a, b));
const r1 = (x: number) => Math.round(x * 10) / 10;

const cMajor12: ItemInput = {
  kind: 'chord',
  label: 'C major (12-EDO)',
  pitches: edo(0, 400, 700),
  rep: oct,
};
const ji456: ItemInput = {
  kind: 'chord',
  label: 'JI 4:5:6',
  pitches: ji([1, 1], [5, 4], [3, 2]),
  rep: oct,
};

const comp = (s: CompositesState, ...a: CompositeAction[]) =>
  a.reduce(
    (st, x) =>
      x.type === 'composite/openTab'
        ? st
        : compositesReduce(st, x as Exclude<CompositeAction, { type: 'composite/openTab' }>),
    s
  );
const run = (s: LabState, ...a: Action[]) => a.reduce(labReducer, s);
const add = (to: number | 'new', item: ItemInput): CompositeAction => ({
  type: 'composite/addItem',
  to,
  item,
  date: D,
});

describe('composites reducer', () => {
  it('numbers composites 1 to 9, auto-names them, renames, and refuses a tenth', () => {
    let s = emptyComposites();
    for (let i = 0; i < MAX_COMPOSITES; i++) {
      s = comp(s, { type: 'composite/new', date: D });
    }
    expect(s.list.map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(s.list[3].name).toBe('Composite 4');
    const full = comp(s, { type: 'composite/new', date: D });
    expect(full.list).toHaveLength(9);
    expect(full.refusal?.reason).toMatch(/9 composites/);
    const named = comp(s, { type: 'composite/rename', id: 2, name: '  Quartal   mix ', date: D });
    expect(named.list[1].name).toBe('Quartal mix');
    expect(comp(named, { type: 'composite/rename', id: 2, name: '   ', date: D })).toBe(named);
    expect(comp(named, { type: 'composite/rename', id: 7, name: 'x', date: D }).list[6].name).toBe(
      'x'
    );
  });

  it('ids are freed on delete and reused (lowest free) only after the delete', () => {
    let s = comp(
      emptyComposites(),
      ...[1, 2, 3].map((): CompositeAction => ({ type: 'composite/new', date: D }))
    );
    s = comp(s, { type: 'composite/delete', id: 2 });
    expect(s.list.map((c) => c.id)).toEqual([1, 3]);
    s = comp(s, { type: 'composite/new', date: D });
    expect(s.list.map((c) => [c.id, c.name])).toEqual([
      [1, 'Composite 1'],
      [2, 'Composite 2'],
      [3, 'Composite 3'],
    ]);
    // 1 and 3 never changed number meanwhile; deleting all frees everything
    expect(comp(s, { type: 'composite/clear' }).list).toEqual([]);
    const again = comp(comp(s, { type: 'composite/clear' }), { type: 'composite/new', date: D });
    expect(again.list[0].id).toBe(1);
    expect(comp(s, { type: 'composite/delete', id: 9 })).toBe(s);
  });

  it('adds an item with its pitches, repeat and source; the same item twice is a no-op with a reason', () => {
    let s = comp(emptyComposites(), { type: 'composite/new', date: D }, add(1, cMajor12));
    expect(s.list[0].items).toHaveLength(1);
    expect(s.list[0].items[0]).toMatchObject({
      id: 'i1',
      kind: 'chord',
      label: 'C major (12-EDO)',
    });
    expect(s.lastAdded).toEqual({ composite: 1, item: 'i1' });
    const before = s.list;
    s = comp(s, add(1, { ...cMajor12, label: 'again', pitches: edo(700, 0, 400) }));
    expect(s.list).toBe(before);
    expect(s.refusal?.reason).toBe('Already in Composite 1.');
    // a successful action clears the refusal
    s = comp(s, add(1, ji456));
    expect(s.refusal).toBeNull();
    expect(s.list[0].items.map((i) => i.id)).toEqual(['i1', 'i2']);
  });

  it('"new" makes a composite on the lowest free number and adds to it; a missing number is refused', () => {
    let s = comp(emptyComposites(), add('new', cMajor12));
    expect(s.list.map((c) => [c.id, c.items.length])).toEqual([[1, 1]]);
    s = comp(s, add('new', ji456));
    expect(s.list.map((c) => c.id)).toEqual([1, 2]);
    expect(s.recent).toEqual([2, 1]);
    const bad = comp(s, add(5, ji456));
    expect(bad.list).toBe(s.list);
    expect(bad.refusal?.reason).toBe('There is no Composite 5.');
  });

  it('enforces the caps in memory: items per composite, pitches per item, unusable pitches', () => {
    let s = comp(emptyComposites(), { type: 'composite/new', date: D });
    for (let i = 0; i < MAX_COMPOSITE_ITEMS; i++) {
      s = comp(s, add(1, { kind: 'note', label: `n${i}`, pitches: edo(i + 0.5) }));
    }
    expect(s.list[0].items).toHaveLength(MAX_COMPOSITE_ITEMS);
    const full = comp(s, add(1, { kind: 'note', label: 'extra', pitches: edo(999) }));
    expect(full.list).toBe(s.list);
    expect(full.refusal?.reason).toMatch(/is full/);
    const fresh = comp(emptyComposites(), { type: 'composite/new', date: D });
    const big = comp(
      fresh,
      add(1, {
        kind: 'selection',
        label: 'big',
        pitches: edo(...Array.from({ length: MAX_ITEM_PITCHES + 1 }, (_, i) => i / 3)),
      })
    );
    expect(big.list[0].items).toHaveLength(0);
    expect(big.refusal?.reason).toMatch(/at most 2048/);
    expect(comp(fresh, add(1, { kind: 'note', label: 'x', pitches: [] })).refusal).not.toBeNull();
    expect(
      comp(fresh, add(1, { kind: 'note', label: 'x', pitches: [{ m: null, c: NaN }] })).refusal
    ).not.toBeNull();
  });

  it('makes pitches plain like a load does (a non-plain monzo keeps its cents only)', () => {
    const s = comp(
      emptyComposites(),
      add('new', { kind: 'note', label: 'odd', pitches: [{ m: { '4': 1 }, c: 100 }] })
    );
    expect(s.list[0].items[0].pitches).toEqual([{ m: null, c: 100 }]);
  });

  it('removes an item, never reuses its id, and keeps a recently-used order', () => {
    let s = comp(
      emptyComposites(),
      add('new', cMajor12),
      add('new', ji456),
      add(1, ji456),
      { type: 'composite/removeItem', id: 1, item: 'i1', date: D },
      add(1, cMajor12)
    );
    expect(s.list[0].items.map((i) => i.id)).toEqual(['i2', 'i3']);
    expect(s.recent).toEqual([1, 2]);
    s = comp(s, { type: 'composite/use', id: 2 });
    expect(s.recent).toEqual([2, 1]);
    s = comp(s, { type: 'composite/delete', id: 2 });
    expect(s.recent).toEqual([1]);
    expect(comp(s, { type: 'composite/removeItem', id: 1, item: 'zzz', date: D })).toBe(s);
  });
});

describe('composite/openTab', () => {
  const base = () =>
    run(initialState(), { type: 'composite/new', date: D }, add(1, cMajor12), add(1, ji456));

  it('builds a NEW tab with a frozen snapshot; current tabs and the library are untouched', () => {
    const s0 = base();
    const first = s0.tabs[0];
    const s = labReducer(s0, { type: 'composite/openTab', id: 1 });
    expect(s.tabs).toHaveLength(2);
    expect(s.tabs[0]).toBe(first);
    expect(s.library).toBe(s0.library);
    expect(s.active).toBe(1);
    const t = activeTab(s);
    expect(t.gen.method).toBe('composite');
    expect(t.gen.snap).toMatchObject({ id: 1, name: 'Composite 1' });
    expect(t.field.map((n) => r1(n.c))).toEqual([0, 386.3, 400, 700]);
    expect(t.rep.c).toBeCloseTo(1200, 6);
    expect(t.err).toBe('');
    expect(t.sel).toEqual([0, 1, 2, 3]);
    // cents-only stays cents-only; the exact one keeps its monzo
    expect(t.field.map((n) => n.m !== null)).toEqual([true, true, false, false]);
    expect(s.composites.recent[0]).toBe(1);
    expect(s.composites.refusal).toBeNull();
  });

  it('is a snapshot: editing, emptying or deleting the composite later changes the tab not at all', () => {
    const s1 = labReducer(base(), { type: 'composite/openTab', id: 1 });
    const tab = activeTab(s1);
    const s2 = run(
      s1,
      add(1, { kind: 'note', label: 'x', pitches: edo(150) }),
      { type: 'composite/removeItem', id: 1, item: 'i1', date: D },
      { type: 'composite/rename', id: 1, name: 'Renamed', date: D }
    );
    expect(activeTab(s2).field).toBe(tab.field);
    expect(activeTab(s2).gen.snap).toBe(tab.gen.snap);
    const s3 = labReducer(s2, { type: 'composite/delete', id: 1 });
    expect(activeTab(s3)).toBe(activeTab(s2));
    expect(activeTab(s3).gen.snap?.name).toBe('Composite 1');
    // the tab is named after the composite when it was opened
    expect(activeTab(s3).name).toBeNull();
  });

  it('follows the merge options it is given (keep most recent keeps 702; 15 c gives 3 notes)', () => {
    const rec = activeTab(
      labReducer(base(), { type: 'composite/openTab', id: 1, merge: { tol: 5, keep: 'recent' } })
    );
    expect(rec.field.map((n) => r1(n.c))).toEqual([0, 386.3, 400, 702]);
    const wide = activeTab(
      labReducer(base(), { type: 'composite/openTab', id: 1, merge: { tol: 15, keep: 'first' } })
    );
    expect(wide.field.map((n) => Math.round(n.c))).toEqual([0, 400, 700]);
  });

  it('reduces a Bohlen-Pierce (3/1) item into the octave of an octave composite', () => {
    const s = run(
      initialState(),
      add('new', cMajor12),
      add(1, {
        kind: 'chord',
        label: 'BP 3:5:7',
        pitches: ji([1, 1], [5, 3], [7, 3]),
        rep: ratioNote(3, 1),
      }),
      { type: 'composite/openTab', id: 1, merge: { tol: 0, keep: 'first' } }
    );
    const t = activeTab(s);
    expect(t.rep.c).toBeCloseTo(1200, 6);
    expect(Math.max(...t.field.map((n) => n.c))).toBeLessThan(1200);
    expect(t.field.some((n) => Math.abs(n.c - 266.871) < 0.01)).toBe(true);
  });

  it('is refused (with a reason) for an empty composite, a missing one is ignored, and at the tab cap', () => {
    let s = run(initialState(), { type: 'composite/new', date: D });
    const empty = labReducer(s, { type: 'composite/openTab', id: 1 });
    expect(empty.tabs).toHaveLength(1);
    expect(empty.composites.refusal?.reason).toMatch(/is empty/);
    expect(labReducer(s, { type: 'composite/openTab', id: 4 })).toBe(s);
    s = run(s, add(1, cMajor12));
    for (let i = s.tabs.length; i < MAX_TABS; i++) {
      s = labReducer(s, { type: 'tab/add' });
    }
    const capped = labReducer(s, { type: 'composite/openTab', id: 1 });
    expect(capped.tabs).toHaveLength(MAX_TABS);
    expect(capped.composites.refusal?.reason).toMatch(/tabs/);
  });

  it('uses the active tab repeat for the first item that has none', () => {
    const s = run(initialState(), add('new', { kind: 'note', label: 'n', pitches: edo(0, 250) }), {
      type: 'composite/openTab',
      id: 1,
    });
    expect(activeTab(s).rep.c).toBeCloseTo(1200, 6);
  });
});

describe('the composite generation method and storage in tabs.v1', () => {
  const opened = () =>
    run(initialState(), { type: 'composite/new', date: D }, add(1, cMajor12), add(1, ji456), {
      type: 'composite/openTab',
      id: 1,
    });

  it('the snapshot round trips through tabs.v1 and builds the same field; cents-only loads cents-only', () => {
    const t = activeTab(opened());
    const json = JSON.parse(JSON.stringify(toSnapshot(t))) as { gen: string; snap: unknown };
    expect(json.gen).toBe('composite');
    const stored = sanitizeTabs({ active: 0, list: [{ id: 't1', name: null, snap: json }] })!;
    const gen = stored.tabs[0].gen;
    expect(gen.method).toBe('composite');
    expect(gen.snap).toEqual(t.gen.snap);
    const built = generateField(gen);
    expect(built.ok && built.field).toEqual(t.field);
    expect(built.ok && built.field.map((n) => n.m === null)).toEqual([false, false, true, true]);
    expect(stored.tabs[0].selCents).toEqual(t.sel.map((i) => t.field[i].c));
  });

  it('sanitizes the snapshot entry by entry; a damaged snapshot builds nothing but keeps the method', () => {
    const t = activeTab(opened());
    const good = JSON.parse(JSON.stringify(toSnapshot(t))) as { snap: { notes: unknown[] } };
    const partly = sanitizeSnapshot({
      ...good,
      snap: {
        ...good.snap,
        notes: [{ m: null, c: 'x' }, 5, null, ...good.snap.notes, { c: Infinity }],
      },
    })!;
    expect(partly.gen.snap?.notes).toEqual(t.gen.snap?.notes);
    const noRep = sanitizeSnapshot({ ...good, snap: { ...good.snap, rep: { m: null, c: -1 } } })!;
    expect(noRep.gen.method).toBe('composite');
    expect(noRep.gen.snap).toBeUndefined();
    const built = generateField(noRep.gen);
    expect(built.ok).toBe(false);
    expect(sanitizeSnapshot({ ...good, snap: 'junk' })!.gen.snap).toBeUndefined();
    // a non-plain monzo in a stored note keeps its cents
    const odd = sanitizeSnapshot({
      ...good,
      snap: { ...good.snap, notes: [{ m: { '4': 1 }, c: 100 }] },
    })!;
    expect(odd.gen.snap?.notes).toEqual([{ m: null, c: 100 }]);
  });

  it('old data is unchanged: a snapshot without `snap` loads with no snap key and stores none', () => {
    const old = sanitizeSnapshot({ gen: 'edo', edoN: 19, rep: '2/1' })!;
    expect('snap' in old.gen).toBe(false);
    expect(old.gen.method).toBe('edo');
    expect('snap' in toSnapshot({ ...activeTab(initialState()), gen: old.gen })).toBe(false);
    expect(JSON.stringify(genToStored(defaultGen()))).not.toContain('snap');
  });

  it('a gen/method switch to composite is ignored without a snapshot; switching away keeps working', () => {
    const s = initialState();
    expect(labReducer(s, { type: 'gen/method', method: 'composite' })).toBe(s);
    const away = labReducer(opened(), { type: 'gen/method', method: 'edo' });
    expect(activeTab(away).gen.method).toBe('edo');
    expect(activeTab(away).field.length).toBeGreaterThan(4);
  });

  it('a chord stashed from a composite tab reloads through the stored snapshot (also after the tab is closed and through the stored shelf)', () => {
    let s = opened();
    const t = activeTab(s);
    const pitches = [t.field[0], t.field[2], t.field[3]];
    s = labReducer(s, { type: 'shelf/stash', stash: { pitches, rootDeg: 0, date: D } });
    const chord = s.shelf.chords[0];
    expect(chord.source?.gen.method).toBe('composite');
    expect(chord.source?.gen.snap?.notes).toEqual(t.gen.snap?.notes);
    // close the composite tab and delete the composite: nothing else holds the notes
    s = run(s, { type: 'tab/close', index: s.active }, { type: 'composite/delete', id: 1 });
    expect(s.tabs.every((x) => x.gen.method !== 'composite')).toBe(true);
    // through the stored shelf (a reload of the page)
    const back = sanitizeShelf(JSON.parse(JSON.stringify(shelfToStored(s.shelf))))!;
    const libBefore = s.library;
    const r = labReducer({ ...s, shelf: back }, { type: 'shelf/reload', id: chord.id });
    const rt = activeTab(r);
    expect(r.shelf.refusal).toBeNull();
    expect(rt.gen.method).toBe('composite');
    expect(rt.field).toEqual(t.field);
    expect(rt.fromChord).toBe(chord.id);
    expect(rt.sel).toEqual([0, 1, 2, 3]); // the source subset is the tab selection at stash time
    expect(r.library).toBe(libBefore);
    expect(rt.link).toBeUndefined();
  });
});

describe('composites.v1 storage', () => {
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

  const sample = (): CompositesState => {
    const s = run(
      initialState(),
      { type: 'composite/new', date: D },
      add(1, { ...cMajor12, source: { gen: defaultGen(), tab: 'Src', date: D } }),
      add(1, ji456),
      add('new', { kind: 'note', label: 'one note', pitches: edo(333.25) }),
      { type: 'composite/rename', id: 2, name: 'Mine', date: D }
    );
    return s.composites;
  };

  it('serializes to plain JSON with the documented key and reads back the same composites', () => {
    const c = sample();
    expect(saveComposites(c)).toBe(true);
    expect(writes).toEqual(['hrifa.harmonic-field-lab.composites.v1']);
    expect(KEY_COMPOSITES).toBe('hrifa.harmonic-field-lab.composites.v1');
    const j = JSON.parse(store.get(KEY_COMPOSITES)!) as {
      version: number;
      composites: {
        id: number;
        items: { source: { gen: { gen: string }; tab: string } | null; pitches: unknown[] }[];
      }[];
    };
    expect(j.version).toBe(1);
    expect(j.composites.map((x) => x.id)).toEqual([1, 2]);
    expect(j.composites[0].items[0].source?.tab).toBe('Src');
    expect(j.composites[0].items[1].source).toBeNull();
    const back = loadComposites();
    expect(back.list).toEqual(c.list);
    // runtime parts start fresh
    expect(back.recent).toEqual([]);
    expect(back.lastAdded).toBeNull();
    expect(back.refusal).toBeNull();
  });

  it('absent, corrupt or foreign data loads none and writes nothing', () => {
    expect(loadComposites().list).toEqual([]);
    store.set(KEY_COMPOSITES, '{not json');
    expect(loadComposites().list).toEqual([]);
    store.set(KEY_COMPOSITES, '[1,2]');
    expect(loadComposites().list).toEqual([]);
    for (const raw of [undefined, null, 5, 'x', [], {}, { composites: 'no' }]) {
      expect(sanitizeComposites(raw)).toBeNull();
    }
    expect(sanitizeComposites({ composites: [] })?.list).toEqual([]);
    expect(writes).toEqual([]);
  });

  it('drops damaged items, repairs the rest entry by entry, and a save never drops what was loaded', () => {
    const good = compositesToStored(sample()).composites as Record<string, unknown>[];
    const items = good[0].items as Record<string, unknown>[];
    const messy = {
      composites: [
        {
          ...good[0],
          name: 5,
          updated: 7,
          items: [
            items[0],
            5,
            null,
            { ...items[1], id: 'i9', pitches: [] },
            { ...items[1], id: 'i9', pitches: [{ m: null, c: 'x' }] },
            {
              ...items[1],
              id: 'i1',
              kind: 'weird',
              label: 3,
              rep: { m: null, c: -2 },
              source: { gen: 'bad' },
            },
          ],
        },
        { ...good[1], id: 1 },
        { ...good[1], id: 77, name: 'Far' },
        'junk',
      ],
    };
    const c = sanitizeComposites(messy)!;
    expect(c.list.map((x) => x.id)).toEqual([1, 2, 3]);
    const first = c.list[0];
    expect(first.name).toBe('Composite 1');
    expect(first.updated).toBe('');
    expect(first.items).toHaveLength(2);
    expect(first.items[1]).toMatchObject({
      kind: 'selection',
      label: 'Item',
      rep: null,
      source: null,
    });
    expect(new Set(first.items.map((i) => i.id)).size).toBe(2);
    expect(first.next).toBeGreaterThan(2);
    expect(c.list[2].name).toBe('Far');
    expect(saveComposites(c)).toBe(true);
    expect(loadComposites().list).toEqual(c.list);
  });

  it('enforces the caps at load: 9 composites, 64 items each, 2048 pitches per item', () => {
    const item = (i: number) => ({
      id: `i${i}`,
      kind: 'note',
      label: 'n',
      pitches: [{ m: null, c: i }],
      rep: null,
      source: null,
    });
    const many = {
      composites: Array.from({ length: 12 }, (_, i) => ({
        id: i + 1,
        name: `C${i + 1}`,
        items: Array.from({ length: 70 }, (_x, k) => item(k + 1)),
      })),
    };
    const c = sanitizeComposites(many)!;
    expect(c.list).toHaveLength(9);
    expect(c.list.every((x) => x.items.length === 64)).toBe(true);
    const huge = sanitizeComposites({
      composites: [
        {
          id: 1,
          items: [
            { ...item(1), pitches: Array.from({ length: 2049 }, (_, i) => ({ m: null, c: i })) },
          ],
        },
      ],
    })!;
    expect(huge.list[0].items).toEqual([]);
  });

  it('an invalid or repeated number takes the lowest free one; repaired item ids never collide', () => {
    const p = [{ m: null, c: 5 }];
    const c = sanitizeComposites({
      composites: [
        { id: 3, items: [] },
        { id: 3, items: [] },
        { id: 'x', items: [] },
        { id: 0, items: [] },
        {
          id: 1,
          items: [
            { pitches: p },
            { id: 'i1', pitches: p },
            { id: 'i1', pitches: p },
            { id: 'i2', pitches: p },
          ],
          next: 3,
        },
      ],
    })!;
    expect(c.list.map((x) => x.id)).toEqual([1, 2, 3, 4, 5]);
    const withItems = c.list[0];
    expect(withItems.items.map((i) => i.id)).toEqual(['i3', 'i1', 'i4', 'i2']);
    expect(withItems.next).toBe(5);
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
    expect(saveComposites(sample())).toBe(false);
  });

  it('a source that holds a composite snapshot round trips (item added from a composite tab)', () => {
    const s = run(initialState(), add('new', cMajor12), add(1, ji456), {
      type: 'composite/openTab',
      id: 1,
    });
    const t = activeTab(s);
    const s2 = run(s, {
      type: 'composite/addItem',
      to: 'new',
      item: {
        kind: 'subset',
        label: 'sub',
        pitches: [t.field[1]],
        rep: t.rep,
        source: { gen: t.gen, tab: 'Comp tab', date: D },
      },
      date: D,
    });
    saveComposites(s2.composites);
    const back = loadComposites();
    expect(back.list[1].items[0].source?.gen.snap).toEqual(t.gen.snap);
    expect(back.list[1].items[0].source?.gen.method).toBe('composite');
  });
});

describe('item mode root (H-10 amendment)', () => {
  const add = (root?: Note | null) =>
    compositesReduce(emptyComposites(), {
      type: 'composite/addItem',
      to: 'new',
      date: '2026-11-15T00:00:00.000Z',
      item: {
        kind: 'subset',
        label: 'dorian',
        pitches: [
          { m: null, c: 0 },
          { m: null, c: 200 },
        ],
        root,
      },
    });
  it('keeps a cents-only root cents-only and a monzo root with its monzo; round trips', () => {
    const cents = add({ m: null, c: 200 });
    expect(cents.list[0].items[0].root).toEqual({ m: null, c: 200 });
    const stored = compositesToStored(cents) as { composites: { items: { root?: unknown }[] }[] };
    expect(stored.composites[0].items[0].root).toEqual({ m: null, c: 200 });
    expect(sanitizeComposites(stored)?.list[0].items[0].root).toEqual({ m: null, c: 200 });
    const ji = add(ratioNote(9, 8));
    const back = sanitizeComposites(compositesToStored(ji));
    expect(back?.list[0].items[0].root).toEqual(ratioNote(9, 8));
  });
  it('an item without a root is stored byte for byte as before and loads without one', () => {
    const none = add(null);
    const stored = compositesToStored(none) as { composites: { items: object[] }[] };
    expect('root' in stored.composites[0].items[0]).toBe(false);
    expect(sanitizeComposites(stored)?.list[0].items[0].root).toBeUndefined();
  });
});
