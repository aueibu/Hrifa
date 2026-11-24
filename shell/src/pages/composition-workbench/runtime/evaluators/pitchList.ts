import type { PublishedCompositionOutput } from '../../compositionRouting';
import type { ForteSetSelection } from '../../forteCatalog';
import type { DataPacket } from '../../model';
import { interpretPitchList, type PitchInputFormat } from '../../pitch';

export type PitchListCatalogOrigins = Record<string, ForteSetSelection>;

/** The persisted values the output depends on (preview step, gate, register and volume do not). */
export interface PitchListState {
  format: PitchInputFormat;
  inlineValues: string;
  catalogOrigins: PitchListCatalogOrigins;
}

export interface PitchListInputs {
  upstream?: DataPacket;
}

export interface PitchListContext {
  instanceId: string;
  instanceLabel: string;
  edo: number;
}

/** What the label does not touch: a rename keeps this object, and its packet, as it is. */
export interface PitchListCore {
  interpreted: ReturnType<typeof interpretPitchList>;
}

export type PitchListEvaluation = PitchListCore & { outputs: PublishedCompositionOutput[] };

/** Pitch List: reads the typed (or connected) list. Takes no label. */
export function computePitchList(
  state: PitchListState,
  inputs: PitchListInputs,
  ctx: Omit<PitchListContext, 'instanceLabel'>
): PitchListCore {
  const { instanceId, edo } = ctx;
  const inlineProvenance = Object.fromEntries(
    Object.entries(state.catalogOrigins).map(([index, origin]) => [
      index,
      [
        {
          sourceNodeInstance: instanceId,
          sourceItemIds: [],
          transformation: 'select-forte-set',
          parameters: {
            forteNumber: origin.forteNumber,
            primeForm: origin.primeForm,
            intervalClassVector: origin.intervalClassVector,
            transposition: origin.transposition,
            inverted: origin.inverted,
            pitchClasses: origin.pitchClasses,
          },
        },
      ],
    ])
  );
  const interpreted = interpretPitchList({
    instanceId,
    format: state.format,
    inlineText: state.inlineValues,
    inlineProvenance,
    upstream: inputs.upstream,
    edo,
  });
  return { interpreted };
}

/** The published `pitches` output: the packet from the core, wrapped with the label. */
export function pitchListOutputs(
  core: PitchListCore,
  ctx: Pick<PitchListContext, 'instanceId' | 'instanceLabel'>
): PublishedCompositionOutput[] {
  return [
    {
      ref: { instanceId: ctx.instanceId, port: 'pitches' },
      label: `${ctx.instanceLabel} · Pitches`,
      packet: core.interpreted.packet,
    },
  ];
}

export function evaluatePitchList(
  state: PitchListState,
  inputs: PitchListInputs,
  ctx: PitchListContext
): PitchListEvaluation {
  const core = computePitchList(state, inputs, ctx);
  return { ...core, outputs: pitchListOutputs(core, ctx) };
}
