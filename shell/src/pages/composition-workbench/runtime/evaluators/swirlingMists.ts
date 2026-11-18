import type { PublishedCompositionOutput } from '../../compositionRouting';
import {
  buildMistField,
  mistChordsPacket,
  mistVoicesPacket,
  sampleMist,
  type MistField,
  type MistSampling,
  type MistSettings,
} from '../../mist';
import type { DataPacket } from '../../model';
import { createMemo, type Memo } from '../memo';

/** The persisted values the outputs depend on (step, gate, volume and the view do not). */
export interface SwirlingMistsState {
  settings: MistSettings;
}

export interface SwirlingMistsContext {
  instanceId: string;
  instanceLabel: string;
}

/** What the label does not touch: a rename keeps this object, and its packets, as it is. */
export interface SwirlingMistsCore {
  field: MistField;
  sampling: MistSampling;
  chords: DataPacket<number[]>;
  voices: DataPacket<number[]>;
}

export type SwirlingMistsEvaluation = SwirlingMistsCore & { outputs: PublishedCompositionOutput[] };

/** Swirling Mists: samples the strata field into chords and voices. Takes no label. */
export function computeSwirlingMists(
  state: SwirlingMistsState,
  _inputs: Record<string, never>,
  ctx: Omit<SwirlingMistsContext, 'instanceLabel'>,
  memo: Memo = createMemo()
): SwirlingMistsCore {
  const { settings } = state;
  const { instanceId } = ctx;
  // Each part depends only on what it did before the evaluator existed.
  const field = memo('field', [settings], () => buildMistField(settings));
  const sampling = memo('sampling', [settings, field], () => sampleMist(settings, field));
  const chords = memo('chords', [instanceId, settings, sampling], () =>
    mistChordsPacket(instanceId, settings, sampling)
  );
  const voices = memo('voices', [instanceId, settings, sampling], () =>
    mistVoicesPacket(instanceId, settings, sampling)
  );
  return { field, sampling, chords, voices };
}

/** The published `chords` and `voices` outputs, when there is anything sampled. */
export function swirlingMistsOutputs(
  core: SwirlingMistsCore,
  ctx: Pick<SwirlingMistsContext, 'instanceId' | 'instanceLabel'>
): PublishedCompositionOutput[] {
  const { instanceId, instanceLabel } = ctx;
  return core.sampling.strataIndices.length && core.sampling.positions.length
    ? [
        {
          ref: { instanceId, port: 'chords' },
          label: `${instanceLabel} · Chords`,
          packet: core.chords,
        },
        {
          ref: { instanceId, port: 'voices' },
          label: `${instanceLabel} · Voices`,
          packet: core.voices,
        },
      ]
    : [];
}

export function evaluateSwirlingMists(
  state: SwirlingMistsState,
  inputs: Record<string, never>,
  ctx: SwirlingMistsContext
): SwirlingMistsEvaluation {
  const core = computeSwirlingMists(state, inputs, ctx);
  return { ...core, outputs: swirlingMistsOutputs(core, ctx) };
}
