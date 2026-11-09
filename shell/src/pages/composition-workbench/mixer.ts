/**
 * Mixer core: places several already-realized channels into one musical-time performance plan.
 *
 * Pure and UI-free. A channel is "one idea, looping, with an offset": its material (a set of
 * timed events plus the period it repeats over) comes from a realization step (a note packet
 * today, a rhythm packet once the shared rhythm realization exists). This file only decides when
 * each repeat of that material sounds. It knows nothing about tempo, packets' pulse units, the
 * metronome, or Tone; the engine resolves those at its own boundary.
 *
 * Loop policies:
 * - `free`: the channel repeats at its own period, independent of the others. Together the free
 *   channels repeat exactly every least common multiple of their periods (the "realignment
 *   period"), so one such window is the whole composite pattern.
 * - `restart-with-longest`: the channel repeats at its own period but is cut off and restarted
 *   together with the others every time the longest looping channel's cycle ends.
 * - `once`: the channel plays a single time (delayed by its offset), then is silent. If the plan
 *   is looped by the engine, it sounds once per pass.
 *
 * Offsets: on a looping channel the offset rotates the cycle (content pushed past the end wraps
 * to the start), matching cyclic `frame.origin`; on a `once` channel it is a plain delay.
 */

import type { InstrumentId, MusicalPerformanceEvent, MusicalPerformancePlan } from './audio/types';
import type { NoteEventValue } from './melodicization';
import type { DataPacket, Provenance } from './model';
import {
  addRational,
  compareRational,
  multiplyRational,
  musicalDuration,
  rational,
  subtractRational,
  type MusicalDuration,
  type MusicalPosition,
  type MusicalTimeline,
  type Rational,
} from './musicalTime';

export type LoopPolicy = 'free' | 'restart-with-longest' | 'once';

export interface MixerChannelConfig {
  /** Stable channel id; never a display index, so reordering never rewires anything. */
  id: string;
  loop: LoopPolicy;
  offset: MusicalDuration;
  gainPercent: number;
  muted: boolean;
  solo: boolean;
}

export const defaultChannelConfig = (id: string): MixerChannelConfig => ({
  id,
  loop: 'free',
  offset: musicalDuration(0),
  gainPercent: 100,
  muted: false,
  solo: false,
});

/** One sounding event inside a channel's material, positioned from the start of its cycle. */
export interface ChannelEvent {
  id: string;
  at: MusicalPosition;
  duration: MusicalDuration;
  pitchMidicents: number;
  velocity: number;
  instrumentId: InstrumentId;
  provenance: Provenance[];
}

/** A realized idea: its events and the length of the cycle it repeats over. */
export interface ChannelMaterial {
  events: ChannelEvent[];
  period: MusicalDuration;
  warnings: string[];
}

export interface MixerChannel {
  config: MixerChannelConfig;
  material: ChannelMaterial;
}

export interface MixerPlanOptions {
  /** The mixer module instance; the plan's sourceId, so global Stop and the playhead find it. */
  sourceId: string;
  timeline: MusicalTimeline;
  channels: MixerChannel[];
  /** Longest window the mixer will unroll. Default 128 bars of 4/4 (512 quarter notes). */
  maxHorizon?: MusicalDuration;
  /** Refuse to build a plan larger than this many events. */
  maxEvents?: number;
}

export interface MixerPlanResult {
  /** Undefined when there is nothing to play or the plan would be too large. */
  plan?: MusicalPerformancePlan;
  /** The length of one pass of the composite pattern, if the channels realign within the horizon. */
  realignment?: MusicalDuration;
  /**
   * True when the plan is exactly one period of the composite pattern, so an engine may loop it
   * without a seam. False when the horizon truncated it or every channel is `once`.
   */
  loopable: boolean;
  /**
   * True when the looping channels do not realign within the horizon, so the plan is only the
   * first part of a longer pattern: it plays once and does not close, and any progress measured
   * along it is progress through this preview, not toward the true sync.
   */
  truncated: boolean;
  warnings: string[];
}

export const defaultMaxHorizon = musicalDuration(512);
export const defaultMaxEvents = 20_000;

export function channelBusId(sourceId: string, channelId: string) {
  return `mixer:${sourceId}:${channelId}`;
}

/** Live bus gain per channel, honouring mute and solo (any solo silences every non-soloed channel). */
export function channelBusGains(
  sourceId: string,
  configs: MixerChannelConfig[],
  percentToGain: (percent: number) => number
): Record<string, number> {
  const anySolo = configs.some((config) => config.solo);
  return Object.fromEntries(
    configs.map((config) => [
      channelBusId(sourceId, config.id),
      config.muted || (anySolo && !config.solo) ? 0 : percentToGain(config.gainPercent),
    ])
  );
}

// ---------------------------------------------------------------------------------------------
// Rational helpers

function gcdInt(left: number, right: number) {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}

