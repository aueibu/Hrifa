import { describe, expect, it } from 'vitest';
import {
  BUILT_IN,
  IMPULSE_MAX_BYTES,
  REASON_NOT_AUDIO,
  REASON_TOO_BIG,
  REASON_TOO_LONG,
  customLabel,
  defaultReverb,
  formatSeconds,
  impulseSeconds,
  loadImpulseFile,
  makeImpulse,
  mixGains,
  parseStoredImpulse,
  resampleLinear,
  sanitizeReverb,
  type ImpulseDecoder,
  type ImpulseFile,
} from './reverb';

const rms = (a: Float32Array, from: number, to: number): number => {
  let s = 0;
  for (let i = from; i < to; i++) {
    s += a[i] * a[i];
  }
  return Math.sqrt(s / (to - from));
};

describe('reverb settings', () => {
  it('default to Dry with a mix of 0', () => {
    expect(defaultReverb()).toEqual({ preset: 'dry', mix: 0 });
  });

  it('keep a valid preset and a mix in range', () => {
    expect(sanitizeReverb({ preset: 'hall', mix: 0.4 })).toEqual({ preset: 'hall', mix: 0.4 });
    for (const preset of ['dry', 'room', 'hall', 'custom'] as const) {
      expect(sanitizeReverb({ preset, mix: 1 }).preset).toBe(preset);
    }
  });

  it('read an unknown preset as Dry and a bad mix as 0, field by field', () => {
    expect(sanitizeReverb({ preset: 'cathedral', mix: 0.5 })).toEqual({ preset: 'dry', mix: 0.5 });
    expect(sanitizeReverb({ preset: 'room', mix: 'loud' })).toEqual({ preset: 'room', mix: 0 });
    expect(sanitizeReverb({ preset: 'room', mix: Number.NaN })).toEqual({ preset: 'room', mix: 0 });
    expect(sanitizeReverb({ preset: 7, mix: null })).toEqual({ preset: 'dry', mix: 0 });
  });

  it('clamp a mix outside 0 to 1', () => {
    expect(sanitizeReverb({ preset: 'hall', mix: 7 }).mix).toBe(1);
    expect(sanitizeReverb({ preset: 'hall', mix: -3 }).mix).toBe(0);
  });

  it('read anything that is not an object as the default', () => {
    for (const raw of [undefined, null, 3, 'hall', [], [1, 2]]) {
      expect(sanitizeReverb(raw), String(raw)).toEqual({ preset: 'dry', mix: 0 });
    }
  });
});

describe('mixGains (equal power)', () => {
  it('mix 0 is the dry sound alone and mix 1 the reverb alone', () => {
    expect(mixGains(0)).toEqual({ dry: 1, wet: 0 });
    const one = mixGains(1);
    expect(one.dry).toBeCloseTo(0, 12);
    expect(one.wet).toBeCloseTo(1, 12);
  });

  it('keeps dry^2 + wet^2 = 1 all the way, and the halfway point is -3 dB each', () => {
    for (let m = 0; m <= 1; m += 0.05) {
      const { dry, wet } = mixGains(m);
      expect(dry * dry + wet * wet).toBeCloseTo(1, 12);
    }
    expect(mixGains(0.5).dry).toBeCloseTo(Math.SQRT1_2, 12);
    expect(mixGains(0.5).wet).toBeCloseTo(Math.SQRT1_2, 12);
  });

  it('clamps and treats a non-number as 0', () => {
    expect(mixGains(5)).toEqual(mixGains(1));
    expect(mixGains(-1)).toEqual({ dry: 1, wet: 0 });
    expect(mixGains(Number.NaN)).toEqual({ dry: 1, wet: 0 });
  });
});

