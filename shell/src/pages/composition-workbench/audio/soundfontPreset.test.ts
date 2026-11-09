import type { Preset } from 'soundfont2';
import { describe, expect, it } from 'vitest';
import { presetToSmplr } from './soundfontPreset';

const GEN = {
  releaseVolEnv: 38,
  keyRange: 43,
  velRange: 44,
  initialAttenuation: 48,
  coarseTune: 51,
  fineTune: 52,
  sampleModes: 54,
  overridingRootKey: 58,
};

function fakeContext() {
  const created: { length: number; rate: number; data: Float32Array }[] = [];
  return {
    created,
    context: {
      createBuffer: (_channels: number, length: number, rate: number) => {
        const data = new Float32Array(length);
        created.push({ length, rate, data });
        return { getChannelData: () => data } as unknown as AudioBuffer;
      },
    },
  };
}

type Gens = Record<number, { id: number; value?: number; range?: { lo: number; hi: number } }>;

function gens(values: Record<number, number>, ranges: Record<number, [number, number]> = {}): Gens {
  const out: Gens = {};
  Object.entries(values).forEach(([id, value]) => (out[Number(id)] = { id: Number(id), value }));
  Object.entries(ranges).forEach(
    ([id, [lo, hi]]) => (out[Number(id)] = { id: Number(id), range: { lo, hi } })
  );
  return out;
}

function sample(
  name: string,
  extra: Partial<{
    originalPitch: number;
    pitchCorrection: number;
    start: number;
    startLoop: number;
    endLoop: number;
    length: number;
  }> = {}
) {
  const length = extra.length ?? 100;
  return {
    header: {
      name,
      start: extra.start ?? 1000,
      end: (extra.start ?? 1000) + length,
      startLoop: extra.startLoop ?? 0,
      endLoop: extra.endLoop ?? 0,
      sampleRate: 100,
      originalPitch: extra.originalPitch ?? 60,
      pitchCorrection: extra.pitchCorrection ?? 0,
      link: 0,
      type: 1,
    },
    data: Int16Array.from({ length }, () => 16384),
  };
}

function preset(zones: Preset['zones']): Preset {
  return {
    header: { name: 'Test', preset: 0, bank: 0, bagIndex: 0, library: 0, genre: 0, morphology: 0 },
    zones,
  } as Preset;
}

