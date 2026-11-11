import type { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import type { MusicalPerformancePlan, SecondsPerformancePlan } from './audio/types';
import { CompositionSettingsProvider, useCompositionSettings } from './compositionSettings';
import { musicalDuration, musicalPosition, rationalToNumber } from './musicalTime';
import {
  applyTransport,
  barSeconds,
  COUNT_IN_BUS,
  defaultTransportSettings,
  METER_BUS,
  pulseSeconds,
  transportBusGain,
  type TransportSettings,
} from './transport';

const transport = (patch: Partial<TransportSettings> = {}) => ({
  ...defaultTransportSettings,
  ...patch,
});

function secondsPlan(durationSeconds: number): SecondsPerformancePlan {
  return {
    id: 'p',
    sourceId: 'src',
    warnings: [],
    timebase: { kind: 'seconds' },
    durationSeconds,
    events: [
      {
        id: 'note',
        atSeconds: 0.25,
        durationSeconds: 0.1,
        pitchMidicents: 6000,
        velocity: 1,
        instrumentId: 'preview.sine',
        busId: 'preview',
        provenance: [],
      },
    ],
  };
}

describe('transport timing', () => {
  it('derives pulse and bar lengths from tempo, pulse value, and meter', () => {
    expect(pulseSeconds(transport())).toBeCloseTo(0.125); // 16ths at 120
    expect(pulseSeconds(transport({ pulse: '1/2', tempo: 60 }))).toBeCloseTo(0.5);
    expect(barSeconds(transport())).toBeCloseTo(2);
    expect(barSeconds(transport({ meter: '7/8' }))).toBeCloseTo(1.75);
  });

  it('gives the meter bus no gain while the metronome is off', () => {
    const toGain = (percent: number) => percent / 100;
    expect(transportBusGain(METER_BUS, transport(), toGain)).toBe(0);
    expect(transportBusGain(METER_BUS, transport({ metronome: true }), toGain)).toBeCloseTo(0.3);
    expect(transportBusGain(COUNT_IN_BUS, transport(), toGain)).toBeCloseTo(0.3);
    expect(transportBusGain('preview', transport(), toGain)).toBeUndefined();
  });
});

describe('applyTransport', () => {
  it('clicks every beat of a seconds plan, accenting downbeats', () => {
    const plan = applyTransport(secondsPlan(4), transport()) as SecondsPerformancePlan;
    const clicks = plan.events.filter((event) => event.busId === METER_BUS);
    expect(clicks.map((click) => click.atSeconds)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
    expect(
      clicks.filter((click) => click.pitchMidicents === clicks[0].pitchMidicents)
    ).toHaveLength(2);
    expect(plan.durationSeconds).toBe(4);
  });

  it('counts in one bar and shifts the material after it', () => {
    const plan = applyTransport(
      secondsPlan(2),
      transport({ countIn: true, meter: '3/4' })
    ) as SecondsPerformancePlan;
    expect(plan.events.filter((event) => event.busId === COUNT_IN_BUS)).toHaveLength(3);
    expect(plan.events.find((event) => event.id === 'note')?.atSeconds).toBeCloseTo(1.75);
    expect(plan.events.find((event) => event.busId === METER_BUS)?.atSeconds).toBeCloseTo(1.5);
    expect(plan.durationSeconds).toBeCloseTo(3.5);
  });

  it('clicks a musical plan in musical time and keeps every event inside it', () => {
    const musical: MusicalPerformancePlan = {
      id: 'm',
      sourceId: 'src',
      warnings: [],
      timebase: {
        kind: 'musical',
        timeline: {
          id: 't',
          ppq: 960,
          tempoMap: [{ at: musicalPosition(0), bpm: 120 }],
          meterMap: [{ atBar: 1, numerator: 4, denominator: 4 }],
        } as never,
      },
      duration: musicalDuration(3),
      events: [
        {
          id: 'note',
          at: musicalPosition(1),
          duration: musicalDuration(2),
          pitchMidicents: 6000,
          velocity: 1,
          instrumentId: 'preview.sine',
          busId: 'preview',
          provenance: [],
        },
      ],
    };
    const plan = applyTransport(musical, transport({ countIn: true })) as MusicalPerformancePlan;
    const at = (id: string) =>
      rationalToNumber(plan.events.find((event) => event.id === id)!.at.quarterNotes);
    expect(at('note')).toBe(5);
    expect(
      plan.events
        .filter((event) => event.busId === METER_BUS)
        .map((event) => rationalToNumber(event.at.quarterNotes))
    ).toEqual([4, 5, 6]);
    expect(rationalToNumber(plan.duration.quarterNotes)).toBe(7);
  });
});

describe('transport settings', () => {
  const wrapper = ({ children }: { children: ReactNode }) =>
    CompositionSettingsProvider({ children });

  beforeEach(() => localStorage.clear());

  it('defaults, updates, and survives a stored blob from before the transport existed', () => {
    localStorage.setItem('hrifa.composition-workbench.settings.v1', JSON.stringify({ edo: 19 }));
    const { result } = renderHook(() => useCompositionSettings(), { wrapper });
    expect(result.current.settings).toMatchObject({ edo: 19, transport: defaultTransportSettings });
    act(() => result.current.updateTransport({ tempo: 90, metronome: true, meter: 'nonsense' }));
    expect(result.current.settings.transport).toMatchObject({
      tempo: 90,
      metronome: true,
      meter: '4/4',
    });
  });
});
