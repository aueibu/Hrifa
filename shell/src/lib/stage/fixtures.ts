/** Shared test fixtures for the tree tests: the three target arrangements of the design. Not exported from index.ts. */
import { createRegistry, type ModuleMeta } from './registry';
import { makeDocker, makeScreenset, type Screenset, type TreeNode } from './tree';

export const meta = (id: string, over: Partial<ModuleMeta> = {}): ModuleMeta => ({
  id,
  title: id[0].toUpperCase() + id.slice(1),
  sizes: [{ width: 'regular', height: 'regular' }],
  minSize: { width: 'narrow', height: 'short' },
  ...over,
});

export const registry = createRegistry(
  [
    'canvas',
    'desk',
    'clip-editor',
    'chords',
    'sets',
    'voicings',
    'visualizer',
    'roll',
    'module-detail',
  ].map((id) =>
    meta(id, id === 'clip-editor' ? { home: 'Detail' } : id === 'chords' ? { home: 'Tools' } : {})
  )
);

export const screenset = (tree: TreeNode, id = 's'): Screenset =>
  makeScreenset({ id, name: id, tree });

/** (a) A top docker over a bottom area whose right-hand docker holds three tabs. */
export const arrangementA: TreeNode = {
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
          { weight: 1, node: makeDocker('d2', 'Detail', ['clip-editor']) },
          { rem: 30, node: makeDocker('d3', 'Tools', ['chords', 'sets', 'voicings'], 'chords') },
        ],
      },
    },
  ],
};

/** (b) Left, centre and right dockers with one tab each. */
export const arrangementB: TreeNode = {
  kind: 'split',
  dir: 'row',
  children: [
    { rem: 20, node: makeDocker('d1', 'Library', ['sets']) },
    { weight: 1, node: makeDocker('d2', 'Canvas', ['canvas']) },
    { rem: 24, node: makeDocker('d3', 'Visualizer', ['visualizer']) },
  ],
};

/** (c) A top docker over a bottom split into left and right; the right one is empty. */
export const arrangementC: TreeNode = {
  kind: 'split',
  dir: 'column',
  children: [
    { weight: 0.5, node: makeDocker('d1', 'Canvas', ['canvas', 'desk'], 'canvas') },
    {
      weight: 0.5,
      node: {
        kind: 'split',
        dir: 'row',
        children: [
          { weight: 0.5, node: makeDocker('d2', 'Detail', ['clip-editor']) },
          { weight: 0.5, node: makeDocker('d3', 'Tools', [], null) },
        ],
      },
    },
  ],
};
