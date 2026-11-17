/**
 * The lab's own voice engine (Web Audio only, no shared audio code; it may be promoted to a shared module later).
 *
 * - The AudioContext is created lazily, on the first call that makes sound (so on a user gesture).
 * - A voice is one oscillator through one gain into a master gain (volume) and a gentle limiter. Held voices live until
 *   `stop` (a key is down); timed voices (`blip`) release themselves. Any frequency in Hz is allowed.
 * - Timbres: `sine`, or `harmonic` = 7 partials falling off by 0.88 per partial (the Sethares default, so what you hear
 *   matches the roughness math), built as one PeriodicWave so a glide is a single frequency ramp.
 * - Envelopes are scheduled (`setValueAtTime`, `linearRampToValueAtTime`, `setTargetAtTime`) and never start from a read of
 *   `gain.value`, which is the level NOW (for a note scheduled in the future that is the default 1, which caused the
 *   end-of-note swell and click in the prototype).
 * - `glideTo(id, hz, ms)` moves a sounding voice to a new pitch; the retuner (M7) uses it.
 * - `stopAll()` is the panic button: every voice, held or scheduled, fades out within about 0.1 s, and the reverb tail with it.
 * - A1 (H-31): one shared convolution reverb. With the preset Dry (the default) the graph is exactly the one above (master to
 *   limiter). A preset other than Dry builds, on first use, a wet path (master -> send -> convolver -> wet gain -> limiter) and
 *   puts a dry gain between master and limiter; the Mix sets the two gains equal-power (`reverb.mixGains`). A preset change
 *   rebuilds the convolver behind a 30 ms fade of the wet gain; the panic does the same behind a 0.15 s fade, which also
 *   empties the convolver's memory so the tail cannot come back. `setPartials` rebuilds the harmonic wave for voices that
 *   start later (held voices keep theirs).
 */
import {
  makeImpulse,
  mixGains,
  resampleLinear,
  type BuiltInPreset,
  type ImpulseData,
  type ReverbPreset,
} from './reverb';

/** The slice of the Web Audio API the engine uses (so a test can supply a fake). */
export interface ParamLike {
  value: number;
  setValueAtTime(v: number, t: number): unknown;
  linearRampToValueAtTime(v: number, t: number): unknown;
  exponentialRampToValueAtTime(v: number, t: number): unknown;
  setTargetAtTime(v: number, t: number, tc: number): unknown;
  cancelScheduledValues(t: number): unknown;
}
export interface NodeLike {
  connect(to: unknown): unknown;
  disconnect(): void;
}
export interface ConvolverLike extends NodeLike {
  buffer: unknown;
  normalize: boolean;
}
export interface AudioBufferLike {
  readonly length: number;
  readonly numberOfChannels: number;
  readonly sampleRate: number;
  getChannelData(channel: number): Float32Array;
}
export interface OscillatorLike extends NodeLike {
  type: string;
  frequency: ParamLike;
  start(t?: number): void;
  stop(t?: number): void;
  setPeriodicWave(w: unknown): void;
  onended: (() => void) | null;
}
export interface GainLike extends NodeLike {
  gain: ParamLike;
}
export interface CompressorLike extends NodeLike {
  threshold: ParamLike;
  knee: ParamLike;
  ratio: ParamLike;
  attack: ParamLike;
  release: ParamLike;
}
export interface AudioContextLike {
  currentTime: number;
  state: string;
  destination: unknown;
  sampleRate: number;
  resume(): Promise<void> | void;
  close(): Promise<void> | void;
  createGain(): GainLike;
  createOscillator(): OscillatorLike;
  createDynamicsCompressor(): CompressorLike;
  createPeriodicWave(real: Float32Array, imag: Float32Array): unknown;
  createConvolver(): ConvolverLike;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  decodeAudioData(bytes: ArrayBuffer): Promise<AudioBufferLike>;
}

export type Timbre = 'sine' | 'harmonic';
export const TIMBRES: readonly Timbre[] = ['sine', 'harmonic'];

/** Partials of the harmonic timbre and their fall-off (amplitude of partial k is ROLLOFF^(k-1)): the default, and what the sound uses when it does not follow the Roughness settings. */
export const PARTIALS = 7;
export const ROLLOFF = 0.88;

