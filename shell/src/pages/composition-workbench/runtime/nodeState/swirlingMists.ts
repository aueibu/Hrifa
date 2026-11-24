import { acceptsMistSettings, defaultMistSettings, type MistSettings } from '../../mist';
import { compositionStateKeys } from '../../usePersistentState';
import type { SwirlingMistsState } from '../evaluators/swirlingMists';
import { defineNodeState } from '../nodeState';

export const swirlingMistsState = defineNodeState<SwirlingMistsState>('swirling-mists', {
  settings: {
    key: compositionStateKeys.mistSettings,
    fallback: defaultMistSettings,
    accepts: (value): value is MistSettings => acceptsMistSettings(value),
  },
});
