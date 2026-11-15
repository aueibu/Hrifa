import { describe, expect, it } from 'vitest';
import { arrangementA, arrangementB, arrangementC, registry, screenset } from './fixtures';
import { setActive } from './ops';
import { parseScreenset, parseScreensetStore, serializeScreensetStore } from './screenset';
import { makeDocker, makeScreenset, makeStore, treeDockers, type TreeNode } from './tree';

const fallback = makeStore([
  makeScreenset({ id: 'default', name: 'Default', tree: makeDocker('d1', 'Main') }),
]);
const config = { fallback };

const depth = (n: TreeNode): number =>
  n.kind === 'docker' ? 1 : 1 + Math.max(...n.children.map((c) => depth(c.node)));

describe('screenset store: parse and serialise', () => {
  it('builds, serialises and parses back the three target arrangements', () => {
    const store = makeStore(
      [screenset(arrangementA, 'a'), screenset(arrangementB, 'b'), screenset(arrangementC, 'c')],
      'b'
    );
    const back = parseScreensetStore(serializeScreensetStore(store), registry, config);
    expect(back).toEqual(store);
    expect(back.order).toEqual(['a', 'b', 'c']);
    // The empty Tools docker of (c) persists through the round trip.
    const tools = treeDockers(back.screensets.c.tree).find((d) => d.name === 'Tools')!;
    expect(tools.tabs).toEqual([]);
    expect(tools.active).toBeNull();
  });

  it('keeps active tabs, remembered places, collapsed and default docker', () => {
    let a = screenset(arrangementA, 'a');
    a = setActive(a, 'd3', 'voicings');
    a = {
      ...a,
      lastDocker: { desk: { docker: 'd1', name: 'Canvas', index: 1 } },
      collapsed: ['d3'],
      defaultDocker: 'd2',
    };
    const back = parseScreensetStore(serializeScreensetStore(makeStore([a])), registry, config);
    expect(back.screensets.a).toEqual(a);
    expect(treeDockers(back.screensets.a.tree).find((d) => d.id === 'd3')!.active).toBe('voicings');
  });

  it('drops unknown panel ids and repeats and repairs the active tab', () => {
    const raw = {
      version: 1,
      active: 's',
      order: ['s'],
      screensets: {
        s: {
          version: 2,
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
    const s = parseScreensetStore(JSON.stringify(raw), registry, config).screensets.s;
    const [a, b] = treeDockers(s.tree);
    expect(a.tabs).toEqual(['canvas']);
    expect(a.active).toBe('canvas');
    expect(b.tabs).toEqual(['desk']);
    expect(Object.keys(s.lastDocker)).toEqual(['canvas']);
  });

  it('dedupes docker ids and names and repairs bad sizes', () => {
    const raw = {
      version: 2,
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
    const s = parseScreenset(raw, registry, 's')!;
    const ds = treeDockers(s.tree);
    expect(new Set(ds.map((d) => d.id)).size).toBe(2);
    expect(new Set(ds.map((d) => d.name.toLowerCase())).size).toBe(2);
    const kids = (s.tree as { children: { rem?: number; weight?: number; min?: number }[] })
      .children;
    expect(
      kids.every((c) => c.rem === undefined && c.weight === undefined && c.min === undefined)
    ).toBe(true);
  });

  it('a bad active falls back to the first screenset and the order is rebuilt', () => {
    const store = makeStore([screenset(arrangementA, 'a'), screenset(arrangementB, 'b')]);
    const back = parseScreensetStore(
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
    const s = parseScreenset({ version: 2, id: 's', name: 's', tree: node }, registry, 's')!;
    expect(depth(s.tree)).toBeLessThanOrEqual(6);
    expect(
      treeDockers(s.tree)
        .flatMap((d) => d.tabs)
        .sort()
    ).toEqual(['canvas', 'desk']);
  });

  it('migrates a version-1 layout, bare or inside a store', () => {
    const v1 = { version: 1, columns: [{ slots: ['canvas'], width: 40 }, { slots: ['desk'] }] };
    const bare = parseScreensetStore(JSON.stringify(v1), registry, config);
    expect(bare.order).toEqual(['main']);
    expect(bare.screensets.main.tree).toMatchObject({ kind: 'split', dir: 'row' });
    const inStore = parseScreensetStore(
      JSON.stringify({ version: 1, active: 'old', order: ['old'], screensets: { old: v1 } }),
      registry,
      config
    );
    expect(inStore.screensets.old.id).toBe('old');
    expect(treeDockers(inStore.screensets.old.tree).map((d) => d.tabs[0])).toEqual([
      'canvas',
      'desk',
    ]);
  });

  it('renames ids before dropping unknown ones when migrating a v1 layout', () => {
    const reg = new Set(['clip-editor', 'chords']);
    const v1 = {
      version: 1,
      columns: [
        { slots: ['roll'], width: 40 },
        { slots: ['chords'], width: 28 },
      ],
    };
    const store = parseScreensetStore(JSON.stringify(v1), reg, {
      fallback,
      migrate: { rename: { roll: 'clip-editor' } },
    });
    expect(treeDockers(store.screensets.main.tree).flatMap((d) => d.tabs)).toEqual([
      'clip-editor',
      'chords',
    ]);
    expect(Object.keys(store.screensets.main.lastDocker).sort()).toEqual(['chords', 'clip-editor']);
    // Without the rename the unknown 'roll' is dropped.
    const plain = parseScreensetStore(JSON.stringify(v1), reg, { fallback });
    expect(treeDockers(plain.screensets.main.tree).flatMap((d) => d.tabs)).toEqual(['chords']);
  });

  it('does not treat a newer object with columns but no tree as v1, and checks the store version', () => {
    expect(
      parseScreensetStore(
        JSON.stringify({ version: 2, columns: [{ slots: ['canvas'] }] }),
        registry,
        config
      )
    ).toBe(fallback);
    const store = makeStore([screenset(arrangementA, 'a')]);
    expect(parseScreensetStore(JSON.stringify({ ...store, version: 7 }), registry, config)).toBe(
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
      { screensets: 5 },
      { screensets: { a: 5, b: null, c: { version: 2, tree: 5 } } },
      { version: 1, columns: 'x' },
      { version: 1, columns: [{ slots: ['nope'] }] },
      { version: 2, tree: { kind: 'split', dir: 'diag', children: [] } },
    ];
    for (const g of garbage) {
      const raw = typeof g === 'string' || g == null ? g : JSON.stringify(g);
      expect(parseScreensetStore(raw, registry, config)).toBe(fallback);
    }
    const cyc: Record<string, unknown> = {};
    cyc.self = cyc;
    expect(() => parseScreensetStore(cyc, registry, config)).not.toThrow();
  });
});
