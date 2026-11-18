import type { ReactElement } from 'react';
import { ArithmeticModule } from '../components/ArithmeticModule';
import { FractioningModule } from '../components/FractioningModule';
import { HouseholderModule } from '../components/HouseholderModule';
import { InterferenceModule } from '../components/InterferenceModule';
import { MelodicizationModule } from '../components/MelodicizationModule';
import { MixerModule } from '../components/MixerModule';
import { PairCompositionModule } from '../components/PairCompositionModule';
import { PitchListModule } from '../components/PitchListModule';
import { RhythmEditModule } from '../components/RhythmEditModule';
import { RhythmListModule } from '../components/RhythmListModule';
import { ScaleConstructionModule } from '../components/ScaleConstructionModule';
import { ScaleEvolutionModule } from '../components/ScaleEvolutionModule';
import { SnippetSourceModule } from '../components/SnippetSourceModule';
import { SwirlingMistsModule } from '../components/SwirlingMistsModule';
import type { CompositionOutputRef, PublishedCompositionOutput } from '../compositionRouting';
import type { CompositionModuleId, ModuleRouteState } from '../compositionWorkspace';
import { compositionStateKeys } from '../usePersistentState';
import { moduleEvaluators, type ModuleEvaluator } from './moduleEvaluators';
import { modulePorts, type ModulePort } from './modulePorts';

/** What a module's `render` gets. A module takes only the subset it declares today. */
export interface ModuleRenderProps {
  instanceId: string;
  instanceLabel: string;
  /** The desk clip a snippet source module reads. */
  snippetId?: string;
  /** Whether this instance is the one shown (Melodicization still takes it as a prop). */
  active: boolean;
  /** Every published output; empty unless the module's entry has `takesOutputs`. */
  outputs: PublishedCompositionOutput[];
  routeState: ModuleRouteState;
  onBind(port: string, source: CompositionOutputRef | null): void;
  onAddChannel(): void;
  onRemoveChannel(port: string): void;
  onOutputsChange(instanceId: string, outputs: PublishedCompositionOutput[]): void;
}

export interface ModuleRegistryEntry {
  /** The persistent-state base keys this module stores per instance (cleared when it is deleted). */
  stateKeys: string[];
  /** Inlets of a routed module (the mixer's empty list still means routed). Absent: not routed. */
  ports?: ModulePort[];
  /** True for a module that reads the published outputs (a routed module). Source modules do not. */
  takesOutputs: boolean;
  /**
   * The module's pure state-to-outputs function, when it has been ported (R2). The component runs it
   * through `useModuleEvaluation`, which publishes the outputs; see `moduleEvaluators.ts`.
   */
  evaluate?: ModuleEvaluator;
  render(props: ModuleRenderProps): ReactElement;
}

/**
 * The one place a module is declared: its stored state, its inlets and how the page renders it.
 * Adding a module is one entry here (plus its id in `compositionWorkspace.ts`).
 */
