import type { DataItem, DataKind, DataPacket } from './model';
import type { NoteEventValue } from './melodicization';
import {
  addRational,
  compareRational,
  musicalDuration,
  musicalPosition,
  rationalToNumber,
  subtractRational,
} from './musicalTime';

/**
 * A snippet is a named, frozen packet kept on the desk. It holds any `DataPacket`: the packet already
 * carries its own kind, domain, role and frame, so routing compatibility works on it unchanged.
 *
 * Only *capture* knows about specific kinds. `captureHandlers` maps a packet kind to the function
 * that selects part of it and makes the part self-contained; supporting a new kind (a drawn curve, a
 * painted gesture) means adding one handler there, and the desk, persistence and source-module code
 * stay as they are. A kind with no handler can still be captured whole.
 *
 * Capture is a copy. Items keep their original ids, so a captured event is still recognisable as the
 * event it came from, and each gains a `capture-snippet` provenance step.
 */
export interface Snippet {
  /** Bumped when the stored shape changes, so older desks keep loading. */
  schemaVersion: 1;
  id: string;
  name: string;
  note?: string;
  createdAt: string;
  packet: DataPacket;
  origin?: SnippetOrigin;
}

/** Where a snippet was captured from. Information only: nothing follows it afterwards. */
export interface SnippetOrigin {
  moduleInstance: string;
  /** The source output port, when the capture came from a module output. */
  portId?: string;
  /** The ids of the selected items, or every item when the whole packet was captured. */
  itemIds: string[];
}

export interface CaptureRequest {
  /** Caller-supplied so capture stays pure and testable. */
  id: string;
  createdAt: string;
  name: string;
  note?: string;
  packet: DataPacket;
  moduleInstance: string;
  portId?: string;
  /** Item ids to keep. Omit to capture the whole packet. */
  itemIds?: string[];
}

export type CaptureResult =
  | { ok: true; snippet: Snippet; warnings: string[] }
  | { ok: false; error: string };

interface Selection {
  packet: DataPacket;
  warnings: string[];
}

type CaptureHandler = (packet: DataPacket, itemIds: string[]) => Selection | string;

function pickItems<T>(packet: DataPacket<T>, itemIds: string[]): DataItem<T>[] | string {
  const wanted = new Set(itemIds);
  const known = new Set(packet.items.map((item) => item.id));
  const missing = itemIds.filter((id) => !known.has(id));
  if (missing.length > 0) {
    return `The selection includes items that are not in the source: ${missing.join(', ')}.`;
  }
  // Packet order, not selection order: selecting in a different order does not reorder the material.
  return packet.items.filter((item) => wanted.has(item.id));
}

/** `events | note`: keep the selected notes and start them at zero, keeping exact rational time. */
const captureEvents: CaptureHandler = (source, itemIds) => {
  const picked = pickItems(source as DataPacket<NoteEventValue>, itemIds);
  if (typeof picked === 'string') {
    return picked;
  }
  if (source.domain !== 'note') {
    return `Selecting part of an events packet is supported for notes, not ${source.domain}.`;
  }
  if (picked.length === 0) {
    return 'Select at least one note to capture.';
  }

  const first = picked.reduce(
    (earliest, item) =>
      compareRational(item.value.onset.quarterNotes, earliest) < 0
        ? item.value.onset.quarterNotes
        : earliest,
    picked[0].value.onset.quarterNotes
  );

  let end = subtractRational(
    addRational(picked[0].value.onset.quarterNotes, picked[0].value.duration.quarterNotes),
    first
  );
  const items = picked.map((item) => {
    const onset = subtractRational(item.value.onset.quarterNotes, first);
    const itemEnd = addRational(onset, item.value.duration.quarterNotes);
    if (compareRational(itemEnd, end) > 0) {
      end = itemEnd;
    }
    return { ...item, value: { ...item.value, onset: { quarterNotes: onset } } };
  });

  const warnings: string[] = [];
  if (source.frame?.grouping) {
    // Its boundaries are positions in the source and mean nothing once the notes have moved.
    warnings.push('The source grouping was not kept: its boundaries do not apply to a selection.');
  }

  return {
    warnings,
    packet: {
      ...source,
      items,
      warnings: [],
      frame: {
        // A selection has no recurrence of its own, even when the source loops.
        topology: 'linear',
        unit: 'quarterNote',
        extent: rationalToNumber(end),
        origin: 0,
        musicalExtent: musicalDuration(end.numerator, end.denominator),
        musicalOrigin: musicalPosition(0),
      },
    },
  };
};

/** Add a kind here when part of it can be captured. Whole-packet capture needs no entry. */
const captureHandlers: Partial<Record<DataKind, CaptureHandler>> = {
  events: captureEvents,
};

export function canCaptureSelection(kind: DataKind): boolean {
  return kind in captureHandlers;
}

export function captureSnippet(request: CaptureRequest): CaptureResult {
  const { packet: source, itemIds } = request;
  if (source.items.length === 0) {
    return { ok: false, error: 'There is nothing to capture: the source is empty.' };
  }

  let selection: Selection;
  if (itemIds === undefined) {
    selection = { packet: source, warnings: [] };
  } else {
    const handler = captureHandlers[source.kind];
    if (!handler) {
      return {
        ok: false,
        error: `Capturing part of a ${source.kind} is not supported yet; capture the whole output instead.`,
      };
    }
    const result = handler(source, itemIds);
    if (typeof result === 'string') {
      return { ok: false, error: result };
    }
    selection = result;
  }

  const capturedIds = selection.packet.items.map((item) => item.id);
  const items = selection.packet.items.map((item) => ({
    ...item,
    provenance: [
      ...item.provenance,
      {
        sourceModuleInstance: request.moduleInstance,
        sourceItemIds: [item.id],
        transformation: 'capture-snippet',
        parameters: { snippetId: request.id },
      },
    ],
  }));

  return {
    ok: true,
    warnings: selection.warnings,
    snippet: {
      schemaVersion: 1,
      id: request.id,
      name: request.name,
      note: request.note,
      createdAt: request.createdAt,
      packet: { ...selection.packet, items },
      origin: {
        moduleInstance: request.moduleInstance,
        portId: request.portId,
        itemIds: capturedIds,
      },
    },
  };
}

/** For `usePersistentState`: a shape check, so a corrupt or newer desk falls back instead of crashing. */
export function acceptsSnippets(value: unknown): value is Snippet[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => {
      if (typeof entry !== 'object' || entry === null) {
        return false;
      }
      const snippet = entry as Partial<Snippet>;
      const packet = snippet.packet as Partial<DataPacket> | undefined;
      return (
        snippet.schemaVersion === 1 &&
        typeof snippet.id === 'string' &&
        typeof snippet.name === 'string' &&
        typeof snippet.createdAt === 'string' &&
        typeof packet === 'object' &&
        packet !== null &&
        typeof packet.kind === 'string' &&
        typeof packet.domain === 'string' &&
        Array.isArray(packet.items)
      );
    })
  );
}
