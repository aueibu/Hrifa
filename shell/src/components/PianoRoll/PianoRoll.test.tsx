import { useState } from 'react';
import { createEvent, fireEvent, render, screen, userEvent } from '@test-utils';
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
    const { handlers, roll } = renderRoll({ activeTool: 'pencil' });
    fireEvent.pointerDown(roll, { clientX: 70, clientY: c4Y, pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 100, clientY: c4Y, pointerId: 1 });
    expect(handlers.onAddNote).not.toHaveBeenCalled();
    fireEvent.pointerMove(roll, { clientX: 200, clientY: c4Y, pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 200, clientY: c4Y, pointerId: 1 });
    expect(handlers.onAddNote).toHaveBeenCalledTimes(1);
    expect(handlers.onAddNote).toHaveBeenCalledWith({
      start: 1,
      // From the press point: 130 px is 2.03 quarters, snapped to 2 on the 1/2 grid.
      duration: 2,
      pitchMidicents: 6000,
      velocity: 0.8,
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

  it('resizes from the right edge', () => {
    const { handlers, roll } = renderRoll();
    const note = screen.getByTitle('C4 · 1.000 qn · 1.000 qn');
    // The note spans x 64 to 128; the last 6 px is the resize handle.
    fireEvent.pointerDown(note, { clientX: 125, clientY: c4Y, pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 125 + 64, clientY: c4Y, pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 125 + 64, clientY: c4Y, pointerId: 1 });
    expect(handlers.onResizeNotes).toHaveBeenCalledWith(['c4'], 1);
    expect(handlers.onMoveNotes).not.toHaveBeenCalled();
  });

  it('Alt-drag changes velocity by a fraction of the range', () => {
    const { handlers, roll } = renderRoll();
    const note = screen.getByTitle('C4 · 1.000 qn · 1.000 qn');
    fireEvent.pointerDown(note, { clientX: 90, clientY: c4Y, altKey: true, pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 90, clientY: c4Y - 60, pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 90, clientY: c4Y - 60, pointerId: 1 });
    expect(handlers.onVelocityChange).toHaveBeenCalledWith(['c4'], 0.5);
  });

  it('Alt-drag shows the dragged note percentage, and a group moves by one offset, each clamped', () => {
    const quiet = [
      { ...edited[0], velocity: 0.5 },
      { ...edited[1], velocity: 0.25 },
    ];
    const { handlers, roll } = renderRoll({ notes: quiet, selectedIds: ['c4', 'e4'] });
    const note = screen.getByTitle('C4 · 1.000 qn · 1.000 qn');
    fireEvent.pointerDown(note, { clientX: 90, clientY: c4Y, altKey: true, pointerId: 1 });
    // 60 px down is -0.5: the 25% note bottoms out at 0 and the 50% note is at 0.
    fireEvent.pointerMove(roll, { clientX: 90, clientY: c4Y + 60, pointerId: 1 });
    expect(screen.getByTestId('roll-velocity-readout')).toHaveTextContent('0%');
    fireEvent.pointerMove(roll, { clientX: 90, clientY: c4Y + 30, pointerId: 1 });
    expect(screen.getByTestId('roll-velocity-readout')).toHaveTextContent('25%');
    fireEvent.pointerUp(roll, { clientX: 90, clientY: c4Y + 30, pointerId: 1 });
    expect(handlers.onVelocityChange).toHaveBeenCalledTimes(1);
    expect(handlers.onVelocityChange).toHaveBeenCalledWith(['c4', 'e4'], -0.25);
    expect(handlers.onMoveNotes).not.toHaveBeenCalled();
  });

  it('Ctrl+Shift does not start a velocity drag', () => {
    const { handlers, roll } = renderRoll();
    const note = screen.getByTitle('C4 · 1.000 qn · 1.000 qn');
    fireEvent.pointerDown(note, {
      clientX: 90,
      clientY: c4Y,
      ctrlKey: true,
      shiftKey: true,
      pointerId: 1,
    });
    fireEvent.pointerMove(roll, { clientX: 90, clientY: c4Y - 60, pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 90, clientY: c4Y - 60, pointerId: 1 });
    expect(handlers.onVelocityChange).not.toHaveBeenCalled();
  });

  it('velocity fill is opt-in: saturation follows velocity only when asked, with no alpha', () => {
    const voiced = [
      { ...edited[0], velocity: 0.2, color: 'var(--mark-red)' },
      { ...edited[1], velocity: 1, color: 'var(--mark-red)' },
    ];
    const { unmount } = render(
      <PianoRoll
        notes={voiced}
        duration={4}
        gridLines={[]}
        view={view}
        onViewChange={() => undefined}
        velocityFill
      />
    );
    const soft = screen.getByTitle('C4 · 1.000 qn · 1.000 qn');
    const loud = screen.getByTitle('E4 · 3.000 qn · 1.000 qn');
    // Opaque: no element opacity and no fill alpha, only the saturation changes.
    expect(soft.style.opacity).toBe('');
    expect(soft.style.getPropertyValue('--note-fill-opacity')).toBe('');
    const mixOf = (element: HTMLElement) =>
      Number(/ (\d+)%, color-mix/.exec(element.style.getPropertyValue('--note-fill'))![1]);
    expect(mixOf(soft)).toBeLessThan(mixOf(loud));
    expect(soft).toHaveAttribute('data-velocity-fill');
    unmount();

    render(
      <PianoRoll
        notes={voiced}
        duration={4}
        gridLines={[]}
        view={view}
        onViewChange={() => undefined}
      />
    );
    const plain = screen.getByTitle('C4 · 1.000 qn · 1.000 qn');
    expect(plain).not.toHaveAttribute('data-velocity-fill');
    expect(plain.style.getPropertyValue('--note-fill')).toBe('');
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
    expect(scroller.closest('[data-fill]')).not.toBeNull();
  });
});

