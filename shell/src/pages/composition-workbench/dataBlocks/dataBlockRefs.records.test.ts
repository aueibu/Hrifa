import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { packet } from '../model';
import {
  dataBlockUsers,
  makeSingleUser,
  missingRefs,
  registerReferencer,
  remapUsers,
  unlinkUser,
  unusedDataBlocks,
  type RefsProject,
  type UserEntry,
} from './dataBlockRefs';
import { registerDataBlockType, type PacketBlock } from './registry';
import {
  collectionBlock,
  collectionData,
  collectionTestType,
  rhythmTestType,
  pitchSetTestType,
} from './testTypes';

const rhythm = (id: string, name: string): PacketBlock => ({
  schemaVersion: 1,
  id,
  typeId: 'rhythm-test',
  name,
  createdAt: '2026-11-24T00:00:00Z',
  payload: {
    kind: 'packet',
    packet: packet('list', 'duration', [{ id: `${id}:0`, value: 3, provenance: [] }]),
  },
});

const R = rhythm('R', 'Clave');
const R2 = rhythm('R2', 'Tresillo');

let removers: (() => void)[] = [];
beforeEach(() => {
  removers.push(
    registerDataBlockType(rhythmTestType),
    registerDataBlockType(pitchSetTestType),
    registerDataBlockType(collectionTestType)
  );
});
afterEach(() => {
  removers.forEach((remove) => remove());
  removers = [];
});

function projectOf(...blocks: ReturnType<typeof collectionBlock>[]): RefsProject {
  return { dataBlocks: [R, R2, ...blocks], instances: [] };
}

function user(state: RefsProject, id: string, slot: string): UserEntry {
  const entry = dataBlockUsers(state, id).find((candidate) => candidate.slot === slot);
  if (!entry) {
    throw new Error(`no user in slot ${slot}`);
  }
  return entry;
}

describe('users held by a record type', () => {
  const C1 = collectionBlock('C1', 'Collection C1', [
    ['a', 'rhythm', 'R'],
    ['b', 'rhythm', 'R2'],
    ['c', 'pitch set', 'gone'],
  ]);

  it('come from the type with no hand-written referencer, labeled by the type', () => {
    const state = projectOf(C1);
    const users = dataBlockUsers(state, 'R');
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ ownerKind: 'data-block', ownerId: 'C1', slot: 'a' });
    expect(users[0].label).toBe('Collection C1 (Collection)');
    expect(unusedDataBlocks(state).map((block) => block.id)).toEqual(['C1']);
  });

  it('a missing reference is a user of nothing and shows as missing', () => {
    const state = projectOf(C1);
    expect(dataBlockUsers(state, 'gone')).toHaveLength(1);
    expect(missingRefs(state).map((entry) => [entry.slot, entry.ref.id])).toEqual([['c', 'gone']]);
    expect(unusedDataBlocks(state).map((block) => block.id)).toEqual(['C1']);
    expect(missingRefs({ ...state, dataBlocks: [R, R2] })).toEqual([]);
  });

  it('two distinct slots pointing at one block: unlink and make single user touch only one', () => {
    const two = collectionBlock('C2', 'C2', [
      ['x', 'rhythm', 'R'],
      ['y', 'accent', 'R'],
    ]);
    const state = projectOf(two);
    const unlinked = unlinkUser(state, user(state, 'R', 'x'));
    if (!unlinked.ok) {
      throw new Error(unlinked.error);
    }
    expect(dataBlockUsers(unlinked.project, 'R').map((entry) => entry.slot)).toEqual(['y']);
    const single = makeSingleUser(state, 'R', user(state, 'R', 'y'), {
      id: 'R-copy',
      createdAt: 'now',
    });
    if (!single.ok) {
      throw new Error(single.error);
    }
    expect(dataBlockUsers(single.project, 'R').map((entry) => entry.slot)).toEqual(['x']);
    expect(dataBlockUsers(single.project, 'R-copy').map((entry) => entry.slot)).toEqual(['y']);
  });

  it('make single user on a record user copies the packet, not the record', () => {
    const state = projectOf(C1);
    const result = makeSingleUser(state, 'R', user(state, 'R', 'a'), {
      id: 'R-copy',
      createdAt: 'now',
    });
    if (!result.ok) {
      throw new Error(result.error);
    }
    expect(result.copy.typeId).toBe('rhythm-test');
    const after = result.project.dataBlocks.find((block) => block.id === 'C1')!;
    expect(collectionData(after).entries[0].ref).toEqual({ id: 'R-copy' });
    // The original record was not mutated.
    expect(collectionData(C1).entries[0].ref).toEqual({ id: 'R' });
  });

  it('a duplicated record shares no data with the original', () => {
    const state = projectOf(C1);
    const result = makeSingleUser(state, 'R', user(state, 'R', 'a'), { id: 'x', createdAt: 'now' });
    expect(result.ok).toBe(true);
    // Duplicating the record itself, then repointing the copy, leaves C1 alone.
    const copyState = makeSingleUser(
      { ...state, dataBlocks: [...state.dataBlocks] },
      'R2',
      user(state, 'R2', 'b'),
      { id: 'R2-copy', createdAt: 'now' }
    );
    expect(copyState.ok).toBe(true);
    expect(collectionData(C1).entries.map((entry) => entry.ref?.id)).toEqual(['R', 'R2', 'gone']);
  });

  it('remap repoints record refs and drops a pinned version in the one place', () => {
    const pinned = collectionBlock('C3', 'C3', [['p', 'rhythm', { id: 'R', version: 'v7' }]]);
    const state = projectOf(pinned);
    expect(user(state, 'R', 'p').ref.version).toBe('v7');
    const remapped = remapUsers(state, 'R', 'R2');
    if (!remapped.ok) {
      throw new Error(remapped.error);
    }
    const after = remapped.project.dataBlocks.find((block) => block.id === 'C3')!;
    expect(collectionData(after).entries[0].ref).toEqual({ id: 'R2' });
    const single = makeSingleUser(state, 'R', user(state, 'R', 'p'), {
      id: 'Rc',
      createdAt: 'now',
    });
    if (!single.ok) {
      throw new Error(single.error);
    }
    const afterSingle = single.project.dataBlocks.find((block) => block.id === 'C3')!;
    expect(collectionData(afterSingle).entries[0].ref).toEqual({ id: 'Rc' });
  });
});

describe('referencer registration', () => {
  it('a duplicate name throws', () => {
    const referencer = { name: 'dup', refs: () => [], repoint: (p: RefsProject) => p };
    const remove = registerReferencer(referencer);
    expect(() => registerReferencer({ ...referencer })).toThrow(/already registered/);
    remove();
    const again = registerReferencer({ ...referencer });
    again();
  });
});