/** What the sound accepts (A1, H-31): 1 to 16 partials and a rolloff of 0.5 to 1; the Roughness inputs may allow more. */
export const SOUND_PARTIALS_MIN = 1;
export const SOUND_PARTIALS_MAX = 16;
export const SOUND_ROLLOFF_MIN = 0.5;
export const SOUND_ROLLOFF_MAX = 1;

/** A partial count as a whole number in 1..16 (anything that is not a finite number is the default 7). */
export const clampPartials = (n: number): number =>
  Number.isFinite(n)
    ? Math.min(SOUND_PARTIALS_MAX, Math.max(SOUND_PARTIALS_MIN, Math.round(n)))
    : PARTIALS;

/** A rolloff in 0.5..1 (anything that is not a finite number is the default 0.88). */
export const clampRolloff = (r: number): number =>
  Number.isFinite(r) ? Math.min(SOUND_ROLLOFF_MAX, Math.max(SOUND_ROLLOFF_MIN, r)) : ROLLOFF;

/** Amplitudes of a harmonic wave: index 0 is the unused DC term, index k is `rolloff^(k-1)` for k = 1..count. */
export function harmonicAmplitudes(count: number, rolloff: number): Float32Array {
  const n = clampPartials(count);
  const r = clampRolloff(rolloff);
  const imag = new Float32Array(n + 1);
  for (let k = 1; k <= n; k++) {
    imag[k] = r ** (k - 1);
  }
  return imag;
}

/**
 * The partials the sound uses: with the link on, the Roughness Partials and Rolloff (clamped); with it off, the fixed 7 and
 * 0.88 the sound always had.
 */
export function soundPartials(
  follows: boolean,
  harmonics: number,
  rolloff: number
): { count: number; rolloff: number } {
  return follows
    ? { count: clampPartials(harmonics), rolloff: clampRolloff(rolloff) }
    : { count: PARTIALS, rolloff: ROLLOFF };
}

/** True when this browser has Web Audio (the reverb and impulse controls are disabled without it). */
export function hasWebAudio(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const w = window as unknown as { AudioContext?: unknown; webkitAudioContext?: unknown };
  return Boolean(w.AudioContext ?? w.webkitAudioContext);
}

/** Wet-path timing (s): the wet gain's time constant and the wait before the convolver is rebuilt, for a preset change and for the panic. */
const SWAP_TC = 0.0075;
const SWAP_MS = 30;
const PANIC_WET_TC = 0.03;
const PANIC_WET_MS = 200;
/** Time constant of a Mix or Dry-gain move (s). */
const MIX_TC = 0.02;

/** Attack ramp (s) and release time constant (s). */
export const ATTACK = 0.012;
export const RELEASE_TC = 0.05;
const PANIC_TC = 0.02;

/** Hz of a pitch `cents` above `baseHz`. */
export const hzOf = (baseHz: number, cents: number): number => baseHz * 2 ** (cents / 1200);

/** Loudest a single voice gets (chords pass a smaller `amp`): the harmonic timbre is normalized, so both are alike. */
const PEAK: Record<Timbre, number> = { sine: 0.3, harmonic: 0.22 };

/** One voice's amplitude share when `n` voices sound together (keeps big chords off the limiter). */
export const chordAmp = (n: number): number => Math.min(1, 1.3 / Math.sqrt(Math.max(1, n)));

interface Voice {
  osc: OscillatorLike;
  gain: GainLike;
  peak: number;
  t0: number;
  /** Target pitch (where a glide is heading). */
  hz: number;
  timed: boolean;
  /** The glide in progress: from hz0 at t0 to hz1 at t1 (audio-clock seconds). */
  glide: { hz0: number; t0: number; hz1: number; t1: number } | null;
  /** Set when a release was scheduled: its start, level and time constant (so a later fade starts from the decayed level). */
  rel: { t: number; level: number; tc: number } | null;
}

export interface EngineOptions {
  createContext?: () => AudioContextLike;
}

