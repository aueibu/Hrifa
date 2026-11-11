/**
 * Mixer channel settings and the step that turns a connected packet into channel material.
 *
 * The mixer plays two kinds of idea: an `events | note` stream (Melodicization's output) and an
 * inter-onset rhythm, which is realized on a rhythm voice through the shared rhythm realization.
 * Anything else is reported, never guessed at: a pitch list has no rhythm, and a numeric list that
 * has not been explicitly interpreted as rhythm on its route is not offered a sound.
 */

import type { NoteEventValue } from './melodicization';
import { materialFromNotePacket, type ChannelMaterial, type LoopPolicy } from './mixer';
import type { DataPacket } from './model';
import type { MusicalDuration } from './musicalTime';
import {
  DEFAULT_GATE_PERCENT,
  MAX_GATE_PERCENT,
  MIN_GATE_PERCENT,
  materialFromRhythmPacket,
} from './rhythmRealization';
import { rhythmInterpretableDomains } from './routeTreatments';
import { isSoundOverride, type ResolvedSound, type SoundOverride } from './sounds';

export interface MixerChannelSettings {
  loop: LoopPolicy;
  /** Start offset in transport pulses: rotates a looping channel, delays a one-shot. */
  offsetPulses: number;
  gainPercent: number;
  muted: boolean;
  solo: boolean;
  /** Rhythm channels only: how long each attack sounds, as a share of its slot. */
  gatePercent: number;
  /** Rhythm channels only: a sound for this channel instead of the next rhythm voice. */
  sound: SoundOverride | null;
}

export type MixerChannelsState = Record<string, MixerChannelSettings>;

/** −10 dB (a gain of 10^(−10/20) ≈ 0.316), leaving headroom for several channels to sum. */
export const DEFAULT_MIXER_GAIN_PERCENT = Math.round(1000 * 10 ** (-10 / 20)) / 10;

export const defaultMixerChannelSettings: MixerChannelSettings = {
  loop: 'free',
  offsetPulses: 0,
  gainPercent: DEFAULT_MIXER_GAIN_PERCENT,
  muted: false,
  solo: false,
  gatePercent: DEFAULT_GATE_PERCENT,
  sound: null,
};

export const loopPolicyOptions: { value: LoopPolicy; label: string }[] = [
  { value: 'free', label: 'Loop freely' },
  { value: 'restart-with-longest', label: 'Restart with longest' },
  { value: 'once', label: 'Play once' },
];

function isLoopPolicy(value: unknown): value is LoopPolicy {
  return value === 'free' || value === 'restart-with-longest' || value === 'once';
}

function isChannelSettings(value: unknown): value is MixerChannelSettings {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const settings = value as Partial<MixerChannelSettings>;
  return (
    isLoopPolicy(settings.loop) &&
    typeof settings.offsetPulses === 'number' &&
    Number.isSafeInteger(settings.offsetPulses) &&
    settings.offsetPulses >= 0 &&
    typeof settings.gainPercent === 'number' &&
    Number.isFinite(settings.gainPercent) &&
    typeof settings.muted === 'boolean' &&
    typeof settings.solo === 'boolean' &&
    typeof settings.gatePercent === 'number' &&
    Number.isFinite(settings.gatePercent) &&
    (settings.sound === null || isSoundOverride(settings.sound))
  );
}

export function acceptsMixerChannels(value: unknown): value is MixerChannelsState {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    Object.values(value as object).every(isChannelSettings)
  );
}

export { MAX_GATE_PERCENT, MIN_GATE_PERCENT };

/** What a mixer inlet may be connected to, before any route treatment is applied. */
export function isMixerSourceCandidate(packet: DataPacket) {
  return (
    (packet.kind === 'events' && packet.domain === 'note') ||
    (packet.kind === 'list' && rhythmInterpretableDomains.has(packet.domain))
  );
}

export type MixerChannelMaterial =
  | { status: 'ready'; source: 'notes' | 'rhythm'; material: ChannelMaterial }
  | { status: 'empty' }
  | { status: 'error'; message: string };

/** The packet that arrives at a channel (after its route treatment) as playable material. */
export function mixerChannelMaterial(
  packet: DataPacket | undefined,
  options: {
    sourceId: string;
    channelId: string;
    pulseUnit: MusicalDuration;
    sound: ResolvedSound;
    gatePercent: number;
  }
): MixerChannelMaterial {
  if (!packet) {
    return { status: 'empty' };
  }
  try {
    if (packet.kind === 'events' && packet.domain === 'note') {
      return {
        status: 'ready',
        source: 'notes',
        material: materialFromNotePacket(packet as DataPacket<NoteEventValue>),
      };
    }
    if (packet.kind === 'list' && packet.domain === 'duration' && packet.role === 'interOnset') {
      return {
        status: 'ready',
        source: 'rhythm',
        material: materialFromRhythmPacket(packet as DataPacket<number>, {
          sourceId: options.sourceId,
          layerId: options.channelId,
          pulseUnit: options.pulseUnit,
          sound: options.sound,
          gatePercent: options.gatePercent,
        }),
      };
    }
    if (packet.kind === 'list' && rhythmInterpretableDomains.has(packet.domain)) {
      return {
        status: 'error',
        message: 'This is numeric, not yet a rhythm. Turn on “Interpret as rhythm” on this route.',
      };
    }
    return {
      status: 'error',
      message: `${packet.kind} | ${packet.domain} has no rhythm to play. Connect notes or a rhythm.`,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Could not read this source.',
    };
  }
}

// Distinct hues for telling channels apart in the roll, in the theme's order of separation. Red is
// left out: it is the playhead.
const channelColorNames = ['blue', 'orange', 'green', 'pink', 'cyan', 'yellow', 'violet', 'teal'];

/** A theme mark color for the channel at this position; repeats after eight channels. */
export function mixerChannelColor(index: number) {
  return `var(--mark-${channelColorNames[index % channelColorNames.length]})`;
}

/**
 * How long a channel's cycle is, in the units a composer counts in: transport pulses (when the
 * length is a whole number of them) and bars of the current meter. Takes lengths in quarter notes.
 */
export function describeChannelLength(
  periodQuarters: number,
  pulseQuarters: number,
  barQuarters: number
) {
  const parts: string[] = [];
  const pulses = periodQuarters / pulseQuarters;
  if (Number.isFinite(pulses) && Math.abs(pulses - Math.round(pulses)) < 1e-9) {
    const whole = Math.round(pulses);
    parts.push(`${whole} ${whole === 1 ? 'pulse' : 'pulses'}`);
  }
  const bars = periodQuarters / barQuarters;
  if (Number.isFinite(bars)) {
    const text = bars.toFixed(2).replace(/\.?0+$/, '');
    parts.push(`${text} ${text === '1' ? 'bar' : 'bars'}`);
  }
  return parts.join(' · ');
}
