import { describe, expect, it } from 'vitest';
import {
  compositionCount,
  householderCandidatesPacket,
  householderSelectedPacket,
  intervalContent,
  projectToFloor,
  reflectAxisPreset,
  reflectRhythm,
  roundPreservingTotal,
  searchMetric,
  type MetricAxisSpec,
} from './householder';
import { packet, type DataPacket } from './model';

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function reflect(durations: number[], axis: number[], coefficient = -1, minUnits = 1) {
  return reflectRhythm({ durations, axis, coefficient, grid: 1, minUnits, steps: 1 });
}

describe('reflect mode', () => {
  it('turns long-short into short-long along the swing axis', () => {
    const result = reflect([3, 1, 3, 1], reflectAxisPreset('swing', 4));
    expect(result.candidates[0].durations).toEqual([1, 3, 1, 3]);
    expect(result.candidates[0].realizedCoefficient).toBeCloseTo(-1);
  });

  it('is an exact Householder swap for q = e_i − e_j', () => {
    const result = reflect([4, 1, 2, 1], [1, 0, 0, -1]);
    expect(result.candidates[0].durations).toEqual([1, 1, 2, 4]);
  });

  it('negates the axis coordinate, keeps the orthogonal part, and keeps the total', () => {
    const input = [5, 1, 2, 4, 3, 1];
    const axis = reflectAxisPreset('trend', input.length);
    const result = reflect(input, axis);
    const output = result.candidates[0].durations;
    const center = sum(axis) / axis.length;
    const q = axis.map((value) => value - center);
    const coord = (d: number[]) => q.reduce((total, value, index) => total + value * d[index], 0);
    expect(sum(output)).toBe(sum(input));
    // Rounding to whole steps can only approximate; the sign must flip and the size stay close.
    expect(Math.sign(coord(output))).toBe(-Math.sign(coord(input)));
    expect(Math.abs(coord(output) + coord(input))).toBeLessThanOrEqual(sum(q.map(Math.abs)) / 2);
  });

  it('keeps durations above the minimum by projecting to the nearest valid rhythm', () => {
    const result = reflect([3, 1, 1, 1, 2], reflectAxisPreset('trend', 5));
    expect(result.candidates[0].durations).toEqual([2, 1, 1, 1, 3]);
    expect(result.candidates[0].durations.every((value) => value >= 1)).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('nearest valid rhythm'))).toBe(true);
  });

  it('coefficient 1 is the identity and 0 removes the component', () => {
    expect(reflect([3, 1, 3, 1], reflectAxisPreset('swing', 4), 1).candidates[0].isInput).toBe(
      true
    );
    expect(reflect([3, 1, 3, 1], reflectAxisPreset('swing', 4), 0).candidates[0].durations).toEqual(
      [2, 2, 2, 2]
    );
  });

  it('puts the requested reflection first and morph steps after it, without duplicates', () => {
    const result = reflectRhythm({
      durations: [7, 1, 7, 1],
      axis: reflectAxisPreset('swing', 4),
      coefficient: -1,
      grid: 1,
      minUnits: 1,
      steps: 4,
    });
    expect(result.candidates.map((candidate) => candidate.coefficient)).toEqual([-1, -0.5, 0, 0.5]);
    expect(result.candidates[0].durations).toEqual([1, 7, 1, 7]);
    expect(result.candidates[2].durations).toEqual([4, 4, 4, 4]);
    for (const candidate of result.candidates) {
      expect(sum(candidate.durations)).toBe(16);
      expect(candidate.isInput).toBe(false);
    }
  });

  it('works on a finer grid and reports durations in the input unit', () => {
    const result = reflectRhythm({
      durations: [1.5, 0.5],
      axis: [1, -1],
      coefficient: -1,
      grid: 2,
      minUnits: 1,
      steps: 1,
    });
    expect(result.candidates[0].durations).toEqual([0.5, 1.5]);
  });

  it('explains when the change is smaller than the grid', () => {
    // A palindromic Schillinger resultant has almost no arch component.
    const resultant = [2, 1, 1, 1, 1, 2, 1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 2, 1, 1, 1, 1, 2];
    const result = reflect(resultant, reflectAxisPreset('arch', resultant.length));
    expect(result.candidates[0].isInput).toBe(true);
    expect(result.warnings.some((warning) => warning.includes('finer grid'))).toBe(true);
  });

  it('refuses a constant axis and off-grid durations', () => {
    expect(reflect([2, 2, 2], [1, 1, 1]).error).toMatch(/constant/);
    expect(reflect([1.5, 1], [0, 1]).error).toMatch(/grid/);
  });
});

