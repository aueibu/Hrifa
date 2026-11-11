import { createRef } from 'react';
import { fireEvent, render, screen } from '@test-utils';
import { RollScrollbar } from './RollScrollbar';

/** A scroller whose scroll metrics are set by hand, as jsdom does no layout. */
function fakeScroller({ scrollWidth, clientWidth, scrollLeft }: { scrollWidth: number; clientWidth: number; scrollLeft: number }) {
  const element = document.createElement('div');
  Object.defineProperty(element, 'scrollWidth', { value: scrollWidth, configurable: true });
  Object.defineProperty(element, 'clientWidth', { value: clientWidth, configurable: true });
  element.scrollLeft = scrollLeft;
  return element;
}

function setup(metrics: Parameters<typeof fakeScroller>[0]) {
  const scroller = createRef<HTMLElement>();
  (scroller as { current: HTMLElement | null }).current = fakeScroller(metrics);
  const onViewport = vi.fn();
  render(<RollScrollbar scroller={scroller} revision={0} onViewport={onViewport} />);
  const bar = screen.getByRole('scrollbar');
  Object.defineProperty(bar, 'clientWidth', { value: 1000, configurable: true });
  return { bar, onViewport };
}

describe('RollScrollbar', () => {
  it('reports the position it is scrolled to', () => {
    const { bar } = setup({ scrollWidth: 4000, clientWidth: 1000, scrollLeft: 1000 });
    // The view starts a quarter of the way in.
    expect(bar.getAttribute('aria-valuenow')).toBe('25');
  });

  it('scrolls with the arrow keys and zooms with up and down', () => {
    const { bar, onViewport } = setup({ scrollWidth: 4000, clientWidth: 1000, scrollLeft: 1000 });
    fireEvent.keyDown(bar, { key: 'ArrowRight' });
    // The span is a quarter of the roll; a tenth of that is 0.025.
    expect(onViewport.mock.calls[0][0].start).toBeCloseTo(0.275);
    expect(onViewport.mock.calls[0][0].span).toBeCloseTo(0.25);
    fireEvent.keyDown(bar, { key: 'ArrowUp' });
    expect(onViewport.mock.calls[1][0].span).toBeCloseTo(0.25 / 1.5);
    fireEvent.keyDown(bar, { key: 'ArrowDown' });
    expect(onViewport.mock.calls[2][0].span).toBeCloseTo(0.25 * 1.5);
    fireEvent.keyDown(bar, { key: 'Home' });
    expect(onViewport.mock.calls[3][0].start).toBe(0);
    fireEvent.keyDown(bar, { key: 'End' });
    expect(onViewport.mock.calls[4][0].start).toBeCloseTo(0.75);
  });

  it('zooms when an end of the thumb is dragged, keeping the other end fixed', () => {
    const { bar, onViewport } = setup({ scrollWidth: 4000, clientWidth: 1000, scrollLeft: 1000 });
    const right = bar.querySelector('[data-side="right"]')!;
    fireEvent.pointerDown(right, { clientX: 500, clientY: 5, pointerId: 1 });
    fireEvent.pointerMove(right, { clientX: 600, clientY: 5, pointerId: 1 });
    // Dragging the right end 100px of a 1000px track widens the view by 0.1, left edge unchanged.
    const last = onViewport.mock.calls.at(-1)![0];
    expect(last.start).toBeCloseTo(0.25);
    expect(last.span).toBeCloseTo(0.35);
  });

  it('scrolls when the body is dragged sideways and zooms when it is dragged up', () => {
    const { bar, onViewport } = setup({ scrollWidth: 4000, clientWidth: 1000, scrollLeft: 1000 });
    const thumb = bar.firstElementChild!;
    fireEvent.pointerDown(thumb, { clientX: 400, clientY: 9, pointerId: 1 });
    fireEvent.pointerMove(thumb, { clientX: 500, clientY: 9, pointerId: 1 });
    expect(onViewport.mock.calls.at(-1)![0].start).toBeCloseTo(0.35);
    expect(onViewport.mock.calls.at(-1)![0].span).toBeCloseTo(0.25);
    fireEvent.pointerMove(thumb, { clientX: 400, clientY: -51, pointerId: 1 });
    // 60px up is one zoom step in.
    expect(onViewport.mock.calls.at(-1)![0].span).toBeCloseTo(0.25 / 1.5);
    fireEvent.pointerUp(thumb, { pointerId: 1 });
  });
});
