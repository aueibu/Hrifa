import { acceptsBoolean, acceptsString, compositionStateKeys } from '../../usePersistentState';
import type { RhythmListState } from '../evaluators/rhythmList';
import { defineModuleState } from '../moduleState';

export const rhythmListInitialText = '3 r1 2~ 2 1';

export const rhythmListState = defineModuleState<RhythmListState>('rhythm-list', {
  text: {
    key: compositionStateKeys.rhythmListText,
    fallback: rhythmListInitialText,
    accepts: acceptsString,
  },
  // A loop wraps a tie off the end onto the first item; a one-shot ignores it with a warning.
  loop: { key: compositionStateKeys.rhythmListLoop, fallback: true, accepts: acceptsBoolean },
});