const defaultContext = (): AudioContextLike => {
  const w = window as unknown as {
    AudioContext?: new () => AudioContextLike;
    webkitAudioContext?: new () => AudioContextLike;
  };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) {
    throw new Error('Web Audio is not available');
  }
  return new Ctor();
};

export class VoiceEngine {
  private ctx: AudioContextLike | null = null;
  private master: GainLike | null = null;
  private limiter: NodeLike | null = null;
  private wave: unknown = null;
  private partials = { count: PARTIALS, rolloff: ROLLOFF };
  private reverbPreset: ReverbPreset = 'dry';
  private reverbMix = 0;
  private custom: ImpulseData | null = null;
  private customBuf: AudioBufferLike | null = null;
  private readonly builtBufs = new Map<BuiltInPreset, AudioBufferLike>();
  /** The wet path, built the first time a preset other than Dry is in effect. */
  private wet: {
    dry: GainLike;
    send: GainLike;
    conv: ConvolverLike | null;
    out: GainLike;
  } | null = null;
  /** Which impulse the convolver holds (null: none yet, or the custom one just changed). */
  private wetKey: 'room' | 'hall' | 'custom' | null = null;
  private wetTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly held = new Map<string, Voice>();
  private readonly live = new Set<Voice>();
  private volume = 0.5;
  private timbre: Timbre = 'sine';
  private disposed = false;
  private readonly make: () => AudioContextLike;
  /** Called with the ids of the held voices whenever they change. */
  onChange: ((ids: string[]) => void) | null = null;

  constructor(opts: EngineOptions = {}) {
    this.make = opts.createContext ?? defaultContext;
  }

  /** True once the context exists. */
  get ready(): boolean {
    return this.ctx !== null;
  }
  /** Ids of the held voices (a key is down). */
  heldIds(): string[] {
    return [...this.held.keys()];
  }
  /** Voices that have not finished fading (held, timed, or releasing). */
  get liveCount(): number {
    return this.live.size;
  }
  /** Seconds on the audio clock (0 before the context exists). */
  now(): number {
    return this.ctx?.currentTime ?? 0;
  }
  getTimbre(): Timbre {
    return this.timbre;
  }

