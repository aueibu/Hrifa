import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CompositionNodeInstance } from './compositionWorkspace';
import { DataBlockOpsProvider, useDataBlockOps } from './dataBlockOps';
import {
  dataBlockUserCount,
  dataBlockUsers,
  purgePlan,
  unusedDeskBlocks,
} from './dataBlocks/dataBlockRefs';
import {
  isPacketBlock,
  registerDataBlockType,
  type PacketBlock,
  type StoredDataBlock,
} from './dataBlocks/registry';
import {
  collectionBlock,
  collectionData,
  collectionTestType,
  rhythmTestType,
} from './dataBlocks/testTypes';
import { DeskProvider, useDesk } from './desk';
import { loadDesk } from './deskStore';
import { renderDesk, seedDesk, storedAllBlocks } from './deskTestUtils';
import { canRedo, canUndo, redo, resetHistory, undo } from './history';
import { packet } from './model';

/** O0: the desk stores and handles record blocks as well as packets; records have no card yet. */

const rhythm = (id: string, name = id): PacketBlock => ({
  schemaVersion: 2,
  id,
  typeId: 'rhythm-test',
  name,
  createdAt: '2026-11-24T00:00:00Z',
  payload: {
    kind: 'packet',
    packet: packet('list', 'duration', [{ id: `${id}:0`, value: 3, provenance: [] }]),
  },
});

const noInstances: CompositionNodeInstance[] = [];

function wrapper({ children }: { children: ReactNode }) {
  return (
    <DeskProvider>
      <DataBlockOpsProvider instances={noInstances} setInstances={() => undefined}>
        {children}
      </DataBlockOpsProvider>
    </DeskProvider>
  );
}

async function renderDeskAndOps() {
  const rendered = renderHook(() => ({ desk: useDesk(), ops: useDataBlockOps() }), { wrapper });
  await waitFor(() => expect(rendered.result.current.desk.loading).toBe(false));
  return rendered;
}

const snapshot = <T,>(value: T) => JSON.parse(JSON.stringify(value)) as T;
const ids = (blocks: StoredDataBlock[]) => blocks.map((block) => block.id);

let removers: (() => void)[] = [];
beforeEach(() => {
  localStorage.clear();
  resetHistory();
  removers.push(registerDataBlockType(rhythmTestType), registerDataBlockType(collectionTestType));
});
afterEach(() => {
  removers.forEach((remove) => remove());
  removers = [];
});

