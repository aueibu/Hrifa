import { describe, expect, it } from 'vitest';
import { arrangementA, arrangementC, workspace } from './fixtures';
import {
  closePanel,
  openPanel,
  reconcile,
  removeDocker,
  renameDocker,
  reorderTab,
  resizeSplit,
  sendTo,
  setActive,
  setCollapsed,
  setDockerSizing,
  splitDocker,
} from './ops';
import { resolvePlace } from './places';
import { splitChildSizes } from './solve';
import {
  dockerHolding,
  findDocker,
  makeDocker,
  normalizeTree,
  openPanels,
  treeDockers,
  type Workspace,
  type Split,
  type TreeNode,
} from './tree';

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
}
const A = () => deepFreeze(workspace(structuredClone(arrangementA), 'a'));
const sortedPanels = (s: Workspace) => [...openPanels(s.tree)].sort();

describe('normalizeTree', () => {
  const d = (id: string) => makeDocker(id, id, [id]);
  it('replaces a one-child split by its child', () => {
    const t: TreeNode = {
      kind: 'split',
      dir: 'row',
      children: [
        { weight: 1, node: { kind: 'split', dir: 'column', children: [{ node: d('a') }] } },
      ],
    };
    expect(normalizeTree(t)).toEqual(d('a'));
  });
  it('merges a same-direction nested split when every merged child is a weight (rescaled)', () => {
    const t: TreeNode = {
      kind: 'split',
      dir: 'row',
      children: [
        { weight: 2, node: d('a') },
        {
          weight: 2,
          node: {
            kind: 'split',
            dir: 'row',
            children: [
              { weight: 1, node: d('b') },
              { weight: 3, node: d('c') },
            ],
          },
        },
      ],
    };
    const n = normalizeTree(t) as { children: { weight?: number }[] };
    expect(n.children.map((c) => c.weight)).toEqual([2, 0.5, 1.5]);
  });
  it('never merges mixed rem and weight', () => {
    const nested: TreeNode = {
      kind: 'split',
      dir: 'row',
      children: [
        { rem: 20, node: d('b') },
        { weight: 1, node: d('c') },
      ],
    };
    const t: TreeNode = {
      kind: 'split',
      dir: 'row',
      children: [
        { weight: 1, node: d('a') },
        { weight: 1, node: nested },
      ],
    };
    expect(normalizeTree(t)).toBe(t);
    const fixedSlot: TreeNode = {
      kind: 'split',
      dir: 'row',
      children: [
        { weight: 1, node: d('a') },
        {
          rem: 30,
          node: {
            kind: 'split',
            dir: 'row',
            children: [
              { weight: 1, node: d('b') },
              { weight: 1, node: d('c') },
            ],
          },
        },
      ],
    };
    expect(normalizeTree(fixedSlot)).toBe(fixedSlot);
  });
  it('does not merge a different direction', () => {
    expect(normalizeTree(arrangementA)).toBe(arrangementA);
  });
});

