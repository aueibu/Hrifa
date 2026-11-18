/**
 * A per-instance memo for an evaluator's `compute`: `memo(key, deps, fn)` returns the value the
 * last call with the same `key` produced while every dep is `Object.is` equal to that call's, and
 * otherwise runs `fn` and remembers the result. It lets a part of the output depend only on what
 * it used to (a root change rebuilds the pitch classes, not the sequence). The result of a compute
 * never depends on the memo, only the identity of the objects it returns.
 */
export type Memo = <T>(key: string, deps: readonly unknown[], fn: () => T) => T;

export function createMemo(): Memo {
  const cache = new Map<string, { deps: readonly unknown[]; value: unknown }>();
  return <T>(key: string, deps: readonly unknown[], fn: () => T): T => {
    const hit = cache.get(key);
    if (
      hit &&
      hit.deps.length === deps.length &&
      deps.every((dep, index) => Object.is(dep, hit.deps[index]))
    ) {
      return hit.value as T;
    }
    const value = fn();
    cache.set(key, { deps, value });
    return value;
  };
}
