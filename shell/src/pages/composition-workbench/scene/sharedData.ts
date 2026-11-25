import type { StoredDataBlock } from '../dataBlocks/registry';
import { objectDataOf } from './sceneTypes';

/**
 * Shared data in the Arranger (W-79), computed from the objects' primary data references only: nothing is
 * stored. Two or more objects that point at the same data-block share it (Duplicate Linked makes this).
 * A shared parent or modifier does not count, and an Empty object (no primary data) never does.
 */
export interface SharedData {
  /** The shared data-block. */
  dataId: string;
  /** The other objects that use it (not the object itself), in the order given. */
  others: string[];
  /** How many objects use it, itself included (2 or more). */
  count: number;
}

/** For each object (of `objectIds`, in a scene) whose data another of them also uses: who shares it. */
export function sharedDataOf(
  blocks: readonly StoredDataBlock[],
  objectIds: readonly string[]
): Map<string, SharedData> {
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const users = new Map<string, string[]>();
  for (const id of objectIds) {
    const dataId = objectDataOf(byId.get(id))?.primaryDataRef?.id;
    if (dataId !== undefined) {
      users.set(dataId, [...(users.get(dataId) ?? []), id]);
    }
  }
  const out = new Map<string, SharedData>();
  for (const [dataId, ids] of users) {
    if (ids.length < 2) {
      continue;
    }
    for (const id of ids) {
      out.set(id, { dataId, others: ids.filter((other) => other !== id), count: ids.length });
    }
  }
  return out;
}
