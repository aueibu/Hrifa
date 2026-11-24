import type { PublishedCompositionOutput } from '../compositionRouting';
import {
  arithmeticOutputs,
  computeArithmeticNode,
  evaluateArithmetic,
} from './evaluators/arithmetic';
import {
  computeDataBlockSource,
  evaluateDataBlockSource,
  dataBlockSourceOutputs,
} from './evaluators/dataBlockSource';
import {
  computeFractioning,
  evaluateFractioning,
  fractioningOutputs,
} from './evaluators/fractioning';
import {
  computeHouseholder,
  evaluateHouseholder,
  householderOutputs,
} from './evaluators/householder';
import {
  computeInterference,
  evaluateInterference,
  interferenceOutputs,
} from './evaluators/interference';
import {
  computeMelodicization,
  evaluateMelodicization,
  melodicizationOutputs,
} from './evaluators/melodicization';
import {
  computePairComposition,
  evaluatePairComposition,
  pairCompositionOutputs,
} from './evaluators/pairComposition';
import { computePitchList, evaluatePitchList, pitchListOutputs } from './evaluators/pitchList';
import { computeRhythmEdit, evaluateRhythmEdit, rhythmEditOutputs } from './evaluators/rhythmEdit';
import { computeRhythmList, evaluateRhythmList, rhythmListOutputs } from './evaluators/rhythmList';
import {
  computeScaleConstruction,
  evaluateScaleConstruction,
  scaleConstructionOutputs,
} from './evaluators/scaleConstruction';
import {
  computeScaleEvolution,
  evaluateScaleEvolution,
  scaleEvolutionOutputs,
} from './evaluators/scaleEvolution';
import {
  computeSwirlingMists,
  evaluateSwirlingMists,
  swirlingMistsOutputs,
} from './evaluators/swirlingMists';

/** What every evaluator returns: the outputs to publish, plus any values its display reads. */
export interface NodeEvaluation {
  outputs: PublishedCompositionOutput[];
}

/** A pure `(state, inputs, ctx) -> evaluation`. No React, storage or `window`. */
export type NodeEvaluator = (state: never, inputs: never, ctx: never) => NodeEvaluation;

/**
 * A node's evaluator in two steps, so a rename does not rebuild the packet: `compute` takes no
 * label and returns the core (the packet and the display values); `outputs` wraps the core's
 * packets with `{ ref, label }`. `evaluate` is the two together.
 */
export interface NodeEvaluatorParts {
  compute(state: never, inputs: never, ctx: never): object;
  outputs(core: never, ctx: never): PublishedCompositionOutput[];
  evaluate: NodeEvaluator;
}

/**
 * The evaluators of the ported nodes, by node id. Not React: `nodeRegistry.tsx` references
 * `evaluate` as each entry's `evaluate`, and `useNodeEvaluation` runs `compute` and `outputs`
 * from here, so a component never has to import the registry (which imports the components).
 */
export const nodeEvaluators = {
  'pitch-list': {
    compute: computePitchList,
    outputs: pitchListOutputs,
    evaluate: evaluatePitchList,
  },
  'rhythm-list': {
    compute: computeRhythmList,
    outputs: rhythmListOutputs,
    evaluate: evaluateRhythmList,
  },
  arithmetic: {
    compute: computeArithmeticNode,
    outputs: arithmeticOutputs,
    evaluate: evaluateArithmetic,
  },
  fractioning: {
    compute: computeFractioning,
    outputs: fractioningOutputs,
    evaluate: evaluateFractioning,
  },
  'pair-composition': {
    compute: computePairComposition,
    outputs: pairCompositionOutputs,
    evaluate: evaluatePairComposition,
  },
  'scale-construction': {
    compute: computeScaleConstruction,
    outputs: scaleConstructionOutputs,
    evaluate: evaluateScaleConstruction,
  },
  'scale-evolution': {
    compute: computeScaleEvolution,
    outputs: scaleEvolutionOutputs,
    evaluate: evaluateScaleEvolution,
  },
  interference: {
    compute: computeInterference,
    outputs: interferenceOutputs,
    evaluate: evaluateInterference,
  },
  'swirling-mists': {
    compute: computeSwirlingMists,
    outputs: swirlingMistsOutputs,
    evaluate: evaluateSwirlingMists,
  },
  'rhythm-householder': {
    compute: computeHouseholder,
    outputs: householderOutputs,
    evaluate: evaluateHouseholder,
  },
  'rhythm-edit': {
    compute: computeRhythmEdit,
    outputs: rhythmEditOutputs,
    evaluate: evaluateRhythmEdit,
  },
  melodicization: {
    compute: computeMelodicization,
    outputs: melodicizationOutputs,
    evaluate: evaluateMelodicization,
  },
  'data-block-source': {
    compute: computeDataBlockSource,
    outputs: dataBlockSourceOutputs,
    evaluate: evaluateDataBlockSource,
  },
} satisfies Record<string, NodeEvaluatorParts>;

export type EvaluatedNodeId = keyof typeof nodeEvaluators;
