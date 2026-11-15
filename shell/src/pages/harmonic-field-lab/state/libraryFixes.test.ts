import { describe, expect, it } from 'vitest';
import { ratioNote, type Note } from '../../../lib/harmonic-field';
import { genFromPreset, presetByName } from './generate';
import {
  MAX_PRESETS,
  MAX_SUBSETS,
  MAX_UNTITLED,
  addSubset,
  cloneGen,
  copySubsetsTo,
  emptyLibrary,
  ensureUntitled,
  orphanSubsets,
  renameSubset,
  saveUserPreset,
  subsetsOf,
  undoUpdate,
  updateBlocker,
  updateOwner,
  type GenLibrary,
  type LibSubset,
} from './generatorLibrary';
import { activeTab, initialState, labReducer, type Action, type LabState } from './labState';

const run = (s: LabState, ...a: Action[]) => a.reduce(labReducer, s);
const r = (n: number, d: number): Note => ratioNote(n, d);
const H = genFromPreset(presetByName('Harmonics 8–15')!);
const tab = (s: LabState) => activeTab(s);
const set = (...p: Note[]) => ({ pitches: p, root: p[0] });
// harmonics 12..23 holds 1/1 5/4 3/2 7/4 but not 11/8 or 13/8
const field12 = (): Note[] => [r(1, 1), r(13, 12), r(7, 6), r(5, 4), r(4, 3), r(3, 2), r(7, 4)];

describe('Undo touches only what the Update changed', () => {
  const setup = () => {
    const p = saveUserPreset(emptyLibrary(), { name: 'P', folder: '', gen: H });
    const key = p.key!;
    let lib = p.lib;
    lib = addSubset(lib, key, set(r(1, 1), r(5, 4))).lib; // s1: unchanged by the update
    lib = addSubset(lib, key, set(r(1, 1), r(11, 8), r(3, 2))).lib; // s2: rewritten (11/8 lost)
    lib = addSubset(lib, key, set(r(11, 8), r(13, 8))).lib; // s3: removed
    const out = updateOwner(lib, key, { ...H, h: 12 }, field12())!;
    return { key, before: lib, out };
  };

  it('a subset added after the Update survives Undo', () => {
    const { key, out } = setup();
    const added = addSubset(out.lib, key, set(r(1, 1), r(7, 4)));
    const back = undoUpdate(added.lib, out.undo);
    expect(subsetsOf(back, key).map((s) => s.id)).toEqual(['s1', 's2', 's3', added.id]);
    expect(subsetsOf(back, key)[1].pitches).toHaveLength(3);
  });

  it('a subset renamed or deleted after the Update is left as the user made it', () => {
    const { key, out } = setup();
    const renamed = renameSubset(out.lib, 's2', 'Mine');
    const back = undoUpdate(renamed, out.undo);
    expect(subsetsOf(back, key).find((s) => s.id === 's2')).toMatchObject({ name: 'Mine' });
    expect(subsetsOf(back, key).find((s) => s.id === 's2')?.pitches).toHaveLength(2); // not overwritten
    expect(subsetsOf(back, key).map((s) => s.id)).toContain('s3'); // the removed one still comes back
    const deleted = { ...out.lib, subsets: out.lib.subsets.filter((s) => s.id !== 's2') };
    expect(subsetsOf(undoUpdate(deleted, out.undo), key).map((s) => s.id)).toEqual(['s1', 's3']);
  });

  it('a library synced from another window: its changes survive, the update is still undone where unchanged', () => {
    const { key, out } = setup();
    const other = addSubset(out.lib, 'b:Harmonics 8–15', set(r(1, 1))).lib; // another owner
    const theirs = addSubset(other, key, set(r(3, 2), r(7, 4))).lib; // same owner
    const back = undoUpdate(theirs, out.undo);
    expect(subsetsOf(back, 'b:Harmonics 8–15')).toHaveLength(1);
    expect(subsetsOf(back, key).map((s) => s.id)).toEqual(['s1', 's2', 's3', 's5']);
    expect(subsetsOf(back, key)[1].pitches).toHaveLength(3);
  });

  it('the generator is restored only when it is still what the update set', () => {
    const { key, out } = setup();
    const changedElsewhere: GenLibrary = {
      ...out.lib,
      presets: out.lib.presets.map((p) => ({
        ...p,
        gen: cloneGen(p.gen, ''),
        name: p.name,
        folder: p.folder,
      })),
    };
    expect(undoUpdate(changedElsewhere, out.undo).presets[0].gen.h).toBe(8);
    const moved = {
      ...out.lib,
      presets: out.lib.presets.map((p) => ({ ...p, gen: { ...p.gen, h: 30 } })),
    };
    expect(undoUpdate(moved, out.undo).presets[0].gen.h).toBe(30);
    expect(key).toBe('p:p1');
  });
});

