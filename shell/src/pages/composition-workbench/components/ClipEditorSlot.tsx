import { useEffect } from 'react';
import { Text } from '@mantine/core';
import { clipEditorFor } from '../clipEditors';
import { useDesk } from '../desk';
import classes from './ClipEditorSlot.module.css';

interface ClipEditorSlotProps {
  /** The clip the bottom panel targets, or null (a module, or a blank panel when none is open). */
  snippetId: string | null;
  /** The targeted clip is gone from the desk (deleted, or removed by an undo or project open). */
  onMissing(): void;
}

/**
 * Clears an open clip target whose clip is gone from the desk. The page renders it (always mounted), so this holds
 * even when the clip editor panel is closed. Renders nothing.
 */
export function ClipTargetGuard({ snippetId, onMissing }: ClipEditorSlotProps) {
  const { snippets, loading } = useDesk();
  const missing =
    snippetId !== null && !loading && !snippets.some((entry) => entry.id === snippetId);
  useEffect(() => {
    if (missing) {
      onMissing();
    }
  }, [missing, onMissing]);
  return null;
}

/** The plain floor of a panel with nothing open (no text), shared with the module panel's blank state. */
export function BlankFloor() {
  return <div className={classes.empty} />;
}

/**
 * The clip editor panel's content. It ends the clip's hand-edit session whenever the target
 * moves off the clip (another clip, a module, or the clip's removal), and asks the page to drop a
 * target that no longer exists. A clip type without an editor shows an empty state.
 */
export function ClipEditorSlot({ snippetId, onMissing }: ClipEditorSlotProps) {
  const { snippets, loading, endEditSession } = useDesk();
  const snippet = snippetId === null ? undefined : snippets.find((entry) => entry.id === snippetId);

  useEffect(() => {
    if (snippetId === null) {
      return undefined;
    }
    return () => endEditSession(snippetId);
  }, [snippetId, endEditSession]);

  // The desk starts empty while it loads, so a missing clip only counts once it has.
  const missing = snippetId !== null && !loading && snippet === undefined;
  useEffect(() => {
    if (missing) {
      onMissing();
    }
  }, [missing, onMissing]);

  if (!snippet) {
    // No clip: the panel is blank (a plain floor, no text) unless a module is shown instead.
    return snippetId === null ? <BlankFloor /> : null;
  }
  const Editor = clipEditorFor(snippet);
  if (Editor) {
    return <Editor snippet={snippet} />;
  }
  return (
    <div className={classes.empty} role="status">
      <Text size="sm">No editor for this clip yet.</Text>
      <Text size="xs" className={classes.detail}>
        {snippet.name} · {snippet.packet.kind} | {snippet.packet.domain}
      </Text>
    </div>
  );
}