function lcmInt(left: number, right: number) {
  const value = (left / gcdInt(left, right)) * right;
  if (!Number.isSafeInteger(value)) {
    throw new RangeError('Least common multiple exceeds safe integer range.');
  }
  return value;
}

/**
 * Least common multiple of positive rationals: lcm(a/b, c/d) = lcm(a, c) / gcd(b, d) for reduced
 * fractions. Undefined when the result leaves the safe-integer range.
 */
export function lcmRational(values: Rational[]): Rational | undefined {
  if (!values.length) {
    return undefined;
  }
  try {
    let numerator = values[0].numerator;
    let denominator = values[0].denominator;
    for (const value of values.slice(1)) {
      numerator = lcmInt(numerator, value.numerator);
      denominator = gcdInt(denominator, value.denominator);
    }
    return rational(numerator, denominator);
  } catch {
    return undefined;
  }
}

function floorDivide(value: Rational, period: Rational) {
  return Math.floor(
    (value.numerator * period.denominator) / (value.denominator * period.numerator)
  );
}

/** value mod period, in [0, period). */
export function modRational(value: Rational, period: Rational) {
  return subtractRational(value, multiplyRational(period, floorDivide(value, period)));
}

const zero = rational(0);

function minRational(left: Rational, right: Rational) {
  return compareRational(left, right) <= 0 ? left : right;
}

// ---------------------------------------------------------------------------------------------
// Material from packets

/**
 * An `events | note` packet as channel material. The cycle is the frame's musical extent when it
 * has one, otherwise the end of the last note.
 */
export function materialFromNotePacket(
  packet: DataPacket<NoteEventValue>,
  instrumentId: InstrumentId = 'preview.triangle'
): ChannelMaterial {
  if (packet.kind !== 'events' || packet.domain !== 'note') {
    throw new Error('Mixer note material requires an events | note packet.');
  }
  let period = packet.frame?.musicalExtent?.quarterNotes ?? zero;
  const events = packet.items.flatMap((item) => {
    const end = addRational(item.value.onset.quarterNotes, item.value.duration.quarterNotes);
    if (compareRational(end, period) > 0 && !packet.frame?.musicalExtent) {
      period = end;
    }
    return item.value.pitches.map(
      (pitchMidicents, pitchIndex): ChannelEvent => ({
        id: `${item.id}:pitch:${pitchIndex}`,
        at: item.value.onset,
        duration: item.value.duration,
        pitchMidicents,
        velocity: item.value.velocity,
        instrumentId,
        provenance: item.provenance,
      })
    );
  });
  return { events, period: { quarterNotes: period }, warnings: [...packet.warnings] };
}

// ---------------------------------------------------------------------------------------------
// Compilation

function isUsable(channel: MixerChannel) {
  return (
    channel.material.events.length > 0 &&
    compareRational(channel.material.period.quarterNotes, zero) > 0
  );
}

function describeLoops(usable: MixerChannel[]) {
  const periodOf = (channel: MixerChannel) => channel.material.period.quarterNotes;
  const loopers = usable.filter((channel) => channel.config.loop !== 'once');
  const hasRestart = loopers.some((channel) => channel.config.loop === 'restart-with-longest');
  const longest = loopers.reduce<Rational>(
    (best, channel) => (compareRational(periodOf(channel), best) > 0 ? periodOf(channel) : best),
    zero
  );
  // The composite repeats every lcm of the free periods, plus the longest cycle when any channel
  // restarts on it.
  const periodsForRealignment = [
    ...loopers.filter((channel) => channel.config.loop === 'free').map(periodOf),
    ...(hasRestart ? [longest] : []),
  ];
  const realignmentValue = loopers.length ? lcmRational(periodsForRealignment) : undefined;
  return { loopers, longest, realignmentValue };
}

/**
 * How long one pass of the composite pattern is, without unrolling any events: the least common
 * multiple of the looping channels' cycles. Undefined when nothing loops or the value overflows.
 */
export function mixerRealignment(channels: MixerChannel[]): MusicalDuration | undefined {
  const { realignmentValue } = describeLoops(channels.filter(isUsable));
  return realignmentValue ? { quarterNotes: realignmentValue } : undefined;
}

