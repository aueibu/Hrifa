import { useEffect, useRef } from 'react';
import { isBarMove, reconcileBar, recordEmitted } from './scrollSync';
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
 */
export function HorizontalScrollbar({ range, scrollLeft, onScrollLeft }: HorizontalScrollbarProps) {
  const element = useRef<HTMLDivElement>(null);
  const emitted = useRef<number[]>([]);

  useEffect(() => {
    const strip = element.current;
    if (!strip) {
      return;
    }
    const result = reconcileBar(emitted.current, scrollLeft);
    emitted.current = result.emitted;
    if (result.write && isBarMove(strip.scrollLeft, scrollLeft)) {
      strip.scrollLeft = scrollLeft;
    }
  }, [scrollLeft, range]);

  return (
    <div
      ref={element}
      className={classes.bar}
      data-testid="roll-hscroll"
      aria-hidden="true"
      onScroll={(event) => {
        const next = event.currentTarget.scrollLeft;
        if (isBarMove(next, scrollLeft)) {
          emitted.current = recordEmitted(emitted.current, next);
          onScrollLeft(next);
        }
      }}
    >
      <div className={classes.spacer} style={{ width: `calc(100% + ${Math.max(0, range)}px)` }} />
    </div>
  );
}
