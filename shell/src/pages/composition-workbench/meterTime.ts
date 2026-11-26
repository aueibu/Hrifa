import { compareRational, multiplyRational, rational, type Rational } from './musicalTime';
import { isValidMeter, parseMeter } from './transport';

/**
 * Ticks in a quarter note for the plain-number fields (`notesProperties.ts` rounds typed numbers to it).
 * The `BARs.BEATs.TICKs.%` display below does not use it: there a tick is a sixteenth note (1/4 quarter)
 * and a percent is 1/400 of a quarter, and stored values stay exact rationals of a quarter note.
 */
export const TICKS_PER_QUARTER = 960;

export type ParseResult = { ok: true; value: Rational } | { ok: false; error: string };

/** The most bars a data-block may be (Bitwig's cap); a typed position or length above it is rejected. */
export const MAX_DATA_BLOCK_BARS = 72_000;
const TOO_LARGE = `Bars cannot go past ${MAX_DATA_BLOCK_BARS}.`;

/** Percents (1/400 of a quarter note) in a tick (a sixteenth note) and in a quarter note. */
const PERCENTS_PER_TICK = 100;
const PERCENTS_PER_QUARTER = 400;

/** Beat, bar and cap sizes of a time signature, in percents. A beat is 16/denominator ticks. */
function metrics(meter: string) {
  const { numerator, denominator } = parseMeter(isValidMeter(meter) ? meter : '4/4');
  const beatPercents = (16 / denominator) * PERCENTS_PER_TICK;
  const barPercents = numerator * beatPercents;
  return { beatPercents, barPercents, capPercents: MAX_DATA_BLOCK_BARS * barPercents };
}

/** Length of one bar of the meter, in quarter notes (exact). */
export function barQuarters(meter: string): Rational {
  const { numerator, denominator } = parseMeter(isValidMeter(meter) ? meter : '4/4');
  return rational(4 * numerator, denominator);
}

/** The nearest whole percent of a quarter-note value (a value between two percents shows the nearer). */
const toPercents = (quarters: Rational) =>
  Math.round((quarters.numerator * PERCENTS_PER_QUARTER) / quarters.denominator);

function formatParts(quarters: Rational, meter: string, origin: 0 | 1, what: string): string {
  const percents = toPercents(quarters);
  if (percents < 0) {
    throw new RangeError(`A ${what} cannot be negative.`);
  }
  const { beatPercents, barPercents } = metrics(meter);
  const rest = percents % barPercents;
  const inBeat = rest % beatPercents;
  const bar = Math.floor(percents / barPercents) + origin;
  const beat = Math.floor(rest / beatPercents) + origin;
  const tick = Math.floor(inBeat / PERCENTS_PER_TICK) + origin;
  return `${bar}.${beat}.${tick}.${String(inBeat % PERCENTS_PER_TICK).padStart(2, '0')}`;
}

/**
 * A position as `BARs.BEATs.TICKs.%`: bar, beat and tick count from 1 and the percent is 00 to 99 of a
 * tick, so the origin is `1.1.1.00`. A tick is a sixteenth note (4 per beat in x/4, 2 in x/8, 1 in x/16).
 * A value between two percents shows the nearest percent (it carries when that is 100); the value
 * itself is never changed. Meter-aware.
 */
export function formatPosition(quarters: Rational, meter: string): string {
  return formatParts(quarters, meter, 1, 'data-block position');
}

/** A length in the same four parts, all counted from 0: the origin is `0.0.0.00`. */
export function formatLength(quarters: Rational, meter: string): string {
  return formatParts(quarters, meter, 0, 'data-block length');
}

/** Exact ratio text: `a/b` of a whole note (`n`, the default) or of a bar (`b`). */
const RATIO = /^\s*(\d+)\s*\/\s*(\d+)\s*([nb])?\s*$/i;

function parseRatio(match: RegExpExecArray, meter: string): ParseResult {
  const top = Number(match[1]);
  const bottom = Number(match[2]);
  if (bottom === 0) {
    return { ok: false, error: 'A ratio cannot divide by zero.' };
  }
  const { numerator: beats, denominator: beatUnit } = parseMeter(
    isValidMeter(meter) ? meter : '4/4'
  );
  const ofBar = match[3]?.toLowerCase() === 'b';
  const value = ofBar ? rational(4 * beats * top, beatUnit * bottom) : rational(4 * top, bottom);
  if (compareRational(value, multiplyRational(barQuarters(meter), MAX_DATA_BLOCK_BARS)) > 0) {
    return { ok: false, error: TOO_LARGE };
  }
  return { ok: true, value };
}

