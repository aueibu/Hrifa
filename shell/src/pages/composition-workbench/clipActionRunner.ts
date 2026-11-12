import { clipActionOperation, type ClipActionParams } from './clipActions';
import { freezeClipProperties } from './clipProperties';
import { clipActionById } from './clipTypes';
import type { DataPacket } from './model';
import { readNoteClipboard, writeNoteClipboard } from './noteClipboard';
import { mergeDuplicateNotesDetailed, newNoteItemId } from './noteClipEdits';
import { readNoteEditor } from './noteEditorChannel';
import { jsonEqual, type Snippet } from './snippet';

/**
 * Runs one registry action on a clip the way every caller does (the inspector's buttons, the
 * editor's Ctrl/Cmd+C and V, a context menu later): reads the desk's packet and the editor's
 * selection as they are right now, freezes an old clip's properties, runs the action, and commits
 * its packet as its own version (`transform-<id>`, not a hand edit, one undo step). It returns what
 * happened for the caller to show; it never throws.
 *
 * Only `action.run` is guarded as "the action failed, nothing was changed". Once the commit has
 * succeeded the outcome is `committed` whatever happens after it (the editor's `adopt` throwing is
 * reported, never as "nothing was changed").
 */
export type ClipActionOutcome =
  /** The edit is in the desk; `message` is an extra note (for example what was pasted). */
  | { status: 'committed'; message?: string }
  /** Nothing was written (the action changed nothing, or only copied); `message` says what to tell. */
  | { status: 'unchanged'; message: string }
  /** The action refused (bad input, would leave the keyboard, ...); nothing was changed. */
  | { status: 'refused'; message: string }
  /** The desk would not take the edit, or the action hit an internal error; nothing was changed. */
  | { status: 'failed'; message: string };

export interface ClipActionDesk {
  latestSnippetById(id: string): Snippet | undefined;
  commitSnippetEditById(
    id: string,
    packet: DataPacket,
    operation: string
  ): { ok: true; snippet: Snippet } | { ok: false; error: string };
}

export function runClipAction(options: {
  snippetId: string;
  /** The packet to fall back on when the desk does not hold the clip (the caller's own copy). */
  fallback: DataPacket;
  actionId: string;
  params?: ClipActionParams;
  desk: ClipActionDesk;
}): ClipActionOutcome {
  const { snippetId, fallback, actionId, desk } = options;
  const params = options.params ?? {};
  const live = desk.latestSnippetById(snippetId)?.packet ?? fallback;
  const action = clipActionById(live, actionId);
  if (!action || !action.applies(live)) {
    return { status: 'refused', message: 'This clip does not support that action.' };
  }
  const channel = readNoteEditor(snippetId);
  // An old clip freezes its properties with its first edit, in the same version (as every edit).
  const base = freezeClipProperties(live);
  let result: ReturnType<typeof action.run>;
  try {
    result = action.run(
      base,
      {
        selection: channel?.selection ?? { ids: [], range: null },
        gridUnit: channel?.snapUnit,
        newId: () => newNoteItemId(snippetId),
        clipboard: readNoteClipboard(),
        rotation: channel?.rotation ?? null,
      },
      params
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`The "${actionId}" action failed unexpectedly.`, error);
    return {
      status: 'failed',
      message: 'That action hit an internal error, so nothing was changed.',
    };
  }
  if (!result.ok) {
    return { status: 'refused', message: result.error };
  }
  if (result.clipboard) {
    writeNoteClipboard(result.clipboard);
  }
  if (result.packet === base) {
    return { status: 'unchanged', message: result.message ?? 'Nothing to change.' };
  }
  // No duplicate notes: exact duplicates (same onset and pitch) merge inside this same version, and
  // only when something merged. A merged rotation session no longer describes the notes, so it ends.
  const { packet: merged, survivorOf } = mergeDuplicateNotesDetailed(result.packet, base);
  if (survivorOf.size > 0) {
    if (jsonEqual(merged.items, base.items)) {
      // Everything the action added merged straight back into notes that were already there.
      return { status: 'unchanged', message: 'Those notes are already in the clip.' };
    }
    result = { ...result, packet: merged, rotation: undefined };
  }
  let committed: ReturnType<ClipActionDesk['commitSnippetEditById']>;
  try {
    committed = desk.commitSnippetEditById(
      snippetId,
      result.packet,
      clipActionOperation(action.id)
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`Committing the "${actionId}" action failed unexpectedly.`, error);
    return { status: 'failed', message: 'The edit could not be saved, so nothing was changed.' };
  }
  if (!committed.ok) {
    return { status: 'failed', message: committed.error };
  }
  // The edit has landed from here on.
  try {
    channel?.adopt(result, committed.snippet.packet, survivorOf.size > 0 ? survivorOf : undefined);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`The editor could not take the selection after "${actionId}".`, error);
    return {
      status: 'committed',
      message: 'The edit was applied, but the editor could not update its selection.',
    };
  }
  return { status: 'committed', message: result.message };
}
