import { describe, expect, it } from 'vitest';
import { SCALE_LIBRARY, fmtRatio } from '../../../lib/harmonic-field';
import { defaultGen } from './generate';
import {
  MAX_TABS,
  activeTab,
  initialState,
  labReducer,
  makeTab,
  presetGen,
  rootIndex,
  tabName,
  type Action,
  type LabState,
} from './labState';
import { DEFAULT_LAYOUT, pin as pinPanel } from './layout';

const run = (s: LabState, ...actions: Action[]) => actions.reduce(labReducer, s);
const ratios = (s: LabState) => activeTab(s).field.map((n) => fmtRatio(n));
const selRatios = (s: LabState) => activeTab(s).sel.map((i) => ratios(s)[i]);
const edo = (n: number) => ({ ...defaultGen(), method: 'edo' as const, edoN: n });

describe('initial state', () => {
  it('opens one tab on Harmonics 8-15 with every note selected and the default layout', () => {
    const s = initialState();
    expect(s.tabs).toHaveLength(1);
    expect(tabName(s.tabs[0])).toBe('Harmonics 8–15');
    expect(ratios(s)).toEqual(['1/1', '9/8', '5/4', '11/8', '3/2', '13/8', '7/4', '15/8']);
    expect(activeTab(s).sel).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(s.layout).toBe(DEFAULT_LAYOUT);
    expect(s.sounding.size).toBe(0);
  });
});

describe('selection', () => {
  it('toggles a note, keeping the selection sorted', () => {
    let s = run(
      initialState(),
      { type: 'sel/none' },
      { type: 'sel/toggle', i: 4 },
      { type: 'sel/toggle', i: 1 }
    );
    expect(activeTab(s).sel).toEqual([1, 4]);
    s = run(s, { type: 'sel/toggle', i: 4 });
    expect(activeTab(s).sel).toEqual([1]);
    // out of range is ignored
    expect(run(s, { type: 'sel/toggle', i: 99 })).toBe(s);
    expect(run(s, { type: 'sel/toggle', i: -1 })).toBe(s);
  });

  it('All, None and Invert', () => {
    let s = run(initialState(), { type: 'sel/set', idx: [0, 2, 4] });
    s = run(s, { type: 'sel/invert' });
    expect(activeTab(s).sel).toEqual([1, 3, 5, 6, 7]);
    s = run(s, { type: 'sel/none' });
    expect(activeTab(s).sel).toEqual([]);
    expect(activeTab(s).mode).toBe(0);
    s = run(s, { type: 'sel/all' });
    expect(activeTab(s).sel).toHaveLength(8);
  });

  it('sel/set drops bad indices and duplicates', () => {
    const s = run(initialState(), { type: 'sel/set', idx: [4, 4, 99, -2, 1.5, 0] });
    expect(activeTab(s).sel).toEqual([0, 4]);
  });

  it('steps the mode round the selected notes and keeps it valid when the selection shrinks', () => {
    let s = run(initialState(), { type: 'sel/set', idx: [0, 2, 4] });
    s = run(s, { type: 'mode/step', by: 1 }, { type: 'mode/step', by: 1 });
    expect(activeTab(s).mode).toBe(2);
    s = run(s, { type: 'mode/step', by: 1 });
    expect(activeTab(s).mode).toBe(0);
    s = run(s, { type: 'mode/step', by: -1 });
    expect(activeTab(s).mode).toBe(2);
    expect(rootIndex(activeTab(s))).toBe(4);
    s = run(s, { type: 'sel/toggle', i: 4 }); // the mode root leaves
    expect(activeTab(s).mode).toBe(0);
    s = run(s, { type: 'mode/set', mode: 9 });
    expect(activeTab(s).mode).toBe(0);
    // no notes: stepping does nothing harmful
    s = run(s, { type: 'sel/none' }, { type: 'mode/step', by: 1 });
    expect(activeTab(s).mode).toBe(0);
  });

  it('odd-limit select takes the notes within the limit (5: 1/1, 5/4, 3/2)', () => {
    const s = run(initialState(), { type: 'odd/select', limit: 5 });
    expect(selRatios(s)).toEqual(['1/1', '5/4', '3/2']);
    expect(run(initialState(), { type: 'odd/select', limit: Number.NaN }).tabs[0].sel).toEqual([0]);
  });
});

