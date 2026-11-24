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
 * A data-block is a named, frozen packet kept on the desk. It holds any `DataPacket`: the packet already
 * carries its own kind, domain, role and frame, so routing compatibility works on it unchanged.
 *
 * Only *capture* knows about specific kinds. `captureHandlers` maps a packet kind to the function
 * that selects part of it and makes the part self-contained; supporting a new kind (a drawn curve, a
 * painted gesture) means adding one handler there, and the desk, persistence and source-node code
 * stay as they are. A kind with no handler can still be captured whole.
 *
 * Capture is a copy. Items keep their original ids, so a captured event is still recognisable as the
 * event it came from, and each gains a `capture` provenance step.
 */
export interface DataBlock {
  /** Bumped when the stored shape changes, so older desks keep loading. */
  schemaVersion: 1;
  id: string;
  name: string;
  note?: string;
  createdAt: string;
  packet: DataPacket;
  origin?: DataBlockOrigin;
  /**
   * The data-block's stored version tree. Absent until the data-block is first edited (or born derived), so
   * older desks load unchanged. The head version's packet is `DataBlock.packet` itself and is not
   * stored again; every other version carries its own snapshot.
   */
  lineage?: DataBlockLineage;
}

/** One kept state of a data-block, a node in its derivation tree. */
export interface DataBlockVersion {
  id: string;
  /** The version this one was made from; null for the single root. */
  parentId: string | null;
  at: string;
  /** What produced it: `original`, an edit operation such as `edit`, or a derivation name. */
  operation: string;
  /** The snapshot. Absent on the head version only (see `DataBlock.lineage`). */
  packet?: DataPacket;
}

/** Where a data-block was derived from. `versionId` is the source head at the time, or null if the source had no history yet (then it is the source's root once edited). */
export interface DataBlockDerivation {
  dataBlockId: string;
  versionId: string | null;
  operation: string;
}

export interface DataBlockLineage {
  head: string;
  versions: DataBlockVersion[];
  derivedFrom?: DataBlockDerivation;
}

/** Where a data-block was captured from. Information only: nothing follows it afterwards. */
export interface DataBlockOrigin {
  nodeInstance: string;
  /** The source output port, when the capture came from a node output. */
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
  nodeInstance: string;
  portId?: string;
  /** Item ids to keep. Omit to capture the whole packet. */
  itemIds?: string[];
}

export type CaptureResult =
  | { ok: true; dataBlock: DataBlock; warnings: string[] }
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

export function captureDataBlock(request: CaptureRequest): CaptureResult {
  const { packet: source, itemIds } = request;
  if (source.items.length === 0) {
    return { ok: false, error: 'There is nothing to capture: the source is empty.' };
  }

  let selection: Selection;
  if (itemIds === undefined) {
    // A deep copy, so the data-block never shares state with the live node output.
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
        sourceNodeInstance: request.nodeInstance,
        sourceItemIds: [item.id],
        transformation: 'capture',
        parameters: { dataBlockId: request.id },
      },
    ],
  }));

  return {
    ok: true,
    warnings: selection.warnings,
    dataBlock: {
      schemaVersion: 1,
      id: request.id,
      name: request.name,
      note: request.note,
      createdAt: request.createdAt,
      packet: { ...selection.packet, items },
      origin: {
        nodeInstance: request.nodeInstance,
        portId: request.portId,
        ...(itemIds === undefined
          ? {}
          : { itemIds: selection.packet.items.map((item) => item.id) }),
      },
    },
  };
}

/**
 * Edit a data-block's note. Returns a new data-block: only `note` differs, and `packet`, `id` and
 * `createdAt` are the same references. Blank text clears the note (the key is removed).
 */
export function editDataBlockNote(dataBlock: DataBlock, note: string): DataBlock {
  const { note: _previous, ...rest } = dataBlock;
  const trimmed = note.trim();
  return trimmed ? { ...rest, note: trimmed } : rest;
}

/**
 * Duplicate a data-block as a variation: a new data-block with a fresh id and the name
 * `<name> (variation)`, holding a deep copy of the packet so the two never share state. Items keep
 * their ids and each gains a `duplicate` provenance step. The original is not touched.
 * Id and time are caller-supplied so this stays pure.
 */
