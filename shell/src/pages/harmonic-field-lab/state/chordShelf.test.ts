import { describe, expect, it } from 'vitest';
import { ratioNote, sketchPitches, type Note } from '../../../lib/harmonic-field';
import {
  MAX_CHORDS,
  chordPitchesFor,
  emptyShelf,
  shelfReduce,
  stashChord,
  type StashInput,
} from './chordShelf';
import { ownerOfTab } from './generatorLibrary';
import { activeTab, initialState, labReducer, type Action, type LabState } from './labState';

const run = (s: LabState, ...a: Action[]) => a.reduce(labReducer, s);
const triad = (root: Note = ratioNote(1, 1)) => sketchPitches(root, '4:5:6')!;
type StashReq = Extract<Action, { type: 'shelf/stash' }>['stash'];
const stash = (s: LabState, extra: Partial<StashReq> = {}) =>
  labReducer(s, {
    type: 'shelf/stash',
    stash: {
      pitches: triad(),
      template: '4:5:6',
      rootDeg: 0,
      date: '2026-11-14T10:00:00.000Z',
      ...extra,
    },
  });
const ids = (s: LabState) => s.shelf.chords.map((c) => c.id);
const H8 = 'Harmonics 8–15';

describe('stash', () => {
  it('stores the exact pitches and the provenance of the active tab and settings', () => {
    const s0 = run(
      initialState(),
      { type: 'gen/preset', name: H8 },
      { type: 'tab/rename', index: 0, name: 'Mine' },
      { type: 'ui', patch: { tol: 25, baseHz: 220, modePlayback: 'relative' } }
    );
    const s = stash(s0);
    const c = s.shelf.chords[0];
    expect(c.id).toBe('c1');
    expect(c.name).toBe('Chord 1');
    expect(c.pitches.map((p) => p.c)).toEqual(triad().map((p) => p.c));
    expect(c.template).toBe('4:5:6');
    expect(c.rootDeg).toBe(0);
    expect(c.tol).toBe(25);
    expect(c.refHz).toBe(220);
    expect(c.frame).toBe('relative');
    expect(c.date).toBe('2026-11-14T10:00:00.000Z');
    expect(c.parent).toBeNull();
    expect(c.source?.tab).toBe('Mine');
    expect(c.source?.gen.preset).toBe(H8);
    expect(c.source?.subset.pitches).toHaveLength(activeTab(s0).sel.length);
    expect(c.source?.subset.root).toEqual(c.source?.subset.pitches[0]);
    expect(s.shelf.lastStashed).toBe('c1');
  });

  it('the stored chord is a copy: later edits to the tab or the request change nothing', () => {
    const pitches = triad();
    const s = stash(initialState(), { pitches });
    pitches[0].c = 999;
    expect(s.shelf.chords[0].pitches[0].c).toBe(0);
    const s2 = run(s, { type: 'sel/none' });
    expect(s2.shelf.chords[0].source?.subset.pitches.length).toBeGreaterThan(0);
  });

  it('ids are never reused; the name is the first free label', () => {
    let s = stash(initialState());
    s = stash(s);
    s = labReducer(s, { type: 'shelf/delete', id: 'c2' });
    s = stash(s);
    expect(ids(s)).toEqual(['c1', 'c3']);
    expect(s.shelf.chords.map((c) => c.name)).toEqual(['Chord 1', 'Chord 2']);
  });

  it('refuses empty chords and the cap, with a reason, changing nothing else', () => {
    const empty = stash(initialState(), { pitches: [] });
    expect(empty.shelf.chords).toHaveLength(0);
    expect(empty.shelf.refusal?.reason).toMatch(/at least one/);
    const input: StashInput = {
      pitches: triad(),
      template: null,
      rootDeg: null,
      tol: 18,
      date: '',
      refHz: 261.6,
      frame: 'parallel',
      parent: null,
      source: null,
    };
    let sh = emptyShelf();
    for (let i = 0; i < MAX_CHORDS; i++) {
      sh = stashChord(sh, input);
    }
    expect(sh.chords).toHaveLength(MAX_CHORDS);
    const over = stashChord(sh, input);
    expect(over.chords).toHaveLength(MAX_CHORDS);
    expect(over.refusal?.reason).toMatch(/full/);
  });

  it('a tab without notes stores the chord with no source', () => {
    const s = stash(run(initialState(), { type: 'sel/none' }));
    expect(s.shelf.chords[0].source).toBeNull();
  });
});

