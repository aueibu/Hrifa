import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { gridWindow, rollGridLines } from './grid';
import { adaptiveSubdivision } from './gridDensity';
import {
  PIANO_ROLL_KEYBOARD_WIDTH,
  type PianoRollGridLine,
  type PianoRollGridSource,
  type PianoRollNote,
} from './model';
import { marqueeSelection, selectionId, type PixelRect } from './selection';
import { layerSpan, timelineLayout } from './timelineLayout';
import { velocityFillColor, velocityLevel as level } from './velocityFill';
import {
  curveFromDrag,
  LANE_PAD,
  laneHeads,
  laneRect,
  pencilSample,
  percentAtY,
  PIN_RADIUS,
  pinsInRect,
  rampHeads,
  rampValues,
  snapSpan,
  velocityY,
  type LanePoint,
  type RampPoint,
  type VelocityRamp,
} from './velocityLaneTools';
import classes from './VelocityLane.module.css';

/** The lane's default drawing height, in pixels, and the range its splitter allows. */
export const VELOCITY_LANE_HEIGHT = 84;
export const MIN_VELOCITY_LANE_HEIGHT = 32;
export const MAX_VELOCITY_LANE_HEIGHT = 400;
/** The splitter's arrow keys move the lane by this many pixels. */
const KEY_STEP = 8;
/** A drag that moved the velocity less than this is a click. */
const MIN_CHANGE = 0.01;
/** A press that moves less than this (pixels) is a click. */
const DRAG_PIXELS = 4;
/** The tools under which a pin still drags its velocity (Pointer, and Eraser/Knife, which do nothing else here). */
const PIN_TOOLS = new Set(['pointer', 'eraser', 'knife']);

interface LaneRange {
  start: number;
  end: number;
}

