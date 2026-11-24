import { useEffect, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotesEditor } from './components/NotesEditor';
import { CompositionSettingsProvider } from './compositionSettings';
import { DataBlockEditorSession } from './dataBlockEditorSession';
import { useDataBlockAttachment, useDataBlockSlot } from './DataBlockEditorSessionProvider';
import { DeskProvider, useDesk } from './desk';
import { resetHistory } from './history';
import { InputScope } from './inputScope';
import { rational } from './musicalTime';
import { emptyNoteSelection } from './noteSelection';
import { buildSelectionChain, parentSelection } from './selectionChain';
import { WorkbenchSelectionProvider, useWorkbenchSelection } from './WorkbenchSelection';
import { WorkbenchSessions } from './WorkbenchSessions';

vi.mock('./audio/AudioEngineProvider', () => ({
  useAudioEngine: () => ({
    play: async () => ({ active: true, stop: () => undefined, setBusGain: () => undefined }),
    subscribe: () => () => undefined,
  }),
}));

// Records the `reveal` prop the roll is given.
type Reveal = { token: number; id?: string; start?: number } | null;
const seen: Reveal[] = [];
vi.mock('../../components/PianoRoll', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../components/PianoRoll')>();
  return {
    ...original,
    PianoRoll: (props: Parameters<typeof original.PianoRoll>[0]) => {
      seen.push((props.reveal as Reveal) ?? null);
      return original.PianoRoll(props);
    },
  };
});

beforeEach(() => {
  localStorage.clear();
  resetHistory();
  seen.length = 0;
});

describe('the data-block editor session store', () => {
  it('keeps one state per data-block, never disposes on a read, and drops a data-block when its last editor detaches', () => {
    const session = new DataBlockEditorSession();
    const disposedA = vi.fn();
    const disposedB = vi.fn();
    const detachA = session.attach('a');
    session.write('a', 'tool', () => 'pointer', 'knife');
    session.onDispose('a', disposedA);
    session.onDispose('b', disposedB);
    // Reading another data-block creates its state and touches nothing of a's.
    expect(session.read('b', 'tool', () => 'pencil')).toBe('pencil');
    expect(session.read('a', 'tool', () => 'pointer')).toBe('knife');
    expect(disposedA).not.toHaveBeenCalled();
    expect(disposedB).not.toHaveBeenCalled();
    const detachA2 = session.attach('a');
    detachA();
    expect(disposedA).not.toHaveBeenCalled();
    detachA2();
    expect(disposedA).toHaveBeenCalledTimes(1);
    expect(disposedB).not.toHaveBeenCalled();
    expect(session.read('a', 'tool', () => 'pointer')).toBe('pointer');
    expect(session.read('b', 'tool', () => 'x')).toBe('pencil');
  });

  it('the open data-block is the most recently attached one that still has an editor', () => {
    const session = new DataBlockEditorSession();
    const detachA = session.attach('a');
    const detachB = session.attach('b');
    expect(session.openDataBlockId).toBe('b');
    detachB();
    expect(session.openDataBlockId).toBe('a');
    detachA();
    expect(session.openDataBlockId).toBeNull();
  });

  it('delivers a command to the registered handler, and says when nothing took it', () => {
    const session = new DataBlockEditorSession();
    expect(session.dispatch({ type: 'focus' })).toBe(false);
    const handler = vi.fn();
    const off = session.onCommand('reveal', handler);
    expect(session.dispatch({ type: 'reveal', target: { id: 'n1' } })).toBe(true);
    expect(handler).toHaveBeenCalledWith({ type: 'reveal', target: { id: 'n1' } });
    off();
    expect(session.dispatch({ type: 'reveal', target: { id: 'n1' } })).toBe(false);
  });
});

describe('the session resets per data-block without remounting siblings', () => {
  it('keeps the sibling mounted once while the data-block state starts fresh', () => {
    const session = new DataBlockEditorSession();
    let mounts = 0;
    function Sibling() {
      useEffect(() => {
        mounts += 1;
      }, []);
      return <p>sibling</p>;
    }
    // One component, no key: the data-block id is only a prop, as it is above the Stage.
    function Editor({ dataBlockId }: { dataBlockId: string }) {
      useDataBlockAttachment(session, dataBlockId);
      const [tool, setTool] = useDataBlockSlot<string>(
        session,
        dataBlockId,
        'tool',
        () => 'pointer'
      );
      return (
        <button type="button" onClick={() => setTool('knife')}>
          tool {tool} of {dataBlockId}
        </button>
      );
    }
    function Page() {
      const [dataBlockId, setDataBlockId] = useState('a');
      return (
        <WorkbenchSessions dataBlockEditorSession={session}>
          <Sibling />
          <Editor dataBlockId={dataBlockId} />
          <button type="button" onClick={() => setDataBlockId('b')}>
            switch
          </button>
        </WorkbenchSessions>
      );
    }
    render(<Page />);
    fireEvent.click(screen.getByRole('button', { name: /tool pointer of a/ }));
    expect(screen.getByRole('button', { name: /tool knife of a/ })).toBeInTheDocument();
    fireEvent.click(screen.getByText('switch'));
    expect(screen.getByRole('button', { name: /tool pointer of b/ })).toBeInTheDocument();
    expect(mounts).toBe(1);
  });
});

