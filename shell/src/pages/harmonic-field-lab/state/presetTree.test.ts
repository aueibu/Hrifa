import { describe, expect, it } from 'vitest';
import { PRESETS, subsetFromSelection } from '../../../lib/harmonic-field';
import { generateField } from './generate';
import {
  addSubset,
  builtinKey,
  emptyLibrary,
  ensureUntitled,
  pushRecent,
  saveUserPreset,
  untitledKey,
  type GenLibrary,
} from './generatorLibrary';
import { presetGen } from './labState';
import { copySentence } from './noticeText';
import {
  ROOT_BUILTIN,
  ROOT_MINE,
  ROOT_RECENT,
  ROOT_UNTITLED,
  buildTree,
  foldersAbove,
  nodeId,
  ownerPath,
  searchPresets,
  visibleRows,
  type FolderNode,
  type PresetNode,
  type TreeNode,
} from './presetTree';

const leaves = (n: TreeNode): PresetNode[] =>
  n.kind === 'preset' ? [n] : n.children.flatMap((c) => leaves(c));
const H8 = builtinKey('Harmonics 8–15');

function withSubset(lib: GenLibrary, key: string): GenLibrary {
  const g = generateField(presetGen('Harmonics 8–15'));
  if (!g.ok) {
    throw new Error('does not build');
  }
  const set = subsetFromSelection(g.field, [0, 2, 4], 0);
  return addSubset(lib, key, set).lib;
}

