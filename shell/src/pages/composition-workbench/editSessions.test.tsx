import { act } from '@test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  acceptsDataBlocks,
  commitDataBlockEdit,
  EDIT_SESSION_IDLE_MS,
  endEditSession,
  restoreDataBlockVersion,
  type DataBlock,
} from './dataBlock';
import { renderDesk } from './deskTestUtils';
import { canUndo, resetHistory, undo } from './history';
import { packet, type DataItem, type DataPacket } from './model';
import { musicalDuration, musicalPosition } from './musicalTime';

function notes(count: number, shift = 0): DataItem[] {
  return Array.from({ length: count }, (_unused, index) => ({
    id: `note:${index}`,
    value: {
      onset: musicalPosition(index),
      interOnset: musicalDuration(1),
      duration: musicalDuration(1),
      pitches: [6000 + (shift + (index % 12)) * 100],
      velocity: 90,
    },
    provenance: [],
  }));
}

function dataBlock(id: string): DataBlock {
  return {
    schemaVersion: 1,
    id,
    name: id,
    createdAt: '2026-11-11T00:00:00Z',
    packet: packet('events', 'note', notes(4)),
  };
}

const shifted = (shift: number): DataPacket => packet('events', 'note', notes(4, shift));
const plain = <T,>(value: T) => JSON.parse(JSON.stringify(value)) as T;
const T0 = Date.parse('2026-11-11T01:00:00Z');
const at = (ms: number) => new Date(T0 + ms).toISOString();

