/** M7c-a (H-30, rows 16 to 20): the chord library's stored state: defaults, sanitizing, round trip, and the reducer actions. */
import { describe, expect, it } from 'vitest';
import { initialState, labReducer, defaultUi, type Action, type LabState } from './labState';
import {
  MAX_LIB_CHECKED,
  MAX_LIB_OPEN,
  addChecked,
  defaultLibFilters,
  sanitizeKeyList,
  sanitizeLibFilters,
  setOpen,
} from './libraryState';
import { sanitizeSettings } from './persist';

const run = (s: LabState, ...a: Action[]) => a.reduce(labReducer, s);
/** What storage does: the settings are written as JSON and read back through the sanitizer. */
const reload = (ui: unknown) => sanitizeSettings(JSON.parse(JSON.stringify(ui)));

const keys = (n: number, from = 0) => Array.from({ length: n }, (_, i) => `key-${from + i}`);

describe('defaults and old settings', () => {
  it('the defaults: no filters, nothing checked or open, compared with the field', () => {
    const d = defaultUi();
    expect(d.libFilters).toEqual({
      search: '',
      notesMin: null,
      notesMax: null,
      oddMax: null,
      primeMax: null,
      family: '',
      checkedOnly: false,
    });
    expect(d.libChecked).toEqual([]);
    expect(d.libOpen).toEqual([]);
    expect(d.libCmp).toBe('field');
  });

  it('settings stored before M7c (no fields) load with the defaults, and nothing else changes', () => {
    const old = sanitizeSettings({ tol: 33, chordSort: 'root', pairsColor: 'error' });
    expect(old).toMatchObject({ tol: 33, chordSort: 'root', pairsColor: 'error' });
    expect(old.libFilters).toEqual(defaultLibFilters());
    expect(old.libChecked).toEqual([]);
    expect(old.libOpen).toEqual([]);
    expect(old.libCmp).toBe('field');
    expect(sanitizeSettings(null).libCmp).toBe('field');
    expect(sanitizeSettings(undefined).libChecked).toEqual([]);
  });
});

describe('storing and reloading (rows 17 and 18)', () => {
  it('filters, checks, open shapes and the comparison come back as stored', () => {
    const ui = {
      ...defaultUi(),
      libFilters: {
        search: 'dominant',
        notesMin: 3,
        notesMax: 5,
        oddMax: 9,
        primeMax: 7,
        family: 'Major',
        checkedOnly: true,
      },
      libChecked: ['0.00000,386.31371,701.95500', 'fold:1:2:3', '0.00000,315.64135,701.95500'],
      libOpen: ['0.00000,386.31371,701.95500', 'fold:1:2:3'],
      libCmp: 'subset' as const,
    };
    const back = reload(ui);
    expect(back.libFilters).toEqual(ui.libFilters);
    expect(back.libChecked).toEqual(ui.libChecked);
    expect(back.libOpen).toEqual(ui.libOpen);
    expect(back.libCmp).toBe('subset');
    expect(back).toEqual(ui);
  });

  it('the state through the reducer reloads the same (a full round trip)', () => {
    const s = run(
      initialState(),
      { type: 'lib/filters', patch: { search: 'minor', oddMax: 15, checkedOnly: true } },
      { type: 'lib/check', keys: ['a', 'b'] },
      { type: 'lib/open', id: 'shape-1' },
      { type: 'lib/cmp', cmp: 'subset' }
    );
    const back = reload(s.ui);
    expect(back.libFilters).toMatchObject({ search: 'minor', oddMax: 15, checkedOnly: true });
    expect(back.libChecked).toEqual(['a', 'b']);
    expect(back.libOpen).toEqual(['shape-1']);
    expect(back.libCmp).toBe('subset');
  });
});

describe('bad stored values fall back, field by field', () => {
  it('a damaged filters record gives the defaults; a damaged field keeps the good ones', () => {
    for (const bad of [null, 'x', 3, [], true]) {
      expect(sanitizeSettings({ libFilters: bad }).libFilters).toEqual(defaultLibFilters());
    }
    const f = sanitizeLibFilters({
      search: 'ok',
      notesMin: 0,
      notesMax: 2.5,
      oddMax: '9',
      primeMax: -3,
      family: 7,
      checkedOnly: 'yes',
    });
    expect(f).toEqual({ ...defaultLibFilters(), search: 'ok' });
    expect(sanitizeLibFilters({ notesMin: 4, oddMax: 15 })).toMatchObject({
      notesMin: 4,
      oddMax: 15,
    });
  });

  it('the search text and family are cut at 80 and 40 characters', () => {
    const f = sanitizeLibFilters({ search: 'a'.repeat(200), family: 'b'.repeat(90) });
    expect(f.search).toHaveLength(80);
    expect(f.family).toHaveLength(40);
  });

  it('libCmp: anything but field or subset is field', () => {
    for (const bad of ['both', 1, null, undefined, {}]) {
      expect(sanitizeSettings({ libCmp: bad }).libCmp).toBe('field');
    }
    expect(sanitizeSettings({ libCmp: 'subset' }).libCmp).toBe('subset');
  });

  it('libChecked and libOpen: only non-empty strings, no duplicates, a non-array gives none', () => {
    for (const bad of ['a', 3, null, {}, true]) {
      expect(sanitizeSettings({ libChecked: bad }).libChecked).toEqual([]);
      expect(sanitizeSettings({ libOpen: bad }).libOpen).toEqual([]);
    }
    expect(sanitizeKeyList(['a', 3, '', null, 'a', 'b', {}, 'x'.repeat(401)], 40)).toEqual([
      'a',
      'b',
    ]);
  });

  it('at most 40 checked rows (the newest kept) and 400 open shapes', () => {
    expect(MAX_LIB_CHECKED).toBe(40);
    const stored = sanitizeSettings({ libChecked: keys(45) }).libChecked;
    expect(stored).toHaveLength(40);
    expect(stored[0]).toBe('key-5');
    expect(stored.at(-1)).toBe('key-44');
    expect(sanitizeSettings({ libOpen: keys(450) }).libOpen).toHaveLength(MAX_LIB_OPEN);
  });

  it('an unknown key is stored as it is (the library drops it when it is read, see knownCheckedKeys)', () => {
    expect(sanitizeSettings({ libChecked: ['not-a-chord'] }).libChecked).toEqual(['not-a-chord']);
  });
});

