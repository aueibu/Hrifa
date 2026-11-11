import type { NoteEventValue } from './melodicization';
import type { DataItem, DataKind, DataPacket } from './model';
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
  /** The ids of the selected items. Absent when the whole packet was captured. */
  itemIds?: string[];
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
    // A deep copy, so the snippet never shares state with the live module output.
    selection = { packet: structuredClone(source), warnings: [] };
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
        ...(itemIds === undefined
          ? {}
          : { itemIds: selection.packet.items.map((item) => item.id) }),
      },
    },
  };
}

/**
 * Edit a snippet's note. Returns a new snippet: only `note` differs, and `packet`, `id` and
 * `createdAt` are the same references. Blank text clears the note (the key is removed).
 */
export function editSnippetNote(snippet: Snippet, note: string): Snippet {
  const { note: _previous, ...rest } = snippet;
  const trimmed = note.trim();
  return trimmed ? { ...rest, note: trimmed } : rest;
}

/**
 * Duplicate a snippet as a variation: a new snippet with a fresh id and the name
 * `<name> (variation)`, holding a deep copy of the packet so the two never share state. Items keep
 * their ids and each gains a `duplicate-snippet` provenance step. The original is not touched.
 * Id and time are caller-supplied so this stays pure.
 */
export function duplicateSnippet(
  snippet: Snippet,
  request: { id: string; createdAt: string }
): Snippet {
  const copy = structuredClone(snippet.packet);
  const items = copy.items.map((item) => ({
    ...item,
    provenance: [
      ...item.provenance,
      {
        sourceModuleInstance: snippet.origin?.moduleInstance ?? 'desk',
        sourceItemIds: [item.id],
        transformation: 'duplicate-snippet',
        parameters: { snippetId: request.id, sourceSnippetId: snippet.id },
      },
    ],
  }));
  return {
    ...snippet,
    id: request.id,
    name: `${snippet.name} (variation)`,
    createdAt: request.createdAt,
    packet: { ...copy, items },
    origin: snippet.origin && structuredClone(snippet.origin),
  };
}

/**
 * One event of an `events | pitchClass` packet: the note's timing and velocity, with its pitches
 * reduced to pitch classes (0 to edo - 1, `chromatic-${edo}`). Pitch classes carry no register.
 */
export interface PitchClassEventValue {
  onset: NoteEventValue['onset'];
  interOnset: NoteEventValue['interOnset'];
  duration: NoteEventValue['duration'];
  pitchClasses: number[];
  velocity: number;
}

/** A pitch within this many midicents of an EDO step counts as on the grid and is not snapped. */
export const PITCH_GRID_TOLERANCE_MIDICENTS = 0.5;

export type PitchClassConversionResult =
  | { ok: true; snippet: Snippet }
  /** A hard refusal: the snippet cannot be converted at all. */
  | { ok: false; needsSnap?: false; error: string }
  /** Some pitches are off the project EDO grid; converting needs `snap: true` (the user's say-so). */
  | { ok: false; needsSnap: true; edo: number; offGridCount: number; message: string };

/**
 * Why a snippet can never be converted to pitch classes, or null when it can (possibly after
 * snapping). Only `events | note` with at least one note and finite pitches converts: anything else
 * is refused, never guessed at. Off-grid pitches are not a refusal; see `convertSnippetToPitchClass`.
 */
export function pitchClassConversionRefusal(snippet: Snippet): string | null {
  const { packet } = snippet;
  if (packet.kind !== 'events' || packet.domain !== 'note') {
    return `Only note snippets (events | note) can be converted to pitch classes, not ${packet.kind} | ${packet.domain}.`;
  }
  if (packet.items.length === 0) {
    return 'There is nothing to convert: the snippet has no notes.';
  }
  const items = packet.items as DataItem<NoteEventValue>[];
  const invalid = items.some((item) =>
    item.value.pitches.some((midicents) => !Number.isFinite(midicents))
  );
  if (invalid) {
    return 'This snippet has a pitch that is not a finite number, so it cannot be converted. Nothing was converted.';
  }
  return null;
}

/**
 * Convert an `events | note` snippet to `events | pitchClass` (`chromatic-${edo}`, edo being the
 * project EDO, default 12): each pitch becomes `round(midicents / (1200 / edo))` mod edo. Timing and
 * frame are kept; items keep their ids and gain a `to-pitch-class` provenance step. Returns a new
 * snippet named `<name> (pitch classes)` with a fresh id; the original is not touched. Id and time
 * are caller-supplied so this stays pure.
 *
 * If any pitch is off the EDO grid (further than `PITCH_GRID_TOLERANCE_MIDICENTS` from a step) the
 * result is `needsSnap` unless `snap` is true; then each pitch rounds to the nearest step and the
 * provenance parameters record the edo and how many pitches were snapped.
 */
export function convertSnippetToPitchClass(
  snippet: Snippet,
  request: { id: string; createdAt: string; edo?: number; snap?: boolean }
): PitchClassConversionResult {
  const refusal = pitchClassConversionRefusal(snippet);
  if (refusal) {
    return { ok: false, error: refusal };
  }
  const edo = request.edo ?? 12;
  if (!Number.isInteger(edo) || edo < 1) {
    return { ok: false, error: `${edo} is not a valid EDO, so nothing was converted.` };
  }
  const step = 1200 / edo;
  const source = snippet.packet as DataPacket<NoteEventValue>;
  const isOffGrid = (midicents: number) =>
    Math.abs(midicents - Math.round(midicents / step) * step) > PITCH_GRID_TOLERANCE_MIDICENTS;
  const offGridCount = source.items.reduce(
    (total, item) => total + item.value.pitches.filter(isOffGrid).length,
    0
  );
  if (offGridCount > 0 && !request.snap) {
    const [subject, pronoun] = offGridCount === 1 ? ['pitch is', 'it'] : ['pitches are', 'them'];
    return {
      ok: false,
      needsSnap: true,
      edo,
      offGridCount,
      message: `${offGridCount} ${subject} off the ${edo}-EDO grid. Snap ${pronoun} to the nearest step?`,
    };
  }
  const copy = structuredClone(source);
  const items: DataItem<PitchClassEventValue>[] = copy.items.map((item) => {
    const { pitches, ...timing } = item.value;
    return {
      ...item,
      value: {
        ...timing,
        pitchClasses: pitches.map(
          (midicents) => ((Math.round(midicents / step) % edo) + edo) % edo
        ),
      },
      provenance: [
        ...item.provenance,
        {
          sourceModuleInstance: snippet.origin?.moduleInstance ?? 'desk',
          sourceItemIds: [item.id],
          transformation: 'to-pitch-class',
          parameters: {
            snippetId: request.id,
            sourceSnippetId: snippet.id,
            edo,
            snappedCount: offGridCount,
          },
        },
      ],
    };
  });
  return {
    ok: true,
    snippet: {
      ...snippet,
      id: request.id,
      name: `${snippet.name} (pitch classes)`,
      createdAt: request.createdAt,
      packet: { ...copy, domain: 'pitchClass', encoding: `chromatic-${edo}`, items } as DataPacket,
      origin: snippet.origin && structuredClone(snippet.origin),
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
        (snippet.note === undefined || typeof snippet.note === 'string') &&
        typeof packet === 'object' &&
        packet !== null &&
        typeof packet.kind === 'string' &&
        typeof packet.domain === 'string' &&
        Array.isArray(packet.items)
      );
    })
  );
}
