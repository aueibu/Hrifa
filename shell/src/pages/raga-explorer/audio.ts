/** Playback engine for the raga explorer: a melody scheduler (aroha then avaroha, optionally looping, through a
 * choice of instrument voices) plus an independent tanpura drone loop, mixed through their own gain nodes.
 *
 * Instrument sound comes from `smplr` (https://github.com/danigb/smplr, MIT), a real sampled-instrument library --
 * `Soundfont` loads actual General MIDI instrument recordings (sitar, dulcimer, pan_flute, violin all exist as
 * real GM patches) from a CDN, with no server, API key or account needed. This replaced an earlier from-scratch
 * Karplus-Strong physical model: however carefully that was tuned, it was fundamentally a generic synthesized
 * pluck, not a real instrument -- the actual timbre now comes from real recordings, which is the only thing that
 * was ever going to get there. The one exception is the "Plain tone" preset, which is intentionally not trying to
 * sound like an instrument at all, so it stays a bare oscillator (see scheduleSine). */
import { Soundfont, type Smplr } from 'smplr';
import type { MelodyInstrument } from './settings';

const GM_INSTRUMENT: Partial<Record<MelodyInstrument, string>> = {
  sitar: 'sitar',
  santoor: 'dulcimer', // the closest General MIDI patch to a santoor/santur (western name: dulcimer)
  bansuri: 'pan_flute', // breathier, closer to a bansuri's character than the orchestral "flute" patch
  violin: 'violin',
};

const TANPURA_GM_INSTRUMENT = 'sitar'; // no GM "tanpura" patch exists; a plucked-string drone is the closest fit

// santoor is struck with two mallets in quick succession, not one clean pluck -- a second, quieter strike ~14ms
// after the first gives it that hammered-dulcimer double-attack character.
const SANTOOR_STRIKE_OFFSET_S = 0.014;

/** A true hard ceiling, in dBFS: every sample is clamped to +-that amplitude, no exceptions. Several real
 * instrument samples overlapping (especially the tanpura drone under a melody line) can still sum past 0 dBFS;
 * this is the unconditional backstop regardless of how many voices are sounding at once. */
function hardCeilingCurve(dbCeiling: number, samples = 2048): Float32Array {
  const ceiling = 10 ** (dbCeiling / 20);
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1; // -1..1
    curve[i] = Math.max(-ceiling, Math.min(ceiling, x));
  }
  return curve;
}

/** freq (Hz) -> the nearest MIDI note plus the exact leftover in cents, so a Soundfont instrument (which is
 * triggered by MIDI note number) can still sound the exact microtonal frequency this raga's canonical chain
 * asks for, not just the nearest equal-tempered semitone. */
function hzToMidiAndDetune(freq: number): { midi: number; detuneCents: number } {
  const midiExact = 69 + 12 * Math.log2(freq / 440);
  const midi = Math.round(midiExact);
  const detuneCents = (midiExact - midi) * 100;
  return { midi, detuneCents };
}

export function semitoneToHz(semitone: number, tonicHz: number): number {
  return tonicHz * 2 ** (semitone / 12);
}

/** The one hand-built voice left: a plain oscillator with a short linear envelope, for the "Plain tone" preset,
 * which deliberately isn't trying to sound like any particular instrument. No feedback loop, no tuning
 * correction needed (an OscillatorNode's frequency IS the pitch, exactly), nothing to go wrong. */
function scheduleSine(
  ctx: AudioContext,
  dest: AudioNode,
  freq: number,
  t: number,
  dur: number,
  peakGain: number
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(dest);
  const attack = Math.min(0.02, dur * 0.3);
  const release = Math.min(0.05, dur * 0.3);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(peakGain, t + attack);
  gain.gain.setValueAtTime(peakGain, Math.max(t + attack, t + dur - release));
  gain.gain.linearRampToValueAtTime(0, t + dur);
  osc.start(t);
  osc.stop(t + dur + 0.05);
  const ms = dur * 1000 + 200;
  globalThis.setTimeout(() => {
    try {
      osc.disconnect();
      gain.disconnect();
    } catch {
      // already disconnected -- fine
    }
  }, ms);
}

export interface MelodyPlan {
  /** Canonical chain positions (Sa=0), aroha followed by avaroha, already transposed for the chosen root sargam. */
  semitones: number[];
  tonicHz: number;
  instrument: MelodyInstrument;
  noteDurationMs: number;
  gapMs: number;
  loop: boolean;
}

export interface MelodyCallbacks {
  onNoteIndex?: (index: number | null) => void; // null when nothing is sounding (stopped, or between loop passes)
  onStop?: () => void;
}

const SCHEDULE_AHEAD_S = 0.35; // how far ahead of ctx.currentTime one batch is queued
const LOOKAHEAD_MS = 100; // how often the scheduler wakes to queue the next batch

