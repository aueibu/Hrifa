import { describe, expect, it } from 'vitest';
import { dataBlockUsers, deleteBlockFromProject } from '../dataBlocks/dataBlockRefs';
import { blockRefs, dataBlockTypeOf, repointBlockRef, validateBlock } from '../dataBlocks/registry';
import { rational } from '../musicalTime';
import { collectionBlock, objectBlock, sceneBlock } from './sceneTestHelpers';
import {
  blankObjectData,
  createBlankCollection,
  createBlankObject,
  createBlankScene,
  createBlankTrack,
  trackDataOf,
  type CollectionData,
  type ObjectData,
} from './sceneTypes';

describe('the track record type', () => {
  it('is registered as a record type with no channels', () => {
    const def = dataBlockTypeOf({ typeId: 'track' });
    expect([def?.id, def?.label, def?.payload, def?.channels.length]).toEqual([
      'track',
      'Track',
      'record',
      0,
    ]);
  });

  it('createBlank gives a valid, unmuted track holding only mute', () => {
    const track = createBlankTrack(request);
    expect(validateBlock(track)).toBeNull();
    expect(trackDataOf(track)).toEqual({ mute: false });
    expect(blockRefs(track)).toEqual([]);
  });

  it('rejects data without a boolean mute flag', () => {
    const bad = (data: unknown) =>
      validateBlock({ ...createBlankTrack(request), payload: { kind: 'record', data } });
    expect(bad({})).not.toBeNull();
    expect(bad({ mute: 'no' })).not.toBeNull();
    expect(bad(null)).not.toBeNull();
    expect(bad({ mute: true })).toBeNull();
  });
});

describe('ObjectData.trackRef', () => {
  const withTrackRef = (trackRef: unknown) => {
    const data: Record<string, unknown> = { ...blankObjectData(), trackRef };
    if (trackRef === undefined) {
      delete data.trackRef;
    }
    return validateBlock({ ...createBlankObject(request), payload: { kind: 'record', data } });
  };

  it('accepts undefined, null and a reference', () => {
    expect(withTrackRef(undefined)).toBeNull();
    expect(withTrackRef(null)).toBeNull();
    expect(withTrackRef({ id: 't' })).toBeNull();
  });

  it('rejects garbage', () => {
    expect(withTrackRef('t')).not.toBeNull();
    expect(withTrackRef({ id: '' })).not.toBeNull();
    expect(withTrackRef({})).not.toBeNull();
    expect(withTrackRef(3)).not.toBeNull();
  });

  it('is null on a blank object', () => {
    expect(blankObjectData().trackRef).toBeNull();
  });
});

const request = { id: 'x', createdAt: '2026-11-24T00:00:00Z', name: 'X', length: rational(4) };
const dataOf = <T>(block: { payload: { kind: string; data?: unknown } }) =>
  (block.payload as { data: T }).data;

describe('a remap onto a member already in the collection', () => {
  it('keeps the first listing, so the collection stays valid', () => {
    const def = dataBlockTypeOf({ typeId: 'collection' });
    if (def?.payload !== 'record' || !def.mapRefs) {
      throw new Error('the collection type must be a record type with mapRefs');
    }
    const next = def.mapRefs(
      { memberRefs: [{ id: 'a' }, { id: 'b' }], mute: false },
      (_slot, ref) => (ref.id === 'a' ? { id: 'b' } : ref)
    );
    expect((next as CollectionData).memberRefs).toEqual([{ id: 'b' }]);
    expect(def.validate(next)).toBeNull();
  });
});

