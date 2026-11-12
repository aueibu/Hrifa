import { useState } from 'react';
import { act, fireEvent, render, screen } from '@test-utils';
import { HorizontalScrollbar } from './HorizontalScrollbar';
import { defaultPianoRollView, type PianoRollViewState } from './model';
import { PianoRoll, type PianoRollProps } from './PianoRoll';
import { velocityFillColor } from './velocityFill';

// The unified panel (detachedScroll): scroll position, wheel, keys and previews. jsdom lays nothing
// out, so a fake ResizeObserver gives the roll a 500 px wide, 300 px tall view in a 400 px panel.
type Callback = (entries: unknown[]) => void;
const observers: Array<{ callback: Callback; targets: Element[] }> = [];

class FakeResizeObserver {
  private readonly record: { callback: Callback; targets: Element[] };
  constructor(callback: Callback) {
    this.record = { callback, targets: [] };
    observers.push(this.record);
  }
  observe(target: Element) {
    this.record.targets.push(target);
  }
  unobserve() {}
  disconnect() {
    observers.splice(observers.indexOf(this.record), 1);
  }
}

const VIEW_WIDTH = 500;
// 20 quarters at 64 px is 1280 px, so the timeline scrolls 780 px.
const RANGE = 780;
const rowY = (midi: number) => (127 - midi) * 22 + 11;

function measure() {
  const scroller = document.querySelector('[data-detached]') as HTMLElement;
  act(() => {
    observers.forEach(({ callback, targets }) =>
      callback(
        targets.map((target) => ({
          target,
          contentRect:
            target === scroller
              ? { width: VIEW_WIDTH, height: 300 }
              : { width: VIEW_WIDTH + 72, height: 400 },
        }))
      )
    );
  });
}

const notes = [
  { id: 'a', start: 1, duration: 1, pitchMidicents: 6000, label: 'C4', velocity: 0.5 },
  { id: 'b', start: 4, duration: 1, pitchMidicents: 6400, label: 'E4', velocity: 1 },
];

// A recognisable color per pitch class, so a preview's color can be compared with a note's.
const colorOf = (pitchMidicents: number) => `var(--mark-${Math.round(pitchMidicents / 100) % 12})`;

function Panel(props: Partial<PianoRollProps> & { start?: Partial<PianoRollViewState> }) {
  const { start, ...rest } = props;
  const [view, setView] = useState<PianoRollViewState>({
    ...defaultPianoRollView,
    framed: true,
    ...start,
  });
  return (
    <>
      <PianoRoll
        notes={notes}
        duration={20}
        gridLines={[]}
        view={view}
        onViewChange={setView}
        selectedIds={[]}
        onSelectionChange={() => undefined}
        tools={[
          { id: 'pointer', label: 'Pointer', shortcut: '1' },
          { id: 'paint', label: 'Paint', shortcut: '4' },
        ]}
        activeTool="pointer"
        fill
        wheelZoom
        detachedScroll
        showToolbar={false}
        lane={() => <div data-testid="lane-track" />}
        {...rest}
      />
      <output data-testid="view">{JSON.stringify(view)}</output>
    </>
  );
}

const readView = () => JSON.parse(screen.getByTestId('view').textContent!) as PianoRollViewState;

