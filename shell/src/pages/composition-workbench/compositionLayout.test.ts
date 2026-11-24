import { describe, expect, it } from 'vitest';
import { NODE_WIDTH, nextFreePosition, tidyLayout } from './compositionLayout';
import {
  acceptsCompositionInstances,
  migrateCompositionInstances,
  type CompositionNodeInstance,
} from './compositionWorkspace';

const at = (id: string, x = 0, y = 0): CompositionNodeInstance => ({
  id,
  nodeId: 'pitch-list',
  x,
  y,
});

describe('tidyLayout', () => {
  it('puts every node below the nodes that feed it', () => {
    const positions = tidyLayout(
      [at('mel'), at('rhythm'), at('pitch'), at('mix')],
      [
        { from: 'rhythm', to: 'mel' },
        { from: 'pitch', to: 'mel' },
        { from: 'mel', to: 'mix' },
      ]
    );
    expect(positions.rhythm.y).toBe(positions.pitch.y);
    expect(positions.mel.y).toBeGreaterThan(positions.rhythm.y);
    expect(positions.mix.y).toBeGreaterThan(positions.mel.y);
  });

  it('uses the deepest source for layering and centres a lone node under its sources', () => {
    const positions = tidyLayout(
      [at('a'), at('b'), at('c'), at('d')],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
        { from: 'a', to: 'c' },
        { from: 'a', to: 'd' },
      ]
    );
    expect(positions.c.y).toBeGreaterThan(positions.b.y);
    expect(positions.d.y).toBe(positions.b.y);
  });

  it('orders a layer by where its sources sit so cables do not cross', () => {
    const positions = tidyLayout(
      [at('left'), at('right'), at('fromRight'), at('fromLeft')],
      [
        { from: 'left', to: 'fromLeft' },
        { from: 'right', to: 'fromRight' },
      ]
    );
    expect(positions.fromLeft.x).toBeLessThan(positions.fromRight.x);
  });

  it('survives a cycle and ignores unknown or self connections', () => {
    const positions = tidyLayout(
      [at('a'), at('b')],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
        { from: 'a', to: 'a' },
        { from: 'ghost', to: 'a' },
      ]
    );
    expect(Object.keys(positions).sort()).toEqual(['a', 'b']);
  });

  it('returns nothing for an empty canvas', () => {
    expect(tidyLayout([], [])).toEqual({});
  });
});

describe('nextFreePosition', () => {
  it('starts at the origin and never lands on an existing node', () => {
    expect(nextFreePosition([])).toEqual({ x: 0, y: 0 });
    const placed = nextFreePosition([at('a', 0, 0)]);
    expect(placed.x).toBeGreaterThanOrEqual(NODE_WIDTH);
    expect(placed.y).toBe(0);
  });

  it('wraps to a new row once a row is full', () => {
    const row = [0, 1, 2, 3].map((column) => at(`m${column}`, column * 200, 0));
    expect(nextFreePosition(row).y).toBeGreaterThan(0);
  });
});

describe('migrateCompositionInstances', () => {
  it('passes entries without canvas coordinates through unchanged', () => {
    const entries = [{ id: 'a', nodeId: 'pitch-list', laneId: 1, row: 1 }];
    const migrated = migrateCompositionInstances(entries);
    expect(migrated).toEqual(entries);
    expect(acceptsCompositionInstances(migrated)).toBe(false);
  });

  it('leaves canvas placements alone and drops stale lane fields', () => {
    expect(
      migrateCompositionInstances([{ id: 'a', nodeId: 'mixer', x: 12, y: 34, laneId: 2, row: 1 }])
    ).toEqual([{ id: 'a', nodeId: 'mixer', x: 12, y: 34 }]);
  });

  it('keeps the data-block a data-block node points at, and rejects a non-string one', () => {
    const saved = [
      { id: 's', nodeId: 'data-block-source', x: 1, y: 2, dataBlockId: 'data-block-abc' },
    ];
    expect(migrateCompositionInstances(saved)).toEqual(saved);
    expect(acceptsCompositionInstances(migrateCompositionInstances(saved))).toBe(true);
    expect(acceptsCompositionInstances([{ ...saved[0], dataBlockId: 7 }])).toBe(false);
  });

  it('accepts a blank data-block node (no data-block chosen) as a saved instance', () => {
    const blank: CompositionNodeInstance = {
      ...at('blank-source'),
      nodeId: 'data-block-source',
    };
    expect(blank.dataBlockId).toBeUndefined();
    expect(acceptsCompositionInstances([blank])).toBe(true);
  });

  it('rejects a placement with neither shape', () => {
    expect(
      acceptsCompositionInstances(migrateCompositionInstances([{ id: 'a', nodeId: 'mixer' }]))
    ).toBe(false);
  });
});
