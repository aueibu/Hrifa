import { describe, expect, it } from 'vitest';
import { ratioNote, type Note } from '../../../lib/harmonic-field';
import { defaultGen, genFromPreset, genKey, presetByName, type GenSpec } from './generate';
import {
  addSubset,
  builtinKey,
  copySubsetsTo,
  deletePreset,
  deleteSubset,
  emptyLibrary,
  ensureUntitled,
  isModified,
  migrateSubsets,
  movePreset,
  ownerCrumbs,
  ownerGen,
  ownerLabel,
  ownerOfTab,
  promoteUntitled,
  pushRecent,
  renamePreset,
  renameSubset,
  saveUserPreset,
  subsetCount,
  subsetsOf,
  undoUpdate,
  updateOwner,
  untitledKey,
  userKey,
  type LegacySaved,
} from './generatorLibrary';
import { makeTab } from './labState';

const r = (n: number, d: number): Note => ratioNote(n, d);
const preset = (name: string): GenSpec => genFromPreset(presetByName(name)!);
const H = preset('Harmonics 8–15'); // 1/1 9/8 5/4 11/8 3/2 13/8 7/4 15/8
const H8 = 'b:Harmonics 8–15';
const set = (...p: Note[]) => ({ pitches: p, root: p[0] });

describe('owners', () => {
  it('a tab finds its owner: link, then preset name, then a stored generator with the same inputs', () => {
    let lib = emptyLibrary();
    expect(ownerOfTab(lib, { gen: H })).toBe(H8);
    const edited = { ...H, preset: '', h: 12 };
    expect(ownerOfTab(lib, { gen: edited })).toBeNull();
    // an equal built-in generator with the preset label cleared (a hand edit that came back) is still the built-in
    expect(ownerOfTab(lib, { gen: { ...H, preset: '' } })).toBe(H8);
    const u = ensureUntitled(lib, edited);
    lib = u.lib;
    expect(ownerOfTab(lib, { gen: edited })).toBe(u.key!);
    expect(ownerOfTab(lib, { gen: edited, link: H8 })).toBe(H8);
    // a link to something that no longer exists is ignored
    expect(ownerOfTab(lib, { gen: edited, link: 'p:p9' })).toBe(u.key!);
  });

  it('modified: the tab differs from its owner (editing overwrites nothing)', () => {
    const lib = emptyLibrary();
    expect(isModified(lib, { gen: H })).toBe(false);
    expect(isModified(lib, { gen: { ...H, h: 12, preset: '' }, link: H8 })).toBe(true);
    // not modified when only the keepNew switch differs
    expect(isModified(lib, { gen: { ...H, keepNew: true }, link: H8 })).toBe(false);
    expect(isModified(lib, { gen: { ...H, h: 12, preset: '' } })).toBe(false); // unsaved: no owner
  });

  it('labels, crumbs and generators', () => {
    let lib = emptyLibrary();
    const p = saveUserPreset(lib, {
      name: ' Pool ',
      folder: ' Pools / Seven ',
      gen: { ...H, h: 12, preset: '' },
    });
    lib = p.lib;
    expect(ownerLabel(lib, p.key!)).toBe('Pool');
    expect(ownerCrumbs(lib, p.key!)).toEqual(['My presets', 'Pools', 'Seven']);
    expect(ownerCrumbs(lib, H8)).toEqual(['Built-in', 'Harmonic series']);
    expect(ownerGen(lib, p.key!)?.h).toBe(12);
    expect(ownerGen(lib, 'p:p77')).toBeNull();
    expect(genKey(ownerGen(lib, H8)!)).toBe(genKey(H));
    const u = ensureUntitled(lib, { ...H, h: 9, preset: '' });
    expect(ownerLabel(lib, untitledKey('u9'))).toBe('Auto-saved');
    expect(ownerLabel(u.lib, u.key!)).toBe('Auto-saved: Harmonics from 9');
  });
});