export function duplicateDataBlock(
  dataBlock: DataBlock,
  request: { id: string; createdAt: string }
): DataBlock {
  const copy = structuredClone(dataBlock.packet);
  const items = copy.items.map((item) => ({
    ...item,
    provenance: [
      ...item.provenance,
      {
        sourceNodeInstance: dataBlock.origin?.nodeInstance ?? 'desk',
        sourceItemIds: [item.id],
        transformation: 'duplicate',
        parameters: { dataBlockId: request.id, sourceDataBlockId: dataBlock.id },
      },
    ],
  }));
  const { lineage: _lineage, ...rest } = dataBlock;
  return {
    ...rest,
    id: request.id,
    name: `${dataBlock.name} (variation)`,
    createdAt: request.createdAt,
    packet: { ...copy, items },
    origin: dataBlock.origin && structuredClone(dataBlock.origin),
    lineage: derivedLineage(
      request.id,
      request.createdAt,
      'duplicate',
      derivation(dataBlock, 'duplicate')
    ),
  };
}

export type DataBlockEditResult = { ok: true; dataBlock: DataBlock } | { ok: false; error: string };

/**
 * Per-data-block bounds on the stored version tree (see `pruneLineage`). Sized for IndexedDB, which holds
 * hundreds of megabytes per origin: 500 versions is far more than anyone browses, and 20M JSON
 * characters (about 40 MB as stored) is room for a few dozen versions of a 4096-event data-block.
 */
export const MAX_DATA_BLOCK_VERSIONS = 500;
/** Budget for one data-block's whole stored history (every version and the head packet), in JSON characters. */
export const MAX_LINEAGE_CHARS = 20_000_000;
/**
 * A hand-edit session ends after this much idle time: the next edit starts a new version. Within a
 * session every edit amends the head version, so a stretch of editing is one version.
 */
export const EDIT_SESSION_IDLE_MS = 3 * 60 * 1000;

interface EditSession {
  /** The head version this session has been amending. */
  versionId: string;
  operation: string;
  /** When the session last edited (ms). */
  at: number;
}

/** The open edit session of each data-block. Transient: a reload starts fresh. */
const editSessions = new Map<string, EditSession>();

/**
 * Ends the data-block's hand-edit session, so its next edit starts a new version. The editor calls this
 * when it closes or another data-block becomes the target.
 */
export function endEditSession(dataBlockId: string) {
  editSessions.delete(dataBlockId);
}

export interface LineageLimits {
  maxVersions: number;
  maxChars: number;
}

const DEFAULT_LIMITS: LineageLimits = {
  maxVersions: MAX_DATA_BLOCK_VERSIONS,
  maxChars: MAX_LINEAGE_CHARS,
};

