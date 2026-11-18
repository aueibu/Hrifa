import type { PublishedCompositionOutput } from '../../compositionRouting';
import type { DataPacket } from '../../model';
import {
  generatePairComposition,
  pairCompositionDurationPacket,
  pairCompositionSegmentPackets,
  type PairCompositionMode,
  type PairCompositionResult,
} from '../../pairComposition';

/** The persisted values the output depends on (preview sound and volume do not). */
export interface PairCompositionState {
  a: number | string;
  b: number | string;
  mode: PairCompositionMode;
}

export type PairCompositionInputs = Record<string, never>;

export interface PairCompositionContext {
  instanceId: string;
  instanceLabel: string;
}

/** What the label does not touch: a rename keeps this object, and its packets, as it is. */
export interface PairCompositionCore {
  generated:
    | { result: PairCompositionResult; error?: undefined }
    | { result?: undefined; error: string };
  outputPacket: DataPacket | undefined;
  segmentPackets: ReturnType<typeof pairCompositionSegmentPackets>;
}

export type PairCompositionEvaluation = PairCompositionCore & {
  outputs: PublishedCompositionOutput[];
};

/** Pair Composition: the combined durations and one packet per segment. Takes no label. */
export function computePairComposition(
  state: PairCompositionState,
  _inputs: PairCompositionInputs,
  ctx: Omit<PairCompositionContext, 'instanceLabel'>
): PairCompositionCore {
  let generated: PairCompositionCore['generated'];
  try {
    generated = {
      result: generatePairComposition(Number(state.a), Number(state.b), state.mode),
    };
  } catch (error) {
    generated = { error: error instanceof Error ? error.message : 'Could not compose this pair.' };
  }
  return {
    generated,
    outputPacket: generated.result
      ? pairCompositionDurationPacket(generated.result, ctx.instanceId)
      : undefined,
    segmentPackets: generated.result
      ? pairCompositionSegmentPackets(generated.result, ctx.instanceId)
      : [],
  };
}

/** The published `combined` output, then one output per segment. */
export function pairCompositionOutputs(
  core: PairCompositionCore,
  ctx: Pick<PairCompositionContext, 'instanceId' | 'instanceLabel'>
): PublishedCompositionOutput[] {
  const { instanceId, instanceLabel } = ctx;
  return [
    ...(core.outputPacket
      ? [
          {
            ref: { instanceId, port: 'combined' },
            label: `${instanceLabel} · Combined`,
            packet: core.outputPacket,
          },
        ]
      : []),
    ...core.segmentPackets.map(({ port, label, packet }) => ({
      ref: { instanceId, port },
      label: `${instanceLabel} · ${label}`,
      packet,
    })),
  ];
}

export function evaluatePairComposition(
  state: PairCompositionState,
  inputs: PairCompositionInputs,
  ctx: PairCompositionContext
): PairCompositionEvaluation {
  const core = computePairComposition(state, inputs, ctx);
  return { ...core, outputs: pairCompositionOutputs(core, ctx) };
}
