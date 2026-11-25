import { rational } from '../musicalTime';
import { OBJECT_TYPE_ID, type StripParent } from './sceneTypes';

/**
 * Migration of stored objects from before strips (workbench S0, W-75, scenario row 12). Pure: no React,
 * no storage. Runs on the raw stored list BEFORE it is validated (the desk read in `deskStore.ts`, the
 * project open in `deskStore.ts`, and a project import in `projects.ts`), because an object without
 * `strips` no longer passes validation, so the whole desk would be rejected. Idempotent: an object that
 * already has `strips` is returned as it is.
 *
 * Each old object becomes the same object with ONE strip carrying its old start, duration, mapping,
 * content offset, data, modifiers (strip mute is false; the object's mute stays on the object). The old
 * parent object becomes `parentStrip` = that parent object's first strip; a parent that is missing, is
 * not an object, or closes a parent loop becomes null.
 */

export const MIGRATED_STRIP_ID = 'strip-1';

type Loose = Record<string, unknown>;

const isRecord = (value: unknown): value is Loose =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The data record of a stored object block, or null for any other entry. */
function objectData(entry: unknown): Loose | null {
  if (!isRecord(entry) || entry.typeId !== OBJECT_TYPE_ID || !isRecord(entry.payload)) {
    return null;
  }
  const payload = entry.payload;
  return payload.kind === 'record' && isRecord(payload.data) ? payload.data : null;
}

const isOldShape = (data: Loose) => !Array.isArray(data.strips) && isRecord(data.timeSpan);

const parentIdOf = (data: Loose): string | null =>
  isRecord(data.parentRef) && typeof data.parentRef.id === 'string' ? data.parentRef.id : null;

/** The stored list with every old-shape object converted; entries that need nothing keep their identity. */
export function migrateStoredBlocks<T>(entries: readonly T[]): T[] {
  const byId = new Map<string, Loose>();
  for (const entry of entries) {
    const data = objectData(entry);
    if (data && isRecord(entry) && typeof entry.id === 'string') {
      byId.set(entry.id, data);
    }
  }
  const firstStripId = (id: string): string | null => {
    const data = byId.get(id);
    if (!data) {
      return null;
    }
    if (Array.isArray(data.strips)) {
      const first = data.strips[0];
      return isRecord(first) && typeof first.id === 'string' ? first.id : null;
    }
    return isOldShape(data) ? MIGRATED_STRIP_ID : null;
  };
  /** The parent's id, unless following the old parents leads back to `id` (a loop) or to nothing. */
  const parentOf = (id: string, data: Loose): StripParent | null => {
    const parentId = parentIdOf(data);
    if (parentId === null) {
      return null;
    }
    const seen = new Set<string>();
    let current: string | null = parentId;
    while (current !== null) {
      if (current === id) {
        return null;
      }
      if (seen.has(current)) {
        break; // a loop that does not include this object: this object stays under its parent
      }
      seen.add(current);
      const next = byId.get(current);
      current = next && isOldShape(next) ? parentIdOf(next) : null;
    }
    const stripId = firstStripId(parentId);
    return stripId === null ? null : { objectId: parentId, stripId };
  };
  return entries.map((entry) => {
    const data = objectData(entry);
    if (!data || !isRecord(entry) || !isOldShape(data)) {
      return entry;
    }
    const timeSpan = data.timeSpan as Loose;
    const strip = {
      id: MIGRATED_STRIP_ID,
      dataRef: data.primaryDataRef ?? null,
      start: timeSpan.start,
      duration: timeSpan.duration,
      mapping: data.mapping,
      contentOffset: data.contentOffset ?? rational(0),
      modifiers: Array.isArray(data.modifiers) ? data.modifiers : [],
      mute: false,
      parentStrip: parentOf(String(entry.id), data),
    };
    return {
      ...entry,
      payload: {
        kind: 'record',
        data: { registerSpan: data.registerSpan, mute: data.mute, strips: [strip] },
      },
    };
  });
}
