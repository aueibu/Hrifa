import { useState } from 'react';
import { act, render, waitFor } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataBlockSourceModule } from './components/DataBlockSourceModule';
import type { PublishedCompositionOutput } from './compositionRouting';
import {
  acceptsDataBlocks,
  captureDataBlock,
  commitDataBlockEdit,
  convertDataBlockToPitchClass,
  createDataBlockFromVersion,
  duplicateDataBlock,
  endEditSession,
  MAX_LINEAGE_CHARS,
  MAX_DATA_BLOCK_VERSIONS,
  restoreDataBlockVersion,
  type DataBlock,
} from './dataBlock';
import { DeskProvider, useDesk } from './desk';
import { renderDesk, storedDesk } from './deskTestUtils';
import { canRedo, canUndo, redo, resetHistory, undo } from './history';
import { melodicize, type NoteEventValue } from './melodicization';
import { packet, type DataPacket } from './model';
import { musicalDuration } from './musicalTime';
import { interpretPitchList } from './pitch';
import { createEvaluationStore, EvaluationStoreContext } from './runtime/evaluationStore';
import { ModuleEvaluationRunner } from './runtime/ModuleEvaluationRunner';
import { createOutputStore } from './runtime/outputStore';

vi.mock('./audio/AudioEngineProvider', () => ({
  useAudioEngine: () => ({
    playing: false,
    subscribe: () => () => undefined,
    setTransport: () => undefined,
    stopAll: () => undefined,
  }),
}));

/**
 * A data-block source module as the page places it: its runner (which evaluates and publishes) and its
 * view (which draws the evaluation). `onPublish` sees every publish.
 */
function SourceWithRunner({
  onPublish,
}: {
  onPublish: (id: string, outputs: PublishedCompositionOutput[]) => void;
}) {
  const [outputStore] = useState(() => {
    const store = createOutputStore();
    return {
      ...store,
      publish(id: string, outputs: PublishedCompositionOutput[]) {
        onPublish(id, outputs);
        store.publish(id, outputs);
      },
    };
  });
  const [evaluationStore] = useState(createEvaluationStore);
  return (
    <EvaluationStoreContext.Provider value={evaluationStore}>
      <ModuleEvaluationRunner
        outputStore={outputStore}
        evaluationStore={evaluationStore}
        instanceId="source-1"
        moduleId="data-block-source"
        instanceLabel="Source"
        dataBlockId="data-block-1"
        routeState={undefined}
      />
      <DataBlockSourceModule
        instanceId="source-1"
        instanceLabel="Source"
        dataBlockId="data-block-1"
      />
    </EvaluationStoreContext.Provider>
  );
}

function noteDataBlock(id = 'data-block-1'): DataBlock {
  const rhythm = packet(
    'list',
    'duration',
    [1, 1, 2].map((value, index) => ({ id: `rhythm:${index}`, value, provenance: [] })),
    [],
    undefined,
    { role: 'interOnset', frame: { topology: 'cyclic', unit: 'pulse', extent: 4 } }
  );
  const result = melodicize({
    instanceId: 'melodicization',
    rhythm,
    pitches: interpretPitchList({
      instanceId: 'pitch-list',
      format: 'midi-note',
      inlineText: '60, 64, 67',
    }).packet,
    allocation: 'cycle',
    pulseUnit: musicalDuration(1, 4),
    articulationPercent: 100,
  });
  const captured = captureDataBlock({
    id,
    createdAt: '2026-11-11T00:00:00Z',
    name: 'Gesture',
    moduleInstance: 'mel-1',
    packet: result.packet,
  });
  if (!captured.ok) {
    throw new Error(captured.error);
  }
  return captured.dataBlock;
}

/** A copy of the data-block packet with the first note raised an octave and one note added. */
function editedPacket(dataBlock: DataBlock): DataPacket {
  const copy = structuredClone(dataBlock.packet) as DataPacket<NoteEventValue>;
  copy.items[0].value.pitches = copy.items[0].value.pitches.map((pitch) => pitch + 1200);
  const extra = structuredClone(copy.items[1]);
  extra.id = 'new-note';
  extra.provenance = [];
  copy.items.push(extra);
  return copy;
}

const snapshot = <T,>(value: T) => JSON.parse(JSON.stringify(value)) as T;

