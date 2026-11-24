import type { ComponentType } from 'react';
import type { Operator } from './dataBlockOperators';
import { dataBlockTypeOf, type PacketBlock } from './dataBlocks/registry';
// Importing the built-in types registers them (`dataBlocks/types`), so the desk and every caller of
// this file find them in the registry.
import './dataBlocks/types';
import { rational, type Rational } from './musicalTime';
import { parseMeter } from './transport';

/**
 * What is left here is what the registry (dataBlocks/registry.ts) does not own: the editor
 * components a type names in its `editorId` (React lives here, not in the registry), the operator
 * lookup, and two small desk helpers. The type itself (label, accepts, blank, audition) is only in
 * the registry.
 */

/** What the bottom panel gives a data-block editor: the data-block it edits (commits go through the desk). */
export interface DataBlockEditorProps {
  dataBlock: PacketBlock;
  /**
   * The note editor's Chords tool (opt-in): a click on the roll reports the anchor cell (pitchMidicents on the
   * 12-row grid, onset in quarter notes). Creates no note and makes no sound.
   */
  onChordAnchor?(anchor: { pitchMidicents: number; onset: number }): void;
}

const dataBlockEditors = new Map<string, ComponentType<DataBlockEditorProps>>();

/** Binds an editor component to the id a data-block type names in `editorId`. Returns its remover. */
export function registerDataBlockEditor(
  editorId: string,
  component: ComponentType<DataBlockEditorProps>
): () => void {
  dataBlockEditors.set(editorId, component);
  return () => {
    if (dataBlockEditors.get(editorId) === component) {
      dataBlockEditors.delete(editorId);
    }
  };
}

/** The operators of a block's stored type (none for a type without any, or an unknown type). */
export function operatorsOf(block: Pick<PacketBlock, 'typeId'>): readonly Operator[] {
  return dataBlockTypeOf(block)?.operators ?? [];
}

/** One action of the block's type by id, or undefined. */
export function operatorById(block: Pick<PacketBlock, 'typeId'>, id: string): Operator | undefined {
  return operatorsOf(block).find((action) => action.id === id);
}

/** The editor for a data-block, or undefined when its type has none yet (or it has no type). */
export function dataBlockEditorOf(
  dataBlock: PacketBlock
): ComponentType<DataBlockEditorProps> | undefined {
  const editorId = dataBlockTypeOf(dataBlock)?.editorId;
  return editorId === undefined ? undefined : dataBlockEditors.get(editorId);
}

/** Length of `bars` bars of the meter (such as `4/4`), exact, in quarter notes. */
export function barsLength(meter: string, bars: number): Rational {
  const { numerator, denominator } = parseMeter(meter);
  return rational(4 * numerator * bars, denominator);
}

/** The first unused name of the form `New data-block`, `New data-block 2`, `New data-block 3`. */
export function nextDataBlockName(
  dataBlocks: readonly { name: string }[],
  base = 'New data-block'
): string {
  const taken = new Set(dataBlocks.map((dataBlock) => dataBlock.name));
  if (!taken.has(base)) {
    return base;
  }
  let n = 2;
  while (taken.has(`${base} ${n}`)) {
    n += 1;
  }
  return `${base} ${n}`;
}