describe('metric mode', () => {
  const accent = (coefficient = -1, pattern = [1, 0, 0, 0]): MetricAxisSpec => ({
    key: 'accent',
    enabled: true,
    pattern,
    coefficient,
    weight: 1,
  });

  function metric(durations: number[], axes: MetricAxisSpec[], closeness = 0.25) {
    return searchMetric({ durations, grid: 1, minUnits: 1, axes, closeness, maxCandidates: 8 });
  }

  it('moves attacks off the beat when the accent bias is reflected', () => {
    // Attacks on 0 2 4 6 against downbeats at 0 and 4. Slot 0 is pinned, so the reachable
    // minimum is one downbeat: the target clamps there and slot 4 must be avoided.
    const result = metric([2, 2, 2, 2], [accent()]);
    const best = result.candidates[0];
    expect(best.axes![0].clamped).toBe(true);
    expect(best.axes![0].realized).toBeCloseTo(best.axes![0].target);
    expect(sum(best.durations)).toBe(8);
    expect(best.durations).toHaveLength(4);
    expect(best.durations).toEqual([2, 1, 3, 2]); // onsets 0 2 3 6: beat 3 avoided, one step moved
    expect(best.movement).toBe(1);
  });

  it('depends on the input rhythm (the old greedy search did not)', () => {
    const a = metric([3, 1, 2, 2, 4, 4], [accent()]).candidates[0].durations;
    const b = metric([1, 1, 4, 2, 2, 6], [accent()]).candidates[0].durations;
    expect(a).not.toEqual(b);
  });

  it('keeps the input when asked to keep its bias', () => {
    const result = metric([3, 1, 2, 2, 4, 4], [accent(1)]);
    expect(result.candidates[0].isInput).toBe(true);
  });

  it('reflects early/late placement around the middle of the span', () => {
    // Front-loaded: attacks at 0 1 2 3 in a span of 12.
    const result = metric(
      [1, 1, 1, 9],
      [{ key: 'position', enabled: true, coefficient: -1, weight: 1 }],
      0
    );
    const best = result.candidates[0];
    expect(best.axes![0].input).toBeLessThan(0);
    expect(best.axes![0].realized).toBeGreaterThan(0);
  });

  it('always pins the first attack, preserves the span, and honours the minimum', () => {
    const result = searchMetric({
      durations: [3, 1, 2, 2, 4, 4],
      grid: 1,
      minUnits: 2,
      axes: [accent()],
      closeness: 0.25,
      maxCandidates: 8,
    });
    for (const candidate of result.candidates) {
      expect(sum(candidate.durations)).toBe(16);
      expect(candidate.durations).toHaveLength(6);
      expect(Math.min(...candidate.durations)).toBeGreaterThanOrEqual(2);
    }
  });

  it('switches to local search when there are too many attack sets', () => {
    const durations = Array.from({ length: 16 }, (_, index) => (index % 2 ? 1 : 3));
    expect(compositionCount(sum(durations), durations.length, 1)).toBeGreaterThan(100_000);
    const result = metric(durations, [accent()]);
    expect(result.search).toBe('local');
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates[0].axes![0].realized).toBeLessThan(
      result.candidates[0].axes![0].input
    );
  });

  it('explains an axis that cannot change', () => {
    const result = metric([1, 1, 1, 1], [accent(-1, [1])]);
    expect(result.error).toBeDefined();
    expect(result.warnings[0]).toMatch(/no attack placement/);
  });
});

