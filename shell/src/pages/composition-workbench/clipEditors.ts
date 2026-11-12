import type { ComponentType } from 'react';
import { clipEditorOf, type ClipEditorProps } from './clipTypes';
// Importing an editor module registers it (`registerClipEditor`), so every built-in editor is
// imported here, where the slot looks editors up.
import './components/NoteClipEditor';
import type { Snippet } from './snippet';

export type { ClipEditorProps };

/**
 * The editor for a clip, or undefined when there is none yet. The lookup lives in the clip-type
 * registry (`clipTypes.ts`): a type names an `editorId`, and `registerClipEditor` binds it.
 */
export function clipEditorFor(snippet: Snippet): ComponentType<ClipEditorProps> | undefined {
  return clipEditorOf(snippet);
}
