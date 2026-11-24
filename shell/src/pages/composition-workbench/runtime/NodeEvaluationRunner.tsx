import { memo, useEffect, useMemo } from 'react';
import type { PublishedCompositionOutput } from '../compositionRouting';
import { useCompositionSettings } from '../compositionSettings';
import {
  createDefaultNodeRouteState,
  type CompositionNodeId,
  type NodeRouteState,
} from '../compositionWorkspace';
import { useDesk } from '../desk';
import { transportPulse } from '../transport';
import type { EvaluationStore } from './evaluationStore';
import { pickArithmeticInputs } from './evaluators/arithmetic';
import { pickHouseholderInputs } from './evaluators/householder';
import { pickMelodicizationInputs } from './evaluators/melodicization';
import { pickRhythmEditInputs } from './evaluators/rhythmEdit';
import { pickScaleEvolutionInputs } from './evaluators/scaleEvolution';
import type { EvaluatedNodeId } from './nodeEvaluators';
import { nodeRegistry } from './nodeRegistry';
import { defineNodeState, useNodeState, type NodeStateSpec } from './nodeState';
import { arithmeticState } from './nodeState/arithmetic';
import { fractioningState } from './nodeState/fractioning';
import { householderState } from './nodeState/householder';
import { interferenceState } from './nodeState/interference';
import { melodicizationState } from './nodeState/melodicization';
import { pairCompositionState } from './nodeState/pairComposition';
import { pitchListState } from './nodeState/pitchList';
import { rhythmEditState } from './nodeState/rhythmEdit';
import { rhythmListState } from './nodeState/rhythmList';
import { scaleConstructionState } from './nodeState/scaleConstruction';
import { scaleEvolutionState } from './nodeState/scaleEvolution';
import { swirlingMistsState } from './nodeState/swirlingMists';
import type { OutputStore } from './outputStore';
import { useNodeEvaluation } from './useNodeEvaluation';
import { useOutputs } from './useOutputs';

/** What a node's inputs and context are built from. */
interface RunnerParams {
  instanceId: string;
  instanceLabel: string;
  dataBlockId: string | undefined;
  routeState: NodeRouteState;
  /** Every published output; empty for a node that takes none. */
  outputs: PublishedCompositionOutput[];
}

interface RunnerBinding {
  spec: NodeStateSpec<object>;
  /** A hook: reads the settings, desk or outputs the evaluator takes besides the node's state. */
  useRun(params: RunnerParams): { inputs: object; ctx: object };
}

function bind<S>(spec: NodeStateSpec<S>, useRun: RunnerBinding['useRun']): RunnerBinding {
  return { spec: spec as unknown as NodeStateSpec<object>, useRun };
}

const noInputs = {};

function useEdo() {
  return useCompositionSettings().settings.edo;
}

/**
 * Where each evaluated node's inputs come from, in one place. The same values the node view
 * used to gather before it called `useNodeEvaluation`: the node's own state spec, the picked
 * routed outputs (routed nodes), the desk data-block (Data-block) and the settings (`edo`, the pulse).
 */
