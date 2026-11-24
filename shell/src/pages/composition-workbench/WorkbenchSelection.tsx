import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import type { CompositionInspectorTarget } from './compositionWorkspace';
import { DATA_BLOCK_SLOT } from './dataBlockEditorSession';
import { useOptionalDataBlockEditorSession } from './DataBlockEditorSessionProvider';
import type { NoteSelection } from './noteSelection';
import {
  buildSelectionChain,
  parentSelection,
  type WorkbenchSelectionChain,
  type WorkbenchSelectionNode,
} from './selectionChain';

export interface WorkbenchSelectionValue {
  chain: WorkbenchSelectionChain;
  /** The next node up from `node` (note to data-block to module-or-canvas to canvas), or null. */
  parent(node: WorkbenchSelectionNode): WorkbenchSelectionNode | null;
}

const WorkbenchSelectionContext = createContext<WorkbenchSelectionValue | null>(null);

/**
 * Provides the read-only selection chain. The page passes its stored shapes (inspector target and
 * `editorTarget`); the open data-block's note selection is the one the editor publishes to the data-block
 * editor session after pruning and deriving it (`DATA_BLOCK_SLOT.shownSelection`), so the chain matches
 * what the editor and inspector show even after an undo. Nothing here writes any of them.
 */
export function WorkbenchSelectionProvider({
  inspectorTarget = null,
  dataBlockId = null,
  children,
}: {
  inspectorTarget?: CompositionInspectorTarget | null;
  dataBlockId?: string | null;
  children: ReactNode;
}) {
  const session = useOptionalDataBlockEditorSession();
  const held = useSyncExternalStore(
    session ? session.subscribe : noSubscribe,
    () =>
      session && dataBlockId !== null
        ? session.get<NoteSelection>(dataBlockId, DATA_BLOCK_SLOT.shownSelection)
        : undefined,
    () => undefined
  );
  const noteSelection = held ?? null;
  const value = useMemo<WorkbenchSelectionValue>(() => {
    const chain = buildSelectionChain({ inspectorTarget, dataBlockId, noteSelection });
    return { chain, parent: (node) => parentSelection(chain, node) };
  }, [inspectorTarget, dataBlockId, noteSelection]);
  return (
    <WorkbenchSelectionContext.Provider value={value}>
      {children}
    </WorkbenchSelectionContext.Provider>
  );
}

const noSubscribe = () => () => undefined;

/** The selection chain, or null when no provider is above (the page mounts one through `WorkbenchSessions`). */
export function useWorkbenchSelection(): WorkbenchSelectionValue | null {
  return useContext(WorkbenchSelectionContext);
}
