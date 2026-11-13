import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseInterval, type Note } from '../../../lib/harmonic-field';
import { defaultGen } from './generate';
import { restoreState } from './LabProvider';
import {
  activeTab,
  initialState,
  labReducer,
  makeTab,
  type Action,
  type LabState,
} from './labState';
import { DEFAULT_LAYOUT, type Layout } from './layout';
import {
  KEY_LAYOUT,
  KEY_SETTINGS,
  KEY_TABS,
  MOCK_LAYOUT_KEYS,
  loadLayout,
  loadSettings,
  loadSubsets,
  loadTabs,
  sanitizeSettings,
  sanitizeSnapshot,
  sanitizeSubsets,
  sanitizeTabs,
  saveLayout,
  saveSettings,
  saveSubsets,
  saveTabs,
  toSnapshot,
} from './persist';

const run = (s: LabState, ...a: Action[]) => a.reduce(labReducer, s);
const stored = (key: string) => JSON.parse(window.localStorage.getItem(key) ?? 'null') as unknown;

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('settings (settings.v1)', () => {
  it('round-trips every field', () => {
    const s = run(initialState(), {
      type: 'ui',
      patch: {
        panel: 'keys',
        dockOpen: false,
        tol: 25,
        ringView: 'fifths',
        ringSteps: 19,
        ringGen: '4/3',
        wave: 'harmonic',
        baseHz: 440,
        volume: 0.25,
        modeAtBase: false,
        savedAll: true,
      },
    });
    const withViz = run(s, {
      type: 'viz',
      id: 'viz2',
      patch: { dim: '3d', isoG1: '4/3', edoPick: 31, axes3: [3, 5, 11] },
    });
    saveSettings(withViz.ui);
    expect(loadSettings()).toEqual(withViz.ui);
  });

  it('falls back field by field: a bad value leaves the others alone', () => {
    const d = initialState().ui;
    const raw = {
      panel: 'nope',
      dockOpen: false,
      tol: -5,
      ringView: 'sideways',
      ringSteps: 20,
      ringGen: 7,
      viz: {
        viz1: { dim: '4d', labels: false, isoG1: '5/1', isoTol: 99, edoPick: 3, axes3: [3, 3, 5] },
        viz9: {},
      },
      wave: 'saw',
      baseHz: 'loud',
      volume: 4,
      modeAtBase: 'yes',
      savedAll: true,
    };
    const s = sanitizeSettings(raw);
    expect(s.panel).toBe(d.panel);
    expect(s.dockOpen).toBe(false);
    expect(s.tol).toBe(d.tol);
    expect(s.ringView).toBe('chromatic');
    expect(s.ringSteps).toBe(12);
    expect(s.ringGen).toBe('3/2');
    expect(s.wave).toBe('sine');
    expect(s.baseHz).toBe(d.baseHz);
    expect(s.volume).toBe(d.volume);
    expect(s.modeAtBase).toBe(true);
    expect(s.savedAll).toBe(true);
    expect(s.viz.viz1).toEqual({ ...d.viz.viz1, labels: false });
    expect(Object.keys(s.viz)).toEqual(['viz1', 'viz2', 'viz3']);
  });

  it('garbage in storage gives the defaults, and a throwing storage does not throw', () => {
    for (const raw of [null, undefined, 5, 'x', [], true]) {
      expect(sanitizeSettings(raw)).toEqual(initialState().ui);
    }
    window.localStorage.setItem(KEY_SETTINGS, 'not json');
    expect(loadSettings()).toEqual(initialState().ui);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadSettings()).toEqual(initialState().ui);
    expect(() => saveSettings(initialState().ui)).not.toThrow();
    expect(loadTabs()).toBeNull();
    expect(loadSubsets()).toEqual([]);
    expect(loadLayout()).toBe(DEFAULT_LAYOUT);
  });
});

describe('layout (layout.v1)', () => {
  it('round-trips, and its own key wins over the mock keys', () => {
    window.localStorage.setItem(MOCK_LAYOUT_KEYS[0], '{"left":[["retuner"]],"right":[]}');
    const l: Layout = { left: [['chords', 'keys']], right: [['viz1']] };
    saveLayout(l);
    expect(loadLayout()).toEqual(l);
  });

  it('migrates the mock v3, v2 and v1 keys in that order of preference', () => {
    expect(loadLayout()).toBe(DEFAULT_LAYOUT);
    window.localStorage.setItem(MOCK_LAYOUT_KEYS[2], '{"left":["lattice"],"right":["keys"]}');
    expect(loadLayout()).toEqual({ left: [['viz1']], right: [['keys']] });
    window.localStorage.setItem(MOCK_LAYOUT_KEYS[1], '{"left":[["lattice","chords"]],"right":[]}');
    expect(loadLayout()).toEqual({ left: [['viz1', 'chords']], right: [] });
    window.localStorage.setItem(MOCK_LAYOUT_KEYS[0], '{"left":[],"right":[["spectrum"]]}');
    expect(loadLayout()).toEqual({ left: [], right: [['spectrum']] });
  });

  it('keeps the good entries of a damaged layout (finding 10)', () => {
    window.localStorage.setItem(
      KEY_LAYOUT,
      '{"left":[["chords","gone"],"bad"],"right":[["viz1"]],"views":{"viz1":"iso","viz2":"x"},"splits":{"zzz":[0.5,0.5]}}'
    );
    expect(loadLayout()).toEqual({
      left: [['chords']],
      right: [['viz1']],
      views: { viz1: 'iso' },
    });
  });
});