function open(props: Parameters<typeof Panel>[0] = {}) {
  const view = render(<Panel {...props} />);
  measure();
  return view;
}

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('unified panel: one horizontal scroll', () => {
  it('the bar scrolls exactly the roll range, whatever its own width', () => {
    open();
    const spacer = screen.getByTestId('roll-hscroll').firstElementChild as HTMLElement;
    expect(spacer.style.width).toBe(`calc(100% + ${RANGE}px)`);
  });

  it('Shift/Alt+wheel and a trackpad swipe reach both ends and stay there (no snap-back)', () => {
    open();
    const roll = screen.getByRole('group', { name: /Piano roll/ });
    expect(fireEvent.wheel(roll, { deltaY: 5000, shiftKey: true })).toBe(false);
    expect(readView().scrollLeft).toBe(RANGE);
    // Pushing past the end changes nothing: no clamped echo, no bounce.
    fireEvent.wheel(roll, { deltaY: 300, altKey: true });
    fireEvent.wheel(roll, { deltaX: 300 });
    expect(readView().scrollLeft).toBe(RANGE);
    // A swipe back, past the start.
    fireEvent.wheel(roll, { deltaX: -5000 });
    expect(readView().scrollLeft).toBe(0);
    fireEvent.wheel(roll, { deltaY: -50, shiftKey: true });
    expect(readView().scrollLeft).toBe(0);
    expect(readView().framed).toBe(true);
  });

  it('trackpad deltaX scrolls the roll sideways, and the vertical part of a diagonal swipe scrolls pitch', () => {
    open();
    const roll = screen.getByRole('group', { name: /Piano roll/ });
    const scroller = document.querySelector('[data-detached]') as HTMLElement;
    Object.defineProperty(scroller, 'scrollTop', { value: 0, writable: true });
    expect(fireEvent.wheel(roll, { deltaX: 120, deltaY: 30 })).toBe(false);
    expect(readView().scrollLeft).toBe(120);
    expect(scroller.scrollTop).toBe(30);
    // A plain vertical wheel over the roll is left to the browser.
    expect(fireEvent.wheel(roll, { deltaY: 60 })).toBe(true);
    expect(readView().scrollLeft).toBe(120);
  });

  it('wheel events that arrive faster than renders still add up', () => {
    open();
    const roll = screen.getByRole('group', { name: /Piano roll/ });
    act(() => {
      fireEvent.wheel(roll, { deltaX: 100 });
      fireEvent.wheel(roll, { deltaX: 100 });
      fireEvent.wheel(roll, { deltaX: 100 });
    });
    expect(readView().scrollLeft).toBe(300);
  });

  it('a scroll event before the re-render does not revert the sideways part of a diagonal swipe', () => {
    open();
    const roll = screen.getByRole('group', { name: /Piano roll/ });
    const scroller = document.querySelector('[data-detached]') as HTMLElement;
    Object.defineProperty(scroller, 'scrollTop', { value: 0, writable: true });
    // Inside one act nothing renders between the wheel and the scroll event it causes, so the
    // render's own view would still say scrollLeft 0 when the scroller reports its new scrollTop.
    act(() => {
      fireEvent.wheel(roll, { deltaX: 120, deltaY: 30 });
      fireEvent.scroll(scroller);
    });
    expect(readView().scrollLeft).toBe(120);
    expect(readView().scrollTop).toBe(30);
  });

  it('two Ctrl+wheel zooms before a render compose, with no jump', () => {
    open({ start: { scrollLeft: 200 } });
    const roll = screen.getByRole('group', { name: /Piano roll/ });
    act(() => {
      fireEvent.wheel(roll, { deltaY: -100, ctrlKey: true, clientX: 100 });
      fireEvent.wheel(roll, { deltaY: -100, ctrlKey: true, clientX: 100 });
    });
    const zoomed = readView();
    expect(zoomed.pixelsPerQuarter).toBeCloseTo(64 * 1.15 * 1.15, 5);
    expect((zoomed.scrollLeft + 100) / zoomed.pixelsPerQuarter).toBeCloseTo((200 + 100) / 64, 5);
  });

  it('Ctrl+wheel zooms time around the pointer and keeps the position inside the range', () => {
    open({ start: { scrollLeft: 200 } });
    const roll = screen.getByRole('group', { name: /Piano roll/ });
    // The pointer is 100 px into the roll: the time under it stays under it.
    const musical = (200 + 100) / 64;
    expect(fireEvent.wheel(roll, { deltaY: -100, ctrlKey: true, clientX: 100 })).toBe(false);
    const zoomed = readView();
    expect(zoomed.pixelsPerQuarter).toBeGreaterThan(64);
    expect((zoomed.scrollLeft + 100) / zoomed.pixelsPerQuarter).toBeCloseTo(musical, 5);
    // Zooming far out can never leave the position past the shorter timeline's end.
    for (let step = 0; step < 20; step += 1) {
      fireEvent.wheel(roll, { deltaY: 100, ctrlKey: true, clientX: 100 });
    }
    const out = readView();
    expect(out.pixelsPerQuarter).toBe(16);
    expect(out.scrollLeft).toBeLessThanOrEqual(Math.max(0, 20 * 16 - VIEW_WIDTH));
    expect(out.scrollLeft).toBeGreaterThanOrEqual(0);
  });

  it('follows the playhead to the very end of the timeline, once', () => {
    const changes: PianoRollViewState[] = [];
    function Follow() {
      const [view, setView] = useState({
        ...defaultPianoRollView,
        framed: true,
        followPlayback: true,
      });
      return (
        <PianoRoll
          notes={notes}
          duration={20}
          gridLines={[]}
          view={view}
          onViewChange={(next) => {
            changes.push(next);
            setView(next);
          }}
          playhead={20}
          isPlaying
          fill
          detachedScroll
          showToolbar={false}
        />
      );
    }
    render(<Follow />);
    measure();
    expect(changes.at(-1)!.scrollLeft).toBe(RANGE);
    const count = changes.length;
    measure();
    expect(changes.length).toBe(count);
  });

  it('the bar reports a user drag, clamped, with framed set; the roll scroller never writes horizontal state back', () => {
    // No notes, so the roll does not fit itself on first measure and `framed` starts false.
    open({ notes: [], start: { framed: false } });
    expect(readView().framed).toBe(false);
    const bar = screen.getByTestId('roll-hscroll');
    Object.defineProperty(bar, 'scrollLeft', { value: 0, writable: true });
    bar.scrollLeft = 5000; // a native bar clamps to its range; the roll clamps again
    fireEvent.scroll(bar);
    expect(readView().scrollLeft).toBe(RANGE);
    expect(readView().framed).toBe(true);
    // The roll's own scroller drifts (the browser scrolled it into view): it is pulled back,
    // and the view is not touched.
    const scroller = document.querySelector('[data-detached]') as HTMLElement;
    Object.defineProperty(scroller, 'scrollLeft', { value: 40, writable: true });
    fireEvent.scroll(scroller);
    expect(scroller.scrollLeft).toBe(RANGE);
    expect(readView().scrollLeft).toBe(RANGE);
  });

  it('the position is pulled back when the timeline shrinks under it', () => {
    open({ start: { scrollLeft: 700 } });
    const scroller = document.querySelector('[data-detached]') as HTMLElement;
    // The view grows to 1100 px: the range falls to 180.
    act(() => {
      observers.forEach(({ callback, targets }) =>
        callback(
          targets.map((target) => ({
            target,
            contentRect:
              target === scroller ? { width: 1100, height: 300 } : { width: 1172, height: 400 },
          }))
        )
      );
    });
    expect(readView().scrollLeft).toBe(180);
  });
});

