import { barQuarters } from '../meterTime';
import {
  addRational,
  compareRational,
  rational,
  subtractRational,
  type Rational,
} from '../musicalTime';
import { isValidMeter, parseMeter } from '../transport';

/**
 * The Arranger's geometry (workbench O2b), pure: quarter notes to pixels and back, snapping, and what a
 * drag does to an object's time span. All stored time is an exact rational (`musicalTime.ts`); the
 * pixel side is plain numbers and never stored. No zoom in this slice: one fixed scale.
 */

/** Pixels in one quarter note (fixed; zoom comes later). */
export const PIXELS_PER_QUARTER = 48;

/** The finest step a drag lands on with snapping off (Bitwig: Shift inverts it), as a rational of a quarter. */
export const FINE_STEP: Rational = rational(1, 960);

export const quartersToPx = (quarters: Rational): number =>
  (quarters.numerator / quarters.denominator) * PIXELS_PER_QUARTER;

/** The quarter note under a pixel, as a plain number (display and hit tests only, never stored). */
export const pxToQuarters = (px: number): number => px / PIXELS_PER_QUARTER;

/** The transport's beat grid: one beat of the meter (the denominator note) in exact quarter notes. */
export function beatStep(meter: string): Rational {
  const { denominator } = parseMeter(isValidMeter(meter) ? meter : '4/4');
  return rational(4, denominator);
}

/** The nearest multiple of `step` (exact). Halves round up. */
export function snapToStep(value: Rational, step: Rational): Rational {
  const count = Math.floor(
    (2 * value.numerator * step.denominator + value.denominator * step.numerator) /
      (2 * value.denominator * step.numerator)
  );
  return rational(count * step.numerator, step.denominator);
}

/** A pixel distance as an exact quarter-note amount at the finest step (a tick). */
export function pxToRational(px: number): Rational {
  return rational(Math.round(pxToQuarters(px) * 960), 960);
}

/**
 * The step a drag snaps to: the beat grid, or null (free, at tick resolution) while Shift inverts it
 * (Bitwig, "SHIFT temporarily inverts the snapping behavior"). Snapping is on by default.
 */
export const dragStep = (meter: string, shiftKey: boolean): Rational | null =>
  shiftKey ? null : beatStep(meter);

/** What an object looks like when a drag starts. */
export interface DragBase {
  /** World start (parent chain plus relative start). */
  worldStart: Rational;
  /** Its own start, relative to its parent (or to the scene start). */
  relativeStart: Rational;
  duration: Rational;
  /** How far into the data the object's own start falls (default 0). */
  contentOffset?: Rational;
  /** The object's mapping (default Loop). It decides what a left-edge drag does to the content offset. */
  mapping?: 'loop' | 'stretch' | 'one-shot';
}

/** `resize` is the right edge, `resize-left` the left edge (O2d). */
export type DragKind = 'move' | 'resize' | 'resize-left';

/**
 * How far an edge drag may go (`objectRoom`): the end of the neighbor before and the start of the
 * neighbor after, in world quarter notes (null: no neighbor on that side). An edge drag clamps to it.
 */
export interface DragRoom {
  before: Rational | null;
  after: Rational | null;
}

/** The span (and, for a left-edge drag, the content offset) a drag gives. */
export interface DragResult {
  start: Rational;
  duration: Rational;
  /** Only for `resize-left`, and unchanged for Stretch. */
  contentOffset?: Rational;
}

/**
 * The span a drag gives, for the pointer moved `deltaPx` from where it went down. `step` null: free.
 *
 * Move: the WORLD start (where the block shows) lands on the grid and the RELATIVE start changes by the
 * same amount, so a child moves and its parent does not. The world start never goes before the scene
 * start. Resize: the right edge lands on the grid; only the duration changes, never below `minimum`
 * (callers pass one beat, also while free, so a duration is never zero or negative).
 */