describe('snapshots', () => {
  it('a tab survives a round trip: inputs, selection by cents, mode, compare and pick settings', () => {
    let s = run(initialState(), { type: 'gen/preset', name: 'Harmonics 8–15' });
    s = run(
      s,
      { type: 'sel/set', idx: [0, 2, 4], mode: 2 },
      { type: 'cmp/set', patch: { ref: 'ji', odd: 9 } }
    );
    const snap = toSnapshot(activeTab(s));
    const back = sanitizeSnapshot(JSON.parse(JSON.stringify(snap)))!;
    expect(back.gen).toEqual(activeTab(s).gen);
    expect(back.selCents).toHaveLength(3);
    expect(back.selCents[1]).toBeCloseTo(386.3137, 3);
    expect(back.selCents[2]).toBeCloseTo(701.955, 3);
    expect(back.mode).toBe(2);
    expect(back.cmp).toEqual({ ref: 'ji', odd: 9, m: 12 });
  });

  it('an empty or partial snapshot gets the defaults (additive optional fields)', () => {
    const p = sanitizeSnapshot({})!;
    expect(p.gen).toEqual(defaultGen());
    expect(p.selCents).toEqual([]);
    expect(p.mode).toBe(0);
    const q = sanitizeSnapshot({ gen: 'edo', edoN: 19, rep: '2/1', unknownFutureField: { a: 1 } })!;
    expect(q.gen.method).toBe('edo');
    expect(q.gen.edoN).toBe(19);
    expect(sanitizeSnapshot(null)).toBeNull();
    expect(sanitizeSnapshot('x')).toBeNull();
    expect(sanitizeSnapshot([1])).toBeNull();
  });

  it('reads a prototype-shaped snapshot (flat gen names, preset as an index)', () => {
    const p = sanitizeSnapshot({
      gen: 'subharmonic',
      rep: '2/1',
      h: '12',
      edoN: '12',
      axes: [
        { on: true, g: '3/2', n: '7', ctr: '0' },
        { on: false, g: '5/4', n: '3', ctr: '1' },
        { on: false, g: '7/4', n: '3', ctr: '1' },
      ],
      shape: 'diamond',
      dist: '3',
      bidir: true,
      cpsF: '1 3 5 7',
      cpsK: '2',
      custom: '9/8\n5/4',
      mask: Array(25).fill(true),
      selCents: [0, 203.9],
      mode: 1,
      preset: '0',
      pickScale: 'w:Ionian (major)',
      pickKind: 'ji',
      pickStretch: true,
      pickRef: {
        name: 'x',
        kind: 'ji',
        stretch: false,
        targets: [{ c: 0, label: 'S' }, { c: 'bad' }],
      },
      cmpRef: 'medo',
      cmpOdd: '9',
      cmpM: '19',
    })!;
    expect(p.gen.method).toBe('sub');
    expect(p.gen.h).toBe(12);
    expect(p.gen.shape).toBe('diamond');
    expect(p.gen.axes[0].n).toBe(7);
    expect(p.gen.preset).toBe('Harmonics 8–15');
    expect(p.cmp).toEqual({ ref: 'medo', odd: 9, m: 19 });
    expect(p.pick.scale).toBe('w:Ionian (major)');
    expect(p.pick.stretch).toBe(true);
    expect(p.pick.ref?.targets).toEqual([{ c: 0, label: 'S' }]);
  });

  it('repairs bad numbers, masks, axes and unknown presets field by field', () => {
    const p = sanitizeSnapshot({
      gen: 'nope',
      rep: 5,
      h: -3,
      edoN: 1e9,
      axes: 'x',
      mask: [true],
      selCents: [0, 'a', NaN, 100],
      mode: -1,
      preset: 'Not a preset',
      cmpRef: 'weird',
      cmpM: 0,
    })!;
    const d = defaultGen();
    expect(p.gen.method).toBe(d.method);
    expect(p.gen.rep).toBe(d.rep);
    expect(p.gen.h).toBe(d.h);
    expect(p.gen.edoN).toBe(d.edoN);
    expect(p.gen.axes).toEqual(d.axes);
    expect(p.gen.mask).toEqual(d.mask);
    expect(p.gen.preset).toBe('');
    expect(p.selCents).toEqual([0, 100]);
    expect(p.mode).toBe(0);
    expect(p.cmp).toEqual({ ref: 'edo12', odd: 15, m: 12 });
  });
});