describe('sendTo', () => {
  it('keeps every panel when sending between dockers and records the destination place', () => {
    const s = A();
    const next = sendTo(s, 'canvas', { kind: 'docker', docker: 'd3' });
    expect(sortedPanels(next)).toEqual(sortedPanels(s));
    expect(findDocker(next.tree, 'd3')!.tabs).toEqual(['chords', 'sets', 'voicings', 'canvas']);
    expect(findDocker(next.tree, 'd3')!.active).toBe('canvas');
    // The emptied docker persists.
    const d1 = findDocker(next.tree, 'd1')!;
    expect(d1.tabs).toEqual([]);
    expect(d1.active).toBeNull();
    expect(next.lastDocker.canvas).toEqual({ docker: 'd3', name: 'Tools', index: 3 });
  });
  it('inserts at an index and moves the active tab on removal', () => {
    const s = sendTo(A(), 'sets', { kind: 'docker', docker: 'd2', index: 0 });
    expect(findDocker(s.tree, 'd2')!.tabs).toEqual(['sets', 'data-block-editor']);
    // 'chords' was active in d3 and stays; sending the active one hands over to the next tab.
    const t = sendTo(A(), 'chords', { kind: 'docker', docker: 'd2' });
    expect(findDocker(t.tree, 'd3')!.active).toBe('sets');
  });
  it('does nothing for the same docker, an unknown docker or an unknown target', () => {
    const s = A();
    expect(sendTo(s, 'canvas', { kind: 'docker', docker: 'd1' })).toBe(s);
    expect(sendTo(s, 'canvas', { kind: 'docker', docker: 'zz' })).toBe(s);
    expect(sendTo(s, 'canvas', { kind: 'split', beside: 'zz', edge: 'left' })).toBe(s);
    expect(sendTo(s, 'canvas', { kind: 'split', beside: 'd1', edge: 'left' })).toBe(s);
  });
  it('sends to a new docker with a direction; same-direction parent halves the room', () => {
    const s = sendTo(A(), 'sets', { kind: 'split', beside: 'd2', edge: 'right', name: 'Library' });
    expect(sortedPanels(s)).toEqual(sortedPanels(A()));
    const lib = dockerHolding(s.tree, 'sets')!;
    expect(lib.name).toBe('Library');
    expect(lib.id).toBe('d4');
    const row = (s.tree as { children: { node: TreeNode }[] }).children[1].node as {
      dir: string;
      children: { weight?: number; rem?: number; node: TreeNode }[];
    };
    expect(row.dir).toBe('row');
    expect(row.children.map((c) => (c.node as { name: string }).name)).toEqual([
      'Detail',
      'Library',
      'Tools',
    ]);
    expect(row.children[0].weight).toBe(0.5);
    expect(row.children[1].weight).toBe(0.5);
    expect(row.children[2].rem).toBe(30);
  });
  it('a new docker in the other direction wraps its neighbour and keeps its slot size', () => {
    const s = sendTo(A(), 'canvas', { kind: 'split', beside: 'd3', edge: 'top' });
    const tools = findDocker(s.tree, 'd3')!;
    expect(tools.tabs).toEqual(['chords', 'sets', 'voicings']);
    const row = (s.tree as { children: { node: TreeNode }[] }).children[1].node as {
      children: { rem?: number; node: { kind: string; dir?: string } }[];
    };
    expect(row.children[1]).toMatchObject({ rem: 30, node: { kind: 'split', dir: 'column' } });
    expect(findDocker(s.tree, 'd1')!.tabs).toEqual([]);
  });
  it('makes a new docker name unique and ids are never reused', () => {
    let s = sendTo(A(), 'sets', { kind: 'split', beside: 'd1', edge: 'bottom', name: 'canvas' });
    expect(dockerHolding(s.tree, 'sets')!.name).toBe('canvas 2');
    s = removeDocker(s, 'd4');
    s = sendTo(s, 'sets', { kind: 'split', beside: 'd1', edge: 'bottom' });
    expect(dockerHolding(s.tree, 'sets')!.id).toBe('d5');
  });
  it('creates an empty docker with splitDocker', () => {
    const made = splitDocker(A(), 'd1', 'right', { name: 'Chords', min: 30 })!;
    expect(made.docker.tabs).toEqual([]);
    const inner = (
      made.workspace.tree as { children: { node: { children: { min?: number }[] } }[] }
    ).children[0].node;
    expect(inner.children[1].min).toBe(30);
    expect(splitDocker(A(), 'nope', 'right')).toBeNull();
  });
});

describe('tabs', () => {
  it('reorders and sets the active tab', () => {
    const s = reorderTab(A(), 'voicings', 0);
    expect(findDocker(s.tree, 'd3')!.tabs).toEqual(['voicings', 'chords', 'sets']);
    expect(findDocker(s.tree, 'd3')!.active).toBe('voicings');
    expect(setActive(s, 'd3', 'sets').tree).not.toBe(s.tree);
    const s0 = A();
    expect(setActive(s0, 'd3', 'chords')).toBe(s0);
  });
  it('closing the active tab activates the next, the previous at the end', () => {
    let s = setActive(A(), 'd3', 'sets');
    s = closePanel(s, 'sets');
    expect(findDocker(s.tree, 'd3')!.active).toBe('voicings');
    s = closePanel(s, 'voicings');
    expect(findDocker(s.tree, 'd3')!.active).toBe('chords');
  });
});

