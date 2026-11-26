import { describe, expect, it } from 'vitest';
import type { RefsProject } from '../dataBlocks/dataBlockRefs';
import type { StoredDataBlock } from '../dataBlocks/registry';
import { compareRational } from '../musicalTime';
import { createSceneEvaluator, evaluateScene } from './evaluateScene';
import {
  deleteHierarchy,
  deleteSelected,
  deleteSummary,
  renameBlock,
  setMute,
  type OpEnv,
  type SceneOpResult,
} from './sceneOps';
import {
  claveBlock,
  collectionBlock,
  objectBlock,
  sceneBlock,
  trackBlock,
  withLegacyLane,
} from './sceneTestHelpers';
import { collectionDataOf, objectDataOf, trackDataOf } from './sceneTypes';
import {
  addEmptyOnTrack,
  addTrack,
  duplicateTrack,
  moveObjectToTrack,
  moveTrackToCollection,
  reorderMember,
  setTrackMute,
} from './trackOps';

const makeEnv = (): OpEnv => {
  let n = 0;
  return { newId: () => `new${(n += 1)}`, now: '2026-11-26T00:00:00Z' };
};

function ok(result: SceneOpResult) {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result;
}

const get = (blocks: readonly StoredDataBlock[], id: string) =>
  blocks.find((block) => block.id === id);
const members = (blocks: readonly StoredDataBlock[], id: string) =>
  collectionDataOf(get(blocks, id))?.memberRefs.map((m) => m.id);

const onTrack = (id: string, track: string, patch: Parameters<typeof objectBlock>[1] = {}) =>
  objectBlock(id, {
    primaryDataRef: { id: 'clave' },
    mapping: 'one-shot',
    trackRef: { id: track },
    ...patch,
  });

/** Piano (root > piano > RH, LH) and Strings (root > strings > violin); RH has "theme", LH "bass". */
function scene(): StoredDataBlock[] {
  return [
    claveBlock(),
    trackBlock('rh'),
    trackBlock('lh'),
    trackBlock('violin'),
    onTrack('theme', 'rh'),
    withLegacyLane(onTrack('bass', 'lh', { start: 1 }), 2),
    collectionBlock('piano', ['rh', 'lh']),
    collectionBlock('strings', ['violin']),
    collectionBlock('root', ['piano', 'strings']),
    sceneBlock('scene', 'root'),
  ];
}

const events = (blocks: StoredDataBlock[], options?: { includeMuted?: boolean }) =>
  (options
    ? createSceneEvaluator().evaluate(blocks, 'scene', options)
    : evaluateScene(blocks, 'scene')
  ).plan.events;

describe('addTrack', () => {
  it('lists a new uniquely named Track at the end of the target collection and returns its id', () => {
    const env = makeEnv();
    const first = ok(addTrack(scene(), env, 'scene', 'piano'));
    expect(first.created).toEqual(['new1']);
    expect(members(first.blocks, 'piano')).toEqual(['rh', 'lh', 'new1']);
    expect(get(first.blocks, 'new1')?.name).toBe('Track');
    expect(trackDataOf(get(first.blocks, 'new1'))).toEqual({ mute: false });
    const second = ok(addTrack(first.blocks, env, 'scene', 'piano'));
    expect(get(second.blocks, 'new1')?.name).toBe('Track');
    expect(get(second.blocks, second.created[0])?.name).toBe('Track.001');
  });

  it('goes into the scene root when no collection is given, and fails without one', () => {
    const rooted = ok(addTrack(scene(), makeEnv(), 'scene', null));
    expect(members(rooted.blocks, 'root')).toEqual(['piano', 'strings', 'new1']);
    const noRoot = [sceneBlock('scene', null)];
    expect(addTrack(noRoot, makeEnv(), 'scene', null).ok).toBe(false);
  });
});

