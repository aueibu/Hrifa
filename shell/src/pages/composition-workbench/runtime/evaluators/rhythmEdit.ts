import {
  boundOutput,
  resolvePacketFromOutput,
  type PublishedCompositionOutput,
} from '../../compositionRouting';
import type { ModuleRouteBinding, ModuleRouteState } from '../../compositionWorkspace';
import type { DataPacket } from '../../model';
import {
  editRhythm,
  type GroupingPolicy,
  type RhythmEditMode,
  type RhythmEditResult,
} from '../../rhythmEdit';
import { isValidRhythmSource } from '../../routeTreatments';
import { signalTypeRegistry } from '../../signalTypes';
import { createMemo, type Memo } from '../memo';

export interface EditSettings {
  programPhase: number;
  programRate: number;
  lengthPhase: number;
  lengthRate: number;
  nStart: number;
  nChange: number;
  nEvery: number;
}

/** The persisted values the output depends on (sounds, audition, zoom and volume do not). */
export interface RhythmEditState {
  mode: RhythmEditMode;
  program: string;
  rules: string;
  lengths: string;
  grouping: GroupingPolicy;
  editSettings: EditSettings;
}

/**
 * What Rhythm Edit reads from upstream: the bound output and the route binding of its `rhythm`
 * port, picked by `pickRhythmEditInputs` so they keep their identity when an unrelated output
 * changes (otherwise the module's own publish would re-run it forever).
 */
export interface RhythmEditInputs {
  rhythmOutput: PublishedCompositionOutput | undefined;
  binding: ModuleRouteBinding | undefined;
}

export interface RhythmEditContext {
  instanceId: string;
  instanceLabel: string;
  edo: number;
}

/** What the label does not touch: a rename keeps this object, and its packet, as it is. */
export interface RhythmEditCore {
  /** The routed rhythm after its signal treatment, valid or not. */
  treated: DataPacket | undefined;
  /** The treated rhythm when it is a usable inter-onset list. */
  input: DataPacket | undefined;
  edited: RhythmEditResult;
}

export type RhythmEditEvaluation = RhythmEditCore & { outputs: PublishedCompositionOutput[] };

/**
 * Resolves the `rhythm` port. A binding pointing at this same instance (stale data) would feed the
 * module's own output back into itself, so it reads as disconnected.
 */
export function pickRhythmEditInputs(
  outputs: PublishedCompositionOutput[],
  routeState: ModuleRouteState,
  instanceId: string
): RhythmEditInputs {
  const binding = routeState.rhythm;
  return {
    rhythmOutput:
      binding?.source?.instanceId === instanceId
        ? undefined
        : boundOutput(outputs, binding?.source),
    binding,
  };
}

/** Rhythm Edit: edits the connected rhythm by its programs and rules. Takes no label. */
export function computeRhythmEdit(
  state: RhythmEditState,
  inputs: RhythmEditInputs,
  ctx: Omit<RhythmEditContext, 'instanceLabel'>,
  memo: Memo = createMemo()
): RhythmEditCore {
  const { mode, program, rules, lengths, grouping, editSettings } = state;
  const { instanceId, edo } = ctx;
  const { binding } = inputs;
  const selfBound = binding?.source?.instanceId === instanceId;
  const sourceIndex = binding?.source?.index;
  // Each part depends only on what it did before the evaluator existed.
  const resolved = memo(
    'resolved',
    [selfBound, inputs.rhythmOutput, sourceIndex, instanceId],
    () =>
      selfBound
        ? undefined
        : resolvePacketFromOutput(inputs.rhythmOutput, sourceIndex, `route:${instanceId}:rhythm`)
  );
  const treated = memo('treated', [binding, resolved, instanceId, edo], () =>
    binding
      ? signalTypeRegistry[binding.signalType].apply(
          resolved,
          binding.treatment,
          `route:${instanceId}:rhythm`,
          edo
        )
      : undefined
  );
  const input = isValidRhythmSource(treated) ? treated : undefined;
  const edited = memo(
    'edited',
    [instanceId, input, mode, program, rules, lengths, editSettings, grouping],
    () =>
      editRhythm({
        instanceId,
        source: input,
        mode,
        program,
        programTiming: { phase: editSettings.programPhase, rate: editSettings.programRate },
        rules,
        lengths,
        lengthTiming: { phase: editSettings.lengthPhase, rate: editSettings.lengthRate },
        variable: {
          start: editSettings.nStart,
          change: editSettings.nChange,
          every: editSettings.nEvery,
        },
        grouping,
      })
  );
  return { treated, input, edited };
}

/** The published `rhythm` output, when the edit produced a packet. */
export function rhythmEditOutputs(
  core: RhythmEditCore,
  ctx: Pick<RhythmEditContext, 'instanceId' | 'instanceLabel'>
): PublishedCompositionOutput[] {
  return core.edited.packet
    ? [
        {
          ref: { instanceId: ctx.instanceId, port: 'rhythm' },
          label: `${ctx.instanceLabel} · Rhythm`,
          packet: core.edited.packet,
        },
      ]
    : [];
}

export function evaluateRhythmEdit(
  state: RhythmEditState,
  inputs: RhythmEditInputs,
  ctx: RhythmEditContext
): RhythmEditEvaluation {
  const core = computeRhythmEdit(state, inputs, ctx);
  return { ...core, outputs: rhythmEditOutputs(core, ctx) };
}
