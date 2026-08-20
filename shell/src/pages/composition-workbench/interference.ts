export type InterferenceAlignment = "zip" | "cycle" | "cartesian";

export interface InterferenceGenerator {
  id: string;
  label: string;
  values: number[];
  midiNote: number;
}

export interface InterferenceFrame {
  id: string;
  values: number[];
  sourceIndices: number[];
}

export interface InterferenceAttack {
  time: number;
  generatorIndices: number[];
}

export interface InterferenceResult {
  recurrence: number;
  attacks: InterferenceAttack[];
  durations: number[];
}

export interface GroupingOption {
  id: string;
  label: string;
  units: number;
  family: "recurrence" | "generator" | "complementary" | "alien";
  description: string;
}

export const MAX_INTERFERENCE_FRAMES = 128;
export const MAX_RECURRENCE_UNITS = 4096;
export const MAX_ATTACKS = 4096;
export const MAX_PREVIEW_EVENTS = 4096;

export function greatestCommonDivisor(a: number, b: number) {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right) {
    [left, right] = [right, left % right];
  }
  return left;
}

export function leastCommonMultiple(values: number[]) {
  return values.reduce((result, value) => {
    if (result === 0 || value === 0) {
      return 0;
    }
    return Math.abs((result / greatestCommonDivisor(result, value)) * value);
  }, 1);
}

export function parseGeneratorValues(value: string) {
  const tokens = value
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  const numbers = tokens.map(Number);
  if (!tokens.length) {
    return { values: [], error: "Enter at least one generator value." };
  }
  if (numbers.some((number) => !Number.isInteger(number) || number <= 0)) {
    return { values: [], error: "Generator values must be positive whole numbers." };
  }
  return { values: numbers };
}

export function alignGeneratorValues(
  generators: InterferenceGenerator[],
  alignment: InterferenceAlignment,
): { frames: InterferenceFrame[]; error?: string } {
  if (generators.length < 2) {
    return { frames: [], error: "Add at least two generators." };
  }
  if (generators.some((generator) => generator.values.length === 0)) {
    return { frames: [], error: "Every generator needs at least one value." };
  }

  let sourceIndices: number[][];
  if (alignment === "zip") {
    const count = Math.min(...generators.map((generator) => generator.values.length));
    sourceIndices = Array.from({ length: count }, (_, index) => generators.map(() => index));
  } else if (alignment === "cycle") {
    const count = Math.max(...generators.map((generator) => generator.values.length));
    sourceIndices = Array.from({ length: count }, (_, index) =>
      generators.map((generator) => index % generator.values.length),
    );
  } else {
    sourceIndices = generators.reduce<number[][]>(
      (frames, generator) =>
        frames.flatMap((frame) => generator.values.map((_, index) => [...frame, index])),
      [[]],
    );
  }

  if (sourceIndices.length > MAX_INTERFERENCE_FRAMES) {
    return {
      frames: [],
      error: `This alignment would create ${sourceIndices.length} resultants; the preview limit is ${MAX_INTERFERENCE_FRAMES}.`,
    };
  }

  return {
    frames: sourceIndices.map((indices, frameIndex) => ({
      id: `interference-frame:${frameIndex}`,
      sourceIndices: indices,
      values: indices.map(
        (sourceIndex, generatorIndex) => generators[generatorIndex].values[sourceIndex],
      ),
    })),
  };
}

export function generatorPeriod(pattern: number[]) {
  return pattern.reduce((total, duration) => total + duration, 0);
}

function normalizeGeneratorPatterns(generators: number[] | number[][]) {
  if (!generators.length) {
    return [];
  }
  return Array.isArray(generators[0])
    ? (generators as number[][])
    : (generators as number[]).map((value) => [value]);
}

export function generatorAttackTimes(pattern: number[], recurrence: number) {
  const period = generatorPeriod(pattern);
  const offsets: number[] = [];
  let offset = 0;
  pattern.forEach((duration) => {
    offsets.push(offset);
    offset += duration;
  });
  const attacks: number[] = [];
  for (let cycleStart = 0; cycleStart < recurrence; cycleStart += period) {
    offsets.forEach((attackOffset) => attacks.push(cycleStart + attackOffset));
  }
  return attacks;
}

export function generateInterference(generators: number[] | number[][]): InterferenceResult {
  const patterns = normalizeGeneratorPatterns(generators);
  if (
    patterns.length < 2 ||
    patterns.some(
      (pattern) =>
        !pattern.length || pattern.some((value) => !Number.isInteger(value) || value <= 0),
    )
  ) {
    throw new Error("Interference requires at least two positive whole-number generators.");
  }
  const periods = patterns.map(generatorPeriod);
  const recurrence = leastCommonMultiple(periods);
  if (!Number.isSafeInteger(recurrence) || recurrence > MAX_RECURRENCE_UNITS) {
    throw new Error(
      `The shared recurrence is ${recurrence} units; the preview limit is ${MAX_RECURRENCE_UNITS}.`,
    );
  }

  const byTime = new Map<number, number[]>();
  patterns.forEach((pattern, generatorIndex) => {
    generatorAttackTimes(pattern, recurrence).forEach((time) => {
      const indices = byTime.get(time) ?? [];
      indices.push(generatorIndex);
      byTime.set(time, indices);
    });
  });
  const attacks = [...byTime]
    .sort(([left], [right]) => left - right)
    .map(([time, generatorIndices]) => ({ time, generatorIndices }));
  if (attacks.length > MAX_ATTACKS) {
    throw new Error(
      `The resultant has ${attacks.length} attacks; the preview limit is ${MAX_ATTACKS}.`,
    );
  }
  const durations = attacks.map((attack, index) => {
    const next = attacks[index + 1]?.time ?? recurrence;
    return next - attack.time;
  });
  return { recurrence, attacks, durations };
}