describe('tabs (tabs.v1)', () => {
  it('round-trips the tab list and the active tab', () => {
    let s = run(
      initialState(),
      { type: 'sel/set', idx: [1, 3] },
      { type: 'tab/rename', index: 0, name: 'First' }
    );
    s = run(
      s,
      { type: 'tab/add', gen: { ...defaultGen(), method: 'edo', edoN: 19 } },
      { type: 'sel/set', idx: [0, 5, 11] }
    );
    saveTabs(s.tabs, s.active);
    const back = loadTabs()!;
    expect(back.active).toBe(1);
    expect(back.tabs.map((t) => [t.id, t.name])).toEqual([
      ['t1', 'First'],
      ['t2', null],
    ]);
    expect(back.tabs[1].gen.edoN).toBe(19);
    expect(back.tabs[1].selCents).toHaveLength(3);
  });

  it('drops only the bad tabs; no usable tab at all gives null', () => {
    const good = toSnapshot(makeTab('t1', defaultGen()));
    const t = sanitizeTabs({
      active: 7,
      list: [
        { id: 't4', name: 'ok', snap: good },
        'junk',
        { name: 'no snap' },
        { id: 't4', name: 'dup id', snap: good },
        { id: 'weird', name: 12, snap: good },
      ],
    })!;
    expect(t.tabs.map((x) => x.name)).toEqual(['ok', 'dup id', null]);
    expect(new Set(t.tabs.map((x) => x.id)).size).toBe(3);
    expect(t.active).toBe(0); // out of range falls back
    for (const raw of [null, 5, {}, { list: 'x' }, { list: [] }, { list: [1, 2] }]) {
      expect(sanitizeTabs(raw)).toBeNull();
    }
  });

  it('caps the number of stored tabs', () => {
    const snap = toSnapshot(makeTab('t1', defaultGen()));
    const list = Array.from({ length: 40 }, (_, i) => ({ id: `t${i + 1}`, name: `n${i}`, snap }));
    expect(sanitizeTabs({ list, active: 0 })!.tabs.length).toBeLessThanOrEqual(12);
  });
});

describe('a tab restored while its inputs do not build (a repeat saved mid-edit)', () => {
  const cents = ['1/1', '5/4', '3/2'].map((r) => (parseInterval(r) as Note).c);
  const store = (rep: string) =>
    window.localStorage.setItem(
      KEY_TABS,
      JSON.stringify({
        active: 0,
        list: [
          { id: 't1', name: null, snap: { gen: 'harmonic', h: 8, rep, selCents: cents, mode: 1 } },
        ],
      })
    );

  it('keeps its stored selection through a save, and gets it back when the input is fixed', () => {
    store('2/');
    const r = restoreState();
    expect(r.tabs[0].field).toEqual([]);
    expect(r.tabs[0].sel).toEqual([]);
    // the save that used to store selCents: []
    expect(saveTabs(r.tabs, r.active)).toBe(true);
    const snap = (stored(KEY_TABS) as { list: { snap: { selCents: number[]; mode: number } }[] })
      .list[0].snap;
    expect(snap.selCents).toEqual(cents);
    expect(snap.mode).toBe(1);
    // fix the repeat: the selection is re-matched
    const fixed = run(r, { type: 'gen/patch', patch: { rep: '2/1' } });
    expect(activeTab(fixed).sel).toEqual([0, 2, 4]);
    expect(activeTab(fixed).mode).toBe(1);
    expect(activeTab(fixed).pending).toBeUndefined();
    // and a restore of the saved result sees a normal tab
    saveTabs(fixed.tabs, 0);
    expect(restoreState().tabs[0].sel).toEqual([0, 2, 4]);
  });

  it('a second failing edit keeps the pending selection', () => {
    store('x');
    const r = restoreState();
    const still = run(r, { type: 'gen/patch', patch: { rep: 'y' } });
    expect(activeTab(still).pending?.cents).toEqual(cents);
    expect(activeTab(run(still, { type: 'gen/patch', patch: { rep: '2/1' } })).sel).toEqual([
      0, 2, 4,
    ]);
  });
});

