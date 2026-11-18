import { arithmeticOperatorDefaults, type ArithmeticOperator } from '../../arithmetic';
import type { PitchAllocation } from '../../melodicization';
import { defaultModuloTreatment, type ModuloTreatment } from '../../moduloTreatment';
import { acceptsNumberOrString, compositionStateKeys } from '../../usePersistentState';
import type { ArithmeticState } from '../evaluators/arithmetic';
import { defineModuleState } from '../moduleState';

export function acceptsOperator(value: unknown): value is ArithmeticOperator {
  return (
    value === 'add' ||
    value === 'subtract' ||
    value === 'multiply' ||
    value === 'divide' ||
    value === 'floorDivide' ||
    value === 'power' ||
    value === 'exp'
  );
}

export function acceptsCombineStrategy(value: unknown): value is PitchAllocation {
  return value === 'cycle' || value === 'cycle-rhythm' || value === 'zip' || value === 'cartesian';
}

function acceptsModuloTreatment(value: unknown): value is ModuloTreatment {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as ModuloTreatment).enabled === 'boolean' &&
    Number.isFinite((value as ModuloTreatment).divisor)
  );
}

export const arithmeticState = defineModuleState<ArithmeticState>('arithmetic', {
  operator: {
    key: compositionStateKeys.arithmeticOperator,
    fallback: 'add',
    accepts: acceptsOperator,
  },
  fallbackA: {
    key: compositionStateKeys.arithmeticFallbackA,
    fallback: arithmeticOperatorDefaults.add.a,
    accepts: acceptsNumberOrString,
  },
  fallbackB: {
    key: compositionStateKeys.arithmeticFallbackB,
    fallback: arithmeticOperatorDefaults.add.b,
    accepts: acceptsNumberOrString,
  },
  combineStrategy: {
    key: compositionStateKeys.arithmeticCombineStrategy,
    fallback: 'zip',
    accepts: acceptsCombineStrategy,
  },
  modulo: {
    key: compositionStateKeys.arithmeticModulo,
    fallback: defaultModuloTreatment,
    accepts: acceptsModuloTreatment,
  },
});
