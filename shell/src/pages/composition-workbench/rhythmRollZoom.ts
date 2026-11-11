/**
 * Horizontal zoom for the rhythm roll. Zoom changes only how wide a pulse is drawn; row heights are
 * fixed, so the vertical scale never changes. The roll is sized so its shortest note is `cellWidth`
 * px across (see RhythmEditModule), which makes `cellWidth` the one number zoom changes.
 */

export const DEFAULT_CELL_WIDTH = 30;
export const MIN_CELL_WIDTH = 1;
export const MAX_CELL_WIDTH = 160;
/** Each zoom step multiplies or divides the width by this. */
export const ZOOM_STEP = 1.5;

export function clampCellWidth(width: number): number {
  if (!Number.isFinite(width)) {
    return DEFAULT_CELL_WIDTH;
  }
  return Math.min(MAX_CELL_WIDTH, Math.max(MIN_CELL_WIDTH, Math.round(width * 10) / 10));
}

export function zoomedCellWidth(width: number, direction: 'in' | 'out'): number {
  return clampCellWidth(direction === 'in' ? width * ZOOM_STEP : width / ZOOM_STEP);
}

/**
 * The cell width at which the whole rhythm exactly fits a view `viewWidth` px wide, given the
 * rhythm's length in pulses and its shortest note.
 */
export function fitCellWidth(viewWidth: number, totalPulses: number, shortestNote: number): number {
  if (!(viewWidth > 0) || !(totalPulses > 0) || !(shortestNote > 0)) {
    return DEFAULT_CELL_WIDTH;
  }
  return clampCellWidth((viewWidth * shortestNote) / totalPulses);
}

/**
 * Where to scroll after zooming so the point at the middle of the view stays at the middle:
 * the content point under the view's centre moves in proportion to the content's new width.
 */
export function scrollLeftAfterZoom({
  scrollLeft,
  viewWidth,
  oldContentWidth,
  newContentWidth,
}: {
  scrollLeft: number;
  viewWidth: number;
  oldContentWidth: number;
  newContentWidth: number;
}): number {
  if (!(oldContentWidth > 0)) {
    return 0;
  }
  const centre = (scrollLeft + viewWidth / 2) / oldContentWidth;
  const maximum = Math.max(0, newContentWidth - viewWidth);
  return Math.min(maximum, Math.max(0, centre * newContentWidth - viewWidth / 2));
}

// ---------------------------------------------------------------- the zoom bar

/**
 * The visible part of the roll as fractions of its whole width: where it starts (0 to 1) and how
 * much of the roll it spans (above 0, at most 1). This is what the zoom bar's thumb draws: it
 * sits at `start` of the track and is `span` of its width.
 */
export interface Viewport {
  start: number;
  span: number;
}

/** The thumb never shrinks below this span, however far an edge is dragged in. */
export const MIN_SPAN = 0.002;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Drag the thumb sideways by `dx` (a fraction of the track): scroll, same zoom. */
export function dragBody(viewport: Viewport, dx: number): Viewport {
  return { span: viewport.span, start: clamp(viewport.start + dx, 0, 1 - viewport.span) };
}

/** Drag the thumb's right end by `dx`: the left edge stays, the span grows or shrinks. */
export function dragRightEdge(viewport: Viewport, dx: number): Viewport {
  return {
    start: viewport.start,
    span: clamp(viewport.span + dx, MIN_SPAN, 1 - viewport.start),
  };
}

/** Drag the thumb's left end by `dx`: the right edge stays, the span grows or shrinks. */
export function dragLeftEdge(viewport: Viewport, dx: number): Viewport {
  const end = viewport.start + viewport.span;
  const start = clamp(viewport.start + dx, 0, end - MIN_SPAN);
  return { start, span: end - start };
}

/**
 * Zoom by `factor` (above 1 zooms in) keeping the point at `anchor` (a fraction of the whole roll,
 * inside the view) at the same place within the view.
 */
export function zoomViewport(viewport: Viewport, factor: number, anchor: number): Viewport {
  const span = clamp(viewport.span / factor, MIN_SPAN, 1);
  const within = viewport.span > 0 ? (anchor - viewport.start) / viewport.span : 0.5;
  return { span, start: clamp(anchor - within * span, 0, 1 - span) };
}

/**
 * Dragging the thumb's body: sideways scrolls and up or down zooms (up zooms in), as in Bitwig's
 * overview bar. `dx` is a fraction of the track, `dy` is in px, and `pixelsPerStep` of dragging
 * is one zoom step.
 */
export function dragBodyAndZoom(
  viewport: Viewport,
  dx: number,
  dy: number,
  pixelsPerStep = 60
): Viewport {
  const zoomed =
    dy === 0
      ? viewport
      : zoomViewport(viewport, ZOOM_STEP ** (-dy / pixelsPerStep), viewport.start + viewport.span / 2);
  return dragBody(zoomed, dx);
}

/** The thumb's left and width in px along a track `trackWidth` wide, never thinner than `minThumb`. */
export function thumbGeometry(
  viewport: Viewport,
  trackWidth: number,
  minThumb = 24
): { left: number; width: number } {
  const width = Math.min(trackWidth, Math.max(minThumb, viewport.span * trackWidth));
  const left = viewport.start * trackWidth;
  return { left: Math.min(left, Math.max(0, trackWidth - width)), width };
}
