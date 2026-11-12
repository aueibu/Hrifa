import { useState } from 'react';
import { fireEvent, render, screen } from '@test-utils';
import { defaultPianoRollView, type PianoRollViewState } from './model';
import { PianoRoll } from './PianoRoll';

// Pick-pitch mode: the owner waits for a pitch row, the roll maps a press to the row under it.
// jsdom lays nothing out, so the roll's rectangle is faked: its top is minus the scroll offset,
// exactly where a scrolled layer's top sits.
const notes = [
  { id: 'n1', start: 0, duration: 1, pitchMidicents: 6000, label: 'C4', velocity: 0.8 },
  { id: 'n2', start: 2, duration: 1, pitchMidicents: 6400, label: 'E4', velocity: 0.8 },
];

const rowY = (midi: number, scrollTop = 0) => (127 - midi) * 22 + 11 - scrollTop;

interface Spies {
  onPick: (midi: number) => void;
  onSelectionChange: (ids: string[]) => void;
  onAddNote: () => void;
  onMoveNotes: () => void;
  onMarqueeRange: () => void;
  onToolChange: (id: string) => void;
}

function Harness({
  spies,
  tool = 'pointer',
  picking = true,
  detached = false,
  scrollTop = 0,
}: {
  spies: Spies;
  tool?: string;
  picking?: boolean;
  detached?: boolean;
  scrollTop?: number;
}) {
  const [view, setView] = useState<PianoRollViewState>({
    ...defaultPianoRollView,
    framed: true,
    scrollTop,
  });
  return (
    <PianoRoll
      notes={notes}
      duration={8}
      gridLines={[]}
      view={view}
      onViewChange={setView}
      showToolbar={false}
      selectedIds={['n1']}
      onSelectionChange={spies.onSelectionChange}
      tools={[
        { id: 'pointer', label: 'Pointer', shortcut: '1' },
        { id: 'pencil', label: 'Pencil', shortcut: '3' },
      ]}
      activeTool={tool}
      onToolChange={spies.onToolChange}
      onAddNote={spies.onAddNote}
      onMoveNotes={spies.onMoveNotes}
      onMarqueeRange={spies.onMarqueeRange}
      detachedScroll={detached}
      fill={detached}
      pickPitch={picking ? { hint: 'Click a pitch.', onPick: spies.onPick } : null}
    />
  );
}

function spies(): Spies {
  return {
    onPick: vi.fn(),
    onSelectionChange: vi.fn(),
    onAddNote: vi.fn(),
    onMoveNotes: vi.fn(),
    onMarqueeRange: vi.fn(),
    onToolChange: vi.fn(),
  };
}

function rollWithTop(top: number) {
  const roll = screen.getByRole('group', { name: /Piano roll/ });
  roll.getBoundingClientRect = () => ({ left: 0, top, right: 800, bottom: top + 2816 }) as DOMRect;
  return roll;
}

const quiet = (s: Spies) => {
  expect(s.onSelectionChange).not.toHaveBeenCalled();
  expect(s.onAddNote).not.toHaveBeenCalled();
  expect(s.onMoveNotes).not.toHaveBeenCalled();
  expect(s.onMarqueeRange).not.toHaveBeenCalled();
};

