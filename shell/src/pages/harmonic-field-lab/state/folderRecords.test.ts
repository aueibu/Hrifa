import { describe, expect, it } from 'vitest';
import { PRESETS } from '../../../lib/harmonic-field';
import { isBuiltinFolderPath } from './builtinFolders';
import {
  MAX_FOLDERS,
  createFolder,
  deleteFolder,
  deleteFolderQuestion,
  deleteFolderTree,
  describeFolder,
  folderDescription,
  folderExists,
  folderList,
  folderRecord,
  orderFolderSuggestions,
  renameFolder,
  sanitizeFolderRecords,
} from './folderRecords';
import { genFromPreset, presetByName } from './generate';
import { emptyLibrary, saveUserPreset, subsetsOf, type GenLibrary } from './generatorLibrary';
import { initialState, labReducer, type Action, type LabState } from './labState';
import { libraryToStored, sanitizeLibrary } from './libraryStore';
import { buildTree, ROOT_MINE, type FolderNode, type TreeNode } from './presetTree';

const H = genFromPreset(presetByName('Harmonics 8–15')!);
const withPreset = (lib: GenLibrary, name: string, folder: string): GenLibrary =>
  saveUserPreset(lib, { name, folder, gen: { ...H, preset: '' } }).lib;
const run = (s: LabState, ...a: Action[]) => a.reduce(labReducer, s);
const mineChildren = (lib: GenLibrary): TreeNode[] =>
  buildTree(lib).find((r) => r.label === ROOT_MINE)!.children;
const folderNode = (lib: GenLibrary, path: string): FolderNode | undefined => {
  const find = (nodes: TreeNode[]): FolderNode | undefined => {
    for (const n of nodes) {
      if (n.kind === 'folder') {
        if (n.userPath === path) {
          return n;
        }
        const hit = find(n.children);
        if (hit) {
          return hit;
        }
      }
    }
    return undefined;
  };
  return find(mineChildren(lib));
};

describe('M5 folder records: create and list', () => {
  it('row 5: New folder makes an empty folder with count 0 that survives a reload', () => {
    const r = createFolder(emptyLibrary(), 'Drones');
    expect(r.refused).toBeUndefined();
    expect(r.lib.folders).toEqual([{ path: 'Drones' }]);
    const node = folderNode(r.lib, 'Drones');
    expect(node?.count).toBe(0);
    expect(node?.children).toEqual([]);
    // the stored form is written and read back
    const stored = JSON.parse(JSON.stringify(libraryToStored(r.lib))) as { folders: unknown };
    expect(stored.folders).toEqual([{ path: 'Drones' }]);
    expect(sanitizeLibrary(stored)).toEqual(r.lib);
    expect(folderList(sanitizeLibrary(stored)!)).toEqual(['Drones']);
  });

  it('row 7: a preset saved into Drones sits inside it and the count is 1', () => {
    const lib = withPreset(createFolder(emptyLibrary(), 'Drones').lib, 'Pedal', 'Drones');
    const node = folderNode(lib, 'Drones')!;
    expect(node.children.map((c) => c.label)).toEqual(['Pedal']);
    expect(folderList(lib)).toEqual(['Drones']);
  });

  it('a nested record makes its parents implied folders (listed, no record)', () => {
    const lib = createFolder(emptyLibrary(), 'A/B/C').lib;
    expect(folderList(lib)).toEqual(['A', 'A/B', 'A/B/C']);
    expect(lib.folders).toEqual([{ path: 'A/B/C' }]);
    expect(folderNode(lib, 'A')?.children.map((c) => c.label)).toEqual(['B']);
    expect(folderNode(lib, 'A/B/C')?.count).toBe(0);
    expect(folderExists(lib, 'A/B')).toBe(true);
  });

  it('refuses an empty path, a built-in folder, and an existing folder (record or implied by presets)', () => {
    const lib = withPreset(createFolder(emptyLibrary(), 'Drones').lib, 'P', 'Pools/Seven');
    expect(createFolder(lib, '  / ').refused).toMatch(/name/);
    expect(createFolder(lib, 'Drones').refused).toMatch(/already exists/);
    expect(createFolder(lib, 'Pools/Seven').refused).toMatch(/already exists/);
    expect(createFolder(lib, 'Pools').refused).toMatch(/already exists/); // an implied parent
    for (const bad of ['Equal divisions', 'equal divisions/Mine', 'Additive / lattice']) {
      const r = createFolder(lib, bad);
      expect(r.refused).toMatch(/built-in/);
      expect(r.lib).toBe(lib);
    }
  });

  it('refuses past the folder cap', () => {
    let lib = emptyLibrary();
    for (let i = 0; i < MAX_FOLDERS; i++) {
      lib = createFolder(lib, `F${i}`).lib;
    }
    expect(lib.folders).toHaveLength(MAX_FOLDERS);
    expect(createFolder(lib, 'One more').refused).toMatch(/Too many/);
  });
});

