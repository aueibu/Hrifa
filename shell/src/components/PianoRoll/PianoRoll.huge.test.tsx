import { useState } from 'react';
import { act, fireEvent, render, screen } from '@test-utils';
import { gridDensity } from './gridDensity';
import { HorizontalScrollbar } from './HorizontalScrollbar';
import { defaultPianoRollView, type PianoRollGridSource, type PianoRollViewState } from './model';
import { PianoRoll } from './PianoRoll';
import { barRatio, MAX_NATIVE_BAR_RANGE } from './scrollSync';
import { ORIGIN_STEP, POSITION_BOUND, SAFE_TIMELINE_WIDTH } from './timelineLayout';
import { VelocityLane } from './VelocityLane';

// A 72000-bar clip (Bitwig's cap) in the unified panel, and Mixer-style arrays. jsdom lays nothing
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

function measure() {
  const scroller = document.querySelector('[data-detached], [data-roll-scroller]') as HTMLElement;
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

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const BARS = 72_000;
const QUARTERS = BARS * 4;
const fourFour = { numerator: 4, denominator: 4 };
const source: PianoRollGridSource = (from, to, pixelsPerQuarter, extent) =>
  gridDensity({ meter: fourFour, pixelsPerQuarter, from, to, extent });
// Sixty notes spread over the whole clip.
const notes = Array.from({ length: 60 }, (_, index) => ({
  id: `n${index}`,
  start: index * 4_800,
  duration: 1,
  pitchMidicents: 6000,
  label: 'C4',
  velocity: 0.8,
}));

function Panel({ start }: { start: Partial<PianoRollViewState> }) {
  const [view, setView] = useState<PianoRollViewState>({
    ...defaultPianoRollView,
    framed: true,
    ...start,
  });
  return (
    <>
      <PianoRoll
        notes={notes}
        duration={QUARTERS + 4}
        gridLines={source}
        view={view}
        onViewChange={setView}
        selectedIds={[]}
        onSelectionChange={() => undefined}
        tools={[{ id: 'pointer', label: 'Pointer', shortcut: '1' }]}
        activeTool="pointer"
        endMarker={QUARTERS}
        loopBand={{ start: 0, end: QUARTERS }}
        selectedRange={{ start: 0, end: QUARTERS }}
        fill
        wheelZoom
        detachedScroll
        showToolbar={false}
        timeZoomRange={{ min: 0.25, max: 192 }}
        lane={(metrics) => (
          <VelocityLane
            notes={notes}
            pixelsPerQuarter={view.pixelsPerQuarter}
            scrollLeft={view.scrollLeft}
            duration={QUARTERS + 4}
            gridLines={source}
            viewWidth={metrics.viewWidth}
          />
        )}
      />
      <output data-testid="view">{JSON.stringify(view)}</output>
    </>
  );
}

const readView = () => JSON.parse(screen.getByTestId('view').textContent!) as PianoRollViewState;

/** Every pixel number written into an inline style anywhere in the page. */
function inlinePixels() {
  const found: Array<{ element: Element; property: string; value: number }> = [];
  document.querySelectorAll<HTMLElement>('[style]').forEach((element) => {
    ['left', 'width', 'gridTemplateColumns', 'transform'].forEach((property) => {
      const text = (element.style as unknown as Record<string, string>)[property];
      (text?.match(/-?\d+(\.\d+)?(?=px)/g) ?? []).forEach((number) =>
        found.push({ element, property, value: Number(number) })
      );
    });
  });
  return found;
}

describe('a 72000-bar clip in the unified panel', () => {
  const zooms = [0.25, 1, 16, 64, 192];
  const shares = [0, 0.37, 1];

  zooms.forEach((zoom) => {
    shares.forEach((share) => {
      it(`stays bounded and under the position bound at ${zoom} px/quarter, ${Math.round(share * 100)}% scrolled`, () => {
        const width = QUARTERS * zoom;
        const scrollLeft = Math.max(0, share * (width - VIEW_WIDTH));
        render(<Panel start={{ pixelsPerQuarter: zoom, scrollLeft }} />);
        measure();
        // No element carries a pixel position or width beyond the bound.
        inlinePixels().forEach(({ value }) => {
          expect(Math.abs(value)).toBeLessThan(POSITION_BOUND);
        });
        // The grid is only what is on screen, not one element per line over the timeline.
        expect(document.querySelectorAll('[data-kind]').length).toBeLessThan(400);
        expect(screen.queryAllByTestId('velocity-grid-line').length).toBeLessThan(400);
        expect(document.querySelectorAll('[style]').length).toBeLessThan(900);
        // The bar's native range stays inside what a browser scrolls.
        const spacer = screen.getByTestId('roll-hscroll').firstElementChild as HTMLElement;
        const native = Number(/\+ ([\d.]+)px/.exec(spacer.style.width)![1]);
        expect(native).toBeLessThanOrEqual(MAX_NATIVE_BAR_RANGE + 1);
        if (width > SAFE_TIMELINE_WIDTH) {
          // Windowed: only the notes near the view are drawn.
          expect(document.querySelectorAll('[data-info]').length).toBeLessThan(notes.length);
        }
        // The view is the owner's truth, untouched by all of this.
        expect(readView().pixelsPerQuarter).toBe(zoom);
      });
    });
  });

  it('draws the far end as bar numbers like 71990 and reaches it at the narrowest zoom', () => {
    const zoom = 0.25;
    const width = QUARTERS * zoom;
    render(<Panel start={{ pixelsPerQuarter: zoom, scrollLeft: width }} />);
    measure();
    const labels = [...document.querySelectorAll('[data-detached] span')]
      .map((element) => element.textContent ?? '')
      .filter((text) => /^\d{5}$/.test(text));
    expect(labels.length).toBeGreaterThan(1);
    expect(Math.max(...labels.map(Number))).toBeLessThanOrEqual(BARS + 1);
    expect(Math.max(...labels.map(Number))).toBeGreaterThan(BARS - 1600);
  });

  it('pins the hidden scroller to the position relative to the window origin', () => {
    const zoom = 192;
    const scrollLeft = 30_000_123;
    render(<Panel start={{ pixelsPerQuarter: zoom, scrollLeft }} />);
    measure();
    const scroller = document.querySelector('[data-detached]') as HTMLElement;
    Object.defineProperty(scroller, 'scrollLeft', { value: 0, writable: true });
    fireEvent.scroll(scroller);
    const origin = Math.floor(readView().scrollLeft / ORIGIN_STEP) * ORIGIN_STEP;
    expect(origin).toBeGreaterThan(0);
    expect(scroller.scrollLeft).toBe(readView().scrollLeft - origin);
    // The owner's position is still the full timeline coordinate.
    expect(readView().scrollLeft).toBe(scrollLeft);
  });

  it('wheel zoom reaches hundreds of bars and the clip-length zoom range holds', () => {
    render(<Panel start={{ pixelsPerQuarter: 64, scrollLeft: 0 }} />);
    measure();
    const roll = screen.getByRole('group', { name: /Piano roll/ });
    for (let step = 0; step < 60; step += 1) {
      fireEvent.wheel(roll, { deltaY: 100, ctrlKey: true });
    }
    // Zoomed all the way out: the notes editor's minimum, not the roll's default 16.
    expect(readView().pixelsPerQuarter).toBe(0.25);
    // Hundreds of bars fit a 500 px view: 500 px at a quarter pixel per quarter is 500 bars.
    expect(VIEW_WIDTH / 0.25 / 4).toBeGreaterThanOrEqual(100);
    for (let step = 0; step < 80; step += 1) {
      fireEvent.wheel(roll, { deltaY: -100, ctrlKey: true });
    }
    expect(readView().pixelsPerQuarter).toBe(192);
  });
});

describe('the scrollbar on a huge range', () => {
  const RANGE = 55_000_000;

  it('scales its native range and maps native positions to logical ones', () => {
    const ratio = barRatio(RANGE);
    expect(ratio).toBeGreaterThan(1);
    const onScrollLeft = vi.fn();
    const { rerender } = render(
      <HorizontalScrollbar range={RANGE} scrollLeft={0} onScrollLeft={onScrollLeft} />
    );
    const strip = screen.getByTestId('roll-hscroll');
    const spacer = strip.firstElementChild as HTMLElement;
    expect(Number(/\+ ([\d.]+)px/.exec(spacer.style.width)![1])).toBeCloseTo(
      MAX_NATIVE_BAR_RANGE,
      0
    );
    Object.defineProperty(strip, 'scrollLeft', { value: 0, writable: true });
    // The roll moves (wheel): the bar is written in native pixels, and does not report it back.
    rerender(
      <HorizontalScrollbar range={RANGE} scrollLeft={27_500_000} onScrollLeft={onScrollLeft} />
    );
    expect(strip.scrollLeft).toBeCloseTo(27_500_000 / ratio, 3);
    fireEvent.scroll(strip);
    expect(onScrollLeft).not.toHaveBeenCalled();
    // The user drags the bar to a native position: logical = native * ratio, reported once.
    strip.scrollLeft = 6_000_000;
    fireEvent.scroll(strip);
    expect(onScrollLeft).toHaveBeenCalledTimes(1);
    expect(onScrollLeft.mock.calls[0][0]).toBeCloseTo(6_000_000 * ratio, 3);
    // Its own end is exactly the roll's end.
    strip.scrollLeft = MAX_NATIVE_BAR_RANGE;
    fireEvent.scroll(strip);
    expect(onScrollLeft.mock.calls[1][0]).toBeCloseTo(RANGE, 3);
  });

  it('a roll move smaller than one native pixel writes nothing, so there is no feedback', () => {
    const onScrollLeft = vi.fn();
    const { rerender } = render(
      <HorizontalScrollbar range={RANGE} scrollLeft={10_000_000} onScrollLeft={onScrollLeft} />
    );
    const strip = screen.getByTestId('roll-hscroll');
    Object.defineProperty(strip, 'scrollLeft', {
      value: 10_000_000 / barRatio(RANGE),
      writable: true,
    });
    const before = strip.scrollLeft;
    rerender(
      <HorizontalScrollbar range={RANGE} scrollLeft={10_000_002} onScrollLeft={onScrollLeft} />
    );
    expect(strip.scrollLeft).toBe(before);
    fireEvent.scroll(strip);
    expect(onScrollLeft).not.toHaveBeenCalled();
  });

  it('a range that fits natively behaves exactly as before (ratio 1)', () => {
    const onScrollLeft = vi.fn();
    render(<HorizontalScrollbar range={780} scrollLeft={0} onScrollLeft={onScrollLeft} />);
    const strip = screen.getByTestId('roll-hscroll');
    Object.defineProperty(strip, 'scrollLeft', { value: 0, writable: true });
    strip.scrollLeft = 260;
    fireEvent.scroll(strip);
    expect(onScrollLeft).toHaveBeenCalledWith(260);
  });
});

describe('Mixer-style arrays are drawn whole', () => {
  it('keeps every subdivision line with a fixed scrollLeft of 0 and a native scroller wider than the view', () => {
    // 60 quarters at 64 px is 3840 px in a 500 px view that scrolls natively; the owner's view
    // never changes scrollLeft (Mixer pins it to 0), so a window built from it would trim the rest.
    render(
      <PianoRoll
        notes={[]}
        duration={60}
        gridLines={[
          { at: 0, kind: 'bar', label: '1' },
          { at: 56, kind: 'bar', label: '15' },
        ]}
        view={{ ...defaultPianoRollView, framed: true, scrollLeft: 0 }}
        onViewChange={() => undefined}
        showToolbar={false}
      />
    );
    act(() => {
      observers.forEach(({ callback, targets }) =>
        callback(
          targets.map((target) => ({ target, contentRect: { width: VIEW_WIDTH, height: 300 } }))
        )
      );
    });
    const lines = [...document.querySelectorAll('[data-kind]')];
    const positions = lines.map((line) => Number.parseFloat((line as HTMLElement).style.left));
    // Past two view widths from the start (1000 px) and out to the end.
    expect(Math.max(...positions)).toBeGreaterThanOrEqual(56 * 64);
    expect(document.querySelectorAll('[data-subdivision]').length).toBe(119);
  });
});

describe('pointer handlers in a windowed clip', () => {
  const ZOOM = 192;
  const NOTE_X = 2_000_064; // note n0 starts just past the first origin boundary (2 M px)
  const NOTE_START = NOTE_X / ZOOM;
  const row = (midi: number) => (127 - midi) * 22 + 11;
  const edited = [
    { id: 'n0', start: NOTE_START, duration: 1, pitchMidicents: 6000, label: 'C4', velocity: 0.8 },
  ];
  const makeHandlers = () => ({
    onSelectionChange: vi.fn(),
    onAddNote: vi.fn(),
    onDeleteNotes: vi.fn(),
    onMarqueeRange: vi.fn(),
  });
  type Handlers = ReturnType<typeof makeHandlers>;

  function EditPanel({
    start,
    tool,
    handlers,
  }: {
    start: number;
    tool: string;
    handlers: Handlers;
  }) {
    const [view, setView] = useState<PianoRollViewState>({
      ...defaultPianoRollView,
      framed: true,
      pixelsPerQuarter: ZOOM,
      scrollLeft: start,
    });
    return (
      <>
        <PianoRoll
          notes={edited}
          duration={QUARTERS + 4}
          gridLines={source}
          gridUnit={0.25}
          view={view}
          onViewChange={setView}
          selectedIds={[]}
          tools={[
            { id: 'pointer', label: 'Pointer', shortcut: '1' },
            { id: 'pencil', label: 'Pencil', shortcut: '3' },
          ]}
          activeTool={tool}
          fill
          wheelZoom
          detachedScroll
          showToolbar={false}
          timeZoomRange={{ min: 0.25, max: 192 }}
          {...handlers}
        />
        <output data-testid="view">{JSON.stringify(view)}</output>
      </>
    );
  }

  /** Scroll positions just below, at and just above the 2 M px origin boundary, all showing n0. */
  const scrolls = [1_999_900, 2_000_000, 2_000_100];
  const originOf = (scrollLeft: number) => Math.floor(scrollLeft / ORIGIN_STEP) * ORIGIN_STEP;

  function open(start: number, tool: string) {
    const handlers = makeHandlers();
    render(<EditPanel start={start} tool={tool} handlers={handlers} />);
    measure();
    return { handlers, roll: screen.getByRole('group', { name: /Piano roll/ }) };
  }

  scrolls.forEach((start) => {
    const origin = originOf(start);

    it(`double-click on a visible note deletes that note (scrolled to ${start})`, () => {
      const { handlers, roll } = open(start, 'pointer');
      fireEvent.doubleClick(roll, { clientX: NOTE_X + 40 - origin, clientY: row(60) });
      expect(handlers.onDeleteNotes).toHaveBeenCalledWith(['n0']);
      expect(handlers.onAddNote).not.toHaveBeenCalled();
    });

    it(`double-click on empty space adds at the visible position (scrolled to ${start})`, () => {
      const { handlers, roll } = open(start, 'pointer');
      const x = start + 300;
      fireEvent.doubleClick(roll, { clientX: x - origin, clientY: row(62) });
      expect(handlers.onDeleteNotes).not.toHaveBeenCalled();
      expect(handlers.onAddNote).toHaveBeenCalledTimes(1);
      const added = handlers.onAddNote.mock.calls[0][0];
      expect(added.start).toBe(Math.floor(x / ZOOM / 0.25) * 0.25);
      expect(added.pitchMidicents).toBe(6200);
    });

    it(`pencil draws at the pointer (scrolled to ${start})`, () => {
      const { handlers, roll } = open(start, 'pencil');
      const x = start + 300;
      fireEvent.pointerDown(roll, { clientX: x - origin, clientY: row(64), pointerId: 1 });
      fireEvent.pointerUp(roll, { clientX: x - origin, clientY: row(64), pointerId: 1 });
      const added = handlers.onAddNote.mock.calls[0][0];
      expect(Math.abs(added.start - x / ZOOM)).toBeLessThan(0.5);
      expect(added.pitchMidicents).toBe(6400);
    });

    it(`a marquee selects what is under it (scrolled to ${start})`, () => {
      const { handlers, roll } = open(start, 'pointer');
      const from = NOTE_X - 20 - origin;
      fireEvent.pointerDown(roll, { clientX: from, clientY: row(60) - 30, pointerId: 1 });
      fireEvent.pointerMove(roll, { clientX: from + 80, clientY: row(60) + 30, pointerId: 1 });
      fireEvent.pointerUp(roll, { clientX: from + 80, clientY: row(60) + 30, pointerId: 1 });
      expect(handlers.onSelectionChange).toHaveBeenLastCalledWith(['n0']);
      const range = handlers.onMarqueeRange.mock.calls[0][0];
      expect(Math.abs(range.start - (NOTE_X - 20) / ZOOM)).toBeLessThan(0.5);
    });

    it(`a marquee over empty space selects nothing (scrolled to ${start})`, () => {
      const { handlers, roll } = open(start, 'pointer');
      const from = start + 500 - origin;
      fireEvent.pointerDown(roll, { clientX: from, clientY: row(60) - 30, pointerId: 1 });
      fireEvent.pointerMove(roll, { clientX: from + 60, clientY: row(60) + 30, pointerId: 1 });
      fireEvent.pointerUp(roll, { clientX: from + 60, clientY: row(60) + 30, pointerId: 1 });
      expect(handlers.onSelectionChange).toHaveBeenLastCalledWith([]);
    });

    it(`pointer double-press-and-hold enters the note at the pointer (scrolled to ${start})`, () => {
      const { handlers, roll } = open(start, 'pointer');
      const x = start + 300 - origin;
      fireEvent.pointerDown(roll, { clientX: x, clientY: row(72), pointerId: 1 });
      fireEvent.pointerUp(roll, { clientX: x, clientY: row(72), pointerId: 1 });
      fireEvent.pointerDown(roll, { clientX: x + 1, clientY: row(72), pointerId: 2 });
      fireEvent.pointerMove(roll, { clientX: x + 1 + 192, clientY: row(72), pointerId: 2 });
      fireEvent.pointerUp(roll, { clientX: x + 1 + 192, clientY: row(72), pointerId: 2 });
      fireEvent.doubleClick(roll, { clientX: x + 1 + 192, clientY: row(72) });
      expect(handlers.onAddNote).toHaveBeenCalledTimes(1);
      const added = handlers.onAddNote.mock.calls[0][0];
      expect(Math.abs(added.start - (x + origin) / ZOOM)).toBeLessThan(0.5);
      expect(added.duration).toBe(1);
      expect(handlers.onDeleteNotes).not.toHaveBeenCalled();
    });
  });

  it('keeps the native scroller and content consistent across an origin boundary', () => {
    const { handlers, roll } = open(1_999_900, 'pointer');
    const scroller = document.querySelector('[data-detached]') as HTMLElement;
    Object.defineProperty(scroller, 'scrollLeft', { value: 0, writable: true });
    const noteLeft = () =>
      Number.parseFloat((screen.getByTitle(/^C4/) as HTMLElement).style.left || '0');
    const hitNote = () => {
      handlers.onDeleteNotes.mockClear();
      const left = readView().scrollLeft;
      fireEvent.doubleClick(roll, {
        clientX: NOTE_X + 40 - originOf(left),
        clientY: row(60),
      });
      expect(handlers.onDeleteNotes).toHaveBeenCalledWith(['n0']);
    };
    hitNote();
    expect(originOf(readView().scrollLeft)).toBe(0);
    // A sideways wheel carries the view across the 2 M px boundary.
    fireEvent.wheel(roll, { deltaY: 300, shiftKey: true });
    const after = readView().scrollLeft;
    expect(after).toBeGreaterThan(ORIGIN_STEP);
    const origin = originOf(after);
    expect(origin).toBe(ORIGIN_STEP);
    // The scroller is pinned relative to the new origin, and the note is drawn relative to it too:
    // both put the note at the same distance from the left edge of the view.
    expect(scroller.scrollLeft).toBe(after - origin);
    expect(noteLeft() - scroller.scrollLeft).toBe(NOTE_X - after);
    hitNote();
    // And back across.
    fireEvent.wheel(roll, { deltaY: -300, shiftKey: true });
    expect(originOf(readView().scrollLeft)).toBe(0);
    expect(scroller.scrollLeft).toBe(readView().scrollLeft);
    expect(noteLeft() - scroller.scrollLeft).toBe(NOTE_X - readView().scrollLeft);
    hitNote();
  });
});

describe('the scrollbar when its ratio changes', () => {
  it('forgets positions remembered at the old ratio, so a roll move is written', () => {
    const onScrollLeft = vi.fn();
    const { rerender } = render(
      <HorizontalScrollbar range={55_000_000} scrollLeft={0} onScrollLeft={onScrollLeft} />
    );
    const strip = screen.getByTestId('roll-hscroll');
    Object.defineProperty(strip, 'scrollLeft', { value: 0, writable: true });
    // The user drags the bar: native 1000 is remembered as the position it reported.
    strip.scrollLeft = 1000;
    fireEvent.scroll(strip);
    expect(onScrollLeft).toHaveBeenCalledTimes(1);
    // The range shrinks to ratio 1 and the roll lands on a position equal to the stale native 1000:
    // it came from the roll, not the bar, so it must be written.
    strip.scrollLeft = 0;
    rerender(<HorizontalScrollbar range={700_000} scrollLeft={1000} onScrollLeft={onScrollLeft} />);
    expect(strip.scrollLeft).toBe(1000);
  });
});

describe('wheel zoom anchored at the pointer on a windowed timeline', () => {
  it('keeps the time under the pointer past the 2 M px origin, and at the far end the clamp may win', () => {
    render(<Panel start={{ pixelsPerQuarter: 192, scrollLeft: 30_000_123 }} />);
    measure();
    const scroller = document.querySelector('[data-detached]') as HTMLElement;
    scroller.getBoundingClientRect = () =>
      ({ left: 72, top: 0, right: 572, bottom: 300 }) as DOMRect;
    Object.defineProperty(scroller, 'clientWidth', { value: VIEW_WIDTH, configurable: true });
    const roll = screen.getByRole('group', { name: /Piano roll/ });
    [40, 250, 480].forEach((x) => {
      const before = readView();
      const time = (before.scrollLeft + x) / before.pixelsPerQuarter;
      [100, 100, -100, -100, -100].forEach((deltaY) => {
        fireEvent.wheel(roll, { deltaY, ctrlKey: true, clientX: 72 + x });
      });
      const now = readView();
      // Out then in lands at a different zoom than it started; compare the time under the pointer.
      expect(
        Math.abs((now.scrollLeft + x) / now.pixelsPerQuarter - time) * now.pixelsPerQuarter
      ).toBeLessThan(1.5);
    });
    // At the very end the position is clamped to the range; it never passes it.
    const end = QUARTERS * readView().pixelsPerQuarter;
    act(() => {
      fireEvent.wheel(roll, { deltaY: -100, ctrlKey: true, clientX: 72 + 499 });
    });
    expect(readView().scrollLeft).toBeLessThanOrEqual(
      QUARTERS * readView().pixelsPerQuarter + 4 * readView().pixelsPerQuarter - VIEW_WIDTH
    );
    expect(end).toBeGreaterThan(0);
  });
});
