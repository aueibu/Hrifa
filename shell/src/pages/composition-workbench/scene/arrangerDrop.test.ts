import { describe, expect, it } from 'vitest';
import { rationalFromNumber, rationalToNumber } from '../musicalTime';
import { applyDrop, dropLanding, laneAtY } from './arrangerDrop';
import { resizeSharedEdge, type SceneOpResult } from './sceneOps';
import { collectionBlock, objectBlock, sceneBlock } from './sceneTestHelpers';
import { collectionDataOf, objectDataOf } from './sceneTypes';

const q = rationalFromNumber;

function blocks() {
  return [
    sceneBlock('scene', 'root'),
    collectionBlock('root', ['a', 'b', 'c'], {}, 'Main'),
    collectionBlock('other', ['x'], {}, 'Other'),
    objectBlock('a', { start: 4, duration: 4 }, 'A'),
    objectBlock('b', { start: 8, duration: 8 }, 'B'),
    objectBlock('c', { start: 20, duration: 4 }, 'C'),
    objectBlock('x', { start: 10, duration: 4 }, 'X'),
  ];
}

function ok(result: SceneOpResult) {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result;
}

const startOf = (result: SceneOpResult, id: string) => {
  const list = ok(result).blocks;
  return rationalToNumber(objectDataOf(list.find((block) => block.id === id))!.timeSpan.start);
};

describe('a body drag released (W-77)', () => {
  it('lands exactly where dropped when that is free: 4 to 8 dragged to start 16 gives 16 to 20', () => {
    expect(startOf(applyDrop(blocks(), 'a', 'root', 'root', q(16)), 'a')).toBe(16);
  });

  it('dropped at 17 (over the object at 20 to 24) it also lands at 16 to 20, the nearest free slot', () => {
    expect(startOf(applyDrop(blocks(), 'a', 'root', 'root', q(17)), 'a')).toBe(16);
  });

  it('ties go to the earlier slot', () => {
    // P is 6 to 10; M (length 2) dropped at 7 is 3 from 4 to 6 and 3 from 10 to 12: the earlier wins.
    const list = [
      sceneBlock('scene', 'root'),
      collectionBlock('root', ['p', 'm']),
      objectBlock('p', { start: 6, duration: 4 }),
      objectBlock('m', { start: 0, duration: 2 }),
    ];
    expect(startOf(applyDrop(list, 'm', 'root', 'root', q(7)), 'm')).toBe(4);
  });

  it('dropped on another lane it moves to that collection, at the dropped start when free there', () => {
    const result = ok(applyDrop(blocks(), 'a', 'root', 'other', q(20)));
    expect(
      collectionDataOf(result.blocks.find((block) => block.id === 'other'))?.memberRefs
    ).toEqual([{ id: 'x' }, { id: 'a' }]);
    expect(
      collectionDataOf(result.blocks.find((block) => block.id === 'root'))?.memberRefs
    ).toEqual([{ id: 'b' }, { id: 'c' }]);
    expect(startOf(result, 'a')).toBe(20);
  });

  it('dropped on another lane over an object there it lands in the nearest free slot', () => {
    // X is 10 to 14 in Other: A (length 4) dropped at 11 lands at 6 (4 before) or 14 (3 after): 14.
    expect(startOf(applyDrop(blocks(), 'a', 'root', 'other', q(11)), 'a')).toBe(14);
  });

  it('reports where a drop would land for the faint outline', () => {
    expect(rationalToNumber(dropLanding(blocks(), 'a', 'root', 'root', q(17))!)).toBe(16);
    expect(dropLanding(blocks(), 'a', 'root', 'nowhere', q(17))).toBeNull();
  });

  it('finds the lane under a height', () => {
    const rects = [
      { id: 'one', top: 0, bottom: 40 },
      { id: 'two', top: 40, bottom: 80 },
    ];
    expect(laneAtY(39, rects)).toBe('one');
    expect(laneAtY(40, rects)).toBe('two');
    expect(laneAtY(80, rects)).toBeNull();
  });
});

describe('the shared edge of touching objects', () => {
  it('moves the left end and the right start together, each keeping a beat', () => {
    const list = blocks();
    const result = ok(resizeSharedEdge(list, 'a', 'b', q(10), q(1)));
    const a = objectDataOf(result.blocks.find((block) => block.id === 'a'))!;
    const b = objectDataOf(result.blocks.find((block) => block.id === 'b'))!;
    expect(rationalToNumber(a.timeSpan.duration)).toBe(6);
    expect(rationalToNumber(b.timeSpan.start)).toBe(10);
    expect(rationalToNumber(b.timeSpan.duration)).toBe(6);
  });
});