it('edoPick is stored as a number, never the raw string', () => {
  const d = initialState().ui.viz.viz1;
  expect(sanitizeSettings({ viz: { viz1: { edoPick: '31' } } }).viz.viz1.edoPick).toBe(31);
  expect(sanitizeSettings({ viz: { viz1: { edoPick: 31 } } }).viz.viz1.edoPick).toBe(31);
  expect(sanitizeSettings({ viz: { viz1: { edoPick: 'x' } } }).viz.viz1.edoPick).toBe(d.edoPick);
  expect(sanitizeSettings({ viz: { viz1: { edoPick: 500 } } }).viz.viz1.edoPick).toBeNull();
});

it('a failed write is reported by the save functions (storage full or blocked)', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  expect(saveSubsets([])).toBe(false);
  expect(saveSettings(initialState().ui)).toBe(false);
  expect(saveLayout(DEFAULT_LAYOUT)).toBe(false);
});

it('keeps every saved subset on load, the same as save (no hidden cap)', () => {
  const snap = toSnapshot(makeTab('t1', defaultGen()));
  const many = Array.from({ length: 650 }, (_, i) => ({ id: `s${i + 1}`, name: `n${i}`, ...snap }));
  expect(sanitizeSubsets(many)).toHaveLength(650);
});

describe('subsets (subsets.v1)', () => {
  it('round-trips and keeps the ids unique', () => {
    let s = run(
      initialState(),
      { type: 'sel/set', idx: [0, 4] },
      { type: 'saved/save', name: 'A' },
      { type: 'saved/save', name: 'B' }
    );
    saveSubsets(s.saved);
    expect(loadSubsets()).toEqual(s.saved);
    s = run(s, { type: 'saved/delete', id: 's1' });
    saveSubsets(s.saved);
    expect(loadSubsets().map((x) => x.id)).toEqual(['s2']);
  });

  it('drops bad entries only, and renames a duplicate id', () => {
    const snap = toSnapshot(makeTab('t1', defaultGen()));
    const list = sanitizeSubsets([
      { id: 's3', name: 'one', ...snap },
      null,
      7,
      { id: 's3', name: '', ...snap },
      { name: 'no id', ...snap },
    ]);
    expect(list.map((x) => x.name)).toEqual(['one', 'Subset 2', 'no id']);
    expect(new Set(list.map((x) => x.id)).size).toBe(3);
    expect(sanitizeSubsets('x')).toEqual([]);
    expect(sanitizeSubsets({})).toEqual([]);
  });
});

describe('restoreState (whole page)', () => {
  it('with nothing stored it is the default state', () => {
    const s = restoreState();
    expect(s.tabs).toHaveLength(1);
    expect(s.ui).toEqual(initialState().ui);
    expect(s.layout).toEqual(DEFAULT_LAYOUT);
    expect(s.saved).toEqual([]);
  });

  it('rebuilds fields, selection and counters from storage', () => {
    let s = run(initialState(), { type: 'sel/set', idx: [0, 2, 4], mode: 1 });
    s = run(
      s,
      { type: 'tab/add', gen: { ...defaultGen(), method: 'edo', edoN: 12 } },
      { type: 'saved/save', name: 'x' }
    );
    saveTabs(s.tabs, 0);
    saveSubsets(s.saved);
    saveSettings({ ...s.ui, tol: 40 });
    const r = restoreState();
    expect(r.tabs).toHaveLength(2);
    expect(r.active).toBe(0);
    expect(r.tabs[0].sel).toEqual([0, 2, 4]);
    expect(r.tabs[0].mode).toBe(1);
    expect(r.tabs[1].field).toHaveLength(12);
    expect(r.nextTab).toBe(3);
    expect(r.saved.map((x) => x.id)).toEqual(['s1']);
    expect(r.nextSaved).toBe(2);
    expect(r.ui.tol).toBe(40);
  });

  it('a stored tab whose inputs no longer build (a bad repeat) opens with the message and no field, not a crash', () => {
    window.localStorage.setItem(
      KEY_TABS,
      JSON.stringify({
        active: 0,
        list: [{ id: 't1', name: null, snap: { gen: 'harmonic', rep: 'xx' } }],
      })
    );
    const r = restoreState();
    expect(r.tabs[0].field).toEqual([]);
    expect(r.tabs[0].err).toMatch(/Repeat interval/);
  });

  it('keeps what it stored on a second load (no loss on reload)', () => {
    const s = run(
      initialState(),
      { type: 'sel/set', idx: [1, 5] },
      { type: 'ui', patch: { tol: 33 } }
    );
    saveTabs(s.tabs, s.active);
    saveSettings(s.ui);
    const once = restoreState();
    saveTabs(once.tabs, once.active);
    saveSettings(once.ui);
    expect(stored(KEY_TABS)).toEqual(
      JSON.parse(
        JSON.stringify({
          active: 0,
          list: s.tabs.map((t) => ({ id: t.id, name: t.name, snap: toSnapshot(t) })),
        })
      )
    );
    expect(restoreState().ui.tol).toBe(33);
  });
});