describe('the notice ends on library changes', () => {
  const withNotice = () =>
    run(
      initialState(),
      { type: 'preset/save', name: 'P', folder: '' },
      { type: 'sel/set', idx: [0, 2, 4] },
      { type: 'subset/add' },
      { type: 'gen/patch', patch: { h: 12 } },
      { type: 'preset/update' }
    );
  it.each<[string, Action]>([
    ['subset/rename', { type: 'subset/rename', id: 's1', name: 'x' }],
    ['subset/delete', { type: 'subset/delete', id: 's1' }],
    ['lib/sync', { type: 'lib/sync', library: emptyLibrary() }],
    ['preset/rename', { type: 'preset/rename', id: 'p1', name: 'Q' }],
    ['preset/move', { type: 'preset/move', id: 'p1', folder: 'A' }],
    ['preset/delete', { type: 'preset/delete', id: 'p1' }],
  ])('%s ends the notice', (_n, a) => {
    expect(withNotice().notice).not.toBeNull();
    expect(run(withNotice(), a).notice).toBeNull();
  });
  it('Add ends it, so Update -> Add -> Undo cannot lose the new row', () => {
    let s = run(withNotice(), { type: 'sel/set', idx: [0, 3] }, { type: 'subset/add' });
    expect(s.notice).toBeNull();
    const n = s.library.subsets.length;
    s = run(s, { type: 'notice/undo' });
    expect(s.library.subsets).toHaveLength(n);
  });
  it('Save as new on an unmodified Untitled generator (u: becomes p:) ends it and keeps everything', () => {
    let s = run(
      initialState(),
      { type: 'gen/patch', patch: { h: 9 } },
      { type: 'sel/set', idx: [0, 2] },
      { type: 'subset/add' },
      { type: 'gen/patch', patch: { h: 12 } },
      { type: 'preset/update' }
    );
    expect(s.notice?.owner).toBe('u:u1');
    s = run(s, { type: 'preset/save', name: 'Twelves', folder: '' });
    expect(s.notice).toBeNull();
    expect(s.library.subsets).toHaveLength(1);
    expect(s.library.subsets[0].owner).toBe('p:p1');
    expect(run(s, { type: 'notice/undo' })).toBe(s);
  });
  it('a copy notice made by Save as new stays', () => {
    const s = run(
      initialState(),
      { type: 'sel/set', idx: [0, 2] },
      { type: 'subset/add' },
      { type: 'gen/patch', patch: { h: 12 } },
      { type: 'preset/save', name: 'X', folder: '', copySubsets: true }
    );
    expect(s.notice?.kind).toBe('copy');
  });
});

describe('updateBlocker', () => {
  it('gives the reason, or null when Update can run', () => {
    const lib0 = emptyLibrary();
    expect(updateBlocker(lib0, { gen: { ...H, preset: '', h: 12 } })).toMatch(/not saved yet/);
    expect(
      updateBlocker(lib0, { gen: { ...H, preset: '', h: 12 }, link: 'b:Harmonics 8–15' })
    ).toMatch(/Built-in/);
    const p = saveUserPreset(lib0, { name: 'P', folder: '', gen: H });
    const link = p.key!;
    expect(updateBlocker(p.lib, { gen: H, link })).toMatch(/Nothing has changed/);
    expect(updateBlocker(p.lib, { gen: { ...H, preset: '', rep: 'nope' }, link })).toMatch(
      /does not build/
    );
    expect(updateBlocker(p.lib, { gen: { ...H, preset: '', h: 12 }, link })).toBeNull();
  });
  it('the reducer no-ops with a blocker, and Lab state stays the same object', () => {
    const s = run(initialState(), { type: 'gen/patch', patch: { h: 12 } });
    expect(run(s, { type: 'preset/update' })).toBe(s);
  });
});

