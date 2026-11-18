import type { PitchAllocation } from '../../melodicization';
import { acceptsFiniteNumber, compositionStateKeys } from '../../usePersistentState';
import type { MelodicizationState } from '../evaluators/melodicization';
import { defineModuleState } from '../moduleState';

export const melodicizationState = defineModuleState<MelodicizationState>('melodicization', {
  allocation: {
    key: compositionStateKeys.melodicizationAllocation,
    fallback: 'cycle',
    accepts: (value): value is PitchAllocation =>
      value === 'cycle' || value === 'cycle-rhythm' || value === 'zip' || value === 'cartesian',
  },
  articulationPercent: {
    key: compositionStateKeys.melodicizationArticulation,
    fallback: 100,
    accepts: acceptsFiniteNumber,
  },
});