describe('M5 folder records: description (rows 6, 10, 11)', () => {
  it('row 6: a description on a record shows on the tree node and is cleaned', () => {
    const lib = describeFolder(
      createFolder(emptyLibrary(), 'Drones').lib,
      'Drones',
      '  pedal   tones\n and more '
    ).lib;
    expect(folderDescription(lib, 'Drones')).toBe('pedal tones and more');
    expect(folderNode(lib, 'Drones')?.description).toBe('pedal tones and more');
  });

  it('row 10: a folder that exists only through presets disappears when its last preset leaves', () => {
    let s = run(
      initialState(),
      { type: 'preset/save', name: 'P', folder: 'Pools/Seven' },
      { type: 'preset/move', id: 'p1', folder: '' }
    );
    expect(folderList(s.library)).toEqual([]);
    expect(s.library.folders).toEqual([]);
    s = run(s, { type: 'preset/move', id: 'p1', folder: 'Pools/Seven' });
    expect(folderList(s.library)).toEqual(['Pools', 'Pools/Seven']);
  });

  it('row 11: describing an implied folder gives it a record, so it stays empty with its description', () => {
    let s = run(
      initialState(),
      { type: 'preset/save', name: 'P', folder: 'Pools/Seven' },
      { type: 'folder/describe', path: 'Pools/Seven', description: 'ratios up to 7' }
    );
    expect(s.library.folders).toEqual([{ path: 'Pools/Seven', description: 'ratios up to 7' }]);
    s = run(s, { type: 'preset/move', id: 'p1', folder: '' });
    expect(folderList(s.library)).toEqual(['Pools', 'Pools/Seven']);
    const node = folderNode(s.library, 'Pools/Seven')!;
    expect(node.count).toBe(0);
    expect(node.description).toBe('ratios up to 7');
  });

  it('clearing a description keeps a folder made with New folder; clearing with no record changes nothing', () => {
    const made = createFolder(emptyLibrary(), 'Drones').lib;
    const described = describeFolder(made, 'Drones', 'x').lib;
    const cleared = describeFolder(described, 'Drones', '  ').lib;
    expect(cleared.folders).toEqual([{ path: 'Drones' }]);
    expect(folderRecord(cleared, 'Drones')).toBeDefined();
    const implied = withPreset(emptyLibrary(), 'P', 'Pools');
    expect(describeFolder(implied, 'Pools', '').lib).toBe(implied);
    expect(describeFolder(described, 'Drones', 'x').lib).toBe(described);
  });

  it('refuses a folder that does not exist and a built-in folder', () => {
    const lib = createFolder(emptyLibrary(), 'Drones').lib;
    expect(describeFolder(lib, 'Nope', 'x').refused).toMatch(/no folder/);
    expect(describeFolder(lib, 'Equal divisions', 'x').refused).toBeDefined();
    expect(describeFolder(lib, '', 'x').refused).toBeDefined();
  });

  it('row 15: a 400 character description is cut at 300', () => {
    const lib = describeFolder(createFolder(emptyLibrary(), 'D').lib, 'D', 'a'.repeat(400)).lib;
    expect(folderDescription(lib, 'D')).toHaveLength(300);
  });
});

