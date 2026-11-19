import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { InputScope } from './inputScope';

const InputScopeContext = createContext<InputScope | null>(null);

/** Installs one pointer tracker for the tree below (`WorkbenchSessions` mounts it). */
export function InputScopeProvider({
  scope: given,
  children,
}: {
  scope?: InputScope;
  children: ReactNode;
}) {
  const [own] = useState(() => given ?? new InputScope());
  const scope = given ?? own;
  useEffect(() => scope.install(), [scope]);
  return <InputScopeContext.Provider value={scope}>{children}</InputScopeContext.Provider>;
}

/**
 * The tracker above, or a private one (installed for this component's lifetime) when none is
 * provided: the editor then behaves as it did before the tracker moved out of it.
 */
export function useInputScope(): InputScope {
  const shared = useContext(InputScopeContext);
  const [own] = useState(() => (shared ? null : new InputScope()));
  const scope = shared ?? own;
  if (!scope) {
    throw new Error('useInputScope: no input scope.');
  }
  useEffect(() => (shared ? undefined : scope.install()), [shared, scope]);
  return scope;
}
