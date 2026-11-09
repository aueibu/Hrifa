import { vi } from 'vitest';
import { defaultMusicalTimeline, musicalDuration, musicalPosition } from '../musicalTime';
import { ToneAudioEngine } from './ToneAudioEngine';
import type { MusicalPerformancePlan, SecondsPerformancePlan } from './types';

function createFakeTone() {
  const gains: FakeGain[] = [];
  const instruments: FakePolySynth[] = [];
  const scheduled: { callback(time: number): void; time: number }[] = [];
  const transport = {
    PPQ: 960,
    ticks: 0,
    state: 'stopped' as 'stopped' | 'started',
    loop: false,
    loopStart: '' as string,
    loopEnd: '' as string,
    bpm: { value: 120, setValueAtTime: vi.fn() },
    schedule: vi.fn((callback: (time: number) => void, time: number) => {
      scheduled.push({ callback, time });
      return scheduled.length;
    }),
    clear: vi.fn(),
    start: vi.fn(() => {
      transport.state = 'started';
    }),
  };

  class FakeGain {
    gain = { rampTo: vi.fn() };
    input = {};
    dispose = vi.fn();
    disconnect = vi.fn();
    connect = vi.fn(() => this);

    constructor(public value: number) {
      gains.push(this);
    }

    toDestination() {
      return this;
    }
  }

  class FakePolySynth {
    triggerAttackRelease = vi.fn();
    releaseAll = vi.fn();
    dispose = vi.fn();

    constructor() {
      instruments.push(this);
    }

    connect() {
      return this;
    }
  }

  return {
    tone: {
      start: vi.fn().mockResolvedValue(undefined),
      now: vi.fn(() => 10),
      Gain: FakeGain,
      PolySynth: FakePolySynth,
      Synth: class {},
      MembraneSynth: class {},
      Ticks: vi.fn((value: number) => value),
      getContext: vi.fn(() => ({ rawContext: { fake: 'context' } })),
      getTransport: vi.fn(() => transport),
    },
    gains,
    instruments,
    scheduled,
    transport,
  };
}

function plan(sourceId: string): SecondsPerformancePlan {
  return {
    id: `${sourceId}:plan`,
    sourceId,
    timebase: { kind: 'seconds' },
    durationSeconds: 1,
    warnings: [],
    events: [
      {
        id: `${sourceId}:event`,
        atSeconds: 0.25,
        durationSeconds: 0.2,
        pitchMidicents: 6900,
        velocity: 0.75,
        instrumentId: 'preview.triangle',
        busId: 'preview',
        provenance: [],
      },
    ],
  };
}

function musicalPlan(sourceId: string): MusicalPerformancePlan {
  return {
    id: `${sourceId}:musical-plan`,
    sourceId,
    timebase: { kind: 'musical', timeline: defaultMusicalTimeline },
    duration: musicalDuration(1),
    warnings: [],
    events: [
      {
        id: `${sourceId}:event`,
        at: musicalPosition(1, 2),
        duration: musicalDuration(1, 4),
        pitchMidicents: 6900,
        velocity: 0.75,
        instrumentId: 'preview.triangle',
        busId: 'preview',
        provenance: [],
      },
    ],
  };
}

