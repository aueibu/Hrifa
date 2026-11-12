import type { ComponentType } from 'react';
import type { DataDomain, DataEncoding, DataKind, DataPacket } from './model';
import {
  musicalDuration,
  musicalPosition,
  rational,
  rationalToNumber,
  type Rational,
} from './musicalTime';
import type { Snippet } from './snippet';
import { parseMeter } from './transport';

/** What the bottom panel gives a clip editor: the clip it edits (commits go through the desk). */
export interface ClipEditorProps {
  snippet: Snippet;
}

/** What a blank-clip factory is given. Id and time are caller-supplied so it stays pure. */
export interface BlankClipRequest {
  id: string;
  createdAt: string;
  name: string;
  /** The clip's length, in quarter notes (exact). */
  length: Rational;
}

/**
 * A kind of clip the desk knows how to start from nothing. The registry is the only place a clip
 * type is described: the desk, persistence and capture never branch on it, so adding a type is one
 * `registerClipType` call (plus an editor when it gets one).
 */
export interface ClipType {
  /** Stable id, also what the type picker offers. */
  id: string;
  /** Wording in the type picker. */
  label: string;
  kind: DataKind;
  domain: DataDomain;
  /** Set when the type is told apart by encoding too. */
  encoding?: DataEncoding;
  /** The clip editor to open it with (see `registerClipEditor`), or undefined while it has none. */
  editorId?: string;
  /**
   * Whether the desk can audition a clip of this type. True means the note performance plan
   * (`createNotePacketPerformancePlan`) applies to its packets, so only note-domain types set it.
   */
  playable: boolean;
  /** A new empty clip of this type. */
  createBlank(request: BlankClipRequest): Snippet;
}

const clipTypes: ClipType[] = [];
const clipEditors = new Map<string, ComponentType<ClipEditorProps>>();

/** Adds a type (replacing one with the same id). Returns a function that removes it again. */
export function registerClipType(type: ClipType): () => void {
  const index = clipTypes.findIndex((entry) => entry.id === type.id);
  const replaced = index >= 0 ? clipTypes[index] : undefined;
  if (replaced) {
    clipTypes.splice(index, 1, type);
  } else {
    clipTypes.push(type);
  }
  return () => {
    const at = clipTypes.indexOf(type);
    if (at < 0) {
      return;
    }
    if (replaced) {
      clipTypes.splice(at, 1, replaced);
    } else {
      clipTypes.splice(at, 1);
    }
  };
}

/** Binds an editor component to the id a clip type names in `editorId`. Returns its remover. */
export function registerClipEditor(
  editorId: string,
  component: ComponentType<ClipEditorProps>
): () => void {
  clipEditors.set(editorId, component);
  return () => {
    if (clipEditors.get(editorId) === component) {
      clipEditors.delete(editorId);
    }
  };
}

/** Every registered type, in registration order (the type picker lists these). */
export function listClipTypes(): readonly ClipType[] {
  return [...clipTypes];
}

export function clipTypeById(id: string): ClipType | undefined {
  return clipTypes.find((type) => type.id === id);
}

/** The type of a packet: the most specific match on kind, domain and (when the type names one) encoding. */
export function clipTypeOf(packet: Pick<DataPacket, 'kind' | 'domain' | 'encoding'>) {
  const matches = clipTypes.filter(
    (type) =>
      type.kind === packet.kind &&
      type.domain === packet.domain &&
      (type.encoding === undefined || type.encoding === packet.encoding)
  );
  return matches.find((type) => type.encoding !== undefined) ?? matches[0];
}

/** The editor for a clip, or undefined when its type has none yet (or it has no type). */
export function clipEditorOf(snippet: Snippet): ComponentType<ClipEditorProps> | undefined {
  const editorId = clipTypeOf(snippet.packet)?.editorId;
  return editorId === undefined ? undefined : clipEditors.get(editorId);
}

/** Why the desk cannot audition the clip, or null when it can. */
export function auditionRefusal(snippet: Snippet): string | null {
  const { packet } = snippet;
  if (!clipTypeOf(packet)?.playable) {
    return 'Only note snippets can be auditioned from the desk so far.';
  }
  if (packet.items.length === 0) {
    return 'This clip is empty, so there is nothing to play yet.';
  }
  return null;
}

/**
 * Why the clip cannot be placed on the canvas as a source, or null when it can. An empty clip
 * publishes nothing for a downstream module to read, so it waits until it has content.
 */
export function makeSourceRefusal(snippet: Snippet): string | null {
  return snippet.packet.items.length === 0
    ? 'This clip is empty, so a source made from it would publish nothing yet.'
    : null;
}

/** Length of `bars` bars of the meter (such as `4/4`), exact, in quarter notes. */
export function barsLength(meter: string, bars: number): Rational {
  const { numerator, denominator } = parseMeter(meter);
  return rational(4 * numerator * bars, denominator);
}

/** The first unused name of the form `New clip`, `New clip 2`, `New clip 3`. */
export function nextClipName(snippets: readonly Snippet[], base = 'New clip'): string {
  const taken = new Set(snippets.map((snippet) => snippet.name));
  if (!taken.has(base)) {
    return base;
  }
  let n = 2;
  while (taken.has(`${base} ${n}`)) {
    n += 1;
  }
  return `${base} ${n}`;
}

/** A blank clip's packet frame: linear, from zero, `length` long. */
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

/** Builds a blank clip from an empty packet. Never-edited clips carry no lineage (K2). */
export function blankSnippet(
  request: BlankClipRequest,
  packet: Omit<DataPacket, 'items' | 'warnings' | 'frame'>
): Snippet {
  return {
    schemaVersion: 1,
    id: request.id,
    name: request.name,
    createdAt: request.createdAt,
    packet: { ...packet, items: [], warnings: [], frame: blankFrame(request.length) },
  };
}

registerClipType({
  id: 'notes',
  label: 'Notes',
  kind: 'events',
  domain: 'note',
  playable: true,
  createBlank: (request) => blankSnippet(request, { kind: 'events', domain: 'note' }),
});