describe('scenario 12: an empty Track', () => {
  it('survives, is found by id, and addEmptyOnTrack fills it without listing the object', () => {
    const env = makeEnv();
    const added = ok(addTrack(scene(), env, 'scene', 'piano'));
    const trackId = added.created[0];
    expect(trackDataOf(get(added.blocks, trackId))).not.toBeUndefined();
    expect(events(added.blocks)).toHaveLength(10);
    const filled = ok(addEmptyOnTrack(added.blocks, env, trackId));
    const objectId = filled.created[0];
    expect(objectDataOf(get(filled.blocks, objectId))?.trackRef).toEqual({ id: trackId });
    const listed = filled.blocks.flatMap((block) => members(filled.blocks, block.id) ?? []);
    expect(listed).not.toContain(objectId);
  });

  it('refuses an id that is not a Track', () => {
    expect(addEmptyOnTrack(scene(), makeEnv(), 'theme').ok).toBe(false);
    expect(addEmptyOnTrack(scene(), makeEnv(), 'nope').ok).toBe(false);
  });
});

describe('scenario 1: a second object on the same Track', () => {
  it('lands where it is, overlapping, with no clamping', () => {
    const blocks = scene();
    const second = onTrack('var', 'lh', { start: 0.5 });
    const next = [...blocks, second];
    // "bass" sits at 1 to 5 on LH; "var" at 0.5 to 4.5 on the same Track.
    const moved = ok(moveObjectToTrack(next, 'var', 'rh'));
    expect(objectDataOf(get(moved.blocks, 'var'))?.timeSpan.start).toEqual(
      objectDataOf(second)?.timeSpan.start
    );
    const onRh = moved.blocks.filter((b) => objectDataOf(b)?.trackRef?.id === 'rh');
    expect(onRh.map((b) => b.id).sort()).toEqual(['theme', 'var']);
    expect(events(moved.blocks)).toHaveLength(15);
  });
});

describe('scenarios 2 and 3: moving an object between Tracks and collections', () => {
  it('scenario 2: bass moves to RH, start kept, same notes', () => {
    const blocks = scene();
    expect((objectDataOf(get(blocks, 'bass')) as { lane?: number }).lane).toBe(2);
    const moved = ok(moveObjectToTrack(blocks, 'bass', 'rh')).blocks;
    const data = objectDataOf(get(moved, 'bass'))!;
    expect(data.trackRef).toEqual({ id: 'rh' });
    expect(
      compareRational(data.timeSpan.start, objectDataOf(get(blocks, 'bass'))!.timeSpan.start)
    ).toBe(0);
    expect(events(moved)).toEqual(events(blocks));
  });

  it('scenario 3: bass moves to Violin; playback is now under the Strings mute', () => {
    const blocks = scene();
    const moved = ok(moveObjectToTrack(blocks, 'bass', 'violin')).blocks;
    expect(events(moved)).toEqual(events(blocks));
    const muted = ok(setMute(moved, 'strings', true)).blocks;
    expect(events(muted)).toHaveLength(5);
    expect(events(ok(setMute(blocks, 'strings', true)).blocks)).toHaveLength(10);
  });

  it('removes an old-shape direct listing so the object plays once', () => {
    const blocks = scene().map((b) =>
      b.id === 'root' ? collectionBlock('root', ['piano', 'strings', 'bass']) : b
    );
    const moved = ok(moveObjectToTrack(blocks, 'bass', 'violin')).blocks;
    expect(members(moved, 'root')).toEqual(['piano', 'strings']);
    expect(events(moved)).toHaveLength(10);
  });

  it('moving to its own Track returns the same blocks; bad targets fail plainly', () => {
    const blocks = scene();
    const same = ok(moveObjectToTrack(blocks, 'bass', 'lh'));
    expect(same.blocks).toBe(blocks);
    expect(moveObjectToTrack(blocks, 'rh', 'lh').ok).toBe(false);
    expect(moveObjectToTrack(blocks, 'bass', 'piano').ok).toBe(false);
  });

  it('a Track moved to another collection takes its objects with it', () => {
    const blocks = scene();
    const moved = ok(moveTrackToCollection(blocks, 'lh', 'strings')).blocks;
    expect(members(moved, 'piano')).toEqual(['rh']);
    expect(members(moved, 'strings')).toEqual(['violin', 'lh']);
    expect(objectDataOf(get(moved, 'bass'))?.trackRef).toEqual({ id: 'lh' });
    expect(events(moved)).toEqual(events(blocks));
    expect(events(ok(setMute(moved, 'strings', true)).blocks)).toHaveLength(5);
    expect(moveTrackToCollection(blocks, 'lh', 'theme').ok).toBe(false);
    expect(moveTrackToCollection(blocks, 'theme', 'strings').ok).toBe(false);
  });
});

