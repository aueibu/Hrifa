import { acceptsNumberOrString, compositionStateKeys } from '../../usePersistentState';
import type { FractioningState } from '../evaluators/fractioning';
import { defineNodeState } from '../nodeState';

export const fractioningState = defineNodeState<FractioningState>('fractioning', {
  a: { key: compositionStateKeys.fractioningA, fallback: 3, accepts: acceptsNumberOrString },
  b: { key: compositionStateKeys.fractioningB, fallback: 2, accepts: acceptsNumberOrString },
});
