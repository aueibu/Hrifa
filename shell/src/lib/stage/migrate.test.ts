import { describe, expect, it } from 'vitest';
import {
  CHORDS_MODULE,
  ROLL_MODULE,
  defaultEditorLayout,
} from '../../pages/composition-workbench/editorStage';
import { registry } from './fixtures';
import type { Layout } from './layout';
import { foldEditorLayout, layoutV1ToScreenset } from './migrate';
import { parseScreensetStore } from './screenset';
import {
  dockerHolding,
  findDocker,
  makeDocker,
  makeScreenset,
  makeStore,
  treeDockers,
  type Screenset,
  type TreeNode,
} from './tree';

const fallback = makeStore([makeScreenset({ id: 'f', name: 'F', tree: makeDocker('d1', 'Main') })]);

describe('layoutV1ToScreenset', () => {
  it('maps columns to a row split: rem for all but the last, which flexes with its width as the minimum', () => {
    const l: Layout = {
      version: 1,
      columns: [
        { slots: ['canvas'], width: 40 },
        { slots: ['sets'], width: 30 },
      ],
    };
    const s = layoutV1ToScreenset(l, { id: 'x', name: 'X', registry });
    expect(s.tree).toEqual({
      kind: 'split',
      dir: 'row',
      children: [
        { rem: 40, node: makeDocker('d1', 'Canvas', ['canvas']) },
        { weight: 1, min: 30, node: makeDocker('d2', 'Sets', ['sets']) },
      ],
    });
    expect(s.lastDocker.sets).toEqual({ docker: 'd2', name: 'Sets', index: 0 });
    expect(s.lastDocker.canvas).toEqual({ docker: 'd1', name: 'Canvas', index: 0 });
  });

  it('a column with no width means 36 rem; a width is clamped to 12..96', () => {
    const s = layoutV1ToScreenset(
      {
        version: 1,
        columns: [{ slots: ['canvas'] }, { slots: ['desk'], width: 500 }, { slots: ['sets'] }],
      },
      { registry }
    );
    const kids = (s.tree as { children: { rem?: number; min?: number }[] }).children;
    expect(kids[0].rem).toBe(36);
    expect(kids[1].rem).toBe(96);
    expect(kids[2].min).toBe(36);
  });

  it('a stack becomes a column split with weights from the shares; unknown ids and repeats are not an issue for the core', () => {
    const s = layoutV1ToScreenset(
      {
        version: 1,
        columns: [{ slots: ['canvas', 'desk'], shares: [0.7, 0.3] }, { slots: ['canvas', 'sets'] }],
      },
      { registry }
    );
    const kids = (s.tree as { children: { rem?: number; node: TreeNode }[] }).children;
    expect(kids).toHaveLength(2);
    expect(kids[0].node).toMatchObject({
      kind: 'split',
      dir: 'column',
      children: [{ weight: 0.7 }, { weight: 0.3 }],
    });
    // The repeated 'canvas' in column two is dropped; column two keeps 'sets' as a lone docker.
    expect(treeDockers(s.tree).flatMap((d) => d.tabs)).toEqual(['canvas', 'desk', 'sets']);
  });

  it('a single column is a lone docker; an empty layout is one empty docker', () => {
    expect(
      layoutV1ToScreenset({ version: 1, columns: [{ slots: ['canvas'] }] }).tree
    ).toMatchObject({
      kind: 'docker',
      tabs: ['canvas'],
    });
    expect(layoutV1ToScreenset({ version: 1, columns: [] }).tree).toMatchObject({
      kind: 'docker',
      tabs: [],
      active: null,
    });
  });

  it('makes docker names unique and applies the id rename first, places included', () => {
    const s = layoutV1ToScreenset(
      {
        version: 1,
        columns: [{ slots: ['roll'] }, { slots: ['clip-editor'] }, { slots: ['desk'] }],
      },
      { registry, rename: { roll: 'clip-editor' } }
    );
    expect(treeDockers(s.tree).flatMap((d) => d.tabs)).toEqual(['clip-editor', 'desk']);
    expect(Object.keys(s.lastDocker).sort()).toEqual(['clip-editor', 'desk']);
  });

  it('loads the real editor default layout without loss', () => {
    const s = layoutV1ToScreenset(defaultEditorLayout(80), { registry: undefined });
    expect(treeDockers(s.tree).flatMap((d) => d.tabs)).toEqual([ROLL_MODULE, CHORDS_MODULE]);
  });

  it('round trips through the store parser (version 1 migrated, version 2 written)', () => {
    const l: Layout = {
      version: 1,
      columns: [{ slots: ['canvas'], width: 20 }, { slots: ['desk'] }],
    };
    const store = parseScreensetStore(JSON.stringify(l), registry, { fallback });
    const again = parseScreensetStore(JSON.stringify(store), registry, { fallback });
    expect(again).toEqual(store);
    expect(store.screensets.main.version).toBe(2);
  });
});

