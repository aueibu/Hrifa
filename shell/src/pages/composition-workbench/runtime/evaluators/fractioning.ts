import type { PublishedCompositionOutput } from '../../compositionRouting';
import {
  fractioningDurationPacket,
  generateFractioning,
  type FractioningResult,
} from '../../fractioning';
import type { DataPacket } from '../../model';

/** The persisted values the output depends on (preview sound and volume do not). */
export interface FractioningState {
  a: number | string;
  b: number | string;
}

export type FractioningInputs = Record<string, never>;

export interface FractioningContext {
  instanceId: string;
  instanceLabel: string;
}

/** What the label does not touch: a rename keeps this object, and its packet, as it is. */
export interface FractioningCore {
  generated:
    | { result: FractioningResult; error?: undefined }
    | { result?: undefined; error: string };
  outputPacket: DataPacket | undefined;
}

export type FractioningEvaluation = FractioningCore & { outputs: PublishedCompositionOutput[] };

/** Fractioning: the resultant of a÷b, or the generator's error message. Takes no label. */
export function computeFractioning(
  state: FractioningState,
  _inputs: FractioningInputs,
  ctx: Omit<FractioningContext, 'instanceLabel'>
): FractioningCore {
  const a = Number(state.a);
  const b = Number(state.b);
  let generated: FractioningCore['generated'];
  try {
    generated = { result: generateFractioning(a, b) };
  } catch (error) {
    generated = {
      error: error instanceof Error ? error.message : 'Could not generate a fractioning resultant.',
    };
  }
  const outputPacket = generated.result
    ? fractioningDurationPacket(generated.result, a, b, ctx.instanceId)
    : undefined;
  return { generated, outputPacket };
}

/** The published `resultant` output (none while the generators are invalid). */
export function fractioningOutputs(
  core: FractioningCore,
  ctx: Pick<FractioningContext, 'instanceId' | 'instanceLabel'>
): PublishedCompositionOutput[] {
  return core.outputPacket
    ? [
        {
          ref: { instanceId: ctx.instanceId, port: 'resultant' },
          label: `${ctx.instanceLabel} · Resultant`,
          packet: core.outputPacket,
        },
      ]
    : [];
}

export function evaluateFractioning(
  state: FractioningState,
  inputs: FractioningInputs,
  ctx: FractioningContext
): FractioningEvaluation {
  const core = computeFractioning(state, inputs, ctx);
  return { ...core, outputs: fractioningOutputs(core, ctx) };
}
