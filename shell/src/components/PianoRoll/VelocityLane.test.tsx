import { cleanup, fireEvent, render, screen } from '@test-utils';
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

  it('draws the selected time span as a band at the same x as the roll, only when a range is passed', () => {
    const { unmount } = lane();
    expect(screen.queryByTestId('velocity-range')).toBeNull();
    unmount();
    lane({ selectedRange: { start: 1, end: 2.5 } });
    const band = screen.getByTestId('velocity-range');
    expect(band.style.left).toBe('64px');
    expect(band.style.width).toBe('96px');
    // Colour comes from the selection tint roles, never a hex value.
    expect(band.style.background).toBe('');
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

// Velocity at y: 8 px padding, 68 px range, so 100% is y 8, 50% is y 42, 0% is y 76.
describe('VelocityLane tools', () => {
  const track = () => screen.getByRole('group', { name: 'Velocity lane' });
  const press = (x: number, y: number, extra: object = {}) =>
    fireEvent.pointerDown(track(), { clientX: x, clientY: y, pointerId: 1, ...extra });
  const move = (x: number, y: number, extra: object = {}) =>
    fireEvent.pointerMove(track(), { clientX: x, clientY: y, pointerId: 1, ...extra });
  const release = (x: number, y: number, extra: object = {}) =>
    fireEvent.pointerUp(track(), { clientX: x, clientY: y, pointerId: 1, ...extra });
  const sweep = (from: [number, number], to: [number, number], extra: object = {}) => {
    press(from[0], from[1], extra);
    move(to[0], to[1], extra);
    release(to[0], to[1], extra);
  };

  function tools(tool: string, props: Partial<React.ComponentProps<typeof VelocityLane>> = {}) {
    const calls = {
      onSelectionChange: vi.fn(),
      onMarqueeRange: vi.fn(),
      onMoveTimeRange: vi.fn(),
      onSetVelocities: vi.fn(),
      onRamp: vi.fn(),
    };
    const view = lane({ tool, gridUnit: 0.5, ...calls, ...props });
    return { ...calls, ...view };
  }

  describe('Pointer: box select', () => {
    it('selects the pins the rectangle touches (a chord is one id), draws a marquee and shows them selected live', () => {
      const { onSelectionChange } = tools('pointer');
      press(100, 30);
      move(140, 70);
      expect(screen.getByTestId('velocity-marquee')).toBeInTheDocument();
      expect(pin('b')).toHaveAttribute('data-selected');
      release(140, 70);
      expect(onSelectionChange).toHaveBeenCalledWith(['b']);
      expect(screen.queryByTestId('velocity-marquee')).toBeNull();
      sweep([240, 0], [300, 20]);
      expect(onSelectionChange).toHaveBeenLastCalledWith(['chord']);
    });

    it('shift/ctrl adds to the selection; a rectangle over no pin selects nothing and is not a time selection', () => {
      const { onSelectionChange, onMarqueeRange } = tools('pointer', { selectedIds: ['a'] });
      sweep([100, 30], [140, 70], { shiftKey: true });
      expect(onSelectionChange).toHaveBeenLastCalledWith(['a', 'b']);
      sweep([60, 10], [90, 20]);
      expect(onSelectionChange).toHaveBeenLastCalledWith([]);
      expect(onMarqueeRange).not.toHaveBeenCalled();
    });

    it('a press on empty lane space with no drag clears; with a modifier it leaves the selection', () => {
      const { onSelectionChange } = tools('pointer', { selectedIds: ['a'] });
      press(60, 30);
      release(61, 30);
      expect(onSelectionChange).toHaveBeenCalledWith([]);
      onSelectionChange.mockClear();
      press(60, 30, { ctrlKey: true });
      release(60, 30, { ctrlKey: true });
      expect(onSelectionChange).not.toHaveBeenCalled();
    });

    it('Escape cancels a marquee: nothing is reported', () => {
      const { onSelectionChange } = tools('pointer');
      press(100, 30);
      move(140, 70);
      fireEvent.keyDown(track(), { key: 'Escape' });
      expect(screen.queryByTestId('velocity-marquee')).toBeNull();
      release(140, 70);
      expect(onSelectionChange).not.toHaveBeenCalled();
    });

    it('dragging a pin still edits the velocity (group rule), not a marquee', () => {
      const { onVelocityChange, onSelectionChange } = tools('pointer', { selectedIds: ['a', 'b'] });
      fireEvent.pointerDown(pin('b'), { clientX: 128, clientY: 59, pointerId: 1 });
      fireEvent.pointerMove(pin('b'), { clientX: 128, clientY: 59 - 34, pointerId: 1 });
      fireEvent.pointerUp(pin('b'), { clientX: 128, clientY: 59 - 34, pointerId: 1 });
      expect(onVelocityChange).toHaveBeenCalledWith(['a', 'b'], 0.5);
      expect(onSelectionChange).not.toHaveBeenCalled();
    });

    it('adds the window origin in a windowed lane, as the roll does', () => {
      const onSelectionChange = vi.fn();
      const far = [
        {
          id: 'far',
          start: 2_000_064 / 64,
          duration: 1,
          pitchMidicents: 6000,
          label: 'C4',
          velocity: 1,
        },
      ];
      render(
        <VelocityLane
          notes={far}
          pixelsPerQuarter={64}
          scrollLeft={2_000_100}
          duration={70_000}
          viewWidth={800}
          tool="pointer"
          onSelectionChange={onSelectionChange}
        />
      );
      // Content coordinates 40 to 80 are timeline 2_000_040 to 2_000_080: the pin at 2_000_064.
      sweep([40, 0], [80, 40]);
      expect(onSelectionChange).toHaveBeenCalledWith(['far']);
    });
  });

  describe('Time: select and move a span', () => {
    it('selects a span like the roll (snapped outward) and every note overlapping it', () => {
      const { onSelectionChange, onMarqueeRange } = tools('time');
      sweep([120, 30], [300, 30]);
      expect(onMarqueeRange).toHaveBeenCalledWith({ start: 1.5, end: 5 }, true);
      expect(onSelectionChange).toHaveBeenCalledWith(['b', 'chord']);
    });

    it('draws the span while dragging; shift is additive', () => {
      const { onMarqueeRange } = tools('time');
      press(120, 30);
      move(300, 30);
      expect(screen.getByTestId('velocity-range-preview').style.left).toBe('96px');
      release(300, 30);
      sweep([120, 30], [300, 30], { shiftKey: true });
      expect(onMarqueeRange).toHaveBeenLastCalledWith({ start: 1.5, end: 5 }, true, true);
    });

    it('a click without a drag clears', () => {
      const { onSelectionChange, onMarqueeRange } = tools('time');
      press(10, 30);
      release(10, 30);
      expect(onSelectionChange).toHaveBeenCalledWith([]);
      expect(onMarqueeRange).not.toHaveBeenCalled();
    });

    it('pressing inside the band and dragging moves it: one report, snapped, held at 0, with a preview', () => {
      const { onMoveTimeRange, onSelectionChange } = tools('time', {
        selectedRange: { start: 1.5, end: 5 },
      });
      press(200, 30);
      move(200 + 128, 30);
      expect(screen.getByTestId('velocity-range-preview').style.left).toBe(`${3.5 * 64}px`);
      expect(screen.queryByTestId('velocity-range')).toBeNull();
      release(200 + 128, 30);
      expect(onMoveTimeRange).toHaveBeenCalledTimes(1);
      expect(onMoveTimeRange).toHaveBeenCalledWith({ start: 1.5, end: 5 }, 2);
      expect(onSelectionChange).not.toHaveBeenCalled();
      sweep([200, 30], [200 - 1000, 30]);
      expect(onMoveTimeRange).toHaveBeenLastCalledWith({ start: 1.5, end: 5 }, -1.5);
    });

    it('Alt merges and Ctrl copies (read at release); Escape cancels; a click in the band clears', () => {
      const { onMoveTimeRange, onSelectionChange } = tools('time', {
        selectedRange: { start: 1.5, end: 5 },
      });
      sweep([200, 30], [264, 30], { altKey: true });
      expect(onMoveTimeRange).toHaveBeenLastCalledWith({ start: 1.5, end: 5 }, 1, {
        copy: false,
        merge: true,
      });
      sweep([200, 30], [264, 30], { ctrlKey: true });
      expect(onMoveTimeRange).toHaveBeenLastCalledWith({ start: 1.5, end: 5 }, 1, {
        copy: true,
        merge: false,
      });
      onMoveTimeRange.mockClear();
      press(200, 30);
      move(264, 30);
      fireEvent.keyDown(track(), { key: 'Escape' });
      release(264, 30);
      expect(onMoveTimeRange).not.toHaveBeenCalled();
      press(200, 30);
      release(200, 30);
      expect(onSelectionChange).toHaveBeenCalledWith([]);
      expect(onMoveTimeRange).not.toHaveBeenCalled();
    });
  });

  describe('Pencil: freehand velocity', () => {
    it('every head crossed gets the y at its x, a fast jump skips none, one report on release', () => {
      const { onSetVelocities } = tools('pencil');
      press(0, 8);
      move(256, 76);
      expect(screen.getByTestId('velocity-gesture-readout')).toHaveTextContent('0%');
      // Previewed on the stems before anything is reported.
      expect(onSetVelocities).not.toHaveBeenCalled();
      expect(pin('b')).toHaveAttribute('data-velocity', '0.500');
      release(256, 76);
      expect(onSetVelocities).toHaveBeenCalledTimes(1);
      const values = onSetVelocities.mock.calls[0][0] as Record<string, number>;
      expect(Object.keys(values).sort()).toEqual(['a', 'b', 'chord']);
      expect(values.a).toBe(1);
      expect(values.b).toBeCloseTo(0.5, 6);
      expect(values.chord).toBe(0);
    });

    it('works right to left and clamps y to the lane', () => {
      const { onSetVelocities } = tools('pencil');
      sweep([300, -200], [0, 500]);
      const values = onSetVelocities.mock.calls[0][0] as Record<string, number>;
      expect(values.chord).toBe(1);
      expect(values.a).toBe(0);
    });

    it('a press that crosses no head, or Escape, reports nothing', () => {
      const { onSetVelocities } = tools('pencil');
      sweep([60, 30], [90, 30]);
      press(0, 30);
      move(200, 30);
      fireEvent.keyDown(track(), { key: 'Escape' });
      expect(pin('b')).toHaveAttribute('data-velocity', '0.250');
      release(200, 30);
      expect(onSetVelocities).not.toHaveBeenCalled();
    });

    it('a press on a pin draws (does not drag the pin)', () => {
      const { onSetVelocities, onVelocityChange } = tools('pencil');
      fireEvent.pointerDown(pin('b'), { clientX: 128, clientY: 8, pointerId: 1 });
      fireEvent.pointerUp(track(), { clientX: 128, clientY: 8, pointerId: 1 });
      expect(onVelocityChange).not.toHaveBeenCalled();
      expect(onSetVelocities).toHaveBeenCalledWith({ b: 1 });
    });
  });

  describe('Paint can: velocity ramp', () => {
    const kept = {
      heads: [
        { id: 'a', x: 0 },
        { id: 'b', x: 2 },
        { id: 'chord', x: 4 },
      ],
      start: 1,
      end: 0,
      curve: 0,
    };

    it('press sets the start %, release the end %: end heads exact, the rest linear by time, dashed line shown live', () => {
      const { onRamp } = tools('paint');
      press(0, 8);
      move(256, 76);
      expect(screen.getByTestId('velocity-ramp')).toHaveAttribute('data-ids', 'a,b,chord');
      expect(screen.getByTestId('velocity-ramp-line')).toBeInTheDocument();
      expect(screen.getAllByTestId('velocity-gesture-readout').map((el) => el.textContent)).toEqual(
        ['100%', '0%']
      );
      release(256, 76);
      expect(onRamp).toHaveBeenCalledTimes(1);
      const [ramp, values] = onRamp.mock.calls[0] as [typeof kept, Record<string, number>];
      expect(values.a).toBe(1);
      expect(values.b).toBeCloseTo(0.5, 6);
      expect(values.chord).toBe(0);
      // Stored in quarter notes, press side first, with no curve.
      expect(ramp).toMatchObject({ start: 1, end: 0, curve: 0 });
      expect(ramp.heads).toEqual(kept.heads);
    });

    it('dragging right to left starts at the press side', () => {
      const { onRamp } = tools('paint');
      sweep([256, 8], [0, 76]);
      const values = onRamp.mock.calls[0][1] as Record<string, number>;
      expect(values.chord).toBe(1);
      expect(values.a).toBe(0);
    });

    it('Escape cancels; a press that covers no head reports nothing', () => {
      const { onRamp } = tools('paint');
      press(0, 8);
      move(256, 76);
      fireEvent.keyDown(track(), { key: 'Escape' });
      expect(screen.queryByTestId('velocity-ramp')).toBeNull();
      release(256, 76);
      sweep([60, 8], [90, 76]);
      expect(onRamp).not.toHaveBeenCalled();
    });

    it('a kept ramp stays drawn as a dashed line over its heads, only with the Paint tool', () => {
      tools('paint', { ramp: kept });
      expect(screen.getByTestId('velocity-ramp')).toHaveAttribute('data-ids', 'a,b,chord');
      cleanup();
      tools('pointer', { ramp: kept });
      expect(screen.queryByTestId('velocity-ramp')).toBeNull();
    });

    it('Alt + right-button drag curves it live and reports once on release, from the originals', () => {
      const { onRamp } = tools('paint', { ramp: kept });
      const flags = { button: 2, altKey: true, pointerId: 2 };
      press(100, 40, flags);
      move(100, 16, flags);
      expect(screen.getByText('Curve 1.0')).toBeInTheDocument();
      // Live: the middle head follows the curve (up 24 px is curve 1: t^0.5 of the way down).
      expect(pin('b').getAttribute('data-velocity')).toBe((1 - Math.sqrt(0.5)).toFixed(3));
      expect(onRamp).not.toHaveBeenCalled();
      release(100, 16, flags);
      expect(onRamp).toHaveBeenCalledTimes(1);
      const [curved, values] = onRamp.mock.calls[0] as [typeof kept, Record<string, number>];
      expect(curved).toMatchObject({ curve: 1, start: 1, end: 0 });
      expect(values.a).toBe(1);
      expect(values.chord).toBe(0);
      expect(values.b).toBeCloseTo(1 - Math.sqrt(0.5), 6);
    });

    it('a second curve starts from the ramp curve but is applied from the original endpoints', () => {
      const { onRamp } = tools('paint', { ramp: { ...kept, curve: 1 } });
      const flags = { button: 2, altKey: true, pointerId: 2 };
      sweep([100, 40], [100, 64], flags);
      // Down 24 px: curve 1 - 1 = 0, the straight ramp again, whatever is on the stems now.
      const values = onRamp.mock.calls[0][1] as Record<string, number>;
      expect(values.b).toBeCloseTo(0.5, 6);
    });

    describe('the right-button curve gesture and the browser menu', () => {
      const flags = { button: 2, altKey: true, pointerId: 2 };
      const plain = { button: 2, pointerId: 2 };

      it('swallows the context menu of the gesture wherever it lands (window, other targets), once after release', () => {
        const { onRamp } = tools('paint', { ramp: kept });
        press(100, 40, flags);
        // During the gesture any contextmenu, on any target, is cancelled and stays guarded.
        expect(fireEvent.contextMenu(window)).toBe(false);
        expect(fireEvent.contextMenu(document.body)).toBe(false);
        move(100, 16, flags);
        // The drag left the lane: the release and its menu land on something else.
        fireEvent.pointerUp(document.body, {
          button: 2,
          clientX: 100,
          clientY: -200,
          pointerId: 2,
        });
        expect(onRamp).toHaveBeenCalledTimes(1);
        expect(fireEvent.contextMenu(document.body)).toBe(false);
        // Swallowed once: later right-clicks elsewhere get the browser's menu again.
        expect(fireEvent.contextMenu(document.body)).toBe(true);
      });

      it('keeps the menu away for a gesture that never moved, and ends the guard on its own', () => {
        vi.useFakeTimers();
        try {
          const { onRamp } = tools('paint', { ramp: kept });
          press(100, 40, flags);
          release(100, 40, flags);
          expect(onRamp).not.toHaveBeenCalled();
          vi.advanceTimersByTime(1500);
          expect(fireEvent.contextMenu(document.body)).toBe(true);
        } finally {
          vi.useRealTimers();
        }
      });

      describe('a cancelled curve gesture does not leave its guards behind', () => {
        const cancels: [string, (view: ReturnType<typeof tools>) => void][] = [
          ['Escape', () => fireEvent.keyDown(window, { key: 'Escape' })],
          ['the window losing focus', () => fireEvent(window, new Event('blur'))],
          [
            'the ramp being disarmed',
            (view) =>
              view.rerender(
                <VelocityLane
                  notes={notes}
                  pixelsPerQuarter={64}
                  scrollLeft={0}
                  duration={8}
                  tool="pointer"
                  gridUnit={0.5}
                />
              ),
          ],
        ];
        it.each(cancels)(
          '%s: the menu and Alt guards expire after their delay',
          (_name, cancel) => {
            vi.useFakeTimers();
            try {
              const { onRamp, ...view } = tools('paint', { ramp: kept });
              press(100, 40, flags);
              move(100, 16, flags);
              cancel({ onRamp, ...view } as ReturnType<typeof tools>);
              expect(onRamp).not.toHaveBeenCalled();
              // Without the expiry the guards would stay armed until the next gesture or unmount.
              vi.advanceTimersByTime(1500);
              expect(fireEvent.contextMenu(document.body)).toBe(true);
              vi.advanceTimersByTime(15000);
              expect(fireEvent.keyUp(window, { key: 'Alt' })).toBe(true);
            } finally {
              vi.useRealTimers();
            }
          }
        );
      });

      it('a plain right-button drag (no Alt) curves the active ramp as a fallback', () => {
        const { onRamp } = tools('paint', { ramp: kept });
        press(100, 40, plain);
        move(100, 16, plain);
        expect(screen.getByText('Curve 1.0')).toBeInTheDocument();
        release(100, 16, plain);
        expect(onRamp).toHaveBeenCalledTimes(1);
        expect(onRamp.mock.calls[0][0]).toMatchObject({ curve: 1, start: 1, end: 0 });
        expect(fireEvent.contextMenu(track())).toBe(false);
      });

      it('handles the press, the drag and the release on the window, whatever element they land on', () => {
        const { onRamp } = tools('paint', { ramp: kept });
        press(100, 40, flags);
        fireEvent.pointerMove(document.body, {
          clientX: 100,
          clientY: 16,
          pointerId: 2,
          altKey: true,
        });
        expect(screen.getByText('Curve 1.0')).toBeInTheDocument();
        fireEvent.pointerUp(window, { button: 2, clientX: 100, clientY: 16, pointerId: 2 });
        expect(onRamp).toHaveBeenCalledTimes(1);
      });

      it('cancels the Alt key of the gesture so the browser menu bar is not activated', () => {
        tools('paint', { ramp: kept });
        press(100, 40, flags);
        expect(fireEvent.keyDown(window, { key: 'Alt', altKey: true })).toBe(false);
        release(100, 40, flags);
        expect(fireEvent.keyUp(window, { key: 'Alt' })).toBe(false);
        // The guard ended with that keyup; other keys were never touched.
        expect(fireEvent.keyUp(window, { key: 'Alt' })).toBe(true);
        expect(fireEvent.keyUp(window, { key: 'a' })).toBe(true);
      });

      it('leaves right presses alone when no ramp is active, and outside the lane', () => {
        tools('paint');
        press(100, 40, flags);
        expect(fireEvent.contextMenu(track())).toBe(true);
        cleanup();
        const { onRamp } = tools('paint', { ramp: kept });
        fireEvent.pointerDown(document.body, {
          button: 2,
          clientX: 100,
          clientY: 40,
          pointerId: 2,
        });
        fireEvent.pointerUp(document.body, { button: 2, clientX: 100, clientY: 16, pointerId: 2 });
        expect(fireEvent.contextMenu(document.body)).toBe(true);
        expect(onRamp).not.toHaveBeenCalled();
      });

      it('removes its window listeners with the lane (no leaks)', () => {
        const add = vi.spyOn(window, 'addEventListener');
        const remove = vi.spyOn(window, 'removeEventListener');
        tools('paint', { ramp: kept });
        press(100, 40, flags);
        release(100, 40, flags);
        cleanup();
        const added = add.mock.calls.filter(([type]) =>
          ['pointerdown', 'pointermove', 'pointerup', 'contextmenu', 'keydown', 'keyup'].includes(
            String(type)
          )
        );
        const removed = remove.mock.calls.map(([type]) => String(type));
        added.forEach(([type]) => expect(removed).toContain(String(type)));
        expect(fireEvent.contextMenu(document.body)).toBe(true);
        add.mockRestore();
        remove.mockRestore();
      });
    });
  });

  describe('Eraser and Knife do nothing in the lane', () => {
    it.each(['eraser', 'knife'])(
      '%s: sweeps report nothing, a pin still drags as before',
      (name) => {
        const calls = tools(name, { selectedRange: { start: 1.5, end: 5 } });
        sweep([0, 8], [256, 76]);
        sweep([200, 30], [300, 30]);
        expect(calls.onSelectionChange).not.toHaveBeenCalled();
        expect(calls.onSetVelocities).not.toHaveBeenCalled();
        expect(calls.onRamp).not.toHaveBeenCalled();
        expect(calls.onMoveTimeRange).not.toHaveBeenCalled();
        expect(calls.onMarqueeRange).not.toHaveBeenCalled();
        fireEvent.pointerDown(pin('b'), { clientX: 128, clientY: 59, pointerId: 1 });
        fireEvent.pointerMove(pin('b'), { clientX: 128, clientY: 25, pointerId: 1 });
        fireEvent.pointerUp(pin('b'), { clientX: 128, clientY: 25, pointerId: 1 });
        expect(calls.onVelocityChange).toHaveBeenCalledWith(['b'], 0.5);
      }
    );
  });
});

describe('VelocityLane tool cursors (opt-in)', () => {
  const track = () => screen.getByRole('group', { name: 'Velocity lane' });
  const kept = {
    heads: [
      { id: 'a', x: 0 },
      { id: 'b', x: 2 },
      { id: 'chord', x: 4 },
    ],
    start: 1,
    end: 0,
    curve: 0,
  };

  it('adds nothing without the opt-in, and the cursor art with it', () => {
    lane({ tool: 'pencil' });
    expect(track()).not.toHaveAttribute('data-cursors');
    expect(track().style.getPropertyValue('--cursor-pencil')).toBe('');
    cleanup();
    lane({ tool: 'pencil', toolCursors: true });
    expect(track()).toHaveAttribute('data-cursors');
    expect(track()).toHaveAttribute('data-tool', 'pencil');
    expect(track().style.getPropertyValue('--cursor-pencil')).toContain('data:image/svg+xml');
    expect(track().style.height).toBe('84px');
  });

  it('a ramp-curve drag names itself for the vertical-resize cursor', () => {
    lane({ tool: 'paint', toolCursors: true, ramp: kept, onRamp: vi.fn() });
    fireEvent.pointerDown(track(), { button: 2, clientX: 100, clientY: 40, pointerId: 2 });
    expect(track()).toHaveAttribute('data-gesture', 'curve');
    fireEvent.pointerUp(track(), { button: 2, clientX: 100, clientY: 40, pointerId: 2 });
    expect(track()).not.toHaveAttribute('data-gesture');
  });

  it('a time-band drag is grabbing, copy while Ctrl/Cmd is held, live on the key itself', () => {
    lane({
      tool: 'time',
      toolCursors: true,
      gridUnit: 0.5,
      selectedRange: { start: 1.5, end: 5 },
      onMoveTimeRange: vi.fn(),
      onSelectionChange: vi.fn(),
    });
    fireEvent.pointerDown(track(), { clientX: 200, clientY: 30, pointerId: 1 });
    fireEvent.pointerMove(track(), { clientX: 264, clientY: 30, pointerId: 1 });
    expect(track()).toHaveAttribute('data-gesture', 'timeMove');
    expect(track()).not.toHaveAttribute('data-copying');
    fireEvent.keyDown(window, { key: 'Control', ctrlKey: true });
    expect(track()).toHaveAttribute('data-copying');
    fireEvent.keyUp(window, { key: 'Control' });
    expect(track()).not.toHaveAttribute('data-copying');
    fireEvent.pointerUp(track(), { clientX: 264, clientY: 30, pointerId: 1 });
  });
});
