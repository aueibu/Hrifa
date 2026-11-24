import { act, render, screen, userEvent, waitFor, within } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompositionWorkbenchPage } from '../CompositionWorkbench.page';
import type { ChordSession } from './chordInput/chordSession';
import type { DataBlock } from './dataBlock';
import { DATA_BLOCK_SLOT, type DataBlockEditorSession } from './dataBlockEditorSession';
import { seedDesk } from './deskTestUtils';
import { resetHistory } from './history';
import { storeDefaultScreensets } from './layout/screensetFixtures';
import type { NoteEventValue } from './melodicization';
import { packet } from './model';
import { musicalDuration, musicalPosition } from './musicalTime';
import type { NoteSelection } from './noteSelection';
import type { WorkbenchSelectionValue } from './WorkbenchSelection';

// The page mounts the real `WorkbenchSessions`; this wrapper hands it sessions the test can see and
// renders a probe of the selection chain inside it, exactly where the page's Stage and editors sit.
const seen = vi.hoisted(() => ({
  chord: null as unknown,
  dataBlock: null as unknown,
  props: [] as Array<{ inspectorTarget: unknown; dataBlockId: unknown }>,
  mounts: 0,
  selection: null as unknown,
}));

vi.mock('./WorkbenchSessions', async (importOriginal) => {
  const original = await importOriginal<typeof import('./WorkbenchSessions')>();
  const { useEffect, useRef } = await import('react');
  const { ChordSession: Chord } = await import('./chordInput/chordSession');
  const { DataBlockEditorSession: EditorSession } = await import('./dataBlockEditorSession');
  const { useWorkbenchSelection: useSelection } = await import('./WorkbenchSelection');
  function Probe() {
    seen.selection = useSelection();
    return null;
  }
  return {
    ...original,
    WorkbenchSessions(props: Parameters<typeof original.WorkbenchSessions>[0]) {
      const chord = useRef<InstanceType<typeof Chord>>(null as never);
      const dataBlock = useRef<InstanceType<typeof EditorSession>>(null as never);
      chord.current ??= new Chord();
      dataBlock.current ??= new EditorSession();
      seen.chord = chord.current;
      seen.dataBlock = dataBlock.current;
      seen.props.push({ inspectorTarget: props.inspectorTarget, dataBlockId: props.dataBlockId });
      useEffect(() => {
        seen.mounts += 1;
      }, []);
      return (
        <original.WorkbenchSessions
          {...props}
          chordSession={chord.current}
          dataBlockEditorSession={dataBlock.current}
        >
          <Probe />
          {props.children}
        </original.WorkbenchSessions>
      );
    },
  };
});

function notesDataBlock(id: string, name: string): DataBlock {
  const value: NoteEventValue = {
    onset: musicalPosition(0),
    interOnset: musicalDuration(1),
    duration: musicalDuration(1),
    pitches: [6000],
    velocity: 1,
  };
  return {
    schemaVersion: 1,
    id,
    name,
    createdAt: '2026-11-11T00:00:00Z',
    packet: {
      ...packet('events', 'note', [{ id: `${id}:n`, value, label: 'n', provenance: [] }]),
      frame: {
        topology: 'linear',
        unit: 'quarterNote',
        extent: 8,
        origin: 0,
        musicalExtent: musicalDuration(8),
        musicalOrigin: musicalPosition(0),
      },
    },
  };
}

async function seed() {
  await seedDesk([notesDataBlock('block-a', 'Alpha'), notesDataBlock('block-b', 'Beta')]);
  storeDefaultScreensets({ active: 'desk' });
}

async function openDataBlock(user: ReturnType<typeof userEvent.setup>, name: string) {
  const input = await screen.findByDisplayValue(name);
  const card = input.closest('div[class*="card"]') as HTMLElement;
  await user.dblClick(within(card).getByText(/^events \| note/));
}

const chordSession = () => seen.chord as ChordSession;
const dataBlockSession = () => seen.dataBlock as DataBlockEditorSession;
const selection = () => seen.selection as WorkbenchSelectionValue | null;

