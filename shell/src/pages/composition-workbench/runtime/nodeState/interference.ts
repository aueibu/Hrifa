import { isSoundOverride } from '../../sounds';
import { acceptsString, compositionStateKeys } from '../../usePersistentState';
import type { GeneratorDraft, InterferenceState } from '../evaluators/interference';
import { defineNodeState } from '../nodeState';

export const interferenceInitialGenerators: GeneratorDraft[] = [
  { id: 'generator-a', label: 'Generator 1', valueText: '2' },
  { id: 'generator-b', label: 'Generator 2', valueText: '3' },
  { id: 'generator-c', label: 'Generator 3', valueText: '5' },
];

export const interferenceState = defineNodeState<InterferenceState>('interference', {
  drafts: {
    key: compositionStateKeys.interferenceDrafts,
    fallback: interferenceInitialGenerators,
    accepts: (value): value is GeneratorDraft[] =>
      Array.isArray(value) &&
      value.every(
        (draft) =>
          draft &&
          typeof draft.id === 'string' &&
          typeof draft.label === 'string' &&
          typeof draft.valueText === 'string' &&
          (draft.sound === undefined || draft.sound === null || isSoundOverride(draft.sound))
      ),
  },
  groupingId: {
    key: compositionStateKeys.interferenceGrouping,
    fallback: 'recurrence',
    accepts: acceptsString,
  },
});
