import { packet, type DataItem, type DataPacket, type Provenance } from './model';
import { rational, rationalFromNumber, type Rational } from './musicalTime';

/**
 * Swirling Mists: layered, looping, time-varying scalar values (strata) sampled into numbers.
 *
 * Each stratum works like an LFO. Its shape is one pass (loop) of a waveform: how many cycles of it
 * the pass holds, where it starts (phase), and how large it is (amplitude, around a center). Its speed
 * is how fast the pass is traversed, in passes per position: speed 1 does one pass per position,
 * speed 0.5 half of one. The speeds are what make strata drift against each other. Speeds 1 and 0.5
 * line up every 2 positions (2 passes of the first, 1 of the second), and speeds 2 and 3 every 1
 * (2 passes against 3). The field repeats at the least common multiple of the passes' lengths.
 *
 *   u = phase + speed * s                 (passes elapsed at sampling position s)
 *   value = center + amplitude * shape(u * cycles)
 *
 * with `shape` repeating every 1 and staying in [-1, 1]. A speed of 0 holds the stratum still. A
 * negative speed runs the pass backwards. See SWIRLING_MISTS_SPEC.md.
 */

export type MistWaveform = 'sine' | 'walk' | 'custom';
export type MistInterpolation = 'linear' | 'nearest';

export interface MistStratum {
  enabled: boolean;
  waveform: MistWaveform;
  /** Whole cycles of the waveform in one pass: a sine with 2 has two peaks per pass. */
  cycles: number;
  /** Passes of the shape per position; bigger is faster. The strata's speeds decide where they sync. 0 holds still. */
  speed: number;
  /** Where in the pass the stratum starts, as a fraction of a pass. */
  phase: number;
  center: number;
  amplitude: number;
  /** Random walk only: points in one cycle of the walk. */
  walkPoints: number;
  /** Random walk only: largest change per point, as a share of the [-1, 1] range. */
  walkStep: number;
  /** Random walk only: circular moving-average window in points (1 = none). */
  smoothing: number;
  /**
   * Drawn waveform: one cycle in `customPoints` evenly spaced values in [-1, 1], the last leading back
   * into the first. Absent until the stratum is switched to Draw; a sine then stands in as the start.
   */
  custom?: number[];
}

/** Saved settings carry this so an older meaning of `speed` is never read as the current one. */
export const mistSettingsVersion = 4;

export interface MistSettings {
  /** Marks which meaning of `speed` was saved (passes per position). */
  version: number;
  seed: string;
  /** Number of sample steps. */
  steps: number;
  start: number;
  stride: number;
  interpolation: MistInterpolation;
  mapLow: number;
  mapHigh: number;
  /** Output values are rounded to a multiple of this. */
  mapStep: number;
  strata: MistStratum[];
}

export const maxMistStrata = 12;
export const maxMistSteps = 256;
export const maxMistCycles = 64;
export const maxWalkPoints = 512;
export const customPoints = 64;

export function defaultStratum(index = 0): MistStratum {
  return {
    enabled: true,
    waveform: 'sine',
    cycles: 1,
    speed: 1,
    phase: index * 0.25,
    center: 0,
    amplitude: 1,
    walkPoints: 24,
    walkStep: 0.25,
    smoothing: 1,
  };
}

export type MistPresetId = 'soft-drift' | 'ripple' | 'misty-walk';

export const mistPresets: { id: MistPresetId; label: string }[] = [
  { id: 'soft-drift', label: 'Soft Drift' },
  { id: 'ripple', label: 'Ripple' },
  { id: 'misty-walk', label: 'Misty Walk' },
];

/**
 * Three strata per preset (centers keep them in separate bands, as the old lens's baselines did).
 * Speeds are passes per position: Ripple 1, 1.25 and 1.5 line up every 4; Soft Drift 0.125, 0.1 and
 * 0.0625 every 80; Misty Walk 0.5, 0.75 and 1 every 4.
 */
