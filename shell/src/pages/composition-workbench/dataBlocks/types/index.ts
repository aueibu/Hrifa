import { registerNotesType } from './notes';
import { registerPitchClassesType } from './pitchClasses';
import { registerPitchSetType } from './pitchSet';
import { registerRhythmType } from './rhythm';
import { registerValuesType } from './values';

/**
 * Registers the built-in packet types, once, when this module is first imported. Their `accepts`
 * never overlap (`chooseTypeId` takes the first match; types.test.ts proves it). A consumer makes
 * sure the types exist by importing this module: dataBlockTypes.ts does, and the desk imports that.
 */
registerNotesType();
registerPitchSetType();
registerPitchClassesType();
registerRhythmType();
registerValuesType();

export { NOTES_TYPE_ID } from './notes';
export { PITCH_CLASSES_TYPE_ID } from './pitchClasses';
export { PITCH_SET_TYPE_ID } from './pitchSet';
export { RHYTHM_TYPE_ID } from './rhythm';
export { VALUES_TYPE_ID } from './values';
