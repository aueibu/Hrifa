import { describe, expect, it } from 'vitest';
import {
  acceptsMistSettings,
  buildMistField,
  buildTable,
  curveShape,
  defaultMistSettings,
  defaultStratum,
  mistChordsPacket,
  mistVoicesPacket,
  migrateMistSettings,
  mistRepeat,
  passesPerRepeat,
  playingStep,
  presetStrata,
  realignmentPeriod,
  roundToStep,
  sampleMist,
  sampleTable,
  smoothCurve,
  type MistSettings,
  type MistStratum,
} from './mist';

function settingsWith(strata: MistStratum[], overrides: Partial<MistSettings> = {}): MistSettings {
  return { ...defaultMistSettings(), strata, ...overrides };
}

/** A sine that starts at 0, doing `speed` passes of its shape per position. */
const sine = (speed: number, overrides: Partial<MistStratum> = {}): MistStratum => ({
  ...defaultStratum(),
  phase: 0,
  speed,
  ...overrides,
});

const repeat = (strata: MistStratum[]) => {
  const period = realignmentPeriod(strata);
  return period && period.numerator / period.denominator;
};

describe('tables', () => {
  it('is deterministic per seed and differs between seeds and strata', () => {
    const walk: MistStratum = { ...defaultStratum(), waveform: 'walk', walkPoints: 24 };
    expect(buildTable(walk, 0, 'a')).toEqual(buildTable(walk, 0, 'a'));
    expect(buildTable(walk, 0, 'a')).not.toEqual(buildTable(walk, 0, 'b'));
    expect(buildTable(walk, 0, 'a')).not.toEqual(buildTable(walk, 1, 'a'));
  });

  it('keeps a walk inside [-1, 1] and joins its cycle without a jump', () => {
    const walk: MistStratum = {
      ...defaultStratum(),
      waveform: 'walk',
      walkPoints: 64,
      walkStep: 0.4,
    };
    const table = buildTable(walk, 0, 'seam');
    expect(Math.max(...table.map(Math.abs))).toBeLessThanOrEqual(1);
    const steps = table.map((value, i) => Math.abs(table[(i + 1) % table.length] - value));
    // The wrap step is no larger than the largest step inside the cycle.
    expect(steps[steps.length - 1]).toBeLessThanOrEqual(Math.max(...steps.slice(0, -1)) + 1e-9);
  });

  it('wraps and interpolates samples', () => {
    const table = [0, 1, 0, -1];
    expect(sampleTable(table, 4.5, 'linear')).toBeCloseTo(0.5);
    expect(sampleTable(table, -0.5, 'linear')).toBeCloseTo(-0.5);
    expect(sampleTable(table, 1.4, 'nearest')).toBe(1);
  });
});

