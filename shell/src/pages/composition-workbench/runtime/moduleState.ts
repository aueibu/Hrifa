import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { compositionInstanceStateKey } from '../usePersistentState';
import {
  getState,
  persistState,
  setState,
  subscribeState,
  type StateConfig,
  type StateSetOptions,
} from './stateStore';

/**
 * One persisted field of a module's state: the base key (from `compositionStateKeys`), what it reads
 * as when nothing is saved, what a saved value must look like, and how an older shape upgrades.
 */
export interface ModuleStateField<T, S> {
  key: string;
  /** The value when nothing valid is saved. A function gets the fields declared before this one. */
  fallback: T | ((earlier: Partial<S>) => T);
  accepts: (value: unknown) => value is T;
  migrate?: (value: unknown) => unknown;
  /** Defaults for every write to this field (see `StateSetOptions`). */
  options?: StateSetOptions;
}

export type ModuleStateFields<S> = { [K in keyof S]-?: ModuleStateField<S[K], S> };

/**
 * The persisted fields a module's evaluator reads, declared once. The module view and the headless
 * runner both read them through `useModuleState`, so both register the same config for the same
 * store key (the store keeps the first registrant's config). Fields only the view uses (volume, view
 * toggles, sounds) stay plain `usePersistentState` in the view.
 */
export interface ModuleStateSpec<S> {
  moduleId: string;
  fields: ModuleStateFields<S>;
  /** Field names in declaration order: a fallback may read the fields before it. */
  order: (keyof S)[];
}

export function defineModuleState<S>(
  moduleId: string,
  fields: ModuleStateFields<S>
): ModuleStateSpec<S> {
  return { moduleId, fields, order: Object.keys(fields) as (keyof S)[] };
}

export type ModuleStateSetters<S> = {
  [K in keyof S]: (action: S[K] | ((current: S[K]) => S[K]), options?: StateSetOptions) => void;
};

/** The store key of one field of one instance (the same key `usePersistentState` would use). */
export function moduleStateKey<S>(spec: ModuleStateSpec<S>, field: keyof S, instanceId: string) {
  return compositionInstanceStateKey(spec.fields[field].key, instanceId, spec.moduleId);
}

function fieldConfig<S, K extends keyof S>(
  spec: ModuleStateSpec<S>,
  field: K,
  instanceId: string
): StateConfig<S[K]> {
  const { fallback, accepts, migrate } = spec.fields[field];
  return {
    fallback:
      typeof fallback === 'function'
        ? () => (fallback as (earlier: Partial<S>) => S[K])(readEarlier(spec, field, instanceId))
        : fallback,
    accepts,
    migrate,
  };
}

/** The values of the fields declared before `field`, for a fallback that depends on them. */
function readEarlier<S>(spec: ModuleStateSpec<S>, field: keyof S, instanceId: string): Partial<S> {
  const earlier: Partial<S> = {};
  for (const name of spec.order) {
    if (name === field) {
      break;
    }
    earlier[name] = getState(
      moduleStateKey(spec, name, instanceId),
      fieldConfig(spec, name, instanceId)
    );
  }
  return earlier;
}

/** Reads every field (creating a key from its config when the store has none). Pure, no React. */
export function readModuleState<S>(spec: ModuleStateSpec<S>, instanceId: string): S {
  const state = {} as S;
  for (const name of spec.order) {
    state[name] = getState(
      moduleStateKey(spec, name, instanceId),
      fieldConfig(spec, name, instanceId)
    );
  }
  return state;
}

/**
 * A module instance's persisted state from the store: `[state, set]`. `state` keeps its identity
 * until a field changes; `set.<field>` is stable for the instance and records history like
 * `usePersistentState`. The runner and the view call this with the same spec.
 */
export function useModuleState<S>(
  spec: ModuleStateSpec<S>,
  instanceId: string
): [S, ModuleStateSetters<S>] {
  const keys = useMemo(
    () => spec.order.map((name) => moduleStateKey(spec, name, instanceId)),
    [spec, instanceId]
  );
  const snapshot = useRef<S | null>(null);
  const getSnapshot = () => {
    const next = readModuleState(spec, instanceId);
    const previous = snapshot.current;
    if (previous && spec.order.every((name) => Object.is(previous[name], next[name]))) {
      return previous;
    }
    snapshot.current = next;
    return next;
  };
  const subscribe = useCallback(
    (listener: () => void) => {
      const unsubscribers = spec.order.map((name, index) =>
        subscribeState(keys[index], listener, fieldConfig(spec, name, instanceId))
      );
      return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    },
    [spec, instanceId, keys]
  );
  const state = useSyncExternalStore(subscribe, getSnapshot);

  // Mount and migration writes persist the current values and never record.
  useEffect(() => {
    keys.forEach(persistState);
  }, [keys]);

  const setters = useMemo(
    () =>
      Object.fromEntries(
        spec.order.map((name, index) => [
          name,
          (action: unknown, options?: StateSetOptions) =>
            setState(keys[index], action as never, { ...spec.fields[name].options, ...options }),
        ])
      ) as ModuleStateSetters<S>,
    [spec, keys]
  );
  return [state, setters];
}
