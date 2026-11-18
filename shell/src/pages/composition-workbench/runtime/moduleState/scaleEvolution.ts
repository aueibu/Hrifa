import { acceptsFiniteNumber, acceptsString, compositionStateKeys } from '../../usePersistentState';
import type { ScaleEvolutionState } from '../evaluators/scaleEvolution';
import { defineModuleState } from '../moduleState';

export const scaleEvolutionState = defineModuleState<ScaleEvolutionState>('scale-evolution', {
  intervalText: {
    key: compositionStateKeys.scaleEvolutionIntervals,
    fallback: '3, 2',
    accepts: acceptsString,
  },
  root: { key: compositionStateKeys.scaleEvolutionRoot, fallback: 0, accepts: acceptsFiniteNumber },
});