describe('rename, reorder, delete, selection', () => {
  const three = () => stash(stash(stash(initialState())));

  it('rename trims, ignores empty and unchanged names', () => {
    const s = three();
    const named = labReducer(s, { type: 'shelf/rename', id: 'c2', name: '  Tonic   chord ' });
    expect(named.shelf.chords[1].name).toBe('Tonic chord');
    expect(labReducer(s, { type: 'shelf/rename', id: 'c2', name: '  ' })).toBe(s);
    expect(labReducer(s, { type: 'shelf/rename', id: 'c2', name: 'Chord 2' })).toBe(s);
    expect(labReducer(s, { type: 'shelf/rename', id: 'zz', name: 'x' })).toBe(s);
  });

  it('move reorders (clamped) and leaves ids alone', () => {
    const s = three();
    expect(ids(labReducer(s, { type: 'shelf/move', id: 'c1', to: 2 }))).toEqual(['c2', 'c3', 'c1']);
    expect(ids(labReducer(s, { type: 'shelf/move', id: 'c3', to: -5 }))).toEqual([
      'c3',
      'c1',
      'c2',
    ]);
    expect(ids(labReducer(s, { type: 'shelf/move', id: 'c3', to: 99 }))).toEqual([
      'c1',
      'c2',
      'c3',
    ]);
    expect(labReducer(s, { type: 'shelf/move', id: 'c2', to: 1 })).toBe(s);
  });

  it('delete drops the slot from the selection', () => {
    let s = three();
    s = run(
      s,
      { type: 'shelf/select', id: 'c1' },
      { type: 'shelf/select', id: 'c3', additive: true }
    );
    expect(s.shelf.selected).toEqual(['c1', 'c3']);
    s = labReducer(s, { type: 'shelf/delete', id: 'c3' });
    expect(s.shelf.selected).toEqual(['c1']);
    expect(labReducer(s, { type: 'shelf/delete', id: 'c3' })).toBe(s);
  });

  it('select: plain selects one (again clears), additive toggles, all and none', () => {
    let s = three();
    s = labReducer(s, { type: 'shelf/select', id: 'c2' });
    expect(s.shelf.selected).toEqual(['c2']);
    s = labReducer(s, { type: 'shelf/select', id: 'c1' });
    expect(s.shelf.selected).toEqual(['c1']);
    s = labReducer(s, { type: 'shelf/select', id: 'c3', additive: true });
    s = labReducer(s, { type: 'shelf/select', id: 'c1', additive: true });
    expect(s.shelf.selected).toEqual(['c3']);
    s = labReducer(s, { type: 'shelf/select', id: 'c3' });
    expect(s.shelf.selected).toEqual([]);
    s = labReducer(s, { type: 'shelf/selectAll' });
    expect(s.shelf.selected).toEqual(['c1', 'c2', 'c3']);
    expect(labReducer(s, { type: 'shelf/selectAll' })).toBe(s);
    expect(labReducer(s, { type: 'shelf/selectNone' }).shelf.selected).toEqual([]);
    expect(labReducer(s, { type: 'shelf/select', id: 'nope' })).toBe(s);
  });

  it('a shelf action leaves tabs, library and retuner untouched', () => {
    const s0 = stash(initialState());
    const s = run(
      s0,
      { type: 'shelf/rename', id: 'c1', name: 'x' },
      { type: 'shelf/select', id: 'c1' }
    );
    expect(s.tabs).toBe(s0.tabs);
    expect(s.library).toBe(s0.library);
    expect(s.retuner).toBe(s0.retuner);
  });

  it('sync keeps the selection where the slot still exists', () => {
    let s = three();
    s = labReducer(s, { type: 'shelf/selectAll' });
    const other = labReducer(s, { type: 'shelf/delete', id: 'c2' }).shelf;
    const t = shelfReduce(s.shelf, { type: 'shelf/sync', shelf: other });
    expect(t.selected).toEqual(['c1', 'c3']);
    expect(t.next).toBe(4);
  });
});

