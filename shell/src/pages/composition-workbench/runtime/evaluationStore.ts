import { createContext, useCallback, useContext, useSyncExternalStore } from 'react';
import type { EvaluatedModuleId, moduleEvaluators } from './moduleEvaluators';

type Evaluators = typeof moduleEvaluators;

/** What a module's evaluator returned for one instance (the outputs and its display values). */
export type ModuleEvaluationResult<K extends EvaluatedModuleId> = ReturnType<
  Evaluators[K]['evaluate']
>;

/**
 * The latest evaluation of every placed module instance, outside React. The runner of an instance
 * writes it (one evaluation per instance); the module view reads it to draw. An entry changes only
 * when the runner computed something new, so a view re-renders only for its own instance.
 */
export interface EvaluationStore {
  /**
   * Records an instance's evaluation without notifying: the runner calls it while rendering so a
   * view rendered after it in the same pass already reads the new value.
   */
  put(instanceId: string, moduleId: EvaluatedModuleId, evaluation: object): void;
  /** Tells the instance's readers to look again (the runner calls it in an effect). */
  notify(instanceId: string): void;
  get(instanceId: string): { moduleId: EvaluatedModuleId; evaluation: object } | undefined;
  /** Drops every instance not in the list (a deleted module, an undone add). */
  prune(liveInstanceIds: Iterable<string>): void;
  subscribe(instanceId: string, listener: () => void): () => void;
}

export function createEvaluationStore(): EvaluationStore {
  const entries = new Map<string, { moduleId: EvaluatedModuleId; evaluation: object }>();
  const listeners = new Map<string, Set<() => void>>();
  const notify = (instanceId: string) => {
    [...(listeners.get(instanceId) ?? [])].forEach((listener) => listener());
  };
  return {
    put(instanceId, moduleId, evaluation) {
      const current = entries.get(instanceId);
      if (current?.moduleId !== moduleId || current.evaluation !== evaluation) {
        entries.set(instanceId, { moduleId, evaluation });
      }
    },
    notify,
    get: (instanceId) => entries.get(instanceId),
    prune(liveInstanceIds) {
      const live = new Set(liveInstanceIds);
      [...entries.keys()].forEach((instanceId) => {
        if (!live.has(instanceId)) {
          entries.delete(instanceId);
        }
      });
    },
    subscribe(instanceId, listener) {
      let set = listeners.get(instanceId);
      if (!set) {
        set = new Set();
        listeners.set(instanceId, set);
      }
      set.add(listener);
      return () => {
        set.delete(listener);
        if (!set.size) {
          listeners.delete(instanceId);
        }
      };
    },
  };
}

export const EvaluationStoreContext = createContext<EvaluationStore | null>(null);

/**
 * A module view's evaluation: what the instance's runner computed. The runner renders before the
 * views (the page places it first), so the value exists on a view's first render. A view rendered
 * with no runner is a setup error, not a state to draw.
 */
export function useModuleEvaluationResult<K extends EvaluatedModuleId>(
  moduleId: K,
  instanceId: string
): ModuleEvaluationResult<K> {
  const store = useContext(EvaluationStoreContext);
  if (!store) {
    throw new Error('A module view needs an EvaluationStoreContext provider and a runner.');
  }
  // Stable per store and instance, so React does not resubscribe on every view render.
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(instanceId, listener),
    [store, instanceId]
  );
  const entry = useSyncExternalStore(subscribe, () => store.get(instanceId));
  if (!entry || entry.moduleId !== moduleId) {
    throw new Error(`No evaluation for ${moduleId} instance ${instanceId}: its runner is missing.`);
  }
  return entry.evaluation as ModuleEvaluationResult<K>;
}
