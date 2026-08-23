/**
 * Schillinger Book I Ch. 13 / Book II Ch. 3 §A: evolving a pitch-interval sequence
 * into richer "families" by synchronizing it with its own rotations, all within the
 * single shared period T = sum(intervals).
 *
 * This is a different operation from interference.ts's binary synchronization, which
 * unions two DIFFERENT-period generators over a product window a×b. Here there is
 * only ever one period, held constant across every stage: a k-term sequence's k
 * rotations are unioned as attack-points within that one period, producing the next
 * stage's duration sequence, which itself becomes the input for another round of
 * rotation and union.
 */

import { packet, type DataItem, type DataPacket } from "./model";
import { pitchClassNames } from "./pitch";
import { realizePitchClasses, scalePitchClassPacket } from "./scaleConstruction";

export interface ScaleEvolutionStage {
  intervals: number[];
  period: number;
  rotations: number[][];
  attacks: number[];
  durations: number[];
  collapsedToNeutral: boolean;
}

export type ScaleEvolutionTermination = "collapsed" | "cycle";

export interface ScaleEvolutionResult {
  stages: ScaleEvolutionStage[];
  terminationReason: ScaleEvolutionTermination;
}

/** Absolute safety cap on iteration count. Genuine cases terminate by collapse or
 * cycle (the period is fixed, so the space of possible duration-sequences summing to
 * it is finite) long before this is reached; it exists only to bound worst-case
 * runtime against a future bug, not to cap how far a real family is allowed to run. */
const MAX_STAGES = 64;

/**
 * Every cyclic rotation of `intervals`, generated in full. Rotations are never
 * deduplicated: if two rotations happen to coincide as sequences, that coincidence
 * is itself part of what the synchronization step is measuring — collapsing it away
 * would silently change which attack-points the union counts.
 */
export function rotations(intervals: number[]): number[][] {
  return intervals.map((_, shift) =>
    intervals.map((_, index) => intervals[(index + shift) % intervals.length]),
  );
}

/**
 * One synchronization step: union every rotation's cumulative attack-points within
 * the single shared period `sum(intervals)`.
 */
export function synchronizeRotations(intervals: number[]): ScaleEvolutionStage {
  if (!intervals.length || intervals.some((value) => !Number.isInteger(value) || value <= 0)) {
    throw new Error("Scale evolution requires one or more positive whole-number intervals.");
  }
  const period = intervals.reduce((sum, value) => sum + value, 0);
  const rotated = rotations(intervals);
  const attackSet = new Set<number>();
  for (const rotation of rotated) {
    let cursor = 0;
    attackSet.add(cursor);
    for (const step of rotation) {
      cursor += step;
      attackSet.add(cursor % period);
    }
  }
  const attacks = [...attackSet].sort((left, right) => left - right);
  const durations = attacks.map((attack, index) => (attacks[index + 1] ?? period) - attack);
  return {
    intervals,
    period,
    rotations: rotated,
    attacks,
    durations,
    collapsedToNeutral: durations.every((value) => value === 1),
  };
}

/**
 * Iterates synchronizeRotations, feeding each stage's durations back in as the next
 * stage's intervals, running the family exactly as far as it actually goes rather
 * than a fixed authored stage count. Stops when either:
 *  - a stage collapses to neutral (all-1 durations — the book's own example, the
 *    3+2/2+3 family, reaches this at its quintinomial stage), or
 *  - a stage's durations repeat an earlier stage's exactly (a genuine cycle; since
 *    the period is fixed, the state space is finite, so this is the only other way
 *    iteration can end).
 */
export function evolveScale(intervals: number[]): ScaleEvolutionResult {
  const stages: ScaleEvolutionStage[] = [];
  const seen = new Set<string>([intervals.join(",")]);
  let current = intervals;
  let terminationReason: ScaleEvolutionTermination = "collapsed";
  for (let step = 0; step < MAX_STAGES; step += 1) {
    const stage = synchronizeRotations(current);
    stages.push(stage);
    if (stage.collapsedToNeutral) {
      terminationReason = "collapsed";
      break;
    }
    const signature = stage.durations.join(",");
    if (seen.has(signature)) {
      terminationReason = "cycle";
      break;
    }
    seen.add(signature);
    current = stage.durations;
  }
  return { stages, terminationReason };
}