export function newVersionId() {
  return `version-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Plain JSON data only: finite numbers, strings, booleans, null, arrays and plain objects. Never throws. */
function isJsonSafe(value: unknown, ancestors: unknown[] = []): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'object') {
    return false;
  }
  // A cycle (or absurd depth) is not JSON.
  if (ancestors.includes(value) || ancestors.length > 200) {
    return false;
  }
  const next = [...ancestors, value];
  if (Array.isArray(value)) {
    return value.every((entry) => isJsonSafe(entry, next));
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    return false;
  }
  // An undefined property is dropped by JSON, so it is allowed; any other non-JSON value is not.
  return Object.values(value as Record<string, unknown>).every(
    (entry) => entry === undefined || isJsonSafe(entry, next)
  );
}

/** Structural equality of two JSON-safe values (key order is ignored; undefined properties count as absent). */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    return false;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((entry, index) => jsonEqual(entry, b[index]));
  }
  const left = Object.entries(a as Record<string, unknown>).filter(([, v]) => v !== undefined);
  const right = Object.entries(b as Record<string, unknown>).filter(([, v]) => v !== undefined);
  return (
    left.length === right.length &&
    left.every(([key, value]) => jsonEqual(value, (b as Record<string, unknown>)[key]))
  );
}

const versionSizes = new WeakMap<DataBlockVersion, number>();

/** A version's serialized size, measured once per version object (versions are never mutated). */
function versionSize(version: DataBlockVersion) {
  let size = versionSizes.get(version);
  if (size === undefined) {
    size = JSON.stringify(version).length + 1;
    versionSizes.set(version, size);
  }
  return size;
}

const clonePacket = (value: DataPacket) => JSON.parse(JSON.stringify(value)) as DataPacket;

/**
 * Drop versions until the tree is within `limits`, keeping it a connected tree. The head and the
 * root are never dropped. The oldest interior version (one with children, so not a branch tip) goes
 * first, then the oldest tip; the children of a dropped version are re-parented to its parent, so
 * every remaining version still reaches the root. Oldest means earliest in `versions` (creation
 * order). Pruning loses those snapshots for good. The budget counts the head packet too (pass it as
 * `headPacket`: the head version stores none, it is `DataBlock.packet`), so a huge head forces older
 * snapshots out rather than the save failing.
 */
export function pruneLineage(
  lineage: DataBlockLineage,
  limits: LineageLimits = DEFAULT_LIMITS,
  headPacket?: DataPacket
): DataBlockLineage {
  let versions = lineage.versions;
  // Each version object is measured once ever (cached by reference), so an edit does not
  // re-stringify the whole history; a dropped one is subtracted.
  let chars =
    JSON.stringify({ ...lineage, versions: [] }).length +
    (headPacket ? JSON.stringify(headPacket).length : 0) +
    versions.reduce((sum, version) => sum + versionSize(version), 0);
  const over = () => versions.length > limits.maxVersions || chars > limits.maxChars;
  while (over()) {
    const rootId = versions.find((version) => version.parentId === null)?.id;
    const candidates = versions.filter(
      (version) => version.id !== lineage.head && version.id !== rootId
    );
    if (candidates.length === 0) {
      break;
    }
    const parents = new Set(versions.map((version) => version.parentId));
    const interior = candidates.filter((version) => parents.has(version.id));
    const victim = (interior.length > 0 ? interior : candidates)[0];
    chars -= versionSize(victim);
    versions = versions
      .filter((version) => version !== victim)
      .map((version) =>
        version.parentId === victim.id ? { ...version, parentId: victim.parentId } : version
      );
  }
  return versions === lineage.versions ? lineage : { ...lineage, versions };
}

/** Lineage for a data-block that is born derived (duplicate, conversion, create-from-version): a lone root head. */
function derivedLineage(
  dataBlockId: string,
  at: string,
  operation: string,
  derivedFrom: DataBlockDerivation
): DataBlockLineage {
  const id = `version-${dataBlockId}-0`;
  return { head: id, versions: [{ id, parentId: null, at, operation }], derivedFrom };
}

/** Where a new data-block was derived from: the source head version, or null when the source had no lineage. */
function derivation(source: DataBlock, operation: string): DataBlockDerivation {
  return { dataBlockId: source.id, versionId: source.lineage?.head ?? null, operation };
}

export interface CommitOptions {
  /** Id of the new head version; generated when omitted. */
  versionId?: string;
  /** ISO time of the edit; now when omitted. */
  at?: string;
  limits?: LineageLimits;
  /**
   * Marks a hand edit (typing, dragging in an editor): hand edits are grouped into sessions. Without
   * it the edit is a meaningful moment (a transform, a rhythm edit, a conversion) and always makes a
   * version of its own, whatever the operation is called.
   */
  handEdit?: boolean;
}

/**
 * Edit contract: replace a data-block's packet, keeping the same data-block. The result has the same `id`,
 * `createdAt`, `name`, `note` and `origin`; its packet is a deep, JSON-safe copy of `newPacket`
 * (never aliasing it).
 *
 * Provenance: items that are `added` (id not in the old packet) or `modified` (value, label or tie
 * differ) gain a step whose `transformation` is `operation` and whose parameters record `dataBlockId`,
 * `versionId` and `change`; unchanged items get none. Item ids are the caller's obligation: an
 * editor must keep the id of an item it moves or changes, and nothing here enforces it.
 *
 * Versions: the first edit creates the root version from the pre-edit packet; every edit then
 * appends a child of the current head and makes it the head (so editing after a restore branches).
 * Edit sessions: a hand edit (`options.handEdit`) that continues the data-block's open session (same
 * operation, same head version, within `EDIT_SESSION_IDLE_MS` of the previous edit, no
 * `endEditSession` between) amends the head version in place instead of adding one; its provenance
 * is stamped once, relative to the version before the session. Any other operation, a restore, an
 * idle pause or an explicit end starts a new version. Undo is not tied to versions: the data-blocks
 * before and after each commit are separate immutable values.
 * A packet deeply equal to the current one returns the same data-block unchanged. Reordering items is a
 * real change (arrays compare in order): it records a version but stamps no item.
 *
 * Refused as `{ ok: false, error }`, never thrown: a packet that is not plain JSON, not a valid
 * packet, or whose `kind`, `domain` or `encoding` differs (that is a new data-block, not an edit).
 */
export function commitDataBlockEdit(
  dataBlock: DataBlock,
  newPacket: DataPacket,
  operation: string,
  options: CommitOptions = {}
): DataBlockEditResult {
  if (!operation.trim()) {
    return { ok: false, error: 'An edit needs an operation name.' };
  }
  if (!isJsonSafe(newPacket)) {
    return { ok: false, error: 'The edited packet is not plain JSON data, so it was not saved.' };
  }
  const copy = clonePacket(newPacket);
  const itemsValid =
    Array.isArray(copy.items) &&
    copy.items.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.id === 'string' &&
        Array.isArray(item.provenance)
    ) &&
    new Set(copy.items.map((item) => item.id)).size === copy.items.length;
  if (!itemsValid || !Array.isArray(copy.warnings)) {
    return {
      ok: false,
      error: 'The edited packet is not a valid packet (items need unique ids and provenance).',
    };
  }
  const current = dataBlock.packet;
  if (
    copy.kind !== current.kind ||
    copy.domain !== current.domain ||
    copy.encoding !== current.encoding
  ) {
    return {
      ok: false,
      error:
        'An edit cannot change the kind, domain or encoding of a data-block. Make a new data-block instead.',
    };
  }
  if (jsonEqual(current, copy)) {
    return { ok: true, dataBlock };
  }

  const at = options.at ?? new Date().toISOString();
  const atMs = Date.parse(at);
  const session = editSessions.get(dataBlock.id);
  const headVersion = dataBlock.lineage?.versions.find(
    (version) => version.id === dataBlock.lineage?.head
  );
  const parentPacket = dataBlock.lineage?.versions.find(
    (version) => version.id === headVersion?.parentId
  )?.packet;
  const amending =
    options.handEdit === true &&
    session !== undefined &&
    session.operation === operation &&
    Number.isFinite(atMs) &&
    atMs - session.at <= EDIT_SESSION_IDLE_MS &&
    headVersion !== undefined &&
    headVersion.id === session.versionId &&
    headVersion.operation === operation &&
    parentPacket !== undefined;
  const versionId = amending ? headVersion.id : (options.versionId ?? newVersionId());
  // An amended edit is described against the version before the session, and the steps the session
  // already stamped are replaced rather than repeated.
  const baseline = amending ? parentPacket : current;
  const previous = new Map(baseline.items.map((item) => [item.id, item]));
  if (amending) {
    copy.items = copy.items.map((item) => ({
      ...item,
      provenance: item.provenance.filter(
        (step) =>
          !(
            step.parameters?.versionId === versionId &&
            step.parameters?.dataBlockId === dataBlock.id
          )
      ),
    }));
  }
  const items = copy.items.map((item) => {
    const before = previous.get(item.id);
    const change = !before
      ? 'added'
      : jsonEqual(
            { value: before.value, label: before.label, tie: before.tie },
            { value: item.value, label: item.label, tie: item.tie }
          )
        ? 'unchanged'
        : 'modified';
    if (change === 'unchanged') {
      return item;
    }
    return {
      ...item,
      provenance: [
        ...item.provenance,
        {
          sourceNodeInstance: dataBlock.origin?.nodeInstance ?? 'desk',
          sourceItemIds: [item.id],
          transformation: operation,
          parameters: { dataBlockId: dataBlock.id, versionId, change },
        },
      ],
    };
  });

  // The head version stores no packet (it is `dataBlock.packet`); the outgoing head gets its snapshot.
  const editedPacket: DataPacket = { ...copy, items };
  let grown: DataBlockLineage;
  if (amending && dataBlock.lineage) {
    grown = {
      ...dataBlock.lineage,
      versions: dataBlock.lineage.versions.map((version) =>
        version.id === versionId ? { ...version, at } : version
      ),
    };
  } else {
    let base = dataBlock.lineage;
    if (!base) {
      const rootId = newVersionId();
      base = {
        head: rootId,
        versions: [{ id: rootId, parentId: null, at: dataBlock.createdAt, operation: 'original' }],
      };
    }
    const outgoing = base.head;
    grown = {
      ...base,
      head: versionId,
      versions: [
        ...base.versions.map((version) =>
          version.id === outgoing ? { ...version, packet: clonePacket(current) } : version
        ),
        { id: versionId, parentId: outgoing, at, operation },
      ],
    };
  }
  const lineage = pruneLineage(grown, options.limits, editedPacket);

  const edited: DataBlock = {
    ...dataBlock,
    packet: editedPacket,
    origin: dataBlock.origin && structuredClone(dataBlock.origin),
    lineage,
  };
  // Only what this commit made is checked (earlier versions were validated when loaded or
  // committed); loading validates the whole lineage.
  if (!acceptsEditedHead(edited)) {
    return { ok: false, error: 'The edited packet is not a valid packet, so it was not saved.' };
  }
  if (options.handEdit === true) {
    editSessions.set(dataBlock.id, {
      versionId,
      operation,
      at: Number.isFinite(atMs) ? atMs : Date.now(),
    });
  } else {
    editSessions.delete(dataBlock.id);
  }
  return { ok: true, dataBlock: edited };
}

/**
 * Make an earlier version the data-block's current state. Same data-block (`id`, name and so on); the head
 * moves to `versionId`, the packet becomes that version's packet, and the version we left keeps its
 * snapshot, so nothing is lost and the move can itself be undone. A following edit branches from
 * the restored version. Restoring the head changes nothing. Refused for a data-block with no history or
 * an unknown version.
 */
export function restoreDataBlockVersion(
  dataBlock: DataBlock,
  versionId: string
): DataBlockEditResult {
  const { lineage } = dataBlock;
  if (!lineage) {
    return { ok: false, error: 'This data-block has no earlier versions.' };
  }
  const target = lineage.versions.find((version) => version.id === versionId);
  if (!target) {
    return { ok: false, error: 'That version is no longer kept for this data-block.' };
  }
  if (target.id === lineage.head || !target.packet) {
    return { ok: true, dataBlock };
  }
  const restored = clonePacket(target.packet);
  // A restore is a meaningful moment: the next hand edit starts a new version (a branch).
  endEditSession(dataBlock.id);
  return {
    ok: true,
    dataBlock: {
      ...dataBlock,
      packet: restored,
      lineage: {
        ...lineage,
        head: target.id,
        versions: lineage.versions.map((version) => {
          if (version.id === lineage.head) {
            return { ...version, packet: clonePacket(dataBlock.packet) };
          }
          if (version.id === target.id) {
            const { packet: _moved, ...rest } = version;
            return rest;
          }
          return version;
        }),
      },
    },
  };
}

/**
 * A new data-block from an earlier (or the current) version of `dataBlock`: a deep copy of that version's
 * packet, named `<name> (from earlier)`, with a fresh id, `derivedFrom` pointing at the source and
 * version, and its own one-version history. Items gain a `create-from-version` provenance step. The
 * source is not touched; the new data-block does not copy its version tree.
 */
export function createDataBlockFromVersion(
  dataBlock: DataBlock,
  versionId: string,
  request: { id: string; createdAt: string }
): DataBlockEditResult {
  const lineage = dataBlock.lineage;
  const version = lineage?.versions.find((candidate) => candidate.id === versionId);
  if (!lineage || !version) {
    return { ok: false, error: 'That version is no longer kept for this data-block.' };
  }
  const source = version.id === lineage.head ? dataBlock.packet : version.packet;
  if (!source) {
    return { ok: false, error: 'That version is no longer kept for this data-block.' };
  }
  const operation = 'create-from-version';
  const copy = clonePacket(source);
  const items = copy.items.map((item) => ({
    ...item,
    provenance: [
      ...item.provenance,
      {
        sourceNodeInstance: dataBlock.origin?.nodeInstance ?? 'desk',
        sourceItemIds: [item.id],
        transformation: operation,
        parameters: { dataBlockId: request.id, sourceDataBlockId: dataBlock.id, versionId },
      },
    ],
  }));
  const { lineage: _drop, ...rest } = dataBlock;
  return {
    ok: true,
    dataBlock: {
      ...rest,
      id: request.id,
      name: `${dataBlock.name} (from earlier)`,
      createdAt: request.createdAt,
      packet: { ...copy, items },
      origin: dataBlock.origin && structuredClone(dataBlock.origin),
      lineage: derivedLineage(request.id, request.createdAt, operation, {
        dataBlockId: dataBlock.id,
        versionId,
        operation,
      }),
    },
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
  | { ok: true; dataBlock: DataBlock }
  /** A hard refusal: the data-block cannot be converted at all. */
  | { ok: false; needsSnap?: false; error: string }
  /** Some pitches are off the project EDO grid; converting needs `snap: true` (the user's say-so). */
  | { ok: false; needsSnap: true; edo: number; offGridCount: number; message: string };

/**
 * Why a data-block can never be converted to pitch classes, or null when it can (possibly after
 * snapping). Only `events | note` with at least one note and finite pitches converts: anything else
 * is refused, never guessed at. Off-grid pitches are not a refusal; see `convertDataBlockToPitchClass`.
 */
export function pitchClassConversionRefusal(dataBlock: DataBlock): string | null {
  const { packet } = dataBlock;
  if (packet.kind !== 'events' || packet.domain !== 'note') {
    return `Only note data-blocks (events | note) can be converted to pitch classes, not ${packet.kind} | ${packet.domain}.`;
  }
  if (packet.items.length === 0) {
    return 'There is nothing to convert: the data-block has no notes.';
  }
  const items = packet.items as DataItem<NoteEventValue>[];
  const invalid = items.some((item) =>
    item.value.pitches.some((midicents) => !Number.isFinite(midicents))
  );
  if (invalid) {
    return 'This data-block has a pitch that is not a finite number, so it cannot be converted. Nothing was converted.';
  }
  return null;
}

/**
 * Convert an `events | note` data-block to `events | pitchClass` (`chromatic-${edo}`, edo being the
 * project EDO, default 12): each pitch becomes `round(midicents / (1200 / edo))` mod edo. Timing and
 * frame are kept; items keep their ids and gain a `to-pitch-class` provenance step. Returns a new
 * data-block named `<name> (pitch classes)` with a fresh id; the original is not touched. Id and time
 * are caller-supplied so this stays pure.
 *
 * If any pitch is off the EDO grid (further than `PITCH_GRID_TOLERANCE_MIDICENTS` from a step) the
 * result is `needsSnap` unless `snap` is true; then each pitch rounds to the nearest step and the
 * provenance parameters record the edo and how many pitches were snapped.
 */
export function convertDataBlockToPitchClass(
  dataBlock: DataBlock,
  request: { id: string; createdAt: string; edo?: number; snap?: boolean }
): PitchClassConversionResult {
  const refusal = pitchClassConversionRefusal(dataBlock);
  if (refusal) {
    return { ok: false, error: refusal };
  }
  const edo = request.edo ?? 12;
  if (!Number.isInteger(edo) || edo < 1) {
    return { ok: false, error: `${edo} is not a valid EDO, so nothing was converted.` };
  }
  const step = 1200 / edo;
  const source = dataBlock.packet as DataPacket<NoteEventValue>;
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
          sourceNodeInstance: dataBlock.origin?.nodeInstance ?? 'desk',
          sourceItemIds: [item.id],
          transformation: 'to-pitch-class',
          parameters: {
            dataBlockId: request.id,
            sourceDataBlockId: dataBlock.id,
            edo,
            snappedCount: offGridCount,
          },
        },
      ],
    };
  });
  const { lineage: _lineage, ...rest } = dataBlock;
  return {
    ok: true,
    dataBlock: {
      ...rest,
      id: request.id,
      name: `${dataBlock.name} (pitch classes)`,
      createdAt: request.createdAt,
      packet: { ...copy, domain: 'pitchClass', encoding: `chromatic-${edo}`, items } as DataPacket,
      origin: dataBlock.origin && structuredClone(dataBlock.origin),
      lineage: derivedLineage(
        request.id,
        request.createdAt,
        'to-pitch-class',
        derivation(dataBlock, 'to-pitch-class')
      ),
    },
  };
}

/** The cheap check after a commit: a packet-shaped head, and a head version that is in the tree. */
function acceptsEditedHead(dataBlock: DataBlock) {
  const { lineage } = dataBlock;
  if (!isPacketShape(dataBlock.packet) || !lineage) {
    return false;
  }
  const head = lineage.versions.find((version) => version.id === lineage.head);
  return (
    head !== undefined &&
    head.packet === undefined &&
    (head.parentId === null || lineage.versions.some((version) => version.id === head.parentId))
  );
}

/** For `usePersistentState`: a shape check, so a corrupt or newer desk falls back instead of crashing. */
export function acceptsDataBlocks(value: unknown): value is DataBlock[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => {
      if (typeof entry !== 'object' || entry === null) {
        return false;
      }
      const dataBlock = entry as Partial<DataBlock>;
      const packet = dataBlock.packet as Partial<DataPacket> | undefined;
      return (
        dataBlock.schemaVersion === 1 &&
        typeof dataBlock.id === 'string' &&
        typeof dataBlock.name === 'string' &&
        typeof dataBlock.createdAt === 'string' &&
        (dataBlock.note === undefined || typeof dataBlock.note === 'string') &&
        (dataBlock.lineage === undefined || acceptsLineage(dataBlock.lineage)) &&
        typeof packet === 'object' &&
        packet !== null &&
        typeof packet.kind === 'string' &&
        typeof packet.domain === 'string' &&
        Array.isArray(packet.items)
      );
    })
  );
}

const isPacketShape = (value: unknown): value is DataPacket => {
  const packet = value as Partial<DataPacket> | null;
  return (
    typeof packet === 'object' &&
    packet !== null &&
    typeof packet.kind === 'string' &&
    typeof packet.domain === 'string' &&
    Array.isArray(packet.items)
  );
};

/**
 * A stored lineage is sound when it is plain JSON, has exactly one root, every `parentId` names a
 * kept version, every version reaches the root (no cycles), `head` exists and holds no packet, and
 * every other version holds one. Anything else is rejected, so a damaged tree falls back like any
 * corrupt desk instead of crashing a viewer later.
 */
function acceptsLineage(value: unknown): value is DataBlockLineage {
  if (!isJsonSafe(value)) {
    return false;
  }
  const lineage = value as Partial<DataBlockLineage>;
  if (
    typeof lineage !== 'object' ||
    lineage === null ||
    typeof lineage.head !== 'string' ||
    !Array.isArray(lineage.versions) ||
    lineage.versions.length === 0
  ) {
    return false;
  }
  const derived = lineage.derivedFrom;
  if (
    derived !== undefined &&
    !(
      typeof derived === 'object' &&
      derived !== null &&
      typeof derived.dataBlockId === 'string' &&
      (typeof derived.versionId === 'string' || derived.versionId === null) &&
      typeof derived.operation === 'string'
    )
  ) {
    return false;
  }
  const byId = new Map<string, DataBlockVersion>();
  for (const version of lineage.versions) {
    if (
      typeof version !== 'object' ||
      version === null ||
      typeof version.id !== 'string' ||
      (version.parentId !== null && typeof version.parentId !== 'string') ||
      typeof version.at !== 'string' ||
      typeof version.operation !== 'string' ||
      byId.has(version.id)
    ) {
      return false;
    }
    if (
      version.id === lineage.head ? version.packet !== undefined : !isPacketShape(version.packet)
    ) {
      return false;
    }
    byId.set(version.id, version);
  }
  if (!byId.has(lineage.head)) {
    return false;
  }
  if (lineage.versions.filter((version) => version.parentId === null).length !== 1) {
    return false;
  }
  return lineage.versions.every((version) => {
    let node: DataBlockVersion | undefined = version;
    for (let steps = 0; node && node.parentId !== null; steps += 1) {
      if (steps > byId.size) {
        return false;
      }
      node = byId.get(node.parentId);
    }
    return node !== undefined;
  });
}