describe('speed is how fast the shape is traversed', () => {
  it('does `speed` passes per position', () => {
    const slow = buildMistField(settingsWith([sine(0.125)])); // a pass takes 8 positions
    expect(slow.wave(0, 2)).toBeCloseTo(1); // a quarter of the way through the pass: the peak
    expect(slow.wave(0, 8)).toBeCloseTo(slow.wave(0, 0)); // the pass ends where it began
    // Twice the speed gets there in half the positions.
    const fast = buildMistField(settingsWith([sine(0.25)]));
    expect(fast.wave(0, 1)).toBeCloseTo(1);
    expect(fast.wave(0, 4)).toBeCloseTo(fast.wave(0, 0));
  });

  it('lines up speeds 1 and 0.5 every 2: two passes of the first, one of the second', () => {
    expect(repeat([sine(1), sine(0.5)])).toBe(2);
    // With cycles 3 on both, which is the same: the cycles do not change when the strata realign.
    expect(repeat([sine(1, { cycles: 3 }), sine(0.5, { cycles: 3 })])).toBe(2);
    const field = buildMistField(
      settingsWith([sine(1, { phase: 0.25 }), sine(0.5, { phase: 0.25 })])
    );
    expect(field.wave(0, 2)).toBeCloseTo(field.wave(0, 0));
    expect(field.wave(1, 2)).toBeCloseTo(field.wave(1, 0));
    // At 1 the speed-1 stratum is back at its start, but the speed-0.5 one is half way through.
    expect(field.wave(0, 1)).toBeCloseTo(field.wave(0, 0));
    expect(field.wave(1, 1)).not.toBeCloseTo(field.wave(1, 0));
  });

  it('lines up speeds 2 and 3 every 1: two passes against three', () => {
    expect(repeat([sine(2), sine(3)])).toBe(1);
    const field = buildMistField(
      settingsWith([sine(2, { phase: 0.25 }), sine(3, { phase: 0.25 })])
    );
    expect(field.wave(0, 1)).toBeCloseTo(field.wave(0, 0));
    expect(field.wave(1, 1)).toBeCloseTo(field.wave(1, 0));
    expect(field.wave(1, 0.5)).not.toBeCloseTo(field.wave(1, 0));
  });

  it('finds the repeat of other pairs exactly', () => {
    expect(repeat([sine(1), sine(1.5)])).toBe(2); // passes of 1 and 2/3
    expect(repeat([sine(0.25), sine(1 / 6)])).toBe(12); // passes of 4 and 6
    expect(repeat([sine(1), sine(1.25), sine(1.5)])).toBe(4);
  });

  it('counts the passes each stratum makes in one repeat, which is what shows the intricacy', () => {
    // Whole-number speeds repeat every 1 unit however many passes that holds.
    expect(repeat([sine(6), sine(7), sine(50)])).toBe(1);
    expect(passesPerRepeat([sine(6), sine(7), sine(50)])).toEqual([6, 7, 50]);
    // Common factors shorten the repeat and reduce the ratio: 6 and 8 are 3 : 4 every half unit.
    expect(repeat([sine(6), sine(8)])).toBe(0.5);
    expect(passesPerRepeat([sine(6), sine(8)])).toEqual([3, 4]);
    expect(passesPerRepeat([sine(1), sine(0.5)])).toEqual([2, 1]);
    expect(passesPerRepeat([sine(2), sine(3)])).toEqual([2, 3]);
    // Held-still and disabled strata have no passes. A lone stratum repeats after one pass, and speeds
    // that are not exact ratios give none.
    expect(passesPerRepeat([sine(2), sine(0), sine(3, { enabled: false })])).toEqual([1]);
    expect(passesPerRepeat([sine(Math.PI)])).toBeUndefined();
  });

  it('is exact however many decimals the speeds have (no cap on the repeat or the precision)', () => {
    // 0.7133, 0.7134 and 0.7135 are 7133, 7134 and 7135 ten-thousandths, which share no factor: the
    // field repeats after 10000 units, in which they complete 7133 : 7134 : 7135 passes.
    const four = [sine(0.7133), sine(0.7134), sine(0.7135)];
    expect(repeat(four)).toBe(10000);
    expect(passesPerRepeat(four)).toEqual([7133, 7134, 7135]);
    // Five decimals are hundred-thousandths: 71335 and 71337 share no factor, so 100000 units.
    const five = [sine(0.71335), sine(0.71337)];
    expect(repeat(five)).toBe(100000);
    expect(passesPerRepeat(five)).toEqual([71335, 71337]);
    // Six decimals: 713351 and 713353 share no factor either, so a million units.
    const six = [sine(0.713351), sine(0.713353)];
    expect(repeat(six)).toBe(1000000);
    expect(passesPerRepeat(six)).toEqual([713351, 713353]);
    // A shared factor still shortens it: 0.7134 and 0.7136 are 3567 and 3568 five-thousandths.
    expect(repeat([sine(0.7134), sine(0.7136)])).toBe(5000);
    expect(passesPerRepeat([sine(0.7134), sine(0.7136)])).toEqual([3567, 3568]);
  });

  it('reports repeats too large for an exact fraction as a plain number', () => {
    // Pass lengths that are distinct primes never share a factor, so their repeat is the product,
    // far more than 2^53 units for six of them.
    const primes = [7919, 7927, 7933, 7937, 7949, 7951];
    const result = mistRepeat(primes.map((prime) => sine(1 / prime)));
    expect(result?.value).toBeGreaterThan(Number.MAX_SAFE_INTEGER);
    expect(result?.rational).toBeUndefined();
    expect(result?.passes).toBeUndefined();
  });

  it('does not depend on the shapes when the strata realign', () => {
    const shaped = [sine(0.25, { cycles: 3 }), sine(1 / 6, { waveform: 'walk' })];
    expect(repeat(shaped)).toBe(12);
    expect(repeat([sine(0.25), sine(1 / 6)])).toBe(12);
  });

  it('ignores disabled strata and strata held still', () => {
    expect(repeat([sine(0.25), sine(0), sine(3, { enabled: false })])).toBe(4);
    expect(repeat([sine(0)])).toBeUndefined();
  });

  it('draws a fast pass smoothly, with no flat line', () => {
    // Speed 0.5: a pass takes 2 positions, so half a position in the wave is at its peak.
    const field = buildMistField(settingsWith([sine(0.5)]));
    expect(field.wave(0, 0.5)).toBeCloseTo(1);
    expect(field.wave(0, 1.5)).toBeCloseTo(-1);
  });

  it('runs a negative speed backwards and holds a speed of 0 still', () => {
    const forward = buildMistField(settingsWith([sine(0.125)]));
    const backward = buildMistField(settingsWith([sine(-0.125)]));
    expect(backward.wave(0, 2)).toBeCloseTo(forward.wave(0, -2));
    const still = buildMistField(settingsWith([sine(0, { phase: 0.25 })]));
    expect(still.wave(0, 0)).toBeCloseTo(1);
    expect(still.wave(0, 100)).toBeCloseTo(1);
  });
});

