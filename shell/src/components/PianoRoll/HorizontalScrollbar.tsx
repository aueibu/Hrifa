import { useLayoutEffect, useRef } from 'react';
import {
  barRatio,
  isBarMove,
  isWrittenEcho,
  reconcileBar,
  recordEmitted,
  recordWritten,
} from './scrollSync';
import classes from './HorizontalScrollbar.module.css';

export interface HorizontalScrollbarProps {
  /**
   * The furthest the timeline can scroll (`scrollRange`): the bar's own range, whatever its width,
   * so its end is exactly the roll's end.
   */
  range: number;
  scrollLeft: number;
  onScrollLeft(scrollLeft: number): void;
}

/**
 * A native horizontal scrollbar drawn on its own, for a PianoRoll in `detachedScroll` mode. It is
 * controlled by the roll's `scrollLeft` (the single source of truth): the spacer is one visible
 * width plus `range`, so the bar scrolls exactly `range` pixels. It reports only moves the user made
 * and never writes a position it reported itself, so there is no echo and no snap-back.
 *
 * A range past what a browser scrolls natively is scaled down (see barRatio): the native bar covers at
 * most 8 M px and one native pixel stands for `ratio` timeline pixels (logical = native * ratio).
 * Everything the bar compares or remembers is native, so a roll move smaller than a native pixel
 * writes nothing and the bar can never feed it back.
 */
export function HorizontalScrollbar({ range, scrollLeft, onScrollLeft }: HorizontalScrollbarProps) {
  const element = useRef<HTMLDivElement>(null);
  const emitted = useRef<number[]>([]);
  const ratio = barRatio(range);
  const emittedRatio = useRef(ratio);
  // Native positions written here (or imposed by the browser when the spacer shrank): a scroll event
  // reporting one of them, however late, is an echo and never a user move.
  const written = useRef<number[]>([]);
  const lastRange = useRef<number | null>(null);
  const nativeRange = Math.max(0, range) / ratio;
  const nativeLeft = scrollLeft / ratio;

  // A layout effect: the write lands before paint, so a following wheel event sees it settled.
  useLayoutEffect(() => {
    const strip = element.current;
    if (!strip) {
      return;
    }
    // Remembered positions are native pixels of the previous ratio: they mean nothing now.
    if (emittedRatio.current !== ratio) {
      emittedRatio.current = ratio;
      emitted.current = [];
      written.current = [];
    }
    // The browser clamps a bar whose spacer just shrank: that position is not the user's either.
    if (lastRange.current !== null && nativeRange < lastRange.current) {
      written.current = recordWritten(written.current, strip.scrollLeft);
    }
    lastRange.current = nativeRange;
    const result = reconcileBar(emitted.current, nativeLeft);
    emitted.current = result.emitted;
    if (result.write && isBarMove(strip.scrollLeft, nativeLeft)) {
      strip.scrollLeft = nativeLeft;
      written.current = recordWritten(written.current, nativeLeft);
    }
  }, [nativeLeft, nativeRange, ratio]);

  return (
    <div
      ref={element}
      className={classes.bar}
      data-testid="roll-hscroll"
      aria-hidden="true"
      onScroll={(event) => {
        const next = event.currentTarget.scrollLeft;
        if (isWrittenEcho(written.current, next)) {
          return;
        }
        if (isBarMove(next, nativeLeft)) {
          written.current = [];
          emitted.current = recordEmitted(emitted.current, next);
          onScrollLeft(next * ratio);
        }
      }}
    >
      <div className={classes.spacer} style={{ width: `calc(100% + ${nativeRange}px)` }} />
    </div>
  );
}