describe('M5 folder records: delete (rows 8, 9, 12)', () => {
  it('row 8: refused while the folder holds a preset, with the count, nothing changes', () => {
    const lib = withPreset(createFolder(emptyLibrary(), 'Drones').lib, 'Pedal', 'Drones');
    const r = deleteFolder(lib, 'Drones');
    expect(r.refused).toBe('Drones has 1 preset. Move it out first.');
    expect(r.lib).toBe(lib);
    const two = withPreset(lib, 'Other', 'Drones/Sub');
    expect(deleteFolder(two, 'Drones').refused).toMatch(/Drones has 2 presets/);
  });

  it('row 9: after the preset moves out, delete removes the folder and its record', () => {
    let s = run(
      initialState(),
      { type: 'folder/create', path: 'Drones' },
      { type: 'preset/save', name: 'Pedal', folder: 'Drones' },
      { type: 'folder/delete', path: 'Drones' }
    );
    expect(s.refusal?.reason).toMatch(/has 1 preset/);
    expect(folderExists(s.library, 'Drones')).toBe(true);
    s = run(
      s,
      { type: 'preset/move', id: 'p1', folder: '' },
      { type: 'folder/delete', path: 'Drones' }
    );
    expect(s.refusal).toBeNull();
    expect(s.library.folders).toEqual([]);
    expect(folderExists(s.library, 'Drones')).toBe(false);
    expect(folderNode(s.library, 'Drones')).toBeUndefined();
  });

  it('refused while it has subfolders (record or implied) or does not exist', () => {
    const rec = createFolder(createFolder(emptyLibrary(), 'A').lib, 'A/B').lib;
    expect(deleteFolder(rec, 'A').refused).toBe('A has 1 subfolder. Delete it first.');
    expect(deleteFolder(rec, 'A/B').lib.folders).toEqual([{ path: 'A' }]);
    const implied = createFolder(emptyLibrary(), 'X/Y').lib; // X exists only as the parent of Y
    expect(deleteFolder(implied, 'X').refused).toMatch(/subfolder/);
    expect(deleteFolder(implied, 'Nope').refused).toMatch(/no folder/);
  });

  it('row 12: built-in folders cannot be created, described, renamed or deleted', () => {
    const lib = emptyLibrary();
    const group = PRESETS[0].group;
    expect(isBuiltinFolderPath(group)).toBe(true);
    expect(isBuiltinFolderPath(`${group}/Anything`)).toBe(true);
    for (const g of new Set(PRESETS.map((p) => p.group))) {
      expect(isBuiltinFolderPath(g)).toBe(true);
      expect(isBuiltinFolderPath(`${g}/x`.toUpperCase())).toBe(true);
    }
    expect(isBuiltinFolderPath('Additive')).toBe(false); // only the parent of a group's segments
    expect(isBuiltinFolderPath('Drones')).toBe(false);
    expect(isBuiltinFolderPath('')).toBe(false);
    // a user preset that already sits under a built-in name keeps its folder (old data), but the folder cannot be touched
    const old = withPreset(lib, 'P', group);
    expect(createFolder(lib, group).refused).toMatch(/built-in/);
    expect(describeFolder(old, group, 'x').refused).toMatch(/built-in/);
    expect(renameFolder(old, group, 'Mine').refused).toMatch(/built-in/);
    expect(deleteFolder(old, group).refused).toMatch(/built-in/);
    expect(old.presets[0].folder).toBe(group);
  });
});

