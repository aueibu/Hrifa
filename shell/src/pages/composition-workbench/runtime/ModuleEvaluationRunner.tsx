import { memo, useEffect, useMemo } from 'react';
import type { PublishedCompositionOutput } from '../compositionRouting';
import { useCompositionSettings } from '../compositionSettings';
import {
  createDefaultModuleRouteState,
  type CompositionModuleId,
  type ModuleRouteState,
} from '../compositionWorkspace';
import { useDesk } from '../desk';
import { transportPulse } from '../transport';
import type { EvaluationStore } from './evaluationStore';
import { pickArithmeticInputs } from './evaluators/arithmetic';
import { pickHouseholderInputs } from './evaluators/householder';
import { pickMelodicizationInputs } from './evaluators/melodicization';
import { pickRhythmEditInputs } from './evaluators/rhythmEdit';
import { pickScaleEvolutionInputs } from './evaluators/scaleEvolution';
import type { EvaluatedModuleId } from './moduleEvaluators';
import { moduleRegistry } from './moduleRegistry';
import { defineModuleState, useModuleState, type ModuleStateSpec } from './moduleState';
import { arithmeticState } from './moduleState/arithmetic';
import { fractioningState } from './moduleState/fractioning';
import { householderState } from './moduleState/householder';
import { interferenceState } from './moduleState/interference';
import { melodicizationState } from './moduleState/melodicization';
import { pairCompositionState } from './moduleState/pairComposition';
import { pitchListState } from './moduleState/pitchList';
import { rhythmEditState } from './moduleState/rhythmEdit';
import { rhythmListState } from './moduleState/rhythmList';
import { scaleConstructionState } from './moduleState/scaleConstruction';
import { scaleEvolutionState } from './moduleState/scaleEvolution';
import { swirlingMistsState } from './moduleState/swirlingMists';
import type { OutputStore } from './outputStore';
import { useModuleEvaluation } from './useModuleEvaluation';
import { useOutputs } from './useOutputs';

/** What a module's inputs and context are built from. */
interface RunnerParams {
  instanceId: string;
  instanceLabel: string;
  snippetId: string | undefined;
  routeState: ModuleRouteState;
  /** Every published output; empty for a module that takes none. */
  outputs: PublishedCompositionOutput[];
}

interface RunnerBinding {
  spec: ModuleStateSpec<object>;
  /** A hook: reads the settings, desk or outputs the evaluator takes besides the module's state. */
  useRun(params: RunnerParams): { inputs: object; ctx: object };
}

function bind<S>(spec: ModuleStateSpec<S>, useRun: RunnerBinding['useRun']): RunnerBinding {
  return { spec: spec as unknown as ModuleStateSpec<object>, useRun };
}

const noInputs = {};

function useEdo() {
  return useCompositionSettings().settings.edo;
}

/**
 * Where each evaluated module's inputs come from, in one place. The same values the module view
 * used to gather before it called `useModuleEvaluation`: the module's own state spec, the picked
 * routed outputs (routed modules), the desk clip (Snippet) and the settings (`edo`, the pulse).
 */
const runnerBindings: Record<EvaluatedModuleId, RunnerBinding> = {
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
  // A snippet module keeps nothing of its own: the desk owns the material.
  snippet: bind(
    defineModuleState<object>('snippet', {}),
    ({ instanceId, instanceLabel, snippetId }) => {
      const { snippets } = useDesk();
      return {
        inputs: { snippet: snippets.find((candidate) => candidate.id === snippetId) },
        ctx: { instanceId, instanceLabel },
      };
    }
  ),
};

export interface ModuleEvaluationRunnerProps {
  outputStore: OutputStore;
  evaluationStore: EvaluationStore;
  instanceId: string;
  moduleId: EvaluatedModuleId & CompositionModuleId;
  instanceLabel: string;
  snippetId?: string;
  routeState: ModuleRouteState | undefined;
}

/**
 * The headless half of a placed module: it reads the instance's persisted state from the store, its
 * inputs, evaluates once and publishes, whether or not the module's view is mounted. It also puts
 * the evaluation in the evaluation store for the view to draw. Rendered by the page outside the
 * Stage panels and before them. A source module's runner subscribes to no outputs, so another
 * module's publish does not re-render it.
 */
export const ModuleEvaluationRunner = memo(function ModuleEvaluationRunner({
  outputStore,
  evaluationStore,
  instanceId,
  moduleId,
  instanceLabel,
  snippetId,
  routeState,
}: ModuleEvaluationRunnerProps) {
  const entry = moduleRegistry[moduleId];
  const binding = runnerBindings[moduleId];
  const outputs = useOutputs(outputStore, entry.takesOutputs);
  const resolvedRouteState = useMemo(
    () => routeState ?? createDefaultModuleRouteState(entry.ports ?? []),
    [entry.ports, routeState]
  );
  const [state] = useModuleState(binding.spec, instanceId);
  const { inputs, ctx } = binding.useRun({
    instanceId,
    instanceLabel,
    snippetId,
    routeState: resolvedRouteState,
    outputs,
  });
  const evaluation = useModuleEvaluation(
    moduleId,
    state as never,
    inputs as never,
    ctx as never,
    outputStore.publish
  );
  // Written while rendering so a view rendered after this runner in the same pass reads it at once;
  // the effect tells readers that already rendered an older value. Safe while every store-driven
  // update is synchronous; a discarded transition render could leave an uncommitted evaluation here.
  evaluationStore.put(instanceId, moduleId, evaluation);
  useEffect(() => {
    evaluationStore.notify(instanceId);
  }, [evaluationStore, instanceId, evaluation]);
  return null;
});