describe('commitDataBlockEdit', () => {
  it('keeps id, createdAt, name and origin, replaces the packet, and appends provenance', () => {
    const dataBlock = noteDataBlock();
    const before = snapshot(dataBlock);
    const next = editedPacket(dataBlock);
    const result = commitDataBlockEdit(dataBlock, next, 'edit');
    if (!result.ok) {
      throw new Error(result.error);
    }
    const edited = result.dataBlock;
    expect(edited).not.toBe(dataBlock);
    expect(edited.id).toBe(dataBlock.id);
    expect(edited.createdAt).toBe(dataBlock.createdAt);
    expect(edited.name).toBe(dataBlock.name);
    expect(edited.origin).toEqual(dataBlock.origin);
    expect(edited.packet.items).toHaveLength(dataBlock.packet.items.length + 1);
    expect(edited.packet.items[0].value).not.toEqual(dataBlock.packet.items[0].value);

    const stamp = (index: number) => {
      const steps = edited.packet.items[index].provenance;
      return steps[steps.length - 1];
    };
    const last = edited.packet.items.length - 1;
    expect(stamp(0)).toMatchObject({
      transformation: 'edit',
      sourceItemIds: [edited.packet.items[0].id],
    });
    expect(stamp(0).parameters).toMatchObject({ dataBlockId: dataBlock.id, change: 'modified' });
    expect(stamp(last).parameters).toMatchObject({ change: 'added' });
    // Unchanged items get no step at all.
    expect(edited.packet.items[1].provenance).toEqual(dataBlock.packet.items[1].provenance);
    const headId = edited.lineage?.head;
    expect(stamp(0).parameters?.versionId).toBe(headId);

    // The input data-block is untouched, and the result does not alias the new packet.
    expect(dataBlock).toEqual(before);
    expect(edited.packet).not.toBe(next);
    expect(edited.packet.items[0]).not.toBe(next.items[0]);
    expect(next.items[0].provenance.some((step) => step.transformation === 'edit')).toBe(false);
    expect(acceptsDataBlocks([edited])).toBe(true);
    expect(JSON.parse(JSON.stringify(edited))).toEqual(edited);
  });

  it('rejects packets that are not JSON-safe or not valid, without throwing', () => {
    const dataBlock = noteDataBlock();
    const bad = (mutate: (copy: DataPacket) => void) => {
      const copy = structuredClone(dataBlock.packet);
      mutate(copy);
      return copy;
    };
    const cases: DataPacket[] = [
      bad((copy) => {
        copy.items[0].value = Number.NaN;
      }),
      bad((copy) => {
        copy.items[0].value = () => 1;
      }),
      bad((copy) => {
        copy.items[0].value = new Date();
      }),
      bad((copy) => {
        copy.items[1].id = copy.items[0].id;
      }),
      bad((copy) => {
        (copy as { items: unknown }).items = 'nope';
      }),
      bad((copy) => {
        (copy.items[0] as { provenance: unknown }).provenance = undefined;
      }),
    ];
    for (const invalid of cases) {
      expect(commitDataBlockEdit(dataBlock, invalid, 'edit').ok).toBe(false);
    }
    expect(commitDataBlockEdit(dataBlock, dataBlock.packet, '  ').ok).toBe(false);
  });
});

