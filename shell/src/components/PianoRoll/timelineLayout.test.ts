import { describe, expect, it } from 'vitest';
import { barRatio, MAX_NATIVE_BAR_RANGE } from './scrollSync';
import {
  layerSpan,
  ORIGIN_STEP,
  POSITION_BOUND,
  SAFE_TIMELINE_WIDTH,
  timelineLayout,
} from './timelineLayout';

describe('timelineLayout', () => {
  it('lays a timeline up to the safe width out whole, as before', () => {
    const layout = timelineLayout(5000, 800, SAFE_TIMELINE_WIDTH);
    expect(layout).toMatchObject({ windowed: false, origin: 0, width: SAFE_TIMELINE_WIDTH });
    expect(layerSpan(layout, 123, 456)).toEqual({ left: 123, width: 456 });
  });

  it('keeps every position under the bound for 72000 bars at any zoom and scroll', () => {
    for (const zoom of [0.25, 16, 64, 192]) {
      const width = 72_000 * 4 * zoom;
      for (const share of [0, 0.25, 0.5, 0.999, 1]) {
        for (const view of [0, 500, 1920, 4000]) {
          const layout = timelineLayout(share * width, view, width);
          if (width <= SAFE_TIMELINE_WIDTH) {
            expect(layout.windowed).toBe(false);
            continue;
          }
          expect(layout.windowed).toBe(true);
          expect(layout.origin % ORIGIN_STEP).toBe(0);
          expect(layout.width).toBeLessThan(POSITION_BOUND);
          expect(layout.to - layout.origin).toBeLessThan(POSITION_BOUND);
          expect(layout.from).toBeGreaterThanOrEqual(layout.origin);
          // The visible range is always inside the drawn range.
          const left = Math.min(share * width, width);
          expect(layout.from).toBeLessThanOrEqual(left + 1e-6);
          expect(layout.to).toBeGreaterThanOrEqual(Math.min(left + (view || 1200), width) - 1e-6);
        }
      }
    }
  });

  it('cuts spans to the drawn range, relative to the origin, and drops the rest', () => {
    const width = 50_000_000;
    const layout = timelineLayout(30_000_000, 1000, width);
    expect(layout.origin).toBe(30_000_000);
    expect(layerSpan(layout, 100, 10)).toBeNull();
    expect(layerSpan(layout, 49_000_000, 10)).toBeNull();
    const near = layerSpan(layout, 30_000_100, 50)!;
    expect(near).toEqual({ left: 100, width: 50 });
    // A note spanning the whole clip is cut to the window, not 50 M px wide.
    const long = layerSpan(layout, 0, width)!;
    expect(long.left).toBeGreaterThanOrEqual(0);
    expect(long.width).toBeLessThan(POSITION_BOUND);
  });
});

describe('barRatio', () => {
  it('is 1 while the range is native-sized and scales the range down past it', () => {
    expect(barRatio(1000)).toBe(1);
    expect(barRatio(MAX_NATIVE_BAR_RANGE)).toBe(1);
    expect(barRatio(55_000_000) * 1).toBeCloseTo(55_000_000 / MAX_NATIVE_BAR_RANGE, 9);
    expect(55_000_000 / barRatio(55_000_000)).toBeCloseTo(MAX_NATIVE_BAR_RANGE, 3);
  });
});
