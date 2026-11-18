import {
  outputRefKey,
  type CompositionOutputRef,
  type PublishedCompositionOutput,
} from '../compositionRouting';

/**
 * The published outputs of every module instance, outside React. A module publishes the outputs it
 * computes; a routed module, the canvas and the inspector read them. Keeping them here (not in a
 * page `useState`) means a publish notifies only the subscribers that read outputs, instead of
 * re-rendering the page and every module.
 */
export interface OutputStore {
  /** Replaces one instance's outputs. Notifies only when a packet or label really changed. */
  publish(instanceId: string, outputs: PublishedCompositionOutput[]): void;
  /** Drops the outputs of every instance not in the list (an undone add, a removed module). */
  prune(liveInstanceIds: Iterable<string>): void;
  /** The output behind a ref, looked up by `outputRefKey` (a bank-entry index is part of the key). */
  get(ref: CompositionOutputRef): PublishedCompositionOutput | undefined;
  /** Every published output. The array keeps its identity until an output changes. */
  list(): PublishedCompositionOutput[];
  /** The outputs keyed by `outputRefKey`. Same identity rule as `list`. */
  record(): Readonly<Record<string, PublishedCompositionOutput>>;
  subscribe(listener: () => void): () => void;
}

const noOutputs: PublishedCompositionOutput[] = [];

export function createOutputStore(): OutputStore {
  let outputs: Record<string, PublishedCompositionOutput> = {};
  let listSnapshot: PublishedCompositionOutput[] = noOutputs;
  const listeners = new Set<() => void>();

  function commit(next: Record<string, PublishedCompositionOutput>) {
    outputs = next;
    const values = Object.values(next);
    listSnapshot = values.length === 0 ? noOutputs : values;
    // Copy first: a listener may unsubscribe while we notify.
    [...listeners].forEach((listener) => listener());
  }

  return {
    publish(instanceId, published) {
      const next = Object.fromEntries(
        Object.entries(outputs).filter(([, output]) => output.ref.instanceId !== instanceId)
      ) as Record<string, PublishedCompositionOutput>;
      published.forEach((output) => {
        next[outputRefKey(output.ref)] = output;
      });
      const currentKeys = Object.keys(outputs);
      const nextKeys = Object.keys(next);
      const unchanged =
        currentKeys.length === nextKeys.length &&
        nextKeys.every(
          (key) =>
            outputs[key]?.packet === next[key].packet && outputs[key]?.label === next[key].label
        );
      if (!unchanged) {
        commit(next);
      }
    },
    prune(liveInstanceIds) {
      const live = new Set(liveInstanceIds);
      const kept = Object.entries(outputs).filter(([, output]) => live.has(output.ref.instanceId));
      if (kept.length !== Object.keys(outputs).length) {
        commit(Object.fromEntries(kept));
      }
    },
    get: (ref) => outputs[outputRefKey(ref)],
    list: () => listSnapshot,
    record: () => outputs,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