describe('scenarios 5 and 6: mute', () => {
  it('muting one Track through setTrackMute silences only its objects', () => {
    const blocks = ok(setTrackMute(scene(), 'rh', true)).blocks;
    expect(trackDataOf(get(blocks, 'rh'))?.mute).toBe(true);
    expect(events(blocks)).toHaveLength(5);
    expect(events(blocks, { includeMuted: true })).toHaveLength(10);
    expect(setTrackMute(scene(), 'theme', true).ok).toBe(false);
  });

  it('setMute accepts a Track and names the three kinds when it refuses', () => {
    const blocks = ok(setMute(scene(), 'lh', true)).blocks;
    expect(trackDataOf(get(blocks, 'lh'))?.mute).toBe(true);
    expect(events(blocks)).toHaveLength(5);
    const refused = setMute(scene(), 'clave', true);
    expect(refused).toEqual({
      ok: false,
      error: 'Only an object, a track or a collection can be muted.',
    });
  });

  it('muting Piano leaves the Track flags alone and unmuting it brings back an unmuted Track', () => {
    const muted = ok(setMute(ok(setTrackMute(scene(), 'lh', true)).blocks, 'piano', true)).blocks;
    expect(events(muted)).toHaveLength(0);
    const unmuted = ok(setMute(muted, 'piano', false)).blocks;
    expect(trackDataOf(get(unmuted, 'rh'))?.mute).toBe(false);
    expect(trackDataOf(get(unmuted, 'lh'))?.mute).toBe(true);
    expect(events(unmuted)).toHaveLength(5);
  });
});

describe('scenario 4: deleting a Track', () => {
  const project = (extra: StoredDataBlock[] = []): RefsProject => ({
    dataBlocks: [...scene(), ...extra],
    instances: [],
  });

  it('the summary counts the objects on the Track and leaves object and collection results alone', () => {
    const blocks = [...scene(), onTrack('theme2', 'rh', { start: 2 })];
    expect(deleteSummary(blocks, 'rh')).toEqual({
      name: 'rh',
      kind: 'track',
      members: 0,
      children: 0,
      movesTo: null,
      objects: 2,
    });
    expect(deleteSummary(blocks, 'lh')?.objects).toBe(1);
    expect(deleteSummary(blocks, 'theme')).toEqual({
      name: 'theme',
      kind: 'object',
      members: 0,
      children: 0,
      movesTo: null,
    });
    expect(deleteSummary(blocks, 'piano')).toEqual({
      name: 'piano',
      kind: 'collection',
      members: 2,
      children: 0,
      movesTo: 'root',
    });
  });

  it.each([
    ['deleteHierarchy', deleteHierarchy],
    ['deleteSelected', deleteSelected],
  ])('%s deletes the Track and its objects and unlists it', (_name, run) => {
    const next = run(project(), 'rh').dataBlocks;
    expect(get(next, 'rh')).toBeUndefined();
    expect(get(next, 'theme')).toBeUndefined();
    expect(get(next, 'lh')).not.toBeUndefined();
    expect(get(next, 'bass')).not.toBeUndefined();
    expect(members(next, 'piano')).toEqual(['lh']);
    expect(events(next)).toHaveLength(5);
  });

  it.each([
    ['deleteHierarchy', deleteHierarchy],
    ['deleteSelected', deleteSelected],
  ])('%s: a child of a deleted parent keeps its world place', (_name, run) => {
    // "kid" is on LH, 1 after its parent "theme" (RH, start 2): world start 3.
    const kid = onTrack('kid', 'lh', { start: 1, parentRef: { id: 'theme' } });
    const withParent = project([kid]);
    withParent.dataBlocks = withParent.dataBlocks.map((b) =>
      b.id === 'theme' ? onTrack('theme', 'rh', { start: 2 }) : b
    );
    const next = run(withParent, 'rh').dataBlocks;
    expect(get(next, 'theme')).toBeUndefined();
    const data = objectDataOf(get(next, 'kid'))!;
    expect(data.parentRef).toBeNull();
    expect(compareRational(data.timeSpan.start, { numerator: 3, denominator: 1 })).toBe(0);
  });

  it('deleting a collection also deletes the objects of the Tracks under it', () => {
    const next = deleteHierarchy(project(), 'piano').dataBlocks;
    for (const gone of ['piano', 'rh', 'lh', 'theme', 'bass']) {
      expect(get(next, gone)).toBeUndefined();
    }
    expect(get(next, 'violin')).not.toBeUndefined();
  });
});