export function dragOutcome(
  kind: DragKind,
  base: DragBase,
  deltaPx: number,
  step: Rational | null,
  minimum: Rational,
  room: DragRoom | null = null
): DragResult {
  const delta = pxToRational(deltaPx);
  const land = (value: Rational) => (step === null ? value : snapToStep(value, step));
  if (kind === 'move') {
    let world = land(addRational(base.worldStart, delta));
    if (world.numerator < 0) {
      world = rational(0);
    }
    return {
      start: addRational(base.relativeStart, subtractRational(world, base.worldStart)),
      duration: base.duration,
    };
  }
  if (kind === 'resize-left') {
    // The left edge lands on the grid; the block's end stays. The edge never passes one beat short of
    // the end and never goes before the scene start. The data keeps its place in time (the offset moves
    // by the same amount as the start), except Stretch, which refits its one cycle to the new span.
    const fixedEnd = addRational(base.worldStart, base.duration);
    let world = land(addRational(base.worldStart, delta));
    const latest = subtractRational(fixedEnd, minimum);
    if (compareRational(world, latest) > 0) {
      world = latest;
    }
    if (world.numerator < 0) {
      world = rational(0);
    }
    // Never into the neighbor before it (L1a): the edge stops at the neighbor's end.
    if (room?.before && compareRational(world, room.before) < 0) {
      world = room.before;
    }
    const shift = subtractRational(world, base.worldStart);
    const offset = base.contentOffset ?? rational(0);
    return {
      start: addRational(base.relativeStart, shift),
      duration: subtractRational(fixedEnd, world),
      contentOffset: base.mapping === 'stretch' ? offset : addRational(offset, shift),
    };
  }
  const end = land(addRational(addRational(base.worldStart, base.duration), delta));
  let duration = subtractRational(end, base.worldStart);
  if (compareRational(duration, minimum) < 0) {
    duration = minimum;
  }
  // Never into the neighbor after it (L1a): the edge stops at the neighbor's start.
  if (room?.after) {
    const longest = subtractRational(room.after, base.worldStart);
    if (compareRational(duration, longest) > 0) {
      duration = longest;
    }
  }
  return { start: base.relativeStart, duration };
}

/** Pixels the pointer must travel before a press becomes a drag (Bitwig's drag threshold is 5 DIP). */
export const DRAG_THRESHOLD_PX = 5;

/** A drag in progress, as a pure value: the component only feeds it pointer events. */
export interface DragState {
  /** Which object row is dragged (opaque to the machine). */
  id: string;
  kind: DragKind;
  base: DragBase;
  startX: number;
  deltaPx: number;
  shift: boolean;
  /** Latched once the pointer has travelled `DRAG_THRESHOLD_PX`; a press that never did is a click. */
  moved: boolean;
  /** An edge drag's bounds among its neighbors (null: none). */
  room: DragRoom | null;
}

/** What a drag commits: a new relative start and duration (the caller writes the field its kind changes). */
export type DragCommit = DragResult;

export function dragStart(
  id: string,
  kind: DragKind,
  base: DragBase,
  startX: number,
  shift: boolean,
  room: DragRoom | null = null
): DragState {
  return { id, kind, base, startX, deltaPx: 0, shift, moved: false, room };
}

export function dragMove(state: DragState, clientX: number, shift: boolean): DragState {
  const deltaPx = clientX - state.startX;
  return {
    ...state,
    deltaPx,
    shift,
    moved: state.moved || Math.abs(deltaPx) >= DRAG_THRESHOLD_PX,
  };
}

/** What to show while the drag is live: the old span exactly until the threshold is passed. */
export function dragLive(state: DragState, meter: string): DragResult {
  if (!state.moved) {
    return { start: state.base.relativeStart, duration: state.base.duration };
  }
  return dragOutcome(
    state.kind,
    state.base,
    state.deltaPx,
    dragStep(meter, state.shift),
    beatStep(meter),
    state.room
  );
}