const runnerBindings: Record<EvaluatedNodeId, RunnerBinding> = {
  'pitch-list': bind(pitchListState, ({ instanceId, instanceLabel }) => ({
    inputs: { upstream: undefined },
    ctx: { instanceId, instanceLabel, edo: useEdo() },
  })),
  'rhythm-list': bind(rhythmListState, ({ instanceId, instanceLabel }) => ({
    inputs: noInputs,
    ctx: { instanceId, instanceLabel },
  })),
  arithmetic: bind(arithmeticState, ({ instanceId, instanceLabel, outputs, routeState }) => ({
    inputs: pickArithmeticInputs(outputs, routeState, instanceId),
    ctx: { instanceId, instanceLabel, edo: useEdo() },
  })),
  fractioning: bind(fractioningState, ({ instanceId, instanceLabel }) => ({
    inputs: noInputs,
    ctx: { instanceId, instanceLabel },
  })),
  'pair-composition': bind(pairCompositionState, ({ instanceId, instanceLabel }) => ({
    inputs: noInputs,
    ctx: { instanceId, instanceLabel },
  })),
  'scale-construction': bind(scaleConstructionState, ({ instanceId, instanceLabel }) => ({
    inputs: noInputs,
    ctx: { instanceId, instanceLabel, edo: useEdo() },
  })),
  'scale-evolution': bind(
    scaleEvolutionState,
    ({ instanceId, instanceLabel, outputs, routeState }) => ({
      inputs: pickScaleEvolutionInputs(outputs, routeState, instanceId),
      ctx: { instanceId, instanceLabel, edo: useEdo() },
    })
  ),
  interference: bind(interferenceState, ({ instanceId, instanceLabel }) => ({
    inputs: noInputs,
    ctx: { instanceId, instanceLabel },
  })),
  'swirling-mists': bind(swirlingMistsState, ({ instanceId, instanceLabel }) => ({
    inputs: noInputs,
    ctx: { instanceId, instanceLabel },
  })),
  'rhythm-householder': bind(
    householderState,
    ({ instanceId, instanceLabel, outputs, routeState }) => ({
      inputs: pickHouseholderInputs(outputs, routeState, instanceId),
      ctx: { instanceId, instanceLabel, edo: useEdo() },
    })
  ),
  'rhythm-edit': bind(rhythmEditState, ({ instanceId, instanceLabel, outputs, routeState }) => ({
    inputs: pickRhythmEditInputs(outputs, routeState, instanceId),
    ctx: { instanceId, instanceLabel, edo: useEdo() },
  })),
  melodicization: bind(
    melodicizationState,
    ({ instanceId, instanceLabel, outputs, routeState }) => {
      const { settings } = useCompositionSettings();
      return {
        inputs: pickMelodicizationInputs(outputs, routeState, instanceId),
        ctx: {
          instanceId,
          instanceLabel,
          edo: settings.edo,
          pulseUnit: transportPulse(settings.transport).duration,
        },
      };
    }
  ),
  // A data-block-source node keeps nothing of its own: the desk owns the material.
  'data-block-source': bind(
    defineNodeState<object>('data-block-source', {}),
    ({ instanceId, instanceLabel, dataBlockId }) => {
      const { dataBlocks } = useDesk();
      return {
        inputs: { dataBlock: dataBlocks.find((candidate) => candidate.id === dataBlockId) },
        ctx: { instanceId, instanceLabel },
      };
    }
  ),
};

export interface NodeEvaluationRunnerProps {
  outputStore: OutputStore;
  evaluationStore: EvaluationStore;
  instanceId: string;
  nodeId: EvaluatedNodeId & CompositionNodeId;
  instanceLabel: string;
  dataBlockId?: string;
  routeState: NodeRouteState | undefined;
}

/**
 * The headless half of a placed node: it reads the instance's persisted state from the store, its
 * inputs, evaluates once and publishes, whether or not the node's view is mounted. It also puts
 * the evaluation in the evaluation store for the view to draw. Rendered by the page outside the
 * Stage panels and before them. A source node's runner subscribes to no outputs, so another
 * node's publish does not re-render it.
 */
export const NodeEvaluationRunner = memo(function NodeEvaluationRunner({
  outputStore,
  evaluationStore,
  instanceId,
  nodeId,
  instanceLabel,
  dataBlockId,
  routeState,
}: NodeEvaluationRunnerProps) {
  const entry = nodeRegistry[nodeId];
  const binding = runnerBindings[nodeId];
  const outputs = useOutputs(outputStore, entry.takesOutputs);
  const resolvedRouteState = useMemo(
    () => routeState ?? createDefaultNodeRouteState(entry.ports ?? []),
    [entry.ports, routeState]
  );
  const [state] = useNodeState(binding.spec, instanceId);
  const { inputs, ctx } = binding.useRun({
    instanceId,
    instanceLabel,
    dataBlockId,
    routeState: resolvedRouteState,
    outputs,
  });
  const evaluation = useNodeEvaluation(
    nodeId,
    state as never,
    inputs as never,
    ctx as never,
    outputStore.publish
  );
  // Written while rendering so a view rendered after this runner in the same pass reads it at once;
  // the effect tells readers that already rendered an older value. Safe while every store-driven
  // update is synchronous; a discarded transition render could leave an uncommitted evaluation here.
  evaluationStore.put(instanceId, nodeId, evaluation);
  useEffect(() => {
    evaluationStore.notify(instanceId);
  }, [evaluationStore, instanceId, evaluation]);
  return null;
});
