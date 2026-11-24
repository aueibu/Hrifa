import type { ReactElement } from 'react';
import { ArithmeticNode } from '../components/ArithmeticNode';
import { DataBlockSourceNode } from '../components/DataBlockSourceNode';
import { FractioningNode } from '../components/FractioningNode';
import { HouseholderNode } from '../components/HouseholderNode';
import { InterferenceNode } from '../components/InterferenceNode';
import { MelodicizationNode } from '../components/MelodicizationNode';
import { MixerNode } from '../components/MixerNode';
import { PairCompositionNode } from '../components/PairCompositionNode';
import { PitchListNode } from '../components/PitchListNode';
import { RhythmEditNode } from '../components/RhythmEditNode';
import { RhythmListNode } from '../components/RhythmListNode';
import { ScaleConstructionNode } from '../components/ScaleConstructionNode';
import { ScaleEvolutionNode } from '../components/ScaleEvolutionNode';
import { SwirlingMistsNode } from '../components/SwirlingMistsNode';
import type { CompositionOutputRef, PublishedCompositionOutput } from '../compositionRouting';
import type { CompositionNodeId, NodeRouteState } from '../compositionWorkspace';
import { compositionStateKeys } from '../usePersistentState';
import { nodeEvaluators, type NodeEvaluator } from './nodeEvaluators';
import { nodePorts, type NodePort } from './nodePorts';

/** What a node's `render` gets. A node takes only the subset it declares today. */
export interface NodeRenderProps {
  instanceId: string;
  instanceLabel: string;
  /** The desk data-block a data-block source node reads. */
  dataBlockId?: string;
  /** Whether this instance is the one shown (Melodicization still takes it as a prop). */
  active: boolean;
  /** Every published output; empty unless the node's entry has `takesOutputs`. */
  outputs: PublishedCompositionOutput[];
  routeState: NodeRouteState;
  onBind(port: string, source: CompositionOutputRef | null): void;
  onAddChannel(): void;
  onRemoveChannel(port: string): void;
}

export interface NodeRegistryEntry {
  /** The persistent-state base keys this node stores per instance (cleared when it is deleted). */
  stateKeys: string[];
  /** Inlets of a routed node (the mixer's empty list still means routed). Absent: not routed. */
  ports?: NodePort[];
  /** True for a node that reads the published outputs (a routed node). Source nodes do not. */
  takesOutputs: boolean;
  /**
   * The node's pure state-to-outputs function, when it has been ported (R2). Its headless runner
   * (`NodeEvaluationRunner`) runs it through `useNodeEvaluation`, which publishes the outputs, whether
   * or not the view is mounted; the view reads the result (`useNodeEvaluationResult`).
   */
  evaluate?: NodeEvaluator;
  render(props: NodeRenderProps): ReactElement;
}

/**
 * The one place a node is declared: its stored state, its inlets and how the page renders it.
 * Adding a node is one entry here (plus its id in `compositionWorkspace.ts`).
 */
