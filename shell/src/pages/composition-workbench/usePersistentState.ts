import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

export const compositionStateKeys = {
  selectedConstructionModule: 'hrifa.composition-workbench.ui.selected-construction-module.v1',
  moduleQuery: 'hrifa.composition-workbench.ui.module-query.v1',
  activeView: 'hrifa.composition-workbench.ui.active-view.v1',
  activeCompositionModule: 'hrifa.composition-workbench.ui.active-composition-module.v1',
  compositionInspectorTarget: 'hrifa.composition-workbench.ui.inspector-target.v1',
  compositionModuleLanes: 'hrifa.composition-workbench.ui.module-lanes.v1',
  compositionModules: 'hrifa.composition-workbench.ui.modules.v1',
  compositionInstances: 'hrifa.composition-workbench.ui.instances.v3',
  moduleRouteStates: 'hrifa.composition-workbench.routing.module-routes.v1',
  melodicizationBindings: 'hrifa.composition-workbench.routing.melodicization.v1',
  melodicizationPitchTreatment: 'hrifa.composition-workbench.routing.pitch-treatment.v1',
  melodicizationRhythmTreatment: 'hrifa.composition-workbench.routing.rhythm-treatment.v1',
  arithmeticOperator: 'hrifa.composition-workbench.arithmetic.operator.v1',
  arithmeticFallbackA: 'hrifa.composition-workbench.arithmetic.fallback-a.v1',
  arithmeticFallbackB: 'hrifa.composition-workbench.arithmetic.fallback-b.v1',
  arithmeticCombineStrategy: 'hrifa.composition-workbench.arithmetic.combine-strategy.v1',
  arithmeticModulo: 'hrifa.composition-workbench.arithmetic.modulo.v1',
  interferenceDrafts: 'hrifa.composition-workbench.interference.generators.v1',
  interferenceGrouping: 'hrifa.composition-workbench.interference.grouping.v1',
  interferenceUnit: 'hrifa.composition-workbench.interference.preview-unit.v1',
  interferenceVolume: 'hrifa.composition-workbench.interference.preview-volume.v1',
  interferenceMetronome: 'hrifa.composition-workbench.interference.metronome.v1',
  interferenceMetronomeVolume: 'hrifa.composition-workbench.interference.metronome-volume.v1',
  pitchFormat: 'hrifa.composition-workbench.pitch-list.format.v1',
  pitchValues: 'hrifa.composition-workbench.pitch-list.values.v1',
  pitchCatalogOrigins: 'hrifa.composition-workbench.pitch-list.catalog-origins.v1',
  pitchStep: 'hrifa.composition-workbench.pitch-list.preview-step.v1',
  pitchGate: 'hrifa.composition-workbench.pitch-list.preview-gate.v1',
  pitchOctave: 'hrifa.composition-workbench.pitch-list.preview-octave.v1',
  pitchVolume: 'hrifa.composition-workbench.pitch-list.preview-volume.v1',
  melodicizationAllocation: 'hrifa.composition-workbench.melodicization.allocation.v1',
  melodicizationPulse: 'hrifa.composition-workbench.melodicization.pulse.v1',
  melodicizationArticulation: 'hrifa.composition-workbench.melodicization.articulation.v1',
  melodicizationTempo: 'hrifa.composition-workbench.melodicization.tempo.v1',
  melodicizationMeter: 'hrifa.composition-workbench.melodicization.meter.v1',
  melodicizationVolume: 'hrifa.composition-workbench.melodicization.preview-volume.v1',
  melodicizationPianoRollView: 'hrifa.composition-workbench.melodicization.piano-roll-view.v1',
  melodicizationInspector: 'hrifa.composition-workbench.melodicization.inspector.v1',
  fractioningA: 'hrifa.composition-workbench.fractioning.a.v1',
  fractioningB: 'hrifa.composition-workbench.fractioning.b.v1',
  fractioningUnit: 'hrifa.composition-workbench.fractioning.preview-unit.v1',
  fractioningVolume: 'hrifa.composition-workbench.fractioning.preview-volume.v1',
  fractioningMidiNote: 'hrifa.composition-workbench.fractioning.midi-note.v1',
  pairCompositionA: 'hrifa.composition-workbench.pair-composition.a.v1',
  pairCompositionB: 'hrifa.composition-workbench.pair-composition.b.v1',
  pairCompositionMode: 'hrifa.composition-workbench.pair-composition.mode.v1',
  pairCompositionUnit: 'hrifa.composition-workbench.pair-composition.preview-unit.v1',
  pairCompositionVolume: 'hrifa.composition-workbench.pair-composition.preview-volume.v1',
  pairCompositionMidiNote: 'hrifa.composition-workbench.pair-composition.midi-note.v1',
  scaleConstructionIntervals: 'hrifa.composition-workbench.scale-construction.intervals.v1',
  scaleConstructionRoot: 'hrifa.composition-workbench.scale-construction.root.v1',
  scaleConstructionPermutationMode: 'hrifa.composition-workbench.scale-construction.permutation-mode.v1',
  scaleEvolutionIntervals: 'hrifa.composition-workbench.scale-evolution.intervals.v1',
  scaleEvolutionRoot: 'hrifa.composition-workbench.scale-evolution.root.v1',
} as const;

export function usePersistentState<T>(
  key: string,
  fallback: T | (() => T),
  accepts: (value: unknown) => value is T
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const fallbackValue = typeof fallback === 'function' ? (fallback as () => T)() : fallback;
    try {
      const saved = localStorage.getItem(key);
      if (saved === null) {
        return fallbackValue;
      }
      const parsed: unknown = JSON.parse(saved);
      return accepts(parsed) ? parsed : fallbackValue;
    } catch {
      return fallbackValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // State remains usable in memory when browser persistence is unavailable.
    }
  }, [key, value]);

  return [value, setValue];
}

export const acceptsString = (value: unknown): value is string => typeof value === 'string';
export const acceptsBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
export const acceptsNumberOrString = (value: unknown): value is number | string =>
  typeof value === 'number' || typeof value === 'string';
export const acceptsFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
export const acceptsIntegerList = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isInteger(item));

export function compositionInstanceStateKey(
  baseKey: string,
  instanceId: string,
  legacyInstanceId: string
) {
  return instanceId === legacyInstanceId ? baseKey : `${baseKey}.instance.${instanceId}`;
}
