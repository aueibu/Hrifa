import { useEffect, useState, type ReactNode } from 'react';
import { act, fireEvent, render, screen, userEvent, waitFor } from '@test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NoteClipEditor } from '../components/NoteClipEditor';
import { CompositionSettingsProvider, defaultProjectPitchSet } from '../compositionSettings';
import { DeskProvider, useDesk } from '../desk';
import { resetHistory } from '../history';
import type { NoteEventValue } from '../melodicization';
import { rational } from '../musicalTime';
import { WorkbenchSessions } from '../WorkbenchSessions';
import { ChordPanelStandIn } from './ChordPanelStandIn';
import { ChordSession } from './chordSession';
import { ChordSessionProvider, useChordSelector, useChordSession } from './ChordSessionProvider';
import { ChordsPanel } from './ChordsPanel';

// The audition path: a stand-in audio engine that makes no sound and records what was played.
const engine = vi.hoisted(() => ({
  play: vi.fn(async () => ({ active: true, stop: () => undefined, setBusGain: () => undefined })),
}));
vi.mock('../audio/AudioEngineProvider', () => ({
  useAudioEngine: () => ({ play: engine.play, subscribe: () => () => undefined }),
}));

beforeEach(() => {
  localStorage.clear();
  resetHistory();
  engine.play.mockClear();
});

/**
 * The second consumer (M4a): a host that is NOT a clip. A chord progression list that claims the
 * session with its own insert (it appends the chord's pitch classes), chooses its own anchor, and
 * mounts the picker body inside a `data-chord-scope` root.
 */
function ProgressionList({ lastRequest }: { lastRequest?: { current: unknown } }) {
  const session = useChordSession();
  const [entries, setEntries] = useState<number[][]>([]);
  useEffect(
    () =>
      session.claimChordTarget({
        id: 'progression',
        pitchSet: defaultProjectPitchSet(12),
        edo: 12,
        hint: 'Pick a position in the list.',
        insert: (request) => {
          if (lastRequest) {
            lastRequest.current = request;
          }
          setEntries((list) => [...list, request.chord.pcs]);
        },
      }),
    [session, lastRequest]
  );
  return (
    <div data-chord-scope="">
      <ol aria-label="Progression">
        {entries.map((pcs, index) => (
          <li key={index}>{pcs.join(',')}</li>
        ))}
      </ol>
      <button
        type="button"
        onClick={() => session.setAnchor({ pitchMidicents: 6000, start: 0, step: 1 })}
      >
        Choose position
      </button>
      <ChordsPanel />
    </div>
  );
}

