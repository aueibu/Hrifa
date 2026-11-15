import { describe, expect, it } from 'vitest';
import {
  SPLIT_MAX_DEPTH,
  dockerHolding,
  isDocker,
  makeDocker,
  treeDepth,
  treeDockers,
  type DockerState,
  type TreeNode,
} from '../../../lib/stage';
import { arrangementA, arrangementB, arrangementC, screenset } from '../../../lib/stage/fixtures';
import {
  dropTarget,
  layoutTree,
  sendToRoot,
  type DockRect,
  type DockerPlacement,
  type DropInput,
  type TabStripGeometry,
} from './dockLayout';

describe('layoutTree', () => {
  it('lays arrangement (b) out as three dockers and two splitters that tile the box', () => {
    const g = layoutTree(screenset(arrangementB), 100, 40);
    const [a, b, c] = g.dockers;
    expect([a.x, a.width]).toEqual([0, 20]);
    expect([b.x, b.width]).toEqual([20.5, 55]);
    expect([c.x, c.width]).toEqual([76, 24]);
    expect(g.dockers.every((d) => d.y === 0 && d.height === 40)).toBe(true);
    expect(g.splitters.map((s) => [s.x, s.width, s.dir])).toEqual([
      [20, 0.5, 'row'],
      [75.5, 0.5, 'row'],
    ]);
    expect(g.dockers.map((d) => d.parentDir)).toEqual(['row', 'row', 'row']);
  });

  it('lays arrangement (a) out as a top docker over a bottom row, with splitter bounds', () => {
    const g = layoutTree(screenset(arrangementA), 100, 50);
    const [top, left, right] = g.dockers;
    expect(top.docker.name).toBe('Canvas');
    expect(top.y).toBe(0);
    expect(left.y).toBe(right.y);
    expect(left.y).toBeGreaterThan(top.height);
    expect(right.width).toBe(30);
    const outer = g.splitters.find((s) => s.dir === 'column')!;
    expect(outer.path).toEqual([]);
    expect(outer.length).toBe(50);
    expect(outer.now).toBeGreaterThanOrEqual(outer.min);
    expect(outer.now).toBeLessThanOrEqual(outer.max);
    expect(outer.before).toBe('Canvas');
    expect(outer.after).toBe('Detail');
  });

  it('reports empty dockers as strips and a collapsed docker as collapsed', () => {
    const g = layoutTree({ tree: arrangementC, collapsed: ['d1'] }, 100, 50);
    expect(g.dockers.find((d) => d.docker.id === 'd3')?.state).toBe('empty');
    const d1 = g.dockers.find((d) => d.docker.id === 'd1')!;
    expect(d1.state).toBe('collapsed');
    expect(d1.height).toBe(1.5);
  });
});

const overlaps = (a: DockRect, b: DockRect) =>
  a.x < b.x + b.width - 1e-6 &&
  b.x < a.x + a.width - 1e-6 &&
  a.y < b.y + b.height - 1e-6 &&
  b.y < a.y + a.height - 1e-6;

describe('layoutTree: nothing covers a splitter', () => {
  const cases = [
    ['a (column over a row)', arrangementA],
    ['b (row of three)', arrangementB],
    ['c (column over a row, one empty)', arrangementC],
  ] as const;
  for (const [name, tree] of cases) {
    it(`no docker rectangle intersects a splitter, and every splitter has an area: ${name}`, () => {
      for (const [w, h] of [
        [100, 50],
        [40, 20],
        [20, 10],
      ]) {
        const g = layoutTree(screenset(tree), w, h);
        expect(g.splitters.length).toBeGreaterThan(0);
        for (const s of g.splitters) {
          expect(s.width).toBeGreaterThan(0);
          expect(s.height).toBeGreaterThan(0);
          // a row split's bar is thin across the row and as tall as the split; a column split's is the reverse
          expect(s.dir === 'row' ? s.width : s.height).toBe(0.5);
          for (const d of g.dockers) {
            expect(overlaps(d, s)).toBe(false);
          }
        }
      }
    });
  }
});

