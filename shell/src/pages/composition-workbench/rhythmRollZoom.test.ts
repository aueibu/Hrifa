import {
  clampCellWidth,
  dragBody,
  dragBodyAndZoom,
  dragLeftEdge,
  dragRightEdge,
  MIN_SPAN,
  thumbGeometry,
  zoomViewport,
  DEFAULT_CELL_WIDTH,
  fitCellWidth,
  MAX_CELL_WIDTH,
  MIN_CELL_WIDTH,
  scrollLeftAfterZoom,
  zoomedCellWidth,
} from './rhythmRollZoom';

describe('rhythm roll zoom', () => {
  it('zooms the width in and out by a fixed step and stays within its limits', () => {
    expect(zoomedCellWidth(30, 'in')).toBe(45);
    expect(zoomedCellWidth(30, 'out')).toBe(20);
    expect(zoomedCellWidth(MAX_CELL_WIDTH, 'in')).toBe(MAX_CELL_WIDTH);
    expect(zoomedCellWidth(MIN_CELL_WIDTH, 'out')).toBe(MIN_CELL_WIDTH);
    expect(clampCellWidth(Number.NaN)).toBe(DEFAULT_CELL_WIDTH);
    expect(clampCellWidth(0)).toBe(MIN_CELL_WIDTH);
    expect(clampCellWidth(9999)).toBe(MAX_CELL_WIDTH);
  });

  it('finds the width at which the whole rhythm fits the view', () => {
    // 504 pulses with a 0.5-pulse shortest note in a 1000px view: 1000 * 0.5 / 504 = 0.99, so the
    // smallest allowed width; a short rhythm of 10 pulses with a 1-pulse shortest note: 100px.
    expect(fitCellWidth(1000, 504, 0.5)).toBe(MIN_CELL_WIDTH);
    expect(fitCellWidth(1000, 10, 1)).toBe(100);
    expect(fitCellWidth(0, 10, 1)).toBe(DEFAULT_CELL_WIDTH);
  });

  it('keeps the middle of the view where it was when the content changes width', () => {
    // Content 4000px wide, view 400px wide at scrollLeft 1800: the middle is at 2000 (half way).
    // Doubling the content keeps the middle at half way: 4000 - 200.
    expect(
      scrollLeftAfterZoom({ scrollLeft: 1800, viewWidth: 400, oldContentWidth: 4000, newContentWidth: 8000 })
    ).toBe(3800);
    // Zooming out re-centres on the same point.
    expect(
      scrollLeftAfterZoom({ scrollLeft: 3800, viewWidth: 400, oldContentWidth: 8000, newContentWidth: 4000 })
    ).toBe(1800);
  });

  it('never scrolls outside the content', () => {
    expect(
      scrollLeftAfterZoom({ scrollLeft: 0, viewWidth: 400, oldContentWidth: 8000, newContentWidth: 4000 })
    ).toBe(0);
    expect(
      scrollLeftAfterZoom({ scrollLeft: 3600, viewWidth: 400, oldContentWidth: 4000, newContentWidth: 2000 })
    ).toBe(1600);
    expect(
      scrollLeftAfterZoom({ scrollLeft: 0, viewWidth: 400, oldContentWidth: 300, newContentWidth: 200 })
    ).toBe(0);
  });
});

describe('the zoom bar', () => {
  const view = { start: 0.2, span: 0.3 };

  it('scrolls without changing the zoom when the body is dragged sideways, within the track', () => {
    expect(dragBody(view, 0.1)).toEqual({ start: 0.30000000000000004, span: 0.3 });
    expect(dragBody(view, 5)).toEqual({ start: 0.7, span: 0.3 });
    expect(dragBody(view, -5)).toEqual({ start: 0, span: 0.3 });
  });

  it('zooms by moving one end with the other end fixed', () => {
    // The right end out by 0.2: the left edge stays at 0.2 and the span grows to 0.5.
    expect(dragRightEdge(view, 0.2)).toEqual({ start: 0.2, span: 0.5 });
    // Dragging it past the end of the track stops at the end.
    expect(dragRightEdge(view, 5)).toEqual({ start: 0.2, span: 0.8 });
    // The left end in by 0.1: the right edge stays at 0.5 and the span shrinks to 0.2.
    const left = dragLeftEdge(view, 0.1);
    expect(left.start).toBeCloseTo(0.3);
    expect(left.start + left.span).toBeCloseTo(0.5);
    // It can shrink almost to nothing but not past it.
    expect(dragLeftEdge(view, 5).span).toBeCloseTo(MIN_SPAN);
    expect(dragRightEdge(view, -5).span).toBe(MIN_SPAN);
  });

  it('zooms about a point so that point keeps its place in the view', () => {
    // Zoom in 2x about the middle of the view (0.35): the span halves and the middle stays put.
    const zoomed = zoomViewport(view, 2, 0.35);
    expect(zoomed.span).toBeCloseTo(0.15);
    expect(zoomed.start + zoomed.span / 2).toBeCloseTo(0.35);
    // Zooming out past the whole roll shows all of it.
    expect(zoomViewport(view, 0.01, 0.35)).toEqual({ start: 0, span: 1 });
  });

  it('zooms in when the thumb body is dragged up and out when it is dragged down', () => {
    const up = dragBodyAndZoom(view, 0, -60);
    expect(up.span).toBeCloseTo(0.3 / 1.5);
    const down = dragBodyAndZoom(view, 0, 60);
    expect(down.span).toBeCloseTo(0.3 * 1.5);
    // Sideways and vertical together do both.
    const both = dragBodyAndZoom(view, 0.1, -60);
    expect(both.span).toBeCloseTo(0.2);
    expect(both.start).toBeGreaterThan(zoomViewport(view, 1.5, 0.35).start);
  });

  it('draws the thumb along the track, never thinner than a grabbable minimum', () => {
    expect(thumbGeometry({ start: 0.2, span: 0.3 }, 1000)).toEqual({ left: 200, width: 300 });
    expect(thumbGeometry({ start: 0.5, span: 0.001 }, 1000)).toEqual({ left: 500, width: 24 });
    expect(thumbGeometry({ start: 0.999, span: 0.001 }, 1000)).toEqual({ left: 976, width: 24 });
    expect(thumbGeometry({ start: 0, span: 1 }, 1000)).toEqual({ left: 0, width: 1000 });
  });
});
