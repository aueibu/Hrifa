import { useEffect, useMemo, useRef } from 'react';
import type { PublishedCompositionOutput } from '../compositionRouting';
import { createMemo, type Memo } from './memo';
import { moduleEvaluators, type EvaluatedModuleId } from './moduleEvaluators';

type Evaluators = typeof moduleEvaluators;

/** Keeps the previous object while every top-level field is `===`, so a fresh literal is free. */
function useShallowStable<T extends object>(value: T): T {
  const ref = useRef(value);
  const previous = ref.current as Record<string, unknown>;
  const next = value as Record<string, unknown>;
  const same =
    previous === next ||
    (Object.keys(previous).length === Object.keys(next).length &&
      Object.keys(next).every((key) => Object.is(previous[key], next[key])));
  if (!same) {
    ref.current = value;
  }
  return ref.current;
}

/**
 * Runs a module's registered evaluator once per change of its state, inputs or context (compared
 * field by field) and publishes the outputs in one effect. Returns the whole evaluation, so the
 * component draws from the same result it published. The label is not part of the computation: a
 * rename rebuilds only the `{ ref, label, packet }` wrappers and keeps every packet as it was.
 */
export function useModuleEvaluation<K extends EvaluatedModuleId>(
  moduleId: K,
  state: Parameters<Evaluators[K]['compute']>[0],
  inputs: Parameters<Evaluators[K]['compute']>[1],
  ctx: Parameters<Evaluators[K]['evaluate']>[2],
  onOutputsChange?: (instanceId: string, outputs: PublishedCompositionOutput[]) => void
): ReturnType<Evaluators[K]['evaluate']> {
  const parts = moduleEvaluators[moduleId] as unknown as {
    compute(s: unknown, i: unknown, c: unknown, memo: Memo): object;
    outputs(core: unknown, c: unknown): PublishedCompositionOutput[];
  };
  const { instanceLabel, ...computeContext } = ctx as { instanceLabel: string };
  const memoRef = useRef<Memo | null>(null);
  const memo = (memoRef.current ??= createMemo());
  const stableState = useShallowStable(state as object);
  const stableInputs = useShallowStable(inputs as object);
  const stableContext = useShallowStable(computeContext);
  const core = useMemo(
    () => parts.compute(stableState, stableInputs, stableContext, memo),
    // `parts` is fixed by `moduleId`.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [moduleId, stableState, stableInputs, stableContext]
  );
  const { instanceId } = stableContext as { instanceId: string };
  const outputs = useMemo(
    () => parts.outputs(core, { instanceId, instanceLabel }),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [moduleId, core, instanceId, instanceLabel]
  );
  useEffect(() => {
    onOutputsChange?.(instanceId, outputs);
  }, [instanceId, onOutputsChange, outputs]);
  return useMemo(() => ({ ...core, outputs }), [core, outputs]) as ReturnType<
    Evaluators[K]['evaluate']
  >;
}
