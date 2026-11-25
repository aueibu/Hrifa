import { registerBuiltinModifiers } from './builtins';

/** Registers the built-in modifiers once, when this module is first imported. */
registerBuiltinModifiers();

export { HARMONIZE_ID, MELODICIZE_ID, SNAP_TO_PITCH_SET_ID } from './builtins';
export { getModifierDef, modifierDefs, registerModifier } from './registry';
export type {
  ModifierDef,
  ModifierInputKind,
  ModifierRefSlot,
  ModifierRunContext,
  ModifierRunResult,
} from './registry';
export {
  resolveModifierRefs,
  runModifierStack,
  type StackProblem,
  type StackResult,
} from './stack';
