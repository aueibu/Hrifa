import { cleanup, fireEvent, render, screen } from '@test-utils';
import { defaultPianoRollView } from './model';
import { PianoRoll } from './PianoRoll';

// jsdom lays nothing out, so client coordinates are roll coordinates. At 64 px per quarter the grid
// snaps to half a quarter; a semitone is 22 px and C4 (60) is row 67.
const view = { ...defaultPianoRollView, framed: true };
const c4Y = (127 - 60) * 22 + 11;
const e4Y = (127 - 64) * 22 + 11;

const edited = [
  { id: 'c4', start: 1, duration: 1, pitchMidicents: 6000, label: 'C4' },
  { id: 'e4', start: 3, duration: 1, pitchMidicents: 6400, label: 'E4' },
];

function renderRoll(props: Partial<React.ComponentProps<typeof PianoRoll>> = {}) {
  const handlers = {
    onSelectionChange: vi.fn(),
    onMoveNotes: vi.fn(),
    onResizeNotes: vi.fn(),
    onResizeNotesStart: vi.fn(),
    onVelocityChange: vi.fn(),
  };
  render(
    <PianoRoll
      notes={edited}
      duration={6}
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

const c4 = () => screen.getByTitle('C4 · 1.000 qn · 1.000 qn');
const drag = (
  roll: HTMLElement,
  note: HTMLElement,
  from: number,
  to: number,
  y = c4Y,
  extra: object = {}
) => {
  fireEvent.pointerDown(note, { clientX: from, clientY: y, pointerId: 1, ...extra });
  fireEvent.pointerMove(roll, { clientX: to, clientY: y, pointerId: 1, ...extra });
  fireEvent.pointerUp(roll, { clientX: to, clientY: y, pointerId: 1, ...extra });
};

describe('PianoRoll: resize from the left edge', () => {
  it('a left-edge drag reports the snapped start delta once, and neither moves nor resizes the end', () => {
    const { handlers, roll } = renderRoll();
    // The note spans x 64 to 128; the first 6 px is the left edge.
    drag(roll, c4(), 66, 66 + 32);
    expect(handlers.onResizeNotesStart).toHaveBeenCalledTimes(1);
    expect(handlers.onResizeNotesStart).toHaveBeenCalledWith(['c4'], 0.5);
    expect(handlers.onMoveNotes).not.toHaveBeenCalled();
    expect(handlers.onResizeNotes).not.toHaveBeenCalled();
  });

  it('dragging left lengthens the note (negative delta); the right edge and the middle are unchanged', () => {
    const { handlers, roll } = renderRoll();
    drag(roll, c4(), 66, 66 - 64);
    expect(handlers.onResizeNotesStart).toHaveBeenCalledWith(['c4'], -1);
    drag(roll, c4(), 125, 125 + 64);
    expect(handlers.onResizeNotes).toHaveBeenCalledWith(['c4'], 1);
    drag(roll, c4(), 96, 96 + 64);
    expect(handlers.onMoveNotes).toHaveBeenCalledWith(['c4'], { start: 1, pitchMidicents: 0 });
    expect(handlers.onResizeNotesStart).toHaveBeenCalledTimes(1);
  });

  it('is opt-in: without the callback the left edge is part of the body and moves the note', () => {
    const { handlers, roll } = renderRoll({ onResizeNotesStart: undefined });
    drag(roll, c4(), 66, 66 + 64);
    expect(handlers.onMoveNotes).toHaveBeenCalledWith(['c4'], { start: 1, pitchMidicents: 0 });
    expect(handlers.onResizeNotesStart).not.toHaveBeenCalled();
  });

  it('edge zones are min(6 px, a third of the width): a short note keeps a middle that moves it', () => {
    // 0.125 quarters is 8 px wide: the zones are 8 / 3 = 2.67 px each, the middle is the rest.
    const short = [{ id: 's', start: 2, duration: 0.125, pitchMidicents: 6400, label: 'S' }];
    const { handlers, roll } = renderRoll({ notes: short });
    const note = screen.getByTitle('S · 2.000 qn · 0.125 qn');
    // The note spans x 128 to 136.
    drag(roll, note, 129, 129 + 64, e4Y);
    expect(handlers.onResizeNotesStart).toHaveBeenCalledWith(['s'], 1);
    drag(roll, note, 132, 132 + 64, e4Y);
    expect(handlers.onMoveNotes).toHaveBeenCalledWith(['s'], { start: 1, pitchMidicents: 0 });
    drag(roll, note, 135, 135 + 64, e4Y);
    expect(handlers.onResizeNotes).toHaveBeenCalledWith(['s'], 1);
    expect(handlers.onResizeNotesStart).toHaveBeenCalledTimes(1);
    expect(handlers.onMoveNotes).toHaveBeenCalledTimes(1);
  });

  it('a long note keeps 6 px zones, and a 24 px note has 6 px zones around a 12 px middle', () => {
    const medium = [{ id: 'm', start: 2, duration: 0.375, pitchMidicents: 6400, label: 'M' }];
    const { handlers, roll } = renderRoll({ notes: medium });
    const note = screen.getByTitle('M · 2.000 qn · 0.375 qn');
    // Spans 128 to 152: left zone to 134, right zone from 146.
    drag(roll, note, 133, 133 + 64, e4Y);
    drag(roll, note, 135, 135 + 64, e4Y);
    drag(roll, note, 147, 147 + 64, e4Y);
    expect(handlers.onResizeNotesStart).toHaveBeenCalledTimes(1);
    expect(handlers.onMoveNotes).toHaveBeenCalledTimes(1);
    expect(handlers.onResizeNotes).toHaveBeenCalledTimes(1);
  });

  it('applies to the whole selection with one snapped delta', () => {
    const { handlers, roll } = renderRoll({ selectedIds: ['c4', 'e4'] });
    drag(roll, c4(), 66, 66 + 64);
    expect(handlers.onResizeNotesStart).toHaveBeenCalledWith(['c4', 'e4'], 1);
    // The press did not change the selection.
    expect(handlers.onSelectionChange).not.toHaveBeenCalled();
  });

  it('a click on the edge without a drag selects the note and reports nothing', () => {
    const { handlers, roll } = renderRoll();
    drag(roll, c4(), 66, 66);
    expect(handlers.onResizeNotesStart).not.toHaveBeenCalled();
    expect(handlers.onSelectionChange).toHaveBeenCalledWith(['c4']);
  });

  it('ghost preview: the ghost keeps the end, each note held at the minimum on its own; Escape cancels', () => {
    const notes = [
      { id: 'a', start: 1, duration: 1, pitchMidicents: 6000, label: 'A' },
      { id: 'b', start: 3, duration: 0.25, pitchMidicents: 6400, label: 'B' },
    ];
    const { handlers, roll } = renderRoll({ ghostDrag: true, selectedIds: ['a', 'b'], notes });
    const note = screen.getByTitle('A · 1.000 qn · 1.000 qn');
    fireEvent.pointerDown(note, { clientX: 66, clientY: c4Y, pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 66 + 32, clientY: c4Y, pointerId: 1 });
    const ghost = (id: string) => document.querySelector(`[data-ghost="${id}"]`) as HTMLElement;
    // a: start 1.5, end stays 2 (96 px, 32 px wide). The real note stays where it was.
    expect(ghost('a').style.left).toBe('96px');
    expect(ghost('a').style.width).toBe('32px');
    expect(note.style.width).toBe('64px');
    // b (16 px wide) cannot shorten past the minimum (drawn 3 px wide at least): its end stays at 3.25 (208 px).
    expect(ghost('b').style.left).toBe('206px');
    expect(ghost('b').style.width).toBe('3px');
    fireEvent.keyDown(roll, { key: 'Escape' });
    expect(document.querySelector('[data-ghost]')).toBeNull();
    fireEvent.pointerUp(roll, { clientX: 66 + 32, clientY: c4Y, pointerId: 1 });
    expect(handlers.onResizeNotesStart).not.toHaveBeenCalled();
  });

  it('without ghost drag the note itself previews the new start and length', () => {
    const { roll } = renderRoll();
    const note = c4();
    fireEvent.pointerDown(note, { clientX: 66, clientY: c4Y, pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 66 - 32, clientY: c4Y, pointerId: 1 });
    expect(note.style.left).toBe('32px');
    expect(note.style.width).toBe('96px');
    fireEvent.pointerUp(roll, { clientX: 66 - 32, clientY: c4Y, pointerId: 1 });
  });

  it('holds the start at 0 in the preview and in the report the owner clamps', () => {
    const { roll } = renderRoll();
    const note = c4();
    fireEvent.pointerDown(note, { clientX: 66, clientY: c4Y, pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 66 - 640, clientY: c4Y, pointerId: 1 });
    expect(note.style.left).toBe('0px');
    expect(note.style.width).toBe('128px');
    fireEvent.pointerUp(roll, { clientX: 66 - 640, clientY: c4Y, pointerId: 1 });
  });
});

describe('PianoRoll: tool cursors (opt-in)', () => {
  afterEach(cleanup);

  it('adds nothing without the opt-in', () => {
    const { roll } = renderRoll();
    expect(roll).not.toHaveAttribute('data-cursors');
    expect(roll.style.getPropertyValue('--cursor-pencil')).toBe('');
    fireEvent.pointerEnter(roll);
    fireEvent.keyDown(window, { key: 'Alt', altKey: true });
    expect(roll).not.toHaveAttribute('data-alt');
  });

  it('carries every tool cursor as an inline SVG with a stock fallback', () => {
    const { roll } = renderRoll({ toolCursors: true });
    expect(roll).toHaveAttribute('data-cursors');
    ['pencil', 'paint', 'knife', 'eraser', 'time'].forEach((tool) => {
      const value = roll.style.getPropertyValue(`--cursor-${tool}`);
      expect(value).toContain('data:image/svg+xml');
      expect(value).toMatch(/, [a-z-]+$/);
    });
  });

  it('follows Alt and Ctrl/Cmd on their keydown and keyup while hovered, and not otherwise', () => {
    const { roll } = renderRoll({ toolCursors: true });
    fireEvent.keyDown(window, { key: 'Alt', altKey: true });
    expect(roll).not.toHaveAttribute('data-alt');
    fireEvent.pointerEnter(roll);
    fireEvent.keyDown(window, { key: 'Alt', altKey: true });
    expect(roll).toHaveAttribute('data-alt');
    fireEvent.keyUp(window, { key: 'Alt' });
    expect(roll).not.toHaveAttribute('data-alt');
    fireEvent.keyDown(window, { key: 'Control', ctrlKey: true });
    expect(roll).toHaveAttribute('data-copy-key');
    fireEvent.keyUp(window, { key: 'Control' });
    expect(roll).not.toHaveAttribute('data-copy-key');
    fireEvent.keyDown(window, { key: 'Meta', metaKey: true });
    expect(roll).toHaveAttribute('data-copy-key');
    fireEvent.keyUp(window, { key: 'Meta' });
    // Leaving the roll stops the tracking.
    fireEvent.pointerLeave(roll);
    fireEvent.keyDown(window, { key: 'Alt', altKey: true });
    expect(roll).not.toHaveAttribute('data-alt');
  });

  it('a pointer move also corrects the modifier state (the keys changed while elsewhere)', () => {
    const { roll } = renderRoll({ toolCursors: true });
    fireEvent.pointerMove(roll, { clientX: 10, clientY: 10, altKey: true });
    expect(roll).toHaveAttribute('data-alt');
    fireEvent.pointerMove(roll, { clientX: 11, clientY: 10, ctrlKey: true });
    expect(roll).not.toHaveAttribute('data-alt');
    expect(roll).toHaveAttribute('data-copy-key');
  });

  it('a note reports the edge zone under the pointer; a drag names its kind', () => {
    const { roll } = renderRoll({ toolCursors: true });
    const note = c4();
    fireEvent.pointerMove(note, { clientX: 66, clientY: c4Y });
    expect(note).toHaveAttribute('data-zone', 'left');
    fireEvent.pointerMove(note, { clientX: 96, clientY: c4Y });
    expect(note).toHaveAttribute('data-zone', 'body');
    fireEvent.pointerMove(note, { clientX: 126, clientY: c4Y });
    expect(note).toHaveAttribute('data-zone', 'right');

    fireEvent.pointerDown(note, { clientX: 66, clientY: c4Y, pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 98, clientY: c4Y, pointerId: 1 });
    expect(roll).toHaveAttribute('data-gesture', 'resizeStart');
    fireEvent.pointerUp(roll, { clientX: 98, clientY: c4Y, pointerId: 1 });
    expect(roll).not.toHaveAttribute('data-gesture');

    fireEvent.pointerDown(note, { clientX: 96, clientY: c4Y, pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 160, clientY: c4Y, pointerId: 1 });
    expect(roll).toHaveAttribute('data-gesture', 'move');
    fireEvent.pointerUp(roll, { clientX: 160, clientY: c4Y, pointerId: 1 });

    fireEvent.pointerDown(note, { clientX: 126, clientY: c4Y, pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 160, clientY: c4Y, pointerId: 1 });
    expect(roll).toHaveAttribute('data-gesture', 'resize');
    fireEvent.pointerUp(roll, { clientX: 160, clientY: c4Y, pointerId: 1 });

    fireEvent.pointerDown(note, { clientX: 96, clientY: c4Y, altKey: true, pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 96, clientY: c4Y - 40, pointerId: 1 });
    expect(roll).toHaveAttribute('data-gesture', 'velocity');
    fireEvent.pointerUp(roll, { clientX: 96, clientY: c4Y - 40, pointerId: 1 });
  });

  it('a Ctrl/Cmd drag shows the copy cursor, and the tool is on the roll for the stylesheet', () => {
    const { roll } = renderRoll({ toolCursors: true, selectedIds: ['c4'] });
    const note = c4();
    fireEvent.pointerDown(note, { clientX: 96, clientY: c4Y, ctrlKey: true, pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 160, clientY: c4Y, ctrlKey: true, pointerId: 1 });
    expect(roll).toHaveAttribute('data-copying');
    fireEvent.pointerUp(roll, { clientX: 160, clientY: c4Y, ctrlKey: true, pointerId: 1 });
    expect(roll).toHaveAttribute('data-tool', 'select');
  });

  it('refreshes a time-band drag on the Ctrl and Alt keys without a pointer move', () => {
    const onMoveTimeRange = vi.fn();
    const { roll } = renderRoll({
      toolCursors: true,
      activeTool: 'time',
      selectedRange: { start: 1, end: 2 },
      onMoveTimeRange,
    });
    fireEvent.pointerDown(roll, { clientX: 90, clientY: c4Y, pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 154, clientY: c4Y, pointerId: 1 });
    expect(roll).not.toHaveAttribute('data-copying');
    fireEvent.keyDown(window, { key: 'Control', ctrlKey: true });
    expect(roll).toHaveAttribute('data-copying');
    expect(screen.getByTestId('roll-velocity-readout')).toHaveTextContent('Copy');
    fireEvent.keyUp(window, { key: 'Control' });
    expect(roll).not.toHaveAttribute('data-copying');
    fireEvent.pointerUp(roll, { clientX: 154, clientY: c4Y, pointerId: 1 });
    expect(onMoveTimeRange).toHaveBeenCalledWith({ start: 1, end: 2 }, 1);
  });

  it('without the opt-in a note drag attaches no key listeners (Melodicization and the mixer)', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const { roll } = renderRoll();
    fireEvent.pointerEnter(roll);
    fireEvent.pointerDown(c4(), { clientX: 100, clientY: c4Y, pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 140, clientY: c4Y, pointerId: 1 });
    const keyUps = add.mock.calls.filter(([type]) => type === 'keyup');
    expect(keyUps).toHaveLength(0);
    fireEvent.pointerUp(roll, { clientX: 140, clientY: c4Y, pointerId: 1 });
    add.mockRestore();
  });

  it('removes its window listeners when the roll unmounts', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const add = vi.spyOn(window, 'addEventListener');
    const { roll } = renderRoll({ toolCursors: true });
    fireEvent.pointerEnter(roll);
    const added = add.mock.calls.filter(([type]) => type === 'keydown' || type === 'keyup').length;
    expect(added).toBeGreaterThan(0);
    cleanup();
    const removed = remove.mock.calls.filter(
      ([type]) => type === 'keydown' || type === 'keyup'
    ).length;
    expect(removed).toBeGreaterThanOrEqual(added);
    add.mockRestore();
    remove.mockRestore();
  });
});