describe('unified panel: wheel over the keys', () => {
  const keys = () => document.querySelector('[class*="gutterKeys"]') as HTMLElement;

  it('the plain wheel over the keys scrolls pitch, not the page', () => {
    open();
    const scroller = document.querySelector('[data-detached]') as HTMLElement;
    Object.defineProperty(scroller, 'scrollTop', { value: 100, writable: true });
    expect(fireEvent.wheel(keys(), { deltaY: 40 })).toBe(false);
    expect(scroller.scrollTop).toBe(140);
    fireEvent.wheel(keys(), { deltaY: -240 });
    expect(scroller.scrollTop).toBe(0);
  });

  it('Ctrl/Meta+wheel over the keys zooms the roll and never the page', () => {
    open();
    expect(fireEvent.wheel(keys(), { deltaY: -100, ctrlKey: true })).toBe(false);
    expect(readView().pixelsPerQuarter).toBeGreaterThan(64);
    expect(fireEvent.wheel(keys(), { deltaY: -100, metaKey: true })).toBe(false);
    // Also over the lane and the palette: still the roll, never the page.
    expect(fireEvent.wheel(screen.getByTestId('lane-track'), { deltaY: 100, ctrlKey: true })).toBe(
      false
    );
  });

  it('Shift+wheel over the lane scrolls the roll sideways', () => {
    open();
    expect(fireEvent.wheel(screen.getByTestId('lane-track'), { deltaY: 90, shiftKey: true })).toBe(
      false
    );
    expect(readView().scrollLeft).toBe(90);
  });
});