describe('presetToSmplr', () => {
  it('keeps velocity layers apart so only one layer sounds at a time', () => {
    const { context } = fakeContext();
    const instrument = {
      header: { name: 'Piano', bagIndex: 0 },
      zones: [
        {
          sample: sample('soft'),
          keyRange: { lo: 0, hi: 127 },
          generators: gens({}, { [GEN.velRange]: [0, 63] }),
          modulators: {},
        },
        {
          sample: sample('loud'),
          keyRange: { lo: 0, hi: 127 },
          generators: gens({}, { [GEN.velRange]: [64, 127] }),
          modulators: {},
        },
      ],
    };
    const { json } = presetToSmplr(
      preset([{ instrument, generators: {}, modulators: {} }] as never),
      context
    );
    const regions = json.groups[0].regions;
    expect(regions.map((r) => r.velRange)).toEqual([
      [0, 63],
      [64, 127],
    ]);
  });

  it('uses the root-key override and adds coarse, fine and sample tuning in cents', () => {
    const { context } = fakeContext();
    const instrument = {
      header: { name: 'Tuned', bagIndex: 0 },
      zones: [
        {
          sample: sample('s', { originalPitch: 60, pitchCorrection: 5 }),
          generators: gens({
            [GEN.overridingRootKey]: 64,
            [GEN.coarseTune]: 1,
            [GEN.fineTune]: -20,
          }),
          modulators: {},
        },
      ],
    };
    const { json } = presetToSmplr(
      preset([{ instrument, generators: gens({ [GEN.fineTune]: 10 }), modulators: {} }] as never),
      context
    );
    const [region] = json.groups[0].regions;
    expect(region.pitch).toBe(64);
    expect(region.detune).toBe(100 - 20 + 10 + 5);
  });

  it('intersects the preset zone range with the instrument zone range and drops empty overlaps', () => {
    const { context } = fakeContext();
    const instrument = {
      header: { name: 'Split', bagIndex: 0 },
      zones: [
        { sample: sample('low'), keyRange: { lo: 0, hi: 59 }, generators: {}, modulators: {} },
        { sample: sample('high'), keyRange: { lo: 60, hi: 127 }, generators: {}, modulators: {} },
      ],
    };
    const { json } = presetToSmplr(
      preset([
        { instrument, keyRange: { lo: 50, hi: 70 }, generators: {}, modulators: {} },
      ] as never),
      context
    );
    expect(json.groups[0].regions.map((r) => r.keyRange)).toEqual([
      [50, 59],
      [60, 70],
    ]);

    const none = presetToSmplr(
      preset([
        { instrument, keyRange: { lo: 200, hi: 210 }, generators: {}, modulators: {} },
      ] as never),
      context
    );
    expect(none.json.groups[0].regions).toEqual([]);
  });

  it('turns loop points into seconds from the sample start', () => {
    const { context } = fakeContext();
    const looping = {
      sample: sample('loop', { startLoop: 20, endLoop: 80 }),
      generators: gens({ [GEN.sampleModes]: 1 }),
      modulators: {},
    };
    const once = {
      sample: sample('once', { startLoop: 20, endLoop: 80 }),
      generators: gens({ [GEN.sampleModes]: 0 }),
      modulators: {},
    };
    const { json } = presetToSmplr(
      preset([
        {
          instrument: { header: { name: 'L', bagIndex: 0 }, zones: [looping, once] },
          generators: {},
          modulators: {},
        },
      ] as never),
      context
    );
    const [a, b] = json.groups[0].regions;
    expect(a.loop).toBe(true);
    expect(a.loopStart).toBeCloseTo(0.2);
    expect(a.loopEnd).toBeCloseTo(0.8);
    expect(b.loop).toBeUndefined();
  });

  it('applies attenuation to the decoded samples and shares buffers between equal levels', () => {
    const { context, created } = fakeContext();
    const s = sample('same');
    const instrument = {
      header: { name: 'Levels', bagIndex: 0 },
      zones: [
        { sample: s, keyRange: { lo: 0, hi: 59 }, generators: gens({}), modulators: {} },
        { sample: s, keyRange: { lo: 60, hi: 127 }, generators: gens({}), modulators: {} },
        {
          sample: s,
          keyRange: { lo: 0, hi: 127 },
          generators: gens({ [GEN.initialAttenuation]: 200 }),
          modulators: {},
        },
      ],
    };
    const { buffers } = presetToSmplr(
      preset([{ instrument, generators: {}, modulators: {} }] as never),
      context
    );
    expect(buffers.size).toBe(2);
    expect(created).toHaveLength(2);
    // 16384 / 32768 = 0.5 at full level; 200 centibels is 20 dB down, a tenth of that
    expect(created[0].data[0]).toBeCloseTo(0.5);
    expect(created[1].data[0]).toBeCloseTo(0.05);
  });

  it('turns the release generator into seconds within a sensible range', () => {
    const { context } = fakeContext();
    const instrument = {
      header: { name: 'Rel', bagIndex: 0 },
      zones: [
        { sample: sample('a'), generators: gens({ [GEN.releaseVolEnv]: 0 }), modulators: {} },
        { sample: sample('b'), generators: gens({ [GEN.releaseVolEnv]: -12000 }), modulators: {} },
      ],
    };
    const { json } = presetToSmplr(
      preset([{ instrument, generators: {}, modulators: {} }] as never),
      context
    );
    const [one, tiny] = json.groups[0].regions;
    expect(one.ampRelease).toBeCloseTo(1);
    expect(tiny.ampRelease).toBe(0.05);
  });

  it('takes loop mode, root key and key range from the global zone when a zone sets none', () => {
    const { context } = fakeContext();
    const instrument = {
      header: { name: 'Global', bagIndex: 0 },
      globalZone: {
        generators: gens({ [GEN.sampleModes]: 1, [GEN.overridingRootKey]: 62 }),
        modulators: {},
        keyRange: { lo: 10, hi: 90 },
      },
      zones: [
        { sample: sample('a', { startLoop: 20, endLoop: 80 }), generators: {}, modulators: {} },
        {
          sample: sample('b', { startLoop: 20, endLoop: 80 }),
          keyRange: { lo: 20, hi: 30 },
          generators: gens({ [GEN.sampleModes]: 0 }),
          modulators: {},
        },
      ],
    };
    const { json } = presetToSmplr(
      preset([{ instrument, generators: {}, modulators: {} }] as never),
      context
    );
    const [a, b] = json.groups[0].regions;
    expect(a.keyRange).toEqual([10, 90]);
    expect(a.pitch).toBe(62);
    expect(a.loop).toBe(true);
    expect(b.keyRange).toEqual([20, 30]);
    expect(b.loop).toBeUndefined();
  });
});
