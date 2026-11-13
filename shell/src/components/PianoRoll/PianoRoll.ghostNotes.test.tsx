import { useState } from 'react';
import { fireEvent, render, screen } from '@test-utils';
import { defaultPianoRollView, type PianoRollViewState } from './model';
import { PianoRoll, type PianoRollGhostNote } from './PianoRoll';

// Ghost notes: an opt-in display overlay. jsdom lays nothing out, so the roll's origin is (0, 0).
const notes = [
  { id: 'n1', start: 0, duration: 1, pitchMidicents: 6000, label: 'C4', velocity: 0.8 },
];

function Harness({
  ghosts,
  tool = 'pointer',
  selected = ['n1'],
  spies,
}: {
  ghosts?: PianoRollGhostNote[];
  tool?: string;
  selected?: string[];
  spies: {
    onSelectionChange: () => void;
    onAddNote: () => void;
    onAnchorClick?: () => void;
    onAnchorHover?: (anchor: unknown) => void;
  };
}) {
  const [view, setView] = useState<PianoRollViewState>({ ...defaultPianoRollView, framed: true });
  return (
    <PianoRoll
      notes={notes}
      duration={8}
      gridLines={[]}
      view={view}
      onViewChange={setView}
      showToolbar={false}
      selectedIds={selected}
      onSelectionChange={spies.onSelectionChange}
      tools={[
        { id: 'pointer', label: 'Pointer', shortcut: '1' },
        { id: 'chords', label: 'Chords', shortcut: '7' },
      ]}
      activeTool={tool}
      onAddNote={spies.onAddNote}
      onAnchorClick={spies.onAnchorClick}
      onAnchorHover={spies.onAnchorHover}
      ghostNotes={ghosts}
    />
  );
}

const spies = () => ({
  onSelectionChange: vi.fn(),
  onAddNote: vi.fn(),
  onAnchorClick: vi.fn(),
  onAnchorHover: vi.fn(),
});
const overlays = () => document.querySelectorAll('[data-ghost-overlay]');

