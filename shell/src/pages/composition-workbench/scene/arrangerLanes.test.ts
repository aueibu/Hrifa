import { describe, expect, it } from 'vitest';
import { rational, rationalFromNumber } from '../musicalTime';
import { arrangerLanes, assignSubLanes, touchingPairs } from './arrangerLanes';
import { collectionBlock, objectBlock, sceneBlock, trackBlock } from './sceneTestHelpers';

describe('arrangerLanes with Track blocks', () => {
  it('ignores a Track listed in a collection (no lane object, no throw)', () => {
    const blocks = [
      sceneBlock('s', 'root'),
      collectionBlock('root', ['t', 'a']),
      trackBlock('t'),
      objectBlock('a', { trackRef: { id: 't' } }),
    ];
    const lanes = arrangerLanes(blocks, 's');
    expect(lanes).toHaveLength(1);
    expect(lanes[0].objects.map((object) => object.id)).toEqual(['a']);
  });
});

const span = (id: string, start: number, end: number) => ({
  id,
  start: rationalFromNumber(start),
  end: rationalFromNumber(end),
});

describe('assignSubLanes', () => {
  it('puts overlapping objects on different sub-lanes and reuses a freed one', () => {
    const { subLaneOf, count } = assignSubLanes([
      span('a', 0, 8),
      span('b', 4, 12),
      span('c', 8, 10),
    ]);
    expect(subLaneOf.get('a')).toBe(0);
    expect(subLaneOf.get('b')).toBe(1);
    // a ends at 8, exactly where c starts: touching is not overlap, so c reuses sub-lane 0.
    expect(subLaneOf.get('c')).toBe(0);
    expect(count).toBe(2);
  });

  it('keeps touching objects on one sub-lane', () => {
    const { subLaneOf, count } = assignSubLanes([span('a', 4, 8), span('b', 8, 16)]);
    expect([subLaneOf.get('a'), subLaneOf.get('b')]).toEqual([0, 0]);
    expect(count).toBe(1);
  });

  it('is stable for equal starts: the earlier in the list takes the lower sub-lane', () => {
    const { subLaneOf } = assignSubLanes([span('x', 0, 4), span('y', 0, 4), span('z', 0, 4)]);
    expect([subLaneOf.get('x'), subLaneOf.get('y'), subLaneOf.get('z')]).toEqual([0, 1, 2]);
  });

  it('an empty lane still has one sub-lane', () => {
    expect(assignSubLanes([]).count).toBe(1);
  });
});

describe('arrangerLanes', () => {
  const blocks = [
    sceneBlock('scene', 'root'),
    collectionBlock('root', ['parent', 'child', 'after', 'group'], {}, 'Main'),
    objectBlock('parent', { start: 4, duration: 8 }, 'Parent'),
    objectBlock('child', { parentRef: { id: 'parent' }, start: 2, duration: 2 }, 'Child'),
    objectBlock('after', { start: 12, duration: 4, mute: true }, 'After'),
    collectionBlock('group', ['inner', 'sub'], {}, 'Group'),
    collectionBlock('sub', [], {}, 'Empty lane'),
    objectBlock('inner', { start: 0, duration: 4 }, 'Inner'),
  ];

  it('lists the root first, then each collection with its depth; an empty collection gets a lane', () => {
    const lanes = arrangerLanes(blocks, 'scene');
    expect(lanes.map((lane) => [lane.name, lane.depth])).toEqual([
      ['Main', 0],
      ['Group', 1],
      ['Empty lane', 2],
    ]);
    const empty = lanes[2];
    expect(empty.objects).toEqual([]);
    expect(empty.subLanes).toBe(1);
  });

  it('draws a parent and its child (which overlap by design) on different sub-lanes', () => {
    const [main] = arrangerLanes(blocks, 'scene');
    const byId = new Map(main.objects.map((object) => [object.id, object]));
    expect(byId.get('parent')?.subLane).toBe(0);
    // Child: world 6 to 8, inside the parent's 4 to 12.
    expect(byId.get('child')?.subLane).toBe(1);
    // After: 12 to 16 starts where the parent ends, so it goes back to sub-lane 0.
    expect(byId.get('after')?.subLane).toBe(0);
    expect(byId.get('after')?.mute).toBe(true);
    expect(main.subLanes).toBe(2);
  });

  it('puts an object on the lane of the collection that lists it, with its world span', () => {
    const lanes = arrangerLanes(blocks, 'scene');
    const group = lanes[1];
    expect(group.objects.map((object) => object.id)).toEqual(['inner']);
    expect(group.objects[0].start).toEqual(rational(0));
    expect(group.objects[0].end).toEqual(rational(4));
  });

  it('finds touching pairs only on one sub-lane', () => {
    const [main] = arrangerLanes(blocks, 'scene');
    // Parent ends at 12 where After starts: they touch. The child is on another sub-lane.
    expect(touchingPairs(main)).toEqual([{ leftId: 'parent', rightId: 'after' }]);
  });

  it('is empty without a scene root', () => {
    expect(arrangerLanes([sceneBlock('scene', null)], 'scene')).toEqual([]);
  });
});
