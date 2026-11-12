import { fireEvent, render, screen } from '@test-utils';
import { rollGridLines } from './grid';
import { PIANO_ROLL_KEYBOARD_WIDTH } from './model';
import { velocityFillColor } from './velocityFill';
import { VelocityLane } from './VelocityLane';

// The lane is 84 px tall with 8 px of padding: 68 px is the whole 0 to 100% range.
const notes = [
  {
    id: 'a',
    start: 0,
    duration: 1,
    pitchMidicents: 6000,
    label: 'C4',
    velocity: 0.5,
    color: 'var(--mark-red)',
  },
  { id: 'b', start: 2, duration: 1, pitchMidicents: 6400, label: 'E4', velocity: 0.25 },
  {
    id: 'c',
    start: 4,
    duration: 1,
    pitchMidicents: 6700,
    label: 'G4',
    velocity: 1,
    sourceId: 'chord',
  },
];

function lane(props: Partial<React.ComponentProps<typeof VelocityLane>> = {}) {
  const onVelocityChange = vi.fn();
  const onCollapsedChange = vi.fn();
  const view = render(
    <VelocityLane
      notes={notes}
      pixelsPerQuarter={64}
      scrollLeft={0}
      duration={8}
      onVelocityChange={onVelocityChange}
      onCollapsedChange={onCollapsedChange}
      {...props}
    />
  );
  return { onVelocityChange, onCollapsedChange, ...view };
}

const pin = (id: string) =>
  document.querySelector(`[data-testid="velocity-pin"][data-note="${id}"]`) as HTMLElement;
const stem = (id: string) =>
  document.querySelector(`[data-testid="velocity-stem"][data-note="${id}"]`) as HTMLElement;

