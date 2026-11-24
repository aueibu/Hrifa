import type { GroupingPolicy, RhythmEditMode } from '../../rhythmEdit';
import { acceptsString, compositionStateKeys } from '../../usePersistentState';
import type { EditSettings, RhythmEditState } from '../evaluators/rhythmEdit';
import { defineNodeState } from '../nodeState';

export const rhythmEditInitialProgram = '[x,2][r,1]';
export const rhythmEditInitialRules = 'every 3: r';

export const rhythmEditDefaultSettings: EditSettings = {
  programPhase: 0,
  programRate: 1,
  lengthPhase: 0,
  lengthRate: 1,
  nStart: 1,
  nChange: 1,
  nEvery: 1,
};

function acceptsEditSettings(value: unknown): value is EditSettings {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    (Object.keys(rhythmEditDefaultSettings) as (keyof EditSettings)[]).every(
      (key) => typeof (value as EditSettings)[key] === 'number'
    )
  );
}

export const rhythmEditState = defineNodeState<RhythmEditState>('rhythm-edit', {
  mode: {
    key: compositionStateKeys.rhythmEditMode,
    fallback: 'program',
    accepts: (value): value is RhythmEditMode => value === 'program' || value === 'rules',
  },
  program: {
    key: compositionStateKeys.rhythmEditPattern,
    fallback: rhythmEditInitialProgram,
    accepts: acceptsString,
  },
  rules: {
    key: compositionStateKeys.rhythmEditRules,
    fallback: rhythmEditInitialRules,
    accepts: acceptsString,
  },
  lengths: { key: compositionStateKeys.rhythmEditLengths, fallback: '', accepts: acceptsString },
  grouping: {
    key: compositionStateKeys.rhythmEditGrouping,
    fallback: 'drop',
    accepts: (value): value is GroupingPolicy =>
      value === 'drop' || value === 'keep' || value === 'follow',
  },
  editSettings: {
    key: compositionStateKeys.rhythmEditSettings,
    fallback: rhythmEditDefaultSettings,
    accepts: acceptsEditSettings,
  },
});
