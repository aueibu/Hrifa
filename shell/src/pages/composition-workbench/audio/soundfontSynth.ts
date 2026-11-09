/**
 * Plays notes through a SoundFont with SpessaSynth, a full SoundFont 2 synthesizer, and returns the result as
 * audio. Everything the file specifies is honored: volume and modulation envelopes, filters and their
 * resonance, vibrato and tremolo, panning, stereo pairs, loops, velocity layers, modulators, and the reverb and
 * chorus sends.
 *
 * The notes of a performance plan are rendered in one pass, faster than real time, and the engine then plays the
 * finished audio at the right moment. Rendering ahead keeps timing exact and lets every release ring out
 * naturally, and it needs no AudioWorklet, so it works with the engine's own audio context.
 */
import type { BasicSoundBank } from 'spessasynth_core';
import type { SoundfontPatch } from './soundfontLibrary';

/** The part of `SpessaSynthProcessor` this module uses, so tests can stand in for the real one. */
export interface SynthProcessorLike {
  readonly ready: Promise<void>;
  readonly midiChannels: unknown[];
  readonly soundBankManager: { addSoundBank(bank: BasicSoundBank, id: string): void };
  createMIDIChannel(): void;
  controllerChange(channel: number, controller: number, value: number): void;
  programChange(channel: number, program: number): void;
  pitchWheel(channel: number, value: number): void;
  noteOn(channel: number, note: number, velocity: number): void;
  noteOff(channel: number, note: number): void;
  process(left: Float32Array, right: Float32Array, startIndex: number, sampleCount: number): void;
  stopAll(force?: boolean): void;
}

export interface SoundfontNote {
  /** Seconds from the start of the render. */
  at: number;
  durationSeconds: number;
  /** MIDI note number; fractions are played as cents of channel pitch bend. */
  midi: number;
  /** 0 to 1. */
  velocity: number;
  patch: SoundfontPatch;
}

export interface SoundfontRender {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
}

export interface RenderSoundfontOptions {
  bank: BasicSoundBank;
  notes: SoundfontNote[];
  sampleRate: number;
  /** Replaces the real synthesizer, for tests. */
  createProcessor?: (sampleRate: number) => Promise<SynthProcessorLike> | SynthProcessorLike;
  /** Samples rendered between pauses that let the page breathe. Defaults to one second of audio. */
  yieldEvery?: number;
}

/** The synthesizer renders in blocks this long. */
const BLOCK = 128;
/** Rendering stops this long after the last note ends, even if something is still ringing. */
const MAX_TAIL_SECONDS = 12;
/** ...or as soon as the output has been this quiet for this long. */
const SILENT_SECONDS = 0.35;
const SILENCE_LEVEL = 1e-5;
const DRUM_CHANNEL = 9;
const BANK_SELECT_MSB = 0;
const BANK_SELECT_LSB = 32;
/** General MIDI's default pitch-bend range, in semitones either way. */
const BEND_RANGE_CENTS = 200;
const BEND_CENTER = 8192;

async function defaultProcessor(sampleRate: number): Promise<SynthProcessorLike> {
  const { SpessaSynthProcessor } = await import('spessasynth_core');
  return new SpessaSynthProcessor(sampleRate, {
    maxBufferSize: BLOCK,
    effectsEnabled: true,
    eventsEnabled: false,
    initialTime: 0,
  }) as unknown as SynthProcessorLike;
}

interface Slot {
  channel: number;
  patch: SoundfontPatch;
  /** Pitch bend in cents applied to the whole channel. */
  cents: number;
}

const patchKey = (p: SoundfontPatch) =>
  `${p.isDrum ? 'd' : 'm'}${p.bankMSB}.${p.bankLSB}.${p.program}`;

/**
 * Give each distinct patch (and each distinct fraction of a semitone) its own MIDI channel, since pitch bend is
 * per channel. Channel 10 is kept for drum kits and extra channels are added past the usual sixteen.
 */
