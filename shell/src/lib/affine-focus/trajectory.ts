import { canonicalPitchListKey } from './tunings';
import type { GamutPitch, TrajectoryStep, TransformConfig, TransformResult } from './types';

export function createInitialTrajectory(
  seedPitches: readonly GamutPitch[],
  config: TransformConfig
): TrajectoryStep[] {
  return [
    {
      index: 0,
      pitches: [...seedPitches],
      canonicalKey: canonicalPitchListKey(seedPitches, config.identity, config.folding),
      operationLabel: 'Seed',
      formulaDisplay: 'S₀ (initial seed)',
      focusPitches: [],
      multiplierUsed: 1,
      fromStepResult: null,
    },
  ];
}

export function appendTrajectoryStep(
  trajectory: readonly TrajectoryStep[],
  result: TransformResult
): TrajectoryStep[] {
  const nextStep: TrajectoryStep = {
    index: trajectory.length,
    pitches: result.outputPitches,
    canonicalKey: result.canonicalKey,
    operationLabel: result.operationLabel,
    formulaDisplay: result.formulaDisplay,
    focusPitches: result.focusPitches,
    multiplierUsed: result.multiplierUsed,
    fromStepResult: result,
  };
  return [...trajectory, nextStep];
}

export function truncateTrajectoryAt(
  trajectory: readonly TrajectoryStep[],
  stepIndex: number
): TrajectoryStep[] {
  if (stepIndex < 0 || trajectory.length === 0) {
    return trajectory.slice(0, 1);
  }
  return trajectory.slice(0, stepIndex + 1);
}
