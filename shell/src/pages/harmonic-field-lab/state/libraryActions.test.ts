import { describe, expect, it } from 'vitest';
import { fmtRatio } from '../../../lib/harmonic-field';
import { isModified, ownerOfTab, subsetsOf } from './generatorLibrary';
import { activeTab, initialState, labReducer, type Action, type LabState } from './labState';

const run = (s: LabState, ...a: Action[]) => a.reduce(labReducer, s);
const H8 = 'b:Harmonics 8–15';
const tab = (s: LabState) => activeTab(s);
const owner = (s: LabState) => ownerOfTab(s.library, tab(s));

describe('fork on edit', () => {
  it('editing a generator linked to a preset overwrites nothing: the tab is just modified', () => {
    const s0 = run(initialState(), { type: 'gen/preset', name: 'Harmonics 8–15' });
    expect(tab(s0).link).toBe(H8);
    const lib0 = s0.library;
    const s1 = run(s0, { type: 'gen/patch', patch: { h: 12 } });
    expect(tab(s1).gen.preset).toBe('');
    expect(s1.library).toBe(lib0);
    expect(owner(s1)).toBe(H8);
    expect(isModified(s1.library, tab(s1))).toBe(true);
    // editing back to the preset's inputs clears the flag
    const s2 = run(s1, { type: 'gen/patch', patch: { h: 8 } });
    expect(isModified(s2.library, tab(s2))).toBe(false);
  });

  it('opening a preset records it in Recent (at most 8) and links the tab', () => {
    const names = ['12-EDO', 'Hexany (1 3 5 7, choose 2)', 'Carlos Alpha (9 ED 3/2)'];
    const s = run(initialState(), ...names.map((name): Action => ({ type: 'gen/preset', name })));
    expect(s.library.recents).toEqual(names.map((n) => `b:${n}`).reverse());
    expect(tab(s).link).toBe('b:Carlos Alpha (9 ED 3/2)');
  });

  it('the notice is cleared by the next generator edit', () => {
    let s = run(
      initialState(),
      { type: 'preset/save', name: 'P', folder: '' },
      { type: 'gen/patch', patch: { h: 12 } }
    );
    s = run(s, { type: 'preset/update' });
    expect(s.notice?.kind).toBe('update');
    expect(run(s, { type: 'gen/keepNew', on: true }).notice).not.toBeNull();
    expect(run(s, { type: 'gen/patch', patch: { h: 13 } }).notice).toBeNull();
    expect(run(s, { type: 'notice/dismiss' }).notice).toBeNull();
  });
});

describe('Add row', () => {
  it('adds the selection under the current generator with an auto label, no name needed', () => {
    const s = run(
      initialState(),
      { type: 'sel/set', idx: [0, 2, 4] },
      { type: 'subset/add' },
      { type: 'sel/set', idx: [0, 3] },
      { type: 'subset/add' }
    );
    expect(subsetsOf(s.library, H8).map((x) => x.name)).toEqual(['Subset 1', 'Subset 2']);
    expect(s.lastAdded).toEqual({ id: 's2', duplicate: false });
  });

  it('an identical selection and mode root returns the existing row (duplicate flag), adding nothing', () => {
    let s = run(initialState(), { type: 'sel/set', idx: [0, 2, 4] }, { type: 'subset/add' });
    const lib = s.library;
    s = run(s, { type: 'sel/set', idx: [4, 0, 2] }, { type: 'subset/add' });
    expect(s.lastAdded).toEqual({ id: 's1', duplicate: true });
    expect(s.library.subsets).toBe(lib.subsets);
    // another mode root is a new row
    s = run(s, { type: 'mode/set', mode: 1 }, { type: 'subset/add' });
    expect(s.library.subsets).toHaveLength(2);
  });

  it('nothing selected adds nothing', () => {
    const s = run(initialState(), { type: 'sel/none' });
    expect(run(s, { type: 'subset/add' })).toBe(s);
  });

  it('a modified tab forks into an Untitled generator (the preset is left alone) and relinks', () => {
    const s = run(
      initialState(),
      { type: 'gen/preset', name: 'Harmonics 8–15' },
      { type: 'gen/patch', patch: { h: 12 } },
      { type: 'sel/set', idx: [0, 2] },
      { type: 'subset/add' }
    );
    expect(s.library.untitled).toHaveLength(1);
    expect(tab(s).link).toBe('u:u1');
    expect(subsetsOf(s.library, H8)).toEqual([]);
    expect(subsetsOf(s.library, 'u:u1')).toHaveLength(1);
    expect(isModified(s.library, tab(s))).toBe(false);
    // a second add from the same edited inputs reuses the Untitled generator
    const s2 = run(s, { type: 'sel/set', idx: [0, 3] }, { type: 'subset/add' });
    expect(s2.library.untitled).toHaveLength(1);
    expect(subsetsOf(s2.library, 'u:u1')).toHaveLength(2);
  });

  it('loading a row on a modified tab keeps the tab and resolves against its field', () => {
    let s = run(initialState(), { type: 'sel/set', idx: [0, 2, 4, 6] }, { type: 'subset/add' });
    s = run(s, { type: 'gen/patch', patch: { h: 12 } }, { type: 'subset/load', id: 's1' });
    expect(tab(s).gen.h).toBe(12);
    // harmonics 12..23 hold 1/1, 5/4, 3/2 and 7/4
    expect(tab(s).sel.map((i) => fmtRatio(tab(s).field[i]))).toEqual(['1/1', '5/4', '3/2', '7/4']);
  });
});