describe('PianoRoll tools', () => {
  const view = { ...defaultPianoRollView, framed: true };
  // Origin (0, 0) in jsdom. 64 px per quarter; 22 px per semitone; C4 (60) is row 67.
  const rowY = (midi: number) => (127 - midi) * 22 + 11;
  const sample = [
    { id: 'c4', start: 1, duration: 2, pitchMidicents: 6000, label: 'C4', velocity: 0.5 },
    { id: 'e4', start: 1, duration: 2, pitchMidicents: 6400, label: 'E4' },
    { id: 'g4', start: 5, duration: 1, pitchMidicents: 6700, label: 'G4' },
  ];

  function renderTool(tool: string, props: Partial<React.ComponentProps<typeof PianoRoll>> = {}) {
    const handlers = {
      onSelectionChange: vi.fn(),
      onAddNote: vi.fn(),
      onPaintNotes: vi.fn(),
      onSplitNote: vi.fn(),
      onDeleteNotes: vi.fn(),
      onMoveNotes: vi.fn(),
      onMarqueeRange: vi.fn(),
      onEntryLengthChange: vi.fn(),
      onEntryVelocityChange: vi.fn(),
    };
    render(
      <PianoRoll
        notes={sample}
        duration={8}
        gridLines={[]}
        view={view}
        onViewChange={() => undefined}
        selectedIds={[]}
        tools={[
          { id: 'pointer', label: 'Pointer', shortcut: '1' },
          { id: 'pencil', label: 'Pencil', shortcut: '3' },
        ]}
        activeTool={tool}
        wheelZoom
        {...handlers}
        {...props}
      />
    );
    return { handlers, roll: screen.getByRole('group', { name: /Piano roll/ }) };
  }

  it('pointer: a double-click on empty space adds a note of the entry length, on a note deletes it', () => {
    const { handlers, roll } = renderTool('pointer', { entryLength: 1.5 });
    fireEvent.doubleClick(roll, { clientX: 70, clientY: rowY(62) });
    expect(handlers.onAddNote).toHaveBeenCalledWith({
      start: 1,
      duration: 1.5,
      pitchMidicents: 6200,
      velocity: 0.8,
    });
    fireEvent.doubleClick(screen.getByTitle(/^C4/), { clientX: 100, clientY: rowY(60) });
    expect(handlers.onDeleteNotes).toHaveBeenCalledWith(['c4']);
    expect(handlers.onAddNote).toHaveBeenCalledTimes(1);
  });

  it('other tools ignore a double-click', () => {
    const { handlers, roll } = renderTool('pencil');
    fireEvent.doubleClick(roll, { clientX: 70, clientY: rowY(62) });
    expect(handlers.onAddNote).not.toHaveBeenCalled();
  });

  it('time selection: drag reports the range and every note starting inside it', () => {
    const { handlers, roll } = renderTool('time');
    fireEvent.pointerDown(roll, { clientX: 40, clientY: 5, pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 100, clientY: 900, pointerId: 1 });
    expect(screen.getByTestId('roll-time-preview').style.left).toBe('32px');
    fireEvent.pointerUp(roll, { clientX: 100, clientY: 900, pointerId: 1 });
    // 40 px is 0.625 quarters and 100 px is 1.56: snapped outward to 0.5 and 2 on the 1/2 grid.
    expect(handlers.onMarqueeRange).toHaveBeenCalledWith({ start: 0.5, end: 2 });
    expect(handlers.onSelectionChange).toHaveBeenCalledWith(['c4', 'e4']);
  });

  it('time selection: a note that starts after the range is left out, a click clears', () => {
    const { handlers, roll } = renderTool('time');
    fireEvent.pointerDown(roll, { clientX: 340, clientY: 5, pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 380, clientY: 5, pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 380, clientY: 5, pointerId: 1 });
    expect(handlers.onSelectionChange).toHaveBeenLastCalledWith(['g4']);
    fireEvent.pointerDown(roll, { clientX: 340, clientY: 5, pointerId: 2 });
    fireEvent.pointerUp(roll, { clientX: 340, clientY: 5, pointerId: 2 });
    expect(handlers.onSelectionChange).toHaveBeenLastCalledWith([]);
  });

  it('pencil: a click adds one note of the entry length; dragging up or down sets velocity with a readout', () => {
    const { handlers, roll } = renderTool('pencil', { entryLength: 2 });
    fireEvent.pointerDown(roll, { clientX: 400, clientY: rowY(72), pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 400, clientY: rowY(72), pointerId: 1 });
    expect(handlers.onAddNote).toHaveBeenLastCalledWith({
      start: 6,
      duration: 2,
      pitchMidicents: 7200,
      velocity: 0.8,
    });
    expect(handlers.onEntryLengthChange).not.toHaveBeenCalled();

    fireEvent.pointerDown(roll, { clientX: 400, clientY: rowY(72), pointerId: 2 });
    expect(screen.getByTestId('roll-velocity-readout')).toHaveTextContent('80%');
    fireEvent.pointerMove(roll, { clientX: 400, clientY: rowY(72) - 28, pointerId: 2 });
    expect(screen.getByTestId('roll-velocity-readout')).toHaveTextContent('100%');
    fireEvent.pointerMove(roll, { clientX: 400, clientY: rowY(72) + 52, pointerId: 2 });
    expect(screen.getByTestId('roll-velocity-readout')).toHaveTextContent('40%');
    fireEvent.pointerUp(roll, { clientX: 400, clientY: rowY(72) + 52, pointerId: 2 });
    expect(handlers.onAddNote).toHaveBeenLastCalledWith({
      start: 6,
      duration: 2,
      pitchMidicents: 7200,
      velocity: 0.4,
    });
    expect(screen.queryByTestId('roll-velocity-readout')).toBeNull();
  });

  it('pencil: dragging sideways sets the length and reports it for the next note', () => {
    const { handlers, roll } = renderTool('pencil');
    fireEvent.pointerDown(roll, { clientX: 400, clientY: rowY(72), pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 400 + 176, clientY: rowY(72), pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 400 + 176, clientY: rowY(72), pointerId: 1 });
    expect(handlers.onAddNote).toHaveBeenCalledWith({
      start: 6,
      duration: 3,
      pitchMidicents: 7200,
      velocity: 0.8,
    });
    expect(handlers.onEntryLengthChange).toHaveBeenCalledWith(3);
  });

  it('paint: one note per grid step swept, each a grid step long, at the pitch under the pointer', () => {
    const { handlers, roll } = renderTool('paint', { gridUnit: 1 });
    fireEvent.pointerDown(roll, { clientX: 400, clientY: rowY(72), pointerId: 1 });
    // A fast move skips no step.
    fireEvent.pointerMove(roll, { clientX: 500, clientY: rowY(72), pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 600, clientY: rowY(74), pointerId: 1 });
    expect(handlers.onPaintNotes).not.toHaveBeenCalled();
    fireEvent.pointerUp(roll, { clientX: 600, clientY: rowY(74), pointerId: 1 });
    expect(handlers.onPaintNotes).toHaveBeenCalledTimes(1);
    // No remembered velocity supplied: the default entry velocity, deliberately carried now.
    expect(handlers.onPaintNotes).toHaveBeenCalledWith([
      { start: 6, duration: 1, pitchMidicents: 7200, velocity: 0.8 },
      { start: 7, duration: 1, pitchMidicents: 7200, velocity: 0.8 },
      { start: 8, duration: 1, pitchMidicents: 7400, velocity: 0.8 },
      { start: 9, duration: 1, pitchMidicents: 7400, velocity: 0.8 },
    ]);
  });

  it('paint: every note of a stroke takes the remembered entry velocity, fixed at press', () => {
    const { handlers, roll } = renderTool('paint', { gridUnit: 1, entryVelocity: 0.38 });
    fireEvent.pointerDown(roll, { clientX: 400, clientY: rowY(72), pointerId: 1 });
    // Vertical travel is pitch only: it never reaches the remembered velocity.
    fireEvent.pointerMove(roll, { clientX: 500, clientY: rowY(72) - 60, pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 600, clientY: rowY(74), pointerId: 1 });
    const notes = handlers.onPaintNotes.mock.calls[0][0];
    expect(notes).toHaveLength(4);
    notes.forEach((note: { velocity?: number }) => expect(note.velocity).toBe(0.38));
    expect(handlers.onEntryVelocityChange).not.toHaveBeenCalled();
  });

  it('paint: changing the entry velocity mid-stroke does not change that stroke', () => {
    const onPaintNotes = vi.fn();
    const props = {
      notes: sample,
      duration: 8,
      gridLines: [],
      view,
      onViewChange: () => undefined,
      selectedIds: [],
      tools: [{ id: 'paint', label: 'Paint', shortcut: '4' }],
      activeTool: 'paint',
      gridUnit: 1,
      onPaintNotes,
      onSelectionChange: vi.fn(),
    };
    const { rerender } = render(<PianoRoll {...props} entryVelocity={0.38} />);
    const roll = screen.getByRole('group', { name: /Piano roll/ });
    fireEvent.pointerDown(roll, { clientX: 400, clientY: rowY(72), pointerId: 1 });
    rerender(<PianoRoll {...props} entryVelocity={0.9} />);
    fireEvent.pointerMove(roll, { clientX: 500, clientY: rowY(72), pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 500, clientY: rowY(72), pointerId: 1 });
    const notes = onPaintNotes.mock.calls[0][0];
    expect(notes).toHaveLength(2);
    notes.forEach((note: { velocity?: number }) => expect(note.velocity).toBe(0.38));
  });

  it('knife: a click splits at the nearest grid line; at an end or off a note nothing happens', () => {
    const { handlers, roll } = renderTool('knife', { gridUnit: 1 });
    // c4 runs 1 to 3 (x 64 to 192); x 150 is 2.34 quarters, nearest line 2.
    fireEvent.pointerDown(screen.getByTitle(/^C4/), {
      clientX: 150,
      clientY: rowY(60),
      pointerId: 1,
    });
    expect(handlers.onSplitNote).toHaveBeenCalledWith('c4', 2);
    expect(handlers.onSelectionChange).not.toHaveBeenCalled();
    // x 70 rounds to the note's own start: no split.
    fireEvent.pointerDown(screen.getByTitle(/^C4/), {
      clientX: 70,
      clientY: rowY(60),
      pointerId: 2,
    });
    expect(handlers.onSplitNote).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(roll, { clientX: 20, clientY: rowY(40), pointerId: 3 });
    expect(handlers.onSplitNote).toHaveBeenCalledTimes(1);
  });

  it('eraser: sweeping marks notes with a dashed fill, deletes only on release, Escape cancels', () => {
    const { handlers, roll } = renderTool('eraser');
    fireEvent.pointerDown(screen.getByTitle(/^C4/), {
      clientX: 90,
      clientY: rowY(60),
      pointerId: 1,
    });
    expect(screen.getByTitle(/^C4/)).toHaveAttribute('data-erasing');
    // Sweep up through E4 in one move: the notes between are sampled, not skipped.
    fireEvent.pointerMove(roll, { clientX: 90, clientY: rowY(64), pointerId: 1 });
    expect(screen.getByTitle(/^E4/)).toHaveAttribute('data-erasing');
    expect(screen.getByTitle(/^G4/)).not.toHaveAttribute('data-erasing');
    expect(handlers.onDeleteNotes).not.toHaveBeenCalled();
    fireEvent.pointerUp(roll, { clientX: 90, clientY: rowY(64), pointerId: 1 });
    expect(handlers.onDeleteNotes).toHaveBeenCalledTimes(1);
    expect(handlers.onDeleteNotes).toHaveBeenCalledWith(['c4', 'e4']);
    expect(screen.getByTitle(/^C4/)).not.toHaveAttribute('data-erasing');

    fireEvent.pointerDown(screen.getByTitle(/^G4/), {
      clientX: 340,
      clientY: rowY(67),
      pointerId: 2,
    });
    expect(screen.getByTitle(/^G4/)).toHaveAttribute('data-erasing');
    fireEvent.keyDown(roll, { key: 'Escape' });
    expect(screen.getByTitle(/^G4/)).not.toHaveAttribute('data-erasing');
    fireEvent.pointerUp(roll, { clientX: 340, clientY: rowY(67), pointerId: 2 });
    expect(handlers.onDeleteNotes).toHaveBeenCalledTimes(1);
  });

  it('pencil: the press point is an x/y pad, so length and velocity are set together, each on its own axis', () => {
    const { handlers, roll } = renderTool('pencil', { entryLength: 2 });
    // Mostly vertical with some sideways travel: the velocity moves and the length follows x too.
    fireEvent.pointerDown(roll, { clientX: 400, clientY: rowY(72), pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 400 + 2, clientY: rowY(72) - 28, pointerId: 1 });
    expect(screen.getByTestId('roll-velocity-readout')).toHaveTextContent('100%');
    fireEvent.pointerUp(roll, { clientX: 400 + 2, clientY: rowY(72) - 28, pointerId: 1 });
    // 2 px sideways is inside the dead zone: the length stays and is not re-remembered.
    expect(handlers.onEntryLengthChange).not.toHaveBeenCalled();
    expect(handlers.onEntryVelocityChange).toHaveBeenCalledWith(1);
    expect(handlers.onAddNote).toHaveBeenLastCalledWith({
      start: 6,
      duration: 2,
      pitchMidicents: 7200,
      velocity: 1,
    });

    // A mostly sideways drag with a clear vertical component sets both; neither locks the other out.
    fireEvent.pointerDown(roll, { clientX: 400, clientY: rowY(72), pointerId: 2 });
    fireEvent.pointerMove(roll, { clientX: 400 + 176, clientY: rowY(72) + 52, pointerId: 2 });
    fireEvent.pointerUp(roll, { clientX: 400 + 176, clientY: rowY(72) + 52, pointerId: 2 });
    // From the press point, not the remembered 2: 176 px is 2.75 quarters, snapped to 3.
    expect(handlers.onEntryLengthChange).toHaveBeenCalledWith(3);
    expect(handlers.onEntryVelocityChange).toHaveBeenLastCalledWith(0.4);
    expect(handlers.onAddNote).toHaveBeenLastCalledWith({
      start: 6,
      duration: 3,
      pitchMidicents: 7200,
      velocity: 0.4,
    });
  });

  it('pencil: a velocity drag with sideways wobble past the dead zone gives one grid unit', () => {
    const { handlers, roll } = renderTool('pencil', { entryLength: 2 });
    fireEvent.pointerDown(roll, { clientX: 400, clientY: rowY(72), pointerId: 1 });
    // 10 px sideways is past the dead zone and snaps to zero grid steps: the one-unit floor (0.5).
    fireEvent.pointerMove(roll, { clientX: 410, clientY: rowY(72) + 52, pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 410, clientY: rowY(72) + 52, pointerId: 1 });
    expect(handlers.onAddNote).toHaveBeenLastCalledWith({
      start: 6,
      duration: 0.5,
      pitchMidicents: 7200,
      velocity: 0.4,
    });
  });

  it('pencil: a click uses the remembered velocity', () => {
    const { handlers, roll } = renderTool('pencil', { entryVelocity: 0.38 });
    fireEvent.pointerDown(roll, { clientX: 400, clientY: rowY(72), pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 400, clientY: rowY(72), pointerId: 1 });
    expect(handlers.onAddNote).toHaveBeenLastCalledWith(
      expect.objectContaining({ velocity: 0.38 })
    );
    expect(handlers.onEntryVelocityChange).not.toHaveBeenCalled();
  });

  it('pointer: double-click and hold enters the note and the drag sets its length and velocity', () => {
    const { handlers, roll } = renderTool('pointer');
    fireEvent.pointerDown(roll, { clientX: 400, clientY: rowY(72), pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 400, clientY: rowY(72), pointerId: 1 });
    expect(handlers.onAddNote).not.toHaveBeenCalled();
    fireEvent.pointerDown(roll, { clientX: 401, clientY: rowY(72), pointerId: 2 });
    fireEvent.pointerMove(roll, { clientX: 401 + 176, clientY: rowY(72) + 52, pointerId: 2 });
    fireEvent.pointerUp(roll, { clientX: 401 + 176, clientY: rowY(72) + 52, pointerId: 2 });
    fireEvent.doubleClick(roll, { clientX: 401 + 176, clientY: rowY(72) + 52 });
    expect(handlers.onAddNote).toHaveBeenCalledTimes(1);
    expect(handlers.onAddNote).toHaveBeenCalledWith({
      start: 6,
      duration: 3,
      pitchMidicents: 7200,
      velocity: 0.4,
    });
    expect(handlers.onEntryLengthChange).toHaveBeenCalledWith(3);
    expect(handlers.onEntryVelocityChange).toHaveBeenCalledWith(0.4);
    expect(handlers.onDeleteNotes).not.toHaveBeenCalled();
  });

  it('pointer: a double-press draw held past the double-press window still swallows the dblclick', () => {
    const { handlers, roll } = renderTool('pointer');
    const stamp = (event: Event, time: number) =>
      Object.defineProperty(event, 'timeStamp', { value: time });
    const fire = (type: 'pointerDown' | 'pointerUp' | 'pointerMove', time: number, x: number) => {
      const init = { clientX: x, clientY: rowY(72), pointerId: 1 };
      const event = createEvent[type](roll, init);
      stamp(event, time);
      fireEvent(roll, event);
    };
    fire('pointerDown', 0, 400);
    fire('pointerUp', 50, 400);
    fire('pointerDown', 100, 401);
    fire('pointerMove', 1500, 401 + 176);
    fire('pointerUp', 1600, 401 + 176);
    const dbl = createEvent.dblClick(roll, { clientX: 577, clientY: rowY(72) });
    stamp(dbl, 1601);
    fireEvent(roll, dbl);
    expect(handlers.onAddNote).toHaveBeenCalledTimes(1);
    expect(handlers.onAddNote).toHaveBeenCalledWith(expect.objectContaining({ duration: 3 }));
    // An unrelated dblclick well after the release is not swallowed.
    const later = createEvent.dblClick(roll, { clientX: 70, clientY: rowY(62) });
    stamp(later, 1600 + 5000);
    fireEvent(roll, later);
    expect(handlers.onAddNote).toHaveBeenCalledTimes(2);
  });

  it('pencil: length grows from the press point on the grid, not from the remembered length', () => {
    const { handlers, roll } = renderTool('pencil', { entryLength: 0.5, gridUnit: 0.125 });
    const y = rowY(72);
    fireEvent.pointerDown(roll, { clientX: 400, clientY: y, pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 424, clientY: y, pointerId: 1 });
    // The live preview note (the drawing note) already shows 24 px = 0.375 quarters.
    expect(screen.getByTitle(/0\.375 qn$/)).toBeInTheDocument();
    fireEvent.pointerUp(roll, { clientX: 424, clientY: y, pointerId: 1 });
    expect(handlers.onAddNote).toHaveBeenLastCalledWith(
      expect.objectContaining({ duration: 0.375 })
    );
    // Left of the press point: one grid unit.
    fireEvent.pointerDown(roll, { clientX: 400, clientY: y, pointerId: 2 });
    fireEvent.pointerUp(roll, { clientX: 300, clientY: y, pointerId: 2 });
    expect(handlers.onAddNote).toHaveBeenLastCalledWith(
      expect.objectContaining({ duration: 0.125 })
    );
    // A click inside the dead zone keeps the remembered length.
    fireEvent.pointerDown(roll, { clientX: 400, clientY: y, pointerId: 3 });
    fireEvent.pointerUp(roll, { clientX: 402, clientY: y, pointerId: 3 });
    expect(handlers.onAddNote).toHaveBeenLastCalledWith(expect.objectContaining({ duration: 0.5 }));
  });

  it('a lost pointer capture or a window blur cancels a running gesture; nothing commits later', () => {
    const { handlers, roll } = renderTool('eraser');
    fireEvent.pointerDown(screen.getByTitle(/^C4/), {
      clientX: 90,
      clientY: rowY(60),
      pointerId: 1,
    });
    fireEvent.lostPointerCapture(roll, { pointerId: 1 });
    expect(screen.getByTitle(/^C4/)).not.toHaveAttribute('data-erasing');
    fireEvent.pointerUp(roll, { clientX: 90, clientY: rowY(60), pointerId: 1 });
    expect(handlers.onDeleteNotes).not.toHaveBeenCalled();

    fireEvent.pointerDown(screen.getByTitle(/^C4/), {
      clientX: 90,
      clientY: rowY(60),
      pointerId: 2,
    });
    expect(screen.getByTitle(/^C4/)).toHaveAttribute('data-erasing');
    fireEvent(window, new Event('blur'));
    expect(screen.getByTitle(/^C4/)).not.toHaveAttribute('data-erasing');
    fireEvent.pointerUp(roll, { clientX: 90, clientY: rowY(60), pointerId: 2 });
    expect(handlers.onDeleteNotes).not.toHaveBeenCalled();
  });

  it('a window blur also cancels a pencil entry, and the listener is gone afterwards', () => {
    const removed = vi.spyOn(window, 'removeEventListener');
    const { handlers, roll } = renderTool('pencil');
    fireEvent.pointerDown(roll, { clientX: 400, clientY: rowY(72), pointerId: 1 });
    expect(screen.getByTestId('roll-velocity-readout')).toBeInTheDocument();
    fireEvent(window, new Event('blur'));
    expect(screen.queryByTestId('roll-velocity-readout')).toBeNull();
    fireEvent.pointerUp(roll, { clientX: 400, clientY: rowY(72), pointerId: 1 });
    expect(handlers.onAddNote).not.toHaveBeenCalled();
    expect(removed).toHaveBeenCalledWith('blur', expect.any(Function));
    removed.mockRestore();
  });

  it('pointer: a double-click on overlapping notes deletes the selected one, else the topmost', () => {
    const stacked = [
      { id: 'under', start: 1, duration: 2, pitchMidicents: 6000, label: 'Under' },
      { id: 'over', start: 2, duration: 2, pitchMidicents: 6000, label: 'Over' },
    ];
    const first = renderTool('pointer', { notes: stacked });
    fireEvent.doubleClick(first.roll, { clientX: 160, clientY: rowY(60) });
    expect(first.handlers.onDeleteNotes).toHaveBeenLastCalledWith(['over']);
  });

  it('pointer: with the lower of two overlapping notes selected, double-click deletes it', () => {
    const stacked = [
      { id: 'under', start: 1, duration: 2, pitchMidicents: 6000, label: 'Under' },
      { id: 'over', start: 2, duration: 2, pitchMidicents: 6000, label: 'Over' },
    ];
    const { handlers, roll } = renderTool('pointer', { notes: stacked, selectedIds: ['under'] });
    fireEvent.doubleClick(roll, { clientX: 160, clientY: rowY(60) });
    expect(handlers.onDeleteNotes).toHaveBeenLastCalledWith(['under']);
  });

  it('choosing a tool from the palette returns focus to the roll', () => {
    const { roll } = renderTool('pointer', { onToolChange: vi.fn() });
    fireEvent.click(screen.getByRole('radio', { name: 'Pencil' }));
    expect(roll).toHaveFocus();
  });

  it('the grid unit sets the snap and draws its own lines', () => {
    const { handlers, roll } = renderTool('pencil', { gridUnit: 0.25 });
    fireEvent.pointerDown(roll, { clientX: 400, clientY: rowY(72), pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 400, clientY: rowY(72), pointerId: 1 });
    expect(handlers.onAddNote).toHaveBeenCalledWith({
      start: 6.25,
      duration: 0.25,
      pitchMidicents: 7200,
      velocity: 0.8,
    });
    expect(document.querySelectorAll('[data-subdivision]').length).toBe(8 * 4 + 1);
  });

  it('number keys switch tools through the roll handler only', () => {
    const onToolChange = vi.fn();
    const { roll } = renderTool('pointer', { onToolChange });
    fireEvent.keyDown(roll, { key: '3' });
    expect(onToolChange).toHaveBeenCalledWith('pencil');
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: '1' });
    expect(onToolChange).toHaveBeenCalledTimes(1);
    input.remove();
  });

  it('Alt+wheel scrolls sideways, as Shift does, and Ctrl+Alt still zooms pitch', () => {
    const changes: PianoRollViewState[] = [];
    const { roll } = renderTool('pointer', { onViewChange: (next) => changes.push(next) });
    const scroller = roll.closest('[class*="scroller"]') as HTMLElement;
    Object.defineProperty(scroller, 'scrollLeft', { value: 0, writable: true });
    expect(fireEvent.wheel(scroller, { deltaY: 100, altKey: true })).toBe(false);
    expect(scroller.scrollLeft).toBe(100);
    expect(fireEvent.wheel(scroller, { deltaY: 50, shiftKey: true })).toBe(false);
    expect(scroller.scrollLeft).toBe(150);
    fireEvent.wheel(scroller, { deltaY: -100, ctrlKey: true, altKey: true, clientY: 100 });
    expect(changes.at(-1)!.pixelsPerSemitone).toBeGreaterThan(view.pixelsPerSemitone);
  });
});