describe('sketch and armed chord', () => {
  it('sets template and root degree, arming marks the chip source, a hand pick disarms', () => {
    let s = initialState();
    expect(s.shelf.sketch).toEqual({
      template: null,
      rootDeg: 0,
      armed: false,
      shape: null,
      exact: false,
    });
    s = labReducer(s, { type: 'sketch/arm', template: '10:12:15' });
    expect(s.shelf.sketch).toEqual({
      template: '10:12:15',
      rootDeg: 0,
      armed: true,
      shape: null,
      exact: false,
    });
    s = labReducer(s, { type: 'sketch/set', patch: { rootDeg: 3 } });
    expect(s.shelf.sketch).toEqual({
      template: '10:12:15',
      rootDeg: 3,
      armed: true,
      shape: null,
      exact: false,
    });
    expect(labReducer(s, { type: 'sketch/arm', template: '10:12:15' })).toBe(s);
    s = labReducer(s, { type: 'sketch/set', patch: { template: '4:5:6' } });
    expect(s.shelf.sketch).toEqual({
      template: '4:5:6',
      rootDeg: 3,
      armed: false,
      shape: null,
      exact: false,
    });
    // the realization shape travels with an arm and is dropped with a hand-picked template; Exact is its own switch
    const shaped = labReducer(s, {
      type: 'sketch/arm',
      template: '4:5:6',
      shape: [ratioNote(1, 1), ratioNote(5, 4)],
    });
    expect(shaped.shelf.sketch.shape).toHaveLength(2);
    expect(
      labReducer(shaped, {
        type: 'sketch/arm',
        template: '4:5:6',
        shape: [ratioNote(1, 1), ratioNote(5, 4)],
      })
    ).toBe(shaped);
    expect(
      labReducer(shaped, { type: 'sketch/set', patch: { template: '6:7:9' } }).shelf.sketch.shape
    ).toBeNull();
    const ex = labReducer(shaped, { type: 'sketch/set', patch: { exact: true } });
    expect(ex.shelf.sketch.exact).toBe(true);
    expect(ex.shelf.sketch.shape).toHaveLength(2);
    expect(labReducer(s, { type: 'sketch/set', patch: { rootDeg: -1 } })).toBe(s);
    const re = labReducer(s, { type: 'sketch/arm', template: '6:7:9', rootDeg: 2 });
    expect(re.shelf.sketch.rootDeg).toBe(2);
  });
});

