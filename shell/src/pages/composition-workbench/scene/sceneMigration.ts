import { rational } from '../musicalTime';
import { COLLECTION_TYPE_ID, OBJECT_TYPE_ID } from './sceneTypes';

/**
 * Migration of stored objects back to one placement each (workbench L0, W-77, `SCENARIOS.strips.md`
 * row 12 reversed). Pure: no React, no storage. Runs on the raw stored list BEFORE it is validated (the
 * desk read and the project open in `deskStore.ts`, a project import in `projects.ts`), because an
 * object that still holds `strips` no longer passes validation, so the whole desk would be rejected.
 * Idempotent: an object already in the one-placement shape is returned as it is.
 *
 * - An object stored with `strips` (W-75): its FIRST strip unwraps into the same object id (start,
 *   duration, mapping, content offset, modifiers; the strip's data becomes `primaryDataRef`; the object
 *   is muted when the object or the strip was). Each extra strip becomes a NEW object with the id
 *   `<objectId>:<stripId>` (so a second run changes nothing), named "<name> 2", "<name> 3" ... in strip
 *   order (made unique per type), carrying that strip's fields and the object's register span. Every
 *   collection that listed the object lists the new objects right after it. An object with no strips
 *   becomes an Empty (no data, start 0, 4 quarters, Loop).
 * - A strip's `parentStrip` becomes `parentRef` to the object that now holds that strip; a parent that
 *   is missing or closes a parent loop becomes null.
 * - An object from before strips has the one-placement shape already; only a missing `contentOffset`
 *   is added (0).
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

const stripsOf = (data: Loose): Loose[] | null =>
  Array.isArray(data.strips) ? data.strips.filter(isRecord) : null;

const newObjectId = (objectId: string, stripId: string) => `${objectId}:${stripId}`;

/** The stored list with every strip-shape object converted; entries that need nothing keep their identity. */
export function migrateStoredBlocks<T>(entries: readonly T[]): T[] {
  // Which object holds each (object, strip) after the unwrap.
  const holders = new Map<string, string>();
  const stripped = new Map<string, Loose[]>();
  for (const entry of entries) {
    const data = recordData(entry, OBJECT_TYPE_ID);
    const strips = data ? stripsOf(data) : null;
    if (!strips || !isRecord(entry) || typeof entry.id !== 'string') {
      continue;
    }
    stripped.set(entry.id, strips);
    strips.forEach((strip, index) => {
      if (typeof strip.id === 'string') {
        holders.set(
          `${entry.id}\u0000${strip.id}`,
          index === 0 ? String(entry.id) : newObjectId(String(entry.id), strip.id)
        );
      }
    });
  }
  const needsContentOffset = (data: Loose) =>
    !Array.isArray(data.strips) && isRecord(data.timeSpan) && data.contentOffset === undefined;
  if (
    stripped.size === 0 &&
    !entries.some((entry) => {
      const data = recordData(entry, OBJECT_TYPE_ID);
      return data !== null && needsContentOffset(data);
    })
  ) {
    return entries as T[];
  }

  // Parent of each converted object (by its new id), before loops are cut.
  const parents = new Map<string, string | null>();
  const parentOfStrip = (strip: Loose): string | null => {
    const parent = strip.parentStrip;
    if (!isRecord(parent) || typeof parent.objectId !== 'string') {
      return null;
    }
    return holders.get(`${parent.objectId}\u0000${String(parent.stripId)}`) ?? null;
  };
  for (const [objectId, strips] of stripped) {
    strips.forEach((strip, index) => {
      if (typeof strip.id === 'string') {
        parents.set(index === 0 ? objectId : newObjectId(objectId, strip.id), parentOfStrip(strip));
      }
    });
  }
  const parentRefFor = (id: string): { id: string } | null => {
    const first = parents.get(id) ?? null;
    if (first === null) {
      return null;
    }
    const seen = new Set<string>();
    let current: string | null = first;
    while (current !== null) {
      if (current === id) {
        return null;
      }
      if (seen.has(current)) {
        break; // a loop that does not include this object: it stays under its parent
      }
      seen.add(current);
      current = parents.get(current) ?? null;
    }
    return { id: first };
  };

  const usedNames = new Set<string>();
  for (const entry of entries) {
    if (isRecord(entry) && entry.typeId === OBJECT_TYPE_ID && typeof entry.name === 'string') {
      usedNames.add(entry.name);
    }
  }
  const uniqueObjectName = (base: string): string => {
    let candidate = base;
    for (let n = 1; usedNames.has(candidate); n += 1) {
      candidate = `${base}.${String(n).padStart(3, '0')}`;
    }
    usedNames.add(candidate);
    return candidate;
  };

  // The ids each object expands to (itself first), for the collections below.
  const expansion = new Map<string, string[]>();
  const objectFromStrip = (
    entry: Loose,
    data: Loose,
    strip: Loose,
    id: string,
    name: string
  ): Loose => ({
    ...entry,
    id,
    name,
    payload: {
      kind: 'record',
      data: {
        parentRef: parentRefFor(id),
        timeSpan: { start: strip.start, duration: strip.duration },
        contentOffset: strip.contentOffset ?? rational(0),
        registerSpan: data.registerSpan,
        primaryDataRef: strip.dataRef ?? null,
        mapping: strip.mapping,
        modifiers: Array.isArray(strip.modifiers) ? strip.modifiers : [],
        mute: data.mute === true || strip.mute === true,
      },
    },
  });

  const converted: unknown[] = [];
  for (const entry of entries) {
    const objectData = recordData(entry, OBJECT_TYPE_ID);
    if (!objectData || !isRecord(entry)) {
      converted.push(entry);
      continue;
    }
    const strips = stripsOf(objectData);
    if (!strips) {
      converted.push(
        needsContentOffset(objectData)
          ? {
              ...entry,
              payload: { kind: 'record', data: { ...objectData, contentOffset: rational(0) } },
            }
          : entry
      );
      continue;
    }
    const id = String(entry.id);
    if (strips.length === 0) {
      converted.push({
        ...entry,
        payload: {
          kind: 'record',
          data: {
            parentRef: null,
            timeSpan: { start: rational(0), duration: rational(4) },
            contentOffset: rational(0),
            registerSpan: objectData.registerSpan,
            primaryDataRef: null,
            mapping: 'loop',
            modifiers: [],
            mute: objectData.mute === true,
          },
        },
      });
      continue;
    }
    const ids = [id];
    converted.push(objectFromStrip(entry, objectData, strips[0], id, String(entry.name)));
    strips.slice(1).forEach((strip, offset) => {
      const extra = newObjectId(id, String(strip.id));
      ids.push(extra);
      converted.push(
        objectFromStrip(
          entry,
          objectData,
          strip,
          extra,
          uniqueObjectName(`${String(entry.name)} ${offset + 2}`)
        )
      );
    });
    expansion.set(id, ids);
  }
  if (expansion.size === 0) {
    return converted as T[];
  }
  return converted.map((entry) => {
    const collection = recordData(entry, COLLECTION_TYPE_ID);
    if (!collection || !isRecord(entry) || !Array.isArray(collection.memberRefs)) {
      return entry;
    }
    const memberRefs: unknown[] = [];
    const listed = new Set<string>();
    for (const member of collection.memberRefs) {
      const memberId = isRecord(member) && typeof member.id === 'string' ? member.id : null;
      if (memberId === null) {
        memberRefs.push(member);
        continue;
      }
      for (const id of expansion.get(memberId) ?? [memberId]) {
        if (!listed.has(id)) {
          listed.add(id);
          memberRefs.push(id === memberId ? member : { id });
        }
      }
    }
    return memberRefs.length === collection.memberRefs.length &&
      memberRefs.every((member, index) => member === (collection.memberRefs as unknown[])[index])
      ? entry
      : { ...entry, payload: { kind: 'record', data: { ...collection, memberRefs } } };
  }) as T[];
}
