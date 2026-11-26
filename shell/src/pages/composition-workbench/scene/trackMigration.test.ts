import { describe, expect, it } from 'vitest';
import type { StoredDataBlock } from '../dataBlocks/registry';
import { collectionBlock, objectBlock, sceneBlock, withLegacyLane } from './sceneTestHelpers';
import { collectionDataOf, objectDataOf, trackDataOf } from './sceneTypes';
import { migrateTracks } from './trackMigration';

const byId = (blocks: StoredDataBlock[], id: string) => blocks.find((block) => block.id === id);
const members = (blocks: StoredDataBlock[], id: string) =>
  collectionDataOf(byId(blocks, id))?.memberRefs.map((ref) => ref.id);

/** The scene 11 shape: Piano holds three objects, two of them on stored lane 1. */
function pianoScene(): StoredDataBlock[] {
  return [
    sceneBlock('scene', 'root'),
    collectionBlock('root', ['piano'], {}, 'Root'),
    collectionBlock('piano', ['a', 'b', 'c'], {}, 'Piano'),
    objectBlock('a', { start: 0 }),
    withLegacyLane(objectBlock('b', { start: 2 }), 1),
    withLegacyLane(objectBlock('c', { start: 3 }), 1),
  ];
}

describe('migrateTracks', () => {
  it('turns a collection of three objects into one Track named after it (scenario 11)', () => {
    const before = pianoScene();
    const after = migrateTracks(before);
    const track = byId(after, 'piano:track');
    expect(track?.typeId).toBe('track');
    expect(track?.name).toBe('Piano');
    expect(track?.createdAt).toBe(byId(before, 'piano')?.createdAt);
    expect(track?.schemaVersion).toBe(byId(before, 'piano')?.schemaVersion);
    expect(trackDataOf(track)).toEqual({ mute: false });
    expect(members(after, 'piano')).toEqual(['piano:track']);
    for (const id of ['a', 'b', 'c']) {
      const data = objectDataOf(byId(after, id));
      expect(data?.trackRef).toEqual({ id: 'piano:track' });
      expect('lane' in (data as object)).toBe(false);
    }
    expect(objectDataOf(byId(after, 'b'))?.timeSpan).toEqual(
      objectDataOf(byId(before, 'b'))?.timeSpan
    );
    expect(members(after, 'root')).toEqual(['piano']);
  });

  it('keeps a sub-collection in its place; the Track takes the first object place', () => {
    const blocks = [
      collectionBlock('top', ['sub', 'a', 'b'], {}, 'Top'),
      collectionBlock('sub', [], {}, 'Sub'),
      objectBlock('a'),
      objectBlock('b'),
    ];
    expect(members(migrateTracks(blocks), 'top')).toEqual(['sub', 'top:track']);
    const mixed = [
      collectionBlock('top', ['a', 'sub', 'b'], {}, 'Top'),
      collectionBlock('sub', [], {}, 'Sub'),
      objectBlock('a'),
      objectBlock('b'),
    ];
    expect(members(migrateTracks(mixed), 'top')).toEqual(['top:track', 'sub']);
  });

  it('gives an object listed twice to the first collection only', () => {
    const blocks = [
      collectionBlock('one', ['a'], {}, 'One'),
      collectionBlock('two', ['a', 'b'], {}, 'Two'),
      objectBlock('a'),
      objectBlock('b'),
    ];
    const after = migrateTracks(blocks);
    expect(members(after, 'one')).toEqual(['one:track']);
    expect(members(after, 'two')).toEqual(['two:track']);
    expect(objectDataOf(byId(after, 'a'))?.trackRef).toEqual({ id: 'one:track' });
    expect(objectDataOf(byId(after, 'b'))?.trackRef).toEqual({ id: 'two:track' });
  });

  it('makes no Track for a collection left with no objects', () => {
    const blocks = [
      collectionBlock('one', ['a'], {}, 'One'),
      collectionBlock('two', ['a'], {}, 'Two'),
      objectBlock('a'),
    ];
    const after = migrateTracks(blocks);
    expect(members(after, 'two')).toEqual([]);
    expect(byId(after, 'two:track')).toBeUndefined();
    expect(byId(after, 'one:track')).toBeDefined();
  });

  it('leaves a collection with no objects, and an object in no collection, alone', () => {
    const blocks = [
      collectionBlock('only-sub', ['sub'], {}, 'Only'),
      collectionBlock('sub', [], {}, 'Sub'),
      withLegacyLane(objectBlock('loose'), 2),
    ];
    expect(migrateTracks(blocks)).toBe(blocks);
  });

  it('migrates the root collection like any other', () => {
    const blocks = [
      sceneBlock('scene', 'root'),
      collectionBlock('root', ['a'], {}, 'Root'),
      objectBlock('a'),
    ];
    const after = migrateTracks(blocks);
    expect(members(after, 'root')).toEqual(['root:track']);
    expect(byId(after, 'root:track')?.name).toBe('Root');
  });

  it('leaves an object that already holds a trackRef untouched', () => {
    const placed = withLegacyLane(objectBlock('a', { trackRef: { id: 'elsewhere' } }), 3);
    const blocks = [collectionBlock('c', ['a'], {}, 'C'), placed];
    const after = migrateTracks(blocks);
    expect(after).toBe(blocks);
    expect(after[1]).toBe(placed);
  });

  it('is idempotent: a second run returns the same array', () => {
    const once = migrateTracks(pianoScene());
    const twice = migrateTracks(once);
    expect(twice).toBe(once);
    expect(twice).toEqual(once);
  });

  it('keeps the identity of entries that need nothing', () => {
    const before = pianoScene();
    const after = migrateTracks(before);
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
  });
});
