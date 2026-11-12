import { rational, type Rational } from './musicalTime';
import { isValidMeter, parseMeter } from './transport';

/**
 * Ticks in a quarter note: the one resolution clip positions are shown and typed at. A tick is the
 * smallest step the clip inspector edits; stored positions stay exact rationals of a quarter note.
 */
export const TICKS_PER_QUARTER = 960;

export type ParseResult = { ok: true; value: Rational } | { ok: false; error: string };

/** Bar, beat and tick sizes of a time signature, in ticks. */
function metrics(meter: string) {
  const { numerator, denominator } = parseMeter(isValidMeter(meter) ? meter : '4/4');
  const ticksPerBeat = (4 * TICKS_PER_QUARTER) / denominator;
  return { beats: numerator, ticksPerBeat, ticksPerBar: numerator * ticksPerBeat };
}

/** Length of one bar of the meter, in quarter notes (exact). */
export function barQuarters(meter: string): Rational {
  const { numerator, denominator } = parseMeter(isValidMeter(meter) ? meter : '4/4');
  return rational(4 * numerator, denominator);
}

const toTicks = (quarters: Rational) =>
  Math.round((quarters.numerator * TICKS_PER_QUARTER) / quarters.denominator);

/**
 * A position as `bar.beat.tick`: bar and beat count from 1, ticks from 0, so the start of the clip
 * is `1.1.0`. A position between ticks shows the nearest tick. Meter-aware: the bar and the beat
 * are the clip's time signature's.
 */
export function formatPosition(quarters: Rational, meter: string): string {
  const ticks = toTicks(quarters);
  if (ticks < 0) {
    throw new RangeError('A clip position cannot be before bar 1.');
  }
  const { ticksPerBeat, ticksPerBar } = metrics(meter);
  const rest = ticks % ticksPerBar;
  return `${Math.floor(ticks / ticksPerBar) + 1}.${Math.floor(rest / ticksPerBeat) + 1}.${rest % ticksPerBeat}`;
}

/** A length as `bars.beats.ticks`, all counted from 0: one bar of 4/4 is `1.0.0`. */
export function formatLength(quarters: Rational, meter: string): string {
  const ticks = toTicks(quarters);
  if (ticks < 0) {
    throw new RangeError('A clip length cannot be negative.');
  }
  const { ticksPerBeat, ticksPerBar } = metrics(meter);
  const rest = ticks % ticksPerBar;
  return `${Math.floor(ticks / ticksPerBar)}.${Math.floor(rest / ticksPerBeat)}.${rest % ticksPerBeat}`;
}

/** The most bars a clip may be (Bitwig's cap); a typed position or length above it is rejected. */
export const MAX_CLIP_BARS = 72_000;
const TOO_LARGE = `Bars cannot go past ${MAX_CLIP_BARS}.`;

function parts(text: string) {
  const match = /^\s*(\d+)\.(\d+)\.(\d+)\s*$/.exec(text);
  return match ? { bar: Number(match[1]), beat: Number(match[2]), tick: Number(match[3]) } : null;
}

/** Parses `bar.beat.tick` (bar and beat from 1, tick from 0). Rejects, never clamps. */
export function parsePosition(text: string, meter: string): ParseResult {
  const found = parts(text);
  if (!found) {
    return { ok: false, error: 'Enter a position as bar.beat.tick, for example 1.1.0.' };
  }
  if (found.bar > MAX_CLIP_BARS || found.beat > MAX_CLIP_BARS || found.tick > MAX_CLIP_BARS) {
    return { ok: false, error: TOO_LARGE };
  }
  const { beats, ticksPerBeat, ticksPerBar } = metrics(meter);
  if (found.bar < 1 || found.beat < 1) {
    return { ok: false, error: 'Bars and beats count from 1.' };
  }
  if (found.beat > beats) {
    return { ok: false, error: `A bar of ${meter} has ${beats} beats.` };
  }
  if (found.tick >= ticksPerBeat) {
    return {
      ok: false,
      error: `Ticks run from 0 to ${ticksPerBeat - 1} in a beat of ${meter}.`,
    };
  }
  const ticks = (found.bar - 1) * ticksPerBar + (found.beat - 1) * ticksPerBeat + found.tick;
  return { ok: true, value: rational(ticks, TICKS_PER_QUARTER) };
}

/** Parses a length `bars.beats.ticks` (all from 0). Rejects, never clamps. */
export function parseLength(text: string, meter: string): ParseResult {
  const found = parts(text);
  if (!found) {
    return { ok: false, error: 'Enter a length as bars.beats.ticks, for example 1.0.0.' };
  }
  if (found.bar > MAX_CLIP_BARS || found.beat > MAX_CLIP_BARS || found.tick > MAX_CLIP_BARS) {
    return { ok: false, error: TOO_LARGE };
  }
  const { beats, ticksPerBeat, ticksPerBar } = metrics(meter);
  if (found.beat >= beats) {
    return { ok: false, error: `Beats run from 0 to ${beats - 1} in a bar of ${meter}.` };
  }
  if (found.tick >= ticksPerBeat) {
    return {
      ok: false,
      error: `Ticks run from 0 to ${ticksPerBeat - 1} in a beat of ${meter}.`,
    };
  }
  const ticks = found.bar * ticksPerBar + found.beat * ticksPerBeat + found.tick;
  if (ticks > MAX_CLIP_BARS * ticksPerBar) {
    return { ok: false, error: TOO_LARGE };
  }
  return { ok: true, value: rational(ticks, TICKS_PER_QUARTER) };
}