export function scaleEvolutionStagesPacket(
  result: ScaleEvolutionResult,
  sourceId: string,
): DataPacket<number[]> {
  const items: DataItem<number[]>[] = result.stages.map((stage, index) => ({
    id: `${sourceId}:stage:${index}`,
    value: stage.durations,
    label: stage.durations.join("+"),
    provenance: [
      {
        sourceModuleInstance: sourceId,
        sourceItemIds: [],
        transformation: "scale-evolution",
        parameters: {
          stage: index,
          inputIntervals: stage.intervals,
          period: stage.period,
          collapsedToNeutral: stage.collapsedToNeutral,
        },
      },
    ],
  }));
  const warnings =
    result.terminationReason === "cycle"
      ? [
          `Evolution stopped after ${result.stages.length} stage(s): the pattern repeated an earlier stage rather than reaching a neutral collapse.`,
        ]
      : [];
  return packet("bank", "interval", items, warnings, { terminationReason: result.terminationReason }, {
    role: "interUnit",
    frame: {
      topology: "cyclic",
      unit: "abstract",
      extent: result.stages[0]?.period ?? 0,
      origin: 0,
    },
  });
}

export function finalStagePacket(result: ScaleEvolutionResult, sourceId: string): DataPacket<number> {
  const last = result.stages[result.stages.length - 1];
  if (!last) {
    return packet("list", "interval", [], ["Evolution produced no stages."]);
  }
  const items: DataItem<number>[] = last.durations.map((value, index) => ({
    id: `${sourceId}:final:${index}`,
    value,
    provenance: [
      {
        sourceModuleInstance: sourceId,
        sourceItemIds: [],
        transformation: "scale-evolution-final",
        parameters: { stage: result.stages.length - 1, period: last.period },
      },
    ],
  }));
  const warnings = last.collapsedToNeutral
    ? ["Final stage collapsed to a neutral (all-semitone) scale."]
    : [];
  return packet("list", "interval", items, warnings, undefined, {
    role: "interUnit",
    frame: { topology: "cyclic", unit: "abstract", extent: last.period, origin: 0 },
  });
}

/**
 * Every stage IS a scale, not just an intermediate number sequence — the whole point
 * of Book II's "evolution of pitch-scale styles" is that a binomial, its synchronized
 * trinomial, its synchronized quintinomial, and so on are all usable melodic material
 * belonging to one family (Ch. 3 §A's Stony Indian / synchronized-scale examples).
 * Realizes each stage from a root exactly the way Scale Construction does, rather than
 * leaving the family's output stuck as abstract interval numbers.
 */
export function stagePitchClassesPacket(
  result: ScaleEvolutionResult,
  root: number,
  sourceId: string,
) {
  // Each bank item's value is a bare number[] — the whole stage's scale as one bracketed
  // pitch-class group, matching PitchClassItemValue's array form exactly. No wrapper
  // needed: a bank entry that IS a chord is already the right shape for that domain.
  const items: DataItem<number[]>[] = result.stages.map((stage, index) => {
    const pitchClasses = realizePitchClasses(stage.durations, root);
    return {
      id: `${sourceId}:stage-pitches:${index}`,
      value: pitchClasses,
      label: pitchClasses.map((pitchClass) => pitchClassNames[pitchClass]).join('-'),
      provenance: [
        {
          sourceModuleInstance: sourceId,
          sourceItemIds: [],
          transformation: "scale-evolution-realize",
          parameters: { stage: index, root, durations: stage.durations },
        },
      ],
    };
  });
  return packet("bank", "pitchClass", items, [], { root }, {
    role: "pitchMaterial",
    encoding: "chromatic-12",
  });
}

export function finalPitchClassesPacket(
  result: ScaleEvolutionResult,
  root: number,
  sourceId: string,
) {
  const last = result.stages[result.stages.length - 1];
  if (!last) {
    return packet("list", "pitchClass", [], ["Evolution produced no stages."]);
  }
  return scalePitchClassPacket(last.durations, root, sourceId);
}