export const nodeRegistry: Record<CompositionNodeId, NodeRegistryEntry> = {
  'data-block-source': {
    // A data-block node keeps nothing of its own: the desk owns the material.
    stateKeys: [],
    takesOutputs: false,
    evaluate: nodeEvaluators['data-block-source'].evaluate,
    render: ({ instanceId, instanceLabel, dataBlockId }) => (
      <DataBlockSourceNode
        instanceId={instanceId}
        instanceLabel={instanceLabel}
        dataBlockId={dataBlockId}
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
    evaluate: nodeEvaluators['interference'].evaluate,
    render: ({ instanceId, instanceLabel }) => (
      <InterferenceNode instanceId={instanceId} instanceLabel={instanceLabel} />
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
    ports: nodePorts['rhythm-edit'],
    takesOutputs: true,
    evaluate: nodeEvaluators['rhythm-edit'].evaluate,
    render: ({ instanceId, instanceLabel, outputs, routeState, onBind }) => (
      <RhythmEditNode
        instanceId={instanceId}
        instanceLabel={instanceLabel}
        outputs={outputs}
        routeState={routeState}
        onBind={onBind}
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
    evaluate: nodeEvaluators['rhythm-list'].evaluate,
    render: ({ instanceId, instanceLabel }) => (
      <RhythmListNode instanceId={instanceId} instanceLabel={instanceLabel} />
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
    evaluate: nodeEvaluators['pitch-list'].evaluate,
    render: ({ instanceId, instanceLabel }) => (
      <PitchListNode instanceId={instanceId} instanceLabel={instanceLabel} />
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
    ports: nodePorts.melodicization,
    takesOutputs: true,
    evaluate: nodeEvaluators['melodicization'].evaluate,
    render: ({ instanceId, instanceLabel, active, outputs, routeState, onBind }) => (
      <MelodicizationNode
        instanceId={instanceId}
        instanceLabel={instanceLabel}
        active={active}
        outputs={outputs}
        routeState={routeState}
        onBind={onBind}
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
    ports: nodePorts.arithmetic,
    takesOutputs: true,
    evaluate: nodeEvaluators['arithmetic'].evaluate,
    render: ({ instanceId, instanceLabel, outputs, routeState, onBind }) => (
      <ArithmeticNode
        instanceId={instanceId}
        instanceLabel={instanceLabel}
        outputs={outputs}
        routeState={routeState}
        onBind={onBind}
      />
    ),
  },
  fractioning: {
    stateKeys: [
      compositionStateKeys.fractioningA,
      compositionStateKeys.fractioningB,
      compositionStateKeys.fractioningUnit,
      compositionStateKeys.fractioningVolume,
      compositionStateKeys.fractioningSound,
    ],
    takesOutputs: false,
    evaluate: nodeEvaluators['fractioning'].evaluate,
    render: ({ instanceId, instanceLabel }) => (
      <FractioningNode instanceId={instanceId} instanceLabel={instanceLabel} />
    ),
  },
  'pair-composition': {
    stateKeys: [
      compositionStateKeys.pairCompositionA,
      compositionStateKeys.pairCompositionB,
      compositionStateKeys.pairCompositionMode,
      compositionStateKeys.pairCompositionUnit,
      compositionStateKeys.pairCompositionVolume,
      compositionStateKeys.pairCompositionSound,
    ],
    takesOutputs: false,
    evaluate: nodeEvaluators['pair-composition'].evaluate,
    render: ({ instanceId, instanceLabel }) => (
      <PairCompositionNode instanceId={instanceId} instanceLabel={instanceLabel} />
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
    evaluate: nodeEvaluators['scale-construction'].evaluate,
    render: ({ instanceId, instanceLabel }) => (
      <ScaleConstructionNode instanceId={instanceId} instanceLabel={instanceLabel} />
    ),
  },
  'scale-evolution': {
    stateKeys: [
      compositionStateKeys.scaleEvolutionIntervals,
      compositionStateKeys.scaleEvolutionRoot,
    ],
    ports: nodePorts['scale-evolution'],
    takesOutputs: true,
    evaluate: nodeEvaluators['scale-evolution'].evaluate,
    render: ({ instanceId, instanceLabel, outputs, routeState, onBind }) => (
      <ScaleEvolutionNode
        instanceId={instanceId}
        instanceLabel={instanceLabel}
        outputs={outputs}
        routeState={routeState}
        onBind={onBind}
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
    ports: nodePorts['rhythm-householder'],
    takesOutputs: true,
    evaluate: nodeEvaluators['rhythm-householder'].evaluate,
    render: ({ instanceId, instanceLabel, outputs, routeState, onBind }) => (
      <HouseholderNode
        instanceId={instanceId}
        instanceLabel={instanceLabel}
        outputs={outputs}
        routeState={routeState}
        onBind={onBind}
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
    evaluate: nodeEvaluators['swirling-mists'].evaluate,
    render: ({ instanceId, instanceLabel }) => (
      <SwirlingMistsNode instanceId={instanceId} instanceLabel={instanceLabel} />
    ),
  },
  mixer: {
    stateKeys: [
      compositionStateKeys.mixerChannels,
      compositionStateKeys.mixerVolume,
      compositionStateKeys.mixerRollView,
      compositionStateKeys.mixerRollMode,
      compositionStateKeys.mixerChannelScale,
    ],
    // The mixer's inlets are its channels, which the receiver's route state owns, so it declares
    // none here; the empty list still marks it as a routed node.
    ports: nodePorts.mixer,
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
      <MixerNode
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