export function presetStrata(id: MistPresetId): MistStratum[] {
  return [0, 1, 2].map((i) => {
    const base = defaultStratum(i);
    if (id === 'soft-drift') {
      return { ...base, speed: [0.125, 0.1, 0.0625][i], phase: i / 16, center: i * 0.5, amplitude: 0.4 };
    }
    if (id === 'ripple') {
      return { ...base, speed: [1, 1.25, 1.5][i], phase: i / 4, center: i, amplitude: 1 };
    }
    return {
      ...base,
      waveform: 'walk' as const,
      speed: [0.5, 0.75, 1][i],
      phase: 0,
      center: i * 0.6,
      amplitude: 0.8,
      walkPoints: 24,
      walkStep: 0.15 + i * 0.05,
      smoothing: 2,
    };
  });
}

export function defaultMistSettings(): MistSettings {
  // Speed 1 is one pass per position, so a stride of 1/16 over 16 steps samples one full pass of the
  // fastest stratum, enough to show movement at once. Soft Drift needs much longer to turn over.
  const strata = presetStrata('ripple');
  return {
    version: mistSettingsVersion,
    seed: 'mist',
    steps: 16,
    start: 0,
    stride: 0.0625,
    interpolation: 'linear',
    mapLow: 48,
    mapHigh: 72,
    mapStep: 1,
    strata,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function acceptsStratum(value: unknown): value is MistStratum {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const s = value as MistStratum;
  return (
    typeof s.enabled === 'boolean' &&
    (s.waveform === 'sine' || s.waveform === 'walk' || s.waveform === 'custom') &&
    isFiniteNumber(s.cycles) &&
    isFiniteNumber(s.speed) &&
    isFiniteNumber(s.phase) &&
    isFiniteNumber(s.center) &&
    isFiniteNumber(s.amplitude) &&
    isFiniteNumber(s.walkPoints) &&
    isFiniteNumber(s.walkStep) &&
    isFiniteNumber(s.smoothing) &&
    (s.custom === undefined ||
      (Array.isArray(s.custom) &&
        s.custom.length >= 2 &&
        s.custom.length <= 512 &&
        s.custom.every(isFiniteNumber)))
  );
}

export function acceptsMistSettings(value: unknown): value is MistSettings {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const s = value as MistSettings;
  return (
    s.version === mistSettingsVersion &&
    typeof s.seed === 'string' &&
    !('loop' in s) &&
    isFiniteNumber(s.steps) &&
    isFiniteNumber(s.start) &&
    isFiniteNumber(s.stride) &&
    (s.interpolation === 'linear' || s.interpolation === 'nearest') &&
    isFiniteNumber(s.mapLow) &&
    isFiniteNumber(s.mapHigh) &&
    isFiniteNumber(s.mapStep) &&
    Array.isArray(s.strata) &&
    s.strata.every(acceptsStratum)
  );
}

/**
 * Upgrades older saved shapes so every stratum keeps the same period in the same positions (a pass
 * that took 16 positions still takes 16, now as a speed of 1/16). Settings with `version` 4 are the
 * current meaning of speed (passes per position) and pass through.
 *
 * - First model: each stratum had its own `loop` in cells and a `speed` in cells per step. The period
 *   was loop ÷ speed; phase was in cells, so it becomes a fraction of the loop. A walk keeps its cell
 *   count as its points, so it keeps its shape.
 * - Second model: a field-wide `loop` length and a rate speed. The period was loop ÷ speed.
 * - Third model: no field loop, and speed was the positions one pass takes, so the rate is 1 ÷ speed.
 *
 * A speed of 0 (held still) stays 0, and a negative speed keeps its direction.
 */
export function migrateMistSettings(value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    return value;
  }
  const old = value as Record<string, unknown>;
  if (old.version === mistSettingsVersion || !Array.isArray(old.strata)) {
    return value;
  }
  const fieldLoop = isFiniteNumber(old.loop) && old.loop > 0 ? old.loop : undefined;
  const strata = old.strata.map((candidate) => {
    if (!candidate || typeof candidate !== 'object') {
      return candidate;
    }
    const s = candidate as Record<string, unknown>;
    if (!isFiniteNumber(s.speed)) {
      return candidate;
    }
    if (isFiniteNumber(s.loop) && isFiniteNumber(s.phase) && s.loop > 0) {
      const cells = Math.max(1, Math.round(s.loop));
      const { loop: _cells, ...rest } = s;
      return {
        ...rest,
        cycles: 1,
        speed: s.speed / cells,
        phase: s.phase / cells,
        walkPoints: Math.min(maxWalkPoints, Math.max(2, cells)),
      };
    }
    if (fieldLoop !== undefined) {
      return { ...s, speed: s.speed / fieldLoop };
    }
    return { ...s, speed: s.speed === 0 ? 0 : 1 / s.speed };
  });
  const { loop: _fieldLoop, ...rest } = old;
  return { ...rest, version: mistSettingsVersion, strata };
}

/** FNV-1a over the text, so a seed is any short string. */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: a small seeded generator returning [0, 1). */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function walkPointCount(stratum: MistStratum) {
  const points = Number.isFinite(stratum.walkPoints) ? Math.round(stratum.walkPoints) : 2;
  return Math.min(maxWalkPoints, Math.max(2, points));
}

export function cyclesOf(stratum: MistStratum) {
  const cycles = Number.isFinite(stratum.cycles) ? Math.round(stratum.cycles) : 1;
  return Math.min(maxMistCycles, Math.max(1, cycles));
}

/**
 * A reflected random walk over [-1, 1]. A linear ramp is then subtracted so the last point leads back
 * into the first as smoothly as any other pair (the cycle has no seam jump), smoothing wraps around
 * the cycle, and the result is scaled back into [-1, 1].
 */
function walkTable(stratum: MistStratum, index: number, seed: string, cells: number) {
  const random = seededRandom(hashSeed(`${seed}:${index}`));
  const stepSize = Math.max(0, stratum.walkStep);
  const table = new Array<number>(cells).fill(0);
  let value = 0;
  for (let i = 1; i < cells; i += 1) {
    value += (random() * 2 - 1) * stepSize;
    // Reflect at the bounds; a step larger than the range still lands inside after folding.
    value = ((((value + 1) % 4) + 4) % 4) - 1;
    if (value > 1) {
      value = 2 - value;
    }
    table[i] = value;
  }
  if (cells > 1) {
    const drift = table[cells - 1] - table[0];
    for (let i = 0; i < cells; i += 1) {
      table[i] -= (drift * i) / cells;
    }
  }
  const window = Math.max(1, Math.round(stratum.smoothing));
  const smoothed =
    window > 1
      ? table.map((_, i) => {
          let sum = 0;
          for (let k = 0; k < window; k += 1) {
            sum += table[(((i + k - Math.floor(window / 2)) % cells) + cells) % cells];
          }
          return sum / window;
        })
      : table;
  const peak = Math.max(1, ...smoothed.map((v) => Math.abs(v)));
  return smoothed.map((v) => v / peak);
}

export type CurveShape = 'sine' | 'triangle' | 'saw' | 'square' | 'flat' | 'random';

export const curveShapes: { id: CurveShape; label: string }[] = [
  { id: 'sine', label: 'Sine' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'saw', label: 'Saw' },
  { id: 'square', label: 'Square' },
  { id: 'random', label: 'Random' },
  { id: 'flat', label: 'Flat' },
];

/** A starting shape for the drawn curve: one cycle of `count` values in [-1, 1]. */
export function curveShape(
  shape: CurveShape,
  count = customPoints,
  random: () => number = Math.random
): number[] {
  return Array.from({ length: count }, (_, i) => {
    const phase = i / count;
    switch (shape) {
      case 'sine':
        return Math.sin(2 * Math.PI * phase);
      case 'triangle':
        return phase < 0.25 ? 4 * phase : phase < 0.75 ? 2 - 4 * phase : 4 * phase - 4;
      case 'saw':
        return 1 - 2 * phase;
      case 'square':
        return phase < 0.5 ? 1 : -1;
      case 'random':
        return random() * 2 - 1;
      default:
        return 0;
    }
  });
}

export const clampCurve = (value: number) => Math.min(1, Math.max(-1, value));

/** Circular three-point average, so smoothing also softens the seam. */
export function smoothCurve(points: number[]): number[] {
  const n = points.length;
  return points.map((value, i) => (points[(i + n - 1) % n] + value + points[(i + 1) % n]) / 3);
}

/**
 * One cycle of the stratum's table-based shape, in [-1, 1]. A sine is computed directly from the
 * phase and has no table, so it is smooth at any speed.
 */
export function buildTable(stratum: MistStratum, index: number, seed: string): number[] {
  if (stratum.waveform === 'walk') {
    return walkTable(stratum, index, seed, walkPointCount(stratum));
  }
  if (stratum.waveform === 'custom') {
    const points = stratum.custom && stratum.custom.length >= 2 ? stratum.custom : curveShape('sine');
    return points.map(clampCurve);
  }
  return [];
}

export function sampleTable(table: number[], phase: number, interpolation: MistInterpolation) {
  const length = table.length;
  if (!length) {
    return 0;
  }
  const wrapped = ((phase % length) + length) % length;
  if (interpolation === 'nearest') {
    return table[Math.round(wrapped) % length];
  }
  const i0 = Math.floor(wrapped);
  const frac = wrapped - i0;
  return table[i0] + (table[(i0 + 1) % length] - table[i0]) * frac;
}

/** The shape of a stratum, in [-1, 1], after `u` passes. */
export function evaluateWave(
  stratum: MistStratum,
  table: number[],
  u: number,
  interpolation: MistInterpolation
) {
  const t = u * cyclesOf(stratum);
  const fraction = t - Math.floor(t);
  return stratum.waveform === 'sine'
    ? Math.sin(2 * Math.PI * fraction)
    : sampleTable(table, fraction * table.length, interpolation);
}

/** Passes of the shape elapsed at sampling position `s`. A speed of 0 holds the stratum at its phase. */
export function passesAt(stratum: MistStratum, s: number) {
  return stratum.phase + stratum.speed * s;
}

/** Value of one stratum at sampling position `s`. */
export function evaluateStratum(
  stratum: MistStratum,
  table: number[],
  s: number,
  interpolation: MistInterpolation
) {
  return (
    stratum.center +
    stratum.amplitude * evaluateWave(stratum, table, passesAt(stratum, s), interpolation)
  );
}

/** Positions one pass of the stratum takes (1 ÷ speed); undefined when it is held still. */
export function periodOf(stratum: MistStratum): number | undefined {
  return stratum.speed !== 0 ? 1 / Math.abs(stratum.speed) : undefined;
}

export interface MistSampling {
  /** Positions `s` of the sample steps. */
  positions: number[];
  /** Indices into `settings.strata` of the enabled strata, in order. */
  strataIndices: number[];
  /** `raw[step][k]`: value of the k-th enabled stratum. */
  raw: number[][];
  /** `mapped[step][k]`, rounded into the output range. */
  mapped: number[][];
  /** Theoretical range of the whole field, the basis of the output map. */
  fieldRange: { low: number; high: number };
  /** The field's repeat length in positions `s`, as an exact fraction when it fits. */
  realigns?: Rational;
  /** The same length as a number, which may be astronomically large. */
  repeatLength?: number;
  warnings: string[];
}

export function sampleCount(settings: MistSettings) {
  return Math.min(maxMistSteps, Math.max(0, Math.floor(settings.steps)));
}

/** Rounds to a multiple of `step`, trimming float noise (0.1 steps stay 0.1). */
export function roundToStep(value: number, step: number) {
  if (!(step > 0)) {
    return value;
  }
  return Number((Math.round(value / step) * step).toFixed(6));
}

function gcdBig(a: bigint, b: bigint): bigint {
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a;
}

/**
 * A speed as an exact fraction n/d, or undefined when it is not one. A simple ratio (1/3, 3/2) is
 * recovered by continued fractions. Otherwise the speed is read as the decimal it was typed as, up to
 * 12 decimal places, so 0.71335 is exactly 71335/100000 and not a nearby fraction. A value that is
 * neither (π) has no exact repeat.
 */
function exactFraction(speed: number): { n: bigint; d: bigint } | undefined {
  const a = Math.abs(speed);
  const simple = rationalFromNumber(a, 1_000_000);
  if (Math.abs(simple.numerator / simple.denominator - a) <= 1e-12 * Math.max(1, a)) {
    return { n: BigInt(simple.numerator), d: BigInt(simple.denominator) };
  }
  if (a >= 1e9) {
    return undefined;
  }
  const text = a.toFixed(12);
  if (Number(text) !== a) {
    return undefined;
  }
  const [whole, fraction = ''] = text.replace(/0+$/, '').split('.');
  const d = 10n ** BigInt(fraction.length);
  const n = BigInt(whole + fraction);
  const g = gcdBig(n, d);
  return { n: n / g, d: d / g };
}

export interface MistRepeat {
  /** The repeat length in positions; may be astronomically large. */
  value: number;
  /** The exact length, when its parts fit in safe integers. */
  rational?: Rational;
  /** Passes each moving stratum completes in one repeat, in strata order, when they fit. */
  passes?: number[];
}

/**
 * When the field repeats. The pass lengths are 1 ÷ speed, and after their least common multiple every
 * stratum has completed a whole number of passes. With speeds n/d (in lowest terms) that is
 * lcm(d) ÷ gcd(n), computed in exact integers, so it holds for speeds of any precision. Speeds 1 and
 * 0.5 line up every 2 (2 passes and 1), speeds 2 and 3 every 1 (2 and 3), and speeds 6, 7 and 50 every
 * 1 (6 : 7 : 50). Speeds 6 and 8 share a factor of 2, so they line up every 0.5 (3 : 4). It does not
 * depend on the shapes inside the passes. Undefined when nothing moves or a speed is not an exact
 * fraction.
 */
export function mistRepeat(strata: MistStratum[]): MistRepeat | undefined {
  const fractions: { n: bigint; d: bigint }[] = [];
  for (const stratum of strata) {
    if (!stratum.enabled || stratum.speed === 0 || !Number.isFinite(stratum.speed)) {
      continue;
    }
    const fraction = exactFraction(stratum.speed);
    if (!fraction) {
      return undefined;
    }
    fractions.push(fraction);
  }
  if (!fractions.length) {
    return undefined;
  }
  let lcmD = 1n;
  let gcdN = 0n;
  for (const { n, d } of fractions) {
    lcmD = (lcmD / gcdBig(lcmD, d)) * d;
    gcdN = gcdBig(gcdN, n);
  }
  const g = gcdBig(lcmD, gcdN);
  const numerator = lcmD / g;
  const denominator = gcdN / g;
  const limit = BigInt(Number.MAX_SAFE_INTEGER);
  const passes = fractions.map(({ n, d }) => (lcmD / d) * (n / gcdN));
  return {
    value: Number(numerator) / Number(denominator),
    rational:
      numerator <= limit && denominator <= limit
        ? rational(Number(numerator), Number(denominator))
        : undefined,
    passes: passes.every((count) => count <= limit) ? passes.map(Number) : undefined,
  };
}

/** The repeat as an exact fraction, when it fits (see `mistRepeat`). */
export function realignmentPeriod(strata: MistStratum[]): Rational | undefined {
  return mistRepeat(strata)?.rational;
}

/**
 * How many passes each moving stratum completes in one repeat of the field, in strata order. That
 * ratio is what tells you how intricate the pattern is: the repeat length alone is just the unit when
 * the speeds are whole numbers.
 */
export function passesPerRepeat(strata: MistStratum[]): number[] | undefined {
  return mistRepeat(strata)?.passes;
}

export interface MistField {
  /** Indices into `settings.strata` of the enabled strata, in order. */
  strataIndices: number[];
  /** Table of each table-based stratum, keyed by stratum index (sines have none). */
  tables: Map<number, number[]>;
  /** Theoretical reach of the whole field, the basis of the output map. */
  range: { low: number; high: number };
  /** The shape of one stratum at position `s`, in [-1, 1], before center and amplitude. */
  wave(index: number, s: number): number;
  /** Raw values and unrounded mapped values of every enabled stratum at position `s`. */
  at(s: number): { raw: number[]; mapped: number[] };
  /** Maps a raw value into the output range, unrounded. */
  mapValue(value: number): number;
}

/** The field evaluated anywhere, for animation as well as sampling. Rebuild it when settings change. */
export function buildMistField(settings: MistSettings): MistField {
  const strataIndices = settings.strata
    .map((stratum, index) => (stratum.enabled ? index : -1))
    .filter((index) => index >= 0);
  const tables = new Map(
    strataIndices.map((index) => [index, buildTable(settings.strata[index], index, settings.seed)])
  );
  // The map spans what the field can reach, not what a window happened to visit, so values stay put
  // while steps, start or stride change.
  const ranges = strataIndices.map((index) => {
    const { center, amplitude } = settings.strata[index];
    return [center - Math.abs(amplitude), center + Math.abs(amplitude)] as const;
  });
  const low = ranges.length ? Math.min(...ranges.map((r) => r[0])) : 0;
  const high = ranges.length ? Math.max(...ranges.map((r) => r[1])) : 0;
  const span = high - low;
  const outLow = Math.min(settings.mapLow, settings.mapHigh);
  const outHigh = Math.max(settings.mapLow, settings.mapHigh);
  const reversed = settings.mapLow > settings.mapHigh;
  const mapValue = (value: number) => {
    const unit = span > 0 ? (value - low) / span : 0.5;
    return outLow + (reversed ? 1 - unit : unit) * (outHigh - outLow);
  };
  const wave = (index: number, s: number) => {
    const stratum = settings.strata[index];
    return evaluateWave(stratum, tables.get(index) ?? [], passesAt(stratum, s), settings.interpolation);
  };
  return {
    strataIndices,
    tables,
    range: { low, high },
    mapValue,
    wave,
    at(s) {
      const raw = strataIndices.map((index) => {
        const stratum = settings.strata[index];
        return stratum.center + stratum.amplitude * wave(index, s);
      });
      return { raw, mapped: raw.map(mapValue) };
    },
  };
}

export function sampleMist(settings: MistSettings, field = buildMistField(settings)): MistSampling {
  const warnings: string[] = [];
  const count = sampleCount(settings);
  if (settings.steps > maxMistSteps) {
    warnings.push(`Steps limited to ${maxMistSteps}.`);
  }
  const positions = Array.from({ length: count }, (_, i) => settings.start + i * settings.stride);
  const raw = positions.map((s) => field.at(s).raw);
  if (!(settings.mapStep > 0)) {
    warnings.push('Rounding step must be positive; values are not rounded.');
  }
  const mapped = raw.map((row) =>
    row.map((value) => roundToStep(field.mapValue(value), settings.mapStep))
  );
  if (!field.strataIndices.length) {
    warnings.push('No strata are enabled.');
  }
  // A cycle shorter than two sample steps cannot be seen in the outputs: the samples alias.
  const stride = Math.abs(settings.stride);
  if (count > 1 && stride > 0) {
    for (const index of field.strataIndices) {
      const stratum = settings.strata[index];
      const period = periodOf(stratum);
      if (period !== undefined) {
        const cycle = period / (stratum.waveform === 'sine' ? cyclesOf(stratum) : 1);
        if (cycle < 2 * stride) {
          warnings.push(
            `Stratum ${index + 1}: a cycle lasts ${Number(cycle.toFixed(3))} positions, under two strides, so the samples alias.`
          );
        }
      }
    }
  }

  const repeat = mistRepeat(settings.strata);
  return {
    positions,
    strataIndices: field.strataIndices,
    raw,
    mapped,
    fieldRange: field.range,
    realigns: repeat?.rational,
    repeatLength: repeat?.value,
    warnings,
  };
}

function formatValue(value: number) {
  return String(Number(value.toFixed(3)));
}

function stepProvenance(
  instanceId: string,
  settings: MistSettings,
  extra: Record<string, unknown>
): Provenance {
  return {
    sourceModuleInstance: instanceId,
    sourceItemIds: [],
    transformation: 'sample-mist',
    parameters: {
      seed: settings.seed,
      start: settings.start,
      stride: settings.stride,
      interpolation: settings.interpolation,
      ...extra,
    },
  };
}

function mistDomain(settings: MistSettings) {
  return Number.isInteger(settings.mapStep) ? ('integer' as const) : ('rational' as const);
}

/** One group per sample step, one value per enabled stratum: a snapshot sequence (chords). */
export function mistChordsPacket(
  instanceId: string,
  settings: MistSettings,
  sampling: MistSampling
): DataPacket<number[]> {
  const items: DataItem<number[]>[] = sampling.mapped.map((row, step) => ({
    id: `${instanceId}:chord:${step}`,
    value: row,
    label: row.length > 1 ? `[${row.map(formatValue).join(' ')}]` : formatValue(row[0] ?? 0),
    provenance: [stepProvenance(instanceId, settings, { step, position: sampling.positions[step] })],
  }));
  return packet('list', mistDomain(settings), items, sampling.warnings, undefined, {
    frame: { topology: 'linear', unit: 'abstract', extent: items.length },
  });
}

/** One entry per enabled stratum, each its own values over the sample steps: concurrent melodies. */
export function mistVoicesPacket(
  instanceId: string,
  settings: MistSettings,
  sampling: MistSampling
): DataPacket<number[]> {
  const items: DataItem<number[]>[] = sampling.strataIndices.map((stratumIndex, k) => {
    const values = sampling.mapped.map((row) => row[k]);
    return {
      id: `${instanceId}:voice:${stratumIndex}`,
      value: values,
      label: values.map(formatValue).join(' '),
      provenance: [stepProvenance(instanceId, settings, { stratum: stratumIndex })],
    };
  });
  return packet('bank', mistDomain(settings), items, sampling.warnings, undefined, {
    frame: { topology: 'linear', unit: 'abstract', extent: sampling.positions.length },
  });
}

/**
 * Which step is sounding `elapsedSeconds` after a preview starts, when each of `count` steps (chords)
 * lasts `stepSeconds`. Step k starts at k × stepSeconds, so this matches what is heard. Undefined before
 * the start and once the last step has finished.
 */
export function playingStep(elapsedSeconds: number, stepSeconds: number, count: number) {
  if (!(stepSeconds > 0) || count <= 0 || elapsedSeconds < 0) {
    return undefined;
  }
  const step = Math.floor(elapsedSeconds / stepSeconds);
  return step < count ? step : undefined;
}

export function formatRealignment(sampling: MistSampling, stride: number) {
  if (sampling.repeatLength === undefined) {
    return undefined;
  }
  const period = sampling.repeatLength;
  const steps = stride > 0 ? period / stride : undefined;
  return { period, steps };
}