describe('the desk holds record blocks (O0)', () => {
  it('round-trips a record through the store: write, reload, unchanged', async () => {
    const record = collectionBlock('C', 'Pair', [['a', 'rhythm', 'R']]);
    const first = await renderDesk();
    act(() => first.result.current.addDataBlock(rhythm('R')));
    act(() => first.result.current.addDataBlock(record));
    const live = snapshot(first.result.current.allDataBlocks);
    expect((await storedAllBlocks(first.result.current)).map((block) => block.id)).toEqual([
      'R',
      'C',
    ]);
    first.unmount();

    const second = await renderDesk();
    expect(second.result.current.allDataBlocks).toEqual(live);
    expect(collectionData(second.result.current.allDataBlocks[1])).toEqual(collectionData(record));
    second.unmount();
  });

  it('keeps a stored record when the page loads (seeded as an earlier session saved it)', async () => {
    await seedDesk([rhythm('R'), collectionBlock('C', 'Pair', [['a', 'rhythm', 'R']])]);
    const { result } = await renderDesk();
    expect(result.current.locked).toBe(false);
    expect(result.current.persistError).toBeNull();
    expect(ids(result.current.allDataBlocks)).toEqual(['R', 'C']);
  });

  it('locks the desk on a record whose type is not registered', async () => {
    const stray = { ...collectionBlock('C', 'Pair', []), typeId: 'no-such-type' };
    await seedDesk([rhythm('R'), stray]);
    const { result } = await renderDesk();
    expect(result.current.locked).toBe(true);
    expect(result.current.allDataBlocks).toEqual([]);
    // Still locked on the next read: the stored desk was left as it was.
    expect((await loadDesk()).writable).toBe(false);
  });

  it('locks the desk on a record that fails its type validation', async () => {
    const bad = collectionBlock('C', 'Pair', []);
    await seedDesk([{ ...bad, payload: { kind: 'record', data: { entries: 'nope' } } }]);
    const { result } = await renderDesk();
    expect(result.current.locked).toBe(true);
  });

  it('adding a record is one undo step; undo and redo restore it exactly', async () => {
    const { result } = await renderDesk();
    act(() => result.current.addDataBlock(rhythm('R')));
    resetHistory();
    expect(canUndo()).toBe(false);
    const record = collectionBlock('C', 'Pair', [['a', 'rhythm', 'R']]);
    act(() => result.current.addDataBlock(record));
    const after = snapshot(result.current.allDataBlocks);
    expect(ids(result.current.allDataBlocks)).toEqual(['R', 'C']);

    act(() => undo());
    expect(ids(result.current.allDataBlocks)).toEqual(['R']);
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(true);
    expect(ids(await storedAllBlocks(result.current))).toEqual(['R']);

    act(() => redo());
    expect(result.current.allDataBlocks).toEqual(after);
    expect(await storedAllBlocks(result.current)).toEqual(after);
  });

  it('shows only packet blocks as cards, and keeps the same card list when only a record changes', async () => {
    const { result } = await renderDesk();
    act(() => result.current.addDataBlock(rhythm('R')));
    act(() => result.current.addDataBlock(collectionBlock('C', 'Pair', [])));
    expect(ids(result.current.allDataBlocks)).toEqual(['R', 'C']);
    expect(ids(result.current.dataBlocks)).toEqual(['R']);
    const cards = result.current.dataBlocks;
    act(() => result.current.renameDataBlock('C', 'Renamed'));
    expect(result.current.allDataBlocks[1].name).toBe('Renamed');
    expect(result.current.dataBlocks).toBe(cards);
  });

  it('a record makes its target packet show 1 user; deleting the packet blanks the slot in ONE undo step', async () => {
    const { result } = await renderDeskAndOps();
    act(() => result.current.desk.addDataBlock(rhythm('R')));
    act(() =>
      result.current.desk.addDataBlock(collectionBlock('C', 'Pair', [['a', 'rhythm', 'R']]))
    );
    resetHistory();
    expect(dataBlockUserCount(result.current.ops.project, 'R')).toBe(1);
    expect(dataBlockUsers(result.current.ops.project, 'R')[0]).toMatchObject({
      ownerKind: 'data-block',
      ownerId: 'C',
    });
    const before = snapshot(result.current.desk.allDataBlocks);

    let outcome: ReturnType<typeof result.current.ops.deleteBlock> | undefined;
    act(() => {
      outcome = result.current.ops.deleteBlock('R');
    });
    expect(outcome).toEqual({ ok: true });
    const { allDataBlocks } = result.current.desk;
    expect(ids(allDataBlocks)).toEqual(['C']);
    expect(collectionData(allDataBlocks[0]).entries).toEqual([
      { slot: 'a', role: 'rhythm', ref: null },
    ]);
    expect(dataBlockUserCount(result.current.ops.project, 'R')).toBe(0);

    act(() => undo());
    expect(result.current.desk.allDataBlocks).toEqual(before);
    expect(canUndo()).toBe(false);
    act(() => redo());
    expect(ids(result.current.desk.allDataBlocks)).toEqual(['C']);
    expect(collectionData(result.current.desk.allDataBlocks[0]).entries[0].ref).toBeNull();
  });

  it('make single user on a record user copies the packet and repoints only that slot', async () => {
    const { result } = await renderDeskAndOps();
    act(() => result.current.desk.addDataBlock(rhythm('R')));
    act(() =>
      result.current.desk.addDataBlock(collectionBlock('C1', 'One', [['a', 'rhythm', 'R']]))
    );
    act(() =>
      result.current.desk.addDataBlock(collectionBlock('C2', 'Two', [['a', 'rhythm', 'R']]))
    );
    resetHistory();
    const users = dataBlockUsers(result.current.ops.project, 'R');
    expect(users.map((user) => user.ownerId)).toEqual(['C1', 'C2']);

    let outcome: ReturnType<typeof result.current.ops.makeSingleUser> | undefined;
    act(() => {
      outcome = result.current.ops.makeSingleUser('R', users[1]);
    });
    expect(outcome).toEqual({ ok: true });
    const all = result.current.desk.allDataBlocks;
    expect(all).toHaveLength(4);
    const copy = all.find((block) => isPacketBlock(block) && block.id !== 'R')!;
    expect(copy.name).toBe('R (variation)');
    expect(collectionData(all.find((block) => block.id === 'C1')!).entries[0].ref).toEqual({
      id: 'R',
    });
    expect(collectionData(all.find((block) => block.id === 'C2')!).entries[0].ref).toEqual({
      id: copy.id,
    });
    // One undo step.
    act(() => undo());
    expect(ids(result.current.desk.allDataBlocks)).toEqual(['R', 'C1', 'C2']);
    expect(canUndo()).toBe(false);
  });

  it('Unused and Purge consider only the displayed blocks: an unused record survives Purge', async () => {
    const { result } = await renderDeskAndOps();
    act(() => result.current.desk.addDataBlock(rhythm('R')));
    act(() => result.current.desk.addDataBlock(rhythm('Lonely')));
    act(() =>
      result.current.desk.addDataBlock(collectionBlock('C', 'Pair', [['a', 'rhythm', 'R']]))
    );
    act(() => result.current.desk.addDataBlock(collectionBlock('Loose', 'Loose record', [])));
    const project = result.current.ops.project;
    // R is used by a record, so it is not unused; the unused record is not offered.
    expect(ids(unusedDeskBlocks(project))).toEqual(['Lonely']);
    expect(purgePlan(project)).toEqual(['Lonely', 'C', 'Loose']);

    let outcome: ReturnType<typeof result.current.ops.purge> | undefined;
    act(() => {
      outcome = result.current.ops.purge(unusedDeskBlocks(project).map((block) => block.id));
    });
    expect(outcome).toEqual({ ok: true });
    expect(ids(result.current.desk.allDataBlocks)).toEqual(['R', 'C', 'Loose']);
  });
});
