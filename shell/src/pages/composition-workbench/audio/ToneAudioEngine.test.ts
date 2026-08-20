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
    dispose = vi.fn();

    constructor(public value: number) {
      gains.push(this);
    }

    connect() {
      return this;
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
      Ticks: vi.fn((value: number) => value),
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
});
