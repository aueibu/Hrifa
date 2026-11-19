import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { CLIP_SLOT } from './clipEditorSession';
import { useOptionalClipEditorSession } from './ClipEditorSessionProvider';
import type { CompositionInspectorTarget } from './compositionWorkspace';
import type { NoteSelection } from './noteSelection';
import {
  buildSelectionChain,
  parentSelection,
  type WorkbenchSelectionChain,
  type WorkbenchSelectionNode,
} from './selectionChain';

export interface WorkbenchSelectionValue {
  chain: WorkbenchSelectionChain;
  /** The next node up from `node` (note to clip to module-or-canvas to canvas), or null. */
  parent(node: WorkbenchSelectionNode): WorkbenchSelectionNode | null;
}

const WorkbenchSelectionContext = createContext<WorkbenchSelectionValue | null>(null);

/**
 * Provides the read-only selection chain. The page passes its stored shapes (inspector target and
 * `editorClipTarget`); the open clip's note selection is the one the editor publishes to the clip
 * editor session after pruning and deriving it (`CLIP_SLOT.shownSelection`), so the chain matches
 * what the editor and inspector show even after an undo. Nothing here writes any of them.
 */
export function WorkbenchSelectionProvider({
  inspectorTarget = null,
  clipId = null,
  children,
}: {
  inspectorTarget?: CompositionInspectorTarget | null;
  clipId?: string | null;
  children: ReactNode;
}) {
  const session = useOptionalClipEditorSession();
  const held = useSyncExternalStore(
    session ? session.subscribe : noSubscribe,
    () =>
      session && clipId !== null
        ? session.get<NoteSelection>(clipId, CLIP_SLOT.shownSelection)
        : undefined,
    () => undefined
  );
  const noteSelection = held ?? null;
  const value = useMemo<WorkbenchSelectionValue>(() => {
    const chain = buildSelectionChain({ inspectorTarget, clipId, noteSelection });
    return { chain, parent: (node) => parentSelection(chain, node) };
  }, [inspectorTarget, clipId, noteSelection]);
  return (
    <WorkbenchSelectionContext.Provider value={value}>
      {children}
    </WorkbenchSelectionContext.Provider>
  );
}

const noSubscribe = () => () => undefined;

/** The selection chain, or null when no provider is above (the page does not mount one yet). */
export function useWorkbenchSelection(): WorkbenchSelectionValue | null {
  return useContext(WorkbenchSelectionContext);
}
