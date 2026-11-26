import { describe, expect, it } from 'vitest';
import { outlinerRows } from './outlinerRows';
import {
  claveBlock,
  collectionBlock,
  objectBlock,
  sceneBlock,
  trackBlock,
} from './sceneTestHelpers';

describe('outlinerRows', () => {
  it('lists Tracks between a Collection and its objects, in the Collection order (scenario 7)', () => {
    const blocks = [
      sceneBlock('s', 'root'),
      collectionBlock('root', ['t', 'g', 'a']),
      collectionBlock('g', ['t2']),
      trackBlock('t'),
      trackBlock('t2'),
      objectBlock('a', { trackRef: { id: 't' } }, 'Bass'),
    ];
    const rows = outlinerRows(blocks, 's');
    expect(rows.map((row) => [row.name, row.kind, row.depth])).toEqual([
      ['t', 'track', 0],
      ['Bass', 'object', 1],
      ['g', 'collection', 0],
      ['t2', 'track', 1],
    ]);
    // The root also lists 'a' directly (an old shape): the Track row holds it, so it shows once.
    expect(rows[0].hasChildren).toBe(true);
  });

  it('nests a child under its parent on the same Track, shows data, orders by start time', () => {
    const on = { trackRef: { id: 't' } };
    const blocks = [
      claveBlock(),
      sceneBlock('s', 'root'),
      collectionBlock('root', ['g']),
      collectionBlock('g', ['t']),
      trackBlock('t', false, 'RH'),
      objectBlock('late', { ...on, start: 8 }, 'Late'),
      objectBlock('a', { ...on, primaryDataRef: { id: 'clave' }, start: 0 }, 'Bass'),
      objectBlock('b', { ...on, parentRef: { id: 'a' }, start: 1 }, 'Fill'),
    ];
    const rows = outlinerRows(blocks, 's');
    expect(rows.map((row) => [row.name, row.kind, row.depth])).toEqual([
      ['g', 'collection', 0],
      ['RH', 'track', 1],
      ['Bass', 'object', 2],
      ['Fill', 'object', 3],
      ['Late', 'object', 2],
    ]);
    expect(rows[2]).toMatchObject({ data: 'Clave', hasChildren: true, childOf: null });
    expect(rows[3].parentRowId).toBe('a');
    expect(rows[1].parentRowId).toBe('g');
  });

  it('scenario 9: a child whose parent is on another Track stays at its Track level with a child-of mark', () => {
    const blocks = [
      sceneBlock('s', 'root'),
      collectionBlock('root', ['rh', 'lh']),
      trackBlock('rh', false, 'RH'),
      trackBlock('lh', false, 'LH'),
      objectBlock('theme', { trackRef: { id: 'rh' } }, 'Theme A'),
      objectBlock('chords', { trackRef: { id: 'lh' }, parentRef: { id: 'theme' } }, 'Chord stack'),
    ];
    const rows = outlinerRows(blocks, 's');
    expect(rows.map((row) => [row.name, row.depth])).toEqual([
      ['RH', 0],
      ['Theme A', 1],
      ['LH', 0],
      ['Chord stack', 1],
    ]);
    expect(rows[3].childOf).toEqual({ id: 'theme', name: 'Theme A' });
    expect(rows[3].parentRowId).toBe('lh');
    expect(rows[1].childOf).toBeNull();
    expect(rows[1].hasChildren).toBe(false);
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
