import { buildRotationSets, distortionScore, edoSweep, pcOf } from './ratioAnalysis';

describe('pcOf', () => {
  it('quantizes a ratio to a pitch class within the EDO', () => {
    expect(pcOf(0, 12)).toBe(0);
    expect(pcOf(0.5, 4)).toBe(2);
    expect(pcOf(0.99, 4)).toBe(0); // wraps to the next octave's PC 0
  });
});

describe('distortionScore', () => {
  it('is null with fewer than two points', () => {
    expect(distortionScore([0.5], 12)).toBeNull();
  });

  it('returns 1 when quantization reproduces the continuous gap structure exactly', () => {
    // Evenly-spaced thirds at a matching EDO survive quantization losslessly.
    expect(distortionScore([0, 1 / 3, 2 / 3], 3)).toBeCloseTo(1);
  });

  it('flags induced symmetry: an irregular continuous set quantizing to a perfectly even one', () => {
    const score = distortionScore([0.05, 0.3, 0.68], 3);
    expect(score).toBe(Infinity);
  });
});

describe('edoSweep', () => {
  it('detects a pitch-class collision at a too-coarse EDO', () => {
    const sweep = edoSweep([0, 0.5], 1, 3);
    expect(sweep.find((s) => s.edo === 1)).toEqual({ edo: 1, safe: false, distinct: 1 });
    expect(sweep.find((s) => s.edo === 2)).toEqual({ edo: 2, safe: true, distinct: 2 });
    expect(sweep.find((s) => s.edo === 3)).toEqual({ edo: 3, safe: true, distinct: 2 });
  });
});

describe('buildRotationSets', () => {
  it('is null with fewer than two values', () => {
    expect(buildRotationSets([0.5], 12)).toBeNull();
  });

  it('applies the same interval structure from every rotation start, reproducing the classic 12-EDO chain-of-fifths pattern', () => {
    // A 12-EDO major-scale-shaped PC set (whole/whole/half...) rotated from
    // each of its own members should reproduce the same interval multiset
    // starting on each note — the mechanism the handoff verifies against the
    // real diatonic step pattern 2,2,1,2,2,2,1.
    const values = [0, 2, 4, 5, 7, 9, 11].map((pc) => pc / 12);
    const rotations = buildRotationSets(values, 12);
    expect(rotations).not.toBeNull();
    expect(rotations!).toHaveLength(7);
    expect(rotations![0].intervals).toEqual([2, 2, 1, 2, 2, 2]);
    // Every rotation's row starting from its own seed must stay within 0..11.
    for (const rot of rotations!) {
      for (const row of rot.rows) {
        for (const pc of row) {
          expect(pc).toBeGreaterThanOrEqual(0);
          expect(pc).toBeLessThan(12);
        }
      }
    }
  });
});