describe('VelocityLane', () => {
  it('draws one stem and pin per note at its start, coloured like the note, as tall as its velocity', () => {
    lane();
    expect(screen.getAllByTestId('velocity-stem')).toHaveLength(3);
    expect(stem('a').style.left).toBe('0px');
    expect(stem('b').style.left).toBe('128px');
    expect(stem('a').style.getPropertyValue('--stem-color')).toBe('var(--mark-red)');
    expect(stem('b').style.getPropertyValue('--stem-color')).toBe(
      'var(--mantine-primary-color-filled)'
    );
    // Louder is taller: the 100% stem starts above the 25% one.
    expect(parseFloat(stem('c').style.top)).toBeLessThan(parseFloat(stem('b').style.top));
    expect(parseFloat(stem('c').style.height)).toBeGreaterThan(parseFloat(stem('b').style.height));
  });

  it('follows the roll zoom and scroll, and leaves a gutter as wide as the keyboard', () => {
    const { rerender } = lane();
    const content = stem('a').parentElement as HTMLElement;
    expect(content.style.transform).toBe('translateX(0px)');
    rerender(<VelocityLane notes={notes} pixelsPerQuarter={96} scrollLeft={150} duration={8} />);
    expect(stem('b').style.left).toBe('192px');
    expect((stem('a').parentElement as HTMLElement).style.transform).toBe('translateX(-150px)');
    expect(
      (screen.getByRole('button', { name: 'Hide velocity lane' }).parentElement as HTMLElement)
        .style.width
    ).toBe(`${PIANO_ROLL_KEYBOARD_WIDTH}px`);
  });

  it('dragging a pin sets that note once, on release', () => {
    const { onVelocityChange } = lane();
    fireEvent.pointerDown(pin('b'), { clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(pin('b'), { clientY: 16, pointerId: 1 });
    expect(onVelocityChange).not.toHaveBeenCalled();
    expect(pin('b').dataset.velocity).toBe('0.750');
    expect(screen.getByTestId('velocity-lane-readout')).toHaveTextContent('75%');
    fireEvent.pointerUp(pin('b'), { clientY: 16, pointerId: 1 });
    expect(onVelocityChange).toHaveBeenCalledTimes(1);
    expect(onVelocityChange).toHaveBeenCalledWith(['b'], 0.5);
    expect(screen.queryByTestId('velocity-lane-readout')).toBeNull();
  });

  it('a selected pin drags the whole selection by one offset, each clamped, reversible', () => {
    const { onVelocityChange } = lane({ selectedIds: ['a', 'b'] });
    fireEvent.pointerDown(pin('a'), { clientY: 40, pointerId: 1 });
    // Down by 34 px is -0.5: both notes bottom out at 0.
    fireEvent.pointerMove(pin('a'), { clientY: 74, pointerId: 1 });
    expect(pin('a').dataset.velocity).toBe('0.000');
    expect(pin('b').dataset.velocity).toBe('0.000');
    // Back up: the spread returns because each is its original plus the offset.
    fireEvent.pointerMove(pin('a'), { clientY: 57, pointerId: 1 });
    expect(pin('a').dataset.velocity).toBe('0.250');
    expect(pin('b').dataset.velocity).toBe('0.000');
    fireEvent.pointerMove(pin('a'), { clientY: 40, pointerId: 1 });
    expect(pin('b').dataset.velocity).toBe('0.250');
    fireEvent.pointerMove(pin('a'), { clientY: 23, pointerId: 1 });
    fireEvent.pointerUp(pin('a'), { clientY: 23, pointerId: 1 });
    expect(onVelocityChange).toHaveBeenCalledWith(['a', 'b'], 0.25);
  });

  it('clamps the offset, not each note: the lower pin pulls the higher note past the lower one', () => {
    const { onVelocityChange } = lane({ selectedIds: ['a', 'b'] });
    // Grab the lower pin (b, 25%) and drag down 0.4 (27.2 px): b hits 0, a keeps falling to 10%.
    fireEvent.pointerDown(pin('b'), { clientY: 40, pointerId: 1 });
    fireEvent.pointerMove(pin('b'), { clientY: 40 + 27.2, pointerId: 1 });
    expect(pin('b').dataset.velocity).toBe('0.000');
    expect(pin('a').dataset.velocity).toBe('0.100');
    // Further down: a still falls (its own offset), and the anchor's readout stays at 0.
    fireEvent.pointerMove(pin('b'), { clientY: 40 + 34, pointerId: 1 });
    expect(pin('a').dataset.velocity).toBe('0.000');
    expect(screen.getByTestId('velocity-lane-readout')).toHaveTextContent('0%');
    // Back up: the spread is restored.
    fireEvent.pointerMove(pin('b'), { clientY: 40, pointerId: 1 });
    expect(pin('a').dataset.velocity).toBe('0.500');
    expect(pin('b').dataset.velocity).toBe('0.250');
    fireEvent.pointerMove(pin('b'), { clientY: 40 + 27.2, pointerId: 1 });
    fireEvent.pointerUp(pin('b'), { clientY: 40 + 27.2, pointerId: 1 });
    const [ids, delta] = onVelocityChange.mock.calls[0];
    expect(ids).toEqual(['a', 'b']);
    expect(delta).toBeCloseTo(-0.4, 5);
  });

  it('drags upward from a 90% pin without leaving the range', () => {
    const high = [{ ...notes[0], velocity: 0.9 }, notes[1]];
    const { onVelocityChange } = lane({ notes: high, selectedIds: ['a', 'b'] });
    // Up by 17 px is +0.25: a stops at 100% while b rises to 50%.
    fireEvent.pointerDown(pin('a'), { clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(pin('a'), { clientY: 33, pointerId: 1 });
    expect(pin('a').dataset.velocity).toBe('1.000');
    expect(pin('b').dataset.velocity).toBe('0.500');
    expect(screen.getByTestId('velocity-lane-readout')).toHaveTextContent('100%');
    fireEvent.pointerUp(pin('a'), { clientY: 33, pointerId: 1 });
    expect(onVelocityChange.mock.calls[0][1]).toBeCloseTo(0.25, 5);
  });

  it('reports nothing for a click or a cancelled drag, and an unselected pin changes only itself', () => {
    const { onVelocityChange } = lane({ selectedIds: ['a'] });
    fireEvent.pointerDown(pin('b'), { clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(pin('b'), { clientY: 40, pointerId: 1 });
    fireEvent.pointerDown(pin('b'), { clientY: 40, pointerId: 1 });
    fireEvent.pointerMove(pin('b'), { clientY: 10, pointerId: 1 });
    fireEvent.pointerCancel(pin('b'), { pointerId: 1 });
    expect(onVelocityChange).not.toHaveBeenCalled();
    expect(pin('b').dataset.velocity).toBe('0.250');
    fireEvent.pointerDown(pin('b'), { clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(pin('b'), { clientY: 6, pointerId: 1 });
    expect(onVelocityChange).toHaveBeenCalledWith(['b'], 0.5);
  });

  it('collapses to its header and asks its owner to toggle', () => {
    const { onCollapsedChange, rerender } = lane();
    fireEvent.click(screen.getByRole('button', { name: 'Hide velocity lane' }));
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
    rerender(
      <VelocityLane notes={notes} pixelsPerQuarter={64} scrollLeft={0} duration={8} collapsed />
    );
    expect(screen.queryAllByTestId('velocity-stem')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Show velocity lane' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it("draws the roll's grid lines at the same x, behind the stems, following zoom and the grid unit", () => {
    const gridLines = [
      { at: 0, kind: 'bar' as const, label: '1' },
      { at: 1, kind: 'beat' as const },
      { at: 2, kind: 'beat' as const },
      { at: 4, kind: 'bar' as const, label: '2' },
    ];
    const lines = () =>
      screen.getAllByTestId('velocity-grid-line').map((line) => ({
        left: parseFloat((line as HTMLElement).style.left),
        kind: (line as HTMLElement).dataset.kind,
        sub: (line as HTMLElement).dataset.subdivision !== undefined,
      }));
    const expected = (unit: number | undefined, ppq: number, viewWidth: number) =>
      rollGridLines(gridLines, unit, Math.max(8, viewWidth / ppq), ppq).map((line) => ({
        left: line.at * ppq,
        kind: line.kind,
        sub: line.subdivision,
      }));
    const { rerender } = lane({ gridLines, gridUnit: 0.5, viewWidth: 640 });
    expect(lines()).toEqual(expected(0.5, 64, 640));
    expect(lines().some((line) => line.sub)).toBe(true);
    // The grid setting and the zoom change the lines exactly as they change the roll's.
    rerender(
      <VelocityLane
        notes={notes}
        pixelsPerQuarter={128}
        scrollLeft={0}
        duration={8}
        gridLines={gridLines}
        gridUnit={0.25}
        viewWidth={640}
      />
    );
    expect(lines()).toEqual(expected(0.25, 128, 640));
    // Drawn before (behind) the stems.
    const first = screen.getAllByTestId('velocity-grid-line')[0];
    expect(
      first.compareDocumentPosition(stem('a')) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('fills stem and pin by velocity exactly as the roll fills the note, also while dragging', () => {
    const set = [0, 0.5, 1].map((velocity, index) => ({
      id: `v${index}`,
      start: index,
      duration: 1,
      pitchMidicents: 6000,
      label: 'C4',
      velocity,
      color: 'var(--mark-red)',
    }));
    lane({ notes: set, velocityFill: true });
    set.forEach((note) => {
      const element = stem(note.id);
      expect(element.style.getPropertyValue('--stem-fill')).toBe(
        velocityFillColor(note.color, note.velocity)
      );
      expect(element.style.getPropertyValue('--stem-opacity')).toBe('');
    });
    // Softer is dimmer: the 0% stem differs from the 100% one.
    expect(stem('v0').style.getPropertyValue('--stem-fill')).not.toBe(
      stem('v2').style.getPropertyValue('--stem-fill')
    );
    // While dragging the 100% pin down to 50%, it already wears the 50% look.
    fireEvent.pointerDown(pin('v2'), { clientY: 8, pointerId: 1 });
    fireEvent.pointerMove(pin('v2'), { clientY: 8 + 34, pointerId: 1 });
    expect(stem('v2').style.getPropertyValue('--stem-fill')).toBe(
      velocityFillColor(set[2].color, 0.5)
    );
    fireEvent.pointerCancel(pin('v2'), { pointerId: 1 });
  });
});

describe('VelocityLane height limits', () => {
  const laneHeight = () =>
    (screen.getByRole('group', { name: 'Velocity lane' }) as HTMLElement).style.height;
  const splitter = () => screen.getByRole('separator', { name: 'Resize velocity lane' });

  it('clamps a stored height to the share of the panel when drawn, and shows the effective limit', () => {
    const onHeightChange = vi.fn();
    lane({ height: 300, onHeightChange, availableHeight: 400 });
    // Half of a 400 px panel is 200.
    expect(laneHeight()).toBe('200px');
    expect(splitter()).toHaveAttribute('aria-valuemax', '200');
    expect(splitter()).toHaveAttribute('aria-valuenow', '200');
  });

  it('a drag starts from the clamped height, so it never jumps and never exceeds the limit', () => {
    const onHeightChange = vi.fn();
    lane({ height: 300, onHeightChange, availableHeight: 400 });
    fireEvent.pointerDown(splitter(), { clientY: 300, pointerId: 1 });
    // Dragging up from a lane already at its limit stays at the limit.
    fireEvent.pointerMove(splitter(), { clientY: 250, pointerId: 1 });
    expect(laneHeight()).toBe('200px');
    fireEvent.pointerUp(splitter(), { clientY: 250, pointerId: 1 });
    expect(onHeightChange).not.toHaveBeenCalled();
    // Dragging down shrinks from 200 (not from the stored 300).
    fireEvent.pointerDown(splitter(), { clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(splitter(), { clientY: 320, pointerId: 1 });
    expect(onHeightChange).toHaveBeenCalledWith(180);
  });

  it('arrow keys step from the effective height', () => {
    const onHeightChange = vi.fn();
    lane({ height: 300, onHeightChange, availableHeight: 400 });
    fireEvent.keyDown(splitter(), { key: 'ArrowDown' });
    expect(onHeightChange).toHaveBeenCalledWith(192);
  });

  it('a small panel never squeezes the lane below its minimum', () => {
    lane({ height: 84, onHeightChange: vi.fn(), availableHeight: 40 });
    expect(laneHeight()).toBe('32px');
    expect(splitter()).toHaveAttribute('aria-valuemax', '32');
  });

  it('Escape during a drag restores the height and is not seen by anything above the window', () => {
    const above = vi.fn();
    document.addEventListener('keydown', above);
    lane({ onHeightChange: vi.fn() });
    fireEvent.pointerDown(splitter(), { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(splitter(), { clientY: 250, pointerId: 1 });
    expect(laneHeight()).toBe('134px');
    fireEvent.keyDown(splitter(), { key: 'Escape' });
    expect(laneHeight()).toBe('84px');
    expect(above).not.toHaveBeenCalled();
    // With no drag running Escape passes through untouched.
    fireEvent.keyDown(splitter(), { key: 'Escape' });
    expect(above).toHaveBeenCalledTimes(1);
    document.removeEventListener('keydown', above);
  });
});