describe('commitDataBlockEditById', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHistory();
  });

  function setup() {
    return renderDesk();
  }

  it('replaces in place, is one undo step, redoes, and survives reload', async () => {
    const { result, unmount } = await setup();
    act(() => result.current.addDataBlock(noteDataBlock()));
    act(() => result.current.addDataBlock(noteDataBlock('other')));
    const before = snapshot(result.current.dataBlocks);

    let outcome: ReturnType<typeof result.current.commitDataBlockEditById> | undefined;
    act(() => {
      outcome = result.current.commitDataBlockEditById(
        'data-block-1',
        editedPacket(result.current.dataBlocks[0]),
        'edit'
      );
    });
    expect(outcome?.ok).toBe(true);
    const after = snapshot(result.current.dataBlocks);
    expect(after.map((dataBlock) => dataBlock.id)).toEqual(['data-block-1', 'other']);
    expect(after[0].packet).not.toEqual(before[0].packet);
    expect(after[1]).toEqual(before[1]);

    act(() => undo());
    expect(result.current.dataBlocks).toEqual(before);
    expect(canRedo()).toBe(true);
    act(() => redo());
    expect(result.current.dataBlocks).toEqual(after);

    expect(await storedDesk(result.current)).toEqual(after);
    unmount();
    const reloaded = await setup();
    expect(reloaded.result.current.dataBlocks).toEqual(after);
    expect(acceptsDataBlocks(reloaded.result.current.dataBlocks)).toBe(true);
    reloaded.unmount();
  });

  it('records nothing for an unchanged packet, an unknown id or an invalid packet', async () => {
    const { result } = await setup();
    act(() => result.current.addDataBlock(noteDataBlock()));
    const before = snapshot(result.current.dataBlocks);

    let outcomes: boolean[] = [];
    act(() => {
      const current = result.current.dataBlocks[0];
      outcomes = [
        result.current.commitDataBlockEditById(
          'data-block-1',
          structuredClone(current.packet),
          'edit'
        ).ok,
        result.current.commitDataBlockEditById('missing', editedPacket(current), 'edit').ok,
        result.current.commitDataBlockEditById(
          'data-block-1',
          { ...current.packet, items: [{ id: 'x', value: Number.NaN, provenance: [] }] },
          'edit'
        ).ok,
      ];
    });
    expect(outcomes).toEqual([true, false, false]);
    expect(result.current.dataBlocks).toEqual(before);
    // The only history entry is still the add.
    act(() => undo());
    expect(result.current.dataBlocks).toEqual([]);
    expect(canUndo()).toBe(false);
  });

  it('a Make-source module for the data-block publishes the new packet after an edit, and after undo', async () => {
    const published: Record<string, PublishedCompositionOutput[]> = {};
    const onOutputsChange = (id: string, outputs: PublishedCompositionOutput[]) => {
      published[id] = outputs;
    };
    let desk: ReturnType<typeof useDesk> | undefined;
    function Probe() {
      desk = useDesk();
      return null;
    }
    render(
      <DeskProvider>
        <Probe />
        <SourceWithRunner onPublish={onOutputsChange} />
      </DeskProvider>
    );
    await waitFor(() => expect(desk?.loading).toBe(false));
    act(() => desk?.addDataBlock(noteDataBlock()));
    const original = snapshot(published['source-1'][0].packet);
    expect(original).toEqual(snapshot(noteDataBlock().packet));

    act(() => {
      desk?.commitDataBlockEditById('data-block-1', editedPacket(desk.dataBlocks[0]), 'edit');
    });
    const updated = published['source-1'][0].packet;
    expect(updated).toEqual(desk?.dataBlocks[0].packet);
    expect(updated.items).toHaveLength(original.items.length + 1);

    act(() => undo());
    expect(published['source-1'][0].packet).toEqual(original);
  });
});

// Each call is its own version here (the edit-session rule is tested in editSessions.test.tsx).
const edit = (dataBlock: DataBlock, packet: DataPacket, operation = 'edit') => {
  endEditSession(dataBlock.id);
  const result = commitDataBlockEdit(dataBlock, packet, operation);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.dataBlock;
};

/** The data-block packet with note `index` shifted by `cents`. */
function shifted(dataBlock: DataBlock, index: number, cents: number): DataPacket {
  const copy = structuredClone(dataBlock.packet) as DataPacket<NoteEventValue>;
  copy.items[index].value.pitches = copy.items[index].value.pitches.map((pitch) => pitch + cents);
  return copy;
}

const rootOf = (dataBlock: DataBlock) =>
  dataBlock.lineage!.versions.find((version) => version.parentId === null)!.id;