describe('ToneAudioEngine', () => {
  it('schedules plans through shared buses and exposes live session gain', async () => {
    const fake = createFakeTone();
    const engine = new ToneAudioEngine(async () => fake.tone as never);
    const session = await engine.play({ plan: plan('pitch-list'), busGains: { preview: 0.25 } });

    expect(fake.tone.start).toHaveBeenCalledOnce();
    expect(fake.instruments[0].triggerAttackRelease).toHaveBeenCalledWith(440, 0.2, 10.31, 0.75);
    session.setBusGain('preview', 0.5);
    expect(fake.gains[1].gain.rampTo).toHaveBeenCalledWith(0.5, 0.008);

    session.stop();
    expect(session.active).toBe(false);
    expect(fake.instruments[0].dispose).toHaveBeenCalledOnce();
    engine.dispose();
  });

  it('replaces only an earlier session from the same module source', async () => {
    const fake = createFakeTone();
    const engine = new ToneAudioEngine(async () => fake.tone as never);
    const pitch = await engine.play({ plan: plan('pitch-list') });
    const interference = await engine.play({ plan: plan('interference') });
    const nextPitch = await engine.play({ plan: plan('pitch-list') });

    expect(pitch.active).toBe(false);
    expect(interference.active).toBe(true);
    expect(nextPitch.active).toBe(true);
    engine.dispose();
  });

  it('keeps musical events on transport ticks until Tone supplies audio-clock time', async () => {
    const fake = createFakeTone();
    const engine = new ToneAudioEngine(async () => fake.tone as never);
    const session = await engine.play({ plan: musicalPlan('melody') });

    expect(fake.transport.start).toHaveBeenCalledWith(10.06);
    expect(fake.scheduled[0].time).toBe(540);
    expect(fake.instruments[0].triggerAttackRelease).not.toHaveBeenCalled();

    fake.scheduled[0].callback(20);
    expect(fake.instruments[0].triggerAttackRelease).toHaveBeenCalledWith(440, 0.125, 20, 0.75);

    session.stop();
    expect(fake.transport.clear).toHaveBeenCalledWith(1);
    expect(fake.transport.clear).toHaveBeenCalledWith(2);
    engine.dispose();
  });

  it('resolves note length across tempo changes only at the rendering boundary', async () => {
    const fake = createFakeTone();
    const engine = new ToneAudioEngine(async () => fake.tone as never);
    const changingTempoPlan: MusicalPerformancePlan = {
      ...musicalPlan('tempo-change'),
      timebase: {
        kind: 'musical',
        timeline: {
          ...defaultMusicalTimeline,
          tempoMap: [
            { at: musicalPosition(0), bpm: 120 },
            { at: musicalPosition(2), bpm: 60 },
          ],
        },
      },
      duration: musicalDuration(4),
      events: [
        {
          ...musicalPlan('tempo-change').events[0],
          at: musicalPosition(3, 2),
          duration: musicalDuration(1),
        },
      ],
    };

    await engine.play({ plan: changingTempoPlan });
    expect(fake.scheduled[0].time).toBe(1980);
    fake.scheduled[0].callback(19);
    expect(fake.transport.bpm.setValueAtTime).toHaveBeenCalledWith(60, 19);

    expect(fake.scheduled[1].time).toBe(1500);
    fake.scheduled[1].callback(20);
    expect(fake.instruments[0].triggerAttackRelease).toHaveBeenCalledWith(440, 0.75, 20, 0.75);
    engine.dispose();
  });

  describe('looping', () => {
    it('loops the transport over one pass, never completes, and releases the loop on stop', async () => {
      const fake = createFakeTone();
      const engine = new ToneAudioEngine(async () => fake.tone as never);
      const onComplete = vi.fn();
      const session = await engine.play({ plan: musicalPlan('mix'), loop: true, onComplete });

      // The plan starts 1/16 quarter after the transport's current tick (60 of 960 PPQ).
      expect(fake.transport.loop).toBe(true);
      expect(fake.transport.loopStart).toBe('60i');
      expect(fake.transport.loopEnd).toBe('1020i');
      // One scheduled event, and no completion callback to end the session.
      expect(fake.scheduled).toHaveLength(1);
      expect(engine.clock('mix')?.loopSeconds).toBeCloseTo(0.5);

      session.stop();
      expect(fake.transport.loop).toBe(false);
      expect(onComplete).not.toHaveBeenCalled();
      engine.dispose();
    });

    it('does not loop the count-in: the loop begins after it', async () => {
      const fake = createFakeTone();
      const engine = new ToneAudioEngine(async () => fake.tone as never);
      engine.setTransport({
        tempo: 120,
        meter: '4/4',
        pulse: '1/4',
        metronome: true,
        metronomeVolume: 30,
        countIn: true,
      });
      await engine.play({ plan: musicalPlan('mix'), loop: true, followTransport: true });

      // A 4/4 count-in is four quarter notes (3840 ticks); one pass is still the caller's 1 quarter.
      expect(fake.transport.loopStart).toBe('3900i');
      expect(fake.transport.loopEnd).toBe('4860i');
      engine.dispose();
    });

    it('rounds a pass that is not a whole number of ticks instead of drifting', async () => {
      const fake = createFakeTone();
      const engine = new ToneAudioEngine(async () => fake.tone as never);
      const sevenths: MusicalPerformancePlan = {
        ...musicalPlan('mix'),
        duration: musicalDuration(4, 7),
        events: [],
      };
      await engine.play({ plan: sevenths, loop: true });

      // 4/7 of 960 ticks is 548.57; the loop uses 549 for every pass.
      expect(
        Number.parseInt(fake.transport.loopEnd, 10) - Number.parseInt(fake.transport.loopStart, 10)
      ).toBe(549);
      engine.dispose();
    });

    it('does not report a loop length for ordinary sessions', async () => {
      const fake = createFakeTone();
      const engine = new ToneAudioEngine(async () => fake.tone as never);
      await engine.play({ plan: musicalPlan('melody') });
      expect(engine.clock('melody')).not.toHaveProperty('loopSeconds');
      expect(fake.transport.loop).toBe(false);
      engine.dispose();
    });

    it('refuses to loop a seconds plan', async () => {
      const fake = createFakeTone();
      const engine = new ToneAudioEngine(async () => fake.tone as never);
      await expect(engine.play({ plan: plan('pitch-list'), loop: true })).rejects.toThrow(
        /musical performance plan/
      );
      engine.dispose();
    });
  });

  describe('sampled instruments', () => {
    function createFakeSmplr(options: { failFirst?: boolean } = {}) {
      const instruments: {
        patch: string | undefined;
        destination: unknown;
        ready: Promise<void>;
        start: ReturnType<typeof vi.fn>;
        stop: ReturnType<typeof vi.fn>;
      }[] = [];
      let failures = options.failFirst ? 1 : 0;
      const smplr = {
        Soundfont: vi.fn(
          (_context: unknown, config: { instrument?: string; destination?: unknown }) => {
            const failing = failures > 0;
            failures = Math.max(0, failures - 1);
            const instrument = {
              patch: config.instrument,
              destination: config.destination,
              ready: failing ? Promise.reject(new Error('offline')) : Promise.resolve(),
              start: vi.fn(),
              stop: vi.fn(),
            };
            instrument.ready.catch(() => undefined);
            instruments.push(instrument);
            return instrument;
          }
        ),
      };
      return { smplr, instruments };
    }

    function sampledPlan(sourceId: string): SecondsPerformancePlan {
      const base = plan(sourceId);
      return {
        ...base,
        events: [{ ...base.events[0], instrumentId: 'gm.piano', pitchMidicents: 6950 }],
      };
    }

    it('loads the General MIDI patch once and plays notes through it with their detune', async () => {
      const fake = createFakeTone();
      const { smplr, instruments } = createFakeSmplr();
      const engine = new ToneAudioEngine(
        async () => fake.tone as never,
        async () => smplr as never
      );
      await engine.play({ plan: sampledPlan('piano-a') });

      expect(smplr.Soundfont).toHaveBeenCalledOnce();
      expect(instruments[0].patch).toBe('acoustic_grand_piano');
      expect(instruments[0].start).toHaveBeenCalledOnce();
      const event = instruments[0].start.mock.calls[0][0];
      expect(event.note).toBe(70);
      expect(event.detune).toBeCloseTo(-50);
      expect(event.time).toBeCloseTo(10.31);
      expect(event.duration).toBe(0.2);
      expect(event.velocity).toBe(95);
      // no synth was built for it
      expect(fake.instruments).toHaveLength(0);
      engine.dispose();
    });

    it('keeps the samples across sessions and unplugs the instrument when a session ends', async () => {
      const fake = createFakeTone();
      const { smplr, instruments } = createFakeSmplr();
      const engine = new ToneAudioEngine(
        async () => fake.tone as never,
        async () => smplr as never
      );
      const first = await engine.play({ plan: sampledPlan('piano-a') });
      // gains: the master, then the instrument's own output, then the session's bus
      const output = fake.gains[1];
      first.stop();
      await engine.play({ plan: sampledPlan('piano-a') });

      expect(smplr.Soundfont).toHaveBeenCalledOnce();
      expect(instruments[0].start).toHaveBeenCalledTimes(2);
      expect(output.disconnect).toHaveBeenCalled();
      engine.dispose();
      expect(instruments[0].stop).toHaveBeenCalled();
    });

    it('does not cache an instrument whose samples failed to load', async () => {
      const fake = createFakeTone();
      const { smplr } = createFakeSmplr({ failFirst: true });
      const engine = new ToneAudioEngine(
        async () => fake.tone as never,
        async () => smplr as never
      );
      await expect(engine.play({ plan: sampledPlan('piano-a') })).rejects.toThrow('offline');
      expect(engine.playing).toBe(false);

      await engine.play({ plan: sampledPlan('piano-a') });
      expect(smplr.Soundfont).toHaveBeenCalledTimes(2);
      engine.dispose();
    });

    it('refuses a SoundFont voice whose file is not open, and starts nothing', async () => {
      const fake = createFakeTone();
      const { smplr } = createFakeSmplr();
      const engine = new ToneAudioEngine(
        async () => fake.tone as never,
        async () => smplr as never
      );
      const base = plan('sf2-voice');
      const orphan: SecondsPerformancePlan = {
        ...base,
        events: [{ ...base.events[0], instrumentId: 'sf2:missing.sf2%2312|0:0' }],
      };

      await expect(engine.play({ plan: orphan })).rejects.toThrow('not loaded');
      expect(engine.playing).toBe(false);
      engine.dispose();
    });

    it('never loads the sampler for synth-only plans', async () => {
      const fake = createFakeTone();
      const loadSampler = vi.fn(async () => ({}) as never);
      const engine = new ToneAudioEngine(async () => fake.tone as never, loadSampler);
      await engine.play({ plan: plan('synth-only') });

      expect(loadSampler).not.toHaveBeenCalled();
      engine.dispose();
    });
  });
});
