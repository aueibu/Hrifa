import type { StoredDataBlock } from '../dataBlocks/registry';
import { compareRational, rational, type Rational } from '../musicalTime';
import {
  chainPlacement,
  collectionDataOf,
  objectChain,
  objectDataOf,
  sceneDataOf,
  trackDataOf,
} from './sceneTypes';

/**
 * The Outliner's visible tree (workbench O2a, Tracks in TK2, W-82), pure. The scene's root collection is not
 * shown. A Collection lists its Tracks and sub-Collections in its own order; a Track row is followed by
 * the objects whose `trackRef` names it, in start-time order (then id). Inside a Track an object whose
 * parent is another object of the SAME Track nests under it; a child whose parent is on ANOTHER Track
 * (or on none) stays at the Track level and carries `childOf`, which the row shows as a small child-of
 * icon that selects the parent. A cycle or a block listed twice never hangs: each block is shown once, and
 * members caught in a parent cycle sit at the Track level. An object listed directly by a Collection
 * with no Track (an old save that was not migrated) sits at the Collection level.
 */

export interface OutlinerRow {
  id: string;
  kind: 'object' | 'collection' | 'track';
  depth: number;
  name: string;
  /** The row this one is listed under (its parent object, Track or collection), or null at the top. */
  parentRowId: string | null;
  /** Its own mute flag. */
  mute: boolean;
  /** True when an enclosing collection or Track is muted (the row is silent but its own flag is untouched). */
  inheritedMute: boolean;
  /** Own or inherited. */
  muted: boolean;
  hasChildren: boolean;
  /** The primary data-block's name, or '' (an Empty). Collections and Tracks: ''. */
  data: string;
  /** An object whose parent is on another Track: that parent (the row shows a child-of icon). */
  childOf: { id: string; name: string } | null;
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

  // Objects per Track, from `trackRef` (the one truth), in start-time order.
  const worldStart = (block: StoredDataBlock): Rational => {
    const chain = objectChain(byId, block.id);
    return chain === null || chain.length === 0
      ? (objectDataOf(block)?.timeSpan.start ?? rational(0))
      : chainPlacement(chain).start;
  };
  const onTrack = new Map<string, StoredDataBlock[]>();
  for (const block of blocks) {
    const trackId = objectDataOf(block)?.trackRef?.id;
    if (trackId !== undefined) {
      onTrack.set(trackId, [...(onTrack.get(trackId) ?? []), block]);
    }
  }
  const starts = new Map<string, Rational>();
  for (const list of onTrack.values()) {
    list.forEach((block) => starts.set(block.id, worldStart(block)));
    list.sort(
      (a, b) =>
        compareRational(starts.get(a.id)!, starts.get(b.id)!) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
  }

  const objectRow = (
    block: StoredDataBlock,
    depth: number,
    under: string | null,
    inherited: boolean,
    hasChildren: boolean,
    sameGroup: ReadonlySet<string>
  ): OutlinerRow => {
    const object = objectDataOf(block)!;
    const parentId = object.parentRef?.id;
    const parent = parentId === undefined ? undefined : byId.get(parentId);
    return {
      id: block.id,
      kind: 'object',
      depth,
      name: block.name,
      parentRowId: under,
      mute: object.mute,
      inheritedMute: inherited,
      muted: object.mute || inherited,
      hasChildren,
      data: object.primaryDataRef === null ? '' : (byId.get(object.primaryDataRef.id)?.name ?? ''),
      childOf:
        parent && objectDataOf(parent) && parentId !== block.id && !sameGroup.has(parent.id)
          ? { id: parent.id, name: parent.name }
          : null,
      warnings: [],
    };
  };

  /** The objects of one group (a Track, or the old direct listing of a collection), nested by same-group parent. */
  const listObjects = (
    members: StoredDataBlock[],
    depth: number,
    parentRowId: string | null,
    inherited: boolean
  ) => {
    const live = members.filter((block) => !shown.has(block.id) && objectDataOf(block));
    const ids = new Set(live.map((block) => block.id));
    const parentOf = (block: StoredDataBlock) => {
      const parent = objectDataOf(block)?.parentRef?.id;
      return parent !== undefined && parent !== block.id && ids.has(parent) ? parent : null;
    };
    const childrenOf = new Map<string, StoredDataBlock[]>();
    for (const block of live) {
      const parent = parentOf(block);
      if (parent !== null) {
        childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), block]);
      }
    }
    const visit = (block: StoredDataBlock, level: number, under: string | null) => {
      if (shown.has(block.id)) {
        return;
      }
      shown.add(block.id);
      const kids = (childrenOf.get(block.id) ?? []).filter((kid) => !shown.has(kid.id));
      rows.push(objectRow(block, level, under, inherited, kids.length > 0, ids));
      kids.forEach((kid) => visit(kid, level + 1, block.id));
    };
    live
      .filter((block) => parentOf(block) === null)
      .forEach((block) => visit(block, depth, parentRowId));
    live.forEach((block) => visit(block, depth, parentRowId));
  };

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
    const legacy: StoredDataBlock[] = [];
    for (const member of collection.memberRefs) {
      const block = byId.get(member.id);
      if (!block || shown.has(block.id)) {
        continue;
      }
      const track = trackDataOf(block);
      const group = collectionDataOf(block);
      if (track) {
        shown.add(block.id);
        const objects = (onTrack.get(block.id) ?? []).filter((object) => !shown.has(object.id));
        rows.push({
          id: block.id,
          kind: 'track',
          depth,
          name: block.name,
          parentRowId,
          mute: track.mute,
          inheritedMute: inherited,
          muted: track.mute || inherited,
          hasChildren: objects.length > 0,
          data: '',
          childOf: null,
          warnings: [],
        });
        listObjects(objects, depth + 1, block.id, inherited || track.mute);
      } else if (group) {
        shown.add(block.id);
        rows.push({
          id: block.id,
          kind: 'collection',
          depth,
          name: block.name,
          parentRowId,
          mute: group.mute,
          inheritedMute: inherited,
          muted: group.mute || inherited,
          hasChildren: group.memberRefs.some((entry) => byId.has(entry.id) && !shown.has(entry.id)),
          data: '',
          childOf: null,
          warnings: [],
        });
        listCollection(block.id, depth + 1, block.id, inherited || group.mute);
      } else if (objectDataOf(block)) {
        legacy.push(block);
      }
    }
    listObjects(legacy, depth, parentRowId, inherited);
  };

  listCollection(rootId, 0, null, collectionDataOf(byId.get(rootId))?.mute ?? false);
  return rows;
}