describe('reload', () => {
  const stashed = (): LabState => {
    let s = run(
      initialState(),
      { type: 'gen/preset', name: H8 },
      { type: 'sel/set', idx: [0, 2, 4] }
    );
    s = run(s, { type: 'mode/set', mode: 1 }, { type: 'tab/rename', index: 0, name: 'Src' });
    const f = activeTab(s).field;
    return stash(s, { pitches: [f[2], f[4]], rootDeg: 0 });
  };

  it('builds a NEW tab from the provenance, current tabs untouched, linked to the matching preset', () => {
    const s0 = stashed();
    const s = run(
      s0,
      { type: 'gen/patch', patch: { h: 12 } },
      { type: 'sel/none' },
      { type: 'shelf/reload', id: 'c1' }
    );
    expect(s.tabs).toHaveLength(2);
    expect(s.active).toBe(1);
    // the old tab is exactly as the edits left it
    expect(s.tabs[0].gen.h).toBe(12);
    expect(s.tabs[0].sel).toEqual([]);
    const t = activeTab(s);
    expect(t.name).toBe('Src');
    expect(t.gen.h).toBe(8);
    expect(t.link).toBe(`b:${H8}`);
    expect(t.gen.preset).toBe(H8);
    expect(t.sel).toEqual([0, 2, 4]);
    expect(t.mode).toBe(1);
    expect(t.fromChord).toBe('c1');
    expect(s.shelf.lastReload).toEqual({ id: 'c1', found: 3, missing: 0 });
    expect(s.shelf.refusal).toBeNull();
    expect(s.library).toBe(s0.library);
  });

  it('reconnects to an Auto-saved generator and does not create a new one', () => {
    let s = run(initialState(), { type: 'gen/patch', patch: { h: 11 } }, { type: 'subset/add' });
    expect(s.library.untitled).toHaveLength(1);
    s = stash(s);
    const lib = s.library;
    s = run(s, { type: 'shelf/reload', id: 'c1' });
    expect(s.library).toBe(lib);
    expect(activeTab(s).link).toBe(ownerOfTab(lib, activeTab(s)));
    expect(activeTab(s).link?.startsWith('u:')).toBe(true);
  });

  it('with no matching generator the new tab is unlinked and not a preset', () => {
    let s = run(initialState(), { type: 'gen/patch', patch: { h: 11 } });
    s = stash(s);
    s = run(s, { type: 'shelf/reload', id: 'c1' });
    expect(activeTab(s).link).toBeUndefined();
    expect(s.library.untitled).toHaveLength(0);
  });

  it('chords stashed from a reloaded tab record the parent (lineage)', () => {
    let s = run(stashed(), { type: 'shelf/reload', id: 'c1' });
    s = stash(s);
    expect(s.shelf.chords[1].parent).toBe('c1');
    // the original tab has no parent
    expect(stash(run(s, { type: 'tab/switch', index: 0 })).shelf.chords[2].parent).toBeNull();
    // a duplicated tab keeps the lineage
    expect(activeTab(run(s, { type: 'tab/duplicate' })).fromChord).toBe('c1');
  });

  it('reports pitches the rebuilt field lacks', () => {
    const s0 = stashed();
    const c = s0.shelf.chords[0];
    const pitches = [...c.source!.subset.pitches, { m: null, c: 123.456 }];
    const source = { ...c.source!, subset: { pitches, root: pitches[1] } };
    const s = run(
      { ...s0, shelf: { ...s0.shelf, chords: [{ ...c, source }] } },
      { type: 'shelf/reload', id: 'c1' }
    );
    expect(s.shelf.lastReload).toEqual({ id: 'c1', found: 3, missing: 1 });
    expect(activeTab(s).sel).toHaveLength(3);
  });

  it('refuses at the tab cap, without a source, and for unknown ids', () => {
    let s = stashed();
    const noSource = {
      ...s,
      shelf: { ...s.shelf, chords: [{ ...s.shelf.chords[0], source: null }] },
    };
    const refused = run(noSource, { type: 'shelf/reload', id: 'c1' });
    expect(refused.shelf.refusal?.reason).toMatch(/no stored source/);
    expect(refused.tabs).toBe(noSource.tabs);
    expect(labReducer(s, { type: 'shelf/reload', id: 'zz' })).toBe(s);
    for (let i = 0; i < 20; i++) {
      s = labReducer(s, { type: 'tab/add' });
    }
    const n = s.tabs.length;
    const r = labReducer(s, { type: 'shelf/reload', id: 'c1' });
    expect(r.tabs).toHaveLength(n);
    expect(r.shelf.refusal?.reason).toMatch(/tabs/);
  });
});

describe('chordPitchesFor (pitch frame rule)', () => {
  it('Relative plays the stored field-absolute pitches; Parallel divides by the source mode root', () => {
    let s = run(initialState(), { type: 'sel/set', idx: [3, 4, 0], mode: 0 });
    s = labReducer(s, {
      type: 'shelf/stash',
      stash: { pitches: [ratioNote(3, 2), ratioNote(15, 8), ratioNote(9, 4)], date: '' },
    });
    const c = s.shelf.chords[0];
    const root = c.source!.subset.root!;
    expect(root.c).toBeCloseTo(activeTab(s).field[activeTab(s).sel[0]].c, 6);
    const fixed = {
      ...c,
      source: { ...c.source!, subset: { ...c.source!.subset, root: ratioNote(3, 2) } },
    };
    const fmt = (ps: Note[]) => ps.map((p) => `${p.c.toFixed(3)}`);
    expect(fmt(chordPitchesFor(fixed, 'relative'))).toEqual(
      fmt([ratioNote(3, 2), ratioNote(15, 8), ratioNote(9, 4)])
    );
    const par = chordPitchesFor(fixed, 'parallel');
    expect(fmt(par)).toEqual(fmt([ratioNote(1, 1), ratioNote(5, 4), ratioNote(3, 2)]));
    expect(par[1].m).toEqual(ratioNote(5, 4).m);
    // no source: as stored in both frames
    const bare = { ...c, source: null };
    expect(chordPitchesFor(bare, 'parallel')).toEqual(c.pitches);
  });
});
