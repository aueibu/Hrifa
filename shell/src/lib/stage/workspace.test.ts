import { describe, expect, it } from 'vitest';
import { arrangementA, arrangementB, arrangementC, registry, workspace } from './fixtures';
import { setActive } from './ops';
import { makeDocker, makeWorkspace, makeStore, treeDockers, type TreeNode } from './tree';
import { parseWorkspace, parseWorkspaceStore, serializeWorkspaceStore } from './workspace';

const fallback = makeStore([
  makeWorkspace({ id: 'default', name: 'Default', tree: makeDocker('d1', 'Main') }),
]);
const config = { fallback };

const depth = (n: TreeNode): number =>
  n.kind === 'docker' ? 1 : 1 + Math.max(...n.children.map((c) => depth(c.node)));

describe('workspace store: parse and serialise', () => {
  it('builds, serialises and parses back the three target arrangements', () => {
    const store = makeStore(
      [workspace(arrangementA, 'a'), workspace(arrangementB, 'b'), workspace(arrangementC, 'c')],
      'b'
    );
    const back = parseWorkspaceStore(serializeWorkspaceStore(store), registry, config);
    expect(back).toEqual(store);
    expect(back.order).toEqual(['a', 'b', 'c']);
    // The empty Tools docker of (c) persists through the round trip.
    const tools = treeDockers(back.workspaces.c.tree).find((d) => d.name === 'Tools')!;
    expect(tools.tabs).toEqual([]);
    expect(tools.active).toBeNull();
  });

  it('keeps active tabs, remembered places, collapsed and default docker', () => {
    let a = workspace(arrangementA, 'a');
    a = setActive(a, 'd3', 'voicings');
    a = {
      ...a,
      lastDocker: { desk: { docker: 'd1', name: 'Canvas', index: 1 } },
      collapsed: ['d3'],
      defaultDocker: 'd2',
    };
    const back = parseWorkspaceStore(serializeWorkspaceStore(makeStore([a])), registry, config);
    expect(back.workspaces.a).toEqual(a);
    expect(treeDockers(back.workspaces.a.tree).find((d) => d.id === 'd3')!.active).toBe('voicings');
  });

  it('drops unknown panel ids and repeats and repairs the active tab', () => {
    const raw = {
      version: 1,
      active: 's',
      order: ['s'],
      workspaces: {
        s: {
          version: 1,
          id: 's',
          name: 'S',
          tree: {
            kind: 'split',
            dir: 'row',
            children: [
              {
                weight: 1,
                node: {
                  kind: 'docker',
                  id: 'd1',
                  name: 'A',
                  tabs: ['canvas', 'nope', 'canvas'],
                  active: 'nope',
                },
              },
              {
                weight: 1,
                node: {
                  kind: 'docker',
                  id: 'd2',
                  name: 'B',
                  tabs: ['canvas', 'desk'],
                  active: 'desk',
                },
              },
            ],
          },
          lastDocker: {
            canvas: { docker: 'd1', name: 'A', index: 0 },
            ghost: { docker: 'd1', name: 'A', index: 0 },
          },
        },
      },
    };
    const s = parseWorkspaceStore(JSON.stringify(raw), registry, config).workspaces.s;
    const [a, b] = treeDockers(s.tree);
    expect(a.tabs).toEqual(['canvas']);
    expect(a.active).toBe('canvas');
    expect(b.tabs).toEqual(['desk']);
    expect(Object.keys(s.lastDocker)).toEqual(['canvas']);
  });

  it('dedupes docker ids and names and repairs bad sizes', () => {
    const raw = {
      version: 1,
      id: 's',
      name: 'S',
      tree: {
        kind: 'split',
        dir: 'row',
        children: [
          { rem: -3, node: { kind: 'docker', id: 'd1', name: 'Same', tabs: ['canvas'] } },
          {
            weight: 'x',
            min: 'y',
            node: { kind: 'docker', id: 'd1', name: 'same', tabs: ['desk'] },
          },
        ],
      },
    };
    const s = parseWorkspace(raw, registry, 's')!;
    const ds = treeDockers(s.tree);
    expect(new Set(ds.map((d) => d.id)).size).toBe(2);
    expect(new Set(ds.map((d) => d.name.toLowerCase())).size).toBe(2);
    const kids = (s.tree as { children: { rem?: number; weight?: number; min?: number }[] })
      .children;
    expect(
      kids.every((c) => c.rem === undefined && c.weight === undefined && c.min === undefined)
    ).toBe(true);
  });

  it('a bad active falls back to the first workspace and the order is rebuilt', () => {
    const store = makeStore([workspace(arrangementA, 'a'), workspace(arrangementB, 'b')]);
    const back = parseWorkspaceStore(
      JSON.stringify({ ...store, active: 'zzz', order: ['b'] }),
      registry,
      config
    );
    expect(back.order).toEqual(['b', 'a']);
    expect(back.active).toBe('b');
  });

  it('caps depth by flattening into one docker without losing panels', () => {
    let node: unknown = { kind: 'docker', id: 'dz', name: 'Deep', tabs: ['desk'] };
    for (let i = 0; i < 9; i++) {
      node = {
        kind: 'split',
        dir: i % 2 ? 'row' : 'column',
        children: [
          {
            weight: 1,
            node: { kind: 'docker', id: `x${i}`, name: `X${i}`, tabs: i === 0 ? ['canvas'] : [] },
          },
          { weight: 1, node },
        ],
      };
    }
    const s = parseWorkspace({ version: 1, id: 's', name: 's', tree: node }, registry, 's')!;
    expect(depth(s.tree)).toBeLessThanOrEqual(6);
    expect(
      treeDockers(s.tree)
        .flatMap((d) => d.tabs)
        .sort()
    ).toEqual(['canvas', 'desk']);
  });

  it('rejects an object with columns but no tree, and checks the store version', () => {
    expect(
      parseWorkspaceStore(
        JSON.stringify({ version: 1, columns: [{ slots: ['canvas'] }] }),
        registry,
        config
      )
    ).toBe(fallback);
    const store = makeStore([workspace(arrangementA, 'a')]);
    expect(parseWorkspaceStore(JSON.stringify({ ...store, version: 7 }), registry, config)).toBe(
      fallback
    );
  });

  it('never throws on garbage and falls back', () => {
    const garbage: unknown[] = [
      null,
      undefined,
      '',
      '{',
      'null',
      '[]',
      '"str"',
      '5',
      {},
      { workspaces: 5 },
      { workspaces: { a: 5, b: null, c: { version: 1, tree: 5 } } },
      { version: 1, tree: { kind: 'split', dir: 'diag', children: [] } },
    ];
    for (const g of garbage) {
      const raw = typeof g === 'string' || g == null ? g : JSON.stringify(g);
      expect(parseWorkspaceStore(raw, registry, config)).toBe(fallback);
    }
    const cyc: Record<string, unknown> = {};
    cyc.self = cyc;
    expect(() => parseWorkspaceStore(cyc, registry, config)).not.toThrow();
  });
});
