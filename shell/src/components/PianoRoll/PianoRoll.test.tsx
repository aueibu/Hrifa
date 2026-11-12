import { useState } from 'react';
import { fireEvent, render, screen, userEvent } from '@test-utils';
import { defaultPianoRollView, type PianoRollViewState } from './model';
import { PianoRoll } from './PianoRoll';

const notes = [
  { id: 'c4', start: 0, duration: 1, pitchMidicents: 6000, label: 'C4' },
  { id: 'micro-g', start: 1, duration: 0.5, pitchMidicents: 6650, label: 'G4 -50c' },
];

function Harness({ initial = defaultPianoRollView }: { initial?: PianoRollViewState }) {
  const [view, setView] = useState(initial);
  return (
    <>
      <PianoRoll
        notes={notes}
        duration={4}
        gridLines={[
          { at: 0, kind: 'bar', label: '1' },
          { at: 1, kind: 'beat' },
          { at: 2, kind: 'beat' },
          { at: 3, kind: 'beat' },
          { at: 4, kind: 'bar', label: '2' },
        ]}
        view={view}
        onViewChange={setView}
        playhead={1.25}
        ariaLabel="Reusable piano roll"
      />
      <output data-testid="view">{JSON.stringify(view)}</output>
    </>
  );
}

describe('PianoRoll', () => {
  it('renders arbitrary-duration and microtonal notes on a musical grid', () => {
    render(<Harness initial={{ ...defaultPianoRollView, framed: true }} />);
    expect(screen.getByRole('img', { name: 'Reusable piano roll; 2 notes' })).toBeInTheDocument();
    expect(screen.getByTitle('C4 · 0.000 qn · 1.000 qn')).toBeInTheDocument();
    expect(screen.getByTitle('G4 -50c · 1.000 qn · 0.500 qn')).toBeInTheDocument();
    expect(screen.getByText('2', { selector: 'span' })).toBeInTheDocument();
  });

  it('exposes independent zoom and playback-follow controls', async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ ...defaultPianoRollView, framed: true }} />);
    await user.click(screen.getByRole('button', { name: 'Zoom in in time' }));
    expect(JSON.parse(screen.getByTestId('view').textContent ?? '{}').pixelsPerQuarter).toBe(80);
    await user.click(screen.getByRole('button', { name: 'Zoom in in pitch' }));
    expect(JSON.parse(screen.getByTestId('view').textContent ?? '{}').pixelsPerSemitone).toBe(27.5);
    await user.click(screen.getByRole('switch', { name: 'Follow playback' }));
    const view = JSON.parse(screen.getByTestId('view').textContent ?? '{}') as PianoRollViewState;
    expect(view.pixelsPerQuarter).toBe(80);
    expect(view.pixelsPerSemitone).toBe(27.5);
    expect(view.followPlayback).toBe(true);
  });

  it('colors a note that carries its own color and leaves the rest on the theme', () => {
    render(
      <PianoRoll
        notes={[
          {
            id: 'a',
            start: 0,
            duration: 1,
            pitchMidicents: 6000,
            label: 'A',
            color: 'rgb(1, 2, 3)',
          },
          { id: 'b', start: 1, duration: 1, pitchMidicents: 6200, label: 'B' },
        ]}
        duration={2}
        gridLines={[]}
        view={{ ...defaultPianoRollView, framed: true }}
        onViewChange={() => undefined}
      />
    );
    const colored = screen.getByTitle('A · 0.000 qn · 1.000 qn');
    expect(colored).toHaveAttribute('data-colored');
    expect(colored.style.getPropertyValue('--note-color')).toBe('rgb(1, 2, 3)');
    expect(screen.getByTitle('B · 1.000 qn · 1.000 qn')).not.toHaveAttribute('data-colored');
  });

  it('can hide its toolbar for a compact roll whose view the owner sets', () => {
    render(
      <PianoRoll
        notes={notes}
        duration={2}
        gridLines={[]}
        view={{ ...defaultPianoRollView, framed: true }}
        onViewChange={() => undefined}
        showToolbar={false}
      />
    );
    expect(screen.queryByRole('button', { name: 'Fit notes' })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: /2 notes/ })).toBeInTheDocument();
  });
});