describe('the reducer actions', () => {
  it('lib/filters merges a patch, cleans it, and keeps the state when nothing changes', () => {
    const s0 = initialState();
    const s1 = run(s0, { type: 'lib/filters', patch: { search: 'sus', notesMin: 4 } });
    expect(s1.ui.libFilters).toEqual({ ...defaultLibFilters(), search: 'sus', notesMin: 4 });
    const s2 = run(s1, { type: 'lib/filters', patch: { notesMax: 6, checkedOnly: true } });
    expect(s2.ui.libFilters).toMatchObject({
      search: 'sus',
      notesMin: 4,
      notesMax: 6,
      checkedOnly: true,
    });
    expect(run(s2, { type: 'lib/filters', patch: { search: 'sus' } })).toBe(s2);
    // a bad number is cleaned to "no limit"
    expect(
      run(s2, { type: 'lib/filters', patch: { notesMin: 0 } }).ui.libFilters.notesMin
    ).toBeNull();
    // the other settings are untouched
    expect(s2.ui.tol).toBe(s0.ui.tol);
  });

  it('lib/check adds, moves a re-checked row to the end, and keeps 40 (the oldest go)', () => {
    const s1 = run(initialState(), { type: 'lib/check', keys: ['a', 'b', 'c'] });
    expect(s1.ui.libChecked).toEqual(['a', 'b', 'c']);
    expect(run(s1, { type: 'lib/check', keys: ['a'] }).ui.libChecked).toEqual(['b', 'c', 'a']);
    expect(run(s1, { type: 'lib/check', keys: [] })).toBe(s1);
    const s40 = run(initialState(), { type: 'lib/check', keys: keys(40) });
    expect(s40.ui.libChecked).toHaveLength(40);
    const s41 = run(s40, { type: 'lib/check', keys: ['new'] });
    expect(s41.ui.libChecked).toHaveLength(40);
    expect(s41.ui.libChecked[0]).toBe('key-1');
    expect(s41.ui.libChecked.at(-1)).toBe('new');
    // a whole shape (several keys at once) can push several out
    const s43 = run(s40, { type: 'lib/check', keys: ['n1', 'n2', 'n3'] });
    expect(s43.ui.libChecked.slice(0, 2)).toEqual(['key-3', 'key-4']);
    expect(s43.ui.libChecked.slice(-3)).toEqual(['n1', 'n2', 'n3']);
  });

  it('lib/clearChecks empties the list, and is a no-op when it is empty', () => {
    const s1 = run(initialState(), { type: 'lib/check', keys: ['a', 'b', 'c'] });
    expect(run(s1, { type: 'lib/clearChecks' }).ui.libChecked).toEqual([]);
    const s0 = initialState();
    expect(run(s0, { type: 'lib/clearChecks' })).toBe(s0);
  });

  it('lib/open opens, closes, toggles, and is a no-op when it already is so', () => {
    const s1 = run(initialState(), { type: 'lib/open', id: 'x' });
    expect(s1.ui.libOpen).toEqual(['x']);
    expect(run(s1, { type: 'lib/open', id: 'x' }).ui.libOpen).toEqual([]);
    expect(run(s1, { type: 'lib/open', id: 'x', open: true })).toBe(s1);
    expect(run(s1, { type: 'lib/open', id: 'y', open: false })).toBe(s1);
    expect(run(s1, { type: 'lib/open', id: 'x', open: false }).ui.libOpen).toEqual([]);
    expect(run(s1, { type: 'lib/open', id: 'y', open: true }).ui.libOpen).toEqual(['x', 'y']);
  });

  it('lib/cmp sets the comparison', () => {
    const s1 = run(initialState(), { type: 'lib/cmp', cmp: 'subset' });
    expect(s1.ui.libCmp).toBe('subset');
    expect(run(s1, { type: 'lib/cmp', cmp: 'subset' })).toBe(s1);
    expect(run(s1, { type: 'lib/cmp', cmp: 'field' }).ui.libCmp).toBe('field');
  });

  it('the list helpers keep their input unchanged', () => {
    const list = ['a', 'b'];
    addChecked(list, ['c']);
    setOpen(list, 'z');
    expect(list).toEqual(['a', 'b']);
  });
});
