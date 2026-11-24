import { useSyncExternalStore } from 'react';
import type { PublishedCompositionOutput } from '../compositionRouting';
import type { OutputStore } from './outputStore';

const neverSubscribe = () => () => {};
const noOutputs: PublishedCompositionOutput[] = [];
const getNoOutputs = () => noOutputs;

/**
 * Every published output, re-rendering the caller only when one changes. `enabled: false` (a source
 * node that takes no outputs) subscribes to nothing and always returns the same empty list.
 */
export function useOutputs(store: OutputStore, enabled = true): PublishedCompositionOutput[] {
  return useSyncExternalStore(
    enabled ? store.subscribe : neverSubscribe,
    enabled ? store.list : getNoOutputs,
    enabled ? store.list : getNoOutputs
  );
}
