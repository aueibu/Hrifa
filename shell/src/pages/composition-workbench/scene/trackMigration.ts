import { COLLECTION_TYPE_ID, OBJECT_TYPE_ID, TRACK_TYPE_ID } from './sceneTypes';

/**
 * Migration of stored objects onto Tracks (workbench TK1a, W-82, `SCENARIOS.tracks.md` scenario 11).
 * Pure: no React, no storage. Works on the raw stored list, loose records in, loose records out.
 *
 * NOT WIRED YET: nothing calls `migrateTracks` (not `deskStore.ts`, not `projects.ts`). The live
 * Outliner and Arranger still read objects straight from collections, so running it now would break
 * the app. TK1b wires it together with the evaluator, ops and readers.
 *
 * Rules, per collection block (in list order) whose `memberRefs` list objects that hold no `trackRef`:
 * - ONE Track block `<collectionId>:track` is made (name and `createdAt` and schema version copied from
 *   the collection, `mute: false`), placed right after its collection.
 * - The collection's `memberRefs` swap those objects for ONE ref to the Track, at the place of the
 *   FIRST such object; sub-collection refs keep their order and place.
 * - Each such object gets `trackRef` and loses its stored `lane` (the Arranger lays overlaps out
 *   automatically; the old lane number is dropped).
 * - An object listed by two collections goes to the FIRST listing; the later listing is removed, and a
 *   collection left with no objects of its own gets no Track.
 * Objects listed by no collection, objects already holding a `trackRef`, and collections listing no
 * such objects are left alone. Idempotent: a second run returns the same array.
 */

type Loose = Record<string, unknown>;

const isRecord = (value: unknown): value is Loose =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The data record of a stored block of `typeId`, or null for any other entry. */
function recordData(entry: unknown, typeId: string): Loose | null {
  if (!isRecord(entry) || entry.typeId !== typeId || !isRecord(entry.payload)) {
    return null;
  }
  const payload = entry.payload;
  return payload.kind === 'record' && isRecord(payload.data) ? payload.data : null;
}

const withData = (entry: Loose, data: Loose): Loose => ({
  ...entry,
  payload: { ...(entry.payload as Loose), data },
});

export function migrateTracks<T>(entries: readonly T[]): T[] {
  const ids = new Set<string>();
  const unplaced = new Set<string>(); // objects with no trackRef yet
  for (const entry of entries) {
    if (!isRecord(entry) || typeof entry.id !== 'string') {
      continue;
    }
    ids.add(entry.id);
    const object = recordData(entry, OBJECT_TYPE_ID);
    if (object && (object.trackRef === undefined || object.trackRef === null)) {
      unplaced.add(entry.id);
    }
  }

  const claimed = new Map<string, string>(); // object id -> track id
  const replacement = new Map<Loose, Loose[]>(); // collection entry -> [collection, track?]
  for (const entry of entries) {
    const data = recordData(entry, COLLECTION_TYPE_ID);
    if (
      !data ||
      !isRecord(entry) ||
      typeof entry.id !== 'string' ||
      !Array.isArray(data.memberRefs)
    ) {
      continue;
    }
    const trackId = `${entry.id}:track`;
    if (ids.has(trackId)) {
      continue; // already migrated (or the id is taken): leave it
    }
    const refs = data.memberRefs as unknown[];
    const idOf = (ref: unknown) => (isRecord(ref) && typeof ref.id === 'string' ? ref.id : null);
    const mine: string[] = [];
    let changed = false;
    const nextRefs: unknown[] = [];
    for (const ref of refs) {
      const id = idOf(ref);
      if (id === null || !unplaced.has(id)) {
        nextRefs.push(ref);
      } else if (claimed.has(id)) {
        changed = true; // the first listing won: drop this later one
      } else {
        claimed.set(id, trackId);
        mine.push(id);
        changed = true;
        if (mine.length === 1) {
          nextRefs.push({ id: trackId });
        }
      }
    }
    if (!changed) {
      continue;
    }
    const next = withData(entry, { ...data, memberRefs: nextRefs });
    const out: Loose[] = [next];
    if (mine.length > 0) {
      out.push({
        schemaVersion: entry.schemaVersion,
        id: trackId,
        typeId: TRACK_TYPE_ID,
        name: entry.name,
        createdAt: entry.createdAt,
        payload: { kind: 'record', data: { mute: false } },
      });
    }
    replacement.set(entry, out);
  }

  if (replacement.size === 0) {
    return entries as T[];
  }
  const result: unknown[] = [];
  for (const entry of entries) {
    if (isRecord(entry) && replacement.has(entry)) {
      result.push(...(replacement.get(entry) as Loose[]));
      continue;
    }
    const trackId =
      isRecord(entry) && typeof entry.id === 'string' ? claimed.get(entry.id) : undefined;
    const object = recordData(entry, OBJECT_TYPE_ID);
    if (trackId !== undefined && object) {
      const { lane: _lane, ...rest } = object;
      result.push(withData(entry as Loose, { ...rest, trackRef: { id: trackId } }));
    } else {
      result.push(entry);
    }
  }
  return result as T[];
}
