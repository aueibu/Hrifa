import { reflectAxisLabels } from '../../householder';
import { acceptsFiniteNumber, compositionStateKeys } from '../../usePersistentState';
import {
  defaultHouseholderSettings,
  type HouseholderSettings,
  type HouseholderState,
  type MetricAxisSettings,
} from '../evaluators/householder';
import { defineModuleState } from '../moduleState';

function acceptsAxisSettings(value: unknown): value is MetricAxisSettings {
  const axis = value as MetricAxisSettings;
  return (
    Boolean(axis) &&
    typeof axis === 'object' &&
    typeof axis.enabled === 'boolean' &&
    Number.isFinite(axis.coefficient) &&
    Number.isFinite(axis.weight)
  );
}

function acceptsHouseholderSettings(value: unknown): value is HouseholderSettings {
  const settings = value as HouseholderSettings;
  return (
    Boolean(settings) &&
    typeof settings === 'object' &&
    (settings.mode === 'reflect' || settings.mode === 'metric') &&
    Number.isInteger(settings.grid) &&
    Number.isInteger(settings.minUnits) &&
    settings.reflectPreset in reflectAxisLabels &&
    typeof settings.customAxis === 'string' &&
    Number.isFinite(settings.reflectCoefficient) &&
    Number.isInteger(settings.reflectSteps) &&
    typeof settings.accentPattern === 'string' &&
    acceptsAxisSettings(settings.accent) &&
    acceptsAxisSettings(settings.position) &&
    Number.isFinite(settings.closeness) &&
    (settings.identity === undefined || Number.isFinite(settings.identity)) &&
    (settings.pinStart === undefined || typeof settings.pinStart === 'boolean')
  );
}

export const householderState = defineModuleState<HouseholderState>('rhythm-householder', {
  settings: {
    key: compositionStateKeys.householderSettings,
    fallback: defaultHouseholderSettings,
    accepts: acceptsHouseholderSettings,
  },
  selectedIndex: {
    key: compositionStateKeys.householderSelected,
    fallback: 0,
    accepts: acceptsFiniteNumber,
  },
});
