import type { PublishedCompositionOutput } from '../../compositionRouting';
import type { Snippet } from '../../snippet';

export type SnippetSourceState = Record<string, never>;

/**
 * The desk clip this module shows, or undefined when it was deleted. It is the desk store's own
 * object, so it keeps its identity until the clip is edited.
 */
export interface SnippetSourceInputs {
  snippet: Snippet | undefined;
}

export interface SnippetSourceContext {
  instanceId: string;
  instanceLabel: string;
}

export interface SnippetSourceCore {
  snippet: Snippet | undefined;
}

export type SnippetSourceEvaluation = SnippetSourceCore & {
  outputs: PublishedCompositionOutput[];
};

/** Snippet source: passes the desk clip through. Takes no label. */
export function computeSnippetSource(
  _state: SnippetSourceState,
  inputs: SnippetSourceInputs,
  _ctx: Omit<SnippetSourceContext, 'instanceLabel'>
): SnippetSourceCore {
  return { snippet: inputs.snippet };
}

/** The published `snippet` output: the clip's packet, unchanged; nothing when the clip is gone. */
export function snippetSourceOutputs(
  core: SnippetSourceCore,
  ctx: Pick<SnippetSourceContext, 'instanceId' | 'instanceLabel'>
): PublishedCompositionOutput[] {
  const { snippet } = core;
  return snippet
    ? [
        {
          ref: { instanceId: ctx.instanceId, port: 'snippet' },
          label: `${ctx.instanceLabel} · ${snippet.name}`,
          packet: snippet.packet,
        },
      ]
    : [];
}

export function evaluateSnippetSource(
  state: SnippetSourceState,
  inputs: SnippetSourceInputs,
  ctx: SnippetSourceContext
): SnippetSourceEvaluation {
  const core = computeSnippetSource(state, inputs, ctx);
  return { ...core, outputs: snippetSourceOutputs(core, ctx) };
}