/** A default-screenset-like base: Canvas over Detail and an empty Tools docker. */
const base = (): Screenset =>
  makeScreenset({
    id: 'edit',
    name: 'Edit',
    tree: {
      kind: 'split',
      dir: 'column',
      children: [
        { weight: 0.55, node: makeDocker('d1', 'Canvas', ['canvas']) },
        {
          weight: 0.45,
          node: {
            kind: 'split',
            dir: 'row',
            children: [
              { weight: 1, node: makeDocker('d2', 'Detail', ['module-detail']) },
              { rem: 30, node: makeDocker('d3', 'Tools', []) },
            ],
          },
        },
      ],
    },
  });

const bottom = (s: Screenset) =>
  (s.tree as { children: { node: TreeNode }[] }).children[1].node as {
    dir: string;
    children: { rem?: number; weight?: number; node: TreeNode }[];
  };
const names = (n: TreeNode): string[] => treeDockers(n).map((d) => d.name);

describe('foldEditorLayout (the editor key)', () => {
  it('side by side, roll left of chords: Tools stays right with its width as rem; roll becomes clip-editor in Detail', () => {
    const editor: Layout = {
      version: 1,
      columns: [
        { slots: ['roll'], width: 40 },
        { slots: ['chords'], width: 28 },
      ],
    };
    const s = foldEditorLayout(editor, base(), { known: registry });
    const row = bottom(s);
    expect(row.dir).toBe('row');
    expect(names(s.tree)).toEqual(['Canvas', 'Detail', 'Tools']);
    expect(row.children[1]).toMatchObject({ rem: 28 });
    expect(dockerHolding(s.tree, 'clip-editor')!.name).toBe('Detail');
    expect(dockerHolding(s.tree, 'module-detail')!.name).toBe('Detail');
    // The ids renamed: no 'roll' anywhere, in tabs or places.
    expect(JSON.stringify(s)).not.toContain('roll');
    // chords is not a visible column: closed, remembered as Tools.
    expect(dockerHolding(s.tree, 'chords')).toBeNull();
    expect(s.lastDocker.chords).toEqual({ docker: 'd3', name: 'Tools', index: 0 });
  });

  it('swapped order (chords left of roll): Tools goes left of Detail', () => {
    const editor: Layout = {
      version: 1,
      columns: [{ slots: ['chords'] }, { slots: ['roll'], width: 40 }],
    };
    const s = foldEditorLayout(editor, base(), { known: registry });
    const row = bottom(s);
    expect(names(s.tree)).toEqual(['Canvas', 'Tools', 'Detail']);
    // A column with no width means 36 rem.
    expect(row.children[0]).toMatchObject({ rem: 36 });
    expect(row.children[1].weight).toBe(1);
    expect(s.lastDocker.chords.name).toBe('Tools');
  });

  it('stacked roll over chords: Tools goes below Detail, shares as weights (merged into the column root)', () => {
    const editor: Layout = {
      version: 1,
      columns: [{ slots: ['roll', 'chords'], shares: [0.7, 0.3] }],
    };
    const s = foldEditorLayout(editor, base(), { known: registry });
    const root = s.tree as { dir: string; children: { weight?: number; node: TreeNode }[] };
    // The new column split nests in a column root with all-weight children, so normalisation merges it.
    expect(root.dir).toBe('column');
    expect(root.children.map((c) => names(c.node))).toEqual([['Canvas'], ['Detail'], ['Tools']]);
    expect(root.children[0].weight).toBe(0.55);
    expect(root.children[1].weight! / root.children[2].weight!).toBeCloseTo(0.7 / 0.3, 4);
    expect(root.children[1].weight! + root.children[2].weight!).toBeCloseTo(0.45, 4);
    expect(dockerHolding(s.tree, 'clip-editor')!.name).toBe('Detail');
  });

  it('stacked chords over roll: Tools goes above Detail', () => {
    const editor: Layout = { version: 1, columns: [{ slots: ['chords', 'roll'] }] };
    const s = foldEditorLayout(editor, base(), { known: registry });
    const root = s.tree as { dir: string; children: { weight?: number; node: TreeNode }[] };
    expect(root.children.map((c) => names(c.node))).toEqual([['Canvas'], ['Tools'], ['Detail']]);
  });

  it('keeps every panel of the base and loses nothing', () => {
    const editor: Layout = { version: 1, columns: [{ slots: ['chords', 'roll'] }] };
    const s = foldEditorLayout(editor, base(), { known: registry });
    expect(
      treeDockers(s.tree)
        .flatMap((d) => d.tabs)
        .sort()
    ).toEqual(['canvas', 'clip-editor', 'module-detail']);
  });

  it('takeover wins: the Canvas docker is wrapped in a row split with a new empty Chords docker', () => {
    const editor: Layout = {
      version: 1,
      columns: [
        { slots: ['roll'], width: 40 },
        { slots: ['chords'], width: 28 },
      ],
    };
    const s = foldEditorLayout(editor, base(), {
      known: registry,
      chordHost: 'takeover',
      pickerRem: 24,
    });
    const top = (s.tree as { children: { node: TreeNode }[] }).children[0].node as {
      dir: string;
      children: { weight?: number; min?: number; node: TreeNode }[];
    };
    expect(top.dir).toBe('row');
    expect(top.children[0]).toMatchObject({ weight: 1, node: { name: 'Canvas' } });
    expect(top.children[1]).toMatchObject({
      weight: 1,
      min: 24,
      node: { name: 'Chords', tabs: [] },
    });
    const chordsDocker = findDocker(s.tree, s.lastDocker.chords.docker)!;
    expect(chordsDocker.name).toBe('Chords');
    expect(dockerHolding(s.tree, 'chords')).toBeNull();
  });

  it('a key with no chords entry keeps the base arrangement and carries only the picker width', () => {
    const editor: Layout = { version: 1, columns: [{ slots: ['roll'] }] };
    const s = foldEditorLayout(editor, base(), { known: registry, pickerRem: 20 });
    expect(names(s.tree)).toEqual(['Canvas', 'Detail', 'Tools']);
    expect(bottom(s).children[1]).toMatchObject({ rem: 20 });
    expect(s.lastDocker.chords).toEqual({ docker: 'd3', name: 'Tools', index: 0 });
  });

  it('drops unknown ids from the key and does not touch the base when Detail cannot be found', () => {
    const editor: Layout = { version: 1, columns: [{ slots: ['mystery'] }, { slots: ['roll'] }] };
    const s = foldEditorLayout(editor, base(), { known: registry });
    expect(JSON.stringify(s)).not.toContain('mystery');
    expect(dockerHolding(s.tree, 'clip-editor')!.name).toBe('Detail');
  });

  it('folds the real default editor layout and a real swapped one', () => {
    const real = defaultEditorLayout(80);
    const s = foldEditorLayout(real, base(), { known: registry });
    expect(bottom(s).children[1]).toMatchObject({ rem: 30 });
    const swapped: Layout = { version: 1, columns: [real.columns[1], real.columns[0]] };
    const t = foldEditorLayout(swapped, base(), { known: registry });
    expect(names(t.tree)).toEqual(['Canvas', 'Tools', 'Detail']);
  });
});