describe('nearest scale', () => {
  it('picks the 12 steps of a 31-EDO field nearest 12 equal divisions, and compares the strip against 12-EDO steps', () => {
    let s = run(initialState(), { type: 'tab/add', gen: edo(31) });
    s = run(s, { type: 'pick/set', patch: { scale: 'ed', m: 12 } }, { type: 'pick/apply' });
    const t = activeTab(s);
    expect(t.sel).toHaveLength(12);
    expect(t.cmp.ref).toBe('medo');
    expect(t.cmp.m).toBe(12);
    expect(t.mode).toBe(0);
  });

  it('picks a library scale: the major scale in 12-EDO lands exactly, the root is the mode root, and Picked scale is selected', () => {
    const major = SCALE_LIBRARY.find((x) => x.name === 'Ionian (major)')!;
    let s = run(initialState(), { type: 'tab/add', gen: edo(12) });
    s = run(
      s,
      { type: 'pick/set', patch: { scale: `w:${major.name}`, kind: 'edo12' } },
      { type: 'pick/apply' }
    );
    const t = activeTab(s);
    expect(t.sel).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect(t.pick.ok).toBe(true);
    expect(t.pick.msg).toMatch(/max ±0\.00 c/);
    expect(t.cmp.ref).toBe('picked');
    expect(t.pick.ref?.targets).toHaveLength(7);
  });

  it('a melakarta pick works, and an unknown scale id is treated as an equal division', () => {
    let s = run(initialState(), { type: 'tab/add', gen: edo(12) });
    s = run(s, { type: 'pick/set', patch: { scale: 'm29' } }, { type: 'pick/apply' });
    expect(activeTab(s).sel).toHaveLength(7);
    s = run(s, { type: 'pick/set', patch: { scale: 'nonsense', m: 5 } }, { type: 'pick/apply' });
    expect(activeTab(s).sel).toHaveLength(5);
  });

  it('reports a failure in the pick message and leaves the subset alone', () => {
    // a field of two notes cannot supply the seven distinct notes of a scale
    let s = run(initialState(), { type: 'tab/add', gen: edo(2) });
    const major = SCALE_LIBRARY[0];
    s = run(s, { type: 'pick/set', patch: { scale: `w:${major.name}` } });
    const before = activeTab(s).sel;
    s = run(s, { type: 'pick/apply' });
    expect(activeTab(s).pick.ok).toBe(false);
    expect(activeTab(s).pick.msg).toMatch(/The subset was not changed/);
    expect(activeTab(s).sel).toEqual(before);
  });

  it('"Picked scale" falls back to 12-EDO when there is no pick', () => {
    const s = run(initialState(), { type: 'cmp/set', patch: { ref: 'picked' } });
    expect(activeTab(s).cmp.ref).toBe('edo12');
    const j = run(initialState(), { type: 'cmp/set', patch: { ref: 'ji', odd: 9999 } });
    expect(activeTab(j).cmp).toEqual({ ref: 'ji', odd: 255, m: 12 });
    const m = run(initialState(), { type: 'cmp/set', patch: { ref: 'medo', m: Number.NaN } });
    expect(activeTab(m).cmp.m).toBe(12);
  });
});