export function compileMixerPlan({
  sourceId,
  timeline,
  channels,
  maxHorizon = defaultMaxHorizon,
  maxEvents = defaultMaxEvents,
}: MixerPlanOptions): MixerPlanResult {
  const warnings: string[] = [];
  const usable = channels.filter(isUsable);
  channels
    .filter((channel) => !isUsable(channel))
    .forEach((channel) =>
      warnings.push(`Channel ${channel.config.id} has no playable material and was left out.`)
    );
  if (!usable.length) {
    return { loopable: false, truncated: false, warnings: [...warnings, 'Nothing to play.'] };
  }

  const periodOf = (channel: MixerChannel) => channel.material.period.quarterNotes;
  const { loopers, longest, realignmentValue } = describeLoops(usable);

  const horizon = maxHorizon.quarterNotes;
  const onceEnd = usable
    .filter((channel) => channel.config.loop === 'once')
    .reduce<Rational>(
      (end, channel) =>
        compareRational(addRational(channel.config.offset.quarterNotes, periodOf(channel)), end) > 0
          ? addRational(channel.config.offset.quarterNotes, periodOf(channel))
          : end,
      zero
    );

  let duration: Rational;
  let loopable = false;
  let truncated = false;
  let realignment: MusicalDuration | undefined;
  if (!loopers.length) {
    duration = onceEnd;
    if (compareRational(duration, horizon) > 0) {
      duration = horizon;
      warnings.push('The one-shot channels run longer than the horizon; the plan is cut there.');
    }
  } else if (realignmentValue && compareRational(realignmentValue, horizon) <= 0) {
    duration = realignmentValue;
    realignment = { quarterNotes: realignmentValue };
    loopable = true;
    if (compareRational(onceEnd, duration) > 0) {
      warnings.push('A one-shot channel is longer than one pass and is cut at the pass end.');
    }
  } else {
    duration = horizon;
    truncated = true;
    warnings.push(
      realignmentValue
        ? 'The channels realign later than the horizon, so only the first part of the pattern plays.'
        : 'The channels’ realignment period is too large to compute; only the first part plays.'
    );
  }

  const events: MusicalPerformanceEvent[] = [];
  let tooMany = false;

  const place = (
    channel: MixerChannel,
    event: ChannelEvent,
    at: Rational,
    limit: Rational,
    pass: number
  ) => {
    if (compareRational(at, limit) >= 0) {
      return;
    }
    const end = minRational(addRational(at, event.duration.quarterNotes), limit);
    const length = subtractRational(end, at);
    if (compareRational(length, zero) <= 0) {
      return;
    }
    if (events.length >= maxEvents) {
      tooMany = true;
      return;
    }
    events.push({
      id: `${sourceId}:${channel.config.id}:${pass}:${event.id}`,
      at: { quarterNotes: at },
      duration: { quarterNotes: length },
      pitchMidicents: event.pitchMidicents,
      velocity: event.velocity,
      instrumentId: event.instrumentId,
      busId: channelBusId(sourceId, channel.config.id),
      provenance: [
        ...event.provenance,
        {
          sourceModuleInstance: sourceId,
          sourceItemIds: [event.id],
          transformation: 'mixer-place',
          parameters: { channel: channel.config.id, pass, loop: channel.config.loop },
        },
      ],
    });
  };

  for (const channel of usable) {
    const period = periodOf(channel);
    const offset = channel.config.offset.quarterNotes;
    if (channel.config.loop === 'once') {
      for (const event of channel.material.events) {
        place(channel, event, addRational(event.at.quarterNotes, offset), duration, 0);
      }
      continue;
    }
    const rotated = channel.material.events.map((event) => ({
      event,
      local: modRational(addRational(event.at.quarterNotes, offset), period),
    }));
    if (channel.config.loop === 'free') {
      for (let pass = 0; compareRational(multiplyRational(period, pass), duration) < 0; pass += 1) {
        const base = multiplyRational(period, pass);
        rotated.forEach(({ event, local }) =>
          place(channel, event, addRational(base, local), duration, pass)
        );
        if (tooMany) {
          break;
        }
      }
    } else {
      // restart-with-longest: repeat within each block of the longest cycle, clipped at its end.
      for (
        let block = 0;
        compareRational(multiplyRational(longest, block), duration) < 0;
        block += 1
      ) {
        const blockStart = multiplyRational(longest, block);
        const blockEnd = minRational(addRational(blockStart, longest), duration);
        for (
          let pass = 0;
          compareRational(multiplyRational(period, pass), longest) < 0;
          pass += 1
        ) {
          const base = addRational(blockStart, multiplyRational(period, pass));
          rotated.forEach(({ event, local }) =>
            place(channel, event, addRational(base, local), blockEnd, block * 1000 + pass)
          );
          if (tooMany) {
            break;
          }
        }
        if (tooMany) {
          break;
        }
      }
    }
    if (tooMany) {
      break;
    }
  }

  if (tooMany) {
    return {
      loopable: false,
      truncated,
      realignment,
      warnings: [
        ...warnings,
        `The mixed pattern has more than ${maxEvents} events; shorten a channel or change a loop policy.`,
      ],
    };
  }

  events.sort((left, right) => compareRational(left.at.quarterNotes, right.at.quarterNotes));
  usable.forEach((channel) => warnings.push(...channel.material.warnings));

  return {
    plan: {
      id: `${sourceId}:mixer-preview`,
      sourceId,
      timebase: { kind: 'musical', timeline },
      duration: { quarterNotes: duration },
      events,
      warnings,
    },
    realignment,
    loopable,
    truncated,
    warnings,
  };
}