describe('several editors and remounts', () => {
  function Editor({
    session,
    dataBlockId,
  }: {
    session: DataBlockEditorSession;
    dataBlockId: string;
  }) {
    useDataBlockAttachment(session, dataBlockId);
    const [tool, setTool] = useDataBlockSlot<string>(session, dataBlockId, 'tool', () => 'pointer');
    return (
      <button type="button" onClick={() => setTool('knife')}>
        tool {tool} of {dataBlockId}
      </button>
    );
  }

  it('two editors on two data-blocks under one shared provider keep their own state', () => {
    const session = new DataBlockEditorSession();
    let renders = 0;
    function Counted(props: { dataBlockId: string }) {
      renders += 1;
      return <Editor session={session} dataBlockId={props.dataBlockId} />;
    }
    render(
      <WorkbenchSessions dataBlockEditorSession={session}>
        <Counted dataBlockId="a" />
        <Counted dataBlockId="b" />
      </WorkbenchSessions>
    );
    expect(renders).toBeLessThan(10);
    fireEvent.click(screen.getByRole('button', { name: /tool pointer of a/ }));
    expect(screen.getByRole('button', { name: /tool knife of a/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tool pointer of b/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /tool pointer of b/ }));
    expect(screen.getByRole('button', { name: /tool knife of a/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tool knife of b/ })).toBeInTheDocument();
  });

  it('the same data-block unmounted and remounted in one commit starts with fresh slots', () => {
    const session = new DataBlockEditorSession();
    function Page({ generation }: { generation: number }) {
      return (
        <WorkbenchSessions dataBlockEditorSession={session}>
          <div key={generation}>
            <Editor session={session} dataBlockId="a" />
          </div>
        </WorkbenchSessions>
      );
    }
    const { rerender } = render(<Page generation={1} />);
    fireEvent.click(screen.getByRole('button', { name: /tool pointer of a/ }));
    session.write('a', 'reveal', () => null, { id: 'n1', token: 5 });
    expect(screen.getByRole('button', { name: /tool knife of a/ })).toBeInTheDocument();
    rerender(<Page generation={2} />);
    expect(screen.getByRole('button', { name: /tool pointer of a/ })).toBeInTheDocument();
    expect(session.get('a', 'reveal')).toBeUndefined();
  });
});

describe('panel commands reach the roll', () => {
  it('focus focuses the roll and reveal asks it to scroll, a repeat counting each time', async () => {
    const session = new DataBlockEditorSession();
    let desk: ReturnType<typeof useDesk>;
    function Harness() {
      desk = useDesk();
      const dataBlock = desk.dataBlocks[0];
      return dataBlock && <NotesEditor dataBlock={dataBlock} />;
    }
    render(
      <CompositionSettingsProvider>
        <DeskProvider>
          <WorkbenchSessions dataBlockEditorSession={session}>
            <Harness />
          </WorkbenchSessions>
        </DeskProvider>
      </CompositionSettingsProvider>
    );
    await waitFor(() => expect(desk.loading).toBe(false));
    act(() => {
      desk.addBlankDataBlock('notes', rational(4));
    });
    const roll = await screen.findByRole('group', { name: /Notes piano roll/ });
    expect(roll).not.toHaveFocus();
    act(() => {
      expect(session.dispatch({ type: 'focus' })).toBe(true);
    });
    expect(roll).toHaveFocus();
    expect(seen.at(-1)).toBeNull();
    act(() => {
      session.dispatch({ type: 'reveal', target: { id: 'n1' } });
    });
    expect(seen.at(-1)).toMatchObject({ id: 'n1', token: 1 });
    act(() => {
      session.dispatch({ type: 'reveal', target: { id: 'n1' } });
    });
    expect(seen.at(-1)).toMatchObject({ id: 'n1', token: 2 });
    // The session held the data-block's state under the open data-block's id while the editor was mounted.
    expect(session.openDataBlockId).toBe(desk!.dataBlocks[0].id);
  });
});