describe('add subset', () => {
  it('auto-labels "Subset N", needs no name, and N skips taken labels', () => {
    let lib = emptyLibrary();
    lib = addSubset(lib, H8, set(r(1, 1), r(5, 4))).lib;
    lib = addSubset(lib, H8, set(r(1, 1), r(3, 2))).lib;
    lib = renameSubset(lib, 's1', 'Subset 3');
    lib = addSubset(lib, H8, set(r(1, 1), r(7, 4))).lib;
    expect(subsetsOf(lib, H8).map((s) => s.name)).toEqual(['Subset 3', 'Subset 2', 'Subset 4']);
    // another owner counts on its own
    expect(addSubset(lib, 'p:p1', set(r(1, 1))).lib.subsets.at(-1)?.name).toBe('Subset 1');
  });

  it('an identical subset (same pitches and mode root) returns the existing row and adds nothing', () => {
    const lib = addSubset(emptyLibrary(), H8, set(r(1, 1), r(5, 4), r(3, 2))).lib;
    const again = addSubset(lib, H8, { pitches: [r(3, 2), r(1, 1), r(5, 4)], root: r(1, 1) });
    expect(again.lib).toBe(lib);
    expect(again.duplicate).toBe(true);
    expect(again.id).toBe('s1');
    // a different mode root is a different subset
    const other = addSubset(lib, H8, { pitches: [r(1, 1), r(5, 4), r(3, 2)], root: r(5, 4) });
    expect(other.duplicate).toBe(false);
    expect(other.lib.subsets).toHaveLength(2);
    // the same pitches under another generator are not a duplicate
    expect(addSubset(lib, 'p:p1', set(r(1, 1), r(5, 4), r(3, 2))).duplicate).toBe(false);
  });

  it('has no cap', () => {
    let lib = emptyLibrary();
    for (let i = 1; i <= 300; i++) {
      lib = addSubset(lib, H8, set({ m: null, c: i }, { m: null, c: i + 1 })).lib;
    }
    expect(subsetCount(lib, H8)).toBe(300);
    expect(lib.subsets.at(-1)?.name).toBe('Subset 300');
  });

  it('copies the pitches (later edits of the source do not reach the row) and deletes by id', () => {
    const s = set(r(1, 1), r(5, 4));
    let lib = addSubset(emptyLibrary(), H8, s).lib;
    s.pitches[0].c = 99;
    expect(lib.subsets[0].pitches[0].c).toBe(0);
    lib = deleteSubset(lib, 's1');
    expect(lib.subsets).toEqual([]);
    expect(deleteSubset(lib, 's1')).toBe(lib);
  });
});