describe('generation', () => {
  it('changing the starting harmonic keeps the selected pitches; new notes join only with keepNew', () => {
    let s = run(initialState(), { type: 'sel/set', idx: [0, 2, 4] }); // 1/1 5/4 3/2
    s = run(s, { type: 'gen/patch', patch: { h: 16 } });
    expect(ratios(s)).toHaveLength(16);
    expect(selRatios(s)).toEqual(['1/1', '5/4', '3/2']);
    expect(activeTab(s).gen.preset).toBe(''); // hand-edited
    s = run(s, { type: 'gen/keepNew', on: true }, { type: 'gen/patch', patch: { h: 24 } });
    expect(selRatios(s).length).toBeGreaterThan(3);
    expect(selRatios(s)).toEqual(expect.arrayContaining(['1/1', '5/4', '3/2']));
  });

  it('a preset or a new method selects everything and fills the inputs', () => {
    let s = run(initialState(), { type: 'sel/set', idx: [0] });
    s = run(s, { type: 'gen/preset', name: '19-EDO' });
    expect(activeTab(s).gen.method).toBe('edo');
    expect(activeTab(s).gen.preset).toBe('19-EDO');
    expect(activeTab(s).field).toHaveLength(19);
    expect(activeTab(s).sel).toHaveLength(19);
    s = run(s, { type: 'sel/set', idx: [0, 3] }, { type: 'gen/method', method: 'harmonic' });
    expect(activeTab(s).gen.method).toBe('harmonic');
    expect(activeTab(s).sel).toHaveLength(activeTab(s).field.length);
    // an unknown preset does nothing
    expect(run(s, { type: 'gen/preset', name: 'No such preset' })).toBe(s);
  });

  it('a bad repeat keeps the old field and sets the message; fixing it rebuilds', () => {
    let s = run(initialState(), { type: 'sel/set', idx: [0, 2] });
    const field = activeTab(s).field;
    s = run(s, { type: 'gen/patch', patch: { rep: '3/' } });
    expect(activeTab(s).err).toMatch(/Repeat interval/);
    expect(activeTab(s).field).toBe(field);
    expect(activeTab(s).sel).toEqual([0, 2]);
    expect(activeTab(s).gen.rep).toBe('3/');
    s = run(s, { type: 'gen/patch', patch: { rep: '3/1' } });
    expect(activeTab(s).err).toBe('');
    expect(activeTab(s).rep.c).toBeCloseTo(1901.955, 2);
  });

  it('prime filter switches, All and None (None keeps 2)', () => {
    let s = run(initialState(), { type: 'gen/prime', slot: 3 }); // 7
    expect(ratios(s)).not.toContain('7/4');
    s = run(s, { type: 'gen/prime', slot: 3 });
    expect(ratios(s)).toContain('7/4');
    s = run(s, { type: 'gen/primes', on: false });
    expect(activeTab(s).gen.mask[0]).toBe(true);
    expect(activeTab(s).gen.mask.filter(Boolean)).toHaveLength(1);
    expect(ratios(s)).toEqual(['1/1']);
    s = run(s, { type: 'gen/primes', on: true });
    expect(ratios(s)).toHaveLength(8);
    // a slot outside the mask is ignored
    expect(run(s, { type: 'gen/prime', slot: 99 }).tabs[0].gen.mask).toEqual(activeTab(s).gen.mask);
  });

  it('lattice axes can be edited and switched off', () => {
    let s = run(initialState(), { type: 'gen/method', method: 'lattice' });
    const n0 = ratios(s).length;
    s = run(s, { type: 'gen/axis', index: 1, patch: { on: false } });
    expect(ratios(s).length).toBeLessThan(n0);
    s = run(s, { type: 'gen/axis', index: 0, patch: { g: 'junk' } });
    expect(activeTab(s).err).toMatch(/Axis 1/);
    expect(activeTab(s).gen.axes[0].g).toBe('junk');
  });

  it('a custom list (and a loaded .scl) replaces the method and repeat', () => {
    const s = run(initialState(), { type: 'gen/custom', custom: '9/8\n5/4\n3/2', rep: '2/1' });
    expect(activeTab(s).gen.method).toBe('custom');
    expect(ratios(s)).toEqual(['1/1', '9/8', '5/4', '3/2']);
  });

  it('regenerating drops pointers into the old field (hover, pin, chord, preview, lights)', () => {
    let s = run(
      initialState(),
      { type: 'hover', i: 3 },
      { type: 'pin', i: 4 },
      { type: 'chord/pick', set: new Set([1, 2]) },
      { type: 'preview', idx: [1] },
      { type: 'sounding', idx: [1] }
    );
    s = run(s, { type: 'gen/patch', patch: { h: 12 } });
    expect([s.hover, s.pin, s.chordPick, s.preview]).toEqual([null, null, null, null]);
    expect(s.sounding.size).toBe(0);
    // changing only the selection keeps them
    const t = run(initialState(), { type: 'pin', i: 4 }, { type: 'sel/toggle', i: 1 });
    expect(t.pin).toBe(4);
  });
});