describe('built-in impulses', () => {
  const rate = 8000;

  it('are stereo, about 0.9 s (Room) and 2.8 s (Hall) long', () => {
    const room = makeImpulse('room', rate);
    const hall = makeImpulse('hall', rate);
    expect(room).toHaveLength(2);
    expect(hall).toHaveLength(2);
    expect(room[0].length).toBe(Math.round(0.9 * rate));
    expect(hall[0].length).toBe(Math.round(2.8 * rate));
    expect(room[1].length).toBe(room[0].length);
    expect(BUILT_IN.room.seconds).toBe(0.9);
    expect(BUILT_IN.hall.seconds).toBe(2.8);
  });

  it('decay: the first tenth is far louder than the last tenth, and the end is near silence', () => {
    for (const p of ['room', 'hall'] as const) {
      const ch = makeImpulse(p, rate)[0];
      const n = ch.length;
      const head = rms(ch, Math.round(n * 0.01), Math.round(n * 0.1));
      const tail = rms(ch, Math.round(n * 0.9), n);
      expect(head / tail, p).toBeGreaterThan(30);
      expect(Math.abs(ch[n - 1]), p).toBeLessThan(0.01);
    }
  });

  it('are deterministic (the same bytes every time), differ between presets and between the two channels', () => {
    const a = makeImpulse('hall', rate);
    const b = makeImpulse('hall', rate);
    expect(Array.from(a[0])).toEqual(Array.from(b[0]));
    expect(Array.from(a[1])).toEqual(Array.from(b[1]));
    expect(Array.from(a[0].slice(100, 140))).not.toEqual(Array.from(a[1].slice(100, 140)));
    const room = makeImpulse('room', rate);
    expect(Array.from(room[0].slice(100, 140))).not.toEqual(Array.from(a[0].slice(100, 140)));
  });

  it('start softly (no click) and hold finite numbers', () => {
    const ch = makeImpulse('room', 48000)[0];
    expect(Math.abs(ch[0])).toBeLessThan(0.01);
    expect(ch.every((x) => Number.isFinite(x) && Math.abs(x) <= 1)).toBe(true);
  });
});

describe('formatting', () => {
  it('shows seconds with one decimal (two when very short) and the Custom label with name and length', () => {
    expect(formatSeconds(2.4)).toBe('2.4 s');
    expect(formatSeconds(12)).toBe('12.0 s');
    expect(formatSeconds(0.05)).toBe('0.05 s');
    const d = { name: 'hall.wav', sampleRate: 1000, channels: [new Float32Array(2400)] };
    expect(impulseSeconds(d)).toBeCloseTo(2.4, 9);
    expect(customLabel(d)).toBe('Custom: hall.wav (2.4 s)');
  });
});