export const moduleRegistry: Record<CompositionModuleId, ModuleRegistryEntry> = {
  snippet: {
    // A snippet module keeps nothing of its own: the desk owns the material.
    stateKeys: [],
    takesOutputs: false,
    evaluate: moduleEvaluators['snippet'].evaluate,
    render: ({ instanceId, instanceLabel, snippetId, onOutputsChange }) => (
      <SnippetSourceModule
        instanceId={instanceId}
        instanceLabel={instanceLabel}
        snippetId={snippetId}
        onOutputsChange={onOutputsChange}
      />
    ),
  },
  interference: {
    stateKeys: [
      compositionStateKeys.interferenceDrafts,
      compositionStateKeys.interferenceGrouping,
      compositionStateKeys.interferenceUnit,
      compositionStateKeys.interferenceVolume,
      compositionStateKeys.interferenceMetronome,
      compositionStateKeys.interferenceMetronomeVolume,
    ],
    takesOutputs: false,
    evaluate: moduleEvaluators['interference'].evaluate,
    render: ({ instanceId, instanceLabel, onOutputsChange }) => (
      <InterferenceModule
        instanceId={instanceId}
        instanceLabel={instanceLabel}
        onOutputsChange={onOutputsChange}
      />
    ),
  },
  'rhythm-edit': {
    stateKeys: [
      compositionStateKeys.rhythmEditPattern,
      compositionStateKeys.rhythmEditMode,
      compositionStateKeys.rhythmEditRules,
      compositionStateKeys.rhythmEditLengths,
      compositionStateKeys.rhythmEditGrouping,
      compositionStateKeys.rhythmEditAudition,
      compositionStateKeys.rhythmEditShowTracks,
      compositionStateKeys.rhythmEditFollow,
      compositionStateKeys.rhythmEditCellWidth,
      compositionStateKeys.rhythmEditSettings,
      compositionStateKeys.rhythmEditSound,
      compositionStateKeys.rhythmEditVolume,
    ],
    ports: modulePorts['rhythm-edit'],
    takesOutputs: true,
    evaluate: moduleEvaluators['rhythm-edit'].evaluate,
    render: ({ instanceId, instanceLabel, outputs, routeState, onBind, onOutputsChange }) => (
      <RhythmEditModule
        instanceId={instanceId}
        instanceLabel={instanceLabel}
        outputs={outputs}
        routeState={routeState}
        onBind={onBind}
        onOutputsChange={onOutputsChange}
      />
    ),
  },
  'rhythm-list': {
    stateKeys: [
      compositionStateKeys.rhythmListText,
      compositionStateKeys.rhythmListLoop,
      compositionStateKeys.rhythmListSound,
      compositionStateKeys.rhythmListVolume,
    ],
    takesOutputs: false,
    evaluate: moduleEvaluators['rhythm-list'].evaluate,
    render: ({ instanceId, instanceLabel, onOutputsChange }) => (
      <RhythmListModule
        instanceId={instanceId}
        instanceLabel={instanceLabel}
        onOutputsChange={onOutputsChange}
      />
    ),
  },
  'pitch-list': {
    stateKeys: [
      compositionStateKeys.pitchFormat,
      compositionStateKeys.pitchConvertOnChange,
      compositionStateKeys.pitchValues,
      compositionStateKeys.pitchCatalogOrigins,
      compositionStateKeys.pitchStep,
      compositionStateKeys.pitchGate,
      compositionStateKeys.pitchOctave,
      compositionStateKeys.pitchVolume,
    ],
    takesOutputs: false,
    evaluate: moduleEvaluators['pitch-list'].evaluate,
    render: ({ instanceId, instanceLabel, onOutputsChange }) => (
      <PitchListModule
        instanceId={instanceId}
        instanceLabel={instanceLabel}
        onOutputsChange={onOutputsChange}
      />
    ),
  },
  melodicization: {
    stateKeys: [
      compositionStateKeys.melodicizationAllocation,
      compositionStateKeys.melodicizationPulse,
      compositionStateKeys.melodicizationArticulation,
      compositionStateKeys.melodicizationTempo,
      compositionStateKeys.melodicizationMeter,
      compositionStateKeys.melodicizationVolume,
      compositionStateKeys.melodicizationPianoRollView,
      compositionStateKeys.melodicizationInspector,
    ],
    ports: modulePorts.melodicization,
    takesOutputs: true,
    evaluate: moduleEvaluators['melodicization'].evaluate,
    render: ({
      instanceId,
      instanceLabel,
      active,
      outputs,
      routeState,
      onBind,
      onOutputsChange,
    }) => (
      <MelodicizationModule
        instanceId={instanceId}
        instanceLabel={instanceLabel}
        active={active}
        outputs={outputs}
        routeState={routeState}
        onBind={onBind}
        onOutputsChange={onOutputsChange}
      />
    ),
  },
  arithmetic: {
    stateKeys: [
      compositionStateKeys.arithmeticOperator,
      compositionStateKeys.arithmeticFallbackA,
      compositionStateKeys.arithmeticFallbackB,
      compositionStateKeys.arithmeticCombineStrategy,
      compositionStateKeys.arithmeticModulo,
    ],
    ports: modulePorts.arithmetic,
    takesOutputs: true,
    evaluate: moduleEvaluators['arithmetic'].evaluate,
    render: ({ instanceId, instanceLabel, outputs, routeState, onBind, onOutputsChange }) => (
      <ArithmeticModule
        instanceId={instanceId}
        instanceLabel={instanceLabel}
        outputs={outputs}
        routeState={routeState}
        onBind={onBind}
        onOutputsChange={onOutputsChange}
      />
    ),
  },
  fractioning: {
    stateKeys: [
      compositionStateKeys.fractioningA,
      compositionStateKeys.fractioningB,
      compositionStateKeys.fractioningUnit,
      compositionStateKeys.fractioningVolume,
      compositionStateKeys.fractioningMidiNote,
      compositionStateKeys.fractioningSound,
    ],
    takesOutputs: false,
    evaluate: moduleEvaluators['fractioning'].evaluate,
    render: ({ instanceId, instanceLabel, onOutputsChange }) => (
      <FractioningModule
        instanceId={instanceId}
        instanceLabel={instanceLabel}
        onOutputsChange={onOutputsChange}
      />
    ),
  },
  'pair-composition': {
    stateKeys: [
      compositionStateKeys.pairCompositionA,
      compositionStateKeys.pairCompositionB,
      compositionStateKeys.pairCompositionMode,
      compositionStateKeys.pairCompositionUnit,
      compositionStateKeys.pairCompositionVolume,
      compositionStateKeys.pairCompositionMidiNote,
      compositionStateKeys.pairCompositionSound,
    ],
    takesOutputs: false,
    evaluate: moduleEvaluators['pair-composition'].evaluate,
    render: ({ instanceId, instanceLabel, onOutputsChange }) => (
      <PairCompositionModule
        instanceId={instanceId}
        instanceLabel={instanceLabel}
        onOutputsChange={onOutputsChange}
      />
    ),
  },
  'scale-construction': {
    stateKeys: [
      compositionStateKeys.scaleConstructionIntervals,
      compositionStateKeys.scaleConstructionRoot,
      compositionStateKeys.scaleConstructionPermutationMode,
      `${compositionStateKeys.scaleConstructionIntervals}.text`,
    ],
    takesOutputs: false,
    evaluate: moduleEvaluators['scale-construction'].evaluate,
    render: ({ instanceId, instanceLabel, onOutputsChange }) => (
      <ScaleConstructionModule
        instanceId={instanceId}
        instanceLabel={instanceLabel}
        onOutputsChange={onOutputsChange}
      />
    ),
  },
  'scale-evolution': {
    stateKeys: [
      compositionStateKeys.scaleEvolutionIntervals,
      compositionStateKeys.scaleEvolutionRoot,
    ],
    ports: modulePorts['scale-evolution'],
    takesOutputs: true,
    evaluate: moduleEvaluators['scale-evolution'].evaluate,
    render: ({ instanceId, instanceLabel, outputs, routeState, onBind, onOutputsChange }) => (
      <ScaleEvolutionModule
        instanceId={instanceId}
        instanceLabel={instanceLabel}
        outputs={outputs}
        routeState={routeState}
        onBind={onBind}
        onOutputsChange={onOutputsChange}
      />
    ),
  },
  'rhythm-householder': {
    stateKeys: [
      compositionStateKeys.householderSettings,
      compositionStateKeys.householderSelected,
      compositionStateKeys.householderUnit,
      compositionStateKeys.householderVolume,
      compositionStateKeys.householderSounds,
    ],
    ports: modulePorts['rhythm-householder'],
    takesOutputs: true,
    evaluate: moduleEvaluators['rhythm-householder'].evaluate,
    render: ({ instanceId, instanceLabel, outputs, routeState, onBind, onOutputsChange }) => (
      <HouseholderModule
        instanceId={instanceId}
        instanceLabel={instanceLabel}
        outputs={outputs}
        routeState={routeState}
        onBind={onBind}
        onOutputsChange={onOutputsChange}
      />
    ),
  },
  'swirling-mists': {
    stateKeys: [
      compositionStateKeys.mistSettings,
      compositionStateKeys.mistStep,
      compositionStateKeys.mistGate,
      compositionStateKeys.mistVolume,
      compositionStateKeys.mistViewSpan,
      compositionStateKeys.mistRunSpeed,
    ],
    takesOutputs: false,
    evaluate: moduleEvaluators['swirling-mists'].evaluate,
    render: ({ instanceId, instanceLabel, onOutputsChange }) => (
      <SwirlingMistsModule
        instanceId={instanceId}
        instanceLabel={instanceLabel}
        onOutputsChange={onOutputsChange}
      />
    ),
  },
  mixer: {
    stateKeys: [
      compositionStateKeys.mixerChannels,
      compositionStateKeys.mixerVolume,
      compositionStateKeys.mixerRollView,
      compositionStateKeys.mixerRollMode,
      compositionStateKeys.mixerLaneScale,
    ],
    // The mixer's inlets are its channels, which the receiver's route state owns, so it declares
    // none here; the empty list still marks it as a routed module.
    ports: modulePorts.mixer,
    takesOutputs: true,
    render: ({
      instanceId,
      instanceLabel,
      outputs,
      routeState,
      onBind,
      onAddChannel,
      onRemoveChannel,
    }) => (
      <MixerModule
        instanceId={instanceId}
        instanceLabel={instanceLabel}
        outputs={outputs}
        routeState={routeState}
        onBind={onBind}
        onAddChannel={onAddChannel}
        onRemoveChannel={onRemoveChannel}
      />
    ),
  },
};
