import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import {
  dragBody,
  dragBodyAndZoom,
  dragLeftEdge,
  dragRightEdge,
  thumbGeometry,
  zoomViewport,
  ZOOM_STEP,
  type Viewport,
} from '../rhythmRollZoom';
import classes from '../CompositionWorkbench.module.css';

type DragMode = 'body' | 'left' | 'right';

interface Drag {
  mode: DragMode;
  x: number;
  y: number;
  viewport: Viewport;
  trackWidth: number;
}

/** What the scroller shows, as fractions of its whole scrollable width. */
function viewportOf(element: HTMLElement): Viewport {
  const whole = element.scrollWidth || 1;
  const span = Math.min(1, Math.max(0, element.clientWidth / whole));
  return { span: span || 1, start: Math.min(1 - span, Math.max(0, element.scrollLeft / whole)) };
}

/**
 * A zoom bar in the style of Bitwig's overview bar, replacing the scroller's own scrollbar. The
 * thumb is the visible part of the roll: drag it sideways to scroll, drag it up or down to zoom
 * out or in, or drag either end to change how much is shown while the other end stays put. Click
 * the track to move there; arrow keys scroll and zoom. It reports every change as a `Viewport` and
 * leaves applying it (a new width and scroll position) to the caller.
 */
export function RollScrollbar({
  scroller,
  revision,
  onViewport,
}: {
  scroller: RefObject<HTMLElement | null>;
  /** Changes whenever the roll's width does, so the thumb is measured again. */
  revision: number;
  onViewport(viewport: Viewport): void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ start: 0, span: 1 });
  const [trackWidth, setTrackWidth] = useState(0);
  const [dragging, setDragging] = useState<DragMode | null>(null);

  const measure = useCallback(() => {
    const element = scroller.current;
    if (element) {
      setViewport(viewportOf(element));
    }
    if (trackRef.current) {
      setTrackWidth(trackRef.current.clientWidth);
    }
  }, [scroller]);

  useEffect(() => {
    const element = scroller.current;
    measure();
    if (!element) {
      return undefined;
    }
    element.addEventListener('scroll', measure, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(element);
    if (trackRef.current) {
      observer?.observe(trackRef.current);
    }
    return () => {
      element.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [scroller, measure, revision]);

  const thumb = thumbGeometry(viewport, trackWidth);

  function begin(mode: DragMode, event: PointerEvent<HTMLElement>) {
    event.stopPropagation();
    const element = scroller.current;
    if (!element || !trackRef.current) {
      return;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = {
      mode,
      x: event.clientX,
      y: event.clientY,
      viewport: viewportOf(element),
      trackWidth: trackRef.current.clientWidth || 1,
    };
    setDragging(mode);
  }

  function move(event: PointerEvent<HTMLElement>) {
    const state = drag.current;
    if (!state) {
      return;
    }
    const dx = (event.clientX - state.x) / state.trackWidth;
    const dy = event.clientY - state.y;
    onViewport(
      state.mode === 'body'
        ? dragBodyAndZoom(state.viewport, dx, dy)
        : state.mode === 'left'
          ? dragLeftEdge(state.viewport, dx)
          : dragRightEdge(state.viewport, dx)
    );
  }

  function end(event: PointerEvent<HTMLElement>) {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    drag.current = null;
    setDragging(null);
  }

  /** A click on the track moves the thumb there, centered on the click. */
  function clickTrack(event: PointerEvent<HTMLDivElement>) {
    const element = scroller.current;
    const track = trackRef.current;
    if (!element || !track || event.target !== event.currentTarget) {
      return;
    }
    const at = (event.clientX - track.getBoundingClientRect().left) / (track.clientWidth || 1);
    const current = viewportOf(element);
    onViewport(dragBody(current, at - current.span / 2 - current.start));
  }

  function key(event: KeyboardEvent<HTMLDivElement>) {
    const element = scroller.current;
    if (!element) {
      return;
    }
    const current = viewportOf(element);
    const centre = current.start + current.span / 2;
    let next: Viewport | undefined;
    switch (event.key) {
      case 'ArrowLeft':
        next = dragBody(current, -current.span * 0.1);
        break;
      case 'ArrowRight':
        next = dragBody(current, current.span * 0.1);
        break;
      case 'ArrowUp':
      case '+':
      case '=':
        next = zoomViewport(current, ZOOM_STEP, centre);
        break;
      case 'ArrowDown':
      case '-':
        next = zoomViewport(current, 1 / ZOOM_STEP, centre);
        break;
      case 'Home':
        next = dragBody(current, -1);
        break;
      case 'End':
        next = dragBody(current, 1);
        break;
      default:
        break;
    }
    if (next) {
      event.preventDefault();
      onViewport(next);
    }
  }

  return (
    <div
      ref={trackRef}
      className={classes.rollBar}
      role="scrollbar"
      aria-label="Scroll and zoom the rhythm roll"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(viewport.start * 100)}
      tabIndex={0}
      title="Drag the bar to scroll, drag it up or down to zoom, or drag its ends"
      onPointerDown={clickTrack}
      onKeyDown={key}
    >
      <div
        className={classes.rollBarThumb}
        data-dragging={dragging === 'body' || undefined}
        style={{ left: thumb.left, width: thumb.width }}
        onPointerDown={(event) => begin('body', event)}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <span
          className={classes.rollBarHandle}
          data-side="left"
          data-dragging={dragging === 'left' || undefined}
          onPointerDown={(event) => begin('left', event)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
        <span
          className={classes.rollBarHandle}
          data-side="right"
          data-dragging={dragging === 'right' || undefined}
          onPointerDown={(event) => begin('right', event)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
      </div>
    </div>
  );
}
