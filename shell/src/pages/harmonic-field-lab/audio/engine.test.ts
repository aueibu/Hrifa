import { describe, expect, it } from 'vitest';
import { ATTACK, PARTIALS, ROLLOFF, VoiceEngine, chordAmp, hzOf } from './engine';
import { FakeCtx } from './fakeContext';

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
