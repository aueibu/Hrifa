import { useEffect } from 'react';
import { Text } from '@mantine/core';
import { dataBlockEditorFor } from '../dataBlockEditors';
import { useDesk } from '../desk';
import classes from './DataBlockEditorSlot.module.css';

interface DataBlockEditorSlotProps {
  /** The data-block the bottom panel targets, or null (a node, or a blank panel when none is open). */
  dataBlockId: string | null;
  /** The targeted data-block is gone from the desk (deleted, or removed by an undo or project open). */
  onMissing(): void;
}

/**
 * Clears an open data-block target whose data-block is gone from the desk. The page renders it (always mounted), so this holds
 * even when the data-block editor panel is closed. Renders nothing.
 */
export function EditorTargetGuard({ dataBlockId, onMissing }: DataBlockEditorSlotProps) {
  const { dataBlocks, loading } = useDesk();
  const missing =
    dataBlockId !== null && !loading && !dataBlocks.some((entry) => entry.id === dataBlockId);
  useEffect(() => {
    if (missing) {
      onMissing();
    }
  }, [missing, onMissing]);
  return null;
}

/** The plain floor of a panel with nothing open (no text), shared with the node panel's blank state. */
export function BlankFloor() {
  return <div className={classes.empty} />;
}

/**
 * The data-block editor panel's content. It ends the data-block's hand-edit session whenever the target
 * moves off the data-block (another data-block, a node, or the data-block's removal), and asks the page to drop a
 * target that no longer exists. A data-block type without an editor shows an empty state.
 */
export function DataBlockEditorSlot({ dataBlockId, onMissing }: DataBlockEditorSlotProps) {
  const { dataBlocks, loading, endEditSession } = useDesk();
  const dataBlock =
    dataBlockId === null ? undefined : dataBlocks.find((entry) => entry.id === dataBlockId);

  useEffect(() => {
    if (dataBlockId === null) {
      return undefined;
    }
    return () => endEditSession(dataBlockId);
  }, [dataBlockId, endEditSession]);

  // The desk starts empty while it loads, so a missing data-block only counts once it has.
  const missing = dataBlockId !== null && !loading && dataBlock === undefined;
  useEffect(() => {
    if (missing) {
      onMissing();
    }
  }, [missing, onMissing]);

  if (!dataBlock) {
    // No data-block: the panel is blank (a plain floor, no text) unless a node is shown instead.
    return dataBlockId === null ? <BlankFloor /> : null;
  }
  const Editor = dataBlockEditorFor(dataBlock);
  if (Editor) {
    return <Editor dataBlock={dataBlock} />;
  }
  return (
    <div className={classes.empty} role="status">
      <Text size="sm">No editor for this data-block yet.</Text>
      <Text size="xs" className={classes.detail}>
        {dataBlock.name} · {dataBlock.packet.kind} | {dataBlock.packet.domain}
      </Text>
    </div>
  );
}
