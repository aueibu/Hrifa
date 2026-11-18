import type { PublishedCompositionOutput } from '../../compositionRouting';
import type { DataPacket } from '../../model';
import {
  generateMelodicFamilies,
  melodicFormsPacket,
  realizeScale,
  scalePitchClassPacket,
  scaleSequence,
  scaleSequencePacket,
  type MelodicFamily,
  type ScaleSequence,
} from '../../scaleConstruction';
import { createMemo, type Memo } from '../memo';

/** The persisted values the outputs depend on (the typed interval text does not). */
export interface ScaleConstructionState {
  intervals: number[];
  root: number;
  permutationMode: 'general' | 'circular';
}

export type ScaleConstructionInputs = Record<string, never>;

export interface ScaleConstructionContext {
  instanceId: string;
  instanceLabel: string;
  edo: number;
}

/** What the label does not touch: a rename keeps this object, and its packets, as it is. */
export interface ScaleConstructionCore {
  generated: { result: ScaleSequence; error?: undefined } | { result?: undefined; error: string };
  sequencePacket: DataPacket | undefined;
  melodicFormsOutput: DataPacket | undefined;
  pitchClassOutput: DataPacket | undefined;
  families: MelodicFamily[];
  offsets: number[];
}

export type ScaleConstructionEvaluation = ScaleConstructionCore & {
  outputs: PublishedCompositionOutput[];
};

/** Scale Construction: the sequence, its melodic forms and the realized pitch classes. */
export function computeScaleConstruction(
  state: ScaleConstructionState,
  _inputs: ScaleConstructionInputs,
  ctx: Omit<ScaleConstructionContext, 'instanceLabel'>,
  memo: Memo = createMemo()
): ScaleConstructionCore {
  const { intervals, permutationMode } = state;
  const { instanceId, edo } = ctx;
  // Each part depends only on what it did before the evaluator existed, so a root or EDO change
  // rebuilds the pitch classes and keeps the sequence, forms and families as they were.
  const generated = memo('generated', [intervals], (): ScaleConstructionCore['generated'] => {
    try {
      return { result: scaleSequence(intervals) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Could not construct a scale.' };
    }
  });
  const result = generated.result;
  const root = Number(state.root);
  return {
    generated,
    sequencePacket: memo('sequence', [result, instanceId], () =>
      result ? scaleSequencePacket(result, instanceId) : undefined
    ),
    melodicFormsOutput: memo('forms', [result, intervals, permutationMode, instanceId], () =>
      result ? melodicFormsPacket(intervals, permutationMode, instanceId) : undefined
    ),
    pitchClassOutput: memo('pitchClasses', [result, intervals, root, instanceId, edo], () =>
      result ? scalePitchClassPacket(intervals, root, instanceId, edo) : undefined
    ),
    families: memo('families', [result, intervals, permutationMode], () =>
      result ? generateMelodicFamilies(intervals, permutationMode) : []
    ),
    offsets: memo('offsets', [intervals, root], () => realizeScale(intervals, root)),
  };
}

/** The published `sequence`, `melodicForms` and `pitchClasses` outputs, when valid. */
export function scaleConstructionOutputs(
  core: ScaleConstructionCore,
  ctx: Pick<ScaleConstructionContext, 'instanceId' | 'instanceLabel'>
): PublishedCompositionOutput[] {
  const { instanceId, instanceLabel } = ctx;
  const outputs: PublishedCompositionOutput[] = [];
  if (core.sequencePacket) {
    outputs.push({
      ref: { instanceId, port: 'sequence' },
      label: `${instanceLabel} · Sequence`,
      packet: core.sequencePacket,
    });
  }
  if (core.melodicFormsOutput) {
    outputs.push({
      ref: { instanceId, port: 'melodicForms' },
      label: `${instanceLabel} · Melodic Forms`,
      packet: core.melodicFormsOutput,
    });
  }
  if (core.pitchClassOutput) {
    outputs.push({
      ref: { instanceId, port: 'pitchClasses' },
      label: `${instanceLabel} · Pitch Classes`,
      packet: core.pitchClassOutput,
    });
  }
  return outputs;
}

export function evaluateScaleConstruction(
  state: ScaleConstructionState,
  inputs: ScaleConstructionInputs,
  ctx: ScaleConstructionContext
): ScaleConstructionEvaluation {
  const core = computeScaleConstruction(state, inputs, ctx);
  return { ...core, outputs: scaleConstructionOutputs(core, ctx) };
}
