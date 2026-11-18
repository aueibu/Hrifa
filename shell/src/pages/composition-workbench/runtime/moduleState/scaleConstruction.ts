import {
  acceptsFiniteNumber,
  acceptsIntegerList,
  compositionStateKeys,
} from '../../usePersistentState';
import type { ScaleConstructionState } from '../evaluators/scaleConstruction';
import { defineModuleState } from '../moduleState';

export function acceptsPermutationMode(value: unknown): value is 'general' | 'circular' {
  return value === 'general' || value === 'circular';
}

export const scaleConstructionState = defineModuleState<ScaleConstructionState>(
  'scale-construction',
  {
    intervals: {
      key: compositionStateKeys.scaleConstructionIntervals,
      fallback: [2, 2, 1],
      accepts: acceptsIntegerList,
    },
    root: {
      key: compositionStateKeys.scaleConstructionRoot,
      fallback: 0,
      accepts: acceptsFiniteNumber,
    },
    permutationMode: {
      key: compositionStateKeys.scaleConstructionPermutationMode,
      fallback: 'general',
      accepts: acceptsPermutationMode,
    },
  }
);
