import { act, render, screen, userEvent, waitFor } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransportBar } from './components/TransportBar';
import { CompositionSettingsProvider } from './compositionSettings';
import { acceptsDataBlocks, captureDataBlock, type DataBlock } from './dataBlock';
import { DeskProvider, useDesk } from './desk';
import { renderDesk, storedDesk } from './deskTestUtils';
import { canRedo, canUndo, HISTORY_DEPTH, redo, resetHistory, undo } from './history';
import { melodicize } from './melodicization';
import { packet } from './model';
import { musicalDuration } from './musicalTime';
import { interpretPitchList } from './pitch';
import { compositionStateKeys } from './usePersistentState';

vi.mock('./audio/AudioEngineProvider', () => ({
  useAudioEngine: () => ({
    playing: false,
    subscribe: () => () => undefined,
    setTransport: () => undefined,
    stopAll: () => undefined,
  }),
}));

function noteDataBlock(id = 'data-block-1', name = 'Gesture'): DataBlock {
  const rhythm = packet(
    'list',
    'duration',
    [1, 1, 2, 1].map((value, index) => ({ id: `rhythm:${index}`, value, provenance: [] })),
    [],
    undefined,
    { role: 'interOnset', frame: { topology: 'cyclic', unit: 'pulse', extent: 5 } }
  );
  const result = melodicize({
    instanceId: 'melodicization',
    rhythm,
    pitches: interpretPitchList({
      instanceId: 'pitch-list',
      format: 'midi-note',
      inlineText: '60, 64, 67, 72',
    }).packet,
    allocation: 'cycle',
    pulseUnit: musicalDuration(1, 4),
    articulationPercent: 100,
  });
  const captured = captureDataBlock({
    id,
    createdAt: '2026-11-11T00:00:00Z',
    name,
    moduleInstance: 'mel-1',
    packet: result.packet,
  });
  if (!captured.ok) {
    throw new Error(captured.error);
  }
  return captured.dataBlock;
}

async function setup() {
  localStorage.clear();
  resetHistory();
  return renderDesk();
}

/** Deep snapshot so a later mutation of shared objects could not hide a bad restore. */
const snapshot = (dataBlocks: DataBlock[]) => JSON.parse(JSON.stringify(dataBlocks)) as DataBlock[];