describe('presets', () => {
  it('rename and move; blank rename changes nothing', () => {
    let lib = saveUserPreset(emptyLibrary(), { name: 'A', folder: '', gen: H }).lib;
    expect(renamePreset(lib, 'p1', '   ')).toBe(lib);
    lib = renamePreset(lib, 'p1', ' New  name ');
    lib = movePreset(lib, 'p1', ' X / Y ');
    expect(lib.presets[0]).toMatchObject({ name: 'New name', folder: 'X/Y' });
    expect(renamePreset(lib, 'nope', 'x')).toBe(lib);
  });

  it('naming an Untitled generator moves its subsets to the new preset', () => {
    const u = ensureUntitled(emptyLibrary(), { ...H, h: 9, preset: '' });
    let lib = addSubset(u.lib, u.key!, set(r(1, 1))).lib;
    lib = pushRecent(lib, u.key!);
    const p = promoteUntitled(lib, 'u1', { name: 'Nines', folder: 'Pools' })!;
    expect(p.lib.untitled).toEqual([]);
    expect(p.lib.subsets[0].owner).toBe(p.key!);
    expect(p.lib.recents).toEqual([p.key!]);
    expect(promoteUntitled(lib, 'u7', { name: 'x', folder: '' })).toBeNull();
  });

  it('deleting a preset keeps its subsets under an Untitled generator with the same inputs', () => {
    const p = saveUserPreset(emptyLibrary(), {
      name: 'A',
      folder: 'F',
      gen: { ...H, h: 12, preset: '' },
    });
    let lib = addSubset(p.lib, p.key!, set(r(1, 1), r(5, 4))).lib;
    lib = addSubset(lib, p.key!, set(r(1, 1), r(3, 2))).lib;
    lib = pushRecent(lib, p.key!);
    const del = deletePreset(lib, 'p1');
    expect(del.lib.presets).toEqual([]);
    expect(del.moved).toBe(untitledKey('u1'));
    expect(subsetsOf(del.lib, del.moved!).map((s) => s.id)).toEqual(['s1', 's2']);
    expect(del.lib.untitled[0].gen.h).toBe(12);
    expect(del.lib.recents).toEqual([del.moved]);
    // a preset with no subsets simply goes
    const q = saveUserPreset(emptyLibrary(), { name: 'B', folder: '', gen: H });
    expect(deletePreset(q.lib, 'p1')).toEqual({
      lib: { ...q.lib, presets: [], recents: [] },
      moved: null,
    });
    expect(deletePreset(q.lib, 'p9').lib).toBe(q.lib);
  });

  it('recents: most recent first, no duplicates, at most 8', () => {
    let lib = emptyLibrary();
    for (let i = 1; i <= 10; i++) {
      lib = pushRecent(lib, `p:p${i}`);
    }
    expect(lib.recents).toHaveLength(8);
    expect(lib.recents[0]).toBe('p:p10');
    lib = pushRecent(lib, 'p:p5');
    expect(lib.recents.slice(0, 2)).toEqual(['p:p5', 'p:p10']);
    expect(new Set(lib.recents).size).toBe(8);
    expect(pushRecent(lib, 'p:p5')).toBe(lib);
  });
});