describe('the three record types', () => {
  it('are registered with their families, no channels', () => {
    expect(
      ['scene', 'collection', 'object'].map((id) => {
        const def = dataBlockTypeOf({ typeId: id });
        return [def?.id, def?.family, def?.channels.length, def?.payload];
      })
    ).toEqual([
      ['scene', 'composite', 0, 'record'],
      ['collection', 'composite', 0, 'record'],
      ['object', 'placed', 0, 'record'],
    ]);
  });

  it('createBlank gives a valid block: Empty object 0, 4 quarters, whole register, Loop', () => {
    expect(validateBlock(createBlankScene(request))).toBeNull();
    expect(validateBlock(createBlankCollection(request))).toBeNull();
    const object = createBlankObject(request);
    expect(validateBlock(object)).toBeNull();
    expect(dataOf<ObjectData>(object)).toEqual({
      trackRef: null,
      parentRef: null,
      timeSpan: { start: rational(0), duration: rational(4) },
      contentOffset: rational(0),
      registerSpan: { lowMc: 0, highMc: 12700 },
      registerMapping: 'show',
      primaryDataRef: null,
      mapping: 'loop',
      modifiers: [],
      mute: false,
    });
  });

  it('validates shapes', () => {
    const bad = (data: unknown) =>
      validateBlock({ ...createBlankObject(request), payload: { kind: 'record', data } });
    const good = blankObjectData();
    expect(
      bad({ ...good, timeSpan: { start: rational(0), duration: rational(0) } })
    ).not.toBeNull();
    expect(
      bad({
        ...good,
        timeSpan: { start: { numerator: 1.5, denominator: 1 }, duration: rational(1) },
      })
    ).not.toBeNull();
    expect(bad({ ...good, registerSpan: { lowMc: 5, highMc: 1 } })).not.toBeNull();
    expect(bad({ ...good, mapping: 'bounce' })).not.toBeNull();
    expect(bad({ ...good, registerMapping: 'bounce' })).not.toBeNull();
    expect(bad({ ...good, registerMapping: undefined })).not.toBeNull();
    for (const registerMapping of ['show', 'filter', 'fold']) {
      expect(bad({ ...good, registerMapping })).toBeNull();
    }
    expect(bad({ ...good, modifiers: 'x' })).not.toBeNull();
    // An object saved before modifiers had references (an empty list) stays valid.
    expect(bad({ ...good, modifiers: [] })).toBeNull();
    expect(
      bad({ ...good, modifiers: [{ id: 'm', type: 't', mute: false, params: {}, refs: {} }] })
    ).toBeNull();
    expect(
      bad({
        ...good,
        modifiers: [{ id: 'm', type: 't', mute: false, params: {}, refs: { set: { id: 'p' } } }],
      })
    ).toBeNull();
    expect(
      bad({
        ...good,
        modifiers: [{ id: 'm', type: 't', mute: false, params: {}, refs: { set: 3 } }],
      })
    ).not.toBeNull();
    const collection = (data: unknown) =>
      validateBlock({ ...createBlankCollection(request), payload: { kind: 'record', data } });
    expect(collection({ memberRefs: [{ id: 'a' }, { id: 'a' }], mute: false })).not.toBeNull();
    const scene = (data: unknown) =>
      validateBlock({ ...createBlankScene(request), payload: { kind: 'record', data } });
    expect(scene({ rootCollectionRef: null, markers: {} })).not.toBeNull();
  });

  it('exposes stable slots and maps them back', () => {
    const object = objectBlock('o', { parentRef: { id: 'p' }, primaryDataRef: { id: 'd' } });
    expect(blockRefs(object)).toEqual([
      { slot: 'parent', ref: { id: 'p' } },
      { slot: 'data', ref: { id: 'd' } },
    ]);
    const collection = collectionBlock('c', ['a', 'b']);
    expect(blockRefs(collection).map((entry) => entry.slot)).toEqual(['member:a', 'member:b']);
    expect(blockRefs(sceneBlock('s', 'c'))).toEqual([{ slot: 'root', ref: { id: 'c' } }]);
    expect(blockRefs(sceneBlock('s', null))).toEqual([]);
    // Slots do not shift when a sibling goes.
    const trimmed = repointBlockRef(collection, { slot: 'member:a', ref: { id: 'a' } }, null);
    expect(blockRefs(trimmed).map((entry) => entry.slot)).toEqual(['member:b']);
    expect(dataOf<CollectionData>(trimmed).memberRefs).toEqual([{ id: 'b' }]);
    // Repointing the data slot leaves the parent slot alone.
    const moved = repointBlockRef(object, { slot: 'data', ref: { id: 'd' } }, 'e');
    expect(blockRefs(moved)).toEqual([
      { slot: 'parent', ref: { id: 'p' } },
      { slot: 'data', ref: { id: 'e' } },
    ]);
  });

  it('counts users and removes a deleted member from its collection', () => {
    const blocks = [objectBlock('o'), collectionBlock('c', ['o']), sceneBlock('s', 'c')];
    const project = { dataBlocks: blocks, instances: [] };
    expect(dataBlockUsers(project, 'o').map((entry) => [entry.ownerId, entry.slot])).toEqual([
      ['c', 'member:o'],
    ]);
    const next = deleteBlockFromProject(project, 'o');
    expect(
      dataOf<CollectionData>(next.dataBlocks.find((block) => block.id === 'c')!).memberRefs
    ).toEqual([]);
    const withoutRoot = deleteBlockFromProject(project, 'c');
    expect(
      dataOf<{ rootCollectionRef: unknown }>(withoutRoot.dataBlocks.find((b) => b.id === 's')!)
        .rootCollectionRef
    ).toBeNull();
  });
});

describe('contentOffset (O2d, W-74)', () => {
  it('is exact, required, and rejected when it is not a rational', () => {
    const base = blankObjectData();
    const check = (contentOffset: unknown) =>
      validateBlock({
        ...createBlankObject(request),
        payload: { kind: 'record', data: { ...base, contentOffset } },
      });
    expect(check(rational(0))).toBeNull();
    expect(check({ numerator: -3, denominator: 4 })).toBeNull();
    expect(check(1.5)).not.toBeNull();
    expect(check({ numerator: 1, denominator: 0 })).not.toBeNull();
    expect(check(undefined)).not.toBeNull();
  });

  it('an object still holding strips (W-75) is invalid until migrated', () => {
    const base = blankObjectData();
    const { timeSpan: _timeSpan, ...rest } = base;
    const old = validateBlock({
      ...createBlankObject(request),
      payload: { kind: 'record', data: { ...rest, strips: [] } },
    });
    expect(old).not.toBeNull();
  });
});
