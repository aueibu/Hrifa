import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { recordChange, registerHistoryApplier } from './history';
import { isReloading } from './reloading';

export const compositionStateKeys = {
  selectedConstructionModule: 'hrifa.composition-workbench.ui.selected-construction-module.v1',
  moduleQuery: 'hrifa.composition-workbench.ui.module-query.v1',
  activeView: 'hrifa.composition-workbench.ui.active-view.v1',
  activeCompositionModule: 'hrifa.composition-workbench.ui.active-composition-module.v1',
  compositionInspectorTarget: 'hrifa.composition-workbench.ui.inspector-target.v1',
  compositionModuleLanes: 'hrifa.composition-workbench.ui.module-lanes.v1',
  compositionModules: 'hrifa.composition-workbench.ui.modules.v1',
  compositionInstances: 'hrifa.composition-workbench.ui.instances.v3',
  canvasSplit: 'hrifa.composition-workbench.ui.canvas-split.v1',
  detailCollapsed: 'hrifa.composition-workbench.ui.detail-collapsed.v1',
  inspectorOpen: 'hrifa.composition-workbench.ui.inspector-open.v1',
  desk: 'hrifa.composition-workbench.desk.snippets.v1',
  workspaceView: 'hrifa.composition-workbench.ui.workspace-view.v1',
  settingsOpen: 'hrifa.composition-workbench.ui.settings-open.v1',
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
  rhythmEditMode: 'hrifa.composition-workbench.rhythm-edit.mode.v1',
  rhythmEditRules: 'hrifa.composition-workbench.rhythm-edit.rules.v1',
  rhythmEditCellWidth: 'hrifa.composition-workbench.rhythm-edit.cell-width.v1',
  rhythmEditFollow: 'hrifa.composition-workbench.rhythm-edit.follow.v1',
  rhythmEditShowTracks: 'hrifa.composition-workbench.rhythm-edit.show-tracks.v1',
  rhythmEditAudition: 'hrifa.composition-workbench.rhythm-edit.audition.v1',
  rhythmEditGrouping: 'hrifa.composition-workbench.rhythm-edit.grouping.v1',
  rhythmEditLengths: 'hrifa.composition-workbench.rhythm-edit.lengths.v1',
  rhythmEditSettings: 'hrifa.composition-workbench.rhythm-edit.settings.v1',
  rhythmEditPattern: 'hrifa.composition-workbench.rhythm-edit.pattern.v1',
  rhythmEditSound: 'hrifa.composition-workbench.rhythm-edit.sound.v1',
  rhythmEditVolume: 'hrifa.composition-workbench.rhythm-edit.preview-volume.v1',
  rhythmListText: 'hrifa.composition-workbench.rhythm-list.text.v1',
  rhythmListLoop: 'hrifa.composition-workbench.rhythm-list.loop.v1',
  rhythmListSound: 'hrifa.composition-workbench.rhythm-list.sound.v1',
  rhythmListVolume: 'hrifa.composition-workbench.rhythm-list.preview-volume.v1',
  pitchFormat: 'hrifa.composition-workbench.pitch-list.format.v1',
  pitchConvertOnChange: 'hrifa.composition-workbench.pitch-list.convert-on-change.v1',
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
  fractioningSound: 'hrifa.composition-workbench.fractioning.sound.v1',
  pairCompositionA: 'hrifa.composition-workbench.pair-composition.a.v1',
  pairCompositionB: 'hrifa.composition-workbench.pair-composition.b.v1',
  pairCompositionMode: 'hrifa.composition-workbench.pair-composition.mode.v1',
  pairCompositionUnit: 'hrifa.composition-workbench.pair-composition.preview-unit.v1',
  pairCompositionVolume: 'hrifa.composition-workbench.pair-composition.preview-volume.v1',
  pairCompositionMidiNote: 'hrifa.composition-workbench.pair-composition.midi-note.v1',
  pairCompositionSound: 'hrifa.composition-workbench.pair-composition.sound.v1',
  scaleConstructionIntervals: 'hrifa.composition-workbench.scale-construction.intervals.v1',
  scaleConstructionRoot: 'hrifa.composition-workbench.scale-construction.root.v1',
  scaleConstructionPermutationMode:
    'hrifa.composition-workbench.scale-construction.permutation-mode.v1',
  scaleEvolutionIntervals: 'hrifa.composition-workbench.scale-evolution.intervals.v1',
  scaleEvolutionRoot: 'hrifa.composition-workbench.scale-evolution.root.v1',
  householderSettings: 'hrifa.composition-workbench.rhythm-householder.settings.v1',
  householderSelected: 'hrifa.composition-workbench.rhythm-householder.selected.v1',
  householderUnit: 'hrifa.composition-workbench.rhythm-householder.preview-unit.v1',
  householderVolume: 'hrifa.composition-workbench.rhythm-householder.preview-volume.v1',
  householderSounds: 'hrifa.composition-workbench.rhythm-householder.sounds.v1',
  mistSettings: 'hrifa.composition-workbench.swirling-mists.settings.v1',
  mistStep: 'hrifa.composition-workbench.swirling-mists.preview-step.v1',
  mistGate: 'hrifa.composition-workbench.swirling-mists.preview-gate.v1',
  mistVolume: 'hrifa.composition-workbench.swirling-mists.preview-volume.v1',
  mistViewSpan: 'hrifa.composition-workbench.swirling-mists.view-span.v1',
  mistRunSpeed: 'hrifa.composition-workbench.swirling-mists.run-speed.v1',
  mixerChannels: 'hrifa.composition-workbench.mixer.channels.v1',
  mixerVolume: 'hrifa.composition-workbench.mixer.volume.v1',
  mixerRollView: 'hrifa.composition-workbench.mixer.roll-view.v1',
  mixerRollMode: 'hrifa.composition-workbench.mixer.roll-mode.v1',
  mixerLaneScale: 'hrifa.composition-workbench.mixer.lane-scale.v1',
} as const;

