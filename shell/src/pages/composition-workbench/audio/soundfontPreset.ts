/**
 * Turns an SF2 preset into the region list `smplr` plays. `smplr`'s own SF2 converter reads a single
 * instrument and ignores velocity layers, root-key overrides, tuning, attenuation and loop offsets, which
 * layered presets (a piano with several velocity layers, say) need to sound right. This one follows the
 * SoundFont 2 rules for the generators that shape a note's pitch, level, range and loop, and mixes the
 * preset-level settings onto each instrument zone the preset points at. Stereo pairs, modulators, filters
 * and effects sends are not applied.
 */
import type { Preset, PresetZone, InstrumentZone } from 'soundfont2';

// Generator ids from the SoundFont 2 spec (`GeneratorType` in the `soundfont2` package).
const GEN = {
  attackVolEnv: 34,
  releaseVolEnv: 38,
  keyRange: 43,
  velRange: 44,
  initialAttenuation: 48,
  coarseTune: 51,
  fineTune: 52,
  sampleModes: 54,
  overridingRootKey: 58,
} as const;

type Range = { lo: number; hi: number };

export interface PresetRegion {
  sample: string;
  /** MIDI note the sample was recorded at, after any root-key override. */
  pitch: number;
  keyRange: [number, number];
  velRange: [number, number];
  /** Extra tuning in cents (coarse + fine + the sample's own correction). */
  detune: number;
  loop?: boolean;
  /** Loop points in seconds from the start of the sample (the parser reports them relative to it). */
  loopStart?: number;
  loopEnd?: number;
  ampAttack?: number;
  ampRelease?: number;
}

export interface ConvertedPreset {
  json: {
    samples: { baseUrl: string; formats: string[] };
    groups: { regions: PresetRegion[] }[];
  };
  /** Decoded audio for each region's `sample`, with the zone's attenuation applied. */
  buffers: Map<string, AudioBuffer>;
}

const FULL: Range = { lo: 0, hi: 127 };

function intersect(a: Range, b: Range): Range | null {
  const lo = Math.max(a.lo, b.lo);
  const hi = Math.min(a.hi, b.hi);
  return lo <= hi ? { lo, hi } : null;
}

/** Generators and ranges a zone sets, falling back to its item's global zone (spec: a global zone supplies defaults). */
interface ZoneLike {
  keyRange?: Range;
  generators: Record<number, { value?: number; range?: Range } | undefined>;
}

const generator = (zone: ZoneLike, fallback: ZoneLike | undefined, id: number) =>
  zone.generators[id]?.value ?? fallback?.generators[id]?.value;

const keyRangeOf = (zone: ZoneLike, fallback: ZoneLike | undefined): Range =>
  zone.keyRange ?? fallback?.keyRange ?? FULL;

const velRangeOf = (zone: ZoneLike, fallback: ZoneLike | undefined): Range =>
  zone.generators[GEN.velRange]?.range ?? fallback?.generators[GEN.velRange]?.range ?? FULL;

/** Seconds from SoundFont absolute timecents. */
const seconds = (timecents: number) => 2 ** (timecents / 1200);

/** Scale for an initial attenuation in centibels (a larger number is quieter). */
const attenuationGain = (centibels: number) => 10 ** (-Math.max(0, centibels) / 200);

/**
 * Convert one preset. `context` creates the audio buffers. Each sample is decoded once per distinct
 * attenuation, so layers balanced against each other stay balanced.
 */
export function presetToSmplr(
  preset: Preset,
  context: Pick<BaseAudioContext, 'createBuffer'>
): ConvertedPreset {
  const buffers = new Map<string, AudioBuffer>();
  const regions: PresetRegion[] = [];

  const presetGlobal = (preset as unknown as { globalZone?: ZoneLike }).globalZone;
  preset.zones.forEach((presetZone: PresetZone) => {
    const presetKeys = keyRangeOf(presetZone, presetGlobal);
    const presetVels = velRangeOf(presetZone, presetGlobal);
    const instrumentGlobal = (presetZone.instrument as unknown as { globalZone?: ZoneLike })
      .globalZone;
    presetZone.instrument.zones.forEach((zone: InstrumentZone) => {
      const keys = intersect(presetKeys, keyRangeOf(zone, instrumentGlobal));
      const vels = intersect(presetVels, velRangeOf(zone, instrumentGlobal));
      if (!keys || !vels) {
        return;
      }
      const { header, data } = zone.sample;
      const rootOverride = generator(zone, instrumentGlobal, GEN.overridingRootKey);
      const pitch =
        rootOverride !== undefined && rootOverride >= 0 ? rootOverride : header.originalPitch;
      const detune =
        100 *
          ((generator(zone, instrumentGlobal, GEN.coarseTune) ?? 0) +
            (generator(presetZone, presetGlobal, GEN.coarseTune) ?? 0)) +
        (generator(zone, instrumentGlobal, GEN.fineTune) ?? 0) +
        (generator(presetZone, presetGlobal, GEN.fineTune) ?? 0) +
        header.pitchCorrection;
      const attenuation =
        (generator(zone, instrumentGlobal, GEN.initialAttenuation) ?? 0) +
        (generator(presetZone, presetGlobal, GEN.initialAttenuation) ?? 0);

      // one decoded buffer per sample and level
      const key = `${header.name}@${header.start}:${Math.round(attenuation)}`;
      if (!buffers.has(key)) {
        const gain = attenuationGain(attenuation) / 32768;
        const buffer = context.createBuffer(1, data.length, header.sampleRate);
        const channel = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          channel[i] = data[i] * gain;
        }
        buffers.set(key, buffer);
      }

      const region: PresetRegion = {
        sample: key,
        pitch,
        keyRange: [keys.lo, keys.hi],
        velRange: [vels.lo, vels.hi],
        detune,
      };
      // sampleModes 1 loops continuously, 3 loops while the key is held; 0 and 2 play once
      const mode = generator(zone, instrumentGlobal, GEN.sampleModes) ?? 0;
      const loopStart = header.startLoop;
      const loopEnd = header.endLoop;
      if (
        (mode === 1 || mode === 3) &&
        loopStart >= 0 &&
        loopEnd > loopStart &&
        loopEnd <= data.length
      ) {
        region.loop = true;
        region.loopStart = loopStart / header.sampleRate;
        region.loopEnd = loopEnd / header.sampleRate;
      }
      const attack = generator(zone, instrumentGlobal, GEN.attackVolEnv);
      if (attack !== undefined) {
        region.ampAttack = Math.max(0.001, Math.min(2, seconds(attack)));
      }
      const release = generator(zone, instrumentGlobal, GEN.releaseVolEnv);
      if (release !== undefined) {
        region.ampRelease = Math.max(0.05, Math.min(4, seconds(release)));
      }
      regions.push(region);
    });
  });

  return { json: { samples: { baseUrl: '', formats: [] }, groups: [{ regions }] }, buffers };
}