describe('lineage', () => {
  it('a never-edited data-block stores no lineage; the first edit creates the root, then the head', () => {
    const dataBlock = noteDataBlock();
    expect(dataBlock.lineage).toBeUndefined();
    const once = edit(dataBlock, shifted(dataBlock, 0, 100));
    const { head, versions } = once.lineage!;
    expect(versions).toHaveLength(2);
    const root = versions.find((version) => version.parentId === null)!;
    expect(root.operation).toBe('original');
    expect(root.packet).toEqual(dataBlock.packet);
    const current = versions.find((version) => version.id === head)!;
    expect(current.parentId).toBe(root.id);
    // The head holds no second copy of the packet: it is the data-block packet.
    expect(current.packet).toBeUndefined();
    const twice = edit(once, shifted(once, 1, 100));
    expect(twice.lineage?.versions).toHaveLength(3);
    expect(twice.lineage?.versions.find((v) => v.id === once.lineage?.head)?.packet).toEqual(
      once.packet
    );
    expect(acceptsDataBlocks([twice])).toBe(true);
  });

  it('refuses edits that change kind, domain or encoding, and never throws on a cyclic packet', () => {
    const dataBlock = noteDataBlock();
    for (const change of [
      { kind: 'list' as const },
      { domain: 'duration' as const },
      { encoding: 'chromatic-12' as const },
    ]) {
      const result = commitDataBlockEdit(dataBlock, { ...dataBlock.packet, ...change }, 'edit');
      expect(result.ok).toBe(false);
    }
    const cyclic = structuredClone(dataBlock.packet) as DataPacket & { self?: unknown };
    cyclic.self = cyclic;
    expect(commitDataBlockEdit(dataBlock, cyclic, 'edit').ok).toBe(false);
  });

  it('records reordering as a real change without stamping any item', () => {
    const dataBlock = noteDataBlock();
    const reordered = structuredClone(dataBlock.packet);
    reordered.items.reverse();
    const result = edit(dataBlock, reordered);
    expect(result.lineage?.versions).toHaveLength(2);
    expect(result.packet.items.map((item) => item.id)).toEqual(
      reordered.items.map((item) => item.id)
    );
    for (const item of result.packet.items) {
      expect(item.provenance.some((step) => step.transformation === 'edit')).toBe(false);
    }
  });

  it('restore moves the head back, keeps every snapshot, and a following edit branches', () => {
    const base = noteDataBlock();
    const one = edit(base, shifted(base, 0, 100));
    const two = edit(one, shifted(one, 0, 100));
    const rootId = rootOf(one);

    const restored = restoreDataBlockVersion(two, rootId);
    if (!restored.ok) {
      throw new Error(restored.error);
    }
    expect(restored.dataBlock.id).toBe(base.id);
    expect(restored.dataBlock.packet).toEqual(base.packet);
    expect(restored.dataBlock.lineage?.head).toBe(rootId);
    expect(restored.dataBlock.lineage?.versions).toHaveLength(3);
    expect(acceptsDataBlocks([restored.dataBlock])).toBe(true);
    // The state we left is still there.
    expect(
      restored.dataBlock.lineage?.versions.find((version) => version.id === two.lineage?.head)
        ?.packet
    ).toEqual(two.packet);

    const branched = edit(restored.dataBlock, shifted(restored.dataBlock, 2, 300));
    expect(branched.lineage!.versions).toHaveLength(4);
    expect(
      branched.lineage!.versions.filter((version) => version.parentId === rootId)
    ).toHaveLength(2);
    expect(acceptsDataBlocks([branched])).toBe(true);

    expect(restoreDataBlockVersion(base, rootId).ok).toBe(false);
    expect(restoreDataBlockVersion(two, 'nope').ok).toBe(false);
    const same = restoreDataBlockVersion(two, two.lineage!.head);
    expect(same.ok && same.dataBlock === two).toBe(true);
  });

  it('createDataBlockFromVersion makes a new derived data-block with its own history', () => {
    const base = noteDataBlock();
    const one = edit(base, shifted(base, 0, 100));
    const rootId = rootOf(one);
    const before = snapshot(one);
    const result = createDataBlockFromVersion(one, rootId, { id: 'child', createdAt: 'T' });
    if (!result.ok) {
      throw new Error(result.error);
    }
    const child = result.dataBlock;
    expect(one).toEqual(before);
    expect(child.id).toBe('child');
    expect(child.name).toBe('Gesture (from earlier)');
    expect(child.packet.items.map((item) => item.value)).toEqual(
      base.packet.items.map((item) => item.value)
    );
    expect(child.lineage?.derivedFrom).toEqual({
      dataBlockId: base.id,
      versionId: rootId,
      operation: 'create-from-version',
    });
    expect(child.lineage?.versions).toHaveLength(1);
    expect(acceptsDataBlocks([child])).toBe(true);
    expect(createDataBlockFromVersion(one, 'nope', { id: 'x', createdAt: 'T' }).ok).toBe(false);
  });

  it('duplicate and pitch-class conversion record derivedFrom and do not copy the tree', () => {
    const base = noteDataBlock();
    const plain = duplicateDataBlock(base, { id: 'dup', createdAt: 'T' });
    expect(plain.lineage?.derivedFrom).toEqual({
      dataBlockId: base.id,
      versionId: null,
      operation: 'duplicate',
    });
    expect(base.lineage).toBeUndefined();

    const edited = edit(base, shifted(base, 0, 100));
    const dup = duplicateDataBlock(edited, { id: 'dup2', createdAt: 'T' });
    expect(dup.lineage?.derivedFrom?.versionId).toBe(edited.lineage?.head);
    expect(dup.lineage?.versions).toHaveLength(1);
    const converted = convertDataBlockToPitchClass(edited, { id: 'pc', createdAt: 'T', edo: 12 });
    expect(converted.ok && converted.dataBlock.lineage?.derivedFrom).toMatchObject({
      dataBlockId: base.id,
      versionId: edited.lineage?.head,
      operation: 'to-pitch-class',
    });
    expect(acceptsDataBlocks([edited, dup, plain])).toBe(true);
  });

  it('prunes by count and by size, keeping a connected tree with the head and root', () => {
    let dataBlock = noteDataBlock();
    const limits = { maxVersions: 5, maxChars: Number.POSITIVE_INFINITY };
    for (let index = 0; index < 12; index += 1) {
      const result = commitDataBlockEdit(dataBlock, shifted(dataBlock, 0, 100), 'edit', {
        limits,
      });
      if (!result.ok) {
        throw new Error(result.error);
      }
      dataBlock = result.dataBlock;
      expect(dataBlock.lineage!.versions.length).toBeLessThanOrEqual(5);
      expect(acceptsDataBlocks([dataBlock])).toBe(true);
    }
    expect(dataBlock.lineage!.versions.some((version) => version.parentId === null)).toBe(true);
    expect(
      dataBlock.lineage!.versions.some((version) => version.id === dataBlock.lineage!.head)
    ).toBe(true);

    // A branch tip survives while an interior ancestor goes.
    const tight = { maxVersions: 4, maxChars: Number.POSITIVE_INFINITY };
    const first = noteDataBlock();
    let tree = edit(first, shifted(first, 0, 1));
    const rootId = rootOf(tree);
    tree = edit(tree, shifted(tree, 0, 1));
    const tipId = tree.lineage!.head;
    const restored = restoreDataBlockVersion(tree, rootId);
    if (!restored.ok) {
      throw new Error(restored.error);
    }
    let grown = restored.dataBlock;
    for (let index = 0; index < 3; index += 1) {
      const result = commitDataBlockEdit(grown, shifted(grown, 1, 5), 'edit', {
        limits: tight,
      });
      if (!result.ok) {
        throw new Error(result.error);
      }
      grown = result.dataBlock;
    }
    expect(grown.lineage!.versions.length).toBeLessThanOrEqual(4);
    expect(grown.lineage!.versions.some((version) => version.id === tipId)).toBe(true);
    expect(grown.lineage!.versions.some((version) => version.id === rootId)).toBe(true);
    expect(acceptsDataBlocks([grown])).toBe(true);

    // A byte budget alone also bounds it, down to root plus head.
    const sized = commitDataBlockEdit(dataBlock, shifted(dataBlock, 0, 100), 'edit', {
      limits: { maxVersions: 100, maxChars: 1 },
    });
    expect(sized.ok && sized.dataBlock.lineage!.versions.length).toBe(2);
    expect(MAX_DATA_BLOCK_VERSIONS).toBeGreaterThan(1);
    expect(MAX_LINEAGE_CHARS).toBeGreaterThan(1);
  });

  it('acceptsDataBlocks takes v1 data-blocks without lineage and rejects malformed lineage', () => {
    const base = noteDataBlock();
    const good = edit(base, shifted(base, 0, 100));
    expect(acceptsDataBlocks([base])).toBe(true);
    expect(acceptsDataBlocks([good])).toBe(true);
    const accepts = (change: (lineage: NonNullable<DataBlock['lineage']>) => void) => {
      const copy = snapshot(good);
      change(copy.lineage!);
      return acceptsDataBlocks([copy]);
    };
    expect(accepts((l) => (l.head = 'missing'))).toBe(false);
    expect(accepts((l) => (l.versions[1].parentId = 'dangling'))).toBe(false);
    expect(
      accepts((l) => {
        l.versions[0].parentId = l.versions[1].id;
      })
    ).toBe(false);
    expect(accepts((l) => (l.versions[1].parentId = l.versions[1].id))).toBe(false);
    expect(accepts((l) => (l.versions = []))).toBe(false);
    expect(accepts((l) => (l.versions[0].packet = undefined))).toBe(false);
    expect(accepts((l) => (l.versions[1].packet = structuredClone(good.packet)))).toBe(false);
    expect(accepts((l) => l.versions.push({ ...l.versions[0] }))).toBe(false);
    expect(
      accepts((l) => {
        (l as { derivedFrom?: unknown }).derivedFrom = { dataBlockId: 3 };
      })
    ).toBe(false);
    expect(acceptsDataBlocks([{ ...snapshot(good), lineage: 'x' }])).toBe(false);
  });
});

