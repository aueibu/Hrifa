import { describe, expect, it } from 'vitest';
import { arrangementA, arrangementB, arrangementC } from './fixtures';
import { DOCKER_STRIP_REM, SPLITTER_REM, nodeMin, solveTree, splitChildSizes } from './solve';
import { makeDocker, type Docker, type Split, type TreeNode } from './tree';

const row = (...children: Split['children']): Split => ({ kind: 'split', dir: 'row', children });
const col = (...children: Split['children']): Split => ({ kind: 'split', dir: 'column', children });
const d = (id: string, tabs: string[] = [id]) => makeDocker(id, id, tabs);

describe('solveTree', () => {
  it('gives fixed children their rem and flexible ones the rest by weight', () => {
    const boxes = solveTree(arrangementB, 100, 40);
    const w = (id: string) => boxes.get(id)!.width;
    expect(w('d1')).toBe(20);
    expect(w('d3')).toBe(24);
    expect(w('d2')).toBeCloseTo(100 - 20 - 24 - 2 * SPLITTER_REM, 3);
    expect(boxes.get('d2')!.height).toBe(40);
  });

  it('nests: weights along columns, rem along rows (arrangement a)', () => {
    const boxes = solveTree(arrangementA, 100, 60);
    const top = boxes.get('d1')!;
    const avail = 60 - SPLITTER_REM;
    expect(top.height).toBeCloseTo((avail * 0.55) / 1, 3);
    expect(top.width).toBe(100);
    expect(boxes.get('d3')!.width).toBe(30);
    expect(boxes.get('d2')!.width).toBeCloseTo(100 - 30 - SPLITTER_REM, 3);
    expect(boxes.get('d2')!.height).toBeCloseTo(avail * 0.45, 3);
  });

  it('an empty docker is a strip along the split axis and releases the space', () => {
    const boxes = solveTree(arrangementC, 100, 60);
    expect(boxes.get('d3')!.state).toBe('empty');
    expect(boxes.get('d3')!.width).toBe(DOCKER_STRIP_REM);
    expect(boxes.get('d2')!.width).toBeCloseTo(100 - DOCKER_STRIP_REM - SPLITTER_REM, 3);
  });

  it('a collapsed docker is a strip too', () => {
    const boxes = solveTree(arrangementB, 100, 40, { collapsed: ['d1'] });
    expect(boxes.get('d1')).toMatchObject({ width: DOCKER_STRIP_REM, state: 'collapsed' });
  });

  it('respects per-docker minimums from the active panel', () => {
    const minOf = (dk: Docker) =>
      dk.active === 'wide' ? { width: 40, height: 6 } : { width: 12, height: 6 };
    const t = row({ weight: 1, node: d('wide') }, { weight: 3, node: d('other') });
    const boxes = solveTree(t, 80, 30, { minOf });
    // 79.5 shared 1:3 would give 19.9 to 'wide'; its minimum of 40 wins.
    expect(boxes.get('wide')!.width).toBe(40);
    expect(boxes.get('other')!.width).toBeCloseTo(80 - 40 - SPLITTER_REM, 3);
  });

  it('a fixed docker is raised to its minimum, and Child.min raises a slot', () => {
    const minOf = () => ({ width: 25, height: 6 });
    const t = row({ rem: 14, node: d('a') }, { weight: 1, node: d('b') });
    expect(solveTree(t, 100, 30, { minOf }).get('a')!.width).toBe(25);
    const u = row({ weight: 1, min: 50, node: d('a') }, { weight: 1, node: d('b') });
    expect(solveTree(u, 100, 30).get('a')!.width).toBe(50);
    expect(solveTree(u, 100, 30).get('b')!.width).toBeCloseTo(49.5, 3);
  });

  it('derives a split minimum: sum plus splitters along its axis, the largest across', () => {
    const t = row(
      { weight: 1, node: d('a') },
      { weight: 1, node: col({ node: d('b') }, { node: d('c') }) }
    );
    expect(nodeMin(t, 'width')).toBe(12 + SPLITTER_REM + 12);
    expect(nodeMin(t, 'height')).toBe(6 + SPLITTER_REM + 6);
  });

  it('narrow rule: collapses from the far end to strips, never the selected docker', () => {
    const t = row(
      { weight: 1, node: d('a') },
      { weight: 1, node: d('b') },
      { weight: 1, node: d('c') }
    );
    const boxes = solveTree(t, 20, 20);
    expect(boxes.get('a')!.state).toBe('open');
    expect(boxes.get('b')!.state).toBe('narrow');
    expect(boxes.get('c')!.state).toBe('narrow');
    expect(boxes.get('b')!.width).toBe(DOCKER_STRIP_REM);
    const sel = solveTree(t, 20, 20, { selected: 'c' });
    expect(sel.get('c')!.state).toBe('open');
    expect(sel.get('b')!.state).toBe('narrow');
    expect(sel.get('a')!.state).toBe('narrow');
  });

  it('never overflows: the sizes always fit the length', () => {
    for (const len of [4, 10, 20, 33, 50, 100]) {
      const t: Split = row(
        { rem: 40, node: d('a') },
        { rem: 40, node: d('b') },
        { weight: 1, node: d('c') }
      );
      const sizes = splitChildSizes(t, len);
      const total = sizes.reduce((a, b) => a + b, 0) + SPLITTER_REM * 2;
      expect(total).toBeLessThanOrEqual(
        Math.max(len, 3 * DOCKER_STRIP_REM + 2 * SPLITTER_REM) + 1e-3
      );
    }
  });

  it('with no flexible child the last open one fills', () => {
    const t = row({ rem: 20, node: d('a') }, { rem: 20, node: d('b') });
    const boxes = solveTree(t, 80, 10);
    expect(boxes.get('a')!.width).toBe(20);
    expect(boxes.get('b')!.width).toBeCloseTo(80 - 20 - SPLITTER_REM, 3);
  });

  it('tolerates bad input sizes', () => {
    const boxes = solveTree(arrangementB, Number.NaN, -5);
    expect([...boxes.values()].every((b) => b.width >= 0 && b.height >= 0)).toBe(true);
  });
});

describe('solve does not mutate', () => {
  it('leaves the tree untouched', () => {
    const t: TreeNode = structuredClone(arrangementA);
    const before = JSON.stringify(t);
    solveTree(t, 80, 40);
    expect(JSON.stringify(t)).toBe(before);
  });
});