describe('the selection chain', () => {
  it('resolves note, then data-block, then module-or-canvas, and parent walks up to the project', () => {
    const chain = buildSelectionChain({
      inspectorTarget: { kind: 'module', instanceId: 'm1' },
      dataBlockId: 'c1',
      noteSelection: { ids: ['n1'], range: null },
    });
    expect(chain.map((node) => node.level)).toEqual(['note', 'data-block', 'module']);
    const note = chain[0];
    const dataBlock = parentSelection(chain, note);
    expect(dataBlock).toEqual({ level: 'data-block', dataBlockId: 'c1' });
    const module = parentSelection(chain, dataBlock!);
    expect(module).toEqual({ level: 'module', instanceId: 'm1' });
    const project = parentSelection(chain, module!);
    expect(project).toEqual({ level: 'canvas' });
    expect(parentSelection(chain, project!)).toBeNull();
  });

  it('leaves out an empty note selection and falls back to the canvas', () => {
    const chain = buildSelectionChain({
      inspectorTarget: null,
      dataBlockId: 'c1',
      noteSelection: { ids: [], range: null },
    });
    expect(chain.map((node) => node.level)).toEqual(['data-block', 'canvas']);
    expect(
      buildSelectionChain({ inspectorTarget: null, dataBlockId: null }).map((n) => n.level)
    ).toEqual(['canvas']);
  });

  it('reads the open data-block note selection from the session, and the page shapes passed in', () => {
    const session = new DataBlockEditorSession();
    let levels: string[] = [];
    function Reader() {
      const selection = useWorkbenchSelection();
      levels = selection?.chain.map((node) => node.level) ?? [];
      return null;
    }
    function Holder() {
      useDataBlockAttachment(session, 'c1');
      return null;
    }
    render(
      <WorkbenchSessions
        dataBlockEditorSession={session}
        dataBlockId="c1"
        inspectorTarget={{ kind: 'canvas' }}
      >
        <Holder />
        <Reader />
      </WorkbenchSessions>
    );
    expect(levels).toEqual(['data-block', 'canvas']);
    act(() => {
      // The editor publishes the pruned, derived selection here (not the raw `selection` slot).
      session.write('c1', 'shownSelection', () => emptyNoteSelection, {
        ids: ['n1'],
        range: null,
      });
    });
    expect(levels).toEqual(['note', 'data-block', 'canvas']);
  });

  it('a provider with no session still gives the chain', () => {
    let levels: string[] = [];
    function Reader() {
      levels = useWorkbenchSelection()?.chain.map((node) => node.level) ?? [];
      return null;
    }
    render(
      <WorkbenchSelectionProvider dataBlockId={null} inspectorTarget={null}>
        <Reader />
      </WorkbenchSelectionProvider>
    );
    expect(levels).toEqual(['canvas']);
  });
});

describe('the input scope', () => {
  it('tracks the pointer inside scope elements and resets on blur', () => {
    const scope = new InputScope();
    const off = scope.install();
    render(
      <div>
        <div data-note-editor-scope="">
          <span>editor</span>
        </div>
        <div data-chord-scope="">
          <span>chords</span>
        </div>
        <span>outside</span>
      </div>
    );
    expect(scope.pointerInside).toBe(false);
    fireEvent.pointerOver(screen.getByText('editor'));
    expect(scope.pointerInside).toBe(true);
    fireEvent.pointerOver(screen.getByText('outside'));
    expect(scope.pointerInside).toBe(false);
    fireEvent.pointerOver(screen.getByText('chords'));
    expect(scope.pointerInside).toBe(true);
    fireEvent.blur(window);
    expect(scope.pointerInside).toBe(false);
    off();
  });

  it('tracks a held pointer, ends it on release, cancel and a move with no button', () => {
    const scope = new InputScope();
    const off = scope.install();
    fireEvent.pointerDown(document.body);
    expect(scope.pointerHeld).toBe(true);
    fireEvent.pointerUp(document.body);
    expect(scope.pointerHeld).toBe(false);
    fireEvent.pointerDown(document.body);
    fireEvent.pointerCancel(document.body);
    expect(scope.pointerHeld).toBe(false);
    fireEvent.pointerDown(document.body);
    fireEvent.pointerMove(document.body, { buttons: 0 });
    expect(scope.pointerHeld).toBe(false);
    fireEvent.pointerDown(document.body);
    fireEvent.blur(window);
    expect(scope.pointerHeld).toBe(false);
    off();
  });
});