describe('shape', () => {
  it('fits whole cycles in a pass', () => {
    const one = buildMistField(settingsWith([sine(0.125, { cycles: 1 })]));
    const two = buildMistField(settingsWith([sine(0.125, { cycles: 2 })]));
    expect(one.wave(0, 2)).toBeCloseTo(1); // a quarter of the pass
    expect(two.wave(0, 1)).toBeCloseTo(1); // a quarter of the first of two cycles
    expect(two.wave(0, 2)).toBeCloseTo(0); // halfway through the first cycle
    expect(two.wave(0, 8)).toBeCloseTo(two.wave(0, 0)); // both finish the pass together
  });

  it('starts a stratum at its phase, a fraction of the pass', () => {
    const field = buildMistField(settingsWith([sine(0.125, { phase: 0.25 })]));
    expect(field.wave(0, 0)).toBeCloseTo(1);
  });

  it('scales and offsets the shape with amplitude and center', () => {
    const settings = settingsWith([sine(0.125, { phase: 0.25, amplitude: 2, center: 3 })]);
    expect(buildMistField(settings).at(0).raw[0]).toBeCloseTo(5);
  });

  it('warns when a cycle is shorter than two strides', () => {
    // Speed 1 with 2 cycles: a cycle lasts half a position, sampled every 1.
    const fast = settingsWith([sine(1, { cycles: 2 })], { steps: 8, stride: 1 });
    expect(sampleMist(fast).warnings.join(' ')).toMatch(/alias/);
    // The default stride of 1/16 resolves a speed-1 cycle with 16 samples.
    const fine = settingsWith([sine(1)], { steps: 8 });
    expect(sampleMist(fine).warnings.join(' ')).not.toMatch(/alias/);
  });
});

describe('drawn curves', () => {
  it('uses the drawn points as one cycle, clamped, and wraps the seam', () => {
    const custom = [0, 1, 0, -5];
    const stratum: MistStratum = {
      ...defaultStratum(),
      waveform: 'custom',
      custom,
      speed: 0.25,
      phase: 0,
    };
    expect(buildTable(stratum, 0, 's')).toEqual([0, 1, 0, -1]);
    // Between the last point and the first the curve is joined, not cut.
    const field = buildMistField(settingsWith([stratum]));
    expect(field.wave(0, 1)).toBeCloseTo(1);
    expect(field.wave(0, 3.5)).toBeCloseTo(-0.5);
  });

  it('falls back to a sine before anything is drawn', () => {
    const fresh: MistStratum = { ...defaultStratum(), waveform: 'custom', speed: 1 / 64, phase: 0 };
    const reference = buildMistField(settingsWith([sine(1 / 64)]));
    expect(buildMistField(settingsWith([fresh])).wave(0, 10)).toBeCloseTo(reference.wave(0, 10));
  });

  it('builds starter shapes and smooths them', () => {
    expect(curveShape('saw', 4)).toEqual([1, 0.5, 0, -0.5]);
    expect(curveShape('flat', 3)).toEqual([0, 0, 0]);
    expect(curveShape('triangle', 4)).toEqual([0, 1, 0, -1]);
    expect(smoothCurve([0, 3, 0])[1]).toBeCloseTo(1);
  });
});