describe('a second chord host that is not a clip', () => {
  it('claims the session, shows the picker body and receives the inserted chord', async () => {
    const user = userEvent.setup();
    const lastRequest = { current: null as unknown };
    render(
      <CompositionSettingsProvider>
        <WorkbenchSessions>
          <ProgressionList lastRequest={lastRequest} />
        </WorkbenchSessions>
      </CompositionSettingsProvider>
    );
    expect(screen.getByText('Pick a position in the list.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Choose position' }));
    await user.dblClick(screen.getByRole('button', { name: 'C' }));
    expect(screen.getByRole('list', { name: 'Progression' })).toHaveTextContent('0,4,7');
    // The default placement came with the request (C4 root position), no clip anywhere.
    expect(lastRequest.current).toMatchObject({ notes: [{ pitchMidicents: 6000 }, {}, {}] });
  });

  it('Enter from the page body inserts the current chord and Esc closes the picker (the keys work in any host)', async () => {
    const user = userEvent.setup();
    render(
      <CompositionSettingsProvider>
        <WorkbenchSessions>
          <ProgressionList />
        </WorkbenchSessions>
      </CompositionSettingsProvider>
    );
    await user.click(screen.getByRole('button', { name: 'Choose position' }));
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(screen.getByRole('list', { name: 'Progression' })).toHaveTextContent(/^\d/);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.getByText('Pick a position in the list.')).toBeInTheDocument();
  });

  it('shows an empty state with no claim', () => {
    render(
      <CompositionSettingsProvider>
        <WorkbenchSessions>
          <ChordsPanel />
        </WorkbenchSessions>
      </CompositionSettingsProvider>
    );
    expect(document.querySelector('[data-ready-line]')).toHaveTextContent(
      'No target: open a clip to insert'
    );
  });

  it('with no claim the panel still auditions: a chord click sounds, nothing is inserted (A7)', async () => {
    const user = userEvent.setup();
    render(
      <CompositionSettingsProvider>
        <WorkbenchSessions>
          <ChordsPanel />
        </WorkbenchSessions>
      </CompositionSettingsProvider>
    );
    expect(document.querySelector('[data-ready-line]')).toHaveTextContent(
      'No target: open a clip to insert'
    );
    // No Close button (nothing to clear) and no claim, but the picker is there and sounds.
    expect(screen.queryByRole('button', { name: 'Close chord picker' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'C' }));
    await waitFor(() => expect(engine.play).toHaveBeenCalledTimes(1));
    // Insert (double-click) does nothing without a target.
    await user.dblClick(screen.getByRole('button', { name: 'C' }));
    expect(document.querySelector('[data-ready-line]')).toHaveTextContent(
      'No target: open a clip to insert'
    );
  });

  it('a keyed anchor move blocks the hover ghost until the pointer reports another cell', () => {
    const session = new ChordSession();
    const reveal = vi.fn();
    session.claimChordTarget({
      id: 'a',
      pitchSet: defaultProjectPitchSet(12),
      edo: 12,
      insert: () => undefined,
      revealAnchor: reveal,
    });
    session.setAnchor({ pitchMidicents: 6000, start: 0, step: 1 });
    session.hoverFromRoll({ pitchMidicents: 6000, start: 1, step: 1 });
    expect(session.getState().hoverCell).toEqual({ pitchMidicents: 6000, start: 1, step: 1 });
    // Shift+ArrowRight: the anchor moves on, the hover cell clears and stays blocked.
    session.handleKey(
      new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, cancelable: true })
    );
    expect(session.getState().anchor?.start).toBe(1);
    expect(session.getState().hoverCell).toBeNull();
    expect(reveal).toHaveBeenCalledTimes(1);
    session.hoverFromRoll({ pitchMidicents: 6000, start: 1, step: 1 });
    expect(session.getState().hoverCell).toBeNull();
    session.hoverFromRoll({ pitchMidicents: 6100, start: 1, step: 1 });
    expect(session.getState().hoverCell).not.toBeNull();
  });
});

let desk: ReturnType<typeof useDesk>;
function EditorAndList({ showEditor }: { showEditor: boolean }) {
  desk = useDesk();
  const clip = desk.snippets[0];
  return (
    <>
      <ProgressionList />
      {showEditor && clip && <NoteClipEditor snippet={clip} />}
    </>
  );
}
function Toggle() {
  const [show, setShow] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setShow((on) => !on)}>
        Toggle editor
      </button>
      <EditorAndList showEditor={show} />
    </>
  );
}

const rowY = (midi: number) => (127 - midi) * 22 + 11;
const pitches = () =>
  desk.snippets[0].packet.items
    .flatMap((item) => (item.value as NoteEventValue).pitches)
    .sort((a, b) => a - b);

function mountWithDesk(content: ReactNode) {
  render(
    <CompositionSettingsProvider>
      <DeskProvider>
        <WorkbenchSessions>{content}</WorkbenchSessions>
      </DeskProvider>
    </CompositionSettingsProvider>
  );
}

