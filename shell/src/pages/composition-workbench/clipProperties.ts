import { barQuarters, MAX_CLIP_BARS, TICKS_PER_QUARTER } from './clipTime';
import type { DataPacket } from './model';
import {
  compareRational,
  musicalDuration,
  musicalPosition,
  rational,
  rationalToNumber,
  type Rational,
} from './musicalTime';
import { isValidMeter } from './transport';

/**
 * The properties every clip has, none optional: how long it is, where playback starts, whether it
 * loops and the loop's span, and its time signature. Positions are quarter notes from the clip's
 * start (exact rationals).
 *
 * Storage: the total length is the packet frame's extent (what the editor's end marker has always
 * shown); the rest sits in `packet.metadata.clip`. Both are part of the packet, so an edit is an
 * ordinary versioned, undoable packet edit. Clips made before this existed carry neither, and
 * `readClipProperties` fills the defaults on read, so no stored shape changed and old desks and
 * projects load as they were.
 */
export interface ClipProperties {
  /** Total length. */
  length: Rational;
  /** Where playback starts. */
  start: Rational;
  loopOn: boolean;
  loopStart: Rational;
  loopEnd: Rational;
  /** Such as `4/4`. Decides the bar and beat the positions are shown in. */
  timeSignature: string;
}

export const DEFAULT_TIME_SIGNATURE = '4/4';
/** Least total length of a clip with no frame (before rounding up to a bar). */
export const DEFAULT_CLIP_LENGTH = rational(4);

const isRational = (value: unknown): value is Rational => {
  const candidate = value as Partial<Rational> | null;
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    Number.isSafeInteger(candidate.numerator) &&
    Number.isSafeInteger(candidate.denominator) &&
    (candidate.denominator as number) > 0
  );
};

function eventEnd(value: unknown): number {
  const note = value as {
    onset?: { quarterNotes?: unknown };
    duration?: { quarterNotes?: unknown };
  } | null;
  const onset = note?.onset?.quarterNotes;
  const duration = note?.duration?.quarterNotes;
  return isRational(onset) && isRational(duration)
    ? rationalToNumber(onset) + rationalToNumber(duration)
    : 0;
}

/** The end of the furthest timed event, in quarter notes (0 when the packet has none). */
export function contentExtent(packet: DataPacket): number {
  return packet.items.reduce((end, item) => Math.max(end, eventEnd(item.value)), 0);
}

function fromQuarters(value: number): Rational {
  // Frames written by this app are exact; any other float is approximated on the tick grid.
  return Number.isInteger(value)
    ? rational(value)
    : rational(Math.round(value * TICKS_PER_QUARTER), TICKS_PER_QUARTER);
}

function frameLength(packet: DataPacket): Rational | null {
  const musical = packet.frame?.musicalExtent?.quarterNotes;
  if (isRational(musical) && musical.numerator > 0) {
    return musical;
  }
  const extent = packet.frame?.extent;
  return extent !== undefined && Number.isFinite(extent) && extent > 0
    ? fromQuarters(extent)
    : null;
}

/** `value` rounded up to a whole number of bars of the meter (at least one). */
export function roundUpToBar(value: Rational, meter: string): Rational {
  const bar = barQuarters(meter);
  const bars = Math.max(
    1,
    Math.ceil((value.numerator * bar.denominator) / (value.denominator * bar.numerator) - 1e-9)
  );
  return rational(bars * bar.numerator, bar.denominator);
}

