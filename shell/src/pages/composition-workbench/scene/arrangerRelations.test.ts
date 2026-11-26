import { describe, expect, it } from 'vitest';
import { rational } from '../musicalTime';
import type { ArrangerLane } from './arrangerLanes';
import {
  childTicks,
  connectorPath,
  laneBoxes,
  linkedIds,
  relationLinks,
  selectedLinks,
  subLaneBottom,
  subLaneCenter,
  subLaneTop,
} from './arrangerRelations';

const object = (id: string, subLane: number, start: number, end: number) => ({
  id,
  name: id.toUpperCase(),
  muted: false,
  mute: false,
  start: rational(start),
  end: rational(end),
  subLane,
});
const lane = (id: string, subLanes: number, objects: ArrangerLane['objects']): ArrangerLane => ({
  id,
  name: id,
  collectionId: 'c',
  collectionName: 'C',
  depth: 0,
  mute: false,
  muted: false,
  subLanes,
  objects,
});

const lanes = [
  lane('main', 2, [object('p', 0, 20, 28), object('k', 1, 22, 24), object('j', 1, 26, 27)]),
  lane('other', 1, [object('c', 0, 0, 4)]),
];
const parentOf = new Map([
  ['k', 'p'],
  ['j', 'p'],
  ['c', 'p'],
  ['ghost', 'p'],
]);

describe('relationLinks', () => {
  const links = relationLinks(lanes, parentOf);

  it('links every child that stands on a lane with its parent (a missing one is skipped)', () => {
    expect(links.map((link) => link.childId)).toEqual(['k', 'j', 'c']);
    expect(links[2]).toMatchObject({
      parentLane: 'main',
      parentSubLane: 0,
      childLane: 'other',
      childSubLane: 0,
    });
  });

  it('selecting the parent takes all its links, selecting a child only its own', () => {
    expect(selectedLinks(links, 'p')).toHaveLength(3);
    expect(selectedLinks(links, 'j').map((link) => link.childId)).toEqual(['j']);
    expect(selectedLinks(links, null)).toEqual([]);
    expect([...linkedIds(selectedLinks(links, 'j'))].sort()).toEqual(['j', 'p']);
  });
});

describe('childTicks', () => {
  const links = relationLinks(lanes, parentOf);
  const starts = new Map([
    ['p', 100],
    ['k', 120],
    ['j', 160],
    ['c', 400],
  ]);
  const startPx = (id: string) => starts.get(id);

  it('puts a tick at each child start relative to the parent block, in order', () => {
    expect(childTicks(links, 'p', startPx, 200).map((tick) => [tick.childName, tick.x])).toEqual([
      ['K', 20],
      ['J', 60],
    ]);
  });

  it('a child that starts beyond the parent block has no tick; a child has no ticks of its own', () => {
    expect(childTicks(links, 'p', startPx, 40).map((tick) => tick.childId)).toEqual(['k']);
    expect(childTicks(links, 'k', startPx, 200)).toEqual([]);
  });

  it('follows a live position: the same tick moves with the dragged child', () => {
    starts.set('k', 150);
    expect(childTicks(links, 'p', startPx, 200)[0]).toMatchObject({ childId: 'k', x: 50 });
  });
});

describe('connector geometry', () => {
  it('lane boxes stack by sub-lane count and the center is the middle of the sub-lane', () => {
    const boxes = laneBoxes(lanes, () => 2.5);
    expect(boxes.get('main')).toEqual({ top: 0, subHeight: 2.5 });
    expect(boxes.get('other')).toEqual({ top: 5, subHeight: 2.5 });
    expect(subLaneCenter(boxes.get('main')!, 1)).toBe(3.75);
    expect(subLaneCenter(boxes.get('other')!, 0)).toBe(6.25);
  });

  it('the connector runs from the tick on the parent straight to the child start', () => {
    expect(connectorPath({ x: 352, y: 20 }, { x: 352, y: 60 })).toBe('M352 20L352 60');
  });

  it('sub-lane edges: the tick sits on the bottom edge, the child is met at its top edge', () => {
    const box = laneBoxes(lanes, () => 2.5).get('main')!;
    expect(subLaneBottom(box, 0)).toBe(2.5);
    expect(subLaneTop(box, 1)).toBe(2.5);
  });
});
