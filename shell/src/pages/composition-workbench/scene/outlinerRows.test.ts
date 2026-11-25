import { describe, expect, it } from 'vitest';
import { outlinerRows } from './outlinerRows';
import { claveBlock, collectionBlock, objectBlock, sceneBlock, stripOf } from './sceneTestHelpers';

describe('outlinerRows', () => {
  it('hides the root, nests a child under its parent in the same collection, and shows data', () => {
    const blocks = [
      claveBlock(),
      sceneBlock('s', 'root'),
      collectionBlock('root', ['a', 'b', 'g']),
      collectionBlock('g', ['c']),
      objectBlock('a', { primaryDataRef: { id: 'clave' } }, 'Bass'),
      objectBlock('b', { parentRef: { id: 'a' } }, 'Fill'),
      objectBlock('c', { parentRef: { id: 'a' } }, 'Elsewhere'),
    ];
    const rows = outlinerRows(blocks, 's');
    expect(rows.map((row) => [row.name, row.depth])).toEqual([
      ['Bass', 0],
      ['Fill', 1],
      ['g', 0],
      ['Elsewhere', 1],
    ]);
    expect(rows[0]).toMatchObject({ data: 'Clave', hasChildren: true, kind: 'object' });
    expect(rows[1].parentRowId).toBe('a');
    expect(rows[2]).toMatchObject({ kind: 'collection', hasChildren: true });
    expect(rows[3].data).toBe('');
  });

  it('an object with several strips is ONE row; nesting and data follow its first strip', () => {
    const blocks = [
      claveBlock(),
      sceneBlock('s', 'root'),
      collectionBlock('root', ['a', 'b']),
      objectBlock('a', { strips: [stripOf({ id: 'x' })] }, 'Parent'),
      objectBlock(
        'b',
        {
          strips: [
            {
              ...stripOf({ id: 'y', dataRef: { id: 'clave' } }),
              parentStrip: { objectId: 'a', stripId: 'x' },
            },
            stripOf({ id: 'z', start: 8 }),
          ],
        },
        'Kid'
      ),
    ];
    const rows = outlinerRows(blocks, 's');
    expect(rows.map((row) => [row.name, row.depth, row.data])).toEqual([
      ['Parent', 0, ''],
      ['Kid', 1, 'Clave'],
    ]);
  });

  it('an object with no strips is a plain silent row', () => {
    const blocks = [
      sceneBlock('s', 'root'),
      collectionBlock('root', ['a']),
      objectBlock('a', { strips: [] }, 'Empty'),
    ];
    expect(outlinerRows(blocks, 's')).toMatchObject([{ name: 'Empty', depth: 0, data: '' }]);
  });

  it('shows inherited mute separately from the own flag', () => {
    const blocks = [
      sceneBlock('s', 'root'),
      collectionBlock('root', ['g']),
      collectionBlock('g', ['a'], { mute: true }),
      objectBlock('a'),
    ];
    const rows = outlinerRows(blocks, 's');
    expect(rows[0]).toMatchObject({ mute: true, muted: true, inheritedMute: false });
    expect(rows[1]).toMatchObject({ mute: false, muted: true, inheritedMute: true });
  });

  it('does not hang on a parent cycle, a self parent or a block listed twice', () => {
    const blocks = [
      sceneBlock('s', 'root'),
      collectionBlock('root', ['a', 'b', 'a', 'x', 'g']),
      collectionBlock('g', ['g', 'a']),
      objectBlock('a', { parentRef: { id: 'b' } }),
      objectBlock('b', { parentRef: { id: 'a' } }),
      objectBlock('x', { parentRef: { id: 'x' } }),
    ];
    const rows = outlinerRows(blocks, 's');
    expect(rows.map((row) => row.id).sort()).toEqual(['a', 'b', 'g', 'x']);
  });

  it('returns nothing for a missing scene or a scene with no root', () => {
    expect(outlinerRows([], 'nope')).toEqual([]);
    expect(outlinerRows([sceneBlock('s', null)], 's')).toEqual([]);
  });
});
