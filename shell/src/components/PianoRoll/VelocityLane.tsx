import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { rollGridLines } from './grid';
import { PIANO_ROLL_KEYBOARD_WIDTH, type PianoRollGridLine, type PianoRollNote } from './model';
import { selectionId } from './selection';
import { velocityFillColor, velocityLevel as level } from './velocityFill';
import classes from './VelocityLane.module.css';

/** Room above and below the stems, so a pin at 0% or 100% is not cut off. */
const LANE_PAD = 8;
/** The lane's default drawing height, in pixels, and the range its splitter allows. */
export const VELOCITY_LANE_HEIGHT = 84;
export const MIN_VELOCITY_LANE_HEIGHT = 32;
export const MAX_VELOCITY_LANE_HEIGHT = 400;
/** The splitter's arrow keys move the lane by this many pixels. */
const KEY_STEP = 8;
/** A drag that moved the velocity less than this is a click. */
const MIN_CHANGE = 0.01;

export interface VelocityLaneProps {
  notes: PianoRollNote[];
  /** The roll's horizontal zoom and scroll, so the lane lines up with it. */
  pixelsPerQuarter: number;
  scrollLeft: number;
  /** The timeline length in quarter notes (the lane clips to its own width). */
  duration: number;
  selectedIds?: string[];
  collapsed?: boolean;
  onCollapsedChange?(collapsed: boolean): void;
  /**
   * Dragging a pin reports once, on release: the selection ids to change (the selection when the
   * pin is in it, otherwise that note alone) and one offset in velocity (0 to 1 range). Each note
   * ends at its own original value plus the offset, clamped.
   */
  onVelocityChange?(ids: string[], delta: number): void;
  /** The track's height in pixels (default `VELOCITY_LANE_HEIGHT`). */
  height?: number;
  /**
   * Opt-in splitter on the lane's top edge. Called once per resize (drag release, arrow key) with
   * the new height, and with null on a double-click (back to the default).
   */
  onHeightChange?(height: number | null): void;
  minHeight?: number;
  maxHeight?: number;
  /** The lane never grows past this fraction of `availableHeight` (when that is known). */
  maxFraction?: number;
  /**
   * The height of the whole panel the lane sits in (PianoRollLaneMetrics.panelHeight). The stored
   * `height` is clamped to the effective limit when drawn, and a drag starts from the clamped value.
   */
  availableHeight?: number;
  /**
   * The roll's vertical grid lines, drawn behind the stems at the same x (same bar and beat lines
   * and subdivision as the roll, from the same function). Pass the roll's `gridLines` and
   * `gridUnit`, and `viewWidth` (PianoRollScrollMetrics.viewWidth) so they run to the right edge.
   */
  /**
   * Velocity fill (opt-in, as on the roll): the stem and pin take the note's velocity fill (the
   * same function as the note: its color mixed toward the neutral, opaque), also
   * while a drag previews a new velocity.
   */
  velocityFill?: boolean;
  gridLines?: PianoRollGridLine[];
  gridUnit?: number;
  viewWidth?: number;
}

export interface VelocityLaneToggleProps {
  collapsed: boolean;
  onCollapsedChange?(collapsed: boolean): void;
}

