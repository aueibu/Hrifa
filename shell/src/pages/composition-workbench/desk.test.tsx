import { act, render, renderHook, screen, userEvent } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransportBar } from './components/TransportBar';
import { CompositionSettingsProvider } from './compositionSettings';
import { DeskProvider, useDesk } from './desk';
import { canRedo, canUndo, HISTORY_DEPTH, redo, resetHistory, undo } from './history';
import { melodicize } from './melodicization';
import { packet } from './model';
import { musicalDuration } from './musicalTime';
import { interpretPitchList } from './pitch';
import { acceptsSnippets, captureSnippet, type Snippet } from './snippet';
import { compositionStateKeys } from './usePersistentState';

vi.mock('./audio/AudioEngineProvider', () => ({
  useAudioEngine: () => ({
    playing: false,
    subscribe: () => () => undefined,
    setTransport: () => undefined,
    stopAll: () => undefined,
  }),
}));

function noteSnippet(id = 'snip-1', name = 'Gesture'): Snippet {
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
  const captured = captureSnippet({
    id,
    createdAt: '2026-11-11T00:00:00Z',
    name,
    moduleInstance: 'mel-1',
    packet: result.packet,
  });
  if (!captured.ok) {
    throw new Error(captured.error);
  }
  return captured.snippet;
}

function setup() {
  localStorage.clear();
  resetHistory();
  return renderHook(() => useDesk(), { wrapper: DeskProvider });
}

function stored(): unknown {
  return JSON.parse(localStorage.getItem(compositionStateKeys.desk) ?? 'null');
}

/** Deep snapshot so a later mutation of shared objects could not hide a bad restore. */
const snapshot = (snippets: Snippet[]) => JSON.parse(JSON.stringify(snippets)) as Snippet[];