function stored(packet: DataPacket): Record<string, unknown> | null {
  const value = packet.metadata?.clip;
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/**
 * Whether clip properties apply to this packet: a note clip whose frame is in quarter notes (or
 * that has no frame yet). Any other clip (a cyclic or pulse frame, an abstract one) keeps its frame
 * extent as the sum of its durations, which a total length in quarter notes would break.
 */
export function clipPropertiesRefusal(packet: DataPacket): string | null {
  if (packet.kind !== 'events' || packet.domain !== 'note') {
    return 'Clip properties apply only to note clips.';
  }
  const unit = packet.frame?.unit;
  if (unit !== undefined && unit !== 'quarterNote') {
    return 'Clip properties apply only to clips measured in quarter notes.';
  }
  // Melodicization's note packets are cyclic (their grouping would disagree with a new extent): only
  // plain linear note clips have properties for now.
  const topology = packet.frame?.topology as string | undefined;
  if (topology !== undefined && topology !== 'linear' && topology !== 'none') {
    return 'Clip properties apply only to plain linear note clips.';
  }
  return null;
}

export const hasClipProperties = (packet: DataPacket) => clipPropertiesRefusal(packet) === null;

/**
 * The clip's properties, defaults filled in for whatever the packet does not carry. A clip with no
 * stored properties gets: 4/4, start 1.1.0, loop on over the whole length. The total length is the
 * frame's length exactly as stored; when the content runs past it (or there is no frame, where
 * 4 quarters is the least) it is the content rounded up to a whole bar of the clip's meter. Once
 * the clip carries stored properties its frame length is the composer's choice and is kept even
 * under the content (notes past the end are kept). A length over the cap of 72000 bars reads as the
 * cap. Each stored field is checked on its own; a malformed one falls back to its default.
 */
export function readClipProperties(packet: DataPacket): ClipProperties {
  const props = stored(packet);
  const timeSignature = isValidMeter(props?.timeSignature)
    ? props.timeSignature
    : DEFAULT_TIME_SIGNATURE;
  const framed = frameLength(packet);
  const content = contentExtent(packet);
  let length: Rational;
  if (framed && (props || content <= rationalToNumber(framed))) {
    length = framed;
  } else {
    const wanted = framed
      ? fromQuarters(content)
      : fromQuarters(Math.max(rationalToNumber(DEFAULT_CLIP_LENGTH), content));
    length = roundUpToBar(wanted, timeSignature);
  }
  // A clip already longer than the cap (an old clip with a far note, or a stored length from before
  // the cap) reads as exactly the cap, so its properties stay editable and freezing writes the cap.
  const bar = barQuarters(timeSignature);
  const cap = rational(MAX_CLIP_BARS * bar.numerator, bar.denominator);
  if (compareRational(length, cap) > 0) {
    length = cap;
  }
  const zero = rational(0);
  const within = (value: unknown, floor: Rational, ceiling: Rational, inclusive: boolean) =>
    isRational(value) &&
    compareRational(value, floor) >= 0 &&
    (inclusive ? compareRational(value, ceiling) <= 0 : compareRational(value, ceiling) < 0);
  const start = within(props?.start, zero, length, false) ? (props!.start as Rational) : zero;
  const loopStart = within(props?.loopStart, zero, length, false)
    ? (props!.loopStart as Rational)
    : zero;
  const loopEnd =
    isRational(props?.loopEnd) &&
    compareRational(props.loopEnd, loopStart) > 0 &&
    compareRational(props.loopEnd, length) <= 0
      ? props.loopEnd
      : length;
  return {
    length,
    start,
    loopOn: typeof props?.loopOn === 'boolean' ? props.loopOn : true,
    loopStart,
    loopEnd,
    timeSignature,
  };
}

/**
 * The packet with these properties written in (all of them, so the clip then carries every field;
 * unknown keys already in `metadata.clip` are kept). A clip properties do not apply to is returned
 * unchanged, never written.
 */
export function withClipProperties(packet: DataPacket, properties: ClipProperties): DataPacket {
  if (clipPropertiesRefusal(packet) !== null) {
    return packet;
  }
  const frame = packet.frame;
  return {
    ...packet,
    frame: {
      topology: 'linear',
      unit: 'quarterNote',
      origin: 0,
      musicalOrigin: musicalPosition(0),
      ...frame,
      extent: rationalToNumber(properties.length),
      musicalExtent: musicalDuration(properties.length.numerator, properties.length.denominator),
    },
    metadata: {
      ...packet.metadata,
      clip: {
        ...stored(packet),
        start: properties.start,
        loopOn: properties.loopOn,
        loopStart: properties.loopStart,
        loopEnd: properties.loopEnd,
        timeSignature: properties.timeSignature,
      },
    },
  };
}

/**
 * The packet with its full default property set written, when it is a note clip that carries none
 * yet (an old clip): the length is computed from the content as it is now, by `readClipProperties`.
 * Run on the packet BEFORE the first edit of any kind and build the edit on the result, so the
 * freeze and the edit are one packet, one version, one undo step. A clip that already carries
 * properties, or that has none to carry, is returned as is.
 */
export function freezeClipProperties(packet: DataPacket): DataPacket {
  if (clipPropertiesRefusal(packet) !== null || stored(packet) !== null) {
    return packet;
  }
  return withClipProperties(packet, readClipProperties(packet));
}

/** Why these properties cannot be, or null when they can. Nothing is clamped: the caller shows it. */
export function clipPropertiesError(properties: ClipProperties): string | null {
  const zero = rational(0);
  if (!isValidMeter(properties.timeSignature)) {
    return 'The time signature must be like 4/4: 1 to 32 beats over 1, 2, 4, 8, 16 or 32.';
  }
  if (compareRational(properties.length, zero) <= 0) {
    return 'The total length must be longer than zero.';
  }
  const bar = barQuarters(properties.timeSignature);
  if (
    compareRational(properties.length, rational(MAX_CLIP_BARS * bar.numerator, bar.denominator)) > 0
  ) {
    return `A clip cannot be longer than ${MAX_CLIP_BARS} bars.`;
  }
  if (
    compareRational(properties.start, zero) < 0 ||
    compareRational(properties.start, properties.length) >= 0
  ) {
    return 'Playback start must be inside the clip, before its end.';
  }
  if (compareRational(properties.loopStart, zero) < 0) {
    return 'The loop start cannot be before the clip start.';
  }
  if (compareRational(properties.loopEnd, properties.loopStart) <= 0) {
    return 'The loop length must be longer than zero.';
  }
  if (compareRational(properties.loopEnd, properties.length) > 0) {
    return 'The loop must stay within the total length.';
  }
  return null;
}

function sameProperties(a: ClipProperties, b: ClipProperties): boolean {
  return (
    compareRational(a.length, b.length) === 0 &&
    compareRational(a.start, b.start) === 0 &&
    a.loopOn === b.loopOn &&
    compareRational(a.loopStart, b.loopStart) === 0 &&
    compareRational(a.loopEnd, b.loopEnd) === 0 &&
    a.timeSignature === b.timeSignature
  );
}

export type ClipPropertiesEdit = { ok: true; packet: DataPacket } | { ok: false; error: string };

/** Applies a change to the clip's properties: the new packet, or the reason it was refused. */
export function editClipProperties(
  packet: DataPacket,
  change: Partial<ClipProperties>
): ClipPropertiesEdit {
  const refusal = clipPropertiesRefusal(packet);
  if (refusal) {
    return { ok: false, error: refusal };
  }
  const current = readClipProperties(packet);
  const next = { ...current, ...change };
  if (sameProperties(current, next)) {
    // Nothing changes (an equivalent value typed another way): no write, no defaults stored.
    return { ok: true, packet };
  }
  const error = clipPropertiesError(next);
  return error ? { ok: false, error } : { ok: true, packet: withClipProperties(packet, next) };
}
