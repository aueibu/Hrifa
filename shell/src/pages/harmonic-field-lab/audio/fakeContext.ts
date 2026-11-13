/**
 * A fake Web Audio context for tests: records every scheduled parameter event, start and stop, and lets a test move the
 * clock (`advance`), which ends the oscillators whose stop time has passed (firing `onended` like a real node).
 */
import type { AudioContextLike, GainLike, OscillatorLike, ParamLike } from './engine';

export type Ev = { kind: string; v?: number; t: number; tc?: number };

export class FakeParam implements ParamLike {
  events: Ev[] = [];
  private _value = 1;
  /** Reading the level is what the engine must never rely on: it sits at the default 1 like a real param. */
  get value() {
    return this._value;
  }
  set value(v: number) {
    this._value = v;
  }
  setValueAtTime(v: number, t: number) {
    this.events.push({ kind: 'set', v, t });
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.events.push({ kind: 'lin', v, t });
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.events.push({ kind: 'exp', v, t });
  }
  setTargetAtTime(v: number, t: number, tc: number) {
    this.events.push({ kind: 'target', v, t, tc });
  }
  cancelScheduledValues(t: number) {
    this.events.push({ kind: 'cancel', t });
  }
}

export class FakeNode {
  connected: unknown[] = [];
  disconnected = false;
  connect(to: unknown) {
    this.connected.push(to);
    return to;
  }
  disconnect() {
    this.disconnected = true;
  }
}

export class FakeOsc extends FakeNode implements OscillatorLike {
  type = 'sine';
  frequency = new FakeParam();
  startAt: number | null = null;
  stopAt: number | null = null;
  wave: unknown = null;
  onended: (() => void) | null = null;
  start(t = 0) {
    this.startAt = t;
  }
  stop(t = 0) {
    this.stopAt = t;
  }
  setPeriodicWave(w: unknown) {
    this.wave = w;
  }
}
export class FakeGain extends FakeNode implements GainLike {
  gain = new FakeParam();
}

export class FakeCtx implements AudioContextLike {
  currentTime = 0;
  state = 'suspended';
  destination = { dest: true };
  oscs: FakeOsc[] = [];
  gains: FakeGain[] = [];
  waves: { real: Float32Array; imag: Float32Array }[] = [];
  closed = false;
  resumed = 0;
  resume() {
    this.resumed++;
    this.state = 'running';
  }
  close() {
    this.closed = true;
  }
  createGain() {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createOscillator() {
    const o = new FakeOsc();
    this.oscs.push(o);
    return o;
  }
  createDynamicsCompressor() {
    return Object.assign(new FakeNode(), {
      threshold: new FakeParam(),
      knee: new FakeParam(),
      ratio: new FakeParam(),
      attack: new FakeParam(),
      release: new FakeParam(),
    });
  }
  createPeriodicWave(real: Float32Array, imag: Float32Array) {
    const w = { real, imag };
    this.waves.push(w);
    return w;
  }
  /** Move the clock and end every oscillator whose stop time has passed. */
  advance(t: number) {
    this.currentTime = t;
    for (const o of this.oscs) {
      if (o.stopAt !== null && o.stopAt <= t && o.onended) {
        const f = o.onended;
        o.onended = null;
        f();
      }
    }
  }
}
