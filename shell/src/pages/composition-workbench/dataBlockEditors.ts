import type { ComponentType } from 'react';
// Importing an editor node registers it (`registerDataBlockEditor`), so every built-in editor is
// imported here, where the slot looks editors up.
import './components/NotesEditor';
import type { PacketBlock } from './dataBlock';
import { dataBlockEditorOf, type DataBlockEditorProps } from './dataBlockTypes';

export type { DataBlockEditorProps };

/**
 * The editor for a data-block, or undefined when there is none yet. The lookup lives in the data-block-type
 * registry (`dataBlockTypes.ts`): a type names an `editorId`, and `registerDataBlockEditor` binds it.
 */
export function dataBlockEditorFor(
  dataBlock: PacketBlock
): ComponentType<DataBlockEditorProps> | undefined {
  return dataBlockEditorOf(dataBlock);
}
