/**
 * Where a roll's horizontal content is positioned, so no element sits beyond what a browser lays
 * out reliably (Chrome stops near 33 M px, Firefox near 18 M px; a 72000-bar clip at full zoom is
 * 55 M px wide).
 *
 * A timeline up to `SAFE_TIMELINE_WIDTH` is laid out whole, as it always was. A longer one is
 * windowed: the content layer starts at an `origin` (a multiple of `ORIGIN_STEP` at or below the
 * scroll position), is only as wide as the window needs, and holds only what falls in `from..to`
 * (pixels, in timeline coordinates). Everything inside is positioned relative to the origin, so no
 * coordinate passes about `ORIGIN_STEP + 3` view widths however long the clip is. The owner's
 * `scrollLeft` stays in timeline coordinates; only the native scroller works relative to the origin.
 */

/** Timelines up to this many pixels are laid out whole. */
export const SAFE_TIMELINE_WIDTH = 4_000_000;
/** The origin moves in steps of this many pixels, so it changes rarely while scrolling. */
export const ORIGIN_STEP = 2_000_000;
/** No element is positioned beyond this many pixels from its layer's start. */
export const POSITION_BOUND = 10_000_000;
/** The width assumed for a view that has not been measured yet. */
const UNMEASURED_WIDTH = 1200;

export interface TimelineLayout {
  /** True when the timeline is windowed. */
  windowed: boolean;
  /** Pixels (timeline coordinates) at the content layer's left edge. */
  origin: number;
  /** The content layer's width in pixels. */
  width: number;
  /** The pixel range (timeline coordinates) that is drawn. */
  from: number;
  to: number;
}

export function timelineLayout(
  scrollLeft: number,
  viewWidth: number,
  timelineWidth: number
): TimelineLayout {
  if (timelineWidth <= SAFE_TIMELINE_WIDTH) {
    return { windowed: false, origin: 0, width: timelineWidth, from: 0, to: timelineWidth };
  }
  const view = viewWidth > 0 ? viewWidth : UNMEASURED_WIDTH;
  const left = Math.max(0, Math.min(scrollLeft, timelineWidth));
  const origin = Math.floor(left / ORIGIN_STEP) * ORIGIN_STEP;
  const width = Math.max(1, Math.min(timelineWidth - origin, ORIGIN_STEP + 3 * view));
  return {
    windowed: true,
    origin,
    width,
    from: Math.max(origin, left - view),
    to: Math.min(origin + width, left + 2 * view),
  };
}

/**
 * A horizontal span (timeline pixels) as the layer positions it: relative to the origin and cut to
 * the drawn range, or null when none of it is drawn. A whole-laid-out timeline returns it as given.
 */
export function layerSpan(
  layout: TimelineLayout,
  left: number,
  width = 0
): { left: number; width: number } | null {
  if (!layout.windowed) {
    return { left, width };
  }
  const right = left + width;
  if (right < layout.from || left > layout.to) {
    return null;
  }
  const start = Math.max(left, layout.from);
  return { left: start - layout.origin, width: Math.min(right, layout.to) - start };
}