describe('Update, Undo, copy', () => {
  // a user preset on harmonics 8-15 with three subsets; the edit moves it to harmonics 8-12 (1/1 9/8 5/4 11/8 3/2)
  const setup = () => {
    const p = saveUserPreset(emptyLibrary(), { name: 'P', folder: '', gen: { ...H, preset: '' } });
    let lib = p.lib;
    lib = addSubset(lib, p.key!, set(r(1, 1), r(5, 4), r(3, 2))).lib; // all kept
    lib = addSubset(lib, p.key!, set(r(1, 1), r(7, 4), r(15, 8))).lib; // 2 of 3 lost
    lib = addSubset(lib, p.key!, set(r(13, 8), r(15, 8))).lib; // all lost
    lib = addSubset(lib, H8, set(r(1, 1))).lib; // another owner: untouched
    return { lib, key: p.key! };
  };
  const edited = makeTab('t1', { ...H, preset: '', h: 8, rep: '2/1' }); // placeholder for a field
  void edited;
  const smallField = (): Note[] => [r(1, 1), r(9, 8), r(5, 4), r(11, 8), r(3, 2)];

  it('Update applies the edit: gen replaced, subsets re-resolved, empty ones removed, report and undo returned', () => {
    const { lib, key } = setup();
    const newGen = { ...H, preset: '', h: 8, cpsK: 5 };
    const out = updateOwner(lib, key, newGen, smallField())!;
    expect(subsetsOf(out.lib, key).map((s) => [s.id, s.pitches.length])).toEqual([
      ['s1', 3],
      ['s2', 1],
    ]);
    expect(out.report).toMatchObject({
      subsetsTotal: 3,
      updatedSubsets: 2,
      removedSubsets: 1,
      affectedSubsets: 1,
      affectedAverageLost: 2,
      mostLost: 2,
      pitchesFound: 4,
      pitchesTotal: 8,
    });
    expect(out.report.removed).toEqual([{ id: 's3', name: 'Subset 3' }]);
    // the other owner's subset is untouched
    expect(subsetsOf(out.lib, H8).map((s) => s.id)).toEqual(['s4']);
    expect(ownerGen(out.lib, key)?.cpsK).toBe(5);
  });

  it('Undo restores the exact previous subsets, their positions and the generator', () => {
    const { lib, key } = setup();
    const out = updateOwner(lib, key, { ...H, preset: '', cpsK: 5 }, smallField())!;
    const back = undoUpdate(out.lib, out.undo);
    expect(back.subsets).toEqual(lib.subsets);
    expect(back.presets).toEqual(lib.presets);
    // undo leaves other changes alone
    const added = addSubset(out.lib, H8, set(r(1, 1), r(9, 8))).lib;
    const back2 = undoUpdate(added, out.undo);
    expect(subsetsOf(back2, key)).toEqual(subsetsOf(lib, key));
    expect(subsetsOf(back2, H8)).toHaveLength(2);
  });

  it('refuses a built-in preset, an unknown owner and an empty field', () => {
    const { lib, key } = setup();
    expect(updateOwner(lib, H8, H, smallField())).toBeNull();
    expect(updateOwner(lib, 'p:p99', H, smallField())).toBeNull();
    expect(updateOwner(lib, key, H, [])).toBeNull();
  });

  it('an Untitled generator can be updated too', () => {
    const u = ensureUntitled(emptyLibrary(), { ...H, h: 9, preset: '' });
    const lib = addSubset(u.lib, u.key!, set(r(1, 1), r(9, 8))).lib;
    const out = updateOwner(lib, u.key!, { ...H, h: 10, preset: '' }, smallField())!;
    expect(out.lib.untitled[0].gen.h).toBe(10);
    expect(out.report.affectedSubsets).toBe(0);
  });

  it('Save as new: plain has no subsets; copy re-resolves them under new ids', () => {
    const { lib, key } = setup();
    const plain = saveUserPreset(lib, { name: 'Q', folder: '', gen: H });
    expect(subsetsOf(plain.lib, plain.key!)).toEqual([]);
    const withCopy = saveUserPreset(lib, { name: 'Q', folder: '', gen: H });
    const c = copySubsetsTo(withCopy.lib, key, withCopy.key!, smallField());
    const copies = subsetsOf(c.lib, withCopy.key!);
    expect(copies.map((s) => s.pitches.length)).toEqual([3, 1]);
    expect(copies.map((s) => s.id)).toEqual(['s5', 's6']);
    expect(copies[0].name).toBe('Subset 1');
    expect(c.report.removedSubsets).toBe(1);
    // the source keeps all of its own
    expect(subsetsOf(c.lib, key)).toHaveLength(3);
    expect(c.lib.next.subset).toBe(7);
  });
});

