import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ATTACK,
  PARTIALS,
  ROLLOFF,
  VoiceEngine,
  chordAmp,
  clampPartials,
  clampRolloff,
  harmonicAmplitudes,
  hzOf,
  soundPartials,
} from './engine';
import { FakeBuffer, FakeCtx } from './fakeContext';
import { makeImpulse, mixGains, type ImpulseData } from './reverb';

function setup() {
  let ctx: FakeCtx | null = null;
  let made = 0;
  const engine = new VoiceEngine({
    createContext: () => {
      made++;
      ctx = new FakeCtx();
      return ctx;
    },
  });
  return { engine, ctx: () => ctx as FakeCtx, made: () => made };
}

describe('VoiceEngine', () => {
  it('creates no AudioContext until the first sound, then resumes it once running', () => {
    const { engine, made, ctx } = setup();
    expect(made()).toBe(0);
    expect(engine.ready).toBe(false);
    engine.setVolume(0.4);
    engine.setTimbre('harmonic');
    expect(made()).toBe(0);
    expect(engine.start('a', 220)).toBe(true);
    expect(made()).toBe(1);
    expect(ctx().resumed).toBe(1);
    engine.start('b', 330);
    expect(made()).toBe(1);
    expect(ctx().resumed).toBe(1);
  });

  it('holds a voice at any Hz until stop, with a short attack ramp and a scheduled release', () => {
    const { engine, ctx } = setup();
    engine.start('k0', 261.6256);
    const c = ctx();
    expect(engine.heldIds()).toEqual(['k0']);
    expect(c.oscs).toHaveLength(1);
    expect(c.oscs[0].startAt).toBe(0);
    expect(c.oscs[0].frequency.events[0]).toMatchObject({ kind: 'set', v: 261.6256 });
    const g = c.gains[1].gain; // gains[0] is the master
    expect(g.events.map((e) => e.kind)).toEqual(['set', 'set', 'lin']);
    expect(g.events[2]).toMatchObject({ v: 0.3, t: ATTACK });
    // starting the same id again does nothing
    expect(engine.start('k0', 300)).toBe(false);
    expect(c.oscs).toHaveLength(1);
    c.currentTime = 1;
    engine.stop('k0');
    expect(engine.heldIds()).toEqual([]);
    const ev = g.events.slice(3);
    expect(ev.map((e) => e.kind)).toEqual(['cancel', 'set', 'target']);
    // the release starts from the computed level (peak), not from a read of gain.value (which is 1 here)
    expect(ev[1]).toMatchObject({ kind: 'set', v: 0.3, t: 1 });
    expect(ev[2]).toMatchObject({ kind: 'target', v: 0, t: 1 });
    expect(c.oscs[0].stopAt).toBeCloseTo(1.4, 9);
    c.advance(2);
    expect(engine.liveCount).toBe(0);
    expect(c.oscs[0].disconnected).toBe(true);
  });

  it('computes the release level from the attack when a key is released inside the attack', () => {
    const { engine, ctx } = setup();
    engine.start('k', 440);
    const c = ctx();
    c.currentTime = ATTACK / 2;
    engine.stop('k');
    const set = c.gains[1].gain.events.filter((e) => e.kind === 'set').pop()!;
    expect(set.v).toBeCloseTo(0.15, 6);
  });

  it('uses the harmonic timbre: seven partials falling off by 0.88 per partial', () => {
    const { engine, ctx } = setup();
    engine.setTimbre('harmonic');
    engine.start('h', 220);
    const c = ctx();
    expect(c.waves).toHaveLength(1);
    const { real, imag } = c.waves[0];
    expect(imag).toHaveLength(PARTIALS + 1);
    expect(imag[0]).toBe(0);
    for (let k = 1; k <= PARTIALS; k++) {
      expect(imag[k]).toBeCloseTo(ROLLOFF ** (k - 1), 6);
    }
    expect(Array.from(real).every((x) => x === 0)).toBe(true);
    expect(c.oscs[0].wave).toBe(c.waves[0]);
    engine.setTimbre('sine');
    engine.start('s', 220);
    expect(c.oscs[1].wave).toBeNull();
    expect(c.oscs[1].type).toBe('sine');
  });

  it('glides a held voice with an exponential ramp, and jumps for 0 ms', () => {
    const { engine, ctx } = setup();
    engine.start('g', 220);
    const c = ctx();
    c.currentTime = 2;
    engine.glideTo('g', 330, 250);
    const ev = c.oscs[0].frequency.events.slice(1);
    expect(ev.map((e) => e.kind)).toEqual(['cancel', 'set', 'exp']);
    expect(ev[1]).toMatchObject({ v: 220, t: 2 });
    expect(ev[2].v).toBe(330);
    expect(ev[2].t).toBeCloseTo(2.25, 9);
    expect(engine.hzOfVoice('g')).toBe(330);
    engine.glideTo('g', 440, 0);
    expect(c.oscs[0].frequency.events.at(-1)).toMatchObject({ kind: 'set', v: 440, t: 2 });
    // unknown voices and bad pitches are ignored
    const n = c.oscs[0].frequency.events.length;
    engine.glideTo('nope', 500, 100);
    engine.glideTo('g', Number.NaN, 100);
    engine.glideTo('g', -5, 100);
    expect(c.oscs[0].frequency.events).toHaveLength(n);
  });

  it('refuses bad frequencies without making a voice', () => {
    const { engine, ctx } = setup();
    expect(engine.start('x', 0)).toBe(false);
    expect(engine.start('x', Number.NaN)).toBe(false);
    expect(engine.start('x', -440)).toBe(false);
    expect(engine.heldIds()).toEqual([]);
    expect(ctx().oscs).toHaveLength(0);
  });

  it('schedules a timed note with its own start and a release from the computed level', () => {
    const { engine, ctx } = setup();
    engine.blip(330, 0.5, 0.3);
    const c = ctx();
    expect(c.oscs[0].startAt).toBeCloseTo(0.5, 9);
    const g = c.gains[1].gain.events;
    expect(g[1]).toMatchObject({ kind: 'set', v: 0, t: 0.5 });
    expect(g[2]).toMatchObject({ kind: 'lin', t: 0.5 + ATTACK });
    const set = g.filter((e) => e.kind === 'set').pop()!;
    expect(set.v).toBeCloseTo(0.3, 9);
    expect(set.t).toBeCloseTo(0.8, 9);
    expect(c.oscs[0].stopAt).toBeCloseTo(1.2, 9);
    expect(engine.heldIds()).toEqual([]);
    c.advance(2);
    expect(engine.liveCount).toBe(0);
  });

  it('panic: stops held voices, cancels notes not yet started, leaves no live voice', () => {
    const { engine, ctx } = setup();
    const seen: string[][] = [];
    engine.onChange = (ids) => seen.push(ids);
    engine.start('a', 220);
    engine.start('b', 330);
    engine.blip(440, 1, 1);
    engine.blip(550, 0, 5);
    const c = ctx();
    c.currentTime = 0.5;
    engine.stopAll();
    expect(engine.heldIds()).toEqual([]);
    expect(seen.at(-1)).toEqual([]);
    // the future note never starts: stopped at "now", gain pinned to 0
    const future = c.oscs[2];
    expect(future.stopAt).toBe(0.5);
    expect(c.gains[3].gain.events.at(-1)).toMatchObject({ kind: 'set', v: 0, t: 0.5 });
    // the others fade within 0.15 s
    for (const o of [c.oscs[0], c.oscs[1], c.oscs[3]]) {
      expect(o.stopAt).toBeCloseTo(0.65, 9);
    }
    c.advance(1);
    expect(engine.liveCount).toBe(0);
    // an id can be used again afterwards, and a second panic is harmless
    expect(engine.start('a', 220)).toBe(true);
    engine.stopAll();
    engine.stopAll();
    c.advance(5);
    expect(engine.liveCount).toBe(0);
  });

  it('keeps a held voice per id: 20 presses and releases leave nothing live', () => {
    const { engine, ctx } = setup();
    for (let i = 0; i < 20; i++) {
      engine.start(`k${i % 5}`, 200 + i);
      if (i % 2) {
        engine.stop(`k${i % 5}`);
      }
    }
    engine.stopAll();
    ctx().advance(10);
    expect(engine.heldIds()).toEqual([]);
    expect(engine.liveCount).toBe(0);
  });

  it('sets the volume on the master gain, clamped; ignores NaN', () => {
    const { engine, ctx } = setup();
    engine.start('a', 220);
    const master = ctx().gains[0].gain;
    engine.setVolume(0.8);
    expect(master.events.at(-1)).toMatchObject({ kind: 'target', v: 0.8 });
    engine.setVolume(7);
    expect(master.events.at(-1)).toMatchObject({ kind: 'target', v: 1 });
    engine.setVolume(Number.NaN);
    expect(master.events.at(-1)).toMatchObject({ kind: 'target', v: 1 });
    engine.setVolume(-1);
    expect(master.events.at(-1)).toMatchObject({ kind: 'target', v: 0 });
  });

  it('panic during a release does not jump the voice back to its peak (the level decays from the release)', () => {
    const { engine, ctx } = setup();
    engine.start('a', 220);
    const c = ctx();
    c.currentTime = 1;
    engine.stop('a'); // release from 0.3 with a 0.05 s time constant
    c.currentTime = 1.1; // two time constants later
    engine.stopAll();
    const set = c.gains[1].gain.events.filter((e) => e.kind === 'set').pop()!;
    expect(set.t).toBeCloseTo(1.1, 9);
    expect(set.v).toBeCloseTo(0.3 * Math.exp(-2), 6);
    expect(set.v).toBeLessThan(0.1);
  });

  it('panic on a timed note already in its release also starts from the decayed level', () => {
    const { engine, ctx } = setup();
    engine.blip(330, 0, 0.5);
    const c = ctx();
    c.currentTime = 0.6; // release began at 0.5
    engine.stopAll();
    const set = c.gains[1].gain.events.filter((e) => e.kind === 'set').pop()!;
    expect(set.v).toBeCloseTo(0.3 * Math.exp(-2), 6);
  });

  it('an interrupted glide continues from the pitch it has reached, not from its old target', () => {
    const { engine, ctx } = setup();
    engine.start('g', 220);
    const c = ctx();
    engine.glideTo('g', 440, 1000);
    c.currentTime = 0.5; // half way: 220 * 2^0.5
    engine.glideTo('g', 330, 500);
    const ev = c.oscs[0].frequency.events;
    const anchor = ev.filter((e) => e.kind === 'set').pop()!;
    expect(anchor.t).toBeCloseTo(0.5, 9);
    expect(anchor.v).toBeCloseTo(220 * Math.SQRT2, 6);
    expect(ev.at(-1)).toMatchObject({ kind: 'exp', v: 330 });
    // after the glide has finished the anchor is the target
    c.currentTime = 2;
    engine.glideTo('g', 220, 100);
    expect(c.oscs[0].frequency.events.filter((e) => e.kind === 'set').pop()!.v).toBe(330);
  });

  it('dispose stops everything, closes the context and refuses further sound', () => {
    const { engine, ctx } = setup();
    engine.start('a', 220);
    const c = ctx();
    engine.dispose();
    expect(c.closed).toBe(true);
    expect(engine.heldIds()).toEqual([]);
    expect(engine.start('b', 330)).toBe(false);
    expect(engine.blip(330, 0, 1)).toBe(false);
  });

  it('survives a missing Web Audio: start returns false, nothing throws', () => {
    const engine = new VoiceEngine({
      createContext: () => {
        throw new Error('no audio');
      },
    });
    expect(engine.start('a', 220)).toBe(false);
    expect(engine.blip(220, 0, 1)).toBe(false);
    engine.stopAll();
    engine.dispose();
  });
});