describe('desk history', () => {
  beforeEach(() => {
    localStorage.clear();
    resetHistory();
  });

  it('starts empty: nothing to undo or redo, and both are no-ops', () => {
    const { result } = setup();
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(false);
    act(() => undo());
    act(() => redo());
    expect(result.current.snippets).toEqual([]);
  });

  type Desk = ReturnType<typeof useDesk>;
  const mutations: [string, (desk: Desk) => void][] = [
    ['add', (desk) => desk.addSnippet(noteSnippet('snip-2', 'Other'))],
    ['remove', (desk) => desk.removeSnippet('snip-1')],
    ['rename', (desk) => desk.renameSnippet('snip-1', 'Renamed')],
    ['note', (desk) => desk.setSnippetNote('snip-1', 'a fresh note')],
    ['duplicate', (desk) => desk.duplicateSnippetById('snip-1')],
    ['convert to pitch class', (desk) => void desk.convertToPitchClassById('snip-1', { edo: 12 })],
  ];

  it.each(mutations)('undoes and redoes %s, restoring the exact snippets', (_name, mutate) => {
    const { result } = setup();
    act(() => result.current.addSnippet(noteSnippet()));
    const before = snapshot(result.current.snippets);
    act(() => mutate(result.current));
    const after = snapshot(result.current.snippets);
    expect(after).not.toEqual(before);
    expect(canUndo()).toBe(true);

    act(() => undo());
    expect(result.current.snippets).toEqual(before);
    expect(stored()).toEqual(before);
    expect(canRedo()).toBe(true);

    act(() => redo());
    expect(result.current.snippets).toEqual(after);
    expect(stored()).toEqual(after);
    expect(canRedo()).toBe(false);
  });

  it('steps back through several changes in order', () => {
    const { result } = setup();
    const states: Snippet[][] = [[]];
    const run = (mutate: (desk: Desk) => void) => {
      act(() => mutate(result.current));
      states.push(snapshot(result.current.snippets));
    };
    run((desk) => desk.addSnippet(noteSnippet()));
    run((desk) => desk.renameSnippet('snip-1', 'B'));
    run((desk) => desk.duplicateSnippetById('snip-1'));
    for (let index = states.length - 2; index >= 0; index -= 1) {
      act(() => undo());
      expect(result.current.snippets).toEqual(states[index]);
    }
    expect(canUndo()).toBe(false);
  });

  it('records changes made together in one event as separate entries', () => {
    const { result } = setup();
    act(() => {
      result.current.addSnippet(noteSnippet('a', 'A'));
      result.current.addSnippet(noteSnippet('b', 'B'));
    });
    act(() => undo());
    expect(result.current.snippets.map((snippet) => snippet.id)).toEqual(['a']);
  });

  it('clears redo when a new change follows an undo', () => {
    const { result } = setup();
    act(() => result.current.addSnippet(noteSnippet()));
    act(() => result.current.renameSnippet('snip-1', 'B'));
    act(() => undo());
    expect(canRedo()).toBe(true);
    act(() => result.current.renameSnippet('snip-1', 'C'));
    expect(canRedo()).toBe(false);
    act(() => redo());
    expect(result.current.snippets[0].name).toBe('C');
  });

  it('records nothing for changes that do nothing', () => {
    const { result } = setup();
    act(() => result.current.addSnippet(noteSnippet()));
    act(() => undo());
    act(() => redo());
    act(() => {
      result.current.removeSnippet('missing');
      result.current.renameSnippet('snip-1', 'Gesture');
      result.current.renameSnippet('missing', 'x');
      result.current.duplicateSnippetById('missing');
      result.current.convertToPitchClassById('missing', { edo: 12 });
    });
    expect(result.current.snippets).toHaveLength(1);
    expect(canRedo()).toBe(false);
    act(() => undo());
    expect(result.current.snippets).toEqual([]);
  });

  it('is bounded to the history depth', () => {
    const { result } = setup();
    for (let index = 0; index < HISTORY_DEPTH + 5; index += 1) {
      act(() => result.current.addSnippet(noteSnippet(`s-${index}`)));
    }
    for (let index = 0; index < HISTORY_DEPTH + 5; index += 1) {
      act(() => undo());
    }
    expect(canUndo()).toBe(false);
    expect(result.current.snippets).toHaveLength(5);
  });

  it('keeps the stored desk equal to the snippets, valid, and free of history', () => {
    const { result } = setup();
    act(() => result.current.addSnippet(noteSnippet()));
    act(() => result.current.renameSnippet('snip-1', 'B'));
    act(() => undo());
    expect(stored()).toEqual(result.current.snippets);
    expect(acceptsSnippets(stored())).toBe(true);
    expect(Array.isArray(stored())).toBe(true);
    expect(Object.keys(localStorage).filter((key) => key.includes('desk'))).toEqual([
      compositionStateKeys.desk,
    ]);
  });

  it('does not carry history across a reload', () => {
    const first = setup();
    act(() => first.result.current.addSnippet(noteSnippet()));
    const saved = snapshot(first.result.current.snippets);
    first.unmount();
    resetHistory(); // a reload starts a fresh session
    const reloaded = renderHook(() => useDesk(), { wrapper: DeskProvider });
    expect(reloaded.result.current.snippets).toEqual(saved);
    expect(canUndo()).toBe(false);
  });
});

describe('Undo and Redo buttons', () => {
  function Seed() {
    const { addSnippet, snippets } = useDesk();
    return (
      <>
        <button type="button" onClick={() => addSnippet(noteSnippet())}>
          seed
        </button>
        <div data-testid="count">{snippets.length}</div>
      </>
    );
  }
  function renderBar() {
    localStorage.clear();
    resetHistory();
    return render(
      <CompositionSettingsProvider>
        <DeskProvider>
          <TransportBar selectedInstanceId={null} />
          <Seed />
          <input aria-label="field" />
        </DeskProvider>
      </CompositionSettingsProvider>
    );
  }

  it('are disabled when empty, focusable when enabled, and drive the desk', async () => {
    renderBar();
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
    renderBar();
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
