import type { ComponentType } from 'react';
import type { Snippet } from './snippet';

/** What the bottom panel gives a clip editor: the clip it edits (commits go through the desk). */
export interface ClipEditorProps {
  snippet: Snippet;
}

/**
 * The editor for a clip, by its packet's kind and domain, or undefined when there is none yet.
 * No clip type has an editor today; later milestones add them here.
 */
export function clipEditorFor(snippet: Snippet): ComponentType<ClipEditorProps> | undefined {
  void snippet;
  return undefined;
}