describe('close and reopen with the remembered place', () => {
  it('records on close and restores by docker id', () => {
    let s = closePanel(A(), 'sets');
    expect(s.lastDocker.sets).toEqual({ docker: 'd3', name: 'Tools', index: 1 });
    expect(openPanels(s.tree)).not.toContain('sets');
    s = openPanel(s, 'sets');
    expect(findDocker(s.tree, 'd3')!.tabs).toEqual(['chords', 'sets', 'voicings']);
    expect(findDocker(s.tree, 'd3')!.active).toBe('sets');
  });
  it('falls back to the docker name when the id is gone (removed and recreated)', () => {
    let s = closePanel(A(), 'sets');
    s = removeDocker(s, 'd3');
    expect(resolvePlace(s, 'sets').via).toBe('first');
    // A docker named "tools" appears again with a different id.
    const made = splitDocker(s, 'd2', 'right', { name: 'tools' })!;
    s = made.workspace;
    const r = resolvePlace(s, 'sets');
    expect(r.via).toBe('name');
    expect(r.docker!.id).toBe(made.docker.id);
    s = openPanel(s, 'sets');
    expect(dockerHolding(s.tree, 'sets')!.id).toBe(made.docker.id);
  });
  it('falls back to the panel home, then the default docker, then the first docker', () => {
    let s = closePanel(A(), 'sets');
    s = removeDocker(s, 'd3');
    expect(resolvePlace(s, 'sets', 'Detail')).toMatchObject({ via: 'home', docker: { id: 'd2' } });
    expect(resolvePlace(s, 'sets', 'Nowhere').via).toBe('first');
    const withDefault: Workspace = { ...s, defaultDocker: 'd2' };
    expect(resolvePlace(withDefault, 'sets', 'Nowhere')).toMatchObject({
      via: 'default',
      docker: { id: 'd2' },
    });
    expect(resolvePlace(withDefault, 'never-seen')).toMatchObject({ via: 'default' });
    s = openPanel(withDefault, 'sets', { home: 'Nowhere' });
    expect(dockerHolding(s.tree, 'sets')!.id).toBe('d2');
  });
  it('opening a panel with a stale index clamps and a closed panel in an empty docker joins it', () => {
    let s = workspace(structuredClone(arrangementC));
    s = sendTo(s, 'desk', { kind: 'docker', docker: 'd3' });
    s = closePanel(s, 'desk');
    s = openPanel(s, 'desk');
    expect(findDocker(s.tree, 'd3')!.tabs).toEqual(['desk']);
    expect(findDocker(s.tree, 'd3')!.active).toBe('desk');
  });
  it('opening an open panel only activates it; with no docker at all a root docker is made', () => {
    const s = A();
    expect(openPanel(s, 'chords')).toBe(s);
    // An already open panel records no place (it did not move).
    expect(openPanel(s, 'sets').lastDocker).toBe(s.lastDocker);
    expect(findDocker(openPanel(s, 'sets').tree, 'd3')!.active).toBe('sets');
    const bare = {
      ...s,
      tree: { kind: 'split', dir: 'row', children: [] },
    } as unknown as Workspace;
    const made = openPanel(bare, 'canvas', { rootName: 'Main' });
    expect(made.tree).toMatchObject({ kind: 'docker', name: 'Main', tabs: ['canvas'] });
  });
  it('a closed panel with no recorded place opens in its home docker', () => {
    const s = openPanel(A(), 'visualizer', { home: 'Tools' });
    expect(findDocker(s.tree, 'd3')!.tabs.at(-1)).toBe('visualizer');
  });
});

describe('dockers', () => {
  it('an emptied docker persists; only removeDocker deletes it', () => {
    let s = closePanel(A(), 'canvas');
    expect(treeDockers(s.tree)).toHaveLength(3);
    expect(findDocker(s.tree, 'd1')!.tabs).toEqual([]);
    s = removeDocker(s, 'd1');
    expect(treeDockers(s.tree).map((d) => d.id)).toEqual(['d2', 'd3']);
    // The split collapsed to a row (no one-child splits).
    expect(s.tree).toMatchObject({ kind: 'split', dir: 'row' });
  });
  it('removing a docker closes its tabs and remembers their places; the last docker stays', () => {
    let s = removeDocker(A(), 'd3');
    expect(s.lastDocker.sets).toEqual({ docker: 'd3', name: 'Tools', index: 1 });
    expect(sortedPanels(s)).toEqual(['canvas', 'data-block-editor']);
    s = removeDocker(s, 'd2');
    expect(removeDocker(s, 'd1')).toBe(s);
    const keep = A();
    expect(removeDocker(keep, 'nope')).toBe(keep);
  });
  it('renames keeping the unique-name rule and follows places', () => {
    const s = closePanel(A(), 'sets');
    expect(renameDocker(s, 'd3', 'Tools')).toBe(s);
    expect(renameDocker(s, 'd3', 'DETAIL')).toBe(s);
    expect(renameDocker(s, 'd3', '   ')).toBe(s);
    const r = renameDocker(s, 'd3', 'Library');
    expect(findDocker(r.tree, 'd3')!.name).toBe('Library');
    expect(r.lastDocker.sets.name).toBe('Library');
    // Renaming a docker to its own name with other case is allowed.
    expect(findDocker(renameDocker(s, 'd3', 'TOOLS').tree, 'd3')!.name).toBe('TOOLS');
  });
  it('collapses and sizes', () => {
    const c = setCollapsed(A(), 'd3', true);
    expect(c.collapsed).toEqual(['d3']);
    expect(setCollapsed(c, 'd3', false).collapsed).toBeUndefined();
    const flex = setDockerSizing(A(), 'd3', { weight: 2 });
    const row = (flex.tree as { children: { node: TreeNode }[] }).children[1].node as {
      children: { rem?: number; weight?: number }[];
    };
    expect(row.children[1]).toMatchObject({ weight: 2 });
    expect(row.children[1].rem).toBeUndefined();
  });
  it('reconcile closes unknown panels and drops their places, keeping dockers', () => {
    let s = closePanel(A(), 'sets');
    s = reconcile(s, new Set(['canvas', 'chords']));
    expect(sortedPanels(s)).toEqual(['canvas', 'chords']);
    expect(Object.keys(s.lastDocker)).not.toContain('sets');
    expect(treeDockers(s.tree)).toHaveLength(3);
    expect(reconcile(s, new Set(['canvas', 'chords']))).toBe(s);
  });
});