describe('unified panel: one focus scope', () => {
  it('shortcuts work from the lane (V and the tool numbers), but not from a text field or with modifiers', () => {
    const run = vi.fn();
    const onToolChange = vi.fn();
    open({ keyActions: [{ shortcut: 'v', run }], onToolChange });
    const lane = screen.getByTestId('lane-track');
    fireEvent.keyDown(lane, { key: 'v' });
    expect(run).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(lane, { key: '4' });
    expect(onToolChange).toHaveBeenCalledWith('paint');
    fireEvent.keyDown(lane, { key: 'v', ctrlKey: true });
    fireEvent.keyDown(lane, { key: 'v', altKey: true });
    fireEvent.keyDown(lane, { key: 'v', metaKey: true });
    const input = document.createElement('input');
    lane.appendChild(input);
    fireEvent.keyDown(input, { key: 'v' });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('the panel itself is the focus target for a click in the lane', () => {
    open();
    const body = screen.getByTestId('lane-track').closest('[tabindex="-1"]') as HTMLElement;
    expect(body).not.toBeNull();
    body.focus();
    expect(body).toHaveFocus();
  });
});

describe('previews wear the color of the pitch under them', () => {
  const fillOf = (element: Element) =>
    (element as HTMLElement).style.getPropertyValue('--note-fill') ||
    (element as HTMLElement).style.getPropertyValue('--ghost-fill');

  it('paint previews: each step takes the color of its own pitch, at the velocity saturation', () => {
    const onPaintNotes = vi.fn();
    open({ activeTool: 'paint', onPaintNotes, pitchColor: colorOf, velocityFill: true });
    const roll = screen.getByRole('group', { name: /Piano roll/ });
    // Press at C4 and sweep right: two painted cells, both C4.
    fireEvent.pointerDown(roll, { clientX: 130, clientY: rowY(60), pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 250, clientY: rowY(60), pointerId: 1 });
    const painted = [...document.querySelectorAll('[data-velocity-fill]')].filter((element) =>
      (element as HTMLElement).title.startsWith(' ·')
    );
    expect(painted.length).toBeGreaterThanOrEqual(2);
    painted.forEach((element) => {
      expect((element as HTMLElement).style.getPropertyValue('--note-color')).toBe(colorOf(6000));
      expect(fillOf(element)).toContain(colorOf(6000));
    });
    // The pitch changes under the pointer: the next painted step wears the new pitch's color.
    fireEvent.pointerMove(roll, { clientX: 380, clientY: rowY(64), pointerId: 1 });
    const colors = [...document.querySelectorAll('[data-velocity-fill]')]
      .filter((element) => (element as HTMLElement).title.startsWith(' ·'))
      .map((element) => (element as HTMLElement).style.getPropertyValue('--note-color'));
    expect(colors).toContain(colorOf(6400));
    fireEvent.pointerCancel(roll, { pointerId: 1 });
  });

  it('paint previews wear the saturation of the remembered entry velocity', () => {
    open({
      activeTool: 'paint',
      onPaintNotes: vi.fn(),
      pitchColor: colorOf,
      velocityFill: true,
      entryVelocity: 0.38,
    });
    const roll = screen.getByRole('group', { name: /Piano roll/ });
    fireEvent.pointerDown(roll, { clientX: 130, clientY: rowY(60), pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 250, clientY: rowY(60), pointerId: 1 });
    const painted = [...document.querySelectorAll('[data-velocity-fill]')].filter((element) =>
      (element as HTMLElement).title.startsWith(' ·')
    );
    expect(painted.length).toBeGreaterThanOrEqual(2);
    painted.forEach((element) => {
      expect(fillOf(element)).toBe(velocityFillColor(colorOf(6000), 0.38));
    });
    fireEvent.pointerCancel(roll, { pointerId: 1 });
  });

  it('pencil entry preview wears the pitch color and the velocity of the entry', () => {
    open({
      activeTool: 'pencil',
      tools: [{ id: 'pencil', label: 'Pencil', shortcut: '3' }],
      onAddNote: vi.fn(),
      pitchColor: colorOf,
      velocityFill: true,
    });
    const roll = screen.getByRole('group', { name: /Piano roll/ });
    fireEvent.pointerDown(roll, { clientX: 130, clientY: rowY(67), pointerId: 1 });
    const drawing = [...document.querySelectorAll('[data-velocity-fill]')].find((element) =>
      (element as HTMLElement).title.startsWith(' ·')
    ) as HTMLElement;
    expect(drawing.style.getPropertyValue('--note-color')).toBe(colorOf(6700));
    fireEvent.pointerCancel(roll, { pointerId: 1 });
  });

  it('a move ghost is recolored as the pitch under the pointer changes', () => {
    open({
      ghostDrag: true,
      pitchColor: colorOf,
      velocityFill: true,
      onMoveNotes: vi.fn(),
      onResizeNotes: vi.fn(),
    });
    const roll = screen.getByRole('group', { name: /Piano roll/ });
    const note = screen.getByTitle(/^C4 · 1\.000 qn/);
    fireEvent.pointerDown(note, { clientX: 90, clientY: rowY(60), pointerId: 1 });
    fireEvent.pointerMove(roll, { clientX: 90, clientY: rowY(60) - 44, pointerId: 1 });
    const ghost = () => document.querySelector('[data-ghost="a"]') as HTMLElement;
    // Two semitones up: D4's color at the note's 50% velocity saturation.
    expect(ghost().style.getPropertyValue('--ghost-fill')).toContain(colorOf(6200));
    expect(ghost().style.getPropertyValue('--ghost-fill')).toContain('color-mix');
    const before = ghost().style.getPropertyValue('--ghost-fill');
    fireEvent.pointerMove(roll, { clientX: 90, clientY: rowY(60) - 88, pointerId: 1 });
    expect(ghost().style.getPropertyValue('--ghost-fill')).toContain(colorOf(6400));
    expect(ghost().style.getPropertyValue('--ghost-fill')).not.toBe(before);
    fireEvent.pointerCancel(roll, { pointerId: 1 });
  });

  it('without a pitch color the previews use the single note color, as the notes do', () => {
    open({ ghostDrag: true, activeTool: 'paint', onPaintNotes: vi.fn(), onMoveNotes: vi.fn() });
    const roll = screen.getByRole('group', { name: /Piano roll/ });
    fireEvent.pointerDown(roll, { clientX: 130, clientY: rowY(60), pointerId: 1 });
    const painted = [...document.querySelectorAll('[class*="note"]')].find((element) =>
      (element as HTMLElement).title.startsWith(' ·')
    ) as HTMLElement;
    expect(painted.style.getPropertyValue('--note-color')).toBe('');
    expect(painted).not.toHaveAttribute('data-colored');
    fireEvent.pointerCancel(roll, { pointerId: 1 });
  });
});

describe('horizontal scrollbar', () => {
  it('does not echo its own programmatic scroll', () => {
    const onScrollLeft = vi.fn();
    const { rerender } = render(
      <HorizontalScrollbar range={RANGE} scrollLeft={0} onScrollLeft={onScrollLeft} />
    );
    const strip = screen.getByTestId('roll-hscroll');
    Object.defineProperty(strip, 'scrollLeft', { value: 0, writable: true });
    rerender(<HorizontalScrollbar range={RANGE} scrollLeft={200} onScrollLeft={onScrollLeft} />);
    expect(strip.scrollLeft).toBe(200);
    fireEvent.scroll(strip);
    expect(onScrollLeft).not.toHaveBeenCalled();
    // A real user move is still reported.
    strip.scrollLeft = 260;
    fireEvent.scroll(strip);
    expect(onScrollLeft).toHaveBeenCalledWith(260);
  });
});

describe('horizontal scrollbar: late scroll events', () => {
  function setup(range: number, scrollLeft: number) {
    const onScrollLeft = vi.fn();
    const view = render(
      <HorizontalScrollbar range={range} scrollLeft={scrollLeft} onScrollLeft={onScrollLeft} />
    );
    const strip = screen.getByTestId('roll-hscroll');
    Object.defineProperty(strip, 'scrollLeft', { value: scrollLeft, writable: true });
    const set = (r: number, left: number) =>
      view.rerender(
        <HorizontalScrollbar range={r} scrollLeft={left} onScrollLeft={onScrollLeft} />
      );
    return { strip, set, onScrollLeft };
  }

  it('a late echo of the LAST write is not a user move', () => {
    const { strip, set, onScrollLeft } = setup(RANGE, 0);
    set(RANGE, 200);
    set(RANGE, 350); // the last write
    expect(strip.scrollLeft).toBe(350);
    strip.scrollLeft = 350; // its (late) scroll event
    fireEvent.scroll(strip);
    expect(onScrollLeft).not.toHaveBeenCalled();
  });

  it('a native step that lands back on an EARLIER written value is a real move, not an echo', () => {
    const { strip, set, onScrollLeft } = setup(RANGE, 0);
    set(RANGE, 200); // written earlier
    set(RANGE, 350); // the last write
    strip.scrollLeft = 200; // the user's wheel or arrow key lands on the old value
    fireEvent.scroll(strip);
    expect(onScrollLeft).toHaveBeenLastCalledWith(200);
  });

  it('a write the browser clamps: the echo of the clamped position is not a user move', () => {
    const onScrollLeft = vi.fn();
    const view = render(
      <HorizontalScrollbar range={RANGE} scrollLeft={0} onScrollLeft={onScrollLeft} />
    );
    const strip = screen.getByTestId('roll-hscroll');
    // A bar whose maximum is 300: a write past it lands on 300.
    let held = 0;
    Object.defineProperty(strip, 'scrollLeft', {
      get: () => held,
      set: (value: number) => {
        held = Math.min(value, 300);
      },
    });
    view.rerender(
      <HorizontalScrollbar range={RANGE} scrollLeft={500} onScrollLeft={onScrollLeft} />
    );
    expect(held).toBe(300);
    fireEvent.scroll(strip); // the echo reports 300, not the 500 that was asked for
    expect(onScrollLeft).not.toHaveBeenCalled();
    // A genuine move elsewhere still reports.
    strip.scrollLeft = 120;
    fireEvent.scroll(strip);
    expect(onScrollLeft).toHaveBeenLastCalledWith(120);
  });

  it('a zoom (new ratio) forgets the remembered write', () => {
    const { strip, set, onScrollLeft } = setup(RANGE, 0);
    set(RANGE, 200);
    set(RANGE * 3, 200);
    strip.scrollLeft = 200;
    fireEvent.scroll(strip);
    // The ratio changed nothing here (still native), so only a genuine move may report.
    expect(onScrollLeft).not.toHaveBeenCalled();
  });

  it('when the spacer shrinks the roll writes the new position, and its echo is not a user move', () => {
    const { strip, set, onScrollLeft } = setup(RANGE, 700);
    strip.scrollLeft = 400; // zoom out: the browser clamped the bar before the new view was written
    set(300, 250);
    expect(strip.scrollLeft).toBe(250);
    fireEvent.scroll(strip); // the event of that last write
    expect(onScrollLeft).not.toHaveBeenCalled();
  });

  it('a genuine user scroll still reports, also back to an earlier written position', () => {
    const { strip, set, onScrollLeft } = setup(RANGE, 0);
    set(RANGE, 200);
    strip.scrollLeft = 500;
    fireEvent.scroll(strip);
    expect(onScrollLeft).toHaveBeenLastCalledWith(500);
    set(RANGE, 500); // the owner applies the reported position
    strip.scrollLeft = 200;
    fireEvent.scroll(strip);
    expect(onScrollLeft).toHaveBeenLastCalledWith(200);
  });
});

describe('unified panel: wheel zoom anchored at the pointer', () => {
  // The roll's scroller starts right of the 72 px keys gutter and 40 px below the panel's top.
  const LEFT = 72;
  const TOP = 40;
  function place() {
    const scroller = document.querySelector('[data-detached]') as HTMLElement;
    scroller.getBoundingClientRect = () =>
      ({ left: LEFT, top: TOP, right: LEFT + VIEW_WIDTH, bottom: TOP + 300 }) as DOMRect;
    Object.defineProperty(scroller, 'clientWidth', { value: VIEW_WIDTH, configurable: true });
    Object.defineProperty(scroller, 'clientHeight', { value: 300, configurable: true });
  }
  const timeAt = (view: PianoRollViewState, x: number) =>
    (view.scrollLeft + x) / view.pixelsPerQuarter;

  it('anchors from the latest view, not the (stale) scroller, at the cursor x', () => {
    [0, 120, 333, 499].forEach((x) => {
      const { unmount } = open({ start: { scrollLeft: 300 } });
      place();
      const scroller = document.querySelector('[data-detached]') as HTMLElement;
      // A hidden scroller that does not follow the view: reading it would anchor somewhere else.
      Object.defineProperty(scroller, 'scrollLeft', { value: 90, writable: true });
      const roll = screen.getByRole('group', { name: /Piano roll/ });
      // One zoom-in step, expected from the formula written out independently.
      const ppq = 64 * 1.15;
      fireEvent.wheel(roll, { deltaY: -100, ctrlKey: true, clientX: LEFT + x });
      const now = readView();
      expect(now.pixelsPerQuarter).toBeCloseTo(ppq, 6);
      expect(now.scrollLeft).toBeCloseTo(((300 + x) / 64) * ppq - x, 6);
      unmount();
    });
  });

  it('keeps the time under the pointer over the roll, the ruler and the lane, across steps', () => {
    [0, 120, 333, 499].forEach((x) => {
      const { unmount } = open({ start: { scrollLeft: 300 } });
      place();
      const targets = [
        screen.getByRole('group', { name: /Piano roll/ }),
        screen.getByTestId('roll-ruler'),
        screen.getByTestId('lane-track'),
      ];
      targets.forEach((target) => {
        const before = readView();
        const time = timeAt(before, x);
        // Zoom in only: the timeline stays far from its ends, so every step must hold the anchor.
        [-100, -100, -100].forEach((deltaY) => {
          fireEvent.wheel(target, { deltaY, ctrlKey: true, clientX: LEFT + x });
        });
        const now = readView();
        expect(now.scrollLeft).toBeGreaterThan(0);
        expect(now.scrollLeft).toBeLessThan(20 * now.pixelsPerQuarter - VIEW_WIDTH);
        expect(Math.abs(timeAt(now, x) - time) * now.pixelsPerQuarter).toBeLessThan(1);
        // And back out by the same steps.
        [100, 100, 100].forEach((deltaY) => {
          fireEvent.wheel(target, { deltaY, ctrlKey: true, clientX: LEFT + x });
        });
        const back = readView();
        expect(back.scrollLeft).toBeGreaterThan(0);
        expect(Math.abs(timeAt(back, x) - time) * back.pixelsPerQuarter).toBeLessThan(1);
      });
      unmount();
    });
  });

  it('a late scroll event echoing the last scrollTop write does not revert the view; an earlier value is a real scroll', () => {
    open({ start: { scrollTop: 600 } });
    place();
    const scroller = document.querySelector('[data-detached]') as HTMLElement;
    Object.defineProperty(scroller, 'scrollTop', { value: 600, writable: true });
    const roll = screen.getByRole('group', { name: /Piano roll/ });
    fireEvent.wheel(roll, { deltaY: -100, ctrlKey: true, altKey: true, clientY: TOP + 150 });
    const first = readView();
    expect(scroller.scrollTop).toBeCloseTo(first.scrollTop, 6); // written A
    fireEvent.wheel(roll, { deltaY: -100, ctrlKey: true, altKey: true, clientY: TOP + 150 });
    const second = readView();
    expect(Math.abs(second.scrollTop - first.scrollTop)).toBeGreaterThan(1);
    // The late event of the LAST write (B) changes nothing.
    scroller.scrollTop = second.scrollTop;
    fireEvent.scroll(scroller);
    expect(readView().scrollTop).toBe(second.scrollTop);
    expect(readView().pixelsPerSemitone).toBe(second.pixelsPerSemitone);
    // A scroll that lands back on the earlier written value A is genuine and is taken.
    scroller.scrollTop = first.scrollTop;
    fireEvent.scroll(scroller);
    expect(readView().scrollTop).toBe(first.scrollTop);
    // So is any other genuine user scroll.
    scroller.scrollTop = second.scrollTop + 80;
    fireEvent.scroll(scroller);
    expect(readView().scrollTop).toBe(second.scrollTop + 80);
  });

  it('keeps the pitch under the pointer, also for a burst of events before a render', () => {
    open({ start: { scrollTop: 600 } });
    place();
    const roll = screen.getByRole('group', { name: /Piano roll/ });
    const pitchAt = (view: PianoRollViewState, y: number) =>
      127 - (view.scrollTop + y - 32) / view.pixelsPerSemitone;
    const before = readView();
    const pitch = pitchAt(before, 150);
    act(() => {
      [-100, -100, -100].forEach((deltaY) =>
        fireEvent.wheel(roll, { deltaY, ctrlKey: true, altKey: true, clientY: TOP + 150 })
      );
    });
    const after = readView();
    expect(after.pixelsPerSemitone).toBeGreaterThan(before.pixelsPerSemitone);
    expect(Math.abs(pitchAt(after, 150) - pitch) * after.pixelsPerSemitone).toBeLessThan(1);
  });

  it('a pointer over the keys gutter or past the roll anchors at the nearest edge', () => {
    open({ start: { scrollLeft: 300 } });
    place();
    const roll = screen.getByRole('group', { name: /Piano roll/ });
    const before = readView();
    fireEvent.wheel(roll, { deltaY: -100, ctrlKey: true, clientX: 10 });
    expect(timeAt(readView(), 0)).toBeCloseTo(timeAt(before, 0), 5);
    const mid = readView();
    fireEvent.wheel(roll, { deltaY: -100, ctrlKey: true, clientX: LEFT + VIEW_WIDTH + 200 });
    expect(timeAt(readView(), VIEW_WIDTH)).toBeCloseTo(timeAt(mid, VIEW_WIDTH), 5);
  });
});