function commit(
  dataBlock: DataBlock,
  shift: number,
  operation: string,
  ms: number,
  handEdit = operation.startsWith('edit')
) {
  const result = commitDataBlockEdit(dataBlock, shifted(shift), operation, {
    at: at(ms),
    handEdit,
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.dataBlock;
}

beforeEach(() => {
  resetHistory();
});

describe('edit sessions', () => {
  it('amend the head version for every edit in a session, with provenance stamped once', () => {
    let current = dataBlock('s1');
    for (let shift = 1; shift <= 6; shift += 1) {
      current = commit(current, shift, 'edit', shift * 1000);
    }
    const { lineage } = current;
    expect(lineage!.versions).toHaveLength(2);
    expect(current.packet.items[0].value).toMatchObject({ pitches: [6600] });
    expect(
      current.packet.items[0].provenance.filter((step) => step.transformation === 'edit')
    ).toHaveLength(1);
    expect(lineage!.versions.find((version) => version.parentId === null)!.packet).toEqual(
      dataBlock('s1').packet
    );
    expect(acceptsDataBlocks([current])).toBe(true);
  });

  it('end on endEditSession, on idle time, on a different operator and on a restore', () => {
    let current = commit(dataBlock('s2'), 1, 'edit', 0);
    current = commit(current, 2, 'edit', 1000);
    expect(current.lineage!.versions).toHaveLength(2);

    endEditSession('s2');
    current = commit(current, 3, 'edit', 2000);
    expect(current.lineage!.versions).toHaveLength(3);

    current = commit(current, 4, 'edit', 2000 + EDIT_SESSION_IDLE_MS - 1);
    expect(current.lineage!.versions).toHaveLength(3);
    current = commit(current, 5, 'edit', 2000 + EDIT_SESSION_IDLE_MS * 2);
    expect(current.lineage!.versions).toHaveLength(4);

    // A transform is always a version of its own, and so is the same transform twice.
    current = commit(current, 6, 'transpose', 2000 + EDIT_SESSION_IDLE_MS * 2 + 10);
    expect(current.lineage!.versions).toHaveLength(5);
    current = commit(current, 7, 'transpose', 2000 + EDIT_SESSION_IDLE_MS * 2 + 20);
    expect(current.lineage!.versions).toHaveLength(6);
    // Editing after a transform starts a new session, and a different edit kind does too.
    current = commit(current, 8, 'edit', EDIT_SESSION_IDLE_MS * 3);
    expect(current.lineage!.versions).toHaveLength(7);
    current = commit(current, 9, 'edit-notes', EDIT_SESSION_IDLE_MS * 3 + 10);
    expect(current.lineage!.versions).toHaveLength(8);

    // Restoring an earlier version ends the session: the next edit branches from it.
    current = commit(current, 10, 'edit-notes', EDIT_SESSION_IDLE_MS * 3 + 20);
    expect(current.lineage!.versions).toHaveLength(8);
    const earlier = current.lineage!.versions.find((version) => version.parentId === null)!;
    const restored = restoreDataBlockVersion(current, earlier.id);
    if (!restored.ok) {
      throw new Error(restored.error);
    }
    const branched = commit(restored.dataBlock, 11, 'edit-notes', EDIT_SESSION_IDLE_MS * 3 + 30);
    expect(branched.lineage!.versions).toHaveLength(9);
    expect(acceptsDataBlocks([branched])).toBe(true);
  });

  it('never amend without handEdit, whatever the operation is called (rhythmEdit names)', () => {
    let current = commit(dataBlock('s5'), 1, 'edit-length', 0, false);
    current = commit(current, 2, 'edit-length', 1000, false);
    current = commit(current, 3, 'edit-rhythm', 2000, false);
    expect(current.lineage!.versions).toHaveLength(4);
  });

  it('make one version but several undo steps, and undo restores the exact prior data-blocks', async () => {
    const { result } = await renderDesk();
    act(() => result.current.addDataBlock(dataBlock('s3')));
    const states = [plain(result.current.dataBlocks)];
    for (let shift = 1; shift <= 3; shift += 1) {
      // Separate gestures (distinct coalesce keys), one edit session.
      act(() => {
        const edited = result.current.commitDataBlockEditById('s3', shifted(shift), 'edit', {
          coalesceKey: `gesture:${shift}`,
          handEdit: true,
        });
        expect(edited.ok).toBe(true);
      });
      states.push(plain(result.current.dataBlocks));
    }
    expect(result.current.dataBlocks[0].lineage!.versions).toHaveLength(2);
    expect(canUndo()).toBe(true);

    act(() => undo());
    expect(plain(result.current.dataBlocks)).toEqual(states[2]);
    act(() => undo());
    expect(plain(result.current.dataBlocks)).toEqual(states[1]);
    // Lineage included: after the first edit it still holds the one version made by the session.
    expect(result.current.dataBlocks[0].lineage!.versions).toHaveLength(2);
    act(() => undo());
    expect(plain(result.current.dataBlocks)).toEqual(states[0]);
    expect(result.current.dataBlocks[0].lineage).toBeUndefined();

    // Editing again after undoing the whole session starts a fresh one.
    act(() => {
      result.current.commitDataBlockEditById('s3', shifted(5), 'edit', { handEdit: true });
    });
    expect(result.current.dataBlocks[0].lineage!.versions).toHaveLength(2);
  });

  it('a transform on the desk makes its own version even right after hand edits', async () => {
    const { result } = await renderDesk();
    act(() => result.current.addDataBlock(dataBlock('s4')));
    act(() => {
      result.current.commitDataBlockEditById('s4', shifted(1), 'edit', { handEdit: true });
      result.current.commitDataBlockEditById('s4', shifted(2), 'edit', { handEdit: true });
    });
    expect(result.current.dataBlocks[0].lineage!.versions).toHaveLength(2);
    act(() => {
      result.current.commitDataBlockEditById('s4', shifted(3), 'transpose');
    });
    expect(result.current.dataBlocks[0].lineage!.versions).toHaveLength(3);
    act(() => result.current.endEditSession('s4'));
    act(() => {
      result.current.commitDataBlockEditById('s4', shifted(4), 'edit', { handEdit: true });
    });
    expect(result.current.dataBlocks[0].lineage!.versions).toHaveLength(4);
  });

  it('a refused edit returns ok:false and leaves the edit session alone', async () => {
    const { result } = await renderDesk();
    act(() => result.current.addDataBlock(dataBlock('s5')));
    const before = plain(result.current.dataBlocks);
    // A project open freezes the desk: edits, restores and create-from-version are refused.
    await act(async () => {
      await result.current.replaceDesk(result.current.dataBlocks, { reloading: true });
    });
    const outcomes: boolean[] = [];
    act(() => {
      outcomes.push(
        result.current.commitDataBlockEditById('s5', shifted(1), 'edit', { handEdit: true }).ok,
        result.current.restoreDataBlockVersionById('s5', 'any').ok,
        result.current.createDataBlockFromVersionById('s5', 'any').ok
      );
    });
    expect(outcomes).toEqual([false, false, false]);
    expect(plain(result.current.dataBlocks)).toEqual(before);

    await act(async () => {
      await result.current.replaceDesk(result.current.dataBlocks, { restore: true });
    });
    act(() => {
      result.current.commitDataBlockEditById('s5', shifted(2), 'edit', { handEdit: true });
      result.current.commitDataBlockEditById('s5', shifted(3), 'edit', { handEdit: true });
    });
    // One session: root plus one amended head, as if the refused edit never happened.
    expect(result.current.dataBlocks[0].lineage!.versions).toHaveLength(2);
  });
});