describe('resizeSplit with minimums', () => {
  const row = (): Workspace =>
    workspace({
      kind: 'split',
      dir: 'row',
      children: [
        { weight: 1, node: makeDocker('a', 'A', ['canvas']) },
        { weight: 1, node: makeDocker('b', 'B', ['desk']) },
        { rem: 20, node: makeDocker('c', 'C', ['sets']) },
      ],
    });
  it('moves a weight pair, keeping the pair total and each minimum', () => {
    // length 80: gaps 1, avail 79, fixed 20, so a and b share 59 (29.5 each).
    const s = resizeSplit(row(), [], 0, 40, 80);
    const k = (s.tree as { children: { weight?: number }[] }).children;
    expect(k[0].weight! + k[1].weight!).toBeCloseTo(2, 5);
    expect(k[0].weight! / k[1].weight!).toBeCloseTo(40 / 19, 3);
    // Far past the limit: b keeps its minimum (12).
    const t = resizeSplit(row(), [], 0, 500, 80);
    const kt = (t.tree as { children: { weight?: number }[] }).children;
    expect((kt[1].weight! / (kt[0].weight! + kt[1].weight!)) * 59).toBeCloseTo(12, 3);
    const u = resizeSplit(row(), [], 0, 0, 80);
    const ku = (u.tree as { children: { weight?: number }[] }).children;
    expect((ku[0].weight! / (ku[0].weight! + ku[1].weight!)) * 59).toBeCloseTo(12, 3);
  });
  it('sets rem on a fixed child and re-weights the weighted side so the other flexible siblings keep their size', () => {
    const before = splitChildSizes(row().tree as Split, 80);
    const s = resizeSplit(row(), [], 1, 30, 80);
    const k = (s.tree as Split).children;
    expect(k[2].rem).toBeCloseTo(19.5, 3);
    const after = splitChildSizes(s.tree as Split, 80);
    expect(after[0]).toBeCloseTo(before[0], 2);
    expect(after[1]).toBeCloseTo(30, 2);
    expect(after[2]).toBeCloseTo(19.5, 2);
    const t = resizeSplit(row(), [], 1, 25, 80);
    const at = splitChildSizes(t.tree as Split, 80);
    expect(at[0]).toBeCloseTo(before[0], 2);
    expect(at[1]).toBeCloseTo(25, 2);
    // Fixed first, weighted second.
    const u = workspace({
      kind: 'split',
      dir: 'row',
      children: [
        { rem: 20, node: makeDocker('c', 'C', ['sets']) },
        { weight: 1, node: makeDocker('a', 'A', ['canvas']) },
        { weight: 1, node: makeDocker('b', 'B', ['desk']) },
      ],
    });
    const bu = splitChildSizes(u.tree as Split, 80);
    const v = resizeSplit(u, [], 0, 30, 80);
    const av = splitChildSizes(v.tree as Split, 80);
    expect(av[0]).toBeCloseTo(30, 2);
    expect(av[2]).toBeCloseTo(bu[2], 2);
    expect(resizeSplit(row(), [], 1, 29.5, 80).tree).toStrictEqual(row().tree);
    const r = row();
    expect(resizeSplit(r, [9], 0, 30, 80)).toBe(r);
    expect(resizeSplit(r, [], 5, 30, 80)).toBe(r);
  });
  it('is refused when the minimums do not fit', () => {
    const r = row();
    expect(resizeSplit(r, [], 0, 20, 40)).toBe(r);
  });
});