describe('M5 folder records: rename', () => {
  const nested = (): GenLibrary => {
    let lib = createFolder(emptyLibrary(), 'Pools/Seven/Empty').lib;
    lib = describeFolder(lib, 'Pools/Seven/Empty', 'nothing yet').lib;
    lib = describeFolder(withPreset(lib, 'A', 'Pools'), 'Pools', 'my pools').lib;
    lib = withPreset(lib, 'B', 'Pools/Seven');
    lib = withPreset(lib, 'C', 'Pools/Seven/Deep');
    lib = withPreset(lib, 'Keep', 'Poolside');
    return lib;
  };

  it('rewrites the folder text of every preset inside and below, and keeps other folders', () => {
    const r = renameFolder(nested(), 'Pools', 'Sets');
    expect(r.refused).toBeUndefined();
    expect(r.lib.presets.map((p) => [p.name, p.folder])).toEqual([
      ['A', 'Sets'],
      ['B', 'Sets/Seven'],
      ['C', 'Sets/Seven/Deep'],
      ['Keep', 'Poolside'],
    ]);
  });

  it('moves the record and the records of subfolders, keeping descriptions', () => {
    const r = renameFolder(nested(), 'Pools', 'Sets');
    expect(r.lib.folders).toEqual([
      { path: 'Sets/Seven/Empty', description: 'nothing yet' },
      { path: 'Sets', description: 'my pools' },
    ]);
    expect(folderList(r.lib)).toEqual([
      'Poolside',
      'Sets',
      'Sets/Seven',
      'Sets/Seven/Deep',
      'Sets/Seven/Empty',
    ]);
    // nothing is copied between a folder and its presets
    expect(r.lib.presets.every((p) => p.description === undefined)).toBe(true);
  });

  it('renames a nested folder to a new path (a move) and an implied-only folder', () => {
    const r = renameFolder(nested(), 'Pools/Seven', 'Pools/Seventh');
    expect(r.lib.presets.map((p) => p.folder)).toEqual([
      'Pools',
      'Pools/Seventh',
      'Pools/Seventh/Deep',
      'Poolside',
    ]);
    const mv = renameFolder(nested(), 'Pools/Seven', 'Elsewhere/Seven');
    expect(folderExists(mv.lib, 'Elsewhere')).toBe(true);
    expect(mv.lib.folders.map((f) => f.path)).toContain('Elsewhere/Seven/Empty');
  });

  it('refuses a name that already exists (record or implied), with nothing changed', () => {
    const lib = nested();
    expect(renameFolder(lib, 'Pools', 'Poolside').refused).toMatch(/already exists/);
    expect(renameFolder(lib, 'Pools/Seven', 'Pools').refused).toMatch(/already exists/);
    expect(renameFolder(lib, 'Pools/Seven/Deep', 'Pools/Seven/Empty').refused).toMatch(
      /already exists/
    );
    expect(renameFolder(lib, 'Pools', 'Poolside').lib).toBe(lib);
  });

  it('refuses an empty name, a built-in target, a target inside itself, a missing folder, and too deep a result', () => {
    const lib = nested();
    expect(renameFolder(lib, 'Pools', ' / ').refused).toMatch(/name/);
    expect(renameFolder(lib, 'Pools', 'Equal divisions').refused).toMatch(/built-in/);
    expect(renameFolder(lib, 'Pools', 'Pools/Inner').refused).toMatch(/inside itself/);
    expect(renameFolder(lib, 'Nope', 'X').refused).toMatch(/no folder/);
    // Pools holds Pools/Seven/Empty (3 deep): a 5-segment target would reach 7 > 6
    expect(renameFolder(lib, 'Pools', 'a/b/c/d/e').refused).toMatch(/levels deep/);
    expect(renameFolder(lib, 'Pools', 'a/b/c').refused).toBeUndefined();
  });

  it('renaming to the same path changes nothing and refuses nothing', () => {
    const lib = nested();
    const r = renameFolder(lib, 'Pools', ' Pools ');
    expect(r.lib).toBe(lib);
    expect(r.refused).toBeUndefined();
  });

  it('reducer: folder/rename rewrites, a refusal sets state.refusal and leaves the library', () => {
    let s = run(
      initialState(),
      { type: 'folder/create', path: 'Drones' },
      { type: 'preset/save', name: 'Pedal', folder: 'Drones/Low' },
      { type: 'folder/describe', path: 'Drones', description: 'pedal tones' },
      { type: 'folder/rename', from: 'Drones', to: 'Pedals' }
    );
    expect(s.library.presets[0].folder).toBe('Pedals/Low');
    expect(s.library.folders).toEqual([{ path: 'Pedals', description: 'pedal tones' }]);
    const before = s.library;
    s = run(s, { type: 'folder/rename', from: 'Pedals', to: 'Equal divisions' });
    expect(s.library).toBe(before);
    expect(s.refusal?.reason).toMatch(/built-in/);
    // the next library action clears the sentence
    s = run(s, { type: 'folder/create', path: 'Fresh' });
    expect(s.refusal).toBeNull();
    expect(s.library.folders.map((f) => f.path)).toEqual(['Pedals', 'Fresh']);
  });
});