describe('preset tree', () => {
  it('has the four roots in order', () => {
    const roots = buildTree(emptyLibrary());
    expect(roots.map((r) => r.label)).toEqual([
      ROOT_BUILTIN,
      ROOT_MINE,
      ROOT_RECENT,
      ROOT_UNTITLED,
    ]);
  });

  it('holds every built-in preset exactly once under Built-in', () => {
    const [builtin] = buildTree(emptyLibrary());
    const all = leaves(builtin).map((l) => l.owner);
    expect(all).toHaveLength(PRESETS.length);
    expect(new Set(all).size).toBe(PRESETS.length);
    for (const p of PRESETS) {
      expect(all).toContain(builtinKey(p.name));
    }
  });

  it('nests a built-in under its group and subfolder', () => {
    const [builtin] = buildTree(emptyLibrary());
    const eq = builtin.children.find((c) => c.label === 'Equal divisions') as FolderNode;
    const non = eq.children.find((c) => c.label === 'Non-octave') as FolderNode;
    expect(non.children.map((c) => c.label)).toContain('Carlos Alpha (9 ED 3/2)');
    expect(eq.path).toEqual([ROOT_BUILTIN, 'Equal divisions']);
  });

  it('builds My presets from folder paths, folders before presets, with subset counts', () => {
    let lib = emptyLibrary();
    const gen = presetGen('Harmonics 8–15');
    const a = saveUserPreset(lib, { name: 'Zed', folder: 'Pools/Seven', gen });
    lib = a.lib;
    const b = saveUserPreset(lib, { name: 'Top', folder: '', gen });
    lib = b.lib;
    lib = withSubset(lib, a.key!);
    const mine = buildTree(lib)[1];
    expect(mine.children.map((c) => c.label)).toEqual(['Pools', 'Top']);
    const pools = mine.children[0] as FolderNode;
    expect(pools.userPath).toBe('Pools');
    const seven = pools.children[0] as FolderNode;
    expect(seven.userPath).toBe('Pools/Seven');
    expect(seven.count).toBe(1);
    expect(pools.count).toBe(1);
    expect(mine.count).toBe(1);
    const leaf = seven.children[0] as PresetNode;
    expect(leaf.label).toBe('Zed');
    expect(leaf.userId).not.toBeNull();
    expect(leaf.folder).toBe('Pools/Seven');
  });

  it('shows built-ins that own subsets with their count', () => {
    const lib = withSubset(emptyLibrary(), H8);
    const [builtin] = buildTree(lib);
    const leaf = leaves(builtin).find((l) => l.owner === H8)!;
    expect(leaf.count).toBe(1);
    expect(builtin.count).toBe(1);
  });

  it('lists Recent (last 8, newest first) and Untitled generators only when they hold subsets', () => {
    let lib = emptyLibrary();
    const u = ensureUntitled(lib, presetGen('12-EDO'));
    lib = u.lib;
    expect(buildTree(lib)[3].children).toHaveLength(0); // no subsets yet
    lib = withSubset(lib, u.key!);
    expect(buildTree(lib)[3].children.map((c) => (c as PresetNode).owner)).toEqual([u.key]);
    for (const p of PRESETS.slice(0, 10)) {
      lib = pushRecent(lib, builtinKey(p.name));
    }
    const recent = buildTree(lib)[2];
    expect(recent.children).toHaveLength(8);
    expect((recent.children[0] as PresetNode).owner).toBe(builtinKey(PRESETS[9].name));
  });

  it('visibleRows shows only the open folders', () => {
    const roots = buildTree(emptyLibrary());
    expect(visibleRows(roots, new Set()).map((r) => r.node.label)).toEqual([
      ROOT_BUILTIN,
      ROOT_MINE,
      ROOT_RECENT,
      ROOT_UNTITLED,
    ]);
    const open = new Set([nodeId('f', [ROOT_BUILTIN])]);
    const rows = visibleRows(roots, open);
    expect(rows[1].node.label).toBe('Harmonic series');
    expect(rows[1].depth).toBe(1);
    expect(rows[1].parent).toBe(nodeId('f', [ROOT_BUILTIN]));
    expect(rows[0].expanded).toBe(true);
  });

  it('search is flat, matches name and folder words, and skips Recent duplicates', () => {
    let lib = emptyLibrary();
    lib = pushRecent(lib, builtinKey('Carlos Alpha (9 ED 3/2)'));
    const roots = buildTree(lib);
    const hits = searchPresets(roots, 'carlos');
    expect(hits.map((h) => h.label)).toEqual([
      'Carlos Alpha (9 ED 3/2)',
      'Carlos Beta (11 ED 3/2)',
      'Carlos Gamma (20 ED 3/2)',
    ]);
    expect(hits[0].path).toEqual([ROOT_BUILTIN, 'Equal divisions', 'Non-octave']);
    // a folder word narrows it
    expect(searchPresets(roots, 'non-octave alpha').map((h) => h.label)).toEqual([
      'Carlos Alpha (9 ED 3/2)',
    ]);
    expect(searchPresets(roots, 'hexany').length).toBeGreaterThanOrEqual(4);
    expect(searchPresets(roots, '   ')).toEqual([]);
    expect(searchPresets(roots, 'zzzz')).toEqual([]);
  });

  it('ownerPath gives folders then the name, without the Built-in root', () => {
    let lib = emptyLibrary();
    expect(ownerPath(lib, builtinKey('Carlos Alpha (9 ED 3/2)'))).toEqual([
      'Equal divisions',
      'Non-octave',
      'Carlos Alpha (9 ED 3/2)',
    ]);
    expect(ownerPath(lib, H8)).toEqual(['Harmonic series', 'Harmonics 8–15']);
    const s = saveUserPreset(lib, { name: 'Mine', folder: 'A/B', gen: presetGen('12-EDO') });
    lib = s.lib;
    expect(ownerPath(lib, s.key!)).toEqual([ROOT_MINE, 'A', 'B', 'Mine']);
    const u = ensureUntitled(lib, presetGen('12-EDO'));
    expect(ownerPath(u.lib, u.key!)[0]).toBe(ROOT_UNTITLED);
    expect(ownerPath(lib, untitledKey('nope'))).toEqual([]);
    expect(ownerPath(lib, 'garbage')).toEqual([]);
  });

  it('foldersAbove lists the folders to open for an owner', () => {
    const lib = emptyLibrary();
    expect(foldersAbove(lib, builtinKey('Carlos Alpha (9 ED 3/2)'))).toEqual([
      nodeId('f', [ROOT_BUILTIN]),
      nodeId('f', [ROOT_BUILTIN, 'Equal divisions']),
      nodeId('f', [ROOT_BUILTIN, 'Equal divisions', 'Non-octave']),
    ]);
    expect(foldersAbove(lib, null)).toEqual([nodeId('f', [ROOT_BUILTIN])]);
  });
});

describe('copySentence', () => {
  const base = {
    subsetsTotal: 3,
    updatedSubsets: 2,
    removedSubsets: 1,
    removed: [{ id: 's3', name: 'C' }],
    affectedSubsets: 1,
    affectedAverageLost: 2,
    mostLost: 2,
    pitchesFound: 5,
    pitchesTotal: 9,
    detail: [],
  };
  it('says how many came across, how many were left out and what the others lost', () => {
    expect(copySentence('Mine', base)).toBe(
      "Saved 'Mine' with 2 copied subsets. 1 subset had no matching pitches and was left out. The other subsets lost 2.0 pitches on average (most: 2)."
    );
  });
  it('is short when nothing was lost', () => {
    expect(
      copySentence('Mine', { ...base, updatedSubsets: 1, removedSubsets: 0, affectedSubsets: 0 })
    ).toBe("Saved 'Mine' with 1 copied subset.");
  });
});
