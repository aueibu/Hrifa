import type { PianoRollGridLine } from './model';

/** A grid line as drawn: `subdivision` marks the dotted lines finer than a beat. */
export type PianoRollDrawnGridLine = PianoRollGridLine & { subdivision: boolean };

/** Least pixels between two drawn grid lines, at whatever level the grid is drawn. */
export const MIN_LINE_GAP = 10;
/** Least pixels between the subdivision lines the roll chooses itself (no grid unit picked). */
const AUTO_UNIT_GAP = 28;
/** The finest subdivisions the roll picks itself, in quarter notes, finest first. */
const AUTO_UNITS = [0.125, 0.25, 0.5];
/** Pixels one digit of a bar number takes (ruler text), and the room kept around each label. */
export const LABEL_DIGIT_PIXELS = 8;
export const LABEL_PADDING_PIXELS = 16;

const EPSILON = 1e-9;

/**
 * The subdivision (quarter notes) the roll uses for snapping and for its own lines when the owner
 * sets no grid unit: finer as the zoom grows, a quarter note when even the coarsest would crowd.
 */
export function adaptiveSubdivision(pixelsPerQuarter: number) {
  return AUTO_UNITS.find((unit) => unit * pixelsPerQuarter >= AUTO_UNIT_GAP) ?? 1;
}

export interface GridMeter {
  numerator: number;
  denominator: number;
}

export interface GridDensityInput {
  meter: GridMeter;
  /** The selected grid unit in quarter notes; unset means automatic. */
  gridUnit?: number;
  pixelsPerQuarter: number;
  /** The time range lines are wanted for, in quarter notes. */
  from: number;
  to: number;
  /** The whole timeline in quarter notes: lines stop there, and bar numbers are sized for it. */
  extent: number;
}

/** The level a zoom draws lines at, from the finest to the coarsest. */
export interface GridLevel {
  kind: 'subdivision' | 'beat' | 'bar';
  /** Quarter notes between two lines of this level (for `bar`, the stride in bars times a bar). */
  spacing: number;
  /** Bars between two bar lines: 1 down to bar level, then 2, 4, 8, 16... */
  barStride: number;
}

function meterLengths(meter: GridMeter) {
  const beat = 4 / Math.max(1, meter.denominator);
  return { beat, bar: Math.max(1, meter.numerator) * beat };
}

/** The smallest power of two (1, 2, 4, 8...) whose `base` pixels reach `needed`. */
function powerOfTwoStep(base: number, needed: number) {
  let step = 1;
  while (step * base < needed && step < 2 ** 30) {
    step *= 2;
  }
  return step;
}

/**
 * The one decision of what the grid draws: the finest level whose lines keep at least
 * `MIN_LINE_GAP` pixels apart. Levels, finest first: the subdivision (the selected unit when it is
 * finer than a beat, otherwise an automatic one while it has 28 px), the beat, the bar, then every
 * 2nd, 4th, 8th, 16th... bar. Zooming out never moves to a finer level.
 */
export function gridLevel(
  meter: GridMeter,
  gridUnit: number | undefined,
  pixelsPerQuarter: number
): GridLevel {
  const { beat, bar } = meterLengths(meter);
  const unit = gridUnit ?? AUTO_UNITS.find((one) => one * pixelsPerQuarter >= AUTO_UNIT_GAP);
  const minimum = gridUnit === undefined ? AUTO_UNIT_GAP : MIN_LINE_GAP;
  if (
    unit !== undefined &&
    unit > 0 &&
    unit < beat - EPSILON &&
    unit * pixelsPerQuarter >= minimum
  ) {
    return { kind: 'subdivision', spacing: unit, barStride: 1 };
  }
  if (beat < bar - EPSILON && beat * pixelsPerQuarter >= MIN_LINE_GAP) {
    return { kind: 'beat', spacing: beat, barStride: 1 };
  }
  const barStride = powerOfTwoStep(bar * pixelsPerQuarter, MIN_LINE_GAP);
  return { kind: 'bar', spacing: bar * barStride, barStride };
}

/** How many digits the widest bar number of a timeline of `extent` quarter notes has. */
function labelDigits(extent: number, barLength: number) {
  const bars = Math.max(1, Math.ceil(extent / barLength - EPSILON));
  return String(bars).length;
}

/**
 * Bars between two printed bar numbers: 1, 2, 4, 8... the fewest that keep a label's widest
 * number (its digits at the timeline's length, plus padding) from touching the next. Labels sit on
 * bars 1 + k * step. Independent of the line level, and never finer than it.
 */
export function barLabelStep(meter: GridMeter, pixelsPerQuarter: number, extent: number) {
  const { bar } = meterLengths(meter);
  const width = labelDigits(extent, bar) * LABEL_DIGIT_PIXELS + LABEL_PADDING_PIXELS;
  return powerOfTwoStep(bar * pixelsPerQuarter, width);
}

function keyOf(at: number) {
  return Math.round(at * 1_000_000);
}

/**
 * The grid lines for a window: bounded by the window's pixel width over `MIN_LINE_GAP`, whatever the
 * timeline's length. Bar lines carry the bar number as `label` only on bars 1 + k * labelStep.
 */
export function gridDensity(input: GridDensityInput): PianoRollDrawnGridLine[] {
  const { meter, pixelsPerQuarter, extent } = input;
  const { beat, bar } = meterLengths(meter);
  const from = Math.max(0, input.from);
  const to = Math.min(Math.max(0, extent), input.to);
  if (!(pixelsPerQuarter > 0) || to < from) {
    return [];
  }
  const level = gridLevel(meter, input.gridUnit, pixelsPerQuarter);
  const labelStep = barLabelStep(meter, pixelsPerQuarter, extent);
  const lines = new Map<number, PianoRollDrawnGridLine>();

  function add(at: number) {
    const key = keyOf(at);
    if (lines.has(key)) {
      return;
    }
    const bars = at / bar;
    const barIndex = Math.round(bars);
    if (Math.abs(bars - barIndex) < EPSILON) {
      lines.set(key, {
        at,
        kind: 'bar',
        subdivision: false,
        ...(barIndex % labelStep === 0 ? { label: String(barIndex + 1) } : {}),
      });
      return;
    }
    const beats = at / beat;
    const isBeat = Math.abs(beats - Math.round(beats)) < EPSILON;
    lines.set(key, { at, kind: 'beat', subdivision: !isBeat });
  }

  function multiples(spacing: number) {
    const first = Math.max(0, Math.ceil(from / spacing - EPSILON));
    const last = Math.floor(to / spacing + EPSILON);
    for (let step = first; step <= last; step += 1) {
      add(step * spacing);
    }
  }

  if (level.kind === 'subdivision') {
    multiples(level.spacing);
    multiples(beat);
  } else {
    multiples(level.spacing);
  }
  return [...lines.values()].sort((left, right) => left.at - right.at);
}
