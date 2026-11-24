import type { ComponentType } from 'react';
import type { DataBlock } from './dataBlock';
import type { Operator } from './dataBlockOperators';
import type { DataDomain, DataEncoding, DataKind, DataPacket } from './model';
import {
  musicalDuration,
  musicalPosition,
  rational,
  rationalToNumber,
  type Rational,
} from './musicalTime';
import { withNotesProperties, DEFAULT_TIME_SIGNATURE } from './notesProperties';
import { notesOperators } from './noteTransforms';
import { parseMeter } from './transport';

/** What the bottom panel gives a data-block editor: the data-block it edits (commits go through the desk). */
export interface DataBlockEditorProps {
  dataBlock: DataBlock;
  /**
   * The note editor's Chords tool (opt-in): a click on the roll reports the anchor cell (pitchMidicents on the
   * 12-row grid, onset in quarter notes). Creates no note and makes no sound.
   */
  onChordAnchor?(anchor: { pitchMidicents: number; onset: number }): void;
}

/** What a blank data-block factory is given. Id and time are caller-supplied so it stays pure. */
export interface BlankDataBlockRequest {
  id: string;
  createdAt: string;
  name: string;
  /** The data-block's length, in quarter notes (exact). */
  length: Rational;
  /** The data-block's time signature (the project's, for a new data-block); 4/4 when omitted. */
  timeSignature?: string;
}

/**
 * A kind of data-block the desk knows how to start from nothing. The registry is the only place a data-block
 * type is described: the desk, persistence and capture never branch on it, so adding a type is one
 * `registerDataBlockType` call (plus an editor when it gets one).
 */
export interface DataBlockType {
  /** Stable id, also what the type picker offers. */
  id: string;
  /** Wording in the type picker. */
  label: string;
  kind: DataKind;
  domain: DataDomain;
  /** Set when the type is told apart by encoding too. */
  encoding?: DataEncoding;
  /** The data-block editor to open it with (see `registerDataBlockEditor`), or undefined while it has none. */
  editorId?: string;
  /**
   * Whether the desk can audition a data-block of this type. True means the note performance plan
   * (`createNotePacketPerformancePlan`) applies to its packets, so only note-domain types set it.
   */
  playable: boolean;
  /**
   * The operators the data-block inspector (and later a context menu) offers for this type: pure
   * `(packet, context, params) -> packet | refusal` functions (dataBlockOperators.ts). Types without any
   * implement none, and the inspector shows them disabled.
   */
  operators?: readonly Operator[];
  /** A new empty data-block of this type. */
  createBlank(request: BlankDataBlockRequest): DataBlock;
}

const dataBlockTypes: DataBlockType[] = [];
const dataBlockEditors = new Map<string, ComponentType<DataBlockEditorProps>>();

/** Adds a type (replacing one with the same id). Returns a function that removes it again. */
export function registerDataBlockType(type: DataBlockType): () => void {
  const index = dataBlockTypes.findIndex((entry) => entry.id === type.id);
  const replaced = index >= 0 ? dataBlockTypes[index] : undefined;
  if (replaced) {
    dataBlockTypes.splice(index, 1, type);
  } else {
    dataBlockTypes.push(type);
  }
  return () => {
    const at = dataBlockTypes.indexOf(type);
    if (at < 0) {
      return;
    }
    if (replaced) {
      dataBlockTypes.splice(at, 1, replaced);
    } else {
      dataBlockTypes.splice(at, 1);
    }
  };
}

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

/** Every registered type, in registration order (the type picker lists these). */
export function listDataBlockTypes(): readonly DataBlockType[] {
  return [...dataBlockTypes];
}

export function dataBlockTypeById(id: string): DataBlockType | undefined {
  return dataBlockTypes.find((type) => type.id === id);
}

