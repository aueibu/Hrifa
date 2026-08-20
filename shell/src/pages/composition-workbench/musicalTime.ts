export interface Rational {
  numerator: number;
  denominator: number;
}

export interface MusicalPosition {
  quarterNotes: Rational;
}

export interface MusicalDuration {
  quarterNotes: Rational;
}

export interface TempoChange {
  at: MusicalPosition;
  bpm: number;
}

export interface MeterChange {
  atBar: number;
  numerator: number;
  denominator: number;
}

export interface MusicalTimeline {
  id: string;
  tempoMap: TempoChange[];
  meterMap: MeterChange[];
  displayTick: MusicalDuration;
}

function greatestCommonDivisor(left: number, right: number) {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}

export function rational(numerator: number, denominator = 1): Rational {
  if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator)) {
    throw new Error('Musical time requires safe integer rational components.');
  }
  if (denominator === 0) {
    throw new Error('A musical-time denominator cannot be zero.');
  }
  const sign = denominator < 0 ? -1 : 1;
  const divisor = greatestCommonDivisor(numerator, denominator);
  return {
    numerator: (sign * numerator) / divisor,
    denominator: Math.abs(denominator) / divisor,
  };
}

export function addRational(left: Rational, right: Rational) {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator
  );
}

export function subtractRational(left: Rational, right: Rational) {
  return addRational(left, rational(-right.numerator, right.denominator));
}

export function multiplyRational(left: Rational, right: Rational | number) {
  const factor = typeof right === 'number' ? rational(right) : right;
  return rational(left.numerator * factor.numerator, left.denominator * factor.denominator);
}

export function compareRational(left: Rational, right: Rational) {
  return left.numerator * right.denominator - right.numerator * left.denominator;
}

export function rationalToNumber(value: Rational) {
  return value.numerator / value.denominator;
}

export function musicalPosition(numerator: number, denominator = 1): MusicalPosition {
  return { quarterNotes: rational(numerator, denominator) };
}

export function musicalDuration(numerator: number, denominator = 1): MusicalDuration {
  return { quarterNotes: rational(numerator, denominator) };
}

export function addDuration(position: MusicalPosition, duration: MusicalDuration): MusicalPosition {
  return { quarterNotes: addRational(position.quarterNotes, duration.quarterNotes) };
}

export function pulsesToMusicalDuration(pulses: number, pulseUnit: MusicalDuration) {
  if (!Number.isSafeInteger(pulses) || pulses < 0) {
    throw new Error('Pulse durations must be nonnegative safe integers.');
  }
  return { quarterNotes: multiplyRational(pulseUnit.quarterNotes, pulses) };
}

export function accumulatePulseDurations(pulses: number[], pulseUnit: MusicalDuration) {
  let cursor = musicalPosition(0);
  const placements = pulses.map((value) => {
    const duration = pulsesToMusicalDuration(value, pulseUnit);
    const placement = { at: cursor, duration, pulses: value };
    cursor = addDuration(cursor, duration);
    return placement;
  });
  return { placements, extent: { quarterNotes: cursor.quarterNotes } satisfies MusicalDuration };
}

export function musicalPositionToTicks(position: MusicalPosition, ppq: number) {
  if (!Number.isSafeInteger(ppq) || ppq <= 0) {
    throw new Error('PPQ must be a positive safe integer.');
  }
  return rationalToNumber(position.quarterNotes) * ppq;
}

export function musicalDurationToTicks(duration: MusicalDuration, ppq: number) {
  return musicalPositionToTicks({ quarterNotes: duration.quarterNotes }, ppq);
}

function validatedMeterMap(meterMap: MeterChange[]) {
  const sorted = [...meterMap].sort((left, right) => left.atBar - right.atBar);
  if (!sorted.length || sorted[0].atBar !== 1) {
    throw new Error('A meter map must begin at bar 1.');
  }
  sorted.forEach((meter, index) => {
    if (
      !Number.isSafeInteger(meter.atBar) ||
      meter.atBar < 1 ||
      !Number.isSafeInteger(meter.numerator) ||
      meter.numerator <= 0 ||
      !Number.isSafeInteger(meter.denominator) ||
      meter.denominator <= 0
    ) {
      throw new Error('Meter changes require positive integer bars, numerators, and denominators.');
    }
    if (index > 0 && meter.atBar === sorted[index - 1].atBar) {
      throw new Error(`Meter bar ${meter.atBar} is defined more than once.`);
    }
  });
  return sorted;
}

function meterAtBar(meterMap: MeterChange[], bar: number) {
  return [...meterMap].reverse().find((meter) => meter.atBar <= bar)!;
}

function beatDuration(meter: MeterChange) {
  return musicalDuration(4, meter.denominator);
}

function barDuration(meter: MeterChange) {
  return musicalDuration(4 * meter.numerator, meter.denominator);
}

function barStart(meterMap: MeterChange[], targetBar: number) {
  let position = musicalPosition(0);
  for (let bar = 1; bar < targetBar; bar += 1) {
    position = addDuration(position, barDuration(meterAtBar(meterMap, bar)));
  }
  return position;
}

function ticksPerBeat(meter: MeterChange, displayTick: MusicalDuration) {
  const count =
    rationalToNumber(beatDuration(meter).quarterNotes) / rationalToNumber(displayTick.quarterNotes);
  if (!Number.isSafeInteger(count) || count <= 0) {
    throw new Error('The display tick must divide each notated beat exactly.');
  }
  return count;
}