describe('PianoRoll editing', () => {
  const view = { ...defaultPianoRollView, framed: true };
  // jsdom lays nothing out, so the roll's origin is (0, 0): client coordinates are roll coordinates.
  // At 64 px per quarter the grid snaps to half a quarter; a semitone is 22 px and C4 (60) is row 67.
  const c4Y = (127 - 60) * 22 + 11;
  const edited = [
    { id: 'c4', start: 1, duration: 1, pitchMidicents: 6000, label: 'C4' },
    { id: 'e4', start: 3, duration: 1, pitchMidicents: 6400, label: 'E4' },
  ];

  function renderRoll(props: Partial<React.ComponentProps<typeof PianoRoll>> = {}) {
    const handlers = {
      onSelectionChange: vi.fn(),
      onAddNote: vi.fn(),
      onMoveNotes: vi.fn(),
      onResizeNotes: vi.fn(),
      onDeleteNotes: vi.fn(),
      onVelocityChange: vi.fn(),
      onMarqueeRange: vi.fn(),
    };
    render(
      <PianoRoll
        notes={edited}
        duration={4}
        gridLines={[]}
        view={view}
        onViewChange={() => undefined}
        selectedIds={[]}
        tools={[{ id: 'select', label: 'Select' }]}
        activeTool="select"
        {...handlers}
        {...props}
      />
    );
    return { handlers, roll: screen.getByRole('group', { name: /Piano roll/ }) };
  }

  it('draws a note on release, one call per drag, snapped to the grid', () => {
    const { handlers, roll } = renderRoll({ activeTool: 'draw' });
    fireEvent.pointerDown(roll, { clientX: 70, clientY: c4Y, pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 100, clientY: c4Y, pointerId: 1 });
    expect(handlers.onAddNote).not.toHaveBeenCalled();
    fireEvent.pointerMove(roll, { clientX: 200, clientY: c4Y + 5, pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 200, clientY: c4Y + 5, pointerId: 1 });
    expect(handlers.onAddNote).toHaveBeenCalledTimes(1);
    expect(handlers.onAddNote).toHaveBeenCalledWith({
      start: 1,
      duration: 2,
      pitchMidicents: 6000,
    });
  });

  it('moves the dragged note by snapped time and whole semitones, once, on release', () => {
    const { handlers, roll } = renderRoll();
    const note = screen.getByTitle('C4 · 1.000 qn · 1.000 qn');
    fireEvent.pointerDown(note, { clientX: 90, clientY: c4Y, pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 90 + 64, clientY: c4Y - 44, pointerId: 1 });
    expect(handlers.onMoveNotes).not.toHaveBeenCalled();
    fireEvent.pointerUp(roll, { clientX: 90 + 64, clientY: c4Y - 44, pointerId: 1 });
    expect(handlers.onMoveNotes).toHaveBeenCalledTimes(1);
    expect(handlers.onMoveNotes).toHaveBeenCalledWith(['c4'], { start: 1, pitchMidicents: 200 });
  });

  it('moves the whole selection when a selected note is dragged, and collapses on a plain click', () => {
    const { handlers, roll } = renderRoll({ selectedIds: ['c4', 'e4'] });
    const note = screen.getByTitle('C4 · 1.000 qn · 1.000 qn');
    fireEvent.pointerDown(note, { clientX: 90, clientY: c4Y, pointerId: 1 });
    expect(handlers.onSelectionChange).not.toHaveBeenCalled();
    fireEvent.pointerMove(roll, { clientX: 90 - 32, clientY: c4Y, pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 90 - 32, clientY: c4Y, pointerId: 1 });
    expect(handlers.onMoveNotes).toHaveBeenCalledWith(['c4', 'e4'], {
      start: -0.5,
      pitchMidicents: 0,
    });

    fireEvent.pointerDown(note, { clientX: 90, clientY: c4Y, pointerId: 2 });
    fireEvent.pointerUp(roll, { clientX: 90, clientY: c4Y, pointerId: 2 });
    expect(handlers.onSelectionChange).toHaveBeenCalledWith(['c4']);
    expect(handlers.onMoveNotes).toHaveBeenCalledTimes(1);
  });

  it('resizes from the right edge and erases with the erase tool', () => {
    const { handlers, roll } = renderRoll();
    const note = screen.getByTitle('C4 · 1.000 qn · 1.000 qn');
    // The note spans x 64 to 128; the last 6 px is the resize handle.
    fireEvent.pointerDown(note, { clientX: 125, clientY: c4Y, pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 125 + 64, clientY: c4Y, pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 125 + 64, clientY: c4Y, pointerId: 1 });
    expect(handlers.onResizeNotes).toHaveBeenCalledWith(['c4'], 1);
    expect(handlers.onMoveNotes).not.toHaveBeenCalled();
  });

  it('erase deletes the clicked note and leaves the selection alone', () => {
    const { handlers } = renderRoll({ activeTool: 'erase', selectedIds: ['e4'] });
    fireEvent.pointerDown(screen.getByTitle('C4 · 1.000 qn · 1.000 qn'), {
      clientX: 90,
      clientY: c4Y,
      pointerId: 1,
    });
    expect(handlers.onDeleteNotes).toHaveBeenCalledWith(['c4']);
    expect(handlers.onSelectionChange).not.toHaveBeenCalled();
  });

  it('Alt-drag changes velocity by a fraction of the range', () => {
    const { handlers, roll } = renderRoll();
    const note = screen.getByTitle('C4 · 1.000 qn · 1.000 qn');
    fireEvent.pointerDown(note, { clientX: 90, clientY: c4Y, altKey: true, pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 90, clientY: c4Y - 60, pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 90, clientY: c4Y - 60, pointerId: 1 });
    expect(handlers.onVelocityChange).toHaveBeenCalledWith(['c4'], 0.5);
  });

  it('reports the time a marquee covered, over empty space too', () => {
    const { handlers, roll } = renderRoll();
    fireEvent.pointerDown(roll, { clientX: 130, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 210, clientY: 30, pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 210, clientY: 30, pointerId: 1 });
    expect(handlers.onSelectionChange).toHaveBeenCalledWith([]);
    expect(handlers.onMarqueeRange).toHaveBeenCalledWith({ start: 2, end: 3.5 });
  });

  it('draws the selected range as a band', () => {
    renderRoll({ selectedRange: { start: 1, end: 2.5 } });
    const band = screen.getByTestId('roll-range');
    expect(band.style.left).toBe('64px');
    expect(band.style.width).toBe('96px');
  });

  it('keeps the viewer behavior without edit callbacks: a click selects only that note at once', () => {
    const onSelectionChange = vi.fn();
    render(
      <PianoRoll
        notes={edited}
        duration={4}
        gridLines={[]}
        view={view}
        onViewChange={() => undefined}
        selectedIds={['c4', 'e4']}
        onSelectionChange={onSelectionChange}
        tools={[{ id: 'select', label: 'Select' }]}
        activeTool="select"
      />
    );
    fireEvent.pointerDown(screen.getByTitle('C4 · 1.000 qn · 1.000 qn'), {
      clientX: 90,
      clientY: c4Y,
      pointerId: 1,
    });
    expect(onSelectionChange).toHaveBeenCalledWith(['c4']);
  });

  it('without ghost drag the note itself follows the pointer (as before)', () => {
    const { roll } = renderRoll();
    const note = screen.getByTitle('C4 · 1.000 qn · 1.000 qn');
    fireEvent.pointerDown(note, { clientX: 90, clientY: c4Y, pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 90 + 64, clientY: c4Y, pointerId: 1 });
    expect(note.style.left).toBe('128px');
    expect(document.querySelector('[data-ghost]')).toBeNull();
  });

  it('ghost drag leaves the note in place, labels the ghost with the pitch under it, and commits on release', () => {
    const { handlers, roll } = renderRoll({ ghostDrag: true });
    const note = screen.getByTitle('C4 · 1.000 qn · 1.000 qn');
    fireEvent.pointerDown(note, { clientX: 90, clientY: c4Y, pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 90 + 64, clientY: c4Y - 44, pointerId: 1 });
    // The real note has not moved; the ghost is two semitones up and a quarter later.
    expect(note.style.left).toBe('64px');
    const ghost = document.querySelector('[data-ghost="c4"]') as HTMLElement;
    expect(ghost.style.left).toBe('128px');
    expect(ghost).toHaveTextContent('D4');
    // The label follows the pointer to the next pitch.
    fireEvent.pointerMove(roll, { clientX: 90 + 64, clientY: c4Y - 66, pointerId: 1 });
    expect(document.querySelector('[data-ghost="c4"]')).toHaveTextContent('D♯4');
    expect(handlers.onMoveNotes).not.toHaveBeenCalled();
    fireEvent.pointerUp(roll, { clientX: 90 + 64, clientY: c4Y - 66, pointerId: 1 });
    expect(handlers.onMoveNotes).toHaveBeenCalledWith(['c4'], { start: 1, pitchMidicents: 300 });
    expect(document.querySelector('[data-ghost]')).toBeNull();
  });

  it('ghost drag also ghosts a resize, and Escape cancels the drag without committing or deselecting', () => {
    const { handlers, roll } = renderRoll({ ghostDrag: true });
    const note = screen.getByTitle('C4 · 1.000 qn · 1.000 qn');
    fireEvent.pointerDown(note, { clientX: 125, clientY: c4Y, pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 125 + 64, clientY: c4Y, pointerId: 1 });
    const ghost = document.querySelector('[data-ghost="c4"]') as HTMLElement;
    expect(ghost.style.width).toBe('128px');
    expect(note.style.width).toBe('64px');
    handlers.onSelectionChange.mockClear();
    fireEvent.keyDown(roll, { key: 'Escape' });
    expect(document.querySelector('[data-ghost]')).toBeNull();
    fireEvent.pointerUp(roll, { clientX: 125 + 64, clientY: c4Y, pointerId: 1 });
    expect(handlers.onResizeNotes).not.toHaveBeenCalled();
    expect(handlers.onSelectionChange).not.toHaveBeenCalledWith([]);
  });

  it('clamps a moved group once, so the preview keeps its shape and equals the commit', () => {
    const { handlers, roll } = renderRoll({ ghostDrag: true, selectedIds: ['c4', 'e4'] });
    const note = screen.getByTitle('E4 · 3.000 qn · 1.000 qn');
    // Three quarters left: c4 (at 1) stops at 0, so e4 moves back only 1 as well, not 3.
    fireEvent.pointerDown(note, { clientX: 200, clientY: c4Y - 88, pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 200 - 192, clientY: c4Y - 88, pointerId: 1 });
    const left = (id: string) =>
      (document.querySelector(`[data-ghost="${id}"]`) as HTMLElement).style.left;
    expect(left('c4')).toBe('0px');
    expect(left('e4')).toBe('128px');
    fireEvent.pointerUp(roll, { clientX: 200 - 192, clientY: c4Y - 88, pointerId: 1 });
    expect(handlers.onMoveNotes).toHaveBeenCalledWith(['c4', 'e4'], {
      start: -1,
      pitchMidicents: 0,
    });
  });

  it('draws bracket markers at the end of the playback area, and dims what follows', () => {
    renderRoll({ endMarker: 2 });
    expect(screen.getByTestId('roll-end-bracket').style.left).toBe('128px');
    expect(screen.getByTestId('roll-end-line').style.left).toBe('128px');
  });

  it('draws no end marker unless asked', () => {
    renderRoll();
    expect(screen.queryByTestId('roll-end-bracket')).toBeNull();
  });

  it('with wheel zoom, Ctrl+wheel zooms time and Ctrl+Alt+wheel zooms pitch, in the owner view', () => {
    const changes: PianoRollViewState[] = [];
    const { roll } = renderRoll({ wheelZoom: true, onViewChange: (next) => changes.push(next) });
    const scroller = roll.closest('[class*="scroller"]') as HTMLElement;
    const prevented = !fireEvent.wheel(scroller, { deltaY: -100, ctrlKey: true, clientX: 100 });
    expect(prevented).toBe(true);
    expect(changes.at(-1)!.pixelsPerQuarter).toBeGreaterThan(view.pixelsPerQuarter);
    fireEvent.wheel(scroller, { deltaY: -100, ctrlKey: true, altKey: true, clientY: 100 });
    expect(changes.at(-1)!.pixelsPerSemitone).toBeGreaterThan(view.pixelsPerSemitone);
    // The plain wheel is left to the browser, which scrolls the keys.
    expect(fireEvent.wheel(scroller, { deltaY: 100 })).toBe(true);
  });

  it('without wheel zoom the wheel is untouched', () => {
    const onViewChange = vi.fn();
    const { roll } = renderRoll({ onViewChange });
    const scroller = roll.closest('[class*="scroller"]') as HTMLElement;
    fireEvent.wheel(scroller, { deltaY: -100, ctrlKey: true });
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it('fill mode drops the fixed height so the roll takes its parent', () => {
    const { roll } = renderRoll({ fill: true });
    const scroller = roll.closest('[class*="scroller"]') as HTMLElement;
    expect(scroller.style.height).toBe('');
    expect(scroller.parentElement!.parentElement).toHaveAttribute('data-fill');
  });
});
