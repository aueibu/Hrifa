import { afterEach, vi } from 'vitest';
import { defaultMusicalTimeline, musicalDuration, musicalPosition } from '../musicalTime';
import { ToneAudioEngine } from './ToneAudioEngine';
import type { MusicalPerformancePlan, SecondsPerformancePlan } from './types';

function createFakeTone() {
  const gains: FakeGain[] = [];
  const instruments: FakePolySynth[] = [];
  const players: FakePlayer[] = [];
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

  class FakePlayer {
    start = vi.fn();
    stop = vi.fn();
    dispose = vi.fn();
    connect = vi.fn(() => this);

    constructor(public buffer: unknown) {
      players.push(this);
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
      Player: FakePlayer,
      getContext: vi.fn(() => ({
        sampleRate: 1000,
        rawContext: {
          fake: 'context',
          createBuffer: (_channels: number, length: number) => {
            const data = [new Float32Array(length), new Float32Array(length)];
            return { channels: data, getChannelData: (i: number) => data[i] };
          },
        },
      })),
      getTransport: vi.fn(() => transport),
    },
    gains,
    instruments,
    players,
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

const library = vi.hoisted(() => ({ voice: vi.fn() }));
vi.mock('./soundfontLibrary', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./soundfontLibrary')>()),
  soundfontVoice: library.voice,
}));

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

  describe('SoundFont voices', () => {
    const bank = { name: 'fake bank' };
    const patch = { bankMSB: 0, bankLSB: 0, program: 53, isDrum: false };

    function soundfontPlan(sourceId: string): SecondsPerformancePlan {
      const base = plan(sourceId);
      return {
        ...base,
        events: [
          { ...base.events[0], instrumentId: 'sf2:Heaven.sf2%231|0:0:53', pitchMidicents: 6050 },
          { ...base.events[0], id: 'synth', instrumentId: 'preview.triangle' },
        ],
      };
    }

    function setup() {
      const fake = createFakeTone();
      library.voice.mockReturnValue({ fileId: 'Heaven.sf2#1', bank, patch, name: 'Voice Oohs' });
      const render = vi.fn(async (options: { notes: { at: number }[]; sampleRate: number }) => ({
        left: new Float32Array(3000).fill(0.25),
        right: new Float32Array(3000).fill(-0.25),
        sampleRate: options.sampleRate,
      }));
      const engine = new ToneAudioEngine(
        async () => fake.tone as never,
        async () => ({}) as never,
        async () => ({ renderSoundfont: render }) as never
      );
      return { fake, engine, render };
    }

    afterEach(() => {
      vi.useRealTimers();
      library.voice.mockReset();
    });

    it('renders the SoundFont notes ahead of time and starts the audio with the plan', async () => {
      const { fake, engine, render } = setup();
      await engine.play({ plan: soundfontPlan('oohs') });

      expect(render).toHaveBeenCalledOnce();
      const options = render.mock.calls[0][0] as unknown as {
        bank: unknown;
        sampleRate: number;
        notes: {
          at: number;
          durationSeconds: number;
          midi: number;
          velocity: number;
          patch: unknown;
        }[];
      };
      expect(options.bank).toBe(bank);
      expect(options.sampleRate).toBe(1000);
      expect(options.notes).toEqual([
        { at: 0.25, durationSeconds: 0.2, midi: 60.5, velocity: 0.75, patch },
      ]);
      // the rendered audio is copied into a stereo buffer and started at the plan's start
      expect(fake.players).toHaveLength(1);
      const buffer = fake.players[0].buffer as { channels: Float32Array[] };
      expect(buffer.channels[0][100]).toBe(0.25);
      expect(buffer.channels[1][100]).toBe(-0.25);
      expect(fake.players[0].start).toHaveBeenCalledWith(10.06);
      engine.dispose();
    });

    it("still plays the plan's synth notes on voices and leaves the SoundFont notes off them", async () => {
      const { fake, engine } = setup();
      await engine.play({ plan: soundfontPlan('oohs') });

      expect(fake.instruments).toHaveLength(1);
      expect(fake.instruments[0].triggerAttackRelease).toHaveBeenCalledOnce();
      engine.dispose();
    });

    it('does not render or build a player for plans without SoundFont notes', async () => {
      const { fake, engine, render } = setup();
      await engine.play({ plan: plan('plain') });

      expect(render).not.toHaveBeenCalled();
      expect(fake.players).toHaveLength(0);
      engine.dispose();
    });

    it("converts musical positions to seconds with the plan's tempo and starts on the transport", async () => {
      const { fake, engine, render } = setup();
      const base = musicalPlan('musical-oohs');
      const musical: MusicalPerformancePlan = {
        ...base,
        events: [{ ...base.events[0], instrumentId: 'sf2:Heaven.sf2%231|0:0:53' }],
      };
      await engine.play({ plan: musical });

      const options = render.mock.calls[0][0] as unknown as {
        notes: { at: number; durationSeconds: number }[];
      };
      // the fixture's event sits half a quarter note in and lasts a quarter note, at the default tempo
      expect(options.notes[0].at).toBeCloseTo(0.25);
      expect(options.notes[0].durationSeconds).toBeCloseTo(0.125);
      // the player waits for the transport's first tick of the plan instead of starting at once
      expect(fake.players[0].start).not.toHaveBeenCalled();
      const starter = fake.scheduled.find((entry) => entry.time === 60);
      expect(starter).toBeDefined();
      starter!.callback(21);
      expect(fake.players[0].start).toHaveBeenCalledWith(21);
      engine.dispose();
    });

    it('refuses to mix SoundFont notes into a looping plan', async () => {
      const { engine } = setup();
      const base = musicalPlan('loop-oohs');
      const musical: MusicalPerformancePlan = {
        ...base,
        events: [{ ...base.events[0], instrumentId: 'sf2:Heaven.sf2%231|0:0:53' }],
      };

      await expect(engine.play({ plan: musical, loop: true })).rejects.toThrow('looping');
      expect(engine.playing).toBe(false);
      engine.dispose();
    });

    it('says so when the SoundFont file is not open', async () => {
      const { engine } = setup();
      library.voice.mockReturnValue(undefined);

      await expect(engine.play({ plan: soundfontPlan('oohs') })).rejects.toThrow('not loaded');
      expect(engine.playing).toBe(false);
      engine.dispose();
    });

    it('lets the rendered release finish playing after the plan ends', async () => {
      vi.useFakeTimers();
      const { fake, engine } = setup();
      await engine.play({ plan: soundfontPlan('oohs') });
      const bus = fake.gains.find(
        (gain) => gain.dispose.mock.calls.length === 0 && gain !== fake.gains[0]
      )!;

      vi.advanceTimersByTime(1400); // plan (1 s) + 0.3 s: the session finishes
      expect(engine.playing).toBe(false);
      expect(bus.dispose).not.toHaveBeenCalled();
      expect(fake.players[0].dispose).not.toHaveBeenCalled();

      vi.advanceTimersByTime(3000); // the rendered audio is 3 s long
      expect(bus.dispose).toHaveBeenCalledOnce();
      expect(fake.players[0].stop).toHaveBeenCalled();
      expect(fake.players[0].dispose).toHaveBeenCalledOnce();
    });

    it('fades the audio over a moment when stopped by hand', async () => {
      vi.useFakeTimers();
      const { fake, engine } = setup();
      const session = await engine.play({ plan: soundfontPlan('oohs') });
      const bus = fake.gains.find((gain) => gain !== fake.gains[0])!;

      session.stop();
      expect(bus.gain.rampTo).toHaveBeenCalledWith(0, 0.08);
      expect(fake.players[0].stop).not.toHaveBeenCalled();

      vi.advanceTimersByTime(200);
      expect(fake.players[0].stop).toHaveBeenCalled();
      expect(bus.dispose).toHaveBeenCalledOnce();
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

    describe('release tails', () => {
      afterEach(() => {
        vi.useRealTimers();
      });

      async function startPiano(fake: ReturnType<typeof createFakeTone>, sourceId = 'piano-a') {
        const { smplr, instruments } = createFakeSmplr();
        const engine = new ToneAudioEngine(
          async () => fake.tone as never,
          async () => smplr as never
        );
        const session = await engine.play({ plan: sampledPlan(sourceId) });
        // gains: the master, then the instrument's own output, then the session's bus
        return { engine, session, instruments, out: fake.gains[1], bus: fake.gains[2] };
      }

      it('lets the release of a finished plan ring out before taking its bus down', async () => {
        vi.useFakeTimers();
        const fake = createFakeTone();
        const { engine, bus, out, instruments } = await startPiano(fake);

        // the plan is one second long; it finishes 0.3 s later
        vi.advanceTimersByTime(1400);
        expect(engine.playing).toBe(false);
        expect(bus.dispose).not.toHaveBeenCalled();
        expect(out.disconnect).toHaveBeenCalledTimes(1); // only the initial re-route

        vi.advanceTimersByTime(4600);
        expect(bus.dispose).toHaveBeenCalledOnce();
        expect(out.disconnect).toHaveBeenCalledTimes(2);
        expect(instruments[0].stop).toHaveBeenCalledOnce();
      });

      it('fades sampled voices over a moment when a session is stopped by hand', async () => {
        vi.useFakeTimers();
        const fake = createFakeTone();
        const { session, bus } = await startPiano(fake);

        session.stop();
        expect(bus.gain.rampTo).toHaveBeenCalledWith(0, 0.08);
        expect(bus.dispose).not.toHaveBeenCalled();

        vi.advanceTimersByTime(200);
        expect(bus.dispose).toHaveBeenCalledOnce();
      });

      it('does not stop the notes of a newer session when an older session finishes tearing down', async () => {
        vi.useFakeTimers();
        const fake = createFakeTone();
        const { smplr, instruments } = createFakeSmplr();
        const engine = new ToneAudioEngine(
          async () => fake.tone as never,
          async () => smplr as never
        );
        const first = await engine.play({ plan: sampledPlan('piano-a') });
        first.stop();
        await engine.play({ plan: sampledPlan('piano-a') });

        vi.advanceTimersByTime(300);
        // the first session's teardown ran, but the output now belongs to the second session
        expect(instruments[0].stop).not.toHaveBeenCalled();
        expect(engine.playing).toBe(true);
        engine.dispose();
      });
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
