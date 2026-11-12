import { clipActionOperation, type ClipActionParams } from './clipActions';
import { freezeClipProperties } from './clipProperties';
import { clipActionById } from './clipTypes';
import type { DataPacket } from './model';
import { readNoteClipboard, writeNoteClipboard } from './noteClipboard';
import { newNoteItemId, resolveSamePitchOverlaps, type NoteItem } from './noteClipEdits';
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

/**
 * What the overlap rule compares a result against. Normally the packet the action started from. For a
 * rotation session (`rotation`), the reference is the action's starting packet with each session
 * original that it still holds put back in place of its rotated form, and the session's wrap pieces
 * (listed in `rotation.pieceIds` by original id) left out; `lineage` maps every such piece id to its
 * original, so a piece in the result counts as the original it came from. A pair that overlapped before
 * the session's first press therefore stays pre-existing however far it has rotated. Other producers
 * (duplicate, paste, rotate-values' extra slots) only make genuinely new notes and need no lineage.
 */
function overlapReference(
  base: DataPacket,
  rotation: { originals: readonly NoteItem[]; pieceIds: Record<string, string[]> } | undefined
): { reference: DataPacket; lineage: ReadonlyMap<string, string> | undefined } {
  if (!rotation) {
    return { reference: base, lineage: undefined };
  }
  const lineage = new Map<string, string>();
  for (const [original, pieces] of Object.entries(rotation.pieceIds)) {
    for (const piece of pieces) {
      lineage.set(piece, original);
    }
  }
  const originals = new Map(rotation.originals.map((item) => [item.id, item]));
  const items = base.items
    .filter((item) => !lineage.has(item.id))
    .map((item) => originals.get(item.id) ?? item);
  return { reference: { ...base, items }, lineage };
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
  // Same-pitch overlaps (noteClipEdits.resolveSamePitchOverlaps): a touched note overwrites what it
  // overlaps and identical notes merge, inside this same version, and only when something changed.
  // Such a result no longer matches a rotation session's notes, so the session ends.
  const { reference, lineage } = overlapReference(base, result.rotation);
  const resolved = resolveSamePitchOverlaps(
    result.packet,
    reference,
    () => newNoteItemId(snippetId),
    lineage
  );
  const survivorOf = resolved.survivorOf;
  if (resolved.packet !== result.packet) {
    if (jsonEqual(resolved.packet.items, base.items)) {
      // Everything the action added was absorbed by notes that were already there.
      return { status: 'unchanged', message: 'Those notes are already in the clip.' };
    }
    result = { ...result, packet: resolved.packet, rotation: undefined };
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