describe('Save as new / save preset', () => {
  const withSubsets = () =>
    run(
      initialState(),
      { type: 'sel/set', idx: [0, 2, 4] },
      { type: 'subset/add' }, // 1/1 5/4 3/2: kept in harmonics 12..23
      { type: 'sel/set', idx: [3, 5, 6] },
      { type: 'subset/add' }, // 11/8 13/8 7/4: loses two
      { type: 'gen/patch', patch: { h: 12 } }
    );

  it('plain: a new preset with no subsets, the tab links to it, the source keeps its own', () => {
    const s = run(withSubsets(), { type: 'preset/save', name: ' Twelves ', folder: 'Pools / Odd' });
    expect(s.library.presets[0]).toMatchObject({ name: 'Twelves', folder: 'Pools/Odd' });
    expect(tab(s).link).toBe('p:p1');
    expect(subsetsOf(s.library, 'p:p1')).toEqual([]);
    expect(subsetsOf(s.library, H8)).toHaveLength(2);
    expect(s.notice).toBeNull();
    expect(isModified(s.library, tab(s))).toBe(false);
  });

  it('Shift: copies the subsets re-resolved against the new field, with a report (no undo)', () => {
    const s = run(withSubsets(), {
      type: 'preset/save',
      name: 'Twelves',
      folder: '',
      copySubsets: true,
    });
    const rows = subsetsOf(s.library, 'p:p1');
    expect(rows.map((x) => x.pitches.length)).toEqual([3, 1]);
    expect(s.notice).toMatchObject({ kind: 'copy', undo: null });
    expect(s.notice?.report).toMatchObject({ updatedSubsets: 2, affectedSubsets: 1, mostLost: 2 });
    expect(subsetsOf(s.library, H8).map((x) => x.pitches.length)).toEqual([3, 3]);
  });

  it('naming an Untitled generator promotes it with its subsets', () => {
    let s = run(
      initialState(),
      { type: 'gen/patch', patch: { h: 12 } },
      { type: 'sel/set', idx: [0, 2] },
      { type: 'subset/add' }
    );
    expect(tab(s).link).toBe('u:u1');
    s = run(s, { type: 'preset/save', name: 'Twelves', folder: '' });
    expect(s.library.untitled).toEqual([]);
    expect(subsetsOf(s.library, 'p:p1')).toHaveLength(1);
    expect(tab(s).link).toBe('p:p1');
  });
});