describe('pick-pitch mode', () => {
  it('shows the hint, a crosshair marker and the row under the pointer', () => {
    const s = spies();
    render(<Harness spies={s} />);
    const roll = rollWithTop(0);
    expect(screen.getByTestId('roll-pick-banner')).toHaveTextContent('Click a pitch.');
    expect(roll).toHaveAttribute('data-picking');
    expect(screen.queryByTestId('roll-pick-row')).toBeNull();
    fireEvent.pointerMove(roll, { clientX: 100, clientY: rowY(64), pointerId: 1 });
    const row = screen.getByTestId('roll-pick-row');
    expect(row).toHaveAttribute('data-midi', '64');
    expect(row.style.top).toBe(`${(127 - 64) * 22}px`);
    expect(row.style.height).toBe('22px');
    fireEvent.pointerLeave(roll);
    expect(screen.queryByTestId('roll-pick-row')).toBeNull();
  });

  it('shows nothing outside the mode', () => {
    render(<Harness spies={spies()} picking={false} />);
    expect(screen.queryByTestId('roll-pick-banner')).toBeNull();
    expect(screen.getByRole('group', { name: /Piano roll/ })).not.toHaveAttribute('data-picking');
  });

  it('a press on a pitch row is a pick: it reports the row and changes no selection, draws nothing', () => {
    for (const tool of ['pointer', 'pencil']) {
      const s = spies();
      const { unmount } = render(<Harness spies={s} tool={tool} />);
      const roll = rollWithTop(0);
      fireEvent.pointerDown(roll, { clientX: 300, clientY: rowY(67), pointerId: 1 });
      fireEvent.pointerUp(roll, { clientX: 300, clientY: rowY(67), pointerId: 1 });
      expect(s.onPick).toHaveBeenCalledTimes(1);
      expect(s.onPick).toHaveBeenCalledWith(67);
      quiet(s);
      unmount();
    }
  });

  it('a press on a note picks the row under it and does not select or move the note', () => {
    const s = spies();
    render(<Harness spies={s} />);
    rollWithTop(0);
    const note = screen.getByTitle(/^E4/);
    fireEvent.pointerDown(note, { clientX: 140, clientY: rowY(64), pointerId: 1 });
    fireEvent.pointerUp(note, { clientX: 140, clientY: rowY(64), pointerId: 1 });
    expect(s.onPick).toHaveBeenCalledWith(64);
    quiet(s);
  });

  it('maps rows in a scrolled view: the layer top moves with the scroll', () => {
    const s = spies();
    render(<Harness spies={s} scrollTop={1000} />);
    // The layer sits 1000 px above the viewport: the same screen y is a lower row than unscrolled.
    const roll = rollWithTop(-1000);
    fireEvent.pointerDown(roll, { clientX: 300, clientY: 0, pointerId: 1 });
    expect(s.onPick).toHaveBeenLastCalledWith(127 - Math.floor(1000 / 22));
    fireEvent.pointerDown(roll, { clientX: 300, clientY: 300, pointerId: 1 });
    expect(s.onPick).toHaveBeenLastCalledWith(127 - Math.floor(1300 / 22));
    // The edges clamp to the keyboard.
    fireEvent.pointerDown(roll, { clientX: 300, clientY: -5000, pointerId: 1 });
    expect(s.onPick).toHaveBeenLastCalledWith(127);
    fireEvent.pointerDown(roll, { clientX: 300, clientY: 90_000, pointerId: 1 });
    expect(s.onPick).toHaveBeenLastCalledWith(0);
    quiet(s);
  });

  it.each([false, true])('a press on a key picks that key (detached panel: %s)', (detached) => {
    const s = spies();
    const { container } = render(<Harness spies={s} detached={detached} />);
    const key = container.querySelector('[data-midi="72"]') as HTMLElement;
    expect(key).not.toBeNull();
    fireEvent.pointerEnter(key);
    expect(key).toHaveAttribute('data-pick-hover');
    fireEvent.pointerDown(key, { clientX: 10, clientY: 5, pointerId: 1 });
    expect(s.onPick).toHaveBeenCalledWith(72);
    quiet(s);
  });

  it('the keys do nothing special outside the mode', () => {
    const s = spies();
    const { container } = render(<Harness spies={s} picking={false} />);
    fireEvent.pointerDown(container.querySelector('[data-midi="72"]') as HTMLElement);
    expect(s.onPick).not.toHaveBeenCalled();
  });

  it('Escape and Enter are left to the owner: the selection is not cleared', () => {
    const s = spies();
    render(<Harness spies={s} detached />);
    const roll = rollWithTop(0);
    roll.focus();
    fireEvent.keyDown(roll, { key: 'Escape' });
    fireEvent.keyDown(roll, { key: 'Enter' });
    fireEvent.keyDown(roll, { key: 'Delete' });
    quiet(s);
    expect(s.onPick).not.toHaveBeenCalled();
  });

  it('a tool shortcut still switches the tool (and so ends the pick for its owner)', () => {
    const s = spies();
    render(<Harness spies={s} detached />);
    const roll = rollWithTop(0);
    fireEvent.keyDown(roll, { key: '3' });
    expect(s.onToolChange).toHaveBeenCalledWith('pencil');
  });

  it('a right-click is not a pick and opens no menu', () => {
    const s = spies();
    render(<Harness spies={s} />);
    const roll = rollWithTop(0);
    fireEvent.pointerDown(roll, { button: 2, clientX: 300, clientY: rowY(67), pointerId: 1 });
    expect(fireEvent.contextMenu(roll, { clientX: 300, clientY: rowY(67) })).toBe(false);
    expect(s.onPick).not.toHaveBeenCalled();
    quiet(s);
  });

  it('a double-click right after the pick draws and deletes nothing', () => {
    const s = spies();
    render(<Harness spies={s} picking={false} />);
    const roll = rollWithTop(0);
    fireEvent.doubleClick(roll, { clientX: 300, clientY: rowY(67) });
    expect(s.onAddNote).toHaveBeenCalledTimes(1);
    const during = spies();
    render(<Harness spies={during} />);
    const second = screen.getAllByRole('group', { name: /Piano roll/ })[1];
    second.getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 2816 }) as DOMRect;
    fireEvent.doubleClick(second, { clientX: 300, clientY: rowY(67) });
    expect(during.onAddNote).not.toHaveBeenCalled();
  });
  it('the second press of a double-click right after a pick is swallowed: the selection stays', () => {
    const s = spies();
    const { rerender } = render(<Harness spies={s} />);
    const roll = rollWithTop(0);
    fireEvent.pointerDown(roll, { clientX: 300, clientY: rowY(67), pointerId: 1, timeStamp: 1000 });
    fireEvent.pointerUp(roll, { clientX: 300, clientY: rowY(67), pointerId: 1, timeStamp: 1010 });
    expect(s.onPick).toHaveBeenCalledTimes(1);
    // The owner ends the pick; the quick second press lands on the roll in ordinary mode.
    rerender(<Harness spies={s} picking={false} />);
    fireEvent.pointerDown(roll, { clientX: 300, clientY: rowY(67), pointerId: 1, timeStamp: 1200 });
    fireEvent.pointerUp(roll, { clientX: 300, clientY: rowY(67), pointerId: 1, timeStamp: 1210 });
    quiet(s);
  });

  it('a second press that lands on a note right after a pick is swallowed too', () => {
    const s = spies();
    const { rerender } = render(<Harness spies={s} />);
    const roll = rollWithTop(0);
    fireEvent.pointerDown(roll, { clientX: 300, clientY: rowY(67), pointerId: 1, timeStamp: 1000 });
    rerender(<Harness spies={s} picking={false} />);
    fireEvent.pointerDown(screen.getByTitle(/^E4/), {
      clientX: 140,
      clientY: rowY(64),
      pointerId: 1,
      timeStamp: 1200,
    });
    quiet(s);
  });

  it('only that one press is swallowed, and a later press (after the window) works as usual', () => {
    const s = spies();
    const { rerender } = render(<Harness spies={s} />);
    const roll = rollWithTop(0);
    fireEvent.pointerDown(roll, { clientX: 300, clientY: rowY(67), pointerId: 1, timeStamp: 1000 });
    rerender(<Harness spies={s} picking={false} />);
    fireEvent.pointerDown(roll, { clientX: 300, clientY: rowY(67), pointerId: 1, timeStamp: 1100 });
    fireEvent.pointerUp(roll, { clientX: 300, clientY: rowY(67), pointerId: 1, timeStamp: 1110 });
    quiet(s);
    fireEvent.pointerDown(roll, { clientX: 400, clientY: rowY(90), pointerId: 1, timeStamp: 1300 });
    fireEvent.pointerUp(roll, { clientX: 400, clientY: rowY(90), pointerId: 1, timeStamp: 1310 });
    expect(s.onSelectionChange).toHaveBeenCalledWith([]);
  });
});
