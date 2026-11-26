import { describe, expect, it } from 'vitest';
import { rationalFromNumber } from '../musicalTime';
import { arrangerEntries, arrangerLanes, touchingPairs } from './arrangerLanes';
import { collectionBlock, objectBlock, sceneBlock, trackBlock } from './sceneTestHelpers';
import { layoutSubLanes } from './subLanes';
import { migrateTracks } from './trackMigration';

const span = (id: string, start: number, end: number) => ({
  id,
  start: rationalFromNumber(start),
  end: rationalFromNumber(end),
});
const on = (track: string) => ({ trackRef: { id: track } });

/** Piano with RH (Theme A at 0 to 16, Theme A var at 8 to 24), LH (Bass), Pedal (empty); Strings with Violin. */
function movement() {
  return [
    sceneBlock('s', 'root'),
    collectionBlock('root', ['piano', 'strings']),
    collectionBlock('piano', ['rh', 'lh', 'pedal'], {}, 'Piano'),
    collectionBlock('strings', ['violin'], {}, 'Strings'),
    trackBlock('rh', false, 'RH'),
    trackBlock('lh', false, 'LH'),
    trackBlock('pedal', false, 'Pedal'),
    trackBlock('violin', false, 'Violin'),
    objectBlock('theme', { ...on('rh'), start: 0, duration: 16 }),
    objectBlock('var', { ...on('rh'), start: 8, duration: 16 }),
    objectBlock('bass', { ...on('lh'), start: 0, duration: 8 }),
    objectBlock('line', { ...on('violin'), start: 0, duration: 4 }),
  ];
}

describe('layoutSubLanes (automatic only)', () => {
  it('first fit in start order, ties by id; touching is not overlap', () => {
    const { subLaneOf, count } = layoutSubLanes([
      span('b', 0, 4),
      span('a', 0, 4),
      span('c', 4, 8),
    ]);
    expect(subLaneOf.get('a')).toBe(0);
    expect(subLaneOf.get('b')).toBe(1);
    expect(subLaneOf.get('c')).toBe(0);
    expect(count).toBe(2);
  });

  it('is one sub-lane for nothing', () => {
    expect(layoutSubLanes([]).count).toBe(1);
  });
});

describe('arrangerLanes: one lane per Track', () => {
  it('scenario 1: overlap on RH draws two sub-rows; LH, Pedal and Violin stay one row', () => {
    const lanes = arrangerLanes(movement(), 's');
    expect(lanes.map((lane) => [lane.name, lane.subLanes, lane.collectionName])).toEqual([
      ['RH', 2, 'Piano'],
      ['LH', 1, 'Piano'],
      ['Pedal', 1, 'Piano'],
      ['Violin', 1, 'Strings'],
    ]);
    const rh = lanes[0].objects;
    expect(rh.map((object) => [object.id, object.subLane])).toEqual([
      ['theme', 0],
      ['var', 1],
    ]);
  });

  it('scenario 12: an empty Track is a lane one sub-row high', () => {
    const pedal = arrangerLanes(movement(), 's').find((lane) => lane.id === 'pedal')!;
    expect(pedal.objects).toEqual([]);
    expect(pedal.subLanes).toBe(1);
  });

  it('scenarios 5 and 6: a Collection mute silences its Tracks; a Track mute only its own', () => {
    const muted = movement().map((block) =>
      block.id === 'piano'
        ? {
            ...block,
            payload: {
              ...block.payload,
              data: { memberRefs: [{ id: 'rh' }, { id: 'lh' }, { id: 'pedal' }], mute: true },
            },
          }
        : block
    ) as ReturnType<typeof movement>;
    const lanes = arrangerLanes(muted, 's');
    expect(lanes.map((lane) => [lane.id, lane.muted, lane.mute])).toEqual([
      ['rh', true, false],
      ['lh', true, false],
      ['pedal', true, false],
      ['violin', false, false],
    ]);
    const lhMuted = arrangerLanes(
      movement().map((block) => (block.id === 'lh' ? trackBlock('lh', true, 'LH') : block)),
      's'
    );
    expect(lhMuted.map((lane) => [lane.id, lane.muted])).toEqual([
      ['rh', false],
      ['lh', true],
      ['pedal', false],
      ['violin', false],
    ]);
    expect(lhMuted[1].objects[0].muted).toBe(true);
    expect(lhMuted[1].objects[0].mute).toBe(false);
  });

  it('scenarios 7 and 8: a band per Collection with its Tracks below; nested ones list their ancestors', () => {
    const blocks = [
      ...movement().filter((block) => block.id !== 'piano'),
      collectionBlock('piano', ['rh', 'lh', 'pedal', 'ornaments'], {}, 'Piano'),
      collectionBlock('ornaments', ['trills'], {}, 'Ornaments'),
      trackBlock('trills', false, 'Trills'),
    ];
    const entries = arrangerEntries(blocks, 's').map((entry) =>
      entry.kind === 'band'
        ? ['band', entry.band.name, entry.band.depth, entry.ancestors]
        : ['track', entry.lane.name, entry.lane.depth, entry.ancestors]
    );
    expect(entries).toEqual([
      ['band', 'Piano', 0, []],
      ['track', 'RH', 1, ['piano']],
      ['track', 'LH', 1, ['piano']],
      ['track', 'Pedal', 1, ['piano']],
      ['band', 'Ornaments', 1, ['piano']],
      ['track', 'Trills', 2, ['piano', 'ornaments']],
      ['band', 'Strings', 0, []],
      ['track', 'Violin', 1, ['strings']],
    ]);
  });

  it('scenario 11: an old Piano of three objects is migrated, then draws as one Track named Piano', () => {
    const old = [
      sceneBlock('s', 'root'),
      collectionBlock('root', ['piano']),
      collectionBlock('piano', ['a', 'b', 'c'], {}, 'Piano'),
      objectBlock('a', { start: 0, duration: 4 }),
      objectBlock('b', { start: 2, duration: 4 }),
      objectBlock('c', { start: 8, duration: 4 }),
    ];
    const lanes = arrangerLanes(migrateTracks(old), 's');
    expect(lanes).toHaveLength(1);
    expect(lanes[0].name).toBe('Piano');
    expect(lanes[0].objects.map((object) => [object.id, object.subLane])).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 0],
    ]);
  });

  it('scenario 9: a child on another Track still draws on its own Track', () => {
    const blocks = movement().map((block) =>
      block.id === 'bass'
        ? objectBlock('bass', { ...on('lh'), parentRef: { id: 'theme' }, start: 0, duration: 8 })
        : block
    );
    const lh = arrangerLanes(blocks, 's').find((lane) => lane.id === 'lh')!;
    expect(lh.objects.map((object) => object.id)).toEqual(['bass']);
  });

  it('touchingPairs finds an object that ends where the next starts on one sub-lane', () => {
    const blocks = [
      sceneBlock('s', 'root'),
      collectionBlock('root', ['t']),
      trackBlock('t'),
      objectBlock('x', { ...on('t'), start: 0, duration: 4 }),
      objectBlock('y', { ...on('t'), start: 4, duration: 4 }),
    ];
    expect(touchingPairs(arrangerLanes(blocks, 's')[0])).toEqual([{ leftId: 'x', rightId: 'y' }]);
  });
});