describe('reorderMember', () => {
  it('moves a Track within its collection and clamps the index', () => {
    const blocks = scene();
    expect(members(ok(reorderMember(blocks, 'piano', 'lh', 0)).blocks, 'piano')).toEqual([
      'lh',
      'rh',
    ]);
    expect(members(ok(reorderMember(blocks, 'piano', 'rh', 99)).blocks, 'piano')).toEqual([
      'lh',
      'rh',
    ]);
    expect(members(ok(reorderMember(blocks, 'piano', 'lh', -5)).blocks, 'piano')).toEqual([
      'lh',
      'rh',
    ]);
  });

  it('reorders a sub-collection too, returns the same blocks for a no-op, and refuses others', () => {
    const blocks = scene();
    expect(members(ok(reorderMember(blocks, 'root', 'strings', 0)).blocks, 'root')).toEqual([
      'strings',
      'piano',
    ]);
    expect(ok(reorderMember(blocks, 'piano', 'rh', 0)).blocks).toBe(blocks);
    expect(ok(reorderMember(blocks, 'piano', 'lh', 1)).blocks).toBe(blocks);
    expect(reorderMember(blocks, 'piano', 'violin', 0).ok).toBe(false);
    expect(reorderMember(blocks, 'piano', 'theme', 0).ok).toBe(false);
    expect(reorderMember(blocks, 'rh', 'lh', 0).ok).toBe(false);
  });
});

describe('duplicateTrack', () => {
  it('copies the Track right after the original with independent copies of its objects', () => {
    const base = [...scene(), onTrack('kid', 'rh', { start: 1, parentRef: { id: 'theme' } })];
    const outside = base.map((b) =>
      b.id === 'theme' ? onTrack('theme', 'rh', { parentRef: { id: 'bass' } }) : b
    );
    const result = ok(duplicateTrack(outside, makeEnv(), 'rh'));
    const next = result.blocks;
    const trackId = result.created[0];
    expect(get(next, trackId)?.name).toBe('rh.001');
    expect(members(next, 'piano')).toEqual(['rh', trackId, 'lh']);
    const copies = next.filter((b) => objectDataOf(b)?.trackRef?.id === trackId);
    expect(copies).toHaveLength(2);
    const byName = (name: string) => objectDataOf(copies.find((b) => b.name === name));
    const themeCopy = copies.find((b) => b.name === 'theme.001')!;
    // A parent inside the Track maps to its copy; a parent outside stays.
    expect(byName('kid.001')?.parentRef).toEqual({ id: themeCopy.id });
    expect(byName('theme.001')?.parentRef).toEqual({ id: 'bass' });
    // Own data-block copy, own modifier ids, the originals untouched.
    const dataId = byName('theme.001')?.primaryDataRef?.id;
    expect(dataId).not.toBe('clave');
    expect(get(next, dataId!)?.name).toBe('Clave (copy)');
    expect(objectDataOf(get(next, 'theme'))?.trackRef).toEqual({ id: 'rh' });
    expect(objectDataOf(get(next, 'theme'))?.primaryDataRef).toEqual({ id: 'clave' });
    expect(
      compareRational(
        byName('kid.001')!.timeSpan.start,
        objectDataOf(get(next, 'kid'))!.timeSpan.start
      )
    ).toBe(0);
    expect(events(next).length).toBe(events(outside).length + 10);
    expect(duplicateTrack(outside, makeEnv(), 'theme').ok).toBe(false);
  });
});

describe('rename', () => {
  it('renameBlock renames a Track and keeps names unique among Tracks', () => {
    const renamed = ok(renameBlock(scene(), 'rh', 'Right hand')).blocks;
    expect(get(renamed, 'rh')?.name).toBe('Right hand');
    expect(get(ok(renameBlock(renamed, 'lh', 'Right hand')).blocks, 'lh')?.name).toBe(
      'Right hand.001'
    );
    expect(renameBlock(scene(), 'rh', '  ').ok).toBe(false);
  });
});