describe('PianoRoll ghostNotes', () => {
  it('draws nothing without the prop', () => {
    render(<Harness spies={spies()} />);
    expect(overlays()).toHaveLength(0);
  });

  it('draws one outline per ghost with its variant and label, on the roll mapping', () => {
    render(
      <Harness
        spies={spies()}
        ghosts={[
          { pitchMidicents: 6000, start: 1, duration: 2, variant: 'hover', label: 'C' },
          { pitchMidicents: 6450, start: 1, duration: 2, variant: 'pinned' },
          { pitchMidicents: 6700, start: 0, duration: 1, variant: 'anchor' },
        ]}
      />
    );
    const found = [...overlays()] as HTMLElement[];
    expect(found.map((el) => el.dataset.ghostOverlay)).toEqual(['hover', 'pinned', 'anchor']);
    expect(found[0].textContent).toBe('C');
    // Fractional pitch sits between rows: 64.5 is half a row above the E4 row's top neighbour.
    const row = (midi: number) => (127 - midi) * 22;
    expect(parseFloat(found[1].style.top)).toBeCloseTo(
      row(64.5) + (22 - parseFloat(found[1].style.height)) / 2
    );
    expect(found[0].getAttribute('aria-hidden')).toBe('true');
  });

  it('labelPlacement: on-note (default) draws inside, side draws beside even when narrow', () => {
    render(
      <Harness
        spies={spies()}
        ghosts={[
          { pitchMidicents: 6000, start: 1, duration: 2, variant: 'anchor', label: 'C4' },
          {
            pitchMidicents: 6200,
            start: 1,
            duration: 0.01,
            variant: 'anchor',
            label: 'D4',
            labelPlacement: 'side',
          },
          { pitchMidicents: 6400, start: 1, duration: 0.01, variant: 'anchor', label: 'E4' },
        ]}
      />
    );
    const found = [...overlays()] as HTMLElement[];
    expect(found[0].dataset.labelPlacement).toBe('on-note');
    expect(found[0].querySelector('[class*="ghostSideLabel"]')).toBeNull();
    expect(found[0].textContent).toBe('C4');
    expect(found[1].dataset.labelPlacement).toBe('side');
    expect(found[1].querySelector('[class*="ghostSideLabel"]')?.textContent).toBe('D4');
    // On-note labels are dropped when the ghost is too narrow; side labels are not.
    expect(found[2].textContent).toBe('');
    expect(found[1].getAttribute('aria-hidden')).toBe('true');
  });

  it('never changes selection or edits: a press over a ghost reaches the note underneath', () => {
    const s = spies();
    render(
      <Harness
        spies={s}
        selected={[]}
        ghosts={[{ pitchMidicents: 6000, start: 0, duration: 1, variant: 'pinned' }]}
      />
    );
    const note = screen.getByTitle(/^C4/);
    expect(note).not.toHaveAttribute('data-selected');
    const at = { clientX: 5, clientY: (127 - 60) * 22 + 3, pointerId: 1 };
    fireEvent.pointerDown(note, at);
    fireEvent.pointerUp(note, at);
    fireEvent.click(note, at);
    // The note under the ghost took the press; the ghost itself edited nothing.
    expect(s.onSelectionChange).toHaveBeenCalledWith(['n1']);
    expect(s.onAddNote).not.toHaveBeenCalled();
    expect(s.onAnchorClick).not.toHaveBeenCalled();
  });

  it('chords tool: a press reports the snapped cell and changes nothing else', () => {
    const s = spies();
    render(<Harness spies={s} tool="chords" />);
    const roll = screen.getByRole('group', { name: /Piano roll/ });
    fireEvent.pointerDown(roll, { clientX: 70, clientY: (127 - 60) * 22 + 3, pointerId: 1 });
    fireEvent.pointerUp(roll, { clientX: 70, clientY: (127 - 60) * 22 + 3, pointerId: 1 });
    expect(s.onAnchorClick).toHaveBeenCalledTimes(1);
    expect(s.onAnchorClick).toHaveBeenCalledWith(
      expect.objectContaining({ pitchMidicents: 6000, start: expect.any(Number) })
    );
    expect(s.onAddNote).not.toHaveBeenCalled();
    expect(s.onSelectionChange).not.toHaveBeenCalled();
  });

  it('chords tool: the press reports ctrlKey for Ctrl and for Cmd, false for a plain press', () => {
    const s = spies();
    render(<Harness spies={s} tool="chords" />);
    const roll = screen.getByRole('group', { name: /Piano roll/ });
    const at = { clientX: 70, clientY: (127 - 60) * 22 + 3, pointerId: 1 };
    fireEvent.pointerDown(roll, at);
    fireEvent.pointerUp(roll, at);
    fireEvent.pointerDown(roll, { ...at, ctrlKey: true });
    fireEvent.pointerUp(roll, { ...at, ctrlKey: true });
    fireEvent.pointerDown(roll, { ...at, metaKey: true });
    fireEvent.pointerUp(roll, { ...at, metaKey: true });
    const flags = s.onAnchorClick.mock.calls.map(([anchor]) => anchor.ctrlKey);
    expect(flags).toEqual([false, true, true]);
  });

  it('wears the note class (same fill, outline and radius tokens) and stays see-through', () => {
    render(
      <Harness
        spies={spies()}
        ghosts={[{ pitchMidicents: 6000, start: 1, duration: 2, variant: 'hover' }]}
      />
    );
    const ghost = overlays()[0] as HTMLElement;
    expect(ghost.className).toMatch(/note/);
    expect(ghost.className).toMatch(/ghostOverlay/);
  });

  describe('onAnchorHover', () => {
    const at = { clientX: 70, clientY: (127 - 60) * 22 + 3, pointerId: 1 };

    it('chords tool: reports the snapped cell once per cell, creates nothing', () => {
      const s = spies();
      render(<Harness spies={s} tool="chords" />);
      const roll = screen.getByRole('group', { name: /Piano roll/ });
      fireEvent.pointerMove(roll, at);
      fireEvent.pointerMove(roll, { ...at, clientX: 71 });
      expect(s.onAnchorHover).toHaveBeenCalledTimes(1);
      expect(s.onAnchorHover).toHaveBeenCalledWith(
        expect.objectContaining({
          pitchMidicents: 6000,
          start: expect.any(Number),
          step: expect.any(Number),
        })
      );
      expect(s.onAddNote).not.toHaveBeenCalled();
      expect(s.onSelectionChange).not.toHaveBeenCalled();
    });

    it('calls with null on pointer leave', () => {
      const s = spies();
      render(<Harness spies={s} tool="chords" />);
      const roll = screen.getByRole('group', { name: /Piano roll/ });
      fireEvent.pointerMove(roll, at);
      fireEvent.pointerLeave(roll);
      expect(s.onAnchorHover).toHaveBeenLastCalledWith(null);
    });

    it('is silent with another tool, and calls null when the tool changes away', () => {
      const s = spies();
      const { rerender } = render(<Harness spies={s} tool="pointer" />);
      const roll = screen.getByRole('group', { name: /Piano roll/ });
      fireEvent.pointerMove(roll, at);
      expect(s.onAnchorHover).not.toHaveBeenCalled();
      rerender(<Harness spies={s} tool="chords" />);
      fireEvent.pointerMove(roll, at);
      expect(s.onAnchorHover).toHaveBeenCalledTimes(1);
      rerender(<Harness spies={s} tool="pointer" />);
      expect(s.onAnchorHover).toHaveBeenLastCalledWith(null);
    });
  });
});