describe('tabs', () => {
  it('adds, switches, renames (empty goes back to the automatic name) and closes', () => {
    let s = run(initialState(), { type: 'tab/add', gen: edo(19) });
    expect(s.tabs).toHaveLength(2);
    expect(s.active).toBe(1);
    expect(tabName(activeTab(s))).toBe('19-EDO');
    expect(s.tabs[1].id).toBe('t2');
    s = run(s, { type: 'tab/rename', index: 1, name: '  my   nineteen  ' });
    expect(tabName(activeTab(s))).toBe('my nineteen');
    s = run(s, { type: 'tab/rename', index: 1, name: '   ' });
    expect(tabName(activeTab(s))).toBe('19-EDO');
    s = run(s, { type: 'tab/switch', index: 0 });
    expect(s.active).toBe(0);
    expect(run(s, { type: 'tab/switch', index: 5 })).toBe(s);
    s = run(s, { type: 'tab/switch', index: 1 }, { type: 'tab/close', index: 0 });
    expect(s.tabs).toHaveLength(1);
    expect(s.active).toBe(0);
    expect(tabName(activeTab(s))).toBe('19-EDO');
    // the last tab cannot be closed
    expect(run(s, { type: 'tab/close', index: 0 })).toBe(s);
  });

  it('closing a tab before or after the active one keeps the same tab active', () => {
    let s = run(initialState(), { type: 'tab/add' }, { type: 'tab/add' });
    expect(s.active).toBe(2);
    s = run(s, { type: 'tab/close', index: 0 });
    expect(s.active).toBe(1);
    expect(s.tabs[s.active].id).toBe('t3');
    s = run(s, { type: 'tab/switch', index: 0 }, { type: 'tab/close', index: 1 });
    expect(s.active).toBe(0);
    expect(s.tabs[0].id).toBe('t2');
  });

  it('a tab keeps its own field and selection; switching drops the pointers', () => {
    let s = run(
      initialState(),
      { type: 'sel/set', idx: [0, 4] },
      { type: 'tab/add', gen: edo(12) }
    );
    s = run(s, { type: 'hover', i: 2 }, { type: 'tab/switch', index: 0 });
    expect(s.hover).toBeNull();
    expect(activeTab(s).sel).toEqual([0, 4]);
    expect(s.tabs[1].field).toHaveLength(12);
  });

  it('stops adding at the maximum', () => {
    let s = initialState();
    for (let i = 0; i < MAX_TABS + 3; i++) {
      s = run(s, { type: 'tab/add' });
    }
    expect(s.tabs).toHaveLength(MAX_TABS);
  });

  it('makeTab falls back to an empty field with the message for inputs that fail', () => {
    const t = makeTab('t9', { ...defaultGen(), rep: 'nope' });
    expect(t.field).toEqual([]);
    expect(t.err).toMatch(/Repeat interval/);
    expect(presetGen('missing').method).toBe('harmonic');
  });
});