describe('desk history', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHistory();
  });

  it('starts empty: nothing to undo or redo, and both are no-ops', async () => {
    const { result } = await setup();
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(false);
    act(() => undo());
    act(() => redo());
    expect(result.current.dataBlocks).toEqual([]);
  });

  type Desk = ReturnType<typeof useDesk>;
  const mutations: [string, (desk: Desk) => void][] = [
    ['add', (desk) => desk.addDataBlock(noteDataBlock('data-block-2', 'Other'))],
    ['remove', (desk) => desk.removeDataBlock('data-block-1')],
    ['rename', (desk) => desk.renameDataBlock('data-block-1', 'Renamed')],
    ['note', (desk) => desk.setDataBlockNote('data-block-1', 'a fresh note')],
    ['duplicate', (desk) => desk.duplicateDataBlockById('data-block-1')],
    [
      'convert to pitch class',
      (desk) => void desk.convertToPitchClassById('data-block-1', { edo: 12 }),
    ],
  ];

  it.each(mutations)(
    'undoes and redoes %s, restoring the exact data-blocks',
    async (_name, mutate) => {
      const { result } = await setup();
      act(() => result.current.addDataBlock(noteDataBlock()));
      const before = snapshot(result.current.dataBlocks);
      act(() => mutate(result.current));
      const after = snapshot(result.current.dataBlocks);
      expect(after).not.toEqual(before);
      expect(canUndo()).toBe(true);

      act(() => undo());
      expect(result.current.dataBlocks).toEqual(before);
      expect(await storedDesk(result.current)).toEqual(before);
      expect(canRedo()).toBe(true);

      act(() => redo());
      expect(result.current.dataBlocks).toEqual(after);
      expect(await storedDesk(result.current)).toEqual(after);
      expect(canRedo()).toBe(false);
    }
  );

  it('steps back through several changes in order', async () => {
    const { result } = await setup();
    const states: DataBlock[][] = [[]];
    const run = (mutate: (desk: Desk) => void) => {
      act(() => mutate(result.current));
      states.push(snapshot(result.current.dataBlocks));
    };
    run((desk) => desk.addDataBlock(noteDataBlock()));
    run((desk) => desk.renameDataBlock('data-block-1', 'B'));
    run((desk) => desk.duplicateDataBlockById('data-block-1'));
    for (let index = states.length - 2; index >= 0; index -= 1) {
      act(() => undo());
      expect(result.current.dataBlocks).toEqual(states[index]);
    }
    expect(canUndo()).toBe(false);
  });

  it('records changes made together in one event as separate entries', async () => {
    const { result } = await setup();
    act(() => {
      result.current.addDataBlock(noteDataBlock('a', 'A'));
      result.current.addDataBlock(noteDataBlock('b', 'B'));
    });
    act(() => undo());
    expect(result.current.dataBlocks.map((dataBlock) => dataBlock.id)).toEqual(['a']);
  });

  it('clears redo when a new change follows an undo', async () => {
    const { result } = await setup();
    act(() => result.current.addDataBlock(noteDataBlock()));
    act(() => result.current.renameDataBlock('data-block-1', 'B'));
    act(() => undo());
    expect(canRedo()).toBe(true);
    act(() => result.current.renameDataBlock('data-block-1', 'C'));
    expect(canRedo()).toBe(false);
    act(() => redo());
    expect(result.current.dataBlocks[0].name).toBe('C');
  });

  it('records nothing for changes that do nothing', async () => {
    const { result } = await setup();
    act(() => result.current.addDataBlock(noteDataBlock()));
    act(() => undo());
    act(() => redo());
    act(() => {
      result.current.removeDataBlock('missing');
      result.current.renameDataBlock('data-block-1', 'Gesture');
      result.current.renameDataBlock('missing', 'x');
      result.current.duplicateDataBlockById('missing');
      result.current.convertToPitchClassById('missing', { edo: 12 });
    });
    expect(result.current.dataBlocks).toHaveLength(1);
    expect(canRedo()).toBe(false);
    act(() => undo());
    expect(result.current.dataBlocks).toEqual([]);
  });

  it('is bounded to the history depth', async () => {
    const { result } = await setup();
    for (let index = 0; index < HISTORY_DEPTH + 5; index += 1) {
      act(() => result.current.addDataBlock(noteDataBlock(`s-${index}`)));
    }
    for (let index = 0; index < HISTORY_DEPTH + 5; index += 1) {
      act(() => undo());
    }
    expect(canUndo()).toBe(false);
    expect(result.current.dataBlocks).toHaveLength(5);
  });

  it('keeps the stored desk equal to the data-blocks, valid, and free of history', async () => {
    const { result } = await setup();
    act(() => result.current.addDataBlock(noteDataBlock()));
    act(() => result.current.renameDataBlock('data-block-1', 'B'));
    act(() => undo());
    const saved = await storedDesk(result.current);
    expect(saved).toEqual(result.current.dataBlocks);
    expect(acceptsDataBlocks(saved)).toBe(true);
    // The desk lives in IndexedDB now: nothing is written to the old localStorage key.
    expect(localStorage.getItem(compositionStateKeys.desk)).toBeNull();
  });

  it('does not carry history across a reload', async () => {
    const first = await setup();
    act(() => first.result.current.addDataBlock(noteDataBlock()));
    const saved = snapshot(first.result.current.dataBlocks);
    first.unmount();
    resetHistory(); // a reload starts a fresh session
    const reloaded = await renderDesk();
    expect(reloaded.result.current.dataBlocks).toEqual(saved);
    expect(canUndo()).toBe(false);
  });
});

describe('Undo and Redo buttons', () => {
  function Seed() {
    const { addDataBlock, dataBlocks, loading } = useDesk();
    return (
      <>
        <button type="button" disabled={loading} onClick={() => addDataBlock(noteDataBlock())}>
          seed
        </button>
        <div data-testid="count">{dataBlocks.length}</div>
      </>
    );
  }
  async function renderBar() {
    localStorage.clear();
    resetHistory();
    const rendered = render(
      <CompositionSettingsProvider>
        <DeskProvider>
          <TransportBar selectedInstanceId={null} />
          <Seed />
          <input aria-label="field" />
        </DeskProvider>
      </CompositionSettingsProvider>
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'seed' })).toBeEnabled());
    return rendered;
  }

  it('are disabled when empty, focusable when enabled, and drive the desk', async () => {
    await renderBar();
    const undo = screen.getByRole('button', { name: 'Undo' });
    const redo = screen.getByRole('button', { name: 'Redo' });
    expect((undo as HTMLButtonElement).disabled).toBe(true);
    expect((redo as HTMLButtonElement).disabled).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'seed' }));
    expect((undo as HTMLButtonElement).disabled).toBe(false);
    undo.focus();
    expect(document.activeElement).toBe(undo);
    await userEvent.keyboard('{Enter}');
    expect(screen.getByTestId('count').textContent).toBe('0');
    expect((redo as HTMLButtonElement).disabled).toBe(false);
    await userEvent.click(redo);
    expect(screen.getByTestId('count').textContent).toBe('1');
  });

  it('answers Ctrl+Z and Ctrl+Shift+Z from anywhere, including a focused field', async () => {
    await renderBar();
    await userEvent.click(screen.getByRole('button', { name: 'seed' }));
    const field = screen.getByLabelText('field');
    await userEvent.click(field);
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(screen.getByTestId('count').textContent).toBe('0');
    await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    expect(screen.getByTestId('count').textContent).toBe('1');

    // And with a button focused, which the first version ignored.
    screen.getByRole('button', { name: 'seed' }).focus();
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(screen.getByTestId('count').textContent).toBe('0');
  });
});