describe('M5 folder records: sanitizing on load (rows 13, 14)', () => {
  const base = { version: 1, presets: [], untitled: [], subsets: [] };

  it('row 13: a library saved before M5 loads with no folders and no descriptions, and is written back the same', () => {
    // the stored form of a library with no folders and no descriptions is exactly the pre-M5 form
    const real = libraryToStored(withPreset(emptyLibrary(), 'Old', 'Pools/Seven')) as {
      presets: unknown[];
    };
    const lib = sanitizeLibrary({ ...base, presets: real.presets })!;
    expect(lib.folders).toEqual([]);
    expect(lib.presets[0].description).toBeUndefined();
    expect(folderList(lib)).toEqual(['Pools', 'Pools/Seven']);
    const out = libraryToStored(lib);
    expect('folders' in out).toBe(false);
    expect('description' in (out.presets as object[])[0]).toBe(false);
  });

  it('row 14: a record with a built-in or invalid path is dropped; duplicates too; the rest loads', () => {
    const group = PRESETS[0].group;
    const lib = sanitizeLibrary({
      ...base,
      folders: [
        { path: group, description: 'shadow' },
        { path: `${group}/Mine` },
        { path: '' },
        { path: ' / ' },
        { path: 7 },
        { description: 'no path' },
        'Drones',
        null,
        { path: 'Drones', description: 'pedal tones' },
        { path: ' Drones ', description: 'duplicate' },
        { path: 'Pools/Seven' },
      ],
    })!;
    expect(lib.folders).toEqual([
      { path: 'Drones', description: 'pedal tones' },
      { path: 'Pools/Seven' },
    ]);
  });

  it('a folders value that is not a list is ignored; a long description is cut; the list is capped', () => {
    expect(sanitizeLibrary({ ...base, folders: { path: 'x' } })!.folders).toEqual([]);
    expect(sanitizeLibrary({ ...base, folders: 'x' })!.folders).toEqual([]);
    expect(
      sanitizeFolderRecords([{ path: 'D', description: 'b'.repeat(400) }])[0].description
    ).toHaveLength(300);
    const many = Array.from({ length: MAX_FOLDERS + 20 }, (_, i) => ({ path: `F${i}` }));
    expect(sanitizeFolderRecords(many)).toHaveLength(MAX_FOLDERS);
  });

  it('round trip: folders are stored only when non-empty and read back equal', () => {
    let lib = withPreset(emptyLibrary(), 'P', 'Pools/Seven');
    expect('folders' in libraryToStored(lib)).toBe(false);
    lib = createFolder(lib, 'Drones').lib;
    lib = describeFolder(lib, 'Pools/Seven', 'ratios up to 7').lib;
    const json = JSON.parse(JSON.stringify(libraryToStored(lib))) as { folders: unknown };
    expect(json.folders).toEqual([
      { path: 'Drones' },
      { path: 'Pools/Seven', description: 'ratios up to 7' },
    ]);
    expect(sanitizeLibrary(json)).toEqual(lib);
  });
});