describe('metric identity scoring', () => {
  const accent: MetricAxisSpec = {
    key: 'accent',
    enabled: true,
    pattern: [1, 0, 0, 0],
    coefficient: -1,
    weight: 1,
  };
  const isRotationOf = (candidate: number[], input: number[]) =>
    input.some(
      (_, shift) => [...input.slice(shift), ...input.slice(0, shift)].join() === candidate.join()
    );

  it('interval content ignores rotation in a cyclic frame but not along a line', () => {
    const onsets = (durations: number[]) =>
      durations.map((_, index) => sum(durations.slice(0, index)));
    expect(intervalContent(onsets([3, 3, 2]), 8, true)).toEqual(
      intervalContent(onsets([3, 2, 3]), 8, true)
    );
    expect(intervalContent(onsets([3, 3, 2]), 8, false)).not.toEqual(
      intervalContent(onsets([3, 2, 3]), 8, false)
    );
  });

  it('prefers a displacement that keeps the rhythm over a nudge that reshapes it (exhaustive)', () => {
    // Input onsets 0 4 6 against downbeats 0 and 4. Both 0 3 6 (one nudge, new durations 3 3 2)
    // and 0 2 6 (a rotation, same durations 2 4 2) reach the reachable accent target.
    const options = {
      durations: [4, 2, 2],
      grid: 1,
      minUnits: 1,
      axes: [accent],
      closeness: 0.25,
      maxCandidates: 8,
    };
    const movementOnly = searchMetric(options);
    expect(movementOnly.search).toBe('exhaustive');
    expect(movementOnly.candidates[0].durations).toEqual([3, 3, 2]);
    expect(movementOnly.candidates[0].identityChange).toBeGreaterThan(0);

    const withIdentity = searchMetric({ ...options, identity: 1 });
    expect(withIdentity.candidates[0].durations).toEqual([2, 4, 2]);
    expect(withIdentity.candidates[0].identityChange).toBe(0);
  });

  it('finds an accent-reflecting rotation of a long resultant (local search)', () => {
    const resultant = [2, 1, 1, 1, 1, 2, 1, 1, 2, 2, 1, 1, 2, 2, 1, 1, 2, 1, 1, 1, 1, 2];
    const result = searchMetric({
      durations: resultant,
      grid: 1,
      minUnits: 1,
      axes: [accent],
      closeness: 0,
      identity: 1,
      maxCandidates: 8,
    });
    expect(result.search).toBe('local');
    const best = result.candidates[0];
    expect(best.identityChange).toBe(0);
    expect(best.isInput).toBe(false);
    expect(isRotationOf(best.durations, resultant)).toBe(true);
    expect(best.axes![0].realized).toBeLessThan(0);
    expect(best.axes![0].input).toBeGreaterThan(0);
  });
});

describe('helpers and packets', () => {
  it('projects onto the floor with the same total', () => {
    const projected = projectToFloor([2.2, 0.6, 1, 1.4, 2.8], 1, 8);
    expect(sum(projected)).toBeCloseTo(8);
    expect(Math.min(...projected)).toBeGreaterThanOrEqual(1 - 1e-9);
  });

  it('rounds with the exact total', () => {
    expect(roundPreservingTotal([2.4, 2.4, 3.2], 8)).toEqual([3, 2, 3]);
    expect(roundPreservingTotal([1.5, 1.5, 1.5, 1.5], 6)).toEqual([2, 2, 1, 1]);
  });

  it('builds an inter-onset list and a bank that keep the input frame and provenance', () => {
    const input = packet(
      'list',
      'duration',
      [3, 1, 3, 1].map((value, index) => ({
        id: `src:${index}`,
        value,
        provenance: [
          { sourceModuleInstance: 'src', sourceItemIds: [], transformation: 'authored' },
        ],
      })),
      [],
      undefined,
      { role: 'interOnset', frame: { topology: 'cyclic', unit: 'pulse', extent: 8, origin: 0 } }
    ) as DataPacket<number>;
    const result = reflect([3, 1, 3, 1], reflectAxisPreset('swing', 4));
    const selected = householderSelectedPacket(
      result.candidates[0],
      input,
      result.warnings,
      'hh',
      'householder-reflect',
      {}
    );
    expect(selected.items.map((item) => item.value)).toEqual([1, 3, 1, 3]);
    expect(selected.frame).toEqual(input.frame);
    expect(selected.items[2].provenance.map((step) => step.transformation)).toEqual([
      'authored',
      'householder-reflect',
    ]);
    expect(selected.items[2].provenance[1].sourceItemIds).toEqual(['src:2']);
    const bank = householderCandidatesPacket(
      result.candidates,
      input,
      [],
      'hh',
      'householder-reflect',
      {}
    );
    expect(bank.kind).toBe('bank');
    expect(bank.role).toBe('interOnset');
    expect(bank.items[0].value).toEqual([1, 3, 1, 3]);
  });
});
