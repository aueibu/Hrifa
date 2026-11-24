import type { PublishedCompositionOutput } from '../../compositionRouting';
import type { DataBlock } from '../../dataBlock';

export type DataBlockSourceState = Record<string, never>;

/**
 * The desk data-block this module shows, or undefined when it was deleted. It is the desk store's own
 * object, so it keeps its identity until the data-block is edited.
 */
export interface DataBlockSourceInputs {
  dataBlock: DataBlock | undefined;
}

export interface DataBlockSourceContext {
  instanceId: string;
  instanceLabel: string;
}

export interface DataBlockSourceCore {
  dataBlock: DataBlock | undefined;
}

export type DataBlockSourceEvaluation = DataBlockSourceCore & {
  outputs: PublishedCompositionOutput[];
};

/** Data-block source: passes the desk data-block through. Takes no label. */
export function computeDataBlockSource(
  _state: DataBlockSourceState,
  inputs: DataBlockSourceInputs,
  _ctx: Omit<DataBlockSourceContext, 'instanceLabel'>
): DataBlockSourceCore {
  return { dataBlock: inputs.dataBlock };
}

/** The published `data-block` output: the data-block's packet, unchanged; nothing when the data-block is gone. */
export function dataBlockSourceOutputs(
  core: DataBlockSourceCore,
  ctx: Pick<DataBlockSourceContext, 'instanceId' | 'instanceLabel'>
): PublishedCompositionOutput[] {
  const { dataBlock } = core;
  return dataBlock
    ? [
        {
          ref: { instanceId: ctx.instanceId, port: 'data-block' },
          label: `${ctx.instanceLabel} · ${dataBlock.name}`,
          packet: dataBlock.packet,
        },
      ]
    : [];
}

export function evaluateDataBlockSource(
  state: DataBlockSourceState,
  inputs: DataBlockSourceInputs,
  ctx: DataBlockSourceContext
): DataBlockSourceEvaluation {
  const core = computeDataBlockSource(state, inputs, ctx);
  return { ...core, outputs: dataBlockSourceOutputs(core, ctx) };
}