/** One drone/melody player instance per raga-explorer page mount. Lazily creates its AudioContext on first play
 * (browsers refuse to start one before a user gesture), and cleans everything up on `dispose()`. Sampled
 * instruments are cached per GM name + bus, so switching between ragas (or replaying the same instrument) after
 * the first load is instant -- only the very first note on a given instrument waits on its sample fetch. */
export class RagaAudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private melodyGain: GainNode | null = null;
  private tanpuraGain: GainNode | null = null;
  private melodyInstruments = new Map<string, Smplr>();
  private tanpuraInstrument: Smplr | null = null;

  private melodyTimer: ReturnType<typeof globalThis.setInterval> | null = null;
  private melodyGeneration = 0;
  // read fresh on every scheduler tick (see playMelody) rather than captured once when Play was pressed, so
  // dragging the tempo/gap sliders WHILE a loop is already running changes it immediately, not only after the
  // next Stop+Play.
  private melodyTiming = { noteDurationMs: 380, gapMs: 40 };

  setMelodyTiming(noteDurationMs: number, gapMs: number) {
    this.melodyTiming.noteDurationMs = noteDurationMs;
    this.melodyTiming.gapMs = gapMs;
  }

  private tanpuraTimer: ReturnType<typeof globalThis.setInterval> | null = null;
  private tanpuraGeneration = 0;

  private ensureGraph(): { ctx: AudioContext; melody: GainNode; tanpura: GainNode } {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.85;
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 0;
      limiter.ratio.value = 20; // the Web Audio spec's maximum
      limiter.attack.value = 0.003;
      limiter.release.value = 0.15;
      const ceiling = this.ctx.createWaveShaper();
      ceiling.curve = hardCeilingCurve(-6) as Float32Array<ArrayBuffer>;
      ceiling.oversample = '4x';
      this.master.connect(limiter);
      limiter.connect(ceiling);
      ceiling.connect(this.ctx.destination);
      this.melodyGain = this.ctx.createGain();
      this.melodyGain.connect(this.master);
      this.tanpuraGain = this.ctx.createGain();
      this.tanpuraGain.connect(this.master);
    }
    void this.ctx.resume();
    return { ctx: this.ctx, melody: this.melodyGain!, tanpura: this.tanpuraGain! };
  }

  /** Cached per GM instrument name -- reused across notes and across plays, so only the first note on a given
   * instrument in a session waits on its sample fetch. */
  private async getMelodyInstrument(name: string): Promise<Smplr> {
    const { ctx, melody } = this.ensureGraph();
    let inst = this.melodyInstruments.get(name);
    if (!inst) {
      inst = Soundfont(ctx, { instrument: name, destination: melody });
      this.melodyInstruments.set(name, inst);
    }
    await inst.ready;
    return inst;
  }

  private async getTanpuraInstrument(): Promise<Smplr> {
    const { ctx, tanpura } = this.ensureGraph();
    if (!this.tanpuraInstrument) {
      this.tanpuraInstrument = Soundfont(ctx, {
        instrument: TANPURA_GM_INSTRUMENT,
        destination: tanpura,
      });
    }
    await this.tanpuraInstrument.ready;
    return this.tanpuraInstrument;
  }

  setMelodyVolume(v: number) {
    if (this.melodyGain) {
      this.melodyGain.gain.value = Math.max(0, Math.min(1, v));
    }
  }

  setTanpuraVolume(v: number) {
    if (this.tanpuraGain) {
      this.tanpuraGain.gain.value = Math.max(0, Math.min(1, v));
    }
  }

  stopMelody() {
    this.melodyGeneration++;
    if (this.melodyTimer != null) {
      clearInterval(this.melodyTimer);
      this.melodyTimer = null;
    }
    for (const inst of this.melodyInstruments.values()) {inst.stop();}
  }

  /** Plays `plan.semitones` in order on the chosen instrument voice, optionally looping with a short breath
   * between passes. A lookahead scheduler queues notes in small batches so a loop can run indefinitely without
   * drift or building up an ever-growing pile of scheduled voices. The chosen instrument's samples load
   * asynchronously (skipped entirely for the already-cached, non-network "Plain tone" oscillator); if `stop()` is
   * called before that finishes, the load is simply not used. */
  playMelody(plan: MelodyPlan, callbacks: MelodyCallbacks = {}) {
    this.stopMelody();
    if (plan.semitones.length === 0) {
      return;
    }
    const generation = this.melodyGeneration;
    this.setMelodyTiming(plan.noteDurationMs, plan.gapMs); // seed the live timing from this plan's initial values
    const gmName = GM_INSTRUMENT[plan.instrument];

    void (async () => {
      const { ctx, melody } = this.ensureGraph();
      const instrument = gmName ? await this.getMelodyInstrument(gmName) : null;
      if (generation !== this.melodyGeneration) {return;} // stopped while the instrument was still loading

      let nextNoteTime = ctx.currentTime + 0.08;
      let noteCursor = 0; // index within plan.semitones, wraps if looping
      const pending: { index: number; time: number }[] = [];

      const flushUiCallbacks = () => {
        const now = ctx.currentTime;
        while (pending.length && pending[0].time <= now) {
          const { index } = pending.shift()!;
          callbacks.onNoteIndex?.(index);
        }
      };

      const playNote = (freq: number, t: number, dur: number) => {
        if (instrument) {
          const { midi, detuneCents } = hzToMidiAndDetune(freq);
          instrument.start({
            note: midi,
            detune: detuneCents,
            time: t,
            duration: dur,
            velocity: 90,
          });
          if (plan.instrument === 'santoor') {
            const { midi: m2, detuneCents: d2 } = hzToMidiAndDetune(freq);
            instrument.start({
              note: m2,
              detune: d2,
              time: t + SANTOOR_STRIKE_OFFSET_S,
              duration: Math.max(0.05, dur - SANTOOR_STRIKE_OFFSET_S),
              velocity: 55,
            });
          }
        } else {
          scheduleSine(ctx, melody, freq, t, dur, 0.22);
        }
      };

      const tick = () => {
        if (generation !== this.melodyGeneration) {
          return;
        }
        while (nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
          // read live on every note, not once when Play was pressed: dragging the tempo/gap sliders mid-loop
          // changes the spacing of every note scheduled from here on, immediately.
          const noteDur = this.melodyTiming.noteDurationMs / 1000;
          const gap = this.melodyTiming.gapMs / 1000;
          const step = noteDur + gap;
          if (noteCursor >= plan.semitones.length) {
            if (!plan.loop) {
              const lastEnd = nextNoteTime;
              globalThis.setTimeout(
                () => {
                  if (generation === this.melodyGeneration) {
                    callbacks.onNoteIndex?.(null);
                    callbacks.onStop?.();
                    this.stopMelody();
                  }
                },
                Math.max(0, (lastEnd - ctx.currentTime) * 1000)
              );
              return;
            }
            noteCursor = 0;
            nextNoteTime += Math.max(gap, 0.25);
            continue;
          }
          const freq = semitoneToHz(plan.semitones[noteCursor], plan.tonicHz);
          playNote(freq, nextNoteTime, noteDur);
          pending.push({ index: noteCursor, time: nextNoteTime });
          noteCursor++;
          nextNoteTime += step;
        }
        flushUiCallbacks();
      };

      tick();
      this.melodyTimer = globalThis.setInterval(tick, LOOKAHEAD_MS);
      const uiTimer = globalThis.setInterval(() => {
        if (generation !== this.melodyGeneration) {
          clearInterval(uiTimer);
          return;
        }
        flushUiCallbacks();
      }, 40);
    })();
  }

  stopTanpura() {
    this.tanpuraGeneration++;
    if (this.tanpuraTimer != null) {
      clearInterval(this.tanpuraTimer);
      this.tanpuraTimer = null;
    }
    this.tanpuraInstrument?.stop();
  }

  /** A tanpura drone: `semitones` (one per string, already resolved to their own octave, relative to Sa) are
   * plucked in order on a real sampled string instrument, repeating indefinitely at `intervalMs` per pluck until
   * `stopTanpura()`. Each pluck rings for several multiples of the interval, not just slightly longer than it --
   * a real tanpura's whole character is that each string keeps ringing while the others are struck on top of it,
   * one continuous wash of overlapping, slowly-decaying strings, never a single note alone; too short a ring
   * (close to the interval) instead gives four isolated pings with silence between them. Runs independently of
   * the melody player/loop. */
  startTanpura(semitones: number[], tonicHz: number, volume: number, intervalMs: number) {
    this.stopTanpura();
    if (semitones.length === 0) {
      return;
    }
    this.setTanpuraVolume(volume);
    const generation = this.tanpuraGeneration;
    const intervalS = Math.max(0.15, intervalMs / 1000);
    const ringS = Math.max(intervalS * 7, 3.5);

    void (async () => {
      const { ctx } = this.ensureGraph();
      const instrument = await this.getTanpuraInstrument();
      if (generation !== this.tanpuraGeneration) {return;}

      let cursor = 0;
      let nextTime = ctx.currentTime + 0.05;
      const tick = () => {
        if (generation !== this.tanpuraGeneration) {
          return;
        }
        while (nextTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
          const freq = semitoneToHz(semitones[cursor % semitones.length], tonicHz);
          const { midi, detuneCents } = hzToMidiAndDetune(freq);
          instrument.start({
            note: midi,
            detune: detuneCents,
            time: nextTime,
            duration: ringS,
            velocity: 75,
          });
          cursor++;
          nextTime += intervalS;
        }
      };
      tick();
      this.tanpuraTimer = globalThis.setInterval(tick, LOOKAHEAD_MS);
    })();
  }

  dispose() {
    this.stopMelody();
    this.stopTanpura();
    for (const inst of this.melodyInstruments.values()) {inst.dispose();}
    this.melodyInstruments.clear();
    this.tanpuraInstrument?.dispose();
    this.tanpuraInstrument = null;
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
