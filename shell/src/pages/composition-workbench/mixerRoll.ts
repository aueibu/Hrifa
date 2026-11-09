/**
 * The mixer's composite roll: every event of the compiled plan as a piano-roll note, colored by
 * the channel that produced it. The roll reads the plan the engine will play, so what is drawn
 * is what is heard, including loop repeats and clipping.
 */

import type {
  PianoRollGridLine,
  PianoRollNote,
  PianoRollViewState,
} from '../../components/PianoRoll';
import type { MusicalPerformancePlan } from './audio/types';
import { channelBusId, modRational, type ChannelMaterial, type LoopPolicy } from './mixer';
import { mixerChannelColor } from './mixerChannels';
import { addRational, rationalToNumber, type MusicalDuration } from './musicalTime';
import { pitchLabel } from './routeTreatments';

/** Beyond this the roll draws a sample, since every note is a DOM element. */
export const MAX_ROLL_NOTES = 4000;

export interface MixerRoll {
  notes: PianoRollNote[];
  /** Events in the plan, which may exceed the notes drawn. */
  total: number;
  /** Length of one pass, in quarter notes. */
  duration: number;
}

/** `ports` are the channel ids in order; a channel's color follows its position. */
export function mixerRoll(
  plan: MusicalPerformancePlan | undefined,
  sourceId: string,
  ports: string[],
  limit = MAX_ROLL_NOTES
): MixerRoll {
  if (!plan) {
    return { notes: [], total: 0, duration: 1 };
  }
  const channelByBus = new Map(ports.map((port, index) => [channelBusId(sourceId, port), index]));
  const events = plan.events.length > limit ? plan.events.slice(0, limit) : plan.events;
  const notes = events.flatMap((event): PianoRollNote[] => {
    const channel = channelByBus.get(event.busId);
    if (channel === undefined) {
      return [];
    }
    return [
      {
        id: event.id,
        start: rationalToNumber(event.at.quarterNotes),
        duration: rationalToNumber(event.duration.quarterNotes),
        pitchMidicents: event.pitchMidicents,
        label: `Ch ${channel + 1} · ${pitchLabel(event.pitchMidicents)}`,
        velocity: event.velocity,
        color: mixerChannelColor(channel),
      },
    ];
  });
  return {
    notes,
    total: plan.events.length,
    duration: Math.max(1, rationalToNumber(plan.duration.quarterNotes)),
  };
}

/** Bar and beat lines for the roll, from the transport's meter. */
export function mixerRollGrid(duration: number, meterNumerator: number, meterDenominator: number) {
  const beatLength = 4 / meterDenominator;
  const barLength = meterNumerator * beatLength;
  const lines: PianoRollGridLine[] = [];
  let bar = 1;
  for (let barStart = 0; barStart <= duration; barStart += barLength) {
    lines.push({ at: barStart, kind: 'bar', label: String(bar) });
    for (let beat = 1; beat < meterNumerator; beat += 1) {
      const at = barStart + beat * beatLength;
      if (at <= duration) {
        lines.push({ at, kind: 'beat' });
      }
    }
    bar += 1;
  }
  return lines;
}

export interface MixerLane {
  notes: PianoRollNote[];
  /** Quarter notes the lane spans: one cycle, or the offset plus the cycle for a one-shot. */
  duration: number;
}

/**
 * One channel's own cycle as a lane. A looping channel's offset rotates the cycle (what wraps past
 * the end reappears at the start), as it does in the mix; a one-shot is delayed by its offset, so
 * its lane runs from the start of the pass to the end of its one play.
 */
