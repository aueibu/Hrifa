import {
  boundOutput,
  resolvePacketFromOutput,
  type PublishedCompositionOutput,
} from '../../compositionRouting';
import type { NodeRouteBinding, NodeRouteState } from '../../compositionWorkspace';
import type { DataPacket } from '../../model';
import {
  evolveScale,
  finalPitchClassesPacket,
  finalStagePacket,
  scaleEvolutionStagesPacket,
  stagePitchClassesPacket,
  type ScaleEvolutionResult,
} from '../../scaleEvolution';
import { createMemo, type Memo } from '../memo';

/** The persisted values the outputs depend on. */
export interface ScaleEvolutionState {
  intervalText: string;
  root: number;
}

/**
 * What Scale Evolution reads from upstream: the bound output and the route binding of its
 * `sequence` port, picked by `pickScaleEvolutionInputs` so they keep their identity when an
 * unrelated output changes (otherwise the node's own publish would re-run it forever).
 */
export interface ScaleEvolutionInputs {
  sequenceOutput: PublishedCompositionOutput | undefined;
  binding: NodeRouteBinding | undefined;
}

export interface ScaleEvolutionContext {
  instanceId: string;
  instanceLabel: string;
  edo: number;
}

/** What the label does not touch: a rename keeps this object, and its packets, as it is. */
export interface ScaleEvolutionCore {
  resolvedSequence: DataPacket | undefined;
  sourceIntervals: number[];
  generated:
    | { result: ScaleEvolutionResult; error?: undefined }
    | { result?: undefined; error: string };
  stagesPacket: DataPacket | undefined;
  finalPacket: DataPacket | undefined;
  stagePitchesPacket: DataPacket | undefined;
  finalPitchesPacket: DataPacket | undefined;
}

export type ScaleEvolutionEvaluation = ScaleEvolutionCore & {
  outputs: PublishedCompositionOutput[];
};

/** Typed fallback: positive whole numbers split on spaces, commas and plus signs. */
export function parseEvolutionIntervalText(value: string): number[] {
  return value
    .split(/[\s,+]+/)
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
}

/**
 * Resolves the `sequence` port. A binding pointing at this same instance (stale data) would feed
 * the node's own output back into itself, so it reads as disconnected.
 */
export function pickScaleEvolutionInputs(
  outputs: PublishedCompositionOutput[],
  routeState: NodeRouteState,
  instanceId: string
): ScaleEvolutionInputs {
  const binding = routeState.sequence;
  return {
    sequenceOutput:
      binding?.source?.instanceId === instanceId
        ? undefined
        : boundOutput(outputs, binding?.source),
    binding,
  };
}

/** Scale Evolution: evolves the connected (or typed) interval sequence. Takes no label. */
export function computeScaleEvolution(
  state: ScaleEvolutionState,
  inputs: ScaleEvolutionInputs,
  ctx: Omit<ScaleEvolutionContext, 'instanceLabel'>,
  memo: Memo = createMemo()
): ScaleEvolutionCore {
  const { instanceId, edo } = ctx;
  const { binding } = inputs;
  const hasConnection = Boolean(binding?.source && binding.source.instanceId !== instanceId);
  // Each part depends only on what it did before the evaluator existed (see ScaleConstruction).
  const sequenceIndex = binding?.source?.index;
  const resolvedSequence = memo(
    'resolved',
    [hasConnection, inputs.sequenceOutput, sequenceIndex, instanceId],
    () =>
      hasConnection
        ? resolvePacketFromOutput(
            inputs.sequenceOutput,
            sequenceIndex,
            `route:${instanceId}:sequence`
          )
        : undefined
  );
  const fallbackIntervals = memo('fallback', [state.intervalText], () =>
    parseEvolutionIntervalText(state.intervalText)
  );
  const sourceIntervals = memo('source', [resolvedSequence, fallbackIntervals], () =>
    resolvedSequence ? resolvedSequence.items.map((item) => Number(item.value)) : fallbackIntervals
  );
  const generated = memo('generated', [sourceIntervals], (): ScaleEvolutionCore['generated'] => {
    if (!sourceIntervals.length) {
      return { error: 'Enter or connect one or more positive whole-number intervals.' };
    }
    try {
      return { result: evolveScale(sourceIntervals) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Could not evolve this scale.' };
    }
  });
  const result = generated.result;
  const root = Number(state.root);
  return {
    resolvedSequence,
    sourceIntervals,
    generated,
    stagesPacket: memo('stages', [result, instanceId], () =>
      result ? scaleEvolutionStagesPacket(result, instanceId) : undefined
    ),
    finalPacket: memo('final', [result, instanceId], () =>
      result ? finalStagePacket(result, instanceId) : undefined
    ),
    stagePitchesPacket: memo('stagePitches', [result, root, instanceId, edo], () =>
      result ? stagePitchClassesPacket(result, root, instanceId, edo) : undefined
    ),
    finalPitchesPacket: memo('finalPitches', [result, root, instanceId, edo], () =>
      result ? finalPitchClassesPacket(result, root, instanceId, edo) : undefined
    ),
  };
}

/** The published `stages`, `final`, `stagePitches` and `finalPitches` outputs, when valid. */
export function scaleEvolutionOutputs(
  core: ScaleEvolutionCore,
  ctx: Pick<ScaleEvolutionContext, 'instanceId' | 'instanceLabel'>
): PublishedCompositionOutput[] {
  const { instanceId, instanceLabel } = ctx;
  const entries: [string, string, DataPacket | undefined][] = [
    ['stages', 'Stages', core.stagesPacket],
    ['final', 'Final', core.finalPacket],
    ['stagePitches', 'Stage Pitches', core.stagePitchesPacket],
    ['finalPitches', 'Final Pitches', core.finalPitchesPacket],
  ];
  const list: PublishedCompositionOutput[] = [];
  for (const [port, name, packet] of entries) {
    if (packet) {
      list.push({ ref: { instanceId, port }, label: `${instanceLabel} · ${name}`, packet });
    }
  }
  return list;
}

export function evaluateScaleEvolution(
  state: ScaleEvolutionState,
  inputs: ScaleEvolutionInputs,
  ctx: ScaleEvolutionContext
): ScaleEvolutionEvaluation {
  const core = computeScaleEvolution(state, inputs, ctx);
  return { ...core, outputs: scaleEvolutionOutputs(core, ctx) };
}