describe('Update preset and Undo', () => {
  const setup = () =>
    run(
      initialState(),
      { type: 'sel/set', idx: [0, 2, 4] },
      { type: 'preset/save', name: 'P', folder: '' },
      { type: 'subset/add' },
      { type: 'sel/set', idx: [3, 5, 6] },
      { type: 'subset/add' },
      { type: 'gen/patch', patch: { h: 12 } }
    );

  it('applies the edit: the preset takes the inputs, subsets re-resolve, a report and an undo come back', () => {
    const before = setup();
    expect(isModified(before.library, tab(before))).toBe(true);
    const s = run(before, { type: 'preset/update' });
    expect(s.library.presets[0].gen.h).toBe(12);
    expect(isModified(s.library, tab(s))).toBe(false);
    expect(subsetsOf(s.library, 'p:p1').map((x) => x.pitches.length)).toEqual([3, 1]);
    expect(s.notice?.name).toBe('P');
    expect(s.notice?.report).toMatchObject({
      subsetsTotal: 2,
      removedSubsets: 0,
      affectedSubsets: 1,
      affectedAverageLost: 2,
      mostLost: 2,
      pitchesFound: 4,
      pitchesTotal: 6,
    });
  });

  it('Undo restores the exact previous subsets and generator; the tab is modified again', () => {
    const before = setup();
    const s = run(before, { type: 'preset/update' }, { type: 'notice/undo' });
    expect(s.library.subsets).toEqual(before.library.subsets);
    expect(s.library.presets).toEqual(before.library.presets);
    expect(s.notice).toBeNull();
    expect(isModified(s.library, tab(s))).toBe(true);
    // nothing to undo after the notice is gone
    expect(run(s, { type: 'notice/undo' })).toBe(s);
  });

  it('subsets with no matching pitch are removed and listed', () => {
    let s = run(
      initialState(),
      { type: 'preset/save', name: 'P', folder: '' },
      { type: 'sel/set', idx: [5, 7] },
      { type: 'subset/add' }, // 13/8 15/8
      { type: 'gen/patch', patch: { h: 12 } }
    );
    s = run(s, { type: 'preset/update' });
    expect(s.library.subsets).toEqual([]);
    expect(s.notice?.report.removed).toEqual([{ id: 's1', name: 'Subset 1' }]);
    expect(s.notice?.report.detail[0]).toMatchObject({ removed: true });
    expect(run(s, { type: 'notice/undo' }).library.subsets).toHaveLength(1);
  });

  it('a built-in preset cannot be updated (the tab stays modified); an unbuildable edit is refused', () => {
    const s = run(initialState(), { type: 'gen/patch', patch: { h: 12 } });
    expect(run(s, { type: 'preset/update' })).toBe(s);
    const bad = run(setup(), { type: 'gen/patch', patch: { rep: 'nope' } });
    expect(run(bad, { type: 'preset/update' })).toBe(bad);
  });
});

describe('preset delete, rename, move', () => {
  it('delete keeps the subsets under Untitled and relinks the tabs that pointed at the preset', () => {
    let s = run(
      initialState(),
      { type: 'sel/set', idx: [0, 2] },
      { type: 'preset/save', name: 'P', folder: '' },
      { type: 'subset/add' }
    );
    s = run(s, { type: 'preset/delete', id: 'p1' });
    expect(s.library.presets).toEqual([]);
    expect(tab(s).link).toBe('u:u1');
    expect(subsetsOf(s.library, 'u:u1')).toHaveLength(1);
    expect(run(s, { type: 'preset/delete', id: 'p1' })).toBe(s);
  });

  it('rename and move change the stored preset only', () => {
    let s = run(initialState(), { type: 'preset/save', name: 'P', folder: '' });
    s = run(
      s,
      { type: 'preset/rename', id: 'p1', name: 'Q' },
      { type: 'preset/move', id: 'p1', folder: 'A/B' }
    );
    expect(s.library.presets[0]).toMatchObject({ name: 'Q', folder: 'A/B' });
  });

  it('opening a user preset builds its generator; tab/link only links', () => {
    let s = run(
      initialState(),
      { type: 'gen/patch', patch: { h: 12 } },
      { type: 'preset/save', name: 'P', folder: '' }
    );
    s = run(s, { type: 'gen/preset', name: 'Harmonics 8–15' });
    expect(tab(s).gen.h).toBe(8);
    s = run(s, { type: 'preset/open', owner: 'p:p1' });
    expect(tab(s).gen.h).toBe(12);
    expect(tab(s).link).toBe('p:p1');
    expect(s.library.recents[0]).toBe('p:p1');
    s = run(s, { type: 'tab/link', owner: null });
    expect(tab(s).link).toBeUndefined();
    expect(run(s, { type: 'preset/open', owner: 'p:nope' })).toBe(s);
  });
});