describe('dropTarget', () => {
  const place = (
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    tabs: string[],
    state: DockerState = 'open'
  ): DockerPlacement => ({
    x,
    y,
    width,
    height,
    docker: makeDocker(id, id.toUpperCase(), tabs),
    state,
  });
  // 100 x 40: a (0..20, one tab), b (20.5..75.5, one tab), c (76..100, three tabs)
  const dockers = [
    place('a', 0, 0, 20, 40, ['sets']),
    place('b', 20.5, 0, 55, 40, ['canvas']),
    place('c', 76, 0, 24, 40, ['x', 'y', 'z']),
  ];
  const stage = { width: 100, height: 40 };
  const at = (x: number, y: number, over: Partial<DropInput> = {}) =>
    dropTarget({ dockers, stage, panel: 'sets', point: { x, y }, ...over });
  const rectOf = (id: string): DockRect => {
    const { x, y, width, height } = dockers.find((d) => d.docker.id === id)!;
    return { x, y, width, height };
  };

  it('joins as the last tab in the centre of another docker and previews the whole docker', () => {
    const r = at(48, 20)!;
    expect(r.target).toEqual({ kind: 'docker', docker: 'b', index: undefined });
    expect(r.zone).toBe('center');
    expect(r.preview).toMatchObject(rectOf('b'));
    expect(r.noop).toBe(false);
  });

  it('splits on each edge band with the half of the docker as the preview', () => {
    const b = rectOf('b');
    const left = at(22, 20)!;
    expect(left.target).toEqual({ kind: 'split', beside: 'b', edge: 'left' });
    expect(left.preview).toEqual({ x: b.x, y: 0, width: 27.5, height: 40 });
    const right = at(74, 20)!;
    expect(right.target).toEqual({ kind: 'split', beside: 'b', edge: 'right' });
    expect(right.preview.x).toBe(b.x + 27.5);
    expect(at(48, 3)!.target).toEqual({ kind: 'split', beside: 'b', edge: 'top' });
    const bottom = at(48, 37)!;
    expect(bottom.target).toEqual({ kind: 'split', beside: 'b', edge: 'bottom' });
    expect(bottom.preview).toEqual({ x: b.x, y: 20, width: 55, height: 20 });
  });

  it('puts the band edge at a quarter of the smaller side (here 10 rem) and the centre beyond it', () => {
    expect(at(20.5 + 9.9, 20)!.zone).toBe('left');
    expect(at(20.5 + 10.1, 20)!.zone).toBe('center');
    expect(at(48, 9.9)!.zone).toBe('top');
    expect(at(48, 10.1)!.zone).toBe('center');
  });

  it('takes the nearest edge in a corner', () => {
    expect(at(22, 3)!.zone).toBe('left'); // 1.5 from the left, 3 from the top
    expect(at(25, 1.2)!.zone).toBe('top');
  });

  it('keeps a minimum band of 1.5 rem on a small docker', () => {
    // 26 x 14: band = max(1.5, 3.5) = 3.5; both axes fit (12.75 >= 12, 6.75 >= 6)
    const small = [place('s', 0, 0, 26, 14, ['p']), place('t', 26.5, 0, 30, 14, ['q'])];
    const f = (x: number, y: number) =>
      dropTarget({
        dockers: small,
        stage: { width: 60, height: 14 },
        panel: 'q',
        point: { x, y },
      })!;
    expect(f(1, 7).zone).toBe('left');
    expect(f(13, 7).zone).toBe('center');
    // a wide, short docker: only left and right fit (minHeight 6), the band is max(1.5, 0.25 * 2) = 1.5
    const big = [place('s', 0, 0, 100, 2, ['p']), place('t', 100.5, 0, 30, 14, ['q'])];
    const g = (x: number) =>
      dropTarget({
        dockers: big,
        stage: { width: 131, height: 14 },
        panel: 'q',
        point: { x, y: 1 },
        minWidth: 12,
        minHeight: 6,
      })!;
    expect(g(1.4).zone).toBe('left');
    expect(g(1.6).zone).toBe('center');
  });

  it('offers the centre only on a docker too small to split on an edge', () => {
    const tiny = [place('s', 0, 0, 20, 10, ['p']), place('t', 20.5, 0, 20, 10, ['q'])];
    // width 20: (20 - 0.5) / 2 = 9.75 < 12, height 10: 4.75 < 6: no edge fits
    for (const [x, y] of [
      [2, 5],
      [10, 3],
      [10, 8],
      [18, 5],
    ]) {
      const r = dropTarget({
        dockers: tiny,
        stage: { width: 41, height: 10 },
        panel: 'q',
        point: { x, y },
        minWidth: 12,
        minHeight: 6,
      })!;
      expect(r.zone).toBe('center');
      expect(r.target).toEqual({ kind: 'docker', docker: 's', index: undefined });
    }
  });

  it('allows only the axis that fits', () => {
    const wide = [place('w', 0, 0, 40, 10, ['p']), place('v', 40.5, 0, 30, 10, ['q'])];
    const f = (x: number, y: number) =>
      dropTarget({
        dockers: wide,
        stage: { width: 71, height: 10 },
        panel: 'q',
        point: { x, y },
        minWidth: 12,
        minHeight: 6,
      })!;
    expect(f(2, 5).zone).toBe('left');
    expect(f(20, 1.2).zone).toBe('center'); // top does not fit: 10 rem high
  });

  it('accepts a centre drop only on empty, collapsed and narrow-hidden strips', () => {
    for (const state of ['empty', 'collapsed', 'narrow'] as const) {
      const ds = [place('a', 0, 0, 30, 40, ['sets']), place('e', 30.5, 0, 69.5, 40, [], state)];
      const r = dropTarget({ dockers: ds, stage, panel: 'sets', point: { x: 32, y: 2 } })!;
      expect(r.zone).toBe('center');
      expect(r.target).toEqual({ kind: 'docker', docker: 'e', index: undefined });
      expect(r.preview).toMatchObject({ x: 30.5, width: 69.5 });
    }
  });

  it('makes a same-docker centre drop (or an edge of a lone-tab docker) do nothing', () => {
    const own = at(10, 20)!; // sets over its own docker a
    expect(own.noop).toBe(true);
    expect(own.zone).toBe('center'); // a single tab cannot split off its own docker
    expect(at(1.5, 20)!.zone).toBe('center');
    // with several tabs an edge of its own docker splits
    const multi = at(77.5, 20, { panel: 'y', minWidth: 10 })!;
    expect(multi.target).toEqual({ kind: 'split', beside: 'c', edge: 'left' });
    expect(multi.noop).toBe(false);
  });

  describe('tab strip', () => {
    const tabs = (xs: number[]): DockRect[] => xs.map((x) => ({ x, y: 0, width: 6, height: 2 }));
    const strips = new Map<string, TabStripGeometry>([
      ['c', { strip: { x: 76, y: 0, width: 24, height: 2 }, tabs: tabs([77, 83, 89]) }],
      ['b', { strip: { x: 20.5, y: 0, width: 55, height: 2 }, tabs: tabs([21.5]) }],
      ['a', { strip: { x: 0, y: 0, width: 20, height: 2 }, tabs: [] }],
    ]);
    const onStrip = (x: number, panel: string) =>
      dropTarget({ dockers, stage, strips, panel, point: { x, y: 1 } })!;

    it('takes the insertion index from the tab midpoints', () => {
      expect(onStrip(78, 'sets').target).toEqual({ kind: 'docker', docker: 'c', index: 0 });
      expect(onStrip(81, 'sets').zone).toBe('tabs');
      expect(onStrip(81, 'sets').target).toMatchObject({ index: 1 });
      expect(onStrip(87, 'sets').target).toMatchObject({ index: 2 });
      expect(onStrip(99, 'sets').target).toMatchObject({ index: 3 });
    });

    it('previews a thin insertion mark on the strip', () => {
      const m = onStrip(81, 'sets').preview;
      expect(m.x).toBeCloseTo(83 - 0.0625);
      expect(m.height).toBe(2);
      expect(m.width).toBeLessThan(0.5);
      expect(onStrip(99, 'sets').preview.x).toBeCloseTo(95 - 0.0625);
    });

    it('wins over the top edge band, and an empty tab list inserts at 0', () => {
      expect(onStrip(50, 'sets').zone).toBe('tabs');
      expect(onStrip(50, 'sets').target).toMatchObject({ docker: 'b', index: 1 });
      expect(
        dropTarget({ dockers, stage, strips, panel: 'x', point: { x: 5, y: 1.2 } })!.target
      ).toMatchObject({ docker: 'a', index: 0 });
    });

    it('counts the index without the dragged tab for a same-docker move', () => {
      // dragging y (own index 1): before x -> 0; next to its own place -> noop; after z -> 2
      expect(onStrip(78, 'y').target).toMatchObject({ index: 0 });
      expect(onStrip(78, 'y').noop).toBe(false);
      expect(onStrip(81, 'y').noop).toBe(true);
      expect(onStrip(87, 'y').noop).toBe(true);
      const last = onStrip(99, 'y');
      expect(last.target).toMatchObject({ index: 2 });
      expect(last.noop).toBe(false);
      expect(onStrip(99, 'z').noop).toBe(true);
    });
  });

  describe('Stage root band', () => {
    it('splits at the root on the nearest outer edge (1 rem band)', () => {
      const l = at(0.5, 20)!;
      expect(l.target).toEqual({ kind: 'root', edge: 'left' });
      expect(l.zone).toBe('root-left');
      expect(l.docker).toBeUndefined();
      expect(l.preview).toEqual({ x: 0, y: 0, width: 25, height: 40 });
      expect(at(99.5, 20)!.target).toEqual({ kind: 'root', edge: 'right' });
      const bottom = at(50, 39.5)!;
      expect(bottom.target).toEqual({ kind: 'root', edge: 'bottom' });
      expect(bottom.preview).toEqual({ x: 0, y: 30, width: 100, height: 10 });
      expect(at(50, 0.2)!.target).toEqual({ kind: 'root', edge: 'top' });
      expect(at(0.8, 0.3)!.target).toEqual({ kind: 'root', edge: 'top' }); // corner: nearest
      expect(at(1.01, 20)!.zone).not.toBe('root-left');
    });

    it('never covers a tab strip: a top-row or left-column strip keeps its tab insertion', () => {
      const tabs = (xs: number[]): DockRect[] => xs.map((x) => ({ x, y: 0, width: 6, height: 2 }));
      const strips = new Map<string, TabStripGeometry>([
        ['a', { strip: { x: 0, y: 0, width: 20, height: 2 }, tabs: tabs([1, 7]) }],
        ['b', { strip: { x: 20.5, y: 0, width: 55, height: 2 }, tabs: tabs([21.5]) }],
      ]);
      const top = dropTarget({
        dockers,
        stage,
        strips,
        panel: 'canvas',
        point: { x: 50, y: 0.5 },
      })!;
      expect(top.zone).toBe('tabs');
      expect(top.target).toMatchObject({ docker: 'b' });
      const left = dropTarget({
        dockers,
        stage,
        strips,
        panel: 'canvas',
        point: { x: 0.5, y: 1 },
      })!;
      expect(left.zone).toBe('tabs');
      expect(left.target).toMatchObject({ docker: 'a', index: 0 });
      // below the strip the band still applies
      expect(
        dropTarget({ dockers, stage, strips, panel: 'canvas', point: { x: 0.5, y: 20 } })!.zone
      ).toBe('root-left');
    });

    it('never covers a docker that is only a strip (collapsed, empty, narrow)', () => {
      const ds = [
        place('e', 0, 0, 3, 40, [], 'collapsed'),
        place('b', 3.5, 0, 96.5, 40, ['canvas']),
      ];
      const r = dropTarget({ dockers: ds, stage, panel: 'canvas', point: { x: 0.5, y: 20 } })!;
      expect(r.zone).toBe('center');
      expect(r.target).toEqual({ kind: 'docker', docker: 'e', index: undefined });
    });

    it('is not offered when the dragged panel is the only tab of the only docker', () => {
      const lone = [place('a', 0, 0, 100, 40, ['sets'])];
      const r = dropTarget({ dockers: lone, stage, panel: 'sets', point: { x: 0.5, y: 20 } })!;
      expect(r.zone).toBe('center');
      expect(r.noop).toBe(true);
    });
  });

  it('gives no target outside the Stage or over a splitter gap', () => {
    expect(at(-1, 5)).toBeNull();
    expect(at(5, -0.1)).toBeNull();
    expect(at(100, 5)).toBeNull();
    expect(at(50, 40)).toBeNull();
    expect(at(Number.NaN, 5)).toBeNull();
    expect(at(20.25, 20)).toBeNull(); // between a and b
  });
});

