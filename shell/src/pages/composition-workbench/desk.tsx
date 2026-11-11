import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react';
import type { DataPacket } from './model';
import {
  acceptsSnippets,
  commitSnippetEdit,
  createClipFromVersion,
  convertSnippetToPitchClass,
  duplicateSnippet,
  editSnippetNote,
  restoreSnippetVersion,
  type PitchClassConversionResult,
  type Snippet,
  type SnippetEditResult,
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
  /**
   * The edit contract: replace the snippet's packet in place (same id, name and position), adding an
   * `operation` provenance step to every item. One global undo step. A packet deeply equal to the
   * current one changes nothing (`ok`, no history entry); an invalid packet or an unknown id is
   * refused and the desk is untouched.
   */
  commitSnippetEditById(id: string, newPacket: DataPacket, operation: string): SnippetEditResult;
  /** Moves the clip back (or forward) to a kept version; same clip, one undo step. */
  restoreSnippetVersionById(id: string, versionId: string): SnippetEditResult;
  /** Adds a new clip made from a version, directly after the original. Returns it. */
  createClipFromVersionById(id: string, versionId: string): SnippetEditResult;
}

const DeskContext = createContext<DeskContextValue | undefined>(undefined);

export function DeskProvider({ children }: { children: ReactNode }) {
  const [snippets, setSnippets] = usePersistentState<Snippet[]>(
    compositionStateKeys.desk,
    [],
    acceptsSnippets,
    undefined,
    // Every desk change is its own undo step, never merged with a neighbour.
    { coalesce: false }
  );
  // Undo and redo are workbench-wide (history.ts); the desk only records through its setter. The
  // ref lets several changes in one event see each other.
  const snippetsRef = useRef(snippets);
  snippetsRef.current = snippets;

  /**
   * The single path for every desk change. `updater` returns the next list, or the same array to
   * change nothing (no history entry). A real change records through the shared history.
   */
  const applyChange = useCallback(
    (updater: (current: Snippet[]) => Snippet[]) => {
      const current = snippetsRef.current;
      const next = updater(current);
      if (next === current) {
        return;
      }
      snippetsRef.current = next;
      setSnippets(next);
    },
    [setSnippets]
  );

  const addSnippet = useCallback(
    (snippet: Snippet) => applyChange((current) => [...current, snippet]),
    [applyChange]
  );
  const removeSnippet = useCallback(
    (id: string) =>
      applyChange((current) => {
        const next = current.filter((snippet) => snippet.id !== id);
        return next.length === current.length ? current : next;
      }),
    [applyChange]
  );
  const renameSnippet = useCallback(
    (id: string, name: string) =>
      applyChange((current) =>
        current.some((snippet) => snippet.id === id && snippet.name !== name)
          ? current.map((snippet) => (snippet.id === id ? { ...snippet, name } : snippet))
          : current
      ),
    [applyChange]
  );
  const setSnippetNote = useCallback(
    (id: string, note: string) =>
      applyChange((current) => {
        const target = current.find((snippet) => snippet.id === id);
        if (!target) {
          return current;
        }
        const edited = editSnippetNote(target, note);
        return edited.note === target.note
          ? current
          : current.map((snippet) => (snippet.id === id ? edited : snippet));
      }),
    [applyChange]
  );
  const duplicateSnippetById = useCallback(
    (id: string) => {
      const request = { id: newSnippetId(), createdAt: new Date().toISOString() };
      applyChange((current) => {
        const index = current.findIndex((snippet) => snippet.id === id);
        if (index < 0) {
          return current;
        }
        const next = [...current];
        next.splice(index + 1, 0, duplicateSnippet(current[index], request));
        return next;
      });
    },
    [applyChange]
  );
  const convertToPitchClassById = useCallback(
    (id: string, options: { edo: number; snap?: boolean }): PitchClassConversionResult => {
      const source = snippetsRef.current.find((snippet) => snippet.id === id);
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
      applyChange((current) => {
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
    [applyChange]
  );
  const commitSnippetEditById = useCallback(
    (id: string, newPacket: DataPacket, operation: string): SnippetEditResult => {
      const target = snippetsRef.current.find((snippet) => snippet.id === id);
      if (!target) {
        return { ok: false, error: 'That snippet is no longer on the desk.' };
      }
      const result = commitSnippetEdit(target, newPacket, operation);
      if (!result.ok) {
        return result;
      }
      if (result.snippet === target) {
        return result;
      }
      applyChange((current) =>
        current.some((snippet) => snippet.id === id)
          ? current.map((snippet) => (snippet.id === id ? result.snippet : snippet))
          : current
      );
      return result;
    },
    [applyChange]
  );
  const restoreSnippetVersionById = useCallback(
    (id: string, versionId: string): SnippetEditResult => {
      const target = snippetsRef.current.find((snippet) => snippet.id === id);
      if (!target) {
        return { ok: false, error: 'That snippet is no longer on the desk.' };
      }
      const result = restoreSnippetVersion(target, versionId);
      if (!result.ok || result.snippet === target) {
        return result;
      }
      applyChange((current) =>
        current.some((snippet) => snippet.id === id)
          ? current.map((snippet) => (snippet.id === id ? result.snippet : snippet))
          : current
      );
      return result;
    },
    [applyChange]
  );
  const createClipFromVersionById = useCallback(
    (id: string, versionId: string): SnippetEditResult => {
      const source = snippetsRef.current.find((snippet) => snippet.id === id);
      if (!source) {
        return { ok: false, error: 'That snippet is no longer on the desk.' };
      }
      const result = createClipFromVersion(source, versionId, {
        id: newSnippetId(),
        createdAt: new Date().toISOString(),
      });
      if (!result.ok) {
        return result;
      }
      applyChange((current) => {
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
    [applyChange]
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
      commitSnippetEditById,
      restoreSnippetVersionById,
      createClipFromVersionById,
    }),
    [
      snippets,
      addSnippet,
      removeSnippet,
      renameSnippet,
      setSnippetNote,
      duplicateSnippetById,
      convertToPitchClassById,
      commitSnippetEditById,
      restoreSnippetVersionById,
      createClipFromVersionById,
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
