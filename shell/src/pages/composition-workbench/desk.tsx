import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { acceptsSnippets, type Snippet } from './snippet';
import { compositionStateKeys, usePersistentState } from './usePersistentState';

/**
 * The desk: snippets set aside for reuse, kept per browser. One provider at the workbench root so
 * every module sends to, and every view reads from, the same list.
 */
interface DeskContextValue {
  snippets: Snippet[];
  addSnippet(snippet: Snippet): void;
  removeSnippet(id: string): void;
  renameSnippet(id: string, name: string): void;
}

const DeskContext = createContext<DeskContextValue | undefined>(undefined);

export function DeskProvider({ children }: { children: ReactNode }) {
  const [snippets, setSnippets] = usePersistentState<Snippet[]>(
    compositionStateKeys.desk,
    [],
    acceptsSnippets
  );
  const addSnippet = useCallback(
    (snippet: Snippet) => setSnippets((current) => [...current, snippet]),
    [setSnippets]
  );
  const removeSnippet = useCallback(
    (id: string) => setSnippets((current) => current.filter((snippet) => snippet.id !== id)),
    [setSnippets]
  );
  const renameSnippet = useCallback(
    (id: string, name: string) =>
      setSnippets((current) =>
        current.map((snippet) => (snippet.id === id ? { ...snippet, name } : snippet))
      ),
    [setSnippets]
  );
  const value = useMemo(
    () => ({ snippets, addSnippet, removeSnippet, renameSnippet }),
    [snippets, addSnippet, removeSnippet, renameSnippet]
  );
  return <DeskContext.Provider value={value}>{children}</DeskContext.Provider>;
}

export function useDesk() {
  const value = useContext(DeskContext);
  if (!value) {
    throw new Error('useDesk must be used within a DeskProvider.');
  }
  return value;
}

export function newSnippetId() {
  return `snippet-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
