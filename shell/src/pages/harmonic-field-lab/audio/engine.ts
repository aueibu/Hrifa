/**
 * The lab's own voice engine (Web Audio only, no shared audio code; it may be promoted to a shared module later).
 *
 * - The AudioContext is created lazily, on the first call that makes sound (so on a user gesture).
 * - A voice is one oscillator through one gain into a master gain (volume) and a gentle limiter. Held voices live until
 *   `stop` (a key is down); timed voices (`blip`) release themselves. Any frequency in Hz is allowed.
 * - Timbres: `sine`, or `harmonic` = 7 partials falling off by 0.88 per partial (the Sethares default, so what you hear
 *   matches the roughness maths), built as one PeriodicWave so a glide is a single frequency ramp.
 * - Envelopes are scheduled (`setValueAtTime`, `linearRampToValueAtTime`, `setTargetAtTime`) and never start from a read of
 *   `gain.value`, which is the level NOW (for a note scheduled in the future that is the default 1, which caused the
 *   end-of-note swell and click in the prototype).
 * - `glideTo(id, hz, ms)` moves a sounding voice to a new pitch; the retuner (M7) uses it.
 * - `stopAll()` is the panic button: every voice, held or scheduled, fades out within about 0.1 s.
 */

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
  resume(): Promise<void> | void;
  close(): Promise<void> | void;
  createGain(): GainLike;
  createOscillator(): OscillatorLike;
  createDynamicsCompressor(): CompressorLike;
  createPeriodicWave(real: Float32Array, imag: Float32Array): unknown;
}

export type Timbre = 'sine' | 'harmonic';
export const TIMBRES: readonly Timbre[] = ['sine', 'harmonic'];

/** Partials of the harmonic timbre and their fall-off (amplitude of partial k is ROLLOFF^(k-1)). */
export const PARTIALS = 7;
export const ROLLOFF = 0.88;

/** Attack ramp (s) and release time constant (s). */
export const ATTACK = 0.012;
export const RELEASE_TC = 0.05;
const PANIC_TC = 0.02;

/** Hz of a pitch `cents` above `baseHz`. */
export const hzOf = (baseHz: number, cents: number): number => baseHz * 2 ** (cents / 1200);

/** Loudest a single voice gets (chords pass a smaller `amp`): the harmonic timbre is normalised, so both are alike. */
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
  private wave: unknown = null;
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
        const real = new Float32Array(PARTIALS + 1);
        const imag = new Float32Array(PARTIALS + 1);
        for (let k = 1; k <= PARTIALS; k++) {
          imag[k] = ROLLOFF ** (k - 1);
        }
        this.wave = ctx.createPeriodicWave(real, imag);
        this.ctx = ctx;
        this.master = master;
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
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
  }

  /** Stop everything and close the context. The engine cannot be used afterwards. */
  dispose(): void {
    this.stopAll();
    this.disposed = true;
    this.onChange = null;
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    try {
      void ctx?.close();
    } catch {
      // already closed
    }
  }
}
