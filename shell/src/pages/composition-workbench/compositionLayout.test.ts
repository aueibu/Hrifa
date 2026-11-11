import { describe, expect, it } from 'vitest';
import { NODE_WIDTH, nextFreePosition, tidyLayout } from './compositionLayout';
import {
  acceptsCompositionInstances,
  isAddableModule,
  migrateCompositionInstances,
  type CompositionModuleInstance,
} from './compositionWorkspace';

const at = (id: string, x = 0, y = 0): CompositionModuleInstance => ({
  id,
  moduleId: 'pitch-list',
  x,
  y,
});

describe('tidyLayout', () => {
  it('puts every module below the modules that feed it', () => {
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

  it('uses the deepest source for layering and centres a lone module under its sources', () => {
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
  it('starts at the origin and never lands on an existing module', () => {
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
  it('converts lane and row placements to canvas coordinates', () => {
    const migrated = migrateCompositionInstances([
      { id: 'a', moduleId: 'pitch-list', laneId: 1, row: 1 },
      { id: 'b', moduleId: 'melodicization', laneId: 3, row: 2 },
    ]);
    expect(acceptsCompositionInstances(migrated)).toBe(true);
    expect(migrated).toEqual([
      { id: 'a', moduleId: 'pitch-list', x: 0, y: 0 },
      { id: 'b', moduleId: 'melodicization', x: 400, y: 170 },
    ]);
  });

  it('leaves canvas placements alone and drops stale lane fields', () => {
    expect(
      migrateCompositionInstances([{ id: 'a', moduleId: 'mixer', x: 12, y: 34, laneId: 2, row: 1 }])
    ).toEqual([{ id: 'a', moduleId: 'mixer', x: 12, y: 34 }]);
  });

  it('keeps the snippet a snippet module points at, and rejects a non-string one', () => {
    const saved = [{ id: 's', moduleId: 'snippet', x: 1, y: 2, snippetId: 'snippet-abc' }];
    expect(migrateCompositionInstances(saved)).toEqual(saved);
    expect(acceptsCompositionInstances(migrateCompositionInstances(saved))).toBe(true);
    expect(acceptsCompositionInstances([{ ...saved[0], snippetId: 7 }])).toBe(false);
  });

  it('keeps a snippet module out of the Add module menu', () => {
    expect(isAddableModule('snippet')).toBe(false);
    expect(isAddableModule('mixer')).toBe(true);
  });

  it('rejects a placement with neither shape', () => {
    expect(
      acceptsCompositionInstances(migrateCompositionInstances([{ id: 'a', moduleId: 'mixer' }]))
    ).toBe(false);
  });
});