describe('saved settings', () => {
  it('accepts the current shape and rejects broken or unversioned ones', () => {
    expect(acceptsMistSettings(defaultMistSettings())).toBe(true);
    expect(acceptsMistSettings({ ...defaultMistSettings(), strata: [{}] })).toBe(false);
    expect(acceptsMistSettings({ ...defaultMistSettings(), loop: 16 })).toBe(false);
    expect(acceptsMistSettings({ ...defaultMistSettings(), version: 3 })).toBe(false);
    expect(acceptsMistSettings(null)).toBe(false);
    const bad = settingsWith([{ ...defaultStratum(), waveform: 'custom', custom: [1] }]);
    expect(acceptsMistSettings(bad)).toBe(false);
  });

  const base = {
    seed: 'mist',
    steps: 16,
    start: 0,
    stride: 1,
    interpolation: 'linear',
    mapLow: 48,
    mapHigh: 72,
    mapStep: 1,
  };

  it("upgrades the first model (a loop in cells and a rate), keeping each stratum's period", () => {
    const old = {
      ...base,
      strata: [
        {
          enabled: true,
          waveform: 'sine',
          loop: 16,
          speed: 1,
          phase: 4,
          center: 0,
          amplitude: 1,
          walkStep: 0.25,
          smoothing: 1,
        },
        {
          enabled: true,
          waveform: 'walk',
          loop: 24,
          speed: 0.5,
          phase: 0,
          center: 1,
          amplitude: 1,
          walkStep: 0.25,
          smoothing: 2,
        },
        {
          enabled: true,
          waveform: 'sine',
          loop: 8,
          speed: 0,
          phase: 0,
          center: 0,
          amplitude: 1,
          walkStep: 0.25,
          smoothing: 1,
        },
      ],
    };
    const migrated = migrateMistSettings(old);
    expect(acceptsMistSettings(migrated)).toBe(true);
    const { strata } = migrated as MistSettings;
    // Old passes took 16 / 1 = 16 and 24 / 0.5 = 48 positions: speeds of 1/16 and 1/48.
    expect(strata[0].speed).toBeCloseTo(1 / 16);
    expect(strata[1].speed).toBeCloseTo(1 / 48);
    expect(strata[2].speed).toBe(0);
    expect(strata[0].phase).toBeCloseTo(0.25);
    // A walk keeps its cell count as its points, so it keeps its shape.
    expect(strata[1].walkPoints).toBe(24);
  });

  it('upgrades the second model (a field loop length and a rate)', () => {
    const second = {
      ...base,
      loop: 16,
      strata: [
        { ...defaultStratum(), speed: 1 },
        { ...defaultStratum(), speed: 1.5 },
        { ...defaultStratum(), speed: -2 },
      ],
    };
    const migrated = migrateMistSettings(second);
    expect(acceptsMistSettings(migrated)).toBe(true);
    const { strata } = migrated as MistSettings;
    expect(strata[0].speed).toBeCloseTo(1 / 16);
    expect(strata[1].speed).toBeCloseTo(1.5 / 16);
    expect(strata[2].speed).toBeCloseTo(-2 / 16);
    expect('loop' in (migrated as object)).toBe(false);
  });

  it('upgrades the third model (speed was positions per pass)', () => {
    const third = {
      ...base,
      strata: [
        { ...defaultStratum(), speed: 16 },
        { ...defaultStratum(), speed: 8 },
        { ...defaultStratum(), speed: 0 },
        { ...defaultStratum(), speed: -4 },
      ],
    };
    const migrated = migrateMistSettings(third);
    expect(acceptsMistSettings(migrated)).toBe(true);
    const { strata } = migrated as MistSettings;
    expect(strata.map((s) => s.speed)).toEqual([1 / 16, 1 / 8, 0, -1 / 4]);
  });

  it('passes current settings through untouched', () => {
    expect(migrateMistSettings(defaultMistSettings())).toEqual(defaultMistSettings());
  });
});

describe('buildMistField', () => {
  it('evaluates anywhere and agrees with the sampled steps', () => {
    const settings = settingsWith(presetStrata('ripple'), { steps: 6 });
    const field = buildMistField(settings);
    const sampling = sampleMist(settings, field);
    expect(field.at(settings.start + 2 * settings.stride).raw).toEqual(sampling.raw[2]);
    // Between steps the value is continuous, not rounded.
    const between = field.at(0.1).mapped;
    expect(between.some((value) => !Number.isInteger(value))).toBe(true);
  });
});

