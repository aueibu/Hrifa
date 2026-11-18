import { acceptsNumberOrString, compositionStateKeys } from '../../usePersistentState';
import type { FractioningState } from '../evaluators/fractioning';
import { defineModuleState } from '../moduleState';

export const fractioningState = defineModuleState<FractioningState>('fractioning', {
  a: { key: compositionStateKeys.fractioningA, fallback: 3, accepts: acceptsNumberOrString },
  b: { key: compositionStateKeys.fractioningB, fallback: 2, accepts: acceptsNumberOrString },
});
