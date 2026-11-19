import { useEffect, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClipEditorSession } from './clipEditorSession';
import { useClipAttachment, useClipSlot } from './ClipEditorSessionProvider';
import { NoteClipEditor } from './components/NoteClipEditor';
import { CompositionSettingsProvider } from './compositionSettings';
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

describe('the clip editor session store', () => {
  it('keeps one state per clip, never disposes on a read, and drops a clip when its last editor detaches', () => {
    const session = new ClipEditorSession();
    const disposedA = vi.fn();
    const disposedB = vi.fn();
    const detachA = session.attach('a');
    session.write('a', 'tool', () => 'pointer', 'knife');
    session.onDispose('a', disposedA);
    session.onDispose('b', disposedB);
    // Reading another clip creates its state and touches nothing of a's.
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

  it('the open clip is the most recently attached one that still has an editor', () => {
    const session = new ClipEditorSession();
    const detachA = session.attach('a');
    const detachB = session.attach('b');
    expect(session.openClipId).toBe('b');
    detachB();
    expect(session.openClipId).toBe('a');
    detachA();
    expect(session.openClipId).toBeNull();
  });

  it('delivers a command to the registered handler, and says when nothing took it', () => {
    const session = new ClipEditorSession();
    expect(session.dispatch({ type: 'focus' })).toBe(false);
    const handler = vi.fn();
    const off = session.onCommand('reveal', handler);
    expect(session.dispatch({ type: 'reveal', target: { id: 'n1' } })).toBe(true);
    expect(handler).toHaveBeenCalledWith({ type: 'reveal', target: { id: 'n1' } });
    off();
    expect(session.dispatch({ type: 'reveal', target: { id: 'n1' } })).toBe(false);
  });
});

describe('the session resets per clip without remounting siblings', () => {
  it('keeps the sibling mounted once while the clip state starts fresh', () => {
    const session = new ClipEditorSession();
    let mounts = 0;
    function Sibling() {
      useEffect(() => {
        mounts += 1;
      }, []);
      return <p>sibling</p>;
    }
    // One component, no key: the clip id is only a prop, as it is above the Stage.
    function Editor({ clipId }: { clipId: string }) {
      useClipAttachment(session, clipId);
      const [tool, setTool] = useClipSlot<string>(session, clipId, 'tool', () => 'pointer');
      return (
        <button type="button" onClick={() => setTool('knife')}>
          tool {tool} of {clipId}
        </button>
      );
    }
    function Page() {
      const [clipId, setClipId] = useState('a');
      return (
        <WorkbenchSessions clipEditorSession={session}>
          <Sibling />
          <Editor clipId={clipId} />
          <button type="button" onClick={() => setClipId('b')}>
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
  function Editor({ session, clipId }: { session: ClipEditorSession; clipId: string }) {
    useClipAttachment(session, clipId);
    const [tool, setTool] = useClipSlot<string>(session, clipId, 'tool', () => 'pointer');
    return (
      <button type="button" onClick={() => setTool('knife')}>
        tool {tool} of {clipId}
      </button>
    );
  }

  it('two editors on two clips under one shared provider keep their own state', () => {
    const session = new ClipEditorSession();
    let renders = 0;
    function Counted(props: { clipId: string }) {
      renders += 1;
      return <Editor session={session} clipId={props.clipId} />;
    }
    render(
      <WorkbenchSessions clipEditorSession={session}>
        <Counted clipId="a" />
        <Counted clipId="b" />
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

  it('the same clip unmounted and remounted in one commit starts with fresh slots', () => {
    const session = new ClipEditorSession();
    function Page({ generation }: { generation: number }) {
      return (
        <WorkbenchSessions clipEditorSession={session}>
          <div key={generation}>
            <Editor session={session} clipId="a" />
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
    const session = new ClipEditorSession();
    let desk: ReturnType<typeof useDesk>;
    function Harness() {
      desk = useDesk();
      const clip = desk.snippets[0];
      return clip && <NoteClipEditor snippet={clip} />;
    }
    render(
      <CompositionSettingsProvider>
        <DeskProvider>
          <WorkbenchSessions clipEditorSession={session}>
            <Harness />
          </WorkbenchSessions>
        </DeskProvider>
      </CompositionSettingsProvider>
    );
    await waitFor(() => expect(desk.loading).toBe(false));
    act(() => {
      desk.addBlankClip('notes', rational(4));
    });
    const roll = await screen.findByRole('group', { name: /Note clip piano roll/ });
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
    // The session held the clip's state under the open clip's id while the editor was mounted.
    expect(session.openClipId).toBe(desk!.snippets[0].id);
  });
});

describe('the selection chain', () => {
  it('resolves note, then clip, then module-or-canvas, and parent walks up to the project', () => {
    const chain = buildSelectionChain({
      inspectorTarget: { kind: 'module', instanceId: 'm1' },
      clipId: 'c1',
      noteSelection: { ids: ['n1'], range: null },
    });
    expect(chain.map((node) => node.level)).toEqual(['note', 'clip', 'module']);
    const note = chain[0];
    const clip = parentSelection(chain, note);
    expect(clip).toEqual({ level: 'clip', clipId: 'c1' });
    const module = parentSelection(chain, clip!);
    expect(module).toEqual({ level: 'module', instanceId: 'm1' });
    const project = parentSelection(chain, module!);
    expect(project).toEqual({ level: 'canvas' });
    expect(parentSelection(chain, project!)).toBeNull();
  });

  it('leaves out an empty note selection and falls back to the canvas', () => {
    const chain = buildSelectionChain({
      inspectorTarget: null,
      clipId: 'c1',
      noteSelection: { ids: [], range: null },
    });
    expect(chain.map((node) => node.level)).toEqual(['clip', 'canvas']);
    expect(
      buildSelectionChain({ inspectorTarget: null, clipId: null }).map((n) => n.level)
    ).toEqual(['canvas']);
  });

  it('reads the open clip note selection from the session, and the page shapes passed in', () => {
    const session = new ClipEditorSession();
    let levels: string[] = [];
    function Reader() {
      const selection = useWorkbenchSelection();
      levels = selection?.chain.map((node) => node.level) ?? [];
      return null;
    }
    function Holder() {
      useClipAttachment(session, 'c1');
      return null;
    }
    render(
      <WorkbenchSessions
        clipEditorSession={session}
        clipId="c1"
        inspectorTarget={{ kind: 'canvas' }}
      >
        <Holder />
        <Reader />
      </WorkbenchSessions>
    );
    expect(levels).toEqual(['clip', 'canvas']);
    act(() => {
      // The editor publishes the pruned, derived selection here (not the raw `selection` slot).
      session.write('c1', 'shownSelection', () => emptyNoteSelection, {
        ids: ['n1'],
        range: null,
      });
    });
    expect(levels).toEqual(['note', 'clip', 'canvas']);
  });

  it('a provider with no session still gives the chain', () => {
    let levels: string[] = [];
    function Reader() {
      levels = useWorkbenchSelection()?.chain.map((node) => node.level) ?? [];
      return null;
    }
    render(
      <WorkbenchSelectionProvider clipId={null} inspectorTarget={null}>
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