describe('sampleMist', () => {
  it('maps across the field range, so changing steps does not move values', () => {
    const base = settingsWith(presetStrata('ripple'), { steps: 8 });
    const longer = { ...base, steps: 32 };
    expect(sampleMist(longer).mapped.slice(0, 8)).toEqual(sampleMist(base).mapped);
    const flat = sampleMist(base).mapped.flat();
    expect(Math.min(...flat)).toBeGreaterThanOrEqual(base.mapLow);
    expect(Math.max(...flat)).toBeLessThanOrEqual(base.mapHigh);
  });

  it('skips disabled strata in the output', () => {
    const strata = presetStrata('soft-drift');
    strata[1] = { ...strata[1], enabled: false };
    const sampling = sampleMist(settingsWith(strata, { steps: 4 }));
    expect(sampling.strataIndices).toEqual([0, 2]);
    expect(sampling.mapped.every((row) => row.length === 2)).toBe(true);
  });

  it('rounds to the requested step without float noise', () => {
    expect(roundToStep(60.26, 0.5)).toBe(60.5);
    expect(roundToStep(0.30000000000000004, 0.1)).toBe(0.3);
    expect(roundToStep(53.4567, 0.01)).toBe(53.46);
    expect(roundToStep(53.4549, 0.01)).toBe(53.45);
  });

  it('outputs values rounded to hundredths, in the rational domain', () => {
    const settings = settingsWith(presetStrata('ripple'), { steps: 8, mapStep: 0.01 });
    const sampling = sampleMist(settings);
    sampling.mapped.flat().forEach((value) => {
      expect(Math.abs(value * 100 - Math.round(value * 100))).toBeLessThan(1e-6);
    });
    // Finer than the whole-number output, so the values are not all whole.
    expect(sampling.mapped.flat().some((value) => !Number.isInteger(value))).toBe(true);
    expect(mistChordsPacket('m', settings, sampling).domain).toBe('rational');
  });

  it('repeats exactly at the realignment length', () => {
    const settings = settingsWith(presetStrata('ripple'), { steps: 4 });
    const field = buildMistField(settings);
    const sampling = sampleMist(settings, field);
    const period = sampling.realigns && sampling.realigns.numerator / sampling.realigns.denominator;
    expect(period).toBe(4);
    field.at(0.7).raw.forEach((value, k) => expect(field.at(0.7 + 4).raw[k]).toBeCloseTo(value));
  });
});

describe('playingStep', () => {
  it('follows the chord that is sounding, from the start to the end of the last step', () => {
    expect(playingStep(0, 0.25, 8)).toBe(0);
    expect(playingStep(0.249, 0.25, 8)).toBe(0);
    expect(playingStep(0.25, 0.25, 8)).toBe(1);
    expect(playingStep(1.99, 0.25, 8)).toBe(7);
    // The preview is 8 steps of 0.25 s, so it is over at 2 s.
    expect(playingStep(2, 0.25, 8)).toBeUndefined();
    expect(playingStep(-0.1, 0.25, 8)).toBeUndefined();
    expect(playingStep(1, 0, 8)).toBeUndefined();
    expect(playingStep(1, 0.25, 0)).toBeUndefined();
  });
});

describe('packets', () => {
  it('emits one group per step and one list per stratum', () => {
    const settings = settingsWith(presetStrata('misty-walk'), { steps: 6 });
    const sampling = sampleMist(settings);
    const chords = mistChordsPacket('m', settings, sampling);
    const voices = mistVoicesPacket('m', settings, sampling);
    expect(chords.kind).toBe('list');
    expect(chords.items).toHaveLength(6);
    expect((chords.items[0].value as number[]).length).toBe(3);
    expect(voices.kind).toBe('bank');
    expect(voices.items).toHaveLength(3);
    expect((voices.items[0].value as number[]).length).toBe(6);
    expect(chords.domain).toBe('integer');
    expect(chords.items[0].provenance[0].transformation).toBe('sample-mist');
  });

  it('uses the rational domain for a fractional step', () => {
    const settings = settingsWith(presetStrata('ripple'), { mapStep: 0.5 });
    expect(mistChordsPacket('m', settings, sampleMist(settings)).domain).toBe('rational');
  });
});