describe('the clip editor under WorkbenchSessions', () => {
  it('works as before: the Chords tool, an anchor click, a chord insert and the W-20 keys', async () => {
    const user = userEvent.setup();
    function Harness() {
      desk = useDesk();
      const clip = desk.snippets[0];
      return (
        <>
          {clip && <NoteClipEditor snippet={clip} />}
          <ChordPanelStandIn />
        </>
      );
    }
    mountWithDesk(<Harness />);
    await waitFor(() => expect(desk.loading).toBe(false));
    act(() => {
      desk.addBlankClip('notes', rational(4));
    });
    const roll = await screen.findByRole('group', { name: /Note clip piano roll/ });
    roll.focus();
    fireEvent.keyDown(roll, { key: '7' });
    fireEvent.pointerDown(roll, { clientX: 70, clientY: rowY(60), pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 70, clientY: rowY(60), pointerId: 1 });
    await user.dblClick(screen.getByRole('button', { name: 'C' }));
    expect(pitches()).toEqual([6000, 6400, 6700]);
    // Keys from the roll: Shift+ArrowUp twice moves the anchor to D (C# is not in the key), Enter
    // places the current chord there.
    roll.focus();
    fireEvent.keyDown(roll, { key: 'ArrowUp', shiftKey: true });
    fireEvent.keyDown(roll, { key: 'ArrowUp', shiftKey: true });
    expect(document.querySelectorAll('[data-ghost-overlay="anchor"]')).toHaveLength(1);
    fireEvent.keyDown(roll, { key: 'Enter' });
    expect(pitches()).toHaveLength(6);
    expect(pitches()).toContain(6200);
    // Esc closes the picker (the anchor goes).
    fireEvent.keyDown(roll, { key: 'Escape' });
    expect(document.querySelectorAll('[data-ghost-overlay="anchor"]')).toHaveLength(0);
  });

  it('takes the session from a list host while its clip is open and returns it on unmount', async () => {
    const user = userEvent.setup();
    mountWithDesk(<Toggle />);
    await waitFor(() => expect(desk.loading).toBe(false));
    act(() => {
      desk.addBlankClip('notes', rational(4));
    });
    // The list holds the claim: its position, its insert.
    await user.click(screen.getByRole('button', { name: 'Choose position' }));
    await user.dblClick(screen.getByRole('button', { name: 'C' }));
    expect(screen.getByRole('list', { name: 'Progression' })).toHaveTextContent('0,4,7');
    // The editor opens: the last claim wins (the session resets, so the list anchor is gone).
    await user.click(screen.getByRole('button', { name: 'Toggle editor' }));
    await screen.findByRole('group', { name: /Note clip piano roll/ });
    // (the editor's tool is not Chords: selection mode, nothing selected, so the panel only auditions)
    expect(document.querySelector('[data-ready-line]')).toHaveTextContent(
      'Select a note, or use the Chords tool'
    );
    expect(screen.getByRole('list', { name: 'Progression' }).children).toHaveLength(1);
    await user.dblClick(screen.getByRole('button', { name: 'C' }));
    expect(screen.getByRole('list', { name: 'Progression' }).children).toHaveLength(1);
    // The editor closes: the list is the active claim again and works.
    await user.click(screen.getByRole('button', { name: 'Toggle editor' }));
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: /Note clip piano roll/ })).toBeNull()
    );
    await user.click(screen.getByRole('button', { name: 'Choose position' }));
    await user.dblClick(screen.getByRole('button', { name: 'C' }));
    expect(screen.getByRole('list', { name: 'Progression' }).children).toHaveLength(2);
    expect(pitches()).toEqual([]);
  });
});

describe('the session store', () => {
  it('a hover update re-renders only the subscribers of the hover cell', () => {
    const session = new ChordSession();
    session.claimChordTarget({
      id: 'x',
      pitchSet: defaultProjectPitchSet(12),
      edo: 12,
      insert: () => undefined,
    });
    const renders = { hover: 0, anchor: 0, child: 0 };
    function HoverReader() {
      renders.hover += 1;
      return <span data-testid="hover">{useChordSelector((s) => s.hoverCell?.start ?? -1)}</span>;
    }
    function AnchorReader() {
      renders.anchor += 1;
      return <span>{useChordSelector((s) => s.anchor?.start ?? -1)}</span>;
    }
    function Child() {
      renders.child += 1;
      return null;
    }
    render(
      <CompositionSettingsProvider>
        <ChordSessionProvider session={session}>
          <HoverReader />
          <AnchorReader />
          <Child />
        </ChordSessionProvider>
      </CompositionSettingsProvider>
    );
    const before = { ...renders };
    for (const start of [1, 2, 3]) {
      act(() => session.hoverFromRoll({ pitchMidicents: 6000, start, step: 1 }));
    }
    expect(screen.getByTestId('hover')).toHaveTextContent('3');
    expect(renders.hover).toBeGreaterThan(before.hover);
    expect(renders.anchor).toBe(before.anchor);
    expect(renders.child).toBe(before.child);
  });
});
