import { resolvePacketFromOutput } from './compositionRouting';
import {
  householderCandidatesPacket,
  householderSelectedPacket,
  searchMetric,
  type MetricAxisSpec,
} from './householder';
import { melodicize } from './melodicization';
import { packet, type DataPacket, type PacketFrame } from './model';
import { musicalDuration, rationalToNumber } from './musicalTime';
import { interpretPitchList } from './pitch';
import { attackPositions, normalizeRhythmOrigin, rhythmOrigin } from './rhythmFrame';
import {
  acceptsRhythmRouteTreatment,
  applyRhythmRouteTreatment,
  defaultRhythmRouteTreatment,
  isRhythmRouteTreatmentIdentity,
  rhythmTreatmentSummary,
} from './routeTreatments';

function rhythm(values: number[], frame: Partial<PacketFrame> = {}): DataPacket<number> {
  return packet(
    'list',
    'duration',
    values.map((value, index) => ({
      id: `r:${index}`,
      value,
      provenance: [{ sourceModuleInstance: 'src', sourceItemIds: [], transformation: 'authored' }],
    })),
    [],
    undefined,
    {
      role: 'interOnset',
      frame: {
        topology: 'cyclic',
        unit: 'pulse',
        extent: values.reduce((total, value) => total + value, 0),
        origin: 0,
        ...frame,
      },
    }
  );
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

describe('rhythm start helpers', () => {
  it('reads, wraps, and clamps starts', () => {
    expect(rhythmOrigin(rhythm([3, 3, 2]))).toBe(0);
    expect(rhythmOrigin(rhythm([3, 3, 2], { origin: 2 }))).toBe(2);
    expect(normalizeRhythmOrigin(10, 'cyclic', 8)).toEqual({ origin: 2, clamped: false });
    expect(normalizeRhythmOrigin(-1, 'cyclic', 8)).toEqual({ origin: 7, clamped: false });
    expect(normalizeRhythmOrigin(-1, 'linear', 8)).toEqual({ origin: 0, clamped: true });
    expect(attackPositions([3, 3, 2], 1)).toEqual([1, 4, 7]);
  });
});

describe('route start offset', () => {
  const treat = (source: DataPacket, patch: Partial<typeof defaultRhythmRouteTreatment>) =>
    applyRhythmRouteTreatment(source, { ...defaultRhythmRouteTreatment, ...patch })!;

  it('moves the start and wraps it around a loop', () => {
    expect(treat(rhythm([3, 3, 2]), { offset: 2 }).frame?.origin).toBe(2);
    expect(treat(rhythm([3, 3, 2]), { offset: 10 }).frame?.origin).toBe(2);
    expect(treat(rhythm([3, 3, 2]), { offset: -1 }).frame?.origin).toBe(7);
  });

  it('keeps the start through retrograde and rotation, and scales it with the durations', () => {
    const started = rhythm([3, 3, 2], { origin: 1 });
    expect(treat(started, { retrograde: true, rotation: 1 }).frame?.origin).toBe(1);
    const scaled = treat(started, { durationScale: 2 });
    expect(scaled.frame?.origin).toBe(2);
    expect(scaled.frame?.extent).toBe(16);
  });

  it('adds leading rest in a linear frame and refuses to start before it', () => {
    const linear = rhythm([3, 3, 2], { topology: 'linear' });
    const later = treat(linear, { offset: 2 });
    expect(later.frame).toMatchObject({ origin: 2, extent: 10 });
    const earlier = treat(linear, { offset: -2 });
    expect(earlier.frame?.origin).toBe(0);
    expect(earlier.warnings.join(' ')).toMatch(/downbeat/);
  });

  it('accepts routes saved before offsets existed and summarizes an offset', () => {
    const { offset: _unused, ...legacy } = defaultRhythmRouteTreatment;
    expect(acceptsRhythmRouteTreatment(legacy)).toBe(true);
    expect(isRhythmRouteTreatmentIdentity(legacy)).toBe(true);
    const moved = { ...defaultRhythmRouteTreatment, offset: 2 };
    expect(isRhythmRouteTreatmentIdentity(moved)).toBe(false);
    expect(rhythmTreatmentSummary(moved)).toBe('Start +2');
  });
});

describe('melodicization with a start offset', () => {
  it('shifts every attack by the start while bar lines stay put', () => {
    const pitches = interpretPitchList({
      instanceId: 'p',
      format: 'midi-note',
      inlineText: '60, 62',
    }).packet;
    const result = melodicize({
      instanceId: 'm',
      rhythm: rhythm([2, 2], { origin: 1 }),
      pitches,
      allocation: 'cycle',
      pulseUnit: musicalDuration(1),
      articulationPercent: 100,
    });
    expect(result.errors).toEqual([]);
    const onsets = result.packet.items.map((item) =>
      rationalToNumber(
        (item.value as { onset: { quarterNotes: Parameters<typeof rationalToNumber>[0] } }).onset
          .quarterNotes
      )
    );
    expect(onsets).toEqual([1, 3]);
  });
});

describe('metric mode with a free start', () => {
  const son = [3, 3, 4, 2, 4];
  const accent: MetricAxisSpec = {
    key: 'accent',
    enabled: true,
    pattern: [1, 0, 0, 0],
    coefficient: -1,
    weight: 1,
  };
  const position: MetricAxisSpec = { key: 'position', enabled: true, coefficient: -1, weight: 1 };
  const base = { durations: son, grid: 1, minUnits: 1, closeness: 0.1, maxCandidates: 8 };

  it('displaces son clave later in the bar to mirror its early lean, keeping it intact', () => {
    const result = searchMetric({ ...base, axes: [position], identity: 1, pinStart: false });
    const best = result.candidates[0];
    expect(best.origin).toBe(3);
    expect(best.identityChange).toBe(0);
    expect(best.axes![0].realized).toBeCloseTo(best.axes![0].target);
    expect(sum(best.durations)).toBe(16);
  });

  it('can reach fully off-beat placements that a pinned start cannot', () => {
    const pinned = searchMetric({ ...base, axes: [accent], identity: 1, pinStart: true });
    const free = searchMetric({ ...base, axes: [accent], identity: 1, pinStart: false });
    const lowest = (result: typeof free) =>
      Math.min(...result.candidates.map((candidate) => candidate.axes![0].realized));
    expect(lowest(free)).toBeLessThan(lowest(pinned));
    expect(free.candidates.some((candidate) => (candidate.origin ?? 0) > 0)).toBe(true);
    expect(pinned.candidates.every((candidate) => candidate.origin === 0)).toBe(true);
  });

  it('keeps a pinned start where the input starts', () => {
    const result = searchMetric({
      ...base,
      axes: [accent],
      identity: 0,
      pinStart: true,
      origin: 2,
    });
    expect(result.candidates.every((candidate) => candidate.origin === 2)).toBe(true);
  });

  it('fits a leading rest inside a linear frame', () => {
    const result = searchMetric({
      ...base,
      axes: [accent],
      identity: 1,
      pinStart: false,
      cyclic: false,
    });
    for (const candidate of result.candidates) {
      expect((candidate.origin ?? 0) + sum(candidate.durations)).toBe(16);
    }
  });

  it('carries each candidate start into the selected list and the bank entries', () => {
    const input = rhythm(son);
    const result = searchMetric({ ...base, axes: [position], identity: 1, pinStart: false });
    const selected = householderSelectedPacket(
      result.candidates[0],
      input,
      [],
      'hh',
      'householder-metric',
      {}
    );
    expect(selected.frame?.origin).toBe(3);
    const bank = householderCandidatesPacket(
      result.candidates,
      input,
      [],
      'hh',
      'householder-metric',
      {}
    );
    const entry = resolvePacketFromOutput(
      { ref: { instanceId: 'hh', port: 'candidates' }, label: 'Candidates', packet: bank },
      0,
      'route:test'
    );
    expect(entry?.frame?.origin).toBe(3);
    expect(entry?.items.map((item) => item.value)).toEqual(result.candidates[0].durations);
  });
});
