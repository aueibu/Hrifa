import type { PublishedCompositionOutput } from '../../compositionRouting';
import {
  generateInterference,
  generatorPeriod,
  groupingOptions,
  interferenceDurationPacket,
  interferenceGeneratorDurationPacket,
  parseGeneratorValues,
  type GroupingOption,
  type InterferenceResult,
} from '../../interference';
import type { DataPacket } from '../../model';
import type { SoundOverride } from '../../sounds';
import { createMemo, type Memo } from '../memo';

export interface GeneratorDraft {
  id: string;
  label: string;
  valueText: string;
  /**
   * This generator's own sound; null or absent plays it on the rhythm voice matching its position
   * (generator 1 → primary, 2 → secondary, …).
   */
  sound?: SoundOverride | null;
}

/** The persisted values the outputs depend on (sound, volume and click do not). */
export interface InterferenceState {
  drafts: GeneratorDraft[];
  groupingId: string;
}

export interface InterferenceContext {
  instanceId: string;
  instanceLabel: string;
}

/** What the label does not touch: a rename keeps this object, and its packets, as it is. */
export interface InterferenceCore {
  authored: { draft: GeneratorDraft; parsed: ReturnType<typeof parseGeneratorValues> }[];
  patterns: number[][];
  periods: number[];
  generated:
    | { result: InterferenceResult; error?: undefined }
    | { result?: undefined; error: string };
  groupings: GroupingOption[];
  grouping: GroupingOption | undefined;
  outputPacket: DataPacket<number> | undefined;
  /** One entry per generator in `authored` order; undefined where its pattern is empty. */
  generatorPackets: (DataPacket<number> | undefined)[];
}

export type InterferenceEvaluation = InterferenceCore & { outputs: PublishedCompositionOutput[] };

/** Interference: the resultant of the generators, grouped, plus one packet per generator. */
export function computeInterference(
  state: InterferenceState,
  _inputs: Record<string, never>,
  _ctx: Omit<InterferenceContext, 'instanceLabel'>,
  memo: Memo = createMemo()
): InterferenceCore {
  const { drafts, groupingId } = state;
  // Each part depends only on what it did before the evaluator existed.
  const authored = memo('authored', [drafts], () =>
    drafts.map((draft) => ({ draft, parsed: parseGeneratorValues(draft.valueText) }))
  );
  const patterns = memo('patterns', [authored], () => authored.map(({ parsed }) => parsed.values));
  const periods = memo('periods', [patterns], () => patterns.map(generatorPeriod));
  const generated = memo('generated', [drafts], (): InterferenceCore['generated'] => {
    try {
      const authoredPatterns = drafts.map((draft) => parseGeneratorValues(draft.valueText).values);
      return { result: generateInterference(authoredPatterns) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Could not generate interference.' };
    }
  });
  const groupings = memo('groupings', [generated.result, periods], () =>
    generated.result ? groupingOptions(periods, generated.result.recurrence) : []
  );
  const grouping = groupings.find((option) => option.id === groupingId) ?? groupings[0];
  const outputPacket = memo('resultant', [drafts, generated.result, grouping], () =>
    generated.result ? interferenceDurationPacket(generated.result, drafts, grouping) : undefined
  );
  // Before the evaluator these were rebuilt whenever the outputs list was; they only read the
  // generators, so they now change with `authored` alone.
  const generatorPackets = memo('generators', [authored], () =>
    authored.map(({ draft, parsed }, index) =>
      parsed.values.length
        ? interferenceGeneratorDurationPacket(parsed.values, draft, index)
        : undefined
    )
  );
  return {
    authored,
    patterns,
    periods,
    generated,
    groupings,
    grouping,
    outputPacket,
    generatorPackets,
  };
}

/** The published `resultant` and one `generator:<id>` output per non-empty generator. */
export function interferenceOutputs(
  core: InterferenceCore,
  ctx: Pick<InterferenceContext, 'instanceId' | 'instanceLabel'>
): PublishedCompositionOutput[] {
  const { instanceId, instanceLabel } = ctx;
  return [
    ...(core.outputPacket
      ? [
          {
            ref: { instanceId, port: 'resultant' },
            label: `${instanceLabel} · Resultant`,
            packet: core.outputPacket,
          },
        ]
      : []),
    ...core.authored.flatMap(({ draft }, index) => {
      const packet = core.generatorPackets[index];
      return packet
        ? [
            {
              ref: { instanceId, port: `generator:${draft.id}` },
              label: `${instanceLabel} · ${draft.label}`,
              packet,
            },
          ]
        : [];
    }),
  ];
}

export function evaluateInterference(
  state: InterferenceState,
  inputs: Record<string, never>,
  ctx: InterferenceContext
): InterferenceEvaluation {
  const core = computeInterference(state, inputs, ctx);
  return { ...core, outputs: interferenceOutputs(core, ctx) };
}
