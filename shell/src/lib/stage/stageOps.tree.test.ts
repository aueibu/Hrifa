import { describe, expect, it } from 'vitest';
import { createStageRegistry } from '../../components/Stage/registry';
import { dockerMinOf, guardedTree, treeMinProblems } from '../../components/Stage/stageOps';
import { meta, registry, screenset } from './fixtures';
import { sendTo } from './ops';
import { makeDocker } from './tree';

const wide = createStageRegistry([
  {
    ...meta('wide', { minSize: { width: 'regular', height: 'short' } }),
    render: () => null,
  },
  { ...meta('small'), home: 'Tools', multiple: true, keepMounted: true, render: () => null },
]);

describe('stageOps tree rules', () => {
  it('reads a docker minimum from its active panel', () => {
    const minOf = dockerMinOf(wide.meta);
    expect(minOf(makeDocker('a', 'A', ['wide']))).toEqual({ width: 30, height: 6 });
    expect(minOf(makeDocker('a', 'A', ['small']))).toEqual({ width: 12, height: 6 });
    expect(minOf(makeDocker('a', 'A', []))).toEqual({ width: 12, height: 6 });
  });

  it('refuses a change that leaves an open docker below its minimum, allows one already broken', () => {
    const prev = screenset({
      kind: 'split',
      dir: 'row',
      children: [
        { weight: 1, node: makeDocker('a', 'A', ['small']) },
        { weight: 1, node: makeDocker('b', 'B', ['small']) },
        { weight: 1, node: makeDocker('c', 'C', []) },
      ],
    });
    // Moving the wide panel (min 30) into the 20-rem-wide dockers breaks its minimum.
    const withWide = { ...prev, lastDocker: {} };
    const next = sendTo(withWide, 'wide', { kind: 'docker', docker: 'a' });
    // Even with the others collapsed to strips the wide panel does not fit 20 rem: refused.
    expect(treeMinProblems(next, wide.meta, 20, 20, 'a')).toContain('w:a');
    expect(guardedTree(prev, next, wide.meta, 20, 20, 'a')).toBe(prev);
    // At 40 rem it fits once the narrow rule collapses a neighbour: that alone is not a reason to refuse.
    expect(treeMinProblems(next, wide.meta, 40, 20)).toEqual([]);
    expect(guardedTree(prev, next, wide.meta, 40, 20)).toBe(next);
    // Roomy enough: allowed.
    expect(guardedTree(prev, next, wide.meta, 120, 20)).toBe(next);
    // Unmeasured: nothing can be judged.
    expect(guardedTree(prev, next, wide.meta, 0, 0)).toBe(next);
    // The same problem already in `prev` does not block.
    expect(guardedTree(next, { ...next, name: 'renamed' }, wide.meta, 20, 20, 'a').name).toBe(
      'renamed'
    );
  });

  it('createStageRegistry passes the new meta fields through and the old shape is unchanged', () => {
    expect(wide.meta.get('small')).toMatchObject({
      home: 'Tools',
      multiple: true,
      keepMounted: true,
    });
    expect(Object.keys(wide.meta.get('wide')!).sort()).toEqual(['id', 'minSize', 'sizes', 'title']);
    expect(registry.get('clip-editor')!.home).toBe('Detail');
  });
});