/**
 * Parses typed time for a Start (`origin` 1: parts count from 1) or a Duration (0). Missing trailing
 * parts fill with the minimum; parts past their range carry up; the fourth part is a whole number of
 * percent. A text with `/` and no `.` is an exact ratio. Rejects, never clamps.
 */
function parseTime(text: string, meter: string, origin: 0 | 1): ParseResult {
  if (text.includes('/') && !text.includes('.')) {
    const match = RATIO.exec(text);
    return match
      ? parseRatio(match, meter)
      : { ok: false, error: 'Enter a ratio like 1/4n (of a whole note) or 1/4b (of a bar).' };
  }
  const pieces = text.trim().split('.');
  if (pieces.length > 4 || pieces.some((piece) => !/^\d+$/.test(piece.trim()))) {
    return {
      ok: false,
      error: 'Enter time as BARs.BEATs.TICKs.% (for example 1.1.1.00) or a ratio (1/4n).',
    };
  }
  const numbers = pieces.map((piece) => Number(piece.trim()));
  const bar = numbers[0];
  const beat = numbers[1] ?? origin;
  const tick = numbers[2] ?? origin;
  const percent = numbers[3] ?? 0;
  if (origin === 1 && (bar < 1 || beat < 1 || tick < 1)) {
    return { ok: false, error: 'Bars, beats and ticks count from 1.' };
  }
  const { beatPercents, barPercents, capPercents } = metrics(meter);
  const total =
    (bar - origin) * barPercents +
    (beat - origin) * beatPercents +
    (tick - origin) * PERCENTS_PER_TICK +
    percent;
  if (!Number.isSafeInteger(total) || total > capPercents) {
    return { ok: false, error: TOO_LARGE };
  }
  return { ok: true, value: rational(total, PERCENTS_PER_QUARTER) };
}

/** Parses a Start: `BARs.BEATs.TICKs.%` counting from 1, or a ratio. */
export function parsePosition(text: string, meter: string): ParseResult {
  return parseTime(text, meter, 1);
}

/** Parses a Duration: `BARs.BEATs.TICKs.%` counting from 0, or a ratio. */
export function parseLength(text: string, meter: string): ParseResult {
  return parseTime(text, meter, 0);
}

export type TimePart = 'bar' | 'beat' | 'tick' | 'percent';

/** The least a position or a length can be, in quarter notes (both start at 0). */
const MINIMUM_QUARTERS: Record<'position' | 'length', number> = { position: 0, length: 0 };

/**
 * One scrub step: adds or subtracts ONE unit of `part` (bar = the meter's bar, beat = 4/denominator
 * quarters, tick = 1/4 quarter, percent = 1/400 quarter). A value off the percent grid snaps to the
 * nearest percent first. Never below the minimum or above the bar cap.
 */
export function stepTime(
  quarters: Rational,
  meter: string,
  kind: 'position' | 'length',
  part: TimePart,
  direction: 1 | -1
): Rational {
  const { beatPercents, barPercents, capPercents } = metrics(meter);
  const unit = { bar: barPercents, beat: beatPercents, tick: PERCENTS_PER_TICK, percent: 1 }[part];
  const next = toPercents(quarters) + direction * unit;
  const least = MINIMUM_QUARTERS[kind] * PERCENTS_PER_QUARTER;
  return rational(Math.min(Math.max(next, least), capPercents), PERCENTS_PER_QUARTER);
}

const PARTS: readonly TimePart[] = ['bar', 'beat', 'tick', 'percent'];

/**
 * Which part of a displayed time a pointer is on: `caret` is the character index in `text` under the
 * pointer, with `text` split at its dots into bar, beat, tick, percent. A dot belongs to the part on its
 * LEFT (so `2.3.2.00` has the beat at index 2 and the dot at index 3 also steps the beat); an index
 * before the text is the first part and one past its end is the last. Text with fewer than four parts
 * maps onto the parts it has (callers show the four-part form while scrubbing).
 */
export function partAt(text: string, caret: number): TimePart {
  const pieces = text.split('.');
  let end = -1;
  for (let index = 0; index < pieces.length; index += 1) {
    end += pieces[index].length + 1; // the last character index of this piece, counting its dot
    if (caret <= end) {
      return PARTS[Math.min(index, 3)];
    }
  }
  return PARTS[Math.min(pieces.length - 1, 3)];
}
