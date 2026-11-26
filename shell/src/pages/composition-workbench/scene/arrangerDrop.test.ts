import { describe, expect, it } from 'vitest';
import { rationalFromNumber, rationalToNumber } from '../musicalTime';
import { applyDrop, dropLanding, laneAtY } from './arrangerDrop';
import { resizeSharedEdge, type SceneOpResult } from './sceneOps';
import { collectionBlock, objectBlock, sceneBlock, trackBlock } from './sceneTestHelpers';
import { objectDataOf } from './sceneTypes';

const q = rationalFromNumber;
const on = (track: string) => ({ trackRef: { id: track } });

function blocks() {
  return [
    sceneBlock('scene', 'root'),
    collectionBlock('root', ['main', 'other-c']),
    collectionBlock('main', ['t1'], {}, 'Main'),
    collectionBlock('other-c', ['t2'], {}, 'Other'),
    trackBlock('t1'),
    trackBlock('t2'),
    objectBlock('a', { ...on('t1'), start: 4, duration: 4 }, 'A'),
    objectBlock('b', { ...on('t1'), start: 8, duration: 8 }, 'B'),
    objectBlock('c', { ...on('t1'), start: 20, duration: 4 }, 'C'),
    objectBlock('x', { ...on('t2'), start: 10, duration: 4 }, 'X'),
  ];
}

function ok(result: SceneOpResult) {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result;
}

const dataOf = (result: SceneOpResult, id: string) =>
  objectDataOf(ok(result).blocks.find((block) => block.id === id))!;
const startOf = (result: SceneOpResult, id: string) =>
  rationalToNumber(dataOf(result, id).timeSpan.start);

describe('a body drag released (W-82)', () => {
  it('lands exactly where dropped, also over another block on the Track (overlap is allowed)', () => {
    expect(startOf(applyDrop(blocks(), 'a', 't1', 't1', q(16)), 'a')).toBe(16);
    expect(startOf(applyDrop(blocks(), 'a', 't1', 't1', q(17)), 'a')).toBe(17);
  });

  it('never lands before 0', () => {
    expect(startOf(applyDrop(blocks(), 'a', 't1', 't1', q(-3)), 'a')).toBe(0);
  });

  it('on another Track it moves there, in one result, and lands where dropped', () => {
    const result = applyDrop(blocks(), 'a', 't1', 't2', q(11));
    expect(dataOf(result, 'a').trackRef).toEqual({ id: 't2' });
    expect(startOf(result, 'a')).toBe(11);
  });

  it('is refused when the target is not a Track', () => {
    expect(applyDrop(blocks(), 'a', 't1', 'main', q(11)).ok).toBe(false);
  });

  it('dropLanding reports the world start, or null when refused', () => {
    expect(rationalToNumber(dropLanding(blocks(), 'a', 't1', 't1', q(17))!)).toBe(17);
    expect(dropLanding(blocks(), 'a', 't1', 'nowhere', q(17))).toBeNull();
  });
});

describe('laneAtY', () => {
  it('finds the lane whose band holds the height', () => {
    const rects = [
      { id: 'one', top: 0, bottom: 40 },
      { id: 'two', top: 40, bottom: 80 },
    ];
    expect(laneAtY(39, rects)).toBe('one');
    expect(laneAtY(40, rects)).toBe('two');
    expect(laneAtY(80, rects)).toBeNull();
  });
});

describe('resizeSharedEdge on one Track', () => {
  it('moves the edge two touching blocks share', () => {
    const list = [
      sceneBlock('scene', 'root'),
      collectionBlock('root', ['t']),
      trackBlock('t'),
      objectBlock('a', { ...on('t'), start: 0, duration: 8 }),
      objectBlock('b', { ...on('t'), start: 8, duration: 8 }),
    ];
    const result = ok(resizeSharedEdge(list, 'a', 'b', q(10), q(1)));
    expect(rationalToNumber(dataOf(result, 'a').timeSpan.duration)).toBe(10);
    expect(startOf(result, 'b')).toBe(10);
  });

  it('refuses blocks on different Tracks', () => {
    const list = [
      sceneBlock('scene', 'root'),
      collectionBlock('root', ['t', 'u']),
      trackBlock('t'),
      trackBlock('u'),
      objectBlock('a', { ...on('t'), start: 0, duration: 8 }),
      objectBlock('b', { ...on('u'), start: 8, duration: 8 }),
    ];
    expect(resizeSharedEdge(list, 'a', 'b', q(10), q(1)).ok).toBe(false);
  });
});