describe('pitch helpers', () => {
  it('converts cents above the 1/1 Hz to Hz', () => {
    expect(hzOf(261.6256, 0)).toBeCloseTo(261.6256, 6);
    expect(hzOf(261.6256, 701.955)).toBeCloseTo(392.438, 2);
    expect(hzOf(440, 1200)).toBeCloseTo(880, 6);
    expect(hzOf(100, -1200)).toBeCloseTo(50, 6);
  });

  it('shrinks a chord voice by the square root of the note count, never above 1', () => {
    expect(chordAmp(1)).toBe(1);
    expect(chordAmp(4)).toBeCloseTo(0.65, 6);
    expect(chordAmp(0)).toBe(1);
  });
});

describe('harmonic partials (A1)', () => {
  it('3 partials at 0.88 give amplitudes 1, 0.88, 0.7744 and nothing above', () => {
    const a = harmonicAmplitudes(3, 0.88);
    expect(a).toHaveLength(4);
    expect(a[0]).toBe(0);
    expect(a[1]).toBeCloseTo(1, 6);
    expect(a[2]).toBeCloseTo(0.88, 6);
    expect(a[3]).toBeCloseTo(0.7744, 6);
  });

  it('12 partials give 0.88^(k-1)', () => {
    const a = harmonicAmplitudes(12, 0.88);
    expect(a).toHaveLength(13);
    for (let k = 1; k <= 12; k++) {
      expect(a[k]).toBeCloseTo(0.88 ** (k - 1), 6);
    }
  });

  it('the default is the 7 partials and 0.88 the sound always had', () => {
    expect(PARTIALS).toBe(7);
    expect(ROLLOFF).toBe(0.88);
    expect(Array.from(harmonicAmplitudes(PARTIALS, ROLLOFF))).toEqual(
      Array.from(harmonicAmplitudes(7, 0.88))
    );
  });

  it('clamps the count to a whole number in 1..16 and the rolloff to 0.5..1', () => {
    expect(clampPartials(0)).toBe(1);
    expect(clampPartials(-4)).toBe(1);
    expect(clampPartials(99)).toBe(16);
    expect(clampPartials(7.6)).toBe(8);
    expect(clampPartials(Number.NaN)).toBe(7);
    expect(clampRolloff(0.2)).toBe(0.5);
    expect(clampRolloff(0.01)).toBe(0.5);
    expect(clampRolloff(3)).toBe(1);
    expect(clampRolloff(0.7)).toBe(0.7);
    expect(clampRolloff(Number.NaN)).toBe(0.88);
    expect(harmonicAmplitudes(40, 0.01)).toHaveLength(17);
    expect(harmonicAmplitudes(40, 0.01)[2]).toBe(0.5);
  });

  it('soundPartials: with the link on the Roughness values (clamped), with it off 7 and 0.88', () => {
    expect(soundPartials(true, 3, 0.88)).toEqual({ count: 3, rolloff: 0.88 });
    expect(soundPartials(true, 12, 0.7)).toEqual({ count: 12, rolloff: 0.7 });
    expect(soundPartials(true, 30, 0.2)).toEqual({ count: 16, rolloff: 0.5 });
    expect(soundPartials(false, 3, 0.6)).toEqual({ count: 7, rolloff: 0.88 });
  });

  it('setPartials before the first sound builds the wave once with the new values', () => {
    const { engine, ctx } = setup();
    engine.setTimbre('harmonic');
    engine.setPartials(3, 0.88);
    engine.start('a', 220);
    expect(ctx().waves).toHaveLength(1);
    expect(ctx().waves[0].imag).toHaveLength(4);
    expect(ctx().waves[0].imag[3]).toBeCloseTo(0.7744, 6);
  });

  it('a held voice keeps its wave; the next voice gets the new one; a repeat of the same values rebuilds nothing', () => {
    const { engine, ctx } = setup();
    engine.setTimbre('harmonic');
    engine.setPartials(3, 0.88);
    engine.start('a', 220);
    const c = ctx();
    engine.setPartials(12, 0.88);
    expect(c.waves).toHaveLength(2);
    expect(c.waves[1].imag).toHaveLength(13);
    engine.start('b', 330);
    expect(c.oscs[0].wave).toBe(c.waves[0]);
    expect(c.oscs[1].wave).toBe(c.waves[1]);
    engine.setPartials(12, 0.88);
    engine.setPartials(12.2, 0.88);
    expect(c.waves).toHaveLength(2);
    expect(engine.getPartials()).toEqual({ count: 12, rolloff: 0.88 });
  });

  it('the sine timbre has no partials: a change leaves every voice a plain sine', () => {
    const { engine, ctx } = setup();
    engine.start('s', 220);
    engine.setPartials(12, 0.7);
    engine.start('t', 330);
    expect(ctx().oscs.every((o) => o.type === 'sine' && o.wave === null)).toBe(true);
  });
});

