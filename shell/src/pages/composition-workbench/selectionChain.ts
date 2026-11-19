import type { CompositionInspectorTarget } from './compositionWorkspace';
import type { NoteSelection } from './noteSelection';

/**
 * The read-only selection chain (design one-stage 7.4): `[note-or-time selection, clip,
 * module-or-canvas]`, derived from the three stored shapes (the editor's note selection, the page's
 * `editorClipTarget`, the page's inspector target). The stored shapes and their semantics do not
 * change; the chain only makes consumers independent of where each part lives.
 */
export type WorkbenchSelectionNode =
  | { level: 'note'; clipId: string; selection: NoteSelection }
  | { level: 'clip'; clipId: string }
  | { level: 'module'; instanceId: string }
  | { level: 'route'; instanceId: string; port: string }
  | { level: 'canvas' };

/** Most specific first; always ends with a module, route or the canvas (the project). */
export type WorkbenchSelectionChain = readonly WorkbenchSelectionNode[];

export interface SelectionChainInputs {
  /** The page's inspector target (null reads as the canvas). */
  inspectorTarget: CompositionInspectorTarget | null;
  /** The open clip (`editorClipTarget`), or null. */
  clipId: string | null;
  /** The open clip's editor selection, or null/undefined when none is held. */
  noteSelection?: NoteSelection | null;
}

function hasSelection(selection: NoteSelection | null | undefined): selection is NoteSelection {
  return !!selection && (selection.ids.length > 0 || selection.range !== null);
}

export function buildSelectionChain({
  inspectorTarget,
  clipId,
  noteSelection,
}: SelectionChainInputs): WorkbenchSelectionChain {
  const chain: WorkbenchSelectionNode[] = [];
  if (clipId !== null) {
    if (hasSelection(noteSelection)) {
      chain.push({ level: 'note', clipId, selection: noteSelection });
    }
    chain.push({ level: 'clip', clipId });
  }
  if (inspectorTarget?.kind === 'module') {
    chain.push({ level: 'module', instanceId: inspectorTarget.instanceId });
  } else if (inspectorTarget?.kind === 'route') {
    chain.push({
      level: 'route',
      instanceId: inspectorTarget.instanceId,
      port: inspectorTarget.port,
    });
  } else {
    chain.push({ level: 'canvas' });
  }
  return chain;
}

/**
 * One step up: note to clip, clip to the module-or-canvas it sits under, a module or route to the
 * canvas (the project), the canvas to null.
 */
export function parentSelection(
  chain: WorkbenchSelectionChain,
  node: WorkbenchSelectionNode
): WorkbenchSelectionNode | null {
  const index = chain.indexOf(node);
  if (index >= 0 && index + 1 < chain.length) {
    return chain[index + 1];
  }
  return node.level === 'canvas' ? null : { level: 'canvas' };
}