export function mixerLane(
  material: ChannelMaterial,
  config: { loop: LoopPolicy; offset: MusicalDuration },
  channelIndex: number
): MixerLane {
  const period = material.period.quarterNotes;
  const offset = config.offset.quarterNotes;
  const once = config.loop === 'once';
  const notes = material.events.map((event): PianoRollNote => {
    const shifted = addRational(event.at.quarterNotes, offset);
    const at = once ? shifted : modRational(shifted, period);
    return {
      id: event.id,
      start: rationalToNumber(at),
      duration: rationalToNumber(event.duration.quarterNotes),
      pitchMidicents: event.pitchMidicents,
      label: `Ch ${channelIndex + 1} · ${pitchLabel(event.pitchMidicents)}`,
      velocity: event.velocity,
      color: mixerChannelColor(channelIndex),
    };
  });
  return {
    notes,
    duration: Math.max(1, rationalToNumber(once ? addRational(offset, period) : period)),
  };
}

const ROLL_RULER_HEIGHT = 32;
const MIN_PITCH_ZOOM = 12;
const MAX_PITCH_ZOOM = 36;

/**
 * A lane's view: the shared time scale, and a pitch zoom and scroll fitted to this lane's own
 * notes so a click rhythm and a wide melody each fill their lane. `framed` stops the roll from
 * re-fitting its time scale to its own width, which is what would defeat the shared scale.
 */
export function laneView(
  notes: Pick<PianoRollNote, 'pitchMidicents'>[],
  pixelsPerQuarter: number,
  scrollerHeight: number
): PianoRollViewState {
  const pitches = notes.map((note) => note.pitchMidicents / 100);
  const lowest = pitches.length ? Math.min(...pitches) : 60;
  const highest = pitches.length ? Math.max(...pitches) : 60;
  const span = Math.max(5, highest - lowest + 3);
  const pixelsPerSemitone = Math.min(
    MAX_PITCH_ZOOM,
    Math.max(MIN_PITCH_ZOOM, (scrollerHeight - ROLL_RULER_HEIGHT - 16) / span)
  );
  const scrollTop = Math.min(
    Math.max(0, 128 * pixelsPerSemitone - scrollerHeight + ROLL_RULER_HEIGHT),
    Math.max(0, (127 - highest - 1.5) * pixelsPerSemitone)
  );
  return {
    pixelsPerQuarter,
    pixelsPerSemitone,
    scrollLeft: 0,
    scrollTop,
    followPlayback: false,
    framed: true,
  };
}

/**
 * Where a channel's own playhead is, in its lane, given the mix's position within its pass (in
 * quarter notes). A free channel wraps at its own period; one that restarts with the longest
 * wraps within each block of the longest cycle, so it visibly resets; a one-shot runs once, in
 * pass time, and holds at the end.
 */
export function lanePlayhead(
  position: number,
  channel: { loop: LoopPolicy; period: number; offset: number },
  longest: number
) {
  if (channel.loop === 'once') {
    return Math.min(position, channel.offset + channel.period);
  }
  if (channel.loop === 'restart-with-longest') {
    return (position % longest) % channel.period;
  }
  return position % channel.period;
}

export interface CycleProgress {
  /** How many of its cycles (or restarts) a channel goes through in one pass. */
  cycles: number;
  /** 0 to 1 through the pass. */
  fill: number;
  /** Which cycle the pass is in now, from 1. */
  current: number;
}

/**
 * A channel's progress from one sync point to the next. A free channel counts its own cycles; one
 * that restarts with the longest counts those restarts, since that is where it re-syncs. A
 * one-shot has no cycles to count and gets no bar.
 */
export function cycleProgress(
  position: number,
  pass: number,
  channel: { loop: LoopPolicy; period: number },
  longest: number
): CycleProgress | undefined {
  if (channel.loop === 'once' || pass <= 0) {
    return undefined;
  }
  const unit = channel.loop === 'free' ? channel.period : longest;
  const cycles = Math.max(1, Math.round(pass / unit));
  return {
    cycles,
    fill: Math.min(1, Math.max(0, position / pass)),
    current: Math.min(cycles, Math.max(0, Math.floor(position / unit)) + 1),
  };
}
