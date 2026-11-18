import {
  acceptsMistSettings,
  defaultMistSettings,
  migrateMistSettings,
  type MistSettings,
} from '../../mist';
import { compositionStateKeys } from '../../usePersistentState';
import type { SwirlingMistsState } from '../evaluators/swirlingMists';
import { defineModuleState } from '../moduleState';

export const swirlingMistsState = defineModuleState<SwirlingMistsState>('swirling-mists', {
  settings: {
    key: compositionStateKeys.mistSettings,
    fallback: defaultMistSettings,
    accepts: (value): value is MistSettings => acceptsMistSettings(value),
    migrate: migrateMistSettings,
  },
});
