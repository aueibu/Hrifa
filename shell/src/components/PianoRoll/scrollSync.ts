/**
 * Horizontal scroll bookkeeping for a roll whose scrollbar is a separate element (`detachedScroll`).
 *
 * The roll's `view.scrollLeft` is the ONE source of truth. The bar is a controlled view of it: it
 * never writes back a value it only received, and its range is the roll's range by construction, so
 * there is no clamp mismatch to bounce on. These helpers hold the arithmetic so it can be tested.
 */

/** Differences under this many pixels are rounding noise, never a scroll. */
export const SCROLL_TOLERANCE = 1;

/** The furthest the timeline can scroll: its width less what is visible. Never negative. */
export function scrollRange(contentWidth: number, viewWidth: number): number {
  return Math.max(0, contentWidth - viewWidth);
}

/**
 * Keeps a scroll position inside [0, range]. An unmeasured view (width 0) has no known range, so
 * only the lower bound applies.
 */
export function clampScrollLeft(
  scrollLeft: number,
  contentWidth: number,
  viewWidth: number
): number {
  const lower = Math.max(0, scrollLeft);
  return viewWidth > 0 ? Math.min(lower, scrollRange(contentWidth, viewWidth)) : lower;
}

/** Whether a position the bar reports is a real move away from the roll's, rather than an echo. */
export function isBarMove(barValue: number, current: number): boolean {
  return Math.abs(barValue - current) > SCROLL_TOLERANCE;
}

/** The most bar-reported positions remembered while waiting for the roll to catch up. */
const MAX_EMITTED = 16;

/** Records a position the bar reported to the roll, oldest dropped past a small cap. */
export function recordEmitted(emitted: readonly number[], value: number): number[] {
  return [...emitted, value].slice(-MAX_EMITTED);
}

/**
 * The roll's `scrollLeft` changed. If the bar itself reported that position (or a later one the roll
 * has not yet rendered), the change came from the bar: the bar must not be written, or a fast drag
 * would be pulled back to a stale value. Otherwise the change came from elsewhere (wheel, zoom,
 * playhead follow): write the bar, and forget what it reported.
 */
export function reconcileBar(
  emitted: readonly number[],
  incoming: number
): { write: boolean; emitted: number[] } {
  const index = emitted.findIndex((value) => !isBarMove(value, incoming));
  if (index >= 0) {
    return { write: false, emitted: emitted.slice(index + 1) };
  }
  return { write: true, emitted: [] };
}

/** The most programmatic writes remembered while their scroll events may still be on the way. */
const MAX_WRITTEN = 16;

/** Records a position this component wrote into a scroller, oldest dropped past a small cap. */
export function recordWritten(written: readonly number[], value: number): number[] {
  return [...written, value].slice(-MAX_WRITTEN);
}

/**
 * Whether a scroll event reports a position this component wrote itself. Browsers fire the event a
 * frame after the write, so it can arrive after a newer view was applied: it is then an echo, not a
 * user move, and must not be reported (it would revert the newer position).
 */
export function isWrittenEcho(written: readonly number[], reported: number): boolean {
  return written.some((value) => !isBarMove(value, reported));
}

/** The most a native scrollbar is asked to scroll, in pixels (a clip can be far wider than a browser lays out). */
export const MAX_NATIVE_BAR_RANGE = 8_000_000;

/**
 * How many timeline pixels one native scrollbar pixel stands for: 1 up to `MAX_NATIVE_BAR_RANGE`,
 * then the ratio that brings the native range back to it (logical scrollLeft = native * ratio).
 */
export function barRatio(range: number): number {
  return Math.max(1, range / MAX_NATIVE_BAR_RANGE);
}
