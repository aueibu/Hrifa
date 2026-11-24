import type { CompositionInspectorTarget } from './compositionWorkspace';
import type { NoteSelection } from './noteSelection';

/**
 * The read-only selection chain (design one-stage 7.4): `[note-or-time selection, data-block,
 * node-or-canvas]`, derived from the three stored shapes (the editor's note selection, the page's
 * `editorTarget`, the page's inspector target). The stored shapes and their semantics do not
 * change; the chain only makes consumers independent of where each part lives.
 */
export type WorkbenchSelectionNode =
  | { level: 'note'; dataBlockId: string; selection: NoteSelection }
  | { level: 'data-block'; dataBlockId: string }
  | { level: 'node'; instanceId: string }
  | { level: 'route'; instanceId: string; port: string }
  | { level: 'canvas' };

/** Most specific first; always ends with a node, route or the canvas (the project). */
export type WorkbenchSelectionChain = readonly WorkbenchSelectionNode[];

export interface SelectionChainInputs {
  /** The page's inspector target (null reads as the canvas). */
  inspectorTarget: CompositionInspectorTarget | null;
  /** The open data-block (`editorTarget`), or null. */
  dataBlockId: string | null;
  /** The open data-block's editor selection, or null/undefined when none is held. */
  noteSelection?: NoteSelection | null;
}

function hasSelection(selection: NoteSelection | null | undefined): selection is NoteSelection {
  return !!selection && (selection.ids.length > 0 || selection.range !== null);
}

export function buildSelectionChain({
  inspectorTarget,
  dataBlockId,
  noteSelection,
}: SelectionChainInputs): WorkbenchSelectionChain {
  const chain: WorkbenchSelectionNode[] = [];
  if (dataBlockId !== null) {
    if (hasSelection(noteSelection)) {
      chain.push({ level: 'note', dataBlockId, selection: noteSelection });
    }
    chain.push({ level: 'data-block', dataBlockId });
  }
  if (inspectorTarget?.kind === 'node') {
    chain.push({ level: 'node', instanceId: inspectorTarget.instanceId });
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
 * One step up: note to data-block, data-block to the node-or-canvas it sits under, a node or route to the
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
