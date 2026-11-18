import type { PairCompositionMode } from '../../pairComposition';
import { acceptsNumberOrString, compositionStateKeys } from '../../usePersistentState';
import type { PairCompositionState } from '../evaluators/pairComposition';
import { defineModuleState } from '../moduleState';

export function isPairCompositionMode(value: string): value is PairCompositionMode {
  return value === 'balancing' || value === 'expanding' || value === 'contracting';
}

export const pairCompositionState = defineModuleState<PairCompositionState>('pair-composition', {
  a: { key: compositionStateKeys.pairCompositionA, fallback: 3, accepts: acceptsNumberOrString },
  b: { key: compositionStateKeys.pairCompositionB, fallback: 2, accepts: acceptsNumberOrString },
  mode: {
    key: compositionStateKeys.pairCompositionMode,
    fallback: 'balancing',
    accepts: (value): value is PairCompositionMode =>
      typeof value === 'string' && isPairCompositionMode(value),
  },
});