describe('saved subsets', () => {
  const base = () => run(initialState(), { type: 'sel/set', idx: [0, 2, 4] });

  it('saves by name (or "Subset n"), renames, deletes', () => {
    let s = run(
      base(),
      { type: 'saved/save', name: ' Otonal  triad ' },
      { type: 'saved/save', name: '' }
    );
    expect(s.saved.map((x) => x.name)).toEqual(['Otonal triad', 'Subset 2']);
    expect(s.saved[0].selCents.map((c) => Math.round(c))).toEqual([0, 386, 702]);
    expect(s.saved[0].id).toBe('s1');
    s = run(s, { type: 'saved/rename', id: 's1', name: 'Triad' });
    expect(s.saved[0].name).toBe('Triad');
    expect(run(s, { type: 'saved/rename', id: 's1', name: '  ' })).toBe(s);
    s = run(s, { type: 'saved/delete', id: 's1' });
    expect(s.saved.map((x) => x.id)).toEqual(['s2']);
    s = run(s, { type: 'saved/save', name: 'again' });
    expect(s.saved.map((x) => x.id)).toEqual(['s2', 's3']);
  });

  it('loads one of this collection: the selection and mode come back', () => {
    let s = run(base(), { type: 'mode/set', mode: 1 }, { type: 'saved/save', name: 'T' });
    s = run(
      s,
      { type: 'sel/all' },
      { type: 'preview', idx: [1] },
      { type: 'saved/load', id: 's1' }
    );
    expect(selRatios(s)).toEqual(['1/1', '5/4', '3/2']);
    expect(activeTab(s).mode).toBe(1);
    expect(s.preview).toBeNull();
    // a stored mode past the end is repaired
    s = run(s, { type: 'saved/load', id: 'nope' });
    expect(selRatios(s)).toEqual(['1/1', '5/4', '3/2']);
  });

  it('loading a subset of another collection switches this tab to that collection', () => {
    let s = run(
      initialState(),
      { type: 'tab/add', gen: edo(12) },
      { type: 'sel/set', idx: [0, 4, 7] }
    );
    s = run(
      s,
      { type: 'saved/save', name: 'major triad' },
      { type: 'gen/preset', name: 'Harmonics 8–15' }
    );
    expect(activeTab(s).field).toHaveLength(8);
    s = run(s, { type: 'saved/load', id: 's1' });
    expect(activeTab(s).gen.method).toBe('edo');
    expect(activeTab(s).field).toHaveLength(12);
    expect(activeTab(s).sel).toEqual([0, 4, 7]);
  });

  it('the keepNew choice is stored with the saved inputs', () => {
    const s = run(base(), { type: 'gen/keepNew', on: true }, { type: 'saved/save', name: 'k' });
    expect(s.saved[0].gen.keepNew).toBe(true);
  });
});

describe('pointers, lights, settings, layout', () => {
  it('hover, pin, chord and preview are plain setters', () => {
    const s = run(
      initialState(),
      { type: 'hover', i: 2 },
      { type: 'pin', i: 3 },
      { type: 'chord/hover', set: new Set([1]) },
      { type: 'preview', idx: [0, 1] }
    );
    expect([s.hover, s.pin, [...(s.chordHover ?? [])], s.preview]).toEqual([2, 3, [1], [0, 1]]);
    expect(run(s, { type: 'hover', i: 2 })).toBe(s);
  });

  it('sounding keeps the same object when nothing changed', () => {
    const a = run(initialState(), { type: 'sounding', idx: [1, 3] });
    expect([...a.sounding]).toEqual([1, 3]);
    expect(run(a, { type: 'sounding', idx: [3, 1] })).toBe(a);
    expect(run(a, { type: 'sounding', idx: [] }).sounding.size).toBe(0);
  });

  it('merges UI patches and visualizer patches', () => {
    let s = run(initialState(), { type: 'ui', patch: { tol: 30, volume: 0.2 } });
    expect(s.ui.tol).toBe(30);
    expect(s.ui.dockOpen).toBe(true);
    s = run(s, { type: 'viz', id: 'viz2', patch: { dim: '3d' } });
    expect(s.ui.viz.viz2.dim).toBe('3d');
    expect(s.ui.viz.viz1.dim).toBe('2d');
  });

  it('applies a layout function and keeps identity when it changes nothing', () => {
    const s = initialState();
    const same = run(s, { type: 'layout', fn: (l) => l });
    expect(same).toBe(s);
    const next = run(s, { type: 'layout', fn: (l) => pinPanel(l, 'retuner', 'left') });
    expect(next.layout.left.at(-1)).toEqual(['retuner']);
  });

  it('restore replaces the tabs and clears the pointers', () => {
    const s = run(initialState(), { type: 'hover', i: 1 });
    const t = run(s, { type: 'restore', state: { tabs: [makeTab('t7', edo(5))], active: 0 } });
    expect(t.hover).toBeNull();
    expect(activeTab(t).field).toHaveLength(5);
  });
});
