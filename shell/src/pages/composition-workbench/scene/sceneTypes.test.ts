import { describe, expect, it } from 'vitest';
import { dataBlockUsers, deleteBlockFromProject } from '../dataBlocks/dataBlockRefs';
import { blockRefs, dataBlockTypeOf, repointBlockRef, validateBlock } from '../dataBlocks/registry';
import { rational } from '../musicalTime';
import { claveBlock, collectionBlock, objectBlock, sceneBlock, stripOf } from './sceneTestHelpers';
import {
  blankObjectData,
  createBlankCollection,
  createBlankObject,
  createBlankScene,
  stripDataSlot,
  stripParentSlot,
  type CollectionData,
  type ObjectData,
} from './sceneTypes';

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

  it('createBlank gives a valid block: Empty object, the whole register, ONE silent strip 0, 4 quarters, Loop', () => {
    expect(validateBlock(createBlankScene(request))).toBeNull();
    expect(validateBlock(createBlankCollection(request))).toBeNull();
    const object = createBlankObject(request);
    expect(validateBlock(object)).toBeNull();
    expect(dataOf<ObjectData>(object)).toEqual({
      registerSpan: { lowMc: 0, highMc: 12700 },
      mute: false,
      strips: [
        {
          id: 'strip-1',
          dataRef: null,
          start: rational(0),
          duration: rational(4),
          mapping: 'loop',
          contentOffset: rational(0),
          modifiers: [],
          mute: false,
          parentStrip: null,
        },
      ],
    });
  });

  it('validates shapes', () => {
    const bad = (data: unknown) =>
      validateBlock({ ...createBlankObject(request), payload: { kind: 'record', data } });
    const good = blankObjectData();
    const withStrip = (patch: Record<string, unknown>) => ({
      ...good,
      strips: [{ ...good.strips[0], ...patch }],
    });
    expect(bad(good)).toBeNull();
    expect(bad(withStrip({ duration: rational(0) }))).not.toBeNull();
    expect(bad(withStrip({ start: { numerator: 1.5, denominator: 1 } }))).not.toBeNull();
    expect(bad({ ...good, registerSpan: { lowMc: 5, highMc: 1 } })).not.toBeNull();
    expect(bad(withStrip({ mapping: 'bounce' }))).not.toBeNull();
    expect(bad(withStrip({ modifiers: 'x' }))).not.toBeNull();
    expect(bad(withStrip({ modifiers: [] }))).toBeNull();
    expect(
      bad(withStrip({ modifiers: [{ id: 'm', type: 't', mute: false, params: {}, refs: {} }] }))
    ).toBeNull();
    expect(
      bad(
        withStrip({
          modifiers: [{ id: 'm', type: 't', mute: false, params: {}, refs: { set: { id: 'p' } } }],
        })
      )
    ).toBeNull();
    expect(
      bad(
        withStrip({
          modifiers: [{ id: 'm', type: 't', mute: false, params: {}, refs: { set: 3 } }],
        })
      )
    ).not.toBeNull();
    // A strip needs every field, and its parent is another strip (both ids) or null.
    expect(bad(withStrip({ mute: 'no' }))).not.toBeNull();
    expect(bad(withStrip({ id: '' }))).not.toBeNull();
    expect(bad(withStrip({ dataRef: 'x' }))).not.toBeNull();
    expect(bad(withStrip({ parentStrip: { objectId: 'p', stripId: 's' } }))).toBeNull();
    expect(bad(withStrip({ parentStrip: { objectId: 'p' } }))).not.toBeNull();
    expect(bad(withStrip({ parentStrip: 'p' }))).not.toBeNull();
    // Strip ids are unique within an object; zero strips is a valid (silent) Empty.
    expect(bad({ ...good, strips: [good.strips[0], good.strips[0]] })).not.toBeNull();
    expect(bad({ ...good, strips: [] })).toBeNull();
    expect(bad({ ...good, strips: 'x' })).not.toBeNull();
    expect(bad({ ...good, mute: 1 })).not.toBeNull();
    const collection = (data: unknown) =>
      validateBlock({ ...createBlankCollection(request), payload: { kind: 'record', data } });
    expect(collection({ memberRefs: [{ id: 'a' }, { id: 'a' }], mute: false })).not.toBeNull();
    const scene = (data: unknown) =>
      validateBlock({ ...createBlankScene(request), payload: { kind: 'record', data } });
    expect(scene({ rootCollectionRef: null, markers: {} })).not.toBeNull();
  });

  it('exposes stable strip slots and maps them back', () => {
    const object = objectBlock('o', { parentRef: { id: 'p' }, primaryDataRef: { id: 'd' } });
    expect(blockRefs(object)).toEqual([
      { slot: 'strip:s1:data', ref: { id: 'd' } },
      { slot: 'strip:s1:parent', ref: { id: 'p' } },
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
    const moved = repointBlockRef(object, { slot: stripDataSlot('s1'), ref: { id: 'd' } }, 'e');
    expect(blockRefs(moved)).toEqual([
      { slot: 'strip:s1:data', ref: { id: 'e' } },
      { slot: 'strip:s1:parent', ref: { id: 'p' } },
    ]);
    // Repointing the parent to another OBJECT cannot name a strip there: the strip is unparented.
    const reparented = repointBlockRef(
      object,
      { slot: stripParentSlot('s1'), ref: { id: 'p' } },
      'q'
    );
    expect(dataOf<ObjectData>(reparented).strips[0].parentStrip).toBeNull();
  });

  it('every strip has its own slots, so two strips can use one data-block', () => {
    const two = objectBlock('o', {
      strips: [
        stripOf({ id: 'a', dataRef: { id: 'd' } }),
        stripOf({ id: 'b', dataRef: { id: 'd' }, start: 4 }),
      ],
    });
    expect(blockRefs(two).map((entry) => entry.slot)).toEqual(['strip:a:data', 'strip:b:data']);
    const blocks = [two, claveBlock('d')];
    const users = dataBlockUsers({ dataBlocks: blocks, instances: [] }, 'd');
    expect(users.map((entry) => [entry.ownerId, entry.slot])).toEqual([
      ['o', 'strip:a:data'],
      ['o', 'strip:b:data'],
    ]);
    // Deleting the data-block blanks both strips (they stay).
    const next = deleteBlockFromProject({ dataBlocks: blocks, instances: [] }, 'd').dataBlocks;
    expect(dataOf<ObjectData>(next[0]).strips.map((strip) => strip.dataRef)).toEqual([null, null]);
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

describe('contentOffset (O2d, W-74, on the strip since W-75)', () => {
  it('is exact, and rejected when it is not a rational', () => {
    const base = blankObjectData();
    const check = (contentOffset: unknown) =>
      validateBlock({
        ...createBlankObject(request),
        payload: {
          kind: 'record',
          data: { ...base, strips: [{ ...base.strips[0], contentOffset }] },
        },
      });
    expect(check(rational(0))).toBeNull();
    expect(check({ numerator: -3, denominator: 4 })).toBeNull();
    expect(check(1.5)).not.toBeNull();
    expect(check({ numerator: 1, denominator: 0 })).not.toBeNull();
    expect(check(undefined)).not.toBeNull();
  });
});