describe('caps', () => {
  const full = (n: number): LibSubset[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `s${i + 1}`,
      owner: 'p:p1',
      name: `n${i}`,
      pitches: [{ m: null, c: i + 1 }],
      root: null,
    }));
  it('refuses with a reason instead of dropping silently', () => {
    const lib: GenLibrary = { ...emptyLibrary(), subsets: full(MAX_SUBSETS) };
    const a = addSubset(lib, 'p:p1', set(r(1, 1), r(5, 4)));
    expect(a.refused).toMatch(/full/);
    expect(a.lib).toBe(lib);
    const big = Array.from({ length: 5000 }, (_, i) => ({ m: null, c: i }));
    expect(addSubset(emptyLibrary(), 'p:p1', { pitches: big, root: null }).refused).toMatch(
      /pitches/
    );

    const presets = Array.from({ length: MAX_PRESETS }, (_, i) => ({
      id: `p${i + 1}`,
      name: 'x',
      folder: '',
      gen: H,
    }));
    const lp: GenLibrary = { ...emptyLibrary(), presets };
    expect(saveUserPreset(lp, { name: 'y', folder: '', gen: H })).toMatchObject({ key: null });

    const untitled = Array.from({ length: MAX_UNTITLED }, (_, i) => ({
      id: `u${i + 1}`,
      gen: { ...H, preset: '', h: 100 + i },
    }));
    const lu: GenLibrary = { ...emptyLibrary(), untitled };
    expect(ensureUntitled(lu, { ...H, preset: '', h: 5 })).toMatchObject({ key: null });
    // an existing one is still found at the cap
    expect(ensureUntitled(lu, { ...H, preset: '', h: 100 }).key).toBe('u:u1');
  });
  it('copy refuses when it would pass the limit', () => {
    const lib: GenLibrary = {
      ...emptyLibrary(),
      subsets: [
        ...full(MAX_SUBSETS - 1),
        { id: 'sX', owner: 'p:p9', name: 'a', pitches: [{ m: null, c: 0 }], root: null },
        { id: 'sY', owner: 'p:p9', name: 'b', pitches: [{ m: null, c: 0 }], root: null },
      ],
    };
    const c = copySubsetsTo(lib, 'p:p9', 'p:p2', [{ m: {}, c: 0 }]);
    expect(c.refused).toMatch(/limit/);
    expect(c.lib).toBe(lib);
  });
  it('the reducer refuses an Add at the cap and says so (refusal), cleared by the next library action', () => {
    let s = run(initialState(), { type: 'sel/set', idx: [0, 2] });
    s = { ...s, library: { ...s.library, subsets: full(MAX_SUBSETS) } };
    const t = run(s, { type: 'subset/add' });
    expect(t.refusal?.reason).toMatch(/full/);
    expect(t.library).toBe(s.library);
    expect(run(t, { type: 'subset/delete', id: 's1' }).refusal).toBeNull();
  });
});

describe('copy reads the generator that builds now, not a stale tab field', () => {
  it('refuses when the last edit does not build', () => {
    const s = run(
      initialState(),
      { type: 'sel/set', idx: [0, 2] },
      { type: 'subset/add' },
      { type: 'gen/patch', patch: { rep: 'nope' } }
    );
    expect(tab(s).field.length).toBeGreaterThan(0); // the stale field is still there
    const t = run(s, { type: 'preset/save', name: 'X', folder: '', copySubsets: true });
    expect(t.refusal?.reason).toMatch(/does not build/);
    expect(t.library).toBe(s.library);
  });
});

describe('orphaned subsets', () => {
  const orphaned = () => {
    const base = run(initialState(), { type: 'sel/none' });
    const rows: LibSubset[] = [
      {
        id: 's1',
        owner: 'b:Removed preset',
        name: 'old',
        pitches: [{ m: {}, c: 0 }, ratioNote(5, 4), ratioNote(7, 5)],
        root: ratioNote(5, 4),
      },
    ];
    return {
      ...base,
      library: { ...base.library, subsets: rows, next: { ...base.library.next, subset: 2 } },
    };
  };
  it('are listed by a selector and kept', () => {
    expect(orphanSubsets(orphaned().library).map((x) => x.id)).toEqual(['s1']);
    expect(orphanSubsets(emptyLibrary())).toEqual([]);
  });
  it('can be loaded onto the current tab from their own pitches, reporting what the field lacks; the link is unchanged', () => {
    const s0 = orphaned();
    const linkBefore = tab(s0).link;
    const s = run(s0, { type: 'subset/load', id: 's1' });
    expect(tab(s).sel).toEqual([0, 2]); // 1/1 and 5/4; 7/5 is not in harmonics 8-15
    expect(tab(s).mode).toBe(1);
    expect(s.lastLoad).toEqual({ id: 's1', found: 2, missing: 1 });
    expect(tab(s).link).toBe(linkBefore);
    expect(s.library.subsets).toEqual(s0.library.subsets);
  });
});