/** The type of a packet: the most specific match on kind, domain and (when the type names one) encoding. */
export function dataBlockTypeOf(packet: Pick<DataPacket, 'kind' | 'domain' | 'encoding'>) {
  const matches = dataBlockTypes.filter(
    (type) =>
      type.kind === packet.kind &&
      type.domain === packet.domain &&
      (type.encoding === undefined || type.encoding === packet.encoding)
  );
  return matches.find((type) => type.encoding !== undefined) ?? matches[0];
}

/** The operators of a data-block's type (none for a type without any, or a packet with no type). */
export function operatorsOf(packet: DataPacket): readonly Operator[] {
  return dataBlockTypeOf(packet)?.operators ?? [];
}

/** One action of the data-block's type by id, or undefined. */
export function operatorById(packet: DataPacket, id: string): Operator | undefined {
  return operatorsOf(packet).find((action) => action.id === id);
}

/** The editor for a data-block, or undefined when its type has none yet (or it has no type). */
export function dataBlockEditorOf(
  dataBlock: DataBlock
): ComponentType<DataBlockEditorProps> | undefined {
  const editorId = dataBlockTypeOf(dataBlock.packet)?.editorId;
  return editorId === undefined ? undefined : dataBlockEditors.get(editorId);
}

/** Why the desk cannot audition the data-block, or null when it can. */
export function auditionRefusal(dataBlock: DataBlock): string | null {
  const { packet } = dataBlock;
  if (!dataBlockTypeOf(packet)?.playable) {
    return 'Only note data-blocks can be auditioned from the desk so far.';
  }
  if (packet.items.length === 0) {
    return 'This data-block is empty, so there is nothing to play yet.';
  }
  return null;
}

/**
 * Why the data-block cannot be placed on the canvas as a source, or null when it can. An empty data-block
 * publishes nothing for a downstream module to read, so it waits until it has content.
 */
export function makeSourceRefusal(dataBlock: DataBlock): string | null {
  return dataBlock.packet.items.length === 0
    ? 'This data-block is empty, so a source made from it would publish nothing yet.'
    : null;
}

/** Length of `bars` bars of the meter (such as `4/4`), exact, in quarter notes. */
export function barsLength(meter: string, bars: number): Rational {
  const { numerator, denominator } = parseMeter(meter);
  return rational(4 * numerator * bars, denominator);
}

/** The first unused name of the form `New data-block`, `New data-block 2`, `New data-block 3`. */
export function nextDataBlockName(
  dataBlocks: readonly DataBlock[],
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

/** A blank data-block's packet frame: linear, from zero, `length` long. */
function blankFrame(length: Rational) {
  return {
    topology: 'linear' as const,
    unit: 'quarterNote' as const,
    extent: rationalToNumber(length),
    origin: 0,
    musicalExtent: musicalDuration(length.numerator, length.denominator),
    musicalOrigin: musicalPosition(0),
  };
}

/** Builds a blank data-block from an empty packet. Never-edited data-blocks carry no lineage (K2). */
export function blankDataBlock(
  request: BlankDataBlockRequest,
  packet: Omit<DataPacket, 'items' | 'warnings' | 'frame'>
): DataBlock {
  const blank: DataPacket = {
    ...packet,
    items: [],
    warnings: [],
    frame: blankFrame(request.length),
  };
  return {
    schemaVersion: 1,
    id: request.id,
    name: request.name,
    createdAt: request.createdAt,
    // Every data-block carries all its properties: play from the start, loop the whole length.
    packet: withNotesProperties(blank, {
      length: request.length,
      start: rational(0),
      loopOn: true,
      loopStart: rational(0),
      loopEnd: request.length,
      timeSignature: request.timeSignature ?? DEFAULT_TIME_SIGNATURE,
    }),
  };
}

registerDataBlockType({
  id: 'notes',
  label: 'Notes',
  kind: 'events',
  domain: 'note',
  // Bound to the piano-roll editor by `registerDataBlockEditor` (components/NotesEditor.tsx).
  editorId: 'note-roll',
  playable: true,
  operators: notesOperators,
  createBlank: (request) => blankDataBlock(request, { kind: 'events', domain: 'note' }),
});