function assignChannels(notes: SoundfontNote[], processor: SynthProcessorLike) {
  const slots = new Map<string, Slot>();
  const channelOf = new Map<SoundfontNote, { slot: Slot; note: number }>();
  const melodic = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
  let next = 0;
  const nextChannel = () => {
    const channel = next < melodic.length ? melodic[next] : 16 + (next - melodic.length);
    next++;
    while (processor.midiChannels.length <= channel) {
      processor.createMIDIChannel();
    }
    return channel;
  };
  notes.forEach((n) => {
    const note = Math.max(0, Math.min(127, Math.round(n.midi)));
    const cents = n.patch.isDrum ? 0 : Math.round((n.midi - note) * 100);
    const key = `${patchKey(n.patch)}|${cents}`;
    let slot = slots.get(key);
    if (!slot) {
      slot = { channel: n.patch.isDrum ? DRUM_CHANNEL : nextChannel(), patch: n.patch, cents };
      slots.set(key, slot);
    }
    channelOf.set(n, { slot, note });
  });
  return { slots: [...slots.values()], channelOf };
}

/** Render notes through a SoundFont to stereo audio. */
export async function renderSoundfont(options: RenderSoundfontOptions): Promise<SoundfontRender> {
  const { bank, notes, sampleRate } = options;
  const processor = await (options.createProcessor ?? defaultProcessor)(sampleRate);
  try {
    await processor.ready;
    processor.soundBankManager.addSoundBank(bank, 'main');

    const { slots, channelOf } = assignChannels(notes, processor);
    slots.forEach(({ channel, patch, cents }) => {
      processor.controllerChange(channel, BANK_SELECT_MSB, patch.bankMSB);
      processor.controllerChange(channel, BANK_SELECT_LSB, patch.bankLSB);
      processor.programChange(channel, patch.program);
      if (cents !== 0) {
        processor.pitchWheel(
          channel,
          BEND_CENTER + Math.round((cents / BEND_RANGE_CENTS) * BEND_CENTER)
        );
      }
    });

    // note-offs sort before note-ons that land on the same sample, so a repeated note retriggers cleanly
    const events = notes
      .flatMap((n) => {
        const { slot, note } = channelOf.get(n)!;
        const velocity = Math.max(1, Math.min(127, Math.round(n.velocity * 127)));
        const on = Math.max(0, Math.round(n.at * sampleRate));
        const off = Math.max(on + 1, Math.round((n.at + n.durationSeconds) * sampleRate));
        return [
          { sample: on, on: true, channel: slot.channel, note, velocity },
          { sample: off, on: false, channel: slot.channel, note, velocity },
        ];
      })
      .sort((a, b) => a.sample - b.sample || Number(a.on) - Number(b.on));
    const lastEvent = events.at(-1)?.sample ?? 0;

    const capacity = Math.ceil((lastEvent + MAX_TAIL_SECONDS * sampleRate) / BLOCK) * BLOCK + BLOCK;
    const left = new Float32Array(capacity);
    const right = new Float32Array(capacity);
    const quietBlocksNeeded = Math.ceil((SILENT_SECONDS * sampleRate) / BLOCK);
    const yieldEvery = options.yieldEvery ?? sampleRate;

    let cursor = 0;
    let quiet = 0;
    let end = 0;
    let sinceYield = 0;
    for (let start = 0; start + BLOCK <= capacity; start += BLOCK) {
      while (cursor < events.length && events[cursor].sample < start + BLOCK) {
        const e = events[cursor++];
        if (e.on) {
          processor.noteOn(e.channel, e.note, e.velocity);
        } else {
          processor.noteOff(e.channel, e.note);
        }
      }
      processor.process(left, right, start, BLOCK);
      let peak = 0;
      for (let i = start; i < start + BLOCK; i++) {
        peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
      }
      end = start + BLOCK;
      quiet = peak < SILENCE_LEVEL ? quiet + 1 : 0;
      if (cursor >= events.length && quiet >= quietBlocksNeeded) {
        break;
      }
      sinceYield += BLOCK;
      if (sinceYield >= yieldEvery) {
        sinceYield = 0;
        await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
      }
    }
    return { left: left.slice(0, end), right: right.slice(0, end), sampleRate };
  } finally {
    // Not destroy(): destroying a processor also destroys the sound bank it was given, and the bank is shared
    // by every render of the file, so the next render would play silence. Stopping voices and dropping the
    // processor is enough; it holds no threads or timers.
    processor.stopAll(true);
  }
}
