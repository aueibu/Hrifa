import {
  boundOutput,
  resolvePacketFromOutput,
  type PublishedCompositionOutput,
} from '../../compositionRouting';
import type { NodeRouteBinding, NodeRouteState } from '../../compositionWorkspace';
import { melodicize, type MelodicizationResult, type PitchAllocation } from '../../melodicization';
import type { DataPacket } from '../../model';
import type { MusicalDuration } from '../../musicalTime';
import { signalTypeRegistry } from '../../signalTypes';
import { createMemo, type Memo } from '../memo';

/** The persisted values the output depends on (volume and the piano roll view do not). */
export interface MelodicizationState {
  allocation: PitchAllocation;
  articulationPercent: number;
}

/**
 * What Melodicization reads from upstream: the bound outputs and route bindings of its `rhythm` and
 * `pitches` ports, picked by `pickMelodicizationInputs` so they keep their identity when an
 * unrelated output changes (otherwise the node's own publish would re-run it forever).
 */
export interface MelodicizationInputs {
  rhythmOutput: PublishedCompositionOutput | undefined;
  pitchOutput: PublishedCompositionOutput | undefined;
  bindingRhythm: NodeRouteBinding | undefined;
  bindingPitches: NodeRouteBinding | undefined;
}

export interface MelodicizationContext {
  instanceId: string;
  instanceLabel: string;
  edo: number;
  /** The transport's pulse duration (a stable object from the transport pulse options). */
  pulseUnit: MusicalDuration;
}

/** What the label does not touch: a rename keeps this object, and its packet, as it is. */
export interface MelodicizationCore {
  treatedRhythm: DataPacket | undefined;
  treatedPitches: DataPacket | undefined;
  result: MelodicizationResult;
}

export type MelodicizationEvaluation = MelodicizationCore & {
  outputs: PublishedCompositionOutput[];
};

/**
 * Resolves the `rhythm` and `pitches` ports, exactly as the component did: the bound output of each
 * (no self-binding rule; none existed).
 */
export function pickMelodicizationInputs(
  outputs: PublishedCompositionOutput[],
  routeState: NodeRouteState,
  _instanceId: string
): MelodicizationInputs {
  const bindingRhythm = routeState.rhythm;
  const bindingPitches = routeState.pitches;
  return {
    rhythmOutput: boundOutput(outputs, bindingRhythm?.source),
    pitchOutput: boundOutput(outputs, bindingPitches?.source),
    bindingRhythm,
    bindingPitches,
  };
}

/** Melodicization: lays the pitches onto the rhythm's attacks. Takes no label. */
export function computeMelodicization(
  state: MelodicizationState,
  inputs: MelodicizationInputs,
  ctx: Omit<MelodicizationContext, 'instanceLabel'>,
  memo: Memo = createMemo()
): MelodicizationCore {
  const { allocation, articulationPercent } = state;
  const { instanceId, edo, pulseUnit } = ctx;
  const { rhythmOutput, pitchOutput, bindingRhythm, bindingPitches } = inputs;
  // Each part depends only on what it did before the evaluator existed.
  const resolvedRhythm = memo(
    'resolvedRhythm',
    [rhythmOutput, bindingRhythm?.source?.index, instanceId],
    () =>
      resolvePacketFromOutput(
        rhythmOutput,
        bindingRhythm?.source?.index,
        `route:${instanceId}:rhythm`
      )
  );
  const resolvedPitches = memo(
    'resolvedPitches',
    [pitchOutput, bindingPitches?.source?.index, instanceId],
    () =>
      resolvePacketFromOutput(
        pitchOutput,
        bindingPitches?.source?.index,
        `route:${instanceId}:pitches`
      )
  );
  const treatedRhythm = memo(
    'treatedRhythm',
    [bindingRhythm, resolvedRhythm, instanceId, edo],
    () =>
      bindingRhythm
        ? signalTypeRegistry[bindingRhythm.signalType].apply(
            resolvedRhythm,
            bindingRhythm.treatment,
            `route:${instanceId}:rhythm`,
            edo
          )
        : undefined
  );
  const treatedPitches = memo(
    'treatedPitches',
    [bindingPitches, resolvedPitches, instanceId, edo],
    () =>
      bindingPitches
        ? signalTypeRegistry[bindingPitches.signalType].apply(
            resolvedPitches,
            bindingPitches.treatment,
            `route:${instanceId}:pitches`,
            edo
          )
        : undefined
  );
  const result = memo(
    'result',
    [allocation, articulationPercent, instanceId, pulseUnit, treatedPitches, treatedRhythm],
    () =>
      melodicize({
        instanceId,
        rhythm: treatedRhythm,
        pitches: treatedPitches,
        allocation,
        pulseUnit,
        articulationPercent,
      })
  );
  return { treatedRhythm, treatedPitches, result };
}

/** The published `notes` output (always present, empty when the inputs are missing). */
export function melodicizationOutputs(
  core: MelodicizationCore,
  ctx: Pick<MelodicizationContext, 'instanceId' | 'instanceLabel'>
): PublishedCompositionOutput[] {
  return [
    {
      ref: { instanceId: ctx.instanceId, port: 'notes' },
      label: `${ctx.instanceLabel} · Notes`,
      packet: core.result.packet,
    },
  ];
}

export function evaluateMelodicization(
  state: MelodicizationState,
  inputs: MelodicizationInputs,
  ctx: MelodicizationContext
): MelodicizationEvaluation {
  const core = computeMelodicization(state, inputs, ctx);
  return { ...core, outputs: melodicizationOutputs(core, ctx) };
}
