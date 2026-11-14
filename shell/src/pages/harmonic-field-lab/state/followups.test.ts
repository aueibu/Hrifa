/** M6 follow-ups: duplicate tab, scale preview and lattice mode settings, the period text, generator and factor lattices. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cpsChords, fmtRatio, parseInterval, type Note } from '../../../lib/harmonic-field';
import {
  chordModel,
  cpsFactorNames,
  deriveBase,
  effectiveLatMode,
  genAxisNames,
  latAvail,
  latticeAltOf,
  periodText,
} from './derive';
import { restoreState } from './LabProvider';
import {
  MAX_TABS,
  activeTab,
  initialState,
  labReducer,
  makeTab,
  presetGen,
  tabName,
  type Action,
  type LabState,
} from './labState';
import {
  KEY_SETTINGS,
  KEY_TABS,
  loadSettings,
  sanitizeSettings,
  saveSettings,
  saveTabs,
} from './persist';
import { DEFAULT_SETTINGS } from './vizState';

const run = (s: LabState, ...actions: Action[]) => actions.reduce(labReducer, s);
const stored = (key: string) => JSON.parse(window.localStorage.getItem(key) ?? 'null') as unknown;

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe('tab/duplicate', () => {
  it('copies the generation, selection, mode and pick settings into "<name> copy", right after, active', () => {
    let s = run(
      initialState(),
      { type: 'tab/add', gen: presetGen('19-EDO') },
      { type: 'sel/set', idx: [0, 4, 7, 11], mode: 2 },
      { type: 'pick/set', patch: { scale: 'ji', m: 7 } },
      { type: 'cmp/set', patch: { ref: 'ji', odd: 9 } }
    );
    expect(s.tabs).toHaveLength(2);
    s = run(s, { type: 'tab/duplicate' });
    expect(s.tabs.map(tabName)).toEqual(['Harmonics 8–15', '19-EDO', '19-EDO copy']);
    expect(s.active).toBe(2);
    const [orig, copy] = [s.tabs[1], s.tabs[2]];
    expect(copy.id).not.toBe(orig.id);
    expect(copy.sel).toEqual([0, 4, 7, 11]);
    expect(copy.mode).toBe(2);
    expect(copy.gen).toEqual(orig.gen);
    expect(copy.gen).not.toBe(orig.gen);
    expect(copy.pick.scale).toBe('ji');
    expect(copy.cmp).toMatchObject({ ref: 'ji', odd: 9 });
    expect(copy.field).toHaveLength(orig.field.length);
    // the copy is independent
    const t = run(s, { type: 'sel/toggle', i: 0 });
    expect(t.tabs[1].sel).toEqual([0, 4, 7, 11]);
    expect(activeTab(t).sel).toEqual([4, 7, 11]);
  });

  it('an explicit index puts the copy after that tab, and the next id is fresh', () => {
    const s = run(
      initialState(),
      { type: 'tab/add' },
      { type: 'tab/rename', index: 0, name: 'first' },
      { type: 'tab/duplicate', index: 0 }
    );
    expect(s.tabs.map(tabName)).toEqual(['first', 'first copy', 'Harmonics 8–15']);
    expect(s.active).toBe(1);
    expect(new Set(s.tabs.map((t) => t.id)).size).toBe(3);
    expect(s.nextTab).toBe(4);
  });

  it('does nothing at the tab limit or for a missing tab; clears pointers', () => {
    let s = initialState();
    for (let i = 1; i < MAX_TABS; i++) {
      s = run(s, { type: 'tab/add' });
    }
    expect(run(s, { type: 'tab/duplicate' })).toBe(s);
    const one = initialState();
    expect(run(one, { type: 'tab/duplicate', index: 5 })).toBe(one);
    const pinned = run(one, { type: 'pin', i: 2 }, { type: 'tab/duplicate' });
    expect(pinned.pin).toBeNull();
  });

  it('is stored through tabs.v1 (name, selection, mode) and restored', () => {
    const s = run(
      initialState(),
      { type: 'sel/set', idx: [1, 3, 5], mode: 1 },
      { type: 'tab/duplicate' }
    );
    expect(saveTabs(s.tabs, s.active)).toBe(true);
    const raw = stored(KEY_TABS) as { active: number; list: { name: string | null }[] };
    expect(raw.active).toBe(1);
    expect(raw.list[1].name).toBe('Harmonics 8–15 copy');
    const back = restoreState();
    expect(back.tabs.map(tabName)).toEqual(['Harmonics 8–15', 'Harmonics 8–15 copy']);
    expect(back.active).toBe(1);
    expect(back.tabs[1].sel).toEqual([1, 3, 5]);
    expect(back.tabs[1].mode).toBe(1);
  });
});

describe('settings: scalePreview and latMode', () => {
  it('default is Up / primes', () => {
    expect(initialState().ui.scalePreview).toBe('up');
    expect(initialState().ui.viz.viz1.latMode).toBe('prime');
    expect(DEFAULT_SETTINGS.latMode).toBe('prime');
  });

  it('round-trips through settings.v1', () => {
    const s = run(
      initialState(),
      { type: 'ui', patch: { scalePreview: 'updown' } },
      { type: 'viz', id: 'viz1', patch: { latMode: 'cps' } }
    );
    expect(saveSettings(s.ui)).toBe(true);
    const raw = stored(KEY_SETTINGS) as {
      scalePreview: string;
      viz: { viz1: { latMode: string } };
    };
    expect(raw.scalePreview).toBe('updown');
    expect(raw.viz.viz1.latMode).toBe('cps');
    const back = loadSettings();
    expect(back.scalePreview).toBe('updown');
    expect(back.viz.viz1.latMode).toBe('cps');
    expect(back.viz.viz2.latMode).toBe('prime');
  });

  it('older data without the fields loads with the defaults; bad values fall back', () => {
    const old = { panel: 'keys', tol: 25, viz: { viz1: { dim: '3d', labels: false } } };
    const s = sanitizeSettings(old);
    expect(s.scalePreview).toBe('up');
    expect(s.viz.viz1.latMode).toBe('prime');
    expect(s.viz.viz1.dim).toBe('3d');
    expect(s.tol).toBe(25);
    const bad = sanitizeSettings({ scalePreview: 'sideways', viz: { viz1: { latMode: 'x' } } });
    expect(bad.scalePreview).toBe('up');
    expect(bad.viz.viz1.latMode).toBe('prime');
  });
});

describe('period text', () => {
  const N = (t: string) => parseInterval(t) as Note;
  it('exact repeat: ratio and cents; irrational: cents only', () => {
    expect(periodText(N('2/1'))).toBe('2/1 (1200.00 c)');
    expect(periodText(N('3/1'))).toBe('3/1 (1901.96 c)');
    expect(periodText(N('700c'))).toBe('700.00 c');
  });
  it('is what the stats show for the active tab', () => {
    const t = activeTab(initialState());
    expect(periodText(deriveBase(t).rep)).toBe('2/1 (1200.00 c)');
  });
});

describe('chord chip root', () => {
  it('carries the field index of the chord root', () => {
    const t = activeTab(initialState());
    const base = deriveBase(t);
    const model = chordModel(base);
    const chip = model?.chipsAt(18).find((c) => c.found);
    expect(chip).toBeDefined();
    expect(base.ratios[chip!.rootIdx]).toBe(chip!.root);
  });
});

describe('lattice modes: availability and the generator / factor layouts', () => {
  const tabOf = (name: string) => makeTab('t9', presetGen(name));
  const avail = (name: string) => {
    const t = tabOf(name);
    return latAvail(t.field, t.rep, t.gen.method);
  };

  it('Generators only for a lattice field, Factors only for a CPS; otherwise primes', () => {
    expect(avail('Harmonics 8–15')).toEqual({ gen: false, cps: false });
    expect(avail('19-EDO')).toEqual({ gen: false, cps: false });
    expect(avail('7-limit 3×3×3 box')).toEqual({ gen: true, cps: false });
    expect(avail('Hexany (1 3 5 7, choose 2)')).toEqual({ gen: false, cps: true });
    expect(effectiveLatMode('cps', { gen: false, cps: false })).toBe('prime');
    expect(effectiveLatMode('gen', { gen: true, cps: false })).toBe('gen');
    expect(effectiveLatMode('gen', { gen: false, cps: true })).toBe('prime');
    expect(effectiveLatMode('cps', { gen: false, cps: true })).toBe('cps');
    expect(effectiveLatMode('prime', { gen: true, cps: true })).toBe('prime');
  });

  it('the hexany star: one arrow per factor, edges swap one factor', () => {
    const t = tabOf('Hexany (1 3 5 7, choose 2)');
    const names = cpsFactorNames(t.gen);
    expect(names).toEqual(['1', '3', '5', '7']);
    const v = latticeAltOf(t.field, t.rep, 'cps', names);
    expect(v).not.toBeNull();
    expect(v!.pts).toHaveLength(6);
    expect(v!.key.map((k) => k.label)).toEqual(names);
    // the hexany (octahedron seen face-on) has 12 swap edges
    expect(v!.edges).toHaveLength(12);
    expect(v!.pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(v!.pts.every((p) => p.stems.length === 0 && p.label.includes('/'))).toBe(true);
  });

  it('the generator grid: one arrow per generator, a line per step of one generator', () => {
    const t = tabOf('7-limit 3×3×3 box');
    const names = genAxisNames(t.gen);
    expect(names).toHaveLength(3);
    const v = latticeAltOf(t.field, t.rep, 'gen', names);
    expect(v).not.toBeNull();
    expect(v!.pts).toHaveLength(t.field.length);
    expect(v!.names).toEqual(names);
    expect(v!.edges.length).toBeGreaterThan(0);
  });

  it('a generator in cents labels its notes in cents, not with a dash', () => {
    const g = presetGen('7-limit 3×3×3 box');
    g.preset = '';
    g.method = 'lattice';
    g.shape = 'box';
    g.axes = [
      { on: true, g: '696.58', n: 7, ctr: 3 },
      { on: false, g: '5/4', n: 1, ctr: 0 },
      { on: false, g: '7/4', n: 1, ctr: 0 },
    ];
    const t = makeTab('t9', g);
    expect(t.field.length).toBeGreaterThan(1);
    const v = latticeAltOf(t.field, t.rep, 'gen', genAxisNames(t.gen));
    expect(v).not.toBeNull();
    expect(
      v!.pts.every((p) => p.label !== '—' && (p.label.endsWith(' c') || p.label.includes('/')))
    ).toBe(true);
    expect(v!.pts.some((p) => p.label.endsWith(' c'))).toBe(true);
  });

  it('notes without a ratio are labelled by their cents everywhere (EDO steps)', () => {
    const base = deriveBase(tabOf('19-EDO'));
    // step 0 is the unison, a real ratio; the other steps have none
    expect(base.ratios[0]).toBe('1/1');
    expect(base.ratios[1]).toBe('63.2 c');
    expect(base.ratios.slice(1).every((r) => r.endsWith(' c'))).toBe(true);
    // a ratio field keeps its ratios
    expect(deriveBase(tabOf('Harmonics 8–15')).ratios[0]).toBe('1/1');
  });

  it('no coordinates gives null', () => {
    const t = tabOf('Harmonics 8–15');
    expect(latticeAltOf(t.field, t.rep, 'gen', [])).toBeNull();
    expect(latticeAltOf(t.field, t.rep, 'cps', [])).toBeNull();
  });
});

describe('CPS chord data the chips read', () => {
  it('the hexany has four otonal and four utonal chords of three notes', () => {
    const t = makeTab('t9', presetGen('Hexany (1 3 5 7, choose 2)'));
    const ch = cpsChords(t.field);
    expect(ch.filter((g) => g.type === 'harmonic')).toHaveLength(4);
    expect(ch.filter((g) => g.type !== 'harmonic')).toHaveLength(4);
    expect(ch.every((g) => g.members.length === 3)).toBe(true);
    expect(fmtRatio(t.field[0])).toBe('1/1');
  });
});