/** The show/hide chevron. Alone it is the collapsed lane's whole footprint: an icon in the keys' gutter. */
export function VelocityLaneToggle({ collapsed, onCollapsedChange }: VelocityLaneToggleProps) {
  return (
    <button
      type="button"
      className={classes.toggle}
      aria-expanded={!collapsed}
      aria-label={collapsed ? 'Show velocity lane' : 'Hide velocity lane'}
      title={collapsed ? 'Show velocity lane (V)' : 'Hide velocity lane (V)'}
      onClick={() => onCollapsedChange?.(!collapsed)}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path
          d={collapsed ? 'M3 4.5 6 8l3-3.5' : 'M3 7.5 6 4l3 3.5'}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

interface Resize {
  startY: number;
  startHeight: number;
  limit: number;
}

interface Drag {
  noteId: string;
  ids: string[];
  startY: number;
  delta: number;
  base: number;
}

/**
 * A velocity lane to sit under a PianoRoll: one stem with a round pin on top per note, at the
 * note's start, as tall as its velocity and coloured like the note. It follows the roll's zoom and
 * scroll, collapses to its header, and a pin drags to set the note's velocity.
 */
export function VelocityLane({
  notes,
  pixelsPerQuarter,
  scrollLeft,
  duration,
  selectedIds = [],
  collapsed = false,
  onCollapsedChange,
  onVelocityChange,
  height = VELOCITY_LANE_HEIGHT,
  onHeightChange,
  minHeight = MIN_VELOCITY_LANE_HEIGHT,
  maxHeight = MAX_VELOCITY_LANE_HEIGHT,
  maxFraction = 0.5,
  availableHeight = 0,
  gridLines,
  gridUnit,
  viewWidth = 0,
  velocityFill = false,
}: VelocityLaneProps) {
  const resize = useRef<Resize | null>(null);
  const [liveHeight, setLiveHeight] = useState<number | null>(null);
  // The same timeline the roll draws: at least its duration and at least the visible width.
  const visibleQuarters = Math.max(Math.max(1, duration), viewWidth / pixelsPerQuarter);
  const grid = gridLines
    ? rollGridLines(gridLines, gridUnit, visibleQuarters, pixelsPerQuarter)
    : [];
  // The most the lane may take: a fraction of the panel, within the splitter's own bounds.
  const limit = Math.max(
    minHeight,
    Math.min(maxHeight, availableHeight > 0 ? Math.floor(availableHeight * maxFraction) : maxHeight)
  );
  // A stored height from a taller panel is clamped here, so what is drawn is always reachable.
  const effectiveHeight = clampHeight(height, limit);
  const trackHeight = liveHeight ?? effectiveHeight;
  const span = trackHeight - 2 * LANE_PAD;
  const drag = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<{ ids: ReadonlySet<string>; delta: number } | null>(null);
  const [readout, setReadout] = useState<{ id: string; text: string } | null>(null);
  const selected = new Set(selectedIds);

  function begin(note: PianoRollNote, event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0 || !onVelocityChange) {
      return;
    }
    event.stopPropagation();
    const id = selectionId(note);
    const current: Drag = {
      noteId: note.id,
      ids: selected.has(id) ? [...selectedIds] : [id],
      startY: event.clientY,
      delta: 0,
      base: level(note.velocity),
    };
    drag.current = current;
    setPreview({ ids: new Set(current.ids), delta: 0 });
    setReadout({ id: note.id, text: `${Math.round(current.base * 100)}%` });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function move(event: ReactPointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current) {
      return;
    }
    // The anchor pin follows the pointer and the rest of the group moves by the same offset.
    // The offset is clamped to [-1, 1] on its own, so a note that bottomed out at 0 does not stop the
    // others; each note clamps itself, and only the anchor's readout is clamped for display.
    current.delta = Math.min(1, Math.max(-1, -(event.clientY - current.startY) / span));
    const wanted = Math.min(1, Math.max(0, current.base + current.delta));
    setPreview({ ids: new Set(current.ids), delta: current.delta });
    setReadout({ id: current.noteId, text: `${Math.round(wanted * 100)}%` });
  }

  function finish(event: ReactPointerEvent<HTMLElement>) {
    const current = drag.current;
    if (!current) {
      return;
    }
    move(event);
    drag.current = null;
    setPreview(null);
    setReadout(null);
    if (Math.abs(current.delta) >= MIN_CHANGE) {
      onVelocityChange?.(current.ids, current.delta);
    }
  }

  function cancel() {
    drag.current = null;
    setPreview(null);
    setReadout(null);
  }

  function clampHeight(value: number, cap: number) {
    return Math.min(cap, Math.max(minHeight, Math.round(value)));
  }

  function beginResize(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0 || !onHeightChange) {
      return;
    }
    event.preventDefault();
    resize.current = { startY: event.clientY, startHeight: effectiveHeight, limit };
    setLiveHeight(effectiveHeight);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  // Dragging up grows the lane.
  function heightAt(clientY: number, current: Resize) {
    return clampHeight(current.startHeight - (clientY - current.startY), current.limit);
  }

  function moveResize(event: ReactPointerEvent<HTMLElement>) {
    const current = resize.current;
    if (current) {
      setLiveHeight(heightAt(event.clientY, current));
    }
  }

  function endResize(event: ReactPointerEvent<HTMLElement>) {
    const current = resize.current;
    if (!current) {
      return;
    }
    resize.current = null;
    setLiveHeight(null);
    const next = heightAt(event.clientY, current);
    if (next !== current.startHeight) {
      onHeightChange?.(next);
    }
  }

  /** Cancel or lost capture: the lane goes back to the height the drag started from. */
  function cancelResize() {
    resize.current = null;
    setLiveHeight(null);
  }

  const resizing = liveHeight !== null;
  useEffect(() => {
    if (!resizing) {
      return undefined;
    }
    // Capture phase on the window, and stopped there: Escape during a drag cancels only the drag, so
    // it never reaches the roll's own Escape (which would clear the selection).
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        event.preventDefault();
        resize.current = null;
        setLiveHeight(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [resizing]);

  function splitterKey(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
      return;
    }
    event.preventDefault();
    const step = event.key === 'ArrowUp' ? KEY_STEP : -KEY_STEP;
    const next = clampHeight(effectiveHeight + step, limit);
    if (next !== effectiveHeight) {
      onHeightChange?.(next);
    }
  }

  return (
    <div className={classes.wrapper}>
      {!collapsed && onHeightChange && (
        <div
          className={classes.splitter}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize velocity lane"
          aria-valuemin={minHeight}
          aria-valuemax={limit}
          aria-valuenow={trackHeight}
          tabIndex={0}
          data-dragging={resizing || undefined}
          onPointerDown={beginResize}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={cancelResize}
          onLostPointerCapture={cancelResize}
          onDoubleClick={() => onHeightChange(null)}
          onKeyDown={splitterKey}
        />
      )}
      <div className={classes.lane} data-collapsed={collapsed || undefined}>
        <div className={classes.header} style={{ width: PIANO_ROLL_KEYBOARD_WIDTH }}>
          <VelocityLaneToggle collapsed={collapsed} onCollapsedChange={onCollapsedChange} />
          {!collapsed && <span className={classes.label}>Velocity</span>}
        </div>
        {!collapsed && (
          <div
            className={classes.track}
            role="group"
            aria-label="Velocity lane"
            style={{ height: trackHeight }}
          >
            <div
              className={classes.content}
              style={{
                width: Math.max(1, visibleQuarters * pixelsPerQuarter),
                transform: `translateX(${-scrollLeft}px)`,
              }}
            >
              {grid.map((line) => (
                <span
                  key={`grid:${line.at}:${line.kind}`}
                  className={classes.timeLine}
                  data-testid="velocity-grid-line"
                  data-kind={line.kind}
                  data-subdivision={line.subdivision || undefined}
                  style={{ left: line.at * pixelsPerQuarter }}
                />
              ))}
              {notes.map((note) => {
                const id = selectionId(note);
                const shifted = preview?.ids.has(id) ? preview.delta : 0;
                const velocity = Math.min(1, Math.max(0, level(note.velocity) + shifted));
                const baseColor = note.color ?? 'var(--mantine-primary-color-filled)';
                const top = LANE_PAD + (1 - velocity) * span;
                return (
                  <div
                    key={note.id}
                    className={classes.stem}
                    data-testid="velocity-stem"
                    data-note={note.id}
                    style={
                      {
                        left: note.start * pixelsPerQuarter,
                        top,
                        height: trackHeight - top,
                        '--stem-color': baseColor,
                        ...(velocityFill
                          ? {
                              '--stem-fill': velocityFillColor(baseColor, velocity),
                            }
                          : {}),
                      } as CSSProperties
                    }
                  >
                    <span
                      className={classes.pin}
                      data-testid="velocity-pin"
                      data-note={note.id}
                      data-selected={selected.has(id) || undefined}
                      data-velocity={velocity.toFixed(3)}
                      title={`${note.label} · ${Math.round(velocity * 100)}%`}
                      onPointerDown={(event) => begin(note, event)}
                      onPointerMove={move}
                      onPointerUp={finish}
                      onPointerCancel={cancel}
                      onLostPointerCapture={cancel}
                    />
                    {readout?.id === note.id && (
                      <span className={classes.readout} data-testid="velocity-lane-readout">
                        {readout.text}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