describe('sendToRoot', () => {
  const s = () => screenset(arrangementA);
  it('wraps the whole tree with a new docker holding the panel, on each edge', () => {
    for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
      const before = s();
      const next = sendToRoot(before, 'chords', edge);
      expect(next).not.toBe(before);
      const made = dockerHolding(next.tree, 'chords')!;
      expect(made.tabs).toEqual(['chords']);
      expect(treeDockers(next.tree)).toHaveLength(4);
      const root = next.tree as {
        kind: 'split';
        dir: string;
        children: { node: { id?: string } }[];
      };
      expect(root.dir).toBe(edge === 'left' || edge === 'right' ? 'row' : 'column');
      const end = edge === 'left' || edge === 'top' ? 0 : root.children.length - 1;
      expect(root.children[end].node.id).toBe(made.id);
      // the source docker keeps its other tabs; the place is remembered
      expect(dockerHolding(next.tree, 'sets')?.tabs).toEqual(['sets', 'voicings']);
      expect(next.lastDocker.chords?.docker).toBe(made.id);
    }
  });

  const without = (n: TreeNode, panel: string): TreeNode => {
    if (isDocker(n)) {
      if (!n.tabs.includes(panel)) {
        return n;
      }
      const at = n.tabs.indexOf(panel);
      const tabs = n.tabs.filter((x) => x !== panel);
      const active = n.active === panel ? (tabs[Math.min(at, tabs.length - 1)] ?? null) : n.active;
      return { ...n, tabs, active };
    }
    return { ...n, children: n.children.map((c) => ({ ...c, node: without(c.node, panel) })) };
  };

  it('never resizes or reorders an existing docker (rem, weights, ids, order), on every edge and arrangement', () => {
    const cases: [string, TreeNode, string][] = [
      ['a', arrangementA, 'chords'],
      ['b', arrangementB, 'sets'], // the lone tab of Library: it stays as an empty strip
      ['c', arrangementC, 'canvas'],
    ];
    for (const [, tree, panel] of cases) {
      for (const edge of ['left', 'right', 'top', 'bottom'] as const) {
        const before = screenset(tree);
        const next = sendToRoot(before, panel, edge);
        expect(next).not.toBe(before);
        const root = next.tree as { kind: 'split'; dir: string; children: { node: TreeNode }[] };
        const first = edge === 'left' || edge === 'top';
        const rest = root.children[first ? 1 : 0].node;
        // the whole original tree, only the panel removed from its docker: every slot untouched
        expect(rest).toEqual(without(before.tree, panel));
        const slotOf = root.children[first ? 1 : 0] as { weight?: number; rem?: number };
        expect(slotOf.weight).toBe(3);
        const created = root.children[first ? 0 : 1].node as { id: string; tabs: string[] };
        expect(created.tabs).toEqual([panel]);
        // the panel is in exactly one docker
        const holders = treeDockers(next.tree).filter((d) => d.tabs.includes(panel));
        expect(holders.map((d) => d.id)).toEqual([created.id]);
        expect(
          treeDockers(next.tree)
            .map((d) => d.id)
            .filter((id) => id !== created.id)
        ).toEqual(treeDockers(before.tree).map((d) => d.id));
        expect(next.lastDocker[panel]).toMatchObject({ docker: created.id, index: 0 });
      }
    }
  });

  it('refuses at the depth limit', () => {
    let tree: TreeNode = makeDocker('d0', 'D0', ['p', 'q']);
    let n = 1;
    while (treeDepth(tree) < SPLIT_MAX_DEPTH) {
      tree = {
        kind: 'split',
        dir: n % 2 ? 'row' : 'column',
        children: [
          { weight: 1, node: tree },
          { weight: 1, node: makeDocker(`d${n}`, `D${n}`, [`x${n}`]) },
        ],
      };
      n += 1;
    }
    const deep = screenset(tree);
    expect(sendToRoot(deep, 'p', 'left')).toBe(deep);
  });

  it('does nothing when the panel is the only tab of the only docker', () => {
    const lone = screenset(makeDocker('a', 'A', ['p']));
    expect(sendToRoot(lone, 'p', 'left')).toBe(lone);
  });
});