describe('folder suggestions are ordered, never filtered', () => {
  const all = ['Drones', 'Pools', 'Pools/Seven', 'Pools/Seven/Deep', 'Sevenths', 'Zeta'];
  it('an empty box lists every folder in the normal order', () => {
    expect(orderFolderSuggestions(all, '')).toEqual(all);
    expect(orderFolderSuggestions(all, '   ')).toEqual(all);
  });
  it('typed Pools/Seven: the exact folder first, then folders that start with it, then every other folder in order', () => {
    expect(orderFolderSuggestions(all, 'Pools/Seven')).toEqual([
      'Pools/Seven',
      'Pools/Seven/Deep',
      'Drones',
      'Pools',
      'Sevenths',
      'Zeta',
    ]);
  });
  it('typed seven (contains, any case): starts-with first, then contains, then the rest', () => {
    expect(orderFolderSuggestions(all, 'seven')).toEqual([
      'Sevenths',
      'Pools/Seven',
      'Pools/Seven/Deep',
      'Drones',
      'Pools',
      'Zeta',
    ]);
  });
  it('a typed path that is no folder lists all of them', () => {
    expect(orderFolderSuggestions(all, 'Nowhere/New')).toEqual(all);
  });
});

describe('delete a folder with what is inside it (a confirmation names it)', () => {
  const nested = (): GenLibrary => {
    let lib = createFolder(emptyLibrary(), 'Pools/Seven/Empty').lib;
    lib = describeFolder(lib, 'Pools', 'my pools').lib;
    lib = withPreset(lib, 'A', 'Pools');
    lib = withPreset(lib, 'B', 'Pools/Seven');
    lib = withPreset(lib, 'C', 'Pools/Seven/Deep');
    lib = withPreset(lib, 'Keep', 'Poolside');
    lib = createFolder(lib, 'Drones').lib;
    return lib;
  };

  it('the question names the presets and folders inside, singular and plural right; an empty folder is just Delete X?', () => {
    const lib = nested();
    // Pools holds A, B, C (3 presets) and the folders Seven, Seven/Empty, Seven/Deep (3 folders)
    expect(deleteFolderQuestion(lib, 'Pools')).toBe(
      'Delete Pools, its 3 presets and 3 folders? Subsets stay under Auto-saved.'
    );
    expect(deleteFolderQuestion(lib, 'Pools/Seven')).toBe(
      'Delete Pools/Seven, its 2 presets and 2 folders? Subsets stay under Auto-saved.'
    );
    // one preset and no folder; one folder and no preset; nothing inside
    expect(deleteFolderQuestion(lib, 'Pools/Seven/Deep')).toBe(
      'Delete Pools/Seven/Deep, its 1 preset? Subsets stay under Auto-saved.'
    );
    expect(deleteFolderQuestion(lib, 'Pools/Seven/Empty')).toBe('Delete Pools/Seven/Empty?');
    expect(deleteFolderQuestion(lib, 'Drones')).toBe('Delete Drones?');
    const one = createFolder(createFolder(emptyLibrary(), 'X').lib, 'X/Y').lib;
    expect(deleteFolderQuestion(one, 'X')).toBe('Delete X, its 1 folder?');
  });

  it('deleting a nested tree removes its records and presets and leaves the others untouched', () => {
    const lib = nested();
    const r = deleteFolderTree(lib, 'Pools/Seven');
    expect(r.refused).toBeUndefined();
    expect(r.lib.presets.map((p) => p.name)).toEqual(['A', 'Keep']);
    expect(r.lib.folders.map((f) => f.path)).toEqual(['Pools', 'Drones']);
    expect(folderExists(r.lib, 'Pools/Seven')).toBe(false);
    expect(folderExists(r.lib, 'Pools/Seven/Empty')).toBe(false);
    expect(folderExists(r.lib, 'Pools')).toBe(true);
    expect(folderDescription(r.lib, 'Pools')).toBe('my pools');
    expect(r.moved).toHaveLength(2);
    // the top folder takes everything under it; Poolside (a different name) stays
    const all = deleteFolderTree(lib, 'Pools');
    expect(all.lib.presets.map((p) => p.name)).toEqual(['Keep']);
    expect(all.lib.folders.map((f) => f.path)).toEqual(['Drones']);
    // an empty folder: just its record goes
    expect(deleteFolderTree(lib, 'Drones').lib.folders.map((f) => f.path)).not.toContain('Drones');
  });

  it('the subsets of the removed presets stay under Auto-saved, and a tab linked to one follows them', () => {
    let s = run(
      initialState(),
      { type: 'preset/save', name: 'B', folder: 'Pools/Seven' },
      { type: 'sel/set', idx: [0, 2, 4] },
      { type: 'subset/add' },
      { type: 'preset/save', name: 'Keep', folder: 'Other' }
    );
    s = run(s, { type: 'preset/open', owner: 'p:p1' });
    const before = subsetsOf(s.library, 'p:p1').length;
    expect(before).toBeGreaterThan(0);
    s = run(s, { type: 'folder/delete-tree', path: 'Pools' });
    expect(s.refusal).toBeNull();
    expect(s.library.presets.map((p) => p.name)).toEqual(['Keep']);
    const link = s.tabs.find((t) => t.link?.startsWith('u:'))?.link;
    expect(link).toBeDefined();
    expect(subsetsOf(s.library, link!)).toHaveLength(before);
    expect(s.library.subsets.every((x) => x.owner !== 'p:p1')).toBe(true);
  });

  it('built-in folders and folders that do not exist are refused, nothing changes', () => {
    const group = PRESETS[0].group;
    const old = withPreset(emptyLibrary(), 'P', group);
    const r = deleteFolderTree(old, group);
    expect(r.refused).toMatch(/built-in/);
    expect(r.lib).toBe(old);
    expect(deleteFolderTree(old, 'Nope').refused).toMatch(/no folder/);
    expect(deleteFolderTree(old, '').refused).toBeDefined();
    const s = run(initialState(), { type: 'folder/delete-tree', path: 'Nope' });
    expect(s.refusal?.reason).toMatch(/no folder named Nope/);
  });
});

describe('preset/rename refusals (the breadcrumb rename shows them)', () => {
  it('an empty name and a name taken in the same folder are refused; the same name elsewhere is fine', () => {
    let s = run(
      initialState(),
      { type: 'preset/save', name: 'One', folder: 'Pools' },
      { type: 'preset/save', name: 'Two', folder: 'Pools' },
      { type: 'preset/save', name: 'Three', folder: 'Other' }
    );
    s = run(s, { type: 'preset/rename', id: 'p1', name: '   ' });
    expect(s.refusal?.reason).toBe('Give the preset a name.');
    s = run(s, { type: 'preset/rename', id: 'p1', name: ' two ' });
    expect(s.refusal?.reason).toBe('A preset named two already exists in Pools.');
    expect(s.library.presets[0].name).toBe('One');
    // another folder: allowed, and the refusal is gone
    s = run(s, { type: 'preset/rename', id: 'p3', name: 'Two' });
    expect(s.refusal).toBeNull();
    expect(s.library.presets[2].name).toBe('Two');
    // the same name again is no change, not a refusal
    s = run(s, { type: 'preset/rename', id: 'p1', name: 'One' });
    expect(s.refusal).toBeNull();
  });
});