export function formatBarBeatTickPercent(
  position: MusicalPosition,
  timeline: Pick<MusicalTimeline, 'meterMap' | 'displayTick'>
) {
  if (compareRational(position.quarterNotes, rational(0)) < 0) {
    throw new Error('Bitwig-style positions cannot represent time before bar 1.');
  }
  const meterMap = validatedMeterMap(timeline.meterMap);
  const target = rationalToNumber(position.quarterNotes);
  let bar = 1;
  let start = 0;
  while (bar < 100_000) {
    const length = rationalToNumber(barDuration(meterAtBar(meterMap, bar)).quarterNotes);
    if (target < start + length - Number.EPSILON * 16) {
      break;
    }
    start += length;
    bar += 1;
  }
  if (bar >= 100_000) {
    throw new Error('Position exceeds the supported display range.');
  }

  const meter = meterAtBar(meterMap, bar);
  const perBeat = ticksPerBeat(meter, timeline.displayTick);
  const beatLength = rationalToNumber(beatDuration(meter).quarterNotes);
  const tickLength = rationalToNumber(timeline.displayTick.quarterNotes);
  let offset = Math.max(0, target - start);
  let beat = Math.floor(offset / beatLength);
  offset -= beat * beatLength;
  let tick = Math.floor(offset / tickLength);
  let percent = Math.round(((offset - tick * tickLength) / tickLength) * 100);

  if (percent === 100) {
    percent = 0;
    tick += 1;
  }
  if (tick >= perBeat) {
    tick = 0;
    beat += 1;
  }
  if (beat >= meter.numerator) {
    bar += 1;
    beat = 0;
    tick = 0;
  }

  return `${bar}.${beat + 1}.${tick + 1}.${String(percent).padStart(2, '0')}`;
}

export function parseBarBeatTickPercent(
  value: string,
  timeline: Pick<MusicalTimeline, 'meterMap' | 'displayTick'>
): MusicalPosition {
  const match = /^(\d+)\.(\d+)\.(\d+)\.(\d{1,2})$/.exec(value.trim());
  if (!match) {
    throw new Error('Enter a position as BAR.BEAT.TICK.%.');
  }
  const [, barText, beatText, tickText, percentText] = match;
  const bar = Number(barText);
  const beat = Number(beatText);
  const tick = Number(tickText);
  const percent = Number(percentText);
  if (bar < 1 || beat < 1 || tick < 1) {
    throw new Error('Bar, beat, and tick numbers begin at 1.');
  }
  const meterMap = validatedMeterMap(timeline.meterMap);
  const meter = meterAtBar(meterMap, bar);
  const perBeat = ticksPerBeat(meter, timeline.displayTick);
  if (beat > meter.numerator || tick > perBeat) {
    throw new Error('Bar, beat, or tick lies outside the active meter.');
  }
  if (percent < 0 || percent > 99) {
    throw new Error('Sub-tick percentage must be from 0 through 99.');
  }

  const start = barStart(meterMap, bar);
  const beatOffset = multiplyRational(beatDuration(meter).quarterNotes, beat - 1);
  const tickOffset = multiplyRational(timeline.displayTick.quarterNotes, tick - 1);
  const subTickOffset = multiplyRational(timeline.displayTick.quarterNotes, rational(percent, 100));
  return {
    quarterNotes: addRational(
      start.quarterNotes,
      addRational(beatOffset, addRational(tickOffset, subTickOffset))
    ),
  };
}

export function musicalPositionToSeconds(position: MusicalPosition, tempoMap: TempoChange[]) {
  if (compareRational(position.quarterNotes, rational(0)) < 0) {
    throw new Error('Cannot render musical time before the timeline origin.');
  }
  const changes = [...tempoMap].sort((left, right) =>
    compareRational(left.at.quarterNotes, right.at.quarterNotes)
  );
  if (!changes.length || compareRational(changes[0].at.quarterNotes, rational(0)) !== 0) {
    throw new Error('A tempo map must begin at musical position zero.');
  }
  if (changes.some((change) => !Number.isFinite(change.bpm) || change.bpm <= 0)) {
    throw new Error('Tempo changes require positive finite BPM values.');
  }
  changes.slice(1).forEach((change, index) => {
    if (compareRational(change.at.quarterNotes, changes[index].at.quarterNotes) <= 0) {
      throw new Error('Tempo changes must occupy distinct increasing musical positions.');
    }
  });
  let seconds = 0;
  let cursor = rational(0);
  let bpm = changes[0].bpm;
  for (const change of changes.slice(1)) {
    if (compareRational(change.at.quarterNotes, position.quarterNotes) >= 0) {
      break;
    }
    const span = subtractRational(change.at.quarterNotes, cursor);
    seconds += rationalToNumber(span) * (60 / bpm);
    cursor = change.at.quarterNotes;
    bpm = change.bpm;
  }
  const remainder = subtractRational(position.quarterNotes, cursor);
  return seconds + rationalToNumber(remainder) * (60 / bpm);
}

export const defaultMusicalTimeline: MusicalTimeline = {
  id: 'workbench-default-timeline',
  tempoMap: [{ at: musicalPosition(0), bpm: 120 }],
  meterMap: [{ atBar: 1, numerator: 4, denominator: 4 }],
  displayTick: musicalDuration(1, 4),
};