describe('the page mounts WorkbenchSessions', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHistory();
    seen.chord = null;
    seen.dataBlock = null;
    seen.props = [];
    seen.mounts = 0;
    seen.selection = null;
  });

  it('the open data-block editor claims the page chord session and resets it per data-block, without remounting the desk', async () => {
    const user = userEvent.setup();
    await seed();
    render(<CompositionWorkbenchPage />);
    const alphaName = await screen.findByDisplayValue('Alpha');
    expect(chordSession().getState().target).toBeNull();

    await openDataBlock(user, 'Alpha');
    await screen.findByRole('group', { name: /Notes piano roll/ });
    // The editor in the page claims the PAGE session (it would claim a private one otherwise).
    expect(chordSession().getState().target?.id).toBe('block-a');
    expect(dataBlockSession().openDataBlockId).toBe('block-a');

    act(() => {
      chordSession().setAnchor({ pitchMidicents: 6000, start: 0, step: 1 });
    });
    expect(chordSession().getState().anchor).not.toBeNull();

    // Switching data-blocks: the chord state resets (the target changes) and the data-block state is B's,
    // while the desk and the provider stay mounted (the same DOM node, one provider mount).
    await openDataBlock(user, 'Beta');
    await waitFor(() => expect(chordSession().getState().target?.id).toBe('block-b'));
    expect(chordSession().getState().anchor).toBeNull();
    expect(dataBlockSession().openDataBlockId).toBe('block-b');
    expect(screen.getByDisplayValue('Alpha')).toBe(alphaName);
    expect(seen.mounts).toBe(1);
  }, 20_000);

  it('releases the claim when the data-block editor closes, so the chord state is gone', async () => {
    const user = userEvent.setup();
    await seed();
    render(<CompositionWorkbenchPage />);
    await openDataBlock(user, 'Alpha');
    await screen.findByRole('group', { name: /Notes piano roll/ });
    act(() => {
      chordSession().setAnchor({ pitchMidicents: 6000, start: 0, step: 1 });
    });
    // Selecting a node (the canvas screenset) clears the data-block target and unmounts the editor.
    await user.click(screen.getByRole('tab', { name: 'Canvas' }));
    await user.click(
      within(screen.getByLabelText('Composition canvas')).getByRole('button', {
        name: /^Interference/,
      })
    );
    await waitFor(() => expect(chordSession().getState().target).toBeNull());
    expect(chordSession().getState().anchor).toBeNull();
    expect(dataBlockSession().openDataBlockId).toBeNull();
  }, 20_000);

  it('useWorkbenchSelection resolves the live node, data-block and note targets', async () => {
    const user = userEvent.setup();
    await seed();
    render(<CompositionWorkbenchPage />);
    await screen.findByDisplayValue('Alpha');
    // No data-block open: the stored node target (the default Interference node).
    expect(selection()?.chain.map((node) => node.level)).toEqual(['node']);
    expect(selection()?.chain[0]).toMatchObject({ level: 'node', instanceId: 'interference' });

    await openDataBlock(user, 'Alpha');
    await screen.findByRole('group', { name: /Notes piano roll/ });
    // A data-block is open: nothing else is selected, so the node falls back to the canvas.
    await waitFor(() =>
      expect(selection()?.chain).toEqual([
        { level: 'data-block', dataBlockId: 'block-a' },
        { level: 'canvas' },
      ])
    );
    expect(seen.props.at(-1)).toMatchObject({ dataBlockId: 'block-a' });

    // A held note selection is the editor's own, read from the shared data-block session.
    const selected: NoteSelection = { ids: ['block-a:n'], range: null };
    act(() => {
      dataBlockSession().write('block-a', DATA_BLOCK_SLOT.shownSelection, () => null, selected);
    });
    await waitFor(() =>
      expect(selection()?.chain[0]).toMatchObject({ level: 'note', dataBlockId: 'block-a' })
    );
    expect(selection()?.parent(selection()!.chain[0])).toMatchObject({ level: 'data-block' });
  }, 20_000);
});
