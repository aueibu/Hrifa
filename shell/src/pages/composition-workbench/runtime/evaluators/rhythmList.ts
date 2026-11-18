import type { PublishedCompositionOutput } from '../../compositionRouting';
import { packet, type DataItem, type DataPacket } from '../../model';
import { parseRhythmText } from '../../rhythmNotation';
import { rhythmAttacks } from '../../rhythmRealization';

export interface RhythmListState {
  text: string;
  loop: boolean;
}

export type RhythmListInputs = Record<string, never>;

export interface RhythmListContext {
  instanceId: string;
  instanceLabel: string;
}

/** What the label does not touch: a rename keeps this object, and its packet, as it is. */
export interface RhythmListCore {
  parsed: ReturnType<typeof parseRhythmText>;
  resolved: ReturnType<typeof rhythmAttacks>;
  /** Undefined when the text has errors or no steps (then nothing is published). */
  outputPacket: DataPacket | undefined;
}

export type RhythmListEvaluation = RhythmListCore & { outputs: PublishedCompositionOutput[] };

/**
 * Rhythm List: an inter-onset duration list whose rests are negative durations and whose tie
 * markers sit on the item that starts the tie. Publishes nothing while the text is unreadable.
 */
export function computeRhythmList(
  state: RhythmListState,
  _inputs: RhythmListInputs,
  ctx: Omit<RhythmListContext, 'instanceLabel'>
): RhythmListCore {
  const { instanceId } = ctx;
  const { loop } = state;
  const parsed = parseRhythmText(state.text);
  const resolved = rhythmAttacks(parsed.steps, 0, { cyclic: loop });
  let outputPacket: DataPacket | undefined;
  if (!parsed.errors.length && parsed.steps.length) {
    const items: DataItem<number>[] = parsed.steps.map((step, index) => ({
      id: `${instanceId}:rhythm:${index}`,
      value: step.duration,
      ...(step.tie ? { tie: true } : {}),
      label: step.duration < 0 ? `r${-step.duration}` : `${step.duration}${step.tie ? '~' : ''}`,
      provenance: [
        {
          sourceModuleInstance: instanceId,
          sourceItemIds: [],
          transformation: 'rhythm-list-read',
          parameters: { text: step.duration < 0 ? `r${-step.duration}` : String(step.duration) },
        },
      ],
    }));
    outputPacket = packet<number>(
      'list',
      'duration',
      items,
      resolved.warnings,
      { source: 'inline' },
      {
        role: 'interOnset',
        frame: {
          topology: loop ? 'cyclic' : 'linear',
          unit: 'pulse',
          extent: resolved.spanPulses,
          origin: 0,
        },
      }
    );
  }
  return { parsed, resolved, outputPacket };
}

/** The published `rhythm` output (none while the text is unreadable), wrapped with the label. */
export function rhythmListOutputs(
  core: RhythmListCore,
  ctx: Pick<RhythmListContext, 'instanceId' | 'instanceLabel'>
): PublishedCompositionOutput[] {
  return core.outputPacket
    ? [
        {
          ref: { instanceId: ctx.instanceId, port: 'rhythm' },
          label: `${ctx.instanceLabel} · Rhythm`,
          packet: core.outputPacket,
        },
      ]
    : [];
}

export function evaluateRhythmList(
  state: RhythmListState,
  inputs: RhythmListInputs,
  ctx: RhythmListContext
): RhythmListEvaluation {
  const core = computeRhythmList(state, inputs, ctx);
  return { ...core, outputs: rhythmListOutputs(core, ctx) };
}