  /** Create the context on first use and make sure it is running. Returns it, or null when audio is not available. */
  private ensure(): AudioContextLike | null {
    if (this.disposed) {
      return null;
    }
    if (!this.ctx) {
      try {
        const ctx = this.make();
        const master = ctx.createGain();
        master.gain.setValueAtTime(this.volume, ctx.currentTime);
        // a gentle safety limiter only: the default compressor pumps on chords
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -8;
        comp.knee.value = 10;
        comp.ratio.value = 4;
        comp.attack.value = 0.005;
        comp.release.value = 0.3;
        master.connect(comp);
        comp.connect(ctx.destination);
        this.wave = this.makeWave(ctx);
        this.ctx = ctx;
        this.master = master;
        this.limiter = comp;
      } catch {
        return null;
      }
      // a reverb chosen before the first sound is built now (Dry builds nothing)
      this.applyReverb();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private makeWave(ctx: AudioContextLike): unknown {
    const imag = harmonicAmplitudes(this.partials.count, this.partials.rolloff);
    return ctx.createPeriodicWave(new Float32Array(imag.length), imag);
  }

  /** Partials and rolloff of the harmonic timbre for voices started from now on (clamped to 1..16 and 0.5..1); held voices keep their wave. */
  setPartials(count: number, rolloff: number): void {
    const next = { count: clampPartials(count), rolloff: clampRolloff(rolloff) };
    if (next.count === this.partials.count && next.rolloff === this.partials.rolloff) {
      return;
    }
    this.partials = next;
    if (this.ctx) {
      try {
        this.wave = this.makeWave(this.ctx);
      } catch {
        // keep the previous wave
      }
    }
  }
  getPartials(): { count: number; rolloff: number } {
    return { ...this.partials };
  }

  /* ---------------------------------------------------------------------------------------- reverb */

  /** The preset in effect: Custom with no impulse loaded plays as Hall. */
  effectivePreset(): ReverbPreset {
    return this.reverbPreset === 'custom' && !this.custom ? 'hall' : this.reverbPreset;
  }
  /** True while a wet path exists (a preset other than Dry has been in effect). */
  get hasWetPath(): boolean {
    return this.wet !== null;
  }

  /** Reverb preset and mix (0 to 1). Dry ignores the mix. Anything invalid is ignored. */
  setReverb(preset: ReverbPreset, mix: number): void {
    if (preset !== 'dry' && preset !== 'room' && preset !== 'hall' && preset !== 'custom') {
      return;
    }
    if (!Number.isFinite(mix)) {
      return;
    }
    this.reverbPreset = preset;
    this.reverbMix = Math.min(1, Math.max(0, mix));
    this.applyReverb();
  }

  /** The user's own impulse (null removes it). The Custom preset uses it; without it Custom plays as Hall. */
  setCustomImpulse(imp: ImpulseData | null): void {
    if (imp === this.custom) {
      return;
    }
    this.custom = imp;
    this.customBuf = null;
    if (this.wetKey === 'custom') {
      this.wetKey = null;
    }
    this.applyReverb();
  }

  /** Decode a picked file's bytes with the browser; the first two channels, or null when the browser cannot decode them. */
  async decodeImpulse(
    bytes: ArrayBuffer
  ): Promise<{ sampleRate: number; channels: Float32Array[] } | null> {
    const ctx = this.ensure();
    if (!ctx) {
      return null;
    }
    try {
      const buf = await ctx.decodeAudioData(bytes);
      const channels: Float32Array[] = [];
      for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) {
        channels.push(buf.getChannelData(c).slice());
      }
      return channels.length ? { sampleRate: buf.sampleRate, channels } : null;
    } catch {
      return null;
    }
  }

  private wetTarget(): number {
    return this.effectivePreset() === 'dry' ? 0 : mixGains(this.reverbMix).wet;
  }
  private dryTarget(): number {
    return this.effectivePreset() === 'dry' ? 1 : mixGains(this.reverbMix).dry;
  }

  private toBuffer(ctx: AudioContextLike, channels: Float32Array[], rate: number): AudioBufferLike {
    const data = channels.map((c) => resampleLinear(c, rate, ctx.sampleRate));
    const buf = ctx.createBuffer(data.length, data[0].length, ctx.sampleRate);
    data.forEach((d, c) => buf.getChannelData(c).set(d));
    return buf;
  }

  private bufferFor(
    ctx: AudioContextLike,
    key: 'room' | 'hall' | 'custom'
  ): AudioBufferLike | null {
    if (key === 'custom') {
      if (!this.custom) {
        return null;
      }
      this.customBuf ??= this.toBuffer(ctx, this.custom.channels, this.custom.sampleRate);
      return this.customBuf;
    }
    let buf = this.builtBufs.get(key);
    if (!buf) {
      buf = this.toBuffer(ctx, makeImpulse(key, ctx.sampleRate), ctx.sampleRate);
      this.builtBufs.set(key, buf);
    }
    return buf;
  }

  /** Put a fresh convolver holding `buf` in the wet path (an old one is dropped, and with it everything it still remembers). */
  private installConv(ctx: AudioContextLike, buf: AudioBufferLike): void {
    const w = this.wet;
    if (!w) {
      return;
    }
    const next = ctx.createConvolver();
    // normalize first: the scaling is applied when the buffer is set
    next.normalize = true;
    next.buffer = buf;
    w.send.disconnect();
    w.send.connect(next);
    next.connect(w.out);
    try {
      w.conv?.disconnect();
    } catch {
      // already disconnected
    }
    w.conv = next;
  }

  /** Fade the wet gain out (time constant `tc`), wait `ms`, run `act`, bring the wet gain back to its target. */
  private fadeWetThen(ctx: AudioContextLike, tc: number, ms: number, act: () => void): void {
    const w = this.wet;
    if (!w) {
      return;
    }
    if (this.wetTimer !== null) {
      clearTimeout(this.wetTimer);
    }
    w.out.gain.setTargetAtTime(0, ctx.currentTime, tc);
    this.wetTimer = setTimeout(() => {
      this.wetTimer = null;
      const c = this.ctx;
      if (!c || this.disposed || !this.wet) {
        return;
      }
      try {
        act();
        this.wet.out.gain.setTargetAtTime(this.wetTarget(), c.currentTime, 0.01);
      } catch {
        // leave the wet path as it is
      }
    }, ms);
  }

  /** Make the graph match the preset and mix. Builds nothing for Dry; once built, Dry just sets the gains back (dry 1, wet 0). */
  private applyReverb(): void {
    const ctx = this.ctx;
    const master = this.master;
    const limiter = this.limiter;
    if (!ctx || !master || !limiter) {
      return;
    }
    const eff = this.effectivePreset();
    if (eff === 'dry' && !this.wet) {
      return;
    }
    try {
      if (!this.wet) {
        const t = ctx.currentTime;
        const dry = ctx.createGain();
        dry.gain.setValueAtTime(1, t);
        const send = ctx.createGain();
        const out = ctx.createGain();
        out.gain.setValueAtTime(0, t);
        master.disconnect();
        master.connect(dry);
        dry.connect(limiter);
        master.connect(send);
        out.connect(limiter);
        this.wet = { dry, send, conv: null, out };
      }
      const w = this.wet;
      w.dry.gain.setTargetAtTime(this.dryTarget(), ctx.currentTime, MIX_TC);
      if (eff !== 'dry' && eff !== this.wetKey) {
        const buf = this.bufferFor(ctx, eff);
        if (buf) {
          this.wetKey = eff;
          if (w.conv) {
            this.fadeWetThen(ctx, SWAP_TC, SWAP_MS, () => this.installConv(ctx, buf));
            return;
          }
          this.installConv(ctx, buf);
        }
      }
      // a swap in progress sets the wet gain itself when it finishes
      if (this.wetTimer === null) {
        w.out.gain.setTargetAtTime(this.wetTarget(), ctx.currentTime, MIX_TC);
      }
    } catch {
      // no reverb is better than no sound
    }
  }

  /** Master volume 0 to 1 (clamped; anything else is ignored). */
  setVolume(v: number): void {
    if (!Number.isFinite(v)) {
      return;
    }
    this.volume = Math.min(1, Math.max(0, v));
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.01);
    }
  }

  /** Timbre for voices started from now on. */
  setTimbre(t: Timbre): void {
    if (TIMBRES.includes(t)) {
      this.timbre = t;
    }
  }

  private makeVoice(hz: number, t0: number, amp: number, timed: boolean): Voice | null {
    const ctx = this.ensure();
    if (!ctx || !this.master || !(hz > 0) || !Number.isFinite(hz)) {
      return null;
    }
    const peak = PEAK[this.timbre] * Math.min(1, Math.max(0, amp));
    const osc = ctx.createOscillator();
    if (this.timbre === 'harmonic') {
      osc.setPeriodicWave(this.wave);
    } else {
      osc.type = 'sine';
    }
    osc.frequency.setValueAtTime(hz, ctx.currentTime);
    const gain = ctx.createGain();
    // pinned to 0 from now, so nothing leaks before t0
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + ATTACK);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    const v: Voice = { osc, gain, peak, t0, hz, timed, glide: null, rel: null };
    this.live.add(v);
    osc.onended = () => {
      this.live.delete(v);
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        // already disconnected
      }
    };
    return v;
  }

  /** Fade a voice out from the level it really has at time `t` (computed, never read from the param). */
  private fade(v: Voice, t: number, tc: number, tail: number): void {
    // the level now: still in the attack, or already decaying from an earlier release (never read from the param)
    const level =
      v.rel && t >= v.rel.t
        ? v.rel.level * Math.exp(-(t - v.rel.t) / v.rel.tc)
        : v.peak * Math.min(1, Math.max(0, (t - v.t0) / ATTACK));
    v.rel = { t, level, tc };
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(level, t);
    v.gain.gain.setTargetAtTime(0, t, tc);
    v.osc.stop(t + tail);
  }

  /** Start a held voice (a key goes down). Does nothing when `id` already sounds or audio is unavailable. */
  start(id: string, hz: number, amp = 1): boolean {
    if (this.held.has(id)) {
      return false;
    }
    const ctx = this.ensure();
    if (!ctx) {
      return false;
    }
    const v = this.makeVoice(hz, ctx.currentTime, amp, false);
    if (!v) {
      return false;
    }
    this.held.set(id, v);
    this.onChange?.(this.heldIds());
    return true;
  }

  /** Release a held voice (a key goes up). */
  stop(id: string): void {
    const v = this.held.get(id);
    if (!v || !this.ctx) {
      return;
    }
    this.held.delete(id);
    this.fade(v, this.ctx.currentTime, RELEASE_TC, 0.4);
    this.onChange?.(this.heldIds());
  }

  /**
   * Move a held voice to `hz` over `ms` milliseconds (an exponential ramp, so equal ratios take equal time). 0 ms jumps.
   * Does nothing for an unknown voice or a bad frequency.
   */
  glideTo(id: string, hz: number, ms: number): void {
    const v = this.held.get(id);
    if (!v || !this.ctx || !(hz > 0) || !Number.isFinite(hz)) {
      return;
    }
    const t = this.ctx.currentTime;
    const f = v.osc.frequency;
    // anchor at where the pitch is NOW: part-way along an unfinished glide, not at its old target
    const g = v.glide;
    const now = g && t < g.t1 ? g.hz0 * (g.hz1 / g.hz0) ** ((t - g.t0) / (g.t1 - g.t0)) : v.hz;
    f.cancelScheduledValues(t);
    f.setValueAtTime(now, t);
    if (Number.isFinite(ms) && ms > 0) {
      f.exponentialRampToValueAtTime(hz, t + ms / 1000);
      v.glide = { hz0: now, t0: t, hz1: hz, t1: t + ms / 1000 };
    } else {
      f.setValueAtTime(hz, t);
      v.glide = null;
    }
    v.hz = hz;
  }

  /** Hz a held voice is (heading) at, or null. */
  hzOfVoice(id: string): number | null {
    return this.held.get(id)?.hz ?? null;
  }

  /** A timed note: starts `delay` seconds from now, sounds for `dur` seconds, releases itself. */
  blip(hz: number, delay: number, dur: number, amp = 1): boolean {
    const ctx = this.ensure();
    if (!ctx) {
      return false;
    }
    const t0 = ctx.currentTime + Math.max(0, Number.isFinite(delay) ? delay : 0);
    const v = this.makeVoice(hz, t0, amp, true);
    if (!v) {
      return false;
    }
    this.fade(v, t0 + Math.max(ATTACK, Number.isFinite(dur) ? dur : 0.3), RELEASE_TC, 0.4);
    return true;
  }

  /** Panic: every voice, held or scheduled, fades out at once. */
  stopAll(): void {
    const ctx = this.ctx;
    if (!ctx) {
      return;
    }
    const t = ctx.currentTime;
    for (const v of this.live) {
      if (v.t0 > t) {
        // not started yet: cancel it outright
        v.gain.gain.cancelScheduledValues(t);
        v.gain.gain.setValueAtTime(0, t);
        v.osc.stop(t);
      } else {
        this.fade(v, t, PANIC_TC, 0.15);
      }
    }
    const had = this.held.size > 0;
    this.held.clear();
    if (had) {
      this.onChange?.([]);
    }
    // the reverb tail is cut too: the wet gain fades to 0 over ~0.15 s, then a fresh (empty) convolver replaces the old one,
    // so the tail cannot come back when the wet gain is restored
    if (this.wet?.conv && this.wetKey) {
      const key = this.wetKey;
      this.fadeWetThen(ctx, PANIC_WET_TC, PANIC_WET_MS, () => {
        const buf = this.bufferFor(ctx, key);
        if (buf) {
          this.installConv(ctx, buf);
        }
      });
    }
  }

  /** Stop everything and close the context. The engine cannot be used afterwards. */
  dispose(): void {
    this.stopAll();
    this.disposed = true;
    this.onChange = null;
    if (this.wetTimer !== null) {
      clearTimeout(this.wetTimer);
      this.wetTimer = null;
    }
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.limiter = null;
    this.wet = null;
    try {
      void ctx?.close();
    } catch {
      // already closed
    }
  }
}