/**
 * Keys whose changes never become undo steps: what is showing (selection, view, scroll, zoom,
 * panels, follow), and preview-only settings (volumes, steps, units, gates, octaves, sounds,
 * audition). Authored content (patterns, values, routes, instances, the desk) is everything else.
 * The classification lives here, beside the key list, not in each module. Dead keys are listed too.
 */
export const unrecordedStateKeys: ReadonlySet<string> = new Set<string>([
  // Selection, layout and view.
  compositionStateKeys.selectedConstructionModule,
  compositionStateKeys.moduleQuery,
  compositionStateKeys.activeView,
  compositionStateKeys.activeCompositionModule,
  compositionStateKeys.compositionInspectorTarget,
  compositionStateKeys.canvasSplit,
  compositionStateKeys.detailCollapsed,
  compositionStateKeys.inspectorOpen,
  compositionStateKeys.workspaceView,
  compositionStateKeys.settingsOpen,
  compositionStateKeys.melodicizationPianoRollView,
  compositionStateKeys.melodicizationInspector,
  compositionStateKeys.mixerRollView,
  compositionStateKeys.mixerRollMode,
  compositionStateKeys.mixerLaneScale,
  compositionStateKeys.mistViewSpan,
  compositionStateKeys.mistRunSpeed,
  compositionStateKeys.rhythmEditCellWidth,
  compositionStateKeys.rhythmEditFollow,
  compositionStateKeys.rhythmEditShowTracks,
  compositionStateKeys.rhythmEditAudition,
  compositionStateKeys.householderSelected,
  // Preview-only: volumes, steps, units, gates, octaves, sounds, clicks.
  compositionStateKeys.interferenceUnit,
  compositionStateKeys.interferenceVolume,
  compositionStateKeys.interferenceMetronome,
  compositionStateKeys.interferenceMetronomeVolume,
  compositionStateKeys.rhythmEditSound,
  compositionStateKeys.rhythmEditVolume,
  compositionStateKeys.rhythmListSound,
  compositionStateKeys.rhythmListVolume,
  compositionStateKeys.pitchStep,
  compositionStateKeys.pitchGate,
  compositionStateKeys.pitchOctave,
  compositionStateKeys.pitchVolume,
  compositionStateKeys.melodicizationVolume,
  compositionStateKeys.fractioningUnit,
  compositionStateKeys.fractioningVolume,
  compositionStateKeys.fractioningMidiNote,
  compositionStateKeys.fractioningSound,
  compositionStateKeys.pairCompositionUnit,
  compositionStateKeys.pairCompositionVolume,
  compositionStateKeys.pairCompositionMidiNote,
  compositionStateKeys.pairCompositionSound,
  compositionStateKeys.householderUnit,
  compositionStateKeys.householderVolume,
  compositionStateKeys.householderSounds,
  compositionStateKeys.mistStep,
  compositionStateKeys.mistGate,
  compositionStateKeys.mistVolume,
  compositionStateKeys.mixerVolume,
]);