export function interferenceDurationPacket(
  result: InterferenceResult,
  generators: Pick<InterferenceGenerator, "id">[],
  grouping?: GroupingOption,
): DataPacket<number> {
  const boundaries = grouping
    ? Array.from(
        { length: Math.ceil(result.recurrence / grouping.units) },
        (_, index) => index * grouping.units,
      )
    : undefined;

  return packet(
    "list",
    "duration",
    result.durations.map((duration, index) => {
      const attack = result.attacks[index];
      const sourceItemIds = attack.generatorIndices.map(
        (generatorIndex) => generators[generatorIndex]?.id ?? `generator:${generatorIndex}`,
      );
      return {
        id: `interference:attack:${attack.time}`,
        value: duration,
        provenance: [
          {
            sourceModuleInstance: "interference",
            sourceItemIds,
            transformation: "interference-resultant",
            parameters: {
              attackTime: attack.time,
              recurrence: result.recurrence,
              generatorIndices: attack.generatorIndices,
            },
          },
        ],
      };
    }),
    [],
    { attackTimes: result.attacks.map((attack) => attack.time) },
    {
      role: "interOnset",
      frame: {
        topology: "cyclic",
        unit: "pulse",
        extent: result.recurrence,
        origin: 0,
        grouping: grouping
          ? {
              id: grouping.id,
              label: grouping.label,
              units: grouping.units,
              boundaries: boundaries ?? [],
            }
          : undefined,
      },
    },
  );
}

export function interferenceGeneratorDurationPacket(
  pattern: number[],
  generator: Pick<InterferenceGenerator, "id" | "label">,
  generatorIndex: number,
): DataPacket<number> {
  const period = generatorPeriod(pattern);
  return packet(
    "list",
    "duration",
    pattern.map((duration, durationIndex) => ({
      id: `interference:${generator.id}:duration:${durationIndex}`,
      value: duration,
      provenance: [
        {
          sourceModuleInstance: "interference",
          sourceItemIds: [generator.id],
          transformation: "interference-generator-lane",
          parameters: {
            generatorId: generator.id,
            generatorIndex,
            durationIndex,
            period,
          },
        },
      ],
    })),
    [],
    {
      generatorId: generator.id,
      generatorLabel: generator.label,
      attackTimes: generatorAttackTimes(pattern, period),
    },
    {
      role: "interOnset",
      frame: {
        topology: "cyclic",
        unit: "pulse",
        extent: period,
        origin: 0,
      },
    },
  );
}

export function generatorAttackCount(generators: number[] | number[][], recurrence: number) {
  return normalizeGeneratorPatterns(generators).reduce(
    (count, pattern) => count + (recurrence / generatorPeriod(pattern)) * pattern.length,
    0,
  );
}

export function metronomeGridClicks(recurrence: number, groupingUnits: number) {
  return Array.from({ length: recurrence }, (_, time) => ({
    time,
    accented: time % groupingUnits === 0,
  }));
}

export function groupingOptions(values: number[], recurrence: number): GroupingOption[] {
  const options: GroupingOption[] = [
    {
      id: "recurrence",
      label: `Complete recurrence | ${recurrence}`,
      units: recurrence,
      family: "recurrence",
      description: "One measure contains the complete resultant.",
    },
  ];
  const seen = new Set([recurrence]);
  values.forEach((value, index) => {
    if (!seen.has(value)) {
      options.push({
        id: `generator:${index}`,
        label: `Generator ${index + 1} | ${value}`,
        units: value,
        family: "generator",
        description: "Schillinger grouping by a generator.",
      });
      seen.add(value);
    }
  });
  values.forEach((value, index) => {
    const complementary = recurrence / value;
    if (!seen.has(complementary)) {
      options.push({
        id: `complementary:${index}`,
        label: `Complementary to generator ${index + 1} | ${complementary}`,
        units: complementary,
        family: "complementary",
        description: "Schillinger grouping by a complementary factor, generalized to the LCM.",
      });
      seen.add(complementary);
    }
  });
  for (let divisor = 2; divisor <= Math.sqrt(recurrence); divisor += 1) {
    if (recurrence % divisor !== 0) {
      continue;
    }
    for (const units of [divisor, recurrence / divisor]) {
      if (seen.has(units) || units === 1 || units === recurrence) {
        continue;
      }
      options.push({
        id: `alien:${units}`,
        label: `Alien divisor | ${units}`,
        units,
        family: "alien",
        description: "Absil/Schillinger alien measure grouping: another divisor of the recurrence.",
      });
      seen.add(units);
    }
  }
  return options.sort((left, right) =>
    left.family === "recurrence"
      ? -1
      : right.family === "recurrence"
        ? 1
        : left.units - right.units,
  );
}

export function midiNoteName(note: number) {
  const names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  return `${names[note % 12]}${Math.floor(note / 12) - 1}`;
}

export function midiNoteFrequency(note: number) {
  return 440 * 2 ** ((note - 69) / 12);
}
import { packet, type DataPacket } from "./model";