describe('lineage operations on the desk', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHistory();
  });

  it('commit, restore and create-from-version are each one undo step, and reload round-trips', async () => {
    const { result, unmount } = await renderDesk();
    act(() => result.current.addDataBlock(noteDataBlock()));
    const states = [snapshot(result.current.dataBlocks)];
    const run = (action: (desk: ReturnType<typeof useDesk>) => unknown) => {
      act(() => void action(result.current));
      states.push(snapshot(result.current.dataBlocks));
    };
    run((desk) =>
      desk.commitDataBlockEditById('data-block-1', shifted(desk.dataBlocks[0], 0, 100), 'edit')
    );
    run((desk) =>
      desk.commitDataBlockEditById('data-block-1', shifted(desk.dataBlocks[0], 1, 100), 'edit')
    );
    const rootId = rootOf(result.current.dataBlocks[0]);
    run((desk) => desk.restoreDataBlockVersionById('data-block-1', rootId));
    run((desk) => desk.createDataBlockFromVersionById('data-block-1', rootId));
    run((desk) => desk.duplicateDataBlockById('data-block-1'));
    expect(result.current.dataBlocks).toHaveLength(3);
    expect(acceptsDataBlocks(result.current.dataBlocks)).toBe(true);

    // Restoring the head, an unknown version or an unknown data-block records nothing.
    const headId = result.current.dataBlocks[0].lineage!.head;
    act(() => {
      result.current.restoreDataBlockVersionById('data-block-1', headId);
      expect(result.current.restoreDataBlockVersionById('data-block-1', 'nope').ok).toBe(false);
      expect(result.current.createDataBlockFromVersionById('missing', 'nope').ok).toBe(false);
    });
    expect(snapshot(result.current.dataBlocks)).toEqual(states[states.length - 1]);

    // Reload round trip: stored desk equals the live desk and passes the shape check.
    const final = states[states.length - 1];
    expect(await storedDesk(result.current)).toEqual(final);

    for (let index = states.length - 2; index >= 0; index -= 1) {
      act(() => undo());
      expect(result.current.dataBlocks).toEqual(states[index]);
    }
    for (let index = 1; index < states.length; index += 1) {
      act(() => redo());
      expect(result.current.dataBlocks).toEqual(states[index]);
    }
    unmount();
    const reloaded = await renderDesk();
    expect(reloaded.result.current.dataBlocks).toEqual(final);
    reloaded.unmount();
  });

  it('a Make-source module follows an edit and a restore', async () => {
    const published: Record<string, PublishedCompositionOutput[]> = {};
    let desk: ReturnType<typeof useDesk> | undefined;
    function Probe() {
      desk = useDesk();
      return null;
    }
    render(
      <DeskProvider>
        <Probe />
        <SourceWithRunner
          onPublish={(id, outputs) => {
            published[id] = outputs;
          }}
        />
      </DeskProvider>
    );
    await waitFor(() => expect(desk?.loading).toBe(false));
    act(() => desk?.addDataBlock(noteDataBlock()));
    const original = snapshot(published['source-1'][0].packet);
    act(() => {
      desk?.commitDataBlockEditById('data-block-1', shifted(desk.dataBlocks[0], 0, 100), 'edit');
    });
    expect(published['source-1'][0].packet).toEqual(desk?.dataBlocks[0].packet);
    expect(published['source-1'][0].packet).not.toEqual(original);
    const rootId = rootOf(desk!.dataBlocks[0]);
    act(() => {
      desk?.restoreDataBlockVersionById('data-block-1', rootId);
    });
    expect(published['source-1'][0].packet).toEqual(original);
  });
});