/** Whether changes to this stored key (per-instance suffix included) are undoable. */
export function isRecordedStateKey(key: string) {
  return !unrecordedStateKeys.has(key.split('.instance.')[0]);
}

export interface PersistentStateOptions {
  /** Overrides the central classification for this one hook. */
  recorded?: boolean;
  /** False for discrete actions that must never merge with the next change. Default true. */
  coalesce?: boolean;
}

function serialize(value: unknown): string | null {
  try {
    return JSON.stringify(value) ?? null;
  } catch {
    return null;
  }
}

export function usePersistentState<T>(
  key: string,
  fallback: T | (() => T),
  accepts: (value: unknown) => value is T,
  // Upgrades an older saved shape before it is validated, so old projects keep loading.
  migrate?: (value: unknown) => unknown,
  options?: PersistentStateOptions
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const fallbackValue = typeof fallback === 'function' ? (fallback as () => T)() : fallback;
    try {
      const saved = localStorage.getItem(key);
      if (saved === null) {
        return fallbackValue;
      }
      const raw: unknown = JSON.parse(saved);
      const parsed = migrate ? migrate(raw) : raw;
      return accepts(parsed) ? parsed : fallbackValue;
    } catch {
      return fallbackValue;
    }
  });

  // The latest value, kept current inside a handler too, so updaters resolve against what earlier
  // calls in the same event produced and the recorder sees the true previous and next.
  const valueRef = useRef(value);
  valueRef.current = value;
  const rawRef = useRef<string | null>(null);
  const acceptsRef = useRef(accepts);
  acceptsRef.current = accepts;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Mount and migration writes go through here and never record.
  useEffect(() => {
    if (isReloading()) {
      return;
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // State remains usable in memory when browser persistence is unavailable.
    }
  }, [key, value]);

  // Undo and redo write their target raw value back through this.
  useEffect(
    () =>
      registerHistoryApplier(key, (raw) => {
        try {
          const parsed: unknown = JSON.parse(raw);
          if (!acceptsRef.current(parsed)) {
            return false;
          }
          valueRef.current = parsed;
          rawRef.current = raw;
          setValue(parsed);
          return true;
        } catch {
          return false;
        }
      }),
    [key]
  );

  const set = useCallback(
    (action: SetStateAction<T>) => {
      const previous = valueRef.current;
      const next = typeof action === 'function' ? (action as (current: T) => T)(previous) : action;
      if (Object.is(next, previous)) {
        return;
      }
      valueRef.current = next;
      setValue(next);
      if (!(optionsRef.current?.recorded ?? isRecordedStateKey(key))) {
        return;
      }
      const previousRaw = rawRef.current ?? serialize(previous);
      const nextRaw = serialize(next);
      rawRef.current = nextRaw;
      if (previousRaw !== null && nextRaw !== null) {
        recordChange(
          { key, previous: previousRaw, next: nextRaw },
          { coalesce: optionsRef.current?.coalesce }
        );
      }
    },
    [key]
  );

  return [value, set];
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