export interface VelocityLaneProps {
  notes: PianoRollNote[];
  /** The roll's horizontal zoom and scroll, so the lane lines up with it. */
  pixelsPerQuarter: number;
  scrollLeft: number;
  /** The timeline length in quarter notes (the lane clips to its own width). */
  duration: number;
  selectedIds?: string[];
  /** The selected time span (quarter notes), drawn as a band over the lane like the roll's. Opt-in. */
  selectedRange?: { start: number; end: number } | null;
  collapsed?: boolean;
  onCollapsedChange?(collapsed: boolean): void;
  /**
   * Dragging a pin reports once, on release: the selection ids to change (the selection when the
   * pin is in it, otherwise that note alone) and one offset in velocity (0 to 1 range). Each note
   * ends at its own original value plus the offset, clamped.
   */
  onVelocityChange?(ids: string[], delta: number): void;
  /**
   * The roll's active tool (default: Pointer). Pointer box-selects pins, Time selects (and moves) a
   * time span, Pencil draws velocities, Paint ramps them; Eraser and Knife do nothing in the lane.
   * Each tool is opt-in through its callbacks below.
   */
  tool?: string;
  /** Selection ids (note ids; a chord is one id), as the roll reports them. */
  onSelectionChange?(ids: string[]): void;
  /** Reported when a Time-tool drag ends, like the roll's `onMarqueeRange` (always `timeOnly`). */
  onMarqueeRange?(range: LaneRange, timeOnly: boolean, additive?: boolean): void;
  /** Dragging the time band's content (Time tool), reported once on release like the roll's. */
  onMoveTimeRange?(
    range: LaneRange,
    delta: number,
    options?: { copy?: boolean; merge?: boolean }
  ): void;
  /** Pencil: absolute velocities (0 to 1) by note id, reported once on release. */
  onSetVelocities?(values: Record<string, number>): void;
  /** The active velocity ramp (a secondary selection), drawn as a dashed line; the owner keeps it. */
  ramp?: VelocityRamp | null;
  /**
   * Paint can: a ramp was made (on release) or re-curved (Alt + right-button drag, on release), with
   * the absolute velocities it writes by note id. Each report is one edit.
   */
  onRamp?(ramp: VelocityRamp, values: Record<string, number>): void;
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
  gridLines?: PianoRollGridLine[] | PianoRollGridSource;
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

type LaneGesture =
  | { kind: 'marquee'; start: LanePoint; additive: boolean; moved: boolean }
  | { kind: 'time'; startX: number; additive: boolean; moved: boolean }
  | {
      kind: 'timeMove';
      range: LaneRange;
      startX: number;
      moved: boolean;
      copy: boolean;
      merge: boolean;
    }
  | { kind: 'pencil'; last: LanePoint; values: Map<string, number> }
  | { kind: 'paint'; start: LanePoint; startPercent: number }
  | { kind: 'curve'; startY: number; startCurve: number; curve: number };

/** What the lane draws while a tool gesture runs (empty while the press has not moved yet). */
interface Live {
  marquee?: PixelRect;
  marqueeIds?: string[];
  /** The time span being selected, or the moved span (`moveRange` is where the move started). */
  timeRange?: LaneRange;
  moveRange?: LaneRange;
  /** Velocities previewed on the stems, by note id. */
  values?: Map<string, number>;
  /** The ramp's points (timeline pixels) for the dashed line. */
  line?: RampPoint[];
  /** Readouts in lane coordinates (timeline x, y from the track's top). */
  readouts?: Array<{ x: number; y: number; text: string }>;
}

interface Drag {
  noteId: string;
  ids: string[];
  startY: number;
  delta: number;
  base: number;
}

const percentText = (value: number) => `${Math.round(value * 100)}%`;

/**
 * A velocity lane to sit under a PianoRoll: one stem with a round pin on top per note, at the
 * note's start, as tall as its velocity and coloured like the note. It follows the roll's zoom and
 * scroll, collapses to its header, and a pin drags to set the note's velocity. It shares the roll's
 * tool: Pointer box-selects pins, Time selects and moves a span, Pencil draws velocities and Paint
 * ramps them (see the tool props).
 */
export function VelocityLane({
  notes,
  pixelsPerQuarter,
  scrollLeft,
  duration,
  selectedIds = [],
  selectedRange,
  collapsed = false,
  onCollapsedChange,
  onVelocityChange,
  tool,
  onSelectionChange,
  onMarqueeRange,
  onMoveTimeRange,
  onSetVelocities,
  ramp,
  onRamp,
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
  // A timeline too wide to lay out whole is windowed exactly as the roll above it (timelineLayout.ts).
  const layout = timelineLayout(scrollLeft, viewWidth, visibleQuarters * pixelsPerQuarter);
  const rangeSpan =
    selectedRange && selectedRange.end > selectedRange.start
      ? layerSpan(
          layout,
          selectedRange.start * pixelsPerQuarter,
          (selectedRange.end - selectedRange.start) * pixelsPerQuarter
        )
      : null;
  const grid = useMemo(
    () =>
      gridLines
        ? rollGridLines(
            gridLines,
            gridUnit,
            visibleQuarters,
            pixelsPerQuarter,
            gridWindow(scrollLeft, viewWidth, pixelsPerQuarter, visibleQuarters)
          )
        : [],
    [gridLines, gridUnit, visibleQuarters, pixelsPerQuarter, scrollLeft, viewWidth]
  );
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
  const activeTool = tool ?? 'pointer';
  const trackRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<LaneGesture | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  // The browser's context menu is suppressed only for the Alt + right-button curve gesture.
  const suppressMenu = useRef(false);
  const snapUnit = gridUnit ?? adaptiveSubdivision(pixelsPerQuarter);
  /** Every head (one per note id), in timeline pixels. */
  const heads = useMemo(() => laneHeads(notes, pixelsPerQuarter), [notes, pixelsPerQuarter]);

  /** A pointer in lane coordinates: timeline x (the window origin added, as the roll does) and y from the track's top. */
  function laneAt(event: { clientX: number; clientY: number }): LanePoint {
    const content = contentRef.current?.getBoundingClientRect();
    const track = trackRef.current?.getBoundingClientRect();
    return {
      x: event.clientX - (content?.left ?? 0) + layout.origin,
      y: event.clientY - (track?.top ?? 0),
    };
  }

  function insideBand(x: number) {
    return (
      !!selectedRange &&
      selectedRange.end > selectedRange.start &&
      x >= selectedRange.start * pixelsPerQuarter &&
      x <= selectedRange.end * pixelsPerQuarter
    );
  }

  /** The live picture of a ramp: its values on the stems, the dashed line and a readout at each end. */
  function rampLive(points: RampPoint[], extra: Live = {}): Live {
    const ends = points.length > 1 ? [points[0], points[points.length - 1]] : points.slice(0, 1);
    return {
      ...extra,
      values: new Map(points.map((point) => [point.id, point.value])),
      line: points,
      readouts: [
        ...ends.map((point) => ({
          x: point.x,
          y: velocityY(point.value, trackHeight),
          text: percentText(point.value),
        })),
        ...(extra.readouts ?? []),
      ],
    };
  }

  function endGesture() {
    gesture.current = null;
    setLive(null);
  }

  function sample(current: Extract<LaneGesture, { kind: 'pencil' }>, point: LanePoint) {
    pencilSample(heads, current.last, point, trackHeight).forEach((value, id) =>
      current.values.set(id, value)
    );
    current.last = point;
  }

  function paintPoints(current: Extract<LaneGesture, { kind: 'paint' }>, point: LanePoint) {
    return rampValues(
      rampHeads(heads, current.start.x, point.x, PIN_RADIUS),
      current.startPercent,
      percentAtY(point.y, trackHeight)
    );
  }

  /** A ramp's points at this zoom (its stored x are quarter notes), re-applied from its originals. */
  function rampPoints(source: VelocityRamp, curve: number): RampPoint[] {
    return rampValues(
      source.heads.map((head) => ({ ...head, x: head.x * pixelsPerQuarter })),
      source.start,
      source.end,
      curve
    );
  }

  function moveDelta(current: Extract<LaneGesture, { kind: 'timeMove' }>, x: number) {
    // Time only, on the grid, and the span never starts before 0.
    return Math.max(
      Math.round((x - current.startX) / pixelsPerQuarter / snapUnit) * snapUnit,
      -current.range.start
    );
  }

  function modeText(current: { copy: boolean; merge: boolean }) {
    return [current.copy ? 'Copy' : null, current.merge ? 'Merge' : null]
      .filter(Boolean)
      .join(' + ');
  }

  /** The ids of every note overlapping a span, an edge touch included (the roll's rule), once each. */
  function idsOverlapping(range: LaneRange) {
    const ids = notes
      .filter(
        (note) => note.start + note.duration >= range.start - 1e-9 && note.start <= range.end + 1e-9
      )
      .map(selectionId);
    return ids.filter((id, index) => ids.indexOf(id) === index);
  }

  function beginTrack(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button === 2) {
      // Alt + right button on an active ramp curves it; any other right press is left alone.
      if (event.altKey && ramp && activeTool === 'paint' && onRamp) {
        event.preventDefault();
        event.stopPropagation();
        suppressMenu.current = true;
        gesture.current = {
          kind: 'curve',
          startY: event.clientY,
          startCurve: ramp.curve,
          curve: ramp.curve,
        };
        const point = laneAt(event);
        setLive(
          rampLive(rampPoints(ramp, ramp.curve), {
            readouts: [{ x: point.x, y: point.y, text: `Curve ${ramp.curve.toFixed(1)}` }],
          })
        );
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
      return;
    }
    suppressMenu.current = false;
    if (event.button !== 0) {
      return;
    }
    const point = laneAt(event);
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    if (activeTool === 'pointer' && onSelectionChange) {
      gesture.current = { kind: 'marquee', start: point, additive, moved: false };
      setLive({});
    } else if (activeTool === 'time' && (onMarqueeRange || onMoveTimeRange || onSelectionChange)) {
      if (onMoveTimeRange && selectedRange && insideBand(point.x)) {
        gesture.current = {
          kind: 'timeMove',
          range: { ...selectedRange },
          startX: point.x,
          moved: false,
          copy: event.ctrlKey || event.metaKey,
          merge: event.altKey,
        };
      } else {
        gesture.current = { kind: 'time', startX: point.x, additive, moved: false };
      }
      setLive({});
    } else if (activeTool === 'pencil' && onSetVelocities) {
      const values = pencilSample(heads, null, point, trackHeight);
      gesture.current = { kind: 'pencil', last: point, values };
      setLive({
        values: new Map(values),
        readouts: [{ x: point.x, y: point.y, text: percentText(percentAtY(point.y, trackHeight)) }],
      });
    } else if (activeTool === 'paint' && onRamp) {
      const startPercent = percentAtY(point.y, trackHeight);
      gesture.current = { kind: 'paint', start: point, startPercent };
      setLive(
        rampLive(
          rampValues(rampHeads(heads, point.x, point.x, PIN_RADIUS), startPercent, startPercent)
        )
      );
    } else {
      return;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveTrack(event: ReactPointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current) {
      return;
    }
    const point = laneAt(event);
    if (current.kind === 'marquee') {
      if (
        !current.moved &&
        Math.hypot(point.x - current.start.x, point.y - current.start.y) < DRAG_PIXELS
      ) {
        return;
      }
      current.moved = true;
      const rect = laneRect(current.start, point);
      setLive({
        marquee: rect,
        marqueeIds: marqueeSelection(
          selectedIds,
          pinsInRect(heads, rect, trackHeight),
          current.additive
        ),
      });
    } else if (current.kind === 'time') {
      if (!current.moved && Math.abs(point.x - current.startX) < DRAG_PIXELS) {
        return;
      }
      current.moved = true;
      setLive({ timeRange: snapSpan(current.startX, point.x, pixelsPerQuarter, snapUnit) });
    } else if (current.kind === 'timeMove') {
      current.copy = event.ctrlKey || event.metaKey;
      current.merge = event.altKey;
      if (!current.moved && Math.abs(point.x - current.startX) < DRAG_PIXELS) {
        return;
      }
      current.moved = true;
      const delta = moveDelta(current, point.x);
      setLive({
        moveRange: current.range,
        timeRange: { start: current.range.start + delta, end: current.range.end + delta },
        readouts:
          current.copy || current.merge
            ? [{ x: point.x, y: point.y, text: modeText(current) }]
            : [],
      });
    } else if (current.kind === 'pencil') {
      sample(current, point);
      setLive({
        values: new Map(current.values),
        readouts: [{ x: point.x, y: point.y, text: percentText(percentAtY(point.y, trackHeight)) }],
      });
    } else if (current.kind === 'paint') {
      setLive(rampLive(paintPoints(current, point)));
    } else if (ramp) {
      current.curve = curveFromDrag(current.startCurve, event.clientY - current.startY);
      setLive(
        rampLive(rampPoints(ramp, current.curve), {
          readouts: [{ x: point.x, y: point.y, text: `Curve ${current.curve.toFixed(1)}` }],
        })
      );
    }
  }

  function finishTrack(event: ReactPointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current) {
      return;
    }
    const point = laneAt(event);
    endGesture();
    if (current.kind === 'marquee') {
      if (!current.moved) {
        // A plain click on empty lane space clears; with a modifier it leaves the selection alone.
        if (!current.additive) {
          onSelectionChange?.([]);
        }
        return;
      }
      const hit = pinsInRect(heads, laneRect(current.start, point), trackHeight);
      onSelectionChange?.(marqueeSelection(selectedIds, hit, current.additive));
    } else if (current.kind === 'time') {
      if (!current.moved) {
        if (!current.additive) {
          onSelectionChange?.([]);
        }
        return;
      }
      const range = snapSpan(current.startX, point.x, pixelsPerQuarter, snapUnit);
      onSelectionChange?.(marqueeSelection(selectedIds, idsOverlapping(range), current.additive));
      if (current.additive) {
        onMarqueeRange?.(range, true, true);
      } else {
        onMarqueeRange?.(range, true);
      }
    } else if (current.kind === 'timeMove') {
      if (!current.moved) {
        // A press in the band without a drag is a click: it clears, like a click on empty space.
        onSelectionChange?.([]);
        return;
      }
      current.copy = event.ctrlKey || event.metaKey;
      current.merge = event.altKey;
      const delta = moveDelta(current, point.x);
      if (delta !== 0) {
        if (current.copy || current.merge) {
          onMoveTimeRange?.(current.range, delta, { copy: current.copy, merge: current.merge });
        } else {
          onMoveTimeRange?.(current.range, delta);
        }
      }
    } else if (current.kind === 'pencil') {
      sample(current, point);
      if (current.values.size) {
        onSetVelocities?.(Object.fromEntries(current.values));
      }
    } else if (current.kind === 'paint') {
      const points = paintPoints(current, point);
      if (!points.length) {
        return;
      }
      const made: VelocityRamp = {
        heads: points.map((entry) => ({ id: entry.id, x: entry.x / pixelsPerQuarter })),
        start: current.startPercent,
        end: percentAtY(point.y, trackHeight),
        curve: 0,
      };
      onRamp?.(made, Object.fromEntries(points.map((entry) => [entry.id, entry.value])));
    } else if (ramp && current.curve !== ramp.curve) {
      // Re-applied from the ramp's original endpoints and heads with the new curve, never stacked.
      const curved = { ...ramp, curve: current.curve };
      onRamp?.(
        curved,
        Object.fromEntries(rampPoints(curved, curved.curve).map((entry) => [entry.id, entry.value]))
      );
    }
  }

  function begin(note: PianoRollNote, event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0 || !onVelocityChange || !PIN_TOOLS.has(activeTool)) {
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

  // A tool gesture is cancelled by Escape (stopped here, so the roll does not also clear the
  // selection) or by the window losing focus; nothing is reported.
  const gesturing = live !== null;
  useEffect(() => {
    if (!gesturing) {
      return undefined;
    }
    const cancelGesture = () => {
      gesture.current = null;
      setLive(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        event.preventDefault();
        cancelGesture();
      }
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', cancelGesture);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', cancelGesture);
    };
  }, [gesturing]);

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

  const shownSelection = live?.marqueeIds ? new Set(live.marqueeIds) : selected;
  // The ramp's dashed line: live while a gesture shapes it, otherwise the kept ramp.
  const linePoints =
    live?.line ?? (ramp && activeTool === 'paint' ? rampPoints(ramp, ramp.curve) : null);
  const marqueeSpan = live?.marquee
    ? layerSpan(layout, live.marquee.left, live.marquee.width)
    : null;
  const previewSpan = live?.timeRange
    ? layerSpan(
        layout,
        live.timeRange.start * pixelsPerQuarter,
        (live.timeRange.end - live.timeRange.start) * pixelsPerQuarter
      )
    : null;

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
      <div className={classes.lane} data-collapsed={collapsed || undefined} data-band-press>
        <div className={classes.header} style={{ width: PIANO_ROLL_KEYBOARD_WIDTH }}>
          <VelocityLaneToggle collapsed={collapsed} onCollapsedChange={onCollapsedChange} />
          {!collapsed && <span className={classes.label}>Velocity</span>}
        </div>
        {!collapsed && (
          <div
            ref={trackRef}
            className={classes.track}
            role="group"
            aria-label="Velocity lane"
            data-tool={activeTool}
            style={{ height: trackHeight }}
            onPointerDown={beginTrack}
            onPointerMove={moveTrack}
            onPointerUp={finishTrack}
            onPointerCancel={endGesture}
            onLostPointerCapture={endGesture}
            onContextMenu={(event) => {
              if (suppressMenu.current) {
                event.preventDefault();
              }
            }}
          >
            <div
              ref={contentRef}
              className={classes.content}
              style={{
                width: layout.windowed
                  ? layout.width
                  : Math.max(1, visibleQuarters * pixelsPerQuarter),
                transform: `translateX(${-(scrollLeft - layout.origin)}px)`,
              }}
            >
              {grid.map((line) => (
                <span
                  key={`grid:${line.at}:${line.kind}`}
                  className={classes.timeLine}
                  data-testid="velocity-grid-line"
                  data-kind={line.kind}
                  data-subdivision={line.subdivision || undefined}
                  style={{ left: line.at * pixelsPerQuarter - layout.origin }}
                />
              ))}
              {rangeSpan && !live?.moveRange && (
                <span
                  className={classes.range}
                  data-testid="velocity-range"
                  style={{ left: rangeSpan.left, width: rangeSpan.width }}
                />
              )}
              {previewSpan && (
                <span
                  className={classes.range}
                  data-testid="velocity-range-preview"
                  style={{ left: previewSpan.left, width: previewSpan.width }}
                />
              )}
              {notes.map((note) => {
                const stemSpan = layerSpan(layout, note.start * pixelsPerQuarter);
                if (!stemSpan) {
                  return null;
                }
                const id = selectionId(note);
                const shifted = preview?.ids.has(id) ? preview.delta : 0;
                const drawn = live?.values?.get(id);
                const velocity =
                  drawn !== undefined
                    ? Math.min(1, Math.max(0, drawn))
                    : Math.min(1, Math.max(0, level(note.velocity) + shifted));
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
                        left: stemSpan.left,
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
                      data-selected={shownSelection.has(id) || undefined}
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
              {linePoints && linePoints.length > 0 && (
                <svg
                  className={classes.ramp}
                  data-testid="velocity-ramp"
                  data-ids={linePoints.map((point) => point.id).join(',')}
                  aria-hidden="true"
                >
                  <polyline
                    data-testid="velocity-ramp-line"
                    fill="none"
                    points={linePoints
                      .map(
                        (point) =>
                          `${point.x - layout.origin},${velocityY(point.value, trackHeight)}`
                      )
                      .join(' ')}
                  />
                  {linePoints.map((point) => (
                    <circle
                      key={point.id}
                      cx={point.x - layout.origin}
                      cy={velocityY(point.value, trackHeight)}
                      r={PIN_RADIUS + 3}
                    />
                  ))}
                </svg>
              )}
              {marqueeSpan && live?.marquee && (
                <span
                  className={classes.marquee}
                  data-testid="velocity-marquee"
                  style={{
                    left: marqueeSpan.left,
                    top: live.marquee.top,
                    width: marqueeSpan.width,
                    height: live.marquee.height,
                  }}
                />
              )}
              {live?.readouts?.map((entry, index) => {
                const at = layerSpan(layout, entry.x);
                return at ? (
                  <span
                    key={index}
                    className={classes.floatReadout}
                    data-testid="velocity-gesture-readout"
                    style={{ left: at.left, top: entry.y }}
                  >
                    {entry.text}
                  </span>
                ) : null;
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