describe('reverb (A1)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** The nodes the wet path adds, in the order the engine makes them (right after the master gain). */
  const wetNodes = (c: FakeCtx) => ({
    master: c.gains[0],
    dry: c.gains[1],
    send: c.gains[2],
    out: c.gains[3],
  });
  const lastTarget = (g: { gain: { events: { kind: string; v?: number }[] } }) =>
    g.gain.events.filter((e) => e.kind === 'target').at(-1)?.v;

  it('Dry (the default) leaves the graph exactly as it was: no convolver, no extra gain, master straight to the limiter', () => {
    const { engine, ctx } = setup();
    engine.start('a', 220);
    const c = ctx();
    expect(engine.hasWetPath).toBe(false);
    expect(c.convolvers).toHaveLength(0);
    expect(c.buffers).toHaveLength(0);
    expect(c.gains).toHaveLength(2); // the master and the voice
    expect(c.gains[0].connected).toHaveLength(1);
    // Dry with any mix still builds nothing
    engine.setReverb('dry', 0.8);
    engine.setReverb('dry', 0);
    expect(engine.hasWetPath).toBe(false);
    expect(c.convolvers).toHaveLength(0);
    expect(c.gains[0].gain.events.filter((e) => e.kind === 'target')).toHaveLength(0);
  });

  it('a preset other than Dry builds the wet path on first use: master -> dry gain -> limiter and master -> send -> convolver -> wet gain -> limiter', () => {
    const { engine, ctx } = setup();
    engine.setReverb('room', 0.5);
    engine.start('a', 220);
    const c = ctx();
    const { master, dry, send, out } = wetNodes(c);
    expect(engine.hasWetPath).toBe(true);
    expect(master.connected).toEqual([dry, send]);
    expect(send.connected).toEqual([c.convolvers[0]]);
    expect(c.convolvers[0].connected).toEqual([out]);
    expect(dry.connected).toHaveLength(1);
    expect(out.connected).toEqual(dry.connected); // both end in the limiter
    // normalize is on before the buffer is set (the scaling is applied when it is set)
    expect(c.convolvers[0].normalize).toBe(true);
    expect(c.convolvers[0].normalizeAtBuffer).toBe(true);
    // the first voice comes after the wet nodes
    expect(c.oscs).toHaveLength(1);
  });

  it('sets the gains equal-power from the mix; the wet gain starts at 0', () => {
    const { engine, ctx } = setup();
    engine.setReverb('hall', 0.5);
    engine.start('a', 220);
    const { dry, out } = wetNodes(ctx());
    expect(out.gain.events[0]).toMatchObject({ kind: 'set', v: 0 });
    expect(lastTarget(out)).toBeCloseTo(mixGains(0.5).wet, 9);
    expect(lastTarget(dry)).toBeCloseTo(mixGains(0.5).dry, 9);
    engine.setReverb('hall', 1);
    expect(lastTarget(out)).toBeCloseTo(1, 9);
    expect(lastTarget(dry)).toBeCloseTo(0, 9);
    engine.setReverb('hall', 0);
    expect(lastTarget(out)).toBe(0);
    expect(lastTarget(dry)).toBe(1);
  });

  it('Room is about 0.9 s and Hall about 2.8 s, stereo, made from the generated impulse', () => {
    const room = setup();
    room.engine.setReverb('room', 0.5);
    room.engine.start('a', 220);
    const rb = room.ctx().convolvers[0].buffer as FakeBuffer;
    expect(rb.numberOfChannels).toBe(2);
    expect(rb.length).toBe(Math.round(0.9 * 48000));
    expect(rb.sampleRate).toBe(48000);
    expect(rb.getChannelData(0)[1234]).toBe(makeImpulse('room', 48000)[0][1234]);
    const hall = setup();
    hall.engine.setReverb('hall', 0.5);
    hall.engine.start('a', 220);
    expect((hall.ctx().convolvers[0].buffer as FakeBuffer).length).toBe(Math.round(2.8 * 48000));
  });

  it('a preset chosen after the context exists builds the path then (the voices already sounding are untouched)', () => {
    const { engine, ctx } = setup();
    engine.start('a', 220);
    const c = ctx();
    const voice = c.gains[1];
    engine.setReverb('room', 0.4);
    expect(engine.hasWetPath).toBe(true);
    expect(c.convolvers).toHaveLength(1);
    expect(voice.disconnected).toBe(false);
    expect(c.oscs[0].stopAt).toBeNull();
  });

  it('a preset change swaps the convolver behind a short fade of the wet gain (about 30 ms)', () => {
    vi.useFakeTimers();
    const { engine, ctx } = setup();
    engine.setReverb('room', 0.5);
    engine.start('a', 220);
    const c = ctx();
    const { out } = wetNodes(c);
    const first = c.convolvers[0];
    c.currentTime = 1;
    engine.setReverb('hall', 0.5);
    // the wet gain fades first; the old convolver is still in place
    expect(out.gain.events.at(-1)).toMatchObject({ kind: 'target', v: 0, t: 1 });
    expect(c.convolvers).toHaveLength(1);
    vi.advanceTimersByTime(29);
    expect(c.convolvers).toHaveLength(1);
    vi.advanceTimersByTime(2);
    expect(c.convolvers).toHaveLength(2);
    expect(first.disconnected).toBe(true);
    expect((c.convolvers[1].buffer as FakeBuffer).length).toBe(Math.round(2.8 * 48000));
    expect(c.convolvers[1].normalizeAtBuffer).toBe(true);
    // and the wet gain is brought back to the mix
    expect(out.gain.events.at(-1)?.v).toBeCloseTo(mixGains(0.5).wet, 9);
  });

  it('the same preset again changes nothing but the gains; a mix change during a swap does not unmute early', () => {
    vi.useFakeTimers();
    const { engine, ctx } = setup();
    engine.setReverb('room', 0.5);
    engine.start('a', 220);
    const c = ctx();
    engine.setReverb('room', 0.7);
    expect(c.convolvers).toHaveLength(1);
    engine.setReverb('hall', 0.7);
    const { out } = wetNodes(c);
    engine.setReverb('hall', 0.9); // mid-swap
    expect(out.gain.events.at(-1)).toMatchObject({ kind: 'target', v: 0 });
    vi.advanceTimersByTime(40);
    expect(out.gain.events.at(-1)?.v).toBeCloseTo(mixGains(0.9).wet, 9);
  });

  it('going back to Dry sets dry 1 and wet 0 and keeps the path (nothing is torn down)', () => {
    const { engine, ctx } = setup();
    engine.setReverb('hall', 1);
    engine.start('a', 220);
    engine.setReverb('dry', 1);
    const { dry, out } = wetNodes(ctx());
    expect(lastTarget(dry)).toBe(1);
    expect(lastTarget(out)).toBe(0);
    expect(engine.hasWetPath).toBe(true);
  });

  it('ignores an unknown preset and a bad mix', () => {
    const { engine } = setup();
    engine.setReverb('cathedral' as never, 0.5);
    engine.setReverb('hall', Number.NaN);
    engine.setReverb('hall', Number.POSITIVE_INFINITY);
    engine.start('a', 220);
    expect(engine.hasWetPath).toBe(false);
  });

  it('panic: the wet gain fades to 0 within about 0.15 s, then a fresh convolver replaces the old one and the wet gain comes back', () => {
    vi.useFakeTimers();
    const { engine, ctx } = setup();
    engine.setReverb('hall', 0.6);
    engine.start('a', 220);
    const c = ctx();
    const { out } = wetNodes(c);
    const old = c.convolvers[0];
    c.currentTime = 2;
    engine.stopAll();
    // 0.03 s time constant: 99 % down in 0.14 s
    expect(out.gain.events.at(-1)).toMatchObject({ kind: 'target', v: 0, t: 2, tc: 0.03 });
    expect(c.convolvers).toHaveLength(1);
    vi.advanceTimersByTime(199);
    expect(c.convolvers).toHaveLength(1);
    vi.advanceTimersByTime(2);
    expect(c.convolvers).toHaveLength(2);
    expect(old.disconnected).toBe(true);
    // the new convolver is empty of old tail: same impulse, wired in the same place
    expect(c.convolvers[1].buffer).toBe(old.buffer);
    expect(wetNodes(c).send.connected).toEqual([c.convolvers[1]]);
    expect(c.convolvers[1].connected).toEqual([out]);
    expect(out.gain.events.at(-1)?.v).toBeCloseTo(mixGains(0.6).wet, 9);
    // the voice fade itself is the same as without a reverb
    expect(c.oscs[0].stopAt).toBeCloseTo(2.15, 9);
  });

  it('panic with the reverb Dry does nothing extra, and a second panic restarts the wait instead of stacking', () => {
    vi.useFakeTimers();
    const dry = setup();
    dry.engine.start('a', 220);
    dry.engine.stopAll();
    vi.advanceTimersByTime(500);
    expect(dry.ctx().convolvers).toHaveLength(0);
    const { engine, ctx } = setup();
    engine.setReverb('room', 0.5);
    engine.start('a', 220);
    engine.stopAll();
    vi.advanceTimersByTime(100);
    engine.stopAll();
    vi.advanceTimersByTime(150);
    expect(ctx().convolvers).toHaveLength(1);
    vi.advanceTimersByTime(60);
    expect(ctx().convolvers).toHaveLength(2);
  });

  it('dispose cancels a pending swap and a pending panic wait', () => {
    vi.useFakeTimers();
    const { engine, ctx } = setup();
    engine.setReverb('room', 0.5);
    engine.start('a', 220);
    engine.setReverb('hall', 0.5);
    engine.stopAll();
    engine.dispose();
    vi.advanceTimersByTime(1000);
    expect(ctx().convolvers).toHaveLength(1);
  });

  describe('a custom impulse', () => {
    const imp = (channels: number, seconds: number, rate = 48000): ImpulseData => ({
      name: 'stairwell.wav',
      sampleRate: rate,
      channels: Array.from({ length: channels }, (_, c) =>
        Float32Array.from(
          { length: Math.round(seconds * rate) },
          (_v, i) => (c + 1) * 0.001 * (i % 7)
        )
      ),
    });

    it('Custom uses the loaded impulse: stereo keeps two channels, mono stays one', () => {
      const a = setup();
      a.engine.setCustomImpulse(imp(2, 2.4));
      a.engine.setReverb('custom', 0.5);
      a.engine.start('x', 220);
      const sb = a.ctx().convolvers[0].buffer as FakeBuffer;
      expect(sb.numberOfChannels).toBe(2);
      expect(sb.length).toBe(Math.round(2.4 * 48000));
      expect(sb.getChannelData(1)[3]).toBeCloseTo(0.006, 6);
      const b = setup();
      b.engine.setCustomImpulse(imp(1, 1));
      b.engine.setReverb('custom', 0.5);
      b.engine.start('x', 220);
      expect((b.ctx().convolvers[0].buffer as FakeBuffer).numberOfChannels).toBe(1);
      expect(b.ctx().convolvers[0].normalizeAtBuffer).toBe(true);
    });

    it('Custom with no impulse loaded plays as Hall', () => {
      const { engine, ctx } = setup();
      engine.setReverb('custom', 0.5);
      expect(engine.effectivePreset()).toBe('hall');
      engine.start('x', 220);
      expect((ctx().convolvers[0].buffer as FakeBuffer).length).toBe(Math.round(2.8 * 48000));
    });

    it('an impulse stored at another sample rate is resampled to the context rate', () => {
      const { engine, ctx } = setup();
      engine.setCustomImpulse(imp(2, 1, 24000));
      engine.setReverb('custom', 0.5);
      engine.start('x', 220);
      const b = ctx().convolvers[0].buffer as FakeBuffer;
      expect(b.sampleRate).toBe(48000);
      expect(b.length).toBe(48000);
    });

    it('removing the impulse while Custom is chosen swaps to Hall; loading one while Hall plays leaves Hall until Custom is chosen', () => {
      vi.useFakeTimers();
      const { engine, ctx } = setup();
      engine.setCustomImpulse(imp(2, 1));
      engine.setReverb('custom', 0.5);
      engine.start('x', 220);
      const c = ctx();
      expect(c.convolvers).toHaveLength(1);
      engine.setCustomImpulse(null);
      vi.advanceTimersByTime(40);
      expect(c.convolvers).toHaveLength(2);
      expect((c.convolvers[1].buffer as FakeBuffer).length).toBe(Math.round(2.8 * 48000));
      engine.setReverb('hall', 0.5);
      engine.setCustomImpulse(imp(2, 1));
      vi.advanceTimersByTime(40);
      expect(c.convolvers).toHaveLength(2);
    });

    it('a new impulse while Custom is playing replaces the old one', () => {
      vi.useFakeTimers();
      const { engine, ctx } = setup();
      engine.setCustomImpulse(imp(2, 1));
      engine.setReverb('custom', 0.5);
      engine.start('x', 220);
      engine.setCustomImpulse(imp(2, 2));
      vi.advanceTimersByTime(40);
      const c = ctx();
      expect(c.convolvers).toHaveLength(2);
      expect((c.convolvers[1].buffer as FakeBuffer).length).toBe(2 * 48000);
    });
  });

  describe('decodeImpulse', () => {
    it('hands back the first two channels as copies and the decoded sample rate', async () => {
      const { engine, ctx } = setup();
      engine.start('x', 220);
      const buf = new FakeBuffer(3, 4, 44100);
      buf.getChannelData(0).set([1, 2, 3, 4]);
      ctx().decoded = buf;
      const r = await engine.decodeImpulse(new ArrayBuffer(8));
      expect(r?.sampleRate).toBe(44100);
      expect(r?.channels).toHaveLength(2);
      expect(Array.from(r!.channels[0])).toEqual([1, 2, 3, 4]);
      buf.getChannelData(0)[0] = 99;
      expect(r!.channels[0][0]).toBe(1);
    });

    it('is null when the browser cannot decode the bytes, and when there is no Web Audio; nothing throws', async () => {
      const { engine, ctx } = setup();
      engine.start('x', 220);
      ctx().decodeError = true;
      expect(await engine.decodeImpulse(new ArrayBuffer(8))).toBeNull();
      const none = new VoiceEngine({
        createContext: () => {
          throw new Error('no audio');
        },
      });
      expect(await none.decodeImpulse(new ArrayBuffer(8))).toBeNull();
      none.setReverb('hall', 0.5);
      none.setPartials(3, 0.9);
      none.setCustomImpulse(null);
      none.dispose();
    });
  });
});