/**
 * Where the edge two touching objects share lands (world quarter notes) for a drag of `deltaPx` from
 * `edge`: on the grid (or free with Shift), and never within `minimum` of either far end (the left
 * object keeps at least one beat, so does the right one). Mirrors `resizeSharedEdge`'s own clamp.
 */
export function sharedEdgeOutcome(
  edge: Rational,
  leftStart: Rational,
  rightEnd: Rational,
  deltaPx: number,
  step: Rational | null,
  minimum: Rational
): Rational {
  const wanted = addRational(edge, pxToRational(deltaPx));
  const landed = step === null ? wanted : snapToStep(wanted, step);
  const earliest = addRational(leftStart, minimum);
  const latest = subtractRational(rightEnd, minimum);
  if (compareRational(earliest, latest) > 0) {
    return edge;
  }
  return compareRational(landed, earliest) < 0
    ? earliest
    : compareRational(landed, latest) > 0
      ? latest
      : landed;
}

/**
 * Release: the pointer's final position and the Shift flag AT RELEASE decide the result. Returns the
 * commit, or null (a click, or a drag that ended where it began): nothing is written.
 */
export function dragRelease(
  state: DragState,
  clientX: number,
  shift: boolean,
  meter: string
): DragCommit | null {
  const final = dragMove(state, clientX, shift);
  if (!final.moved) {
    return null;
  }
  const outcome = dragLive(final, meter);
  const unchanged =
    final.kind === 'move'
      ? compareRational(outcome.start, state.base.relativeStart) === 0
      : final.kind === 'resize-left'
        ? compareRational(outcome.start, state.base.relativeStart) === 0 &&
          compareRational(outcome.duration, state.base.duration) === 0
        : compareRational(outcome.duration, state.base.duration) === 0;
  return unchanged ? null : outcome;
}

/** Cancel (pointercancel): the drag is thrown away and nothing is committed. */
export const dragCancel = (): null => null;

export interface RulerMark {
  /** Position in quarter notes (display only). */
  quarters: number;
  /** 1-based bar number. */
  bar: number;
  /** 1-based beat in the bar. */
  beat: number;
  /** True at a bar line (labeled with the bar number). */
  isBar: boolean;
}

/** Bar lines and beat ticks of a meter from 0 up to `lengthQuarters` (bars.beats, as the transport counts). */
export function rulerMarks(meter: string, lengthQuarters: number): RulerMark[] {
  const beat = beatStep(meter);
  const bar = barQuarters(meter);
  const beatQuarters = beat.numerator / beat.denominator;
  const beatsPerBar = Math.round(
    (bar.numerator * beat.denominator) / (bar.denominator * beat.numerator)
  );
  const marks: RulerMark[] = [];
  const total = Math.ceil(lengthQuarters / beatQuarters);
  for (let index = 0; index <= total; index += 1) {
    const inBar = index % beatsPerBar;
    marks.push({
      quarters: index * beatQuarters,
      bar: Math.floor(index / beatsPerBar) + 1,
      beat: inBar + 1,
      isBar: inBar === 0,
    });
  }
  return marks;
}

/** The scene's drawn length: the plan's duration plus a margin of bars (always room to the right). */
export function sceneLengthQuarters(planQuarters: number, meter: string, marginBars = 4): number {
  const bar = barQuarters(meter);
  const barLength = bar.numerator / bar.denominator;
  const bars = Math.max(Math.ceil(planQuarters / barLength), 0) + marginBars;
  return bars * barLength;
}

/** The playhead's position in quarter notes from the engine clock, or null before the material starts. */
export function playheadQuarters(nowMs: number, startedAtMs: number, tempo: number): number | null {
  const seconds = (nowMs - startedAtMs) / 1000;
  return seconds < 0 || !(tempo > 0) ? null : (seconds * tempo) / 60;
}
