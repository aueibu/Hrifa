import { describe, expect, it } from 'vitest';
import { dataBlockUsers, deleteBlockFromProject } from '../dataBlocks/dataBlockRefs';
import { validateBlock, type StoredDataBlock } from '../dataBlocks/registry';
import { createSceneEvaluator, evaluateScene } from './evaluateScene';
import {
  claveBlock,
  collectionBlock,
  objectBlock,
  replaceBlock,
  sceneBlock,
  trackBlock,
} from './sceneTestHelpers';
import { objectDataOf } from './sceneTypes';

// Tracks (W-82), SCENARIOS.tracks.md section 2. Each clave object is one-shot: 5 events.
const onTrack = (id: string, track: string | null, patch: Parameters<typeof objectBlock>[1] = {}) =>
  objectBlock(id, {
    primaryDataRef: { id: 'clave' },
    mapping: 'one-shot',
    trackRef: track === null ? null : { id: track },
    ...patch,
  });

const names = (blocks: StoredDataBlock[], options?: { includeMuted?: boolean }) =>
  (options
    ? createSceneEvaluator().evaluate(blocks, 'scene', options)
    : evaluateScene(blocks, 'scene')
  ).plan.events.length;

/** Root lists Tracks RH and LH; RH has two objects, LH one. */
function piano(overrides: { root?: StoredDataBlock; extra?: StoredDataBlock[] } = {}) {
  return [
    claveBlock(),
    trackBlock('rh'),
    trackBlock('lh'),
    onTrack('a', 'rh'),
    onTrack('b', 'rh', { start: 2 }),
    onTrack('c', 'lh'),
    ...(overrides.extra ?? []),
    overrides.root ?? collectionBlock('root', ['rh', 'lh']),
    sceneBlock('scene', 'root'),
  ];
}

describe('scenario 1: overlapping objects on one Track', () => {
  it('both play (a at 0 to 4 and b at 2 to 6)', () => {
    const blocks = [
      claveBlock(),
      trackBlock('rh'),
      onTrack('a', 'rh'),
      onTrack('b', 'rh', { start: 2 }),
      collectionBlock('root', ['rh']),
      sceneBlock('scene', 'root'),
    ];
    const { plan, warnings } = evaluateScene(blocks, 'scene');
    expect(plan.events).toHaveLength(10);
    expect(warnings).toEqual([]);
  });
});

describe('scenario 5: muting a collection', () => {
  it('silences every Track under it and leaves the Track flags alone', () => {
    const blocks = piano();
    expect(names(blocks)).toBe(15);
    const muted = replaceBlock(blocks, collectionBlock('root', ['rh', 'lh'], { mute: true }));
    expect(names(muted)).toBe(0);
    expect(names(muted, { includeMuted: true })).toBe(15);
    const flags = muted.filter((block) => block.typeId === 'track').map((block) => block.payload);
    expect(flags).toEqual([trackBlock('rh').payload, trackBlock('lh').payload]);
  });

  it('a muted sub-collection silences the Tracks it lists, not its siblings', () => {
    const blocks = [
      claveBlock(),
      trackBlock('rh'),
      trackBlock('lh'),
      onTrack('a', 'rh'),
      onTrack('c', 'lh'),
      collectionBlock('sub', ['rh'], { mute: true }),
      collectionBlock('root', ['sub', 'lh']),
      sceneBlock('scene', 'root'),
    ];
    expect(names(blocks)).toBe(5);
  });
});

describe('scenario 6: muting one Track', () => {
  it('silences only its objects; the collection and the other Track keep playing', () => {
    const blocks = replaceBlock(piano(), trackBlock('rh', true));
    expect(names(blocks)).toBe(5);
    expect(names(blocks, { includeMuted: true })).toBe(15);
  });

  it('unmuting the collection leaves the Track own flag muted', () => {
    const blocks = replaceBlock(
      replaceBlock(piano(), trackBlock('rh', true)),
      collectionBlock('root', ['rh', 'lh'], { mute: true })
    );
    expect(names(blocks)).toBe(0);
    const unmuted = replaceBlock(blocks, collectionBlock('root', ['rh', 'lh']));
    expect(names(unmuted)).toBe(5);
  });

  it('an object own mute silences it on an unmuted Track', () => {
    const blocks = replaceBlock(piano(), onTrack('a', 'rh', { mute: true }));
    expect(names(blocks)).toBe(10);
  });
});

describe('reaching objects through both shapes', () => {
  it('an object listed directly and through its Track plays once', () => {
    const blocks = piano({ root: collectionBlock('root', ['a', 'rh', 'lh']) });
    const { plan, warnings } = evaluateScene(blocks, 'scene');
    expect(plan.events).toHaveLength(15);
    expect(warnings.some((text) => text.includes('listed twice'))).toBe(true);
  });

  it('a Track listed by two collections is walked once', () => {
    const blocks = piano({
      root: collectionBlock('root', ['rh', 'other', 'lh']),
      extra: [collectionBlock('other', ['rh'])],
    });
    const { plan, warnings } = evaluateScene(blocks, 'scene');
    expect(plan.events).toHaveLength(15);
    expect(warnings.some((text) => text.includes('reached twice'))).toBe(true);
  });

  it('old shape (objects listed directly, no Track) is unchanged', () => {
    const blocks = [
      claveBlock(),
      onTrack('a', null),
      collectionBlock('root', ['a']),
      sceneBlock('scene', 'root'),
    ];
    expect(names(blocks)).toBe(5);
  });
});

describe('Tracks no collection reaches, and missing blocks', () => {
  it('objects on an unreached Track are not reached', () => {
    const blocks = piano({ root: collectionBlock('root', ['lh']) });
    expect(names(blocks)).toBe(5);
  });

  it('a trackRef at a missing block is not reached and silences nothing else', () => {
    const blocks = piano({ extra: [onTrack('ghost', 'gone')] });
    const { plan, warnings } = evaluateScene(blocks, 'scene');
    expect(plan.events).toHaveLength(15);
    expect(warnings).toEqual([]);
  });

  it('a listed block that is not a collection, object or track is skipped', () => {
    const blocks = piano({ root: collectionBlock('root', ['rh', 'clave', 'lh']) });
    const { plan, warnings } = evaluateScene(blocks, 'scene');
    expect(plan.events).toHaveLength(15);
    expect(warnings).toHaveLength(1);
  });
});

describe('Track references in the registry', () => {
  it('users of a Track are its objects (slot track)', () => {
    const users = dataBlockUsers({ dataBlocks: piano(), instances: [] }, 'rh');
    expect(users.map((user) => [user.ownerId, user.slot]).sort()).toEqual([
      ['a', 'track'],
      ['b', 'track'],
      ['root', 'member:rh'],
    ]);
  });

  it('deleting a Track blanks trackRef, keeps the objects, and never falls back', () => {
    const next = deleteBlockFromProject({ dataBlocks: piano(), instances: [] }, 'rh');
    expect(next.dataBlocks.some((block) => block.id === 'rh')).toBe(false);
    const a = next.dataBlocks.find((block) => block.id === 'a')!;
    const c = next.dataBlocks.find((block) => block.id === 'c')!;
    expect(objectDataOf(a)?.trackRef).toBeNull();
    expect(objectDataOf(c)?.trackRef).toEqual({ id: 'lh' });
    expect(validateBlock(a)).toBeNull();
    // The blanked objects are in no Track any collection reaches: only LH plays.
    expect(names(next.dataBlocks)).toBe(5);
  });
});
