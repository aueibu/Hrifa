import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import {
  acceptsSnippets,
  convertSnippetToPitchClass,
  duplicateSnippet,
  editSnippetNote,
  type PitchClassConversionResult,
  type Snippet,
} from './snippet';
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
  setSnippetNote(id: string, note: string): void;
  /** Adds a copy named `<name> (variation)` directly after the original. */
  duplicateSnippetById(id: string): void;
  /**
   * Adds a pitch-class copy (in the given EDO) directly after the original. Returns the conversion
   * result: `ok` when the copy was added, a refusal, or `needsSnap` when pitches are off the EDO
   * grid and `snap` was not set. The original is never changed.
   */
  convertToPitchClassById(
    id: string,
    options: { edo: number; snap?: boolean }
  ): PitchClassConversionResult;
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
  const setSnippetNote = useCallback(
    (id: string, note: string) =>
      setSnippets((current) =>
        current.map((snippet) => (snippet.id === id ? editSnippetNote(snippet, note) : snippet))
      ),
    [setSnippets]
  );
  const duplicateSnippetById = useCallback(
    (id: string) => {
      const request = { id: newSnippetId(), createdAt: new Date().toISOString() };
      setSnippets((current) => {
        const index = current.findIndex((snippet) => snippet.id === id);
        if (index < 0) {
          return current;
        }
        const next = [...current];
        next.splice(index + 1, 0, duplicateSnippet(current[index], request));
        return next;
      });
    },
    [setSnippets]
  );
  const convertToPitchClassById = useCallback(
    (id: string, options: { edo: number; snap?: boolean }): PitchClassConversionResult => {
      const source = snippets.find((snippet) => snippet.id === id);
      if (!source) {
        return { ok: false, error: 'That snippet is no longer on the desk.' };
      }
      const result = convertSnippetToPitchClass(source, {
        id: newSnippetId(),
        createdAt: new Date().toISOString(),
        ...options,
      });
      if (!result.ok) {
        return result;
      }
      setSnippets((current) => {
        const index = current.findIndex((snippet) => snippet.id === id);
        if (index < 0) {
          return current;
        }
        const next = [...current];
        next.splice(index + 1, 0, result.snippet);
        return next;
      });
      return result;
    },
    [snippets, setSnippets]
  );
  const value = useMemo(
    () => ({
      snippets,
      addSnippet,
      removeSnippet,
      renameSnippet,
      setSnippetNote,
      duplicateSnippetById,
      convertToPitchClassById,
    }),
    [
      snippets,
      addSnippet,
      removeSnippet,
      renameSnippet,
      setSnippetNote,
      duplicateSnippetById,
      convertToPitchClassById,
    ]
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
