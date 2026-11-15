import { describe, expect, it } from 'vitest';
import { arrangementA, arrangementB, arrangementC, screenset } from '../../../lib/stage/fixtures';
import { layoutTree } from './dockLayout';

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