describe('migration of the flat subsets.v1 list', () => {
  const field = (g: GenSpec) => makeTab('t', g).field;
  const cents = (g: GenSpec, idx: number[]) => idx.map((i) => field(g)[i].c);
  const EDO = preset('12-EDO');
  const G23 = { ...H, preset: '', h: 23 };
  const legacy = (): LegacySaved[] => [
    { id: 's1', name: 'Triad', gen: H, selCents: cents(H, [0, 2, 4]), mode: 1 },
    { id: 's2', name: 'Fifth', gen: EDO, selCents: cents(EDO, [0, 7]), mode: 0 },
    {
      id: 's3',
      name: 'Edited back',
      gen: { ...H, preset: '' },
      selCents: cents(H, [0, 6]),
      mode: 0,
    },
    { id: 's4', name: 'Odd one', gen: G23, selCents: cents(G23, [0, 3, 5]), mode: 2 },
    { id: 's5', name: 'Other odd', gen: G23, selCents: cents(G23, [1, 2]), mode: 0 },
  ];

  it('groups by generation inputs; a group equal to a built-in preset is owned by it, the rest become Untitled', () => {
    const lib = migrateSubsets(legacy());
    expect(lib.subsets.map((s) => [s.id, s.owner])).toEqual([
      ['s1', H8],
      ['s2', 'b:12-EDO'],
      ['s3', H8],
      ['s4', 'u:u1'],
      ['s5', 'u:u1'],
    ]);
    expect(lib.untitled).toHaveLength(1);
    expect(lib.untitled[0].gen.h).toBe(23);
    expect(lib.untitled[0].gen.preset).toBe('');
    expect(lib.presets).toEqual([]);
    expect(lib.next).toEqual({ preset: 1, untitled: 2, subset: 6 });
  });

  it('is lossless: every entry appears with its id, name and as many pitches as stored cents', () => {
    const old = legacy();
    const lib = migrateSubsets(old);
    expect(lib.subsets).toHaveLength(old.length);
    old.forEach((o, i) => {
      expect(lib.subsets[i].id).toBe(o.id);
      expect(lib.subsets[i].name).toBe(o.name);
      expect(lib.subsets[i].pitches.map((p) => p.c)).toEqual([...o.selCents].sort((a, b) => a - b));
    });
  });

  it('pitches carry the exact monzo when the note exists, and the mode root is the pitch at the stored mode', () => {
    const lib = migrateSubsets(legacy());
    const triad = lib.subsets[0];
    expect(triad.pitches.map((p) => p.m)).toEqual([{}, { '5': 1, '2': -2 }, { '3': 1, '2': -1 }]);
    expect(triad.root?.c).toBeCloseTo(triad.pitches[1].c, 9);
    // EDO notes have no monzo: cents only (the 1/1 is exact)
    expect(lib.subsets[1].pitches[1].m).toBeNull();
    expect(lib.subsets[1].root?.c).toBe(0);
  });

  it('a cent value that matches no note, or a generator that no longer builds, stays as a cents-only pitch', () => {
    const bad = { ...H, preset: '', rep: 'nope' };
    const lib = migrateSubsets([
      { id: 's1', name: 'a', gen: H, selCents: [0, 123.456], mode: 0 },
      { id: 's2', name: 'b', gen: bad, selCents: [0, 702], mode: 1 },
    ]);
    expect(lib.subsets[0].pitches).toEqual([
      { m: {}, c: 0 },
      { m: null, c: 123.456 },
    ]);
    expect(lib.subsets[1].pitches).toEqual([
      { m: null, c: 0 },
      { m: null, c: 702 },
    ]);
    expect(lib.subsets[1].root?.c).toBe(702);
    expect(lib.subsets[1].owner).toBe('u:u1');
  });

  it('a stored mode out of range gives the first pitch as the root; an empty selection is kept', () => {
    const lib = migrateSubsets([
      { id: 's1', name: 'a', gen: H, selCents: [0, 386.3137], mode: 9 },
      { id: 's2', name: 'empty', gen: H, selCents: [], mode: 0 },
    ]);
    expect(lib.subsets[0].root?.c).toBe(0);
    expect(lib.subsets[1]).toMatchObject({ pitches: [], root: null, name: 'empty' });
  });

  it('is idempotent and does not change its input; the empty list gives the empty library', () => {
    const old = legacy();
    const snap = JSON.stringify(old);
    expect(migrateSubsets(old)).toEqual(migrateSubsets(old));
    expect(JSON.stringify(old)).toBe(snap);
    expect(migrateSubsets([])).toEqual(emptyLibrary());
  });

  it('migrated subsets re-resolve to the same notes the old loader selected', () => {
    const lib = migrateSubsets(legacy());
    const tab = makeTab('t', H);
    const owner = ownerOfTab(lib, tab);
    expect(owner).toBe(H8);
    expect(subsetsOf(lib, owner).map((s) => s.id)).toEqual(['s1', 's3']);
    // the Untitled generator is found for a tab built from its inputs
    expect(ownerOfTab(lib, makeTab('t', G23))).toBe('u:u1');
    expect(userKey('p1')).toBe('p:p1');
    expect(builtinKey('x')).toBe('b:x');
    void defaultGen;
  });
});
