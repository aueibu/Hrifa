import { useEffect, useSyncExternalStore, type RefObject } from 'react';
import { useAudioEngine } from '../audio/AudioEngineProvider';

/**
 * Where to scroll to follow a playhead as a DAW does: the view stays at the start while the playhead
 * travels the first half of it, then scrolls so the playhead stays in the middle, and stops at the
 * end of the content so the playhead can run on to the right edge.
 */
export function followScrollLeft({
  playheadX,
  viewWidth,
  contentWidth,
}: {
  playheadX: number;
  viewWidth: number;
  contentWidth: number;
}): number {
  const maximum = Math.max(0, contentWidth - viewWidth);
  return Math.min(maximum, Math.max(0, playheadX - viewWidth / 2));
}

/**
 * Page-style follow, as the piano roll does it: nothing moves while the playhead is inside the view;
 * once it nears the right edge (within `margin`) or is before the view, the view jumps so the
 * playhead sits just inside the left edge. Far less motion than centered follow.
 */
export function pageScrollLeft({
  playheadX,
  scrollLeft,
  viewWidth,
  contentWidth,
  margin = 24,
  lead = 40,
}: {
  playheadX: number;
  scrollLeft: number;
  viewWidth: number;
  contentWidth: number;
  margin?: number;
  lead?: number;
}): number | undefined {
  if (playheadX >= scrollLeft && playheadX <= scrollLeft + viewWidth - margin) {
    return undefined;
  }
  const maximum = Math.max(0, contentWidth - viewWidth);
  return Math.min(maximum, Math.max(0, playheadX - lead));
}

export type FollowMode = 'off' | 'page' | 'center';

/**
 * Renders nothing. While `active`, it follows its module's preview clock and scrolls `scroller` so
 * the playhead stays centered once it reaches the middle (see `followScrollLeft`). Every row of the rhythm diagram shares one pulse scale, so a position
 * in pulses is the same fraction of the scrolling width on every row. Only this component works
 * each frame, not the module around it.
 */
export function FollowPlayhead({
  scroller,
  sourceId,
  unitSeconds,
  length,
  cyclic,
  active,
  mode,
}: {
  scroller: RefObject<HTMLElement | null>;
  /** The module instance whose preview drives it. */
  sourceId: string;
  /** Seconds per pulse. */
  unitSeconds: number;
  /** The diagram's length in pulses (the longest row). */
  length: number;
  /** In a loop, the playhead wraps at `length`. */
  cyclic: boolean;
  active: boolean;
  /** `center` scrolls continuously to keep the playhead in the middle; `page` jumps when it nears the edge. */
  mode: Exclude<FollowMode, 'off'>;
}) {
  const engine = useAudioEngine();
  const clock = useSyncExternalStore(
    (listener) => engine.subscribe(listener),
    () => engine.clock(sourceId)?.startedAtMs
  );

  useEffect(() => {
    if (!active || clock === undefined || !(unitSeconds > 0) || !(length > 0)) {
      return undefined;
    }
    let frame = requestAnimationFrame(function tick(time) {
      const element = scroller.current;
      const units = (time - clock) / 1000 / unitSeconds;
      if (element && units >= 0 && (cyclic || units <= length)) {
        const position = cyclic ? units % length : units;
        const playheadX = (position / length) * element.scrollWidth;
        const target =
          mode === 'center'
            ? followScrollLeft({
                playheadX,
                viewWidth: element.clientWidth,
                contentWidth: element.scrollWidth,
              })
            : pageScrollLeft({
                playheadX,
                scrollLeft: element.scrollLeft,
                viewWidth: element.clientWidth,
                contentWidth: element.scrollWidth,
              });
        if (target !== undefined && Math.abs(element.scrollLeft - target) >= 0.5) {
          element.scrollLeft = target;
        }
      }
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, clock, unitSeconds, length, cyclic, scroller, mode]);

  return null;
}
