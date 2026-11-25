import type { StoredDataBlock } from '../dataBlocks/registry';
import { collectionDataOf, objectDataOf, sceneDataOf } from './sceneTypes';

/**
 * The Outliner's visible tree (workbench O2a), pure. The scene's root collection is not shown. Inside a
 * collection an object whose parent is another member of the SAME collection nests under it; otherwise it
 * sits at the collection's level. Collections nest. A cycle or a block listed twice never hangs: each
 * block is shown once, and members caught in a parent cycle sit at the collection's level.
 */

export interface OutlinerRow {
  id: string;
  kind: 'object' | 'collection';
  depth: number;
  name: string;
  /** The row this one is listed under (its parent object or collection), or null at the top. */
  parentRowId: string | null;
  /** Its own mute flag. */
  mute: boolean;
  /** True when an enclosing collection is muted (the row is silent but its own flag is untouched). */
  inheritedMute: boolean;
  /** Own or inherited. */
  muted: boolean;
  hasChildren: boolean;
  /** The primary data-block's name, or '' (an Empty). Collections: ''. */
  data: string;
  warnings: string[];
}

export function outlinerRows(blocks: readonly StoredDataBlock[], sceneId: string): OutlinerRow[] {
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const rootId = sceneDataOf(byId.get(sceneId))?.rootCollectionRef?.id;
  if (rootId === undefined) {
    return [];
  }
  const rows: OutlinerRow[] = [];
  const shown = new Set<string>([rootId]);

  const listCollection = (
    collectionId: string,
    depth: number,
    parentRowId: string | null,
    inherited: boolean
  ) => {
    const collection = collectionDataOf(byId.get(collectionId));
    if (!collection) {
      return;
    }
    const members = collection.memberRefs
      .map((member) => byId.get(member.id))
      .filter((block): block is StoredDataBlock => block !== undefined && !shown.has(block.id));
    const memberIds = new Set(members.map((block) => block.id));
    const parentOf = (block: StoredDataBlock) => {
      const parent = objectDataOf(block)?.parentRef?.id;
      return parent !== undefined && parent !== block.id && memberIds.has(parent) ? parent : null;
    };
    const childrenOf = new Map<string, StoredDataBlock[]>();
    for (const block of members) {
      const parent = parentOf(block);
      if (parent !== null && objectDataOf(byId.get(parent))) {
        childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), block]);
      }
    }
    const visit = (block: StoredDataBlock, level: number, under: string | null) => {
      if (shown.has(block.id)) {
        return;
      }
      shown.add(block.id);
      const object = objectDataOf(block);
      const group = collectionDataOf(block);
      if (object) {
        const kids = (childrenOf.get(block.id) ?? []).filter((kid) => !shown.has(kid.id));
        rows.push({
          id: block.id,
          kind: 'object',
          depth: level,
          name: block.name,
          parentRowId: under,
          mute: object.mute,
          inheritedMute: inherited,
          muted: object.mute || inherited,
          hasChildren: kids.length > 0,
          data:
            object.primaryDataRef === null ? '' : (byId.get(object.primaryDataRef.id)?.name ?? ''),
          warnings: [],
        });
        kids.forEach((kid) => visit(kid, level + 1, block.id));
      } else if (group) {
        const own = group.memberRefs.filter(
          (member) => byId.has(member.id) && !shown.has(member.id)
        ).length;
        rows.push({
          id: block.id,
          kind: 'collection',
          depth: level,
          name: block.name,
          parentRowId: under,
          mute: group.mute,
          inheritedMute: inherited,
          muted: group.mute || inherited,
          hasChildren: own > 0,
          data: '',
          warnings: [],
        });
        listCollection(block.id, level + 1, block.id, inherited || group.mute);
      }
    };
    // Top level: members with no parent among the members; then anything a parent cycle left out.
    members
      .filter((block) => parentOf(block) === null)
      .forEach((block) => visit(block, depth, parentRowId));
    members.forEach((block) => visit(block, depth, parentRowId));
  };

  listCollection(rootId, 0, null, collectionDataOf(byId.get(rootId))?.mute ?? false);
  return rows;
}