describe('loadImpulseFile (validation of a picked file)', () => {
  const file = (name: string, size: number): ImpulseFile => ({
    name,
    size,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(Math.min(size, 16))),
  });
  const decodeTo =
    (sampleRate: number, ...lengths: number[]): ImpulseDecoder =>
    () =>
      Promise.resolve({ sampleRate, channels: lengths.map((n) => new Float32Array(n).fill(0.5)) });

  it('accepts a 2.4 s stereo file and keeps both channels', async () => {
    const r = await loadImpulseFile(file('room.wav', 1000), decodeTo(1000, 2400, 2400));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.impulse.name).toBe('room.wav');
      expect(r.impulse.channels).toHaveLength(2);
      expect(impulseSeconds(r.impulse)).toBeCloseTo(2.4, 9);
    }
  });

  it('keeps a mono file mono (the convolver uses it on both sides) and cuts more than two channels to two', async () => {
    const mono = await loadImpulseFile(file('m.wav', 10), decodeTo(1000, 500));
    expect(mono.ok && mono.impulse.channels).toHaveLength(1);
    const many = await loadImpulseFile(file('5.wav', 10), decodeTo(1000, 500, 500, 500, 500, 500));
    expect(many.ok && many.impulse.channels).toHaveLength(2);
  });

  it('refuses a file over 8 MB before reading it', async () => {
    let read = false;
    const big: ImpulseFile = {
      name: 'big.wav',
      size: IMPULSE_MAX_BYTES + 1,
      arrayBuffer: () => {
        read = true;
        return Promise.resolve(new ArrayBuffer(0));
      },
    };
    expect(await loadImpulseFile(big, decodeTo(1000, 100))).toEqual({
      ok: false,
      reason: REASON_TOO_BIG,
    });
    expect(read).toBe(false);
    expect(REASON_TOO_BIG).toBe('Larger than 8 MB');
    // exactly 8 MB is fine
    expect((await loadImpulseFile(file('ok.wav', IMPULSE_MAX_BYTES), decodeTo(1000, 100))).ok).toBe(
      true
    );
  });

  it('refuses an impulse longer than 12 s, accepts exactly 12 s', async () => {
    const long = await loadImpulseFile(file('long.wav', 100), decodeTo(1000, 12001));
    expect(long).toEqual({ ok: false, reason: REASON_TOO_LONG });
    expect(REASON_TOO_LONG).toBe('Longer than 12 s');
    expect((await loadImpulseFile(file('edge.wav', 100), decodeTo(1000, 12000))).ok).toBe(true);
  });

  it('calls a file the browser cannot decode (a text file) not audio, however the decoder says so', async () => {
    const reject: ImpulseDecoder = () => Promise.reject(new Error('decode'));
    const nothing: ImpulseDecoder = () => Promise.resolve(null);
    const empty: ImpulseDecoder = () => Promise.resolve({ sampleRate: 1000, channels: [] });
    const silent: ImpulseDecoder = () =>
      Promise.resolve({ sampleRate: 1000, channels: [new Float32Array(0)] });
    for (const d of [reject, nothing, empty, silent]) {
      expect(await loadImpulseFile(file('notes.txt', 20), d)).toEqual({
        ok: false,
        reason: REASON_NOT_AUDIO,
      });
    }
    expect(REASON_NOT_AUDIO).toBe('Not an audio file');
  });

  it('calls a file that cannot even be read not audio', async () => {
    const f: ImpulseFile = {
      name: 'x',
      size: 10,
      arrayBuffer: () => Promise.reject(new Error('read')),
    };
    expect(await loadImpulseFile(f, decodeTo(1000, 100))).toEqual({
      ok: false,
      reason: REASON_NOT_AUDIO,
    });
  });

  it('copies the decoded samples (the stored impulse is independent of the decoder buffer) and cuts a very long name', async () => {
    const src = new Float32Array([0.1, 0.2, 0.3]);
    const r = await loadImpulseFile(file(`${'a'.repeat(200)}.wav`, 10), () =>
      Promise.resolve({ sampleRate: 1000, channels: [src] })
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      src[0] = 9;
      expect(r.impulse.channels[0][0]).toBeCloseTo(0.1, 6);
      expect(r.impulse.name.length).toBe(80);
    }
  });
});

describe('resampleLinear', () => {
  it('returns the same data at the same rate and scales the length by the rate ratio', () => {
    const a = new Float32Array([0, 1, 0, -1]);
    expect(resampleLinear(a, 100, 100)).toBe(a);
    expect(resampleLinear(a, 100, 200)).toHaveLength(8);
    expect(resampleLinear(a, 200, 100)).toHaveLength(2);
  });

  it('interpolates linearly', () => {
    const out = resampleLinear(new Float32Array([0, 1]), 1, 4);
    expect(out[0]).toBe(0);
    expect(out[1]).toBeCloseTo(0.25, 6);
    expect(out[2]).toBeCloseTo(0.5, 6);
  });
});

describe('parseStoredImpulse (what IndexedDB hands back)', () => {
  const good = { name: 'a.wav', sampleRate: 48000, channels: [new Float32Array(100)] };

  it('accepts one or two equal channels', () => {
    expect(parseStoredImpulse(good)).toEqual(good);
    const two = { ...good, channels: [new Float32Array(100), new Float32Array(100)] };
    expect(parseStoredImpulse(two)?.channels).toHaveLength(2);
  });

  it('rejects anything damaged: wrong shape, no channels, unequal channels, not Float32Array, too long', () => {
    const bad: unknown[] = [
      null,
      undefined,
      'x',
      42,
      {},
      { ...good, name: 5 },
      { ...good, sampleRate: 0 },
      { ...good, sampleRate: 'x' },
      { ...good, channels: [] },
      { ...good, channels: 'x' },
      { ...good, channels: [new Float32Array(0)] },
      { ...good, channels: [new Float32Array(10), new Float32Array(11)] },
      { ...good, channels: [[1, 2, 3]] },
      { ...good, channels: [new Float32Array(1), new Float32Array(1), new Float32Array(1)] },
      { name: 'long', sampleRate: 10, channels: [new Float32Array(121)] },
    ];
    for (const raw of bad) {
      expect(parseStoredImpulse(raw), JSON.stringify(raw)).toBeNull();
    }
  });
});
