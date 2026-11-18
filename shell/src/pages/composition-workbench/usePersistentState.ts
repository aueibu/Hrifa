import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { getState, persistState, setState, subscribeState } from './runtime/stateStore';

export { compositionStateKeys, isRecordedStateKey, unrecordedStateKeys } from './stateKeys';

export interface PersistentStateOptions {
  /** Overrides the central classification for this one hook. */
  recorded?: boolean;
  /** False for discrete actions that must never merge with the next change. Default true. */
  coalesce?: boolean;
}

export function usePersistentState<T>(
  key: string,
  fallback: T | (() => T),
  accepts: (value: unknown) => value is T,
  // Upgrades an older saved shape before it is validated, so old projects keep loading.
  migrate?: (value: unknown) => unknown,
  options?: PersistentStateOptions
): [T, Dispatch<SetStateAction<T>>] {
  // The value lives in the keyed store (`runtime/stateStore.ts`), not in this component, so undo and
  // redo reach it while no view is mounted. The first hook to use a key supplies its config.
  const config = { fallback, accepts, migrate };
  const value = useSyncExternalStore(
    useCallback((listener: () => void) => subscribeState(key, listener, config), [key]),
    () => getState(key, config)
  );
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Mount and migration writes persist the current value and never record.
  useEffect(() => {
    persistState(key);
  }, [key]);

  const set = useCallback(
    (action: SetStateAction<T>) => {
      setState<T>(key, action, optionsRef.current);
    },
    [key]
  );

  return [value, set];
}

export const acceptsString = (value: unknown): value is string => typeof value === 'string';
export const acceptsBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
export const acceptsNumberOrString = (value: unknown): value is number | string =>
  typeof value === 'number' || typeof value === 'string';
export const acceptsFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
export const acceptsIntegerList = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isInteger(item));

export function compositionInstanceStateKey(
  baseKey: string,
  instanceId: string,
  legacyInstanceId: string
) {
  return instanceId === legacyInstanceId ? baseKey : `${baseKey}.instance.${instanceId}`;
}
