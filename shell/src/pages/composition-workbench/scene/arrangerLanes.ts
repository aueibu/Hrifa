import type { StoredDataBlock } from '../dataBlocks/registry';
import { addRational, compareRational, type Rational } from '../musicalTime';
import { outlinerRows } from './outlinerRows';
import {
  chainPlacement,
  collectionDataOf,
  objectChain,
  objectDataOf,
  sceneDataOf,
} from './sceneTypes';
import { layoutSubLanes } from './subLanes';

/**
 * The Arranger's lanes (workbench L1a, W-77), pure. A Collection is ONE lane; the objects it lists
 * directly are the blocks on it. Objects of one collection that overlap in WORLD time (a parent and its
 * children do by design, and so does anything the human put on another sub-lane, W-78) go to different
 * SUB-LANES, so the lane grows only when it has to. The layout (`subLanes.ts`) is recomputed from the
 * committed placement and each object's optional stored `lane`.
 */

/** One object on a lane: its world span and the display sub-lane the layout gave it. */
export interface LaneObject {
  id: string;
  name: string;
  /** Own or inherited mute. */
  muted: boolean;
  /** Its own mute flag (what the Mute menu item flips). */
  mute: boolean;
  start: Rational;
  end: Rational;
  subLane: number;
  /** The stored lane number (absent = automatic), for a drop that keeps it. */
  lane?: number;
}

export interface ArrangerLane {
  /** The collection's block id. */
  id: string;
  name: string;
  /** 0 for the scene's root collection, one more for each collection level below it. */
  depth: number;
  muted: boolean;
  /** How many sub-lanes the lane needs (at least 1, also when it is empty). */
  subLanes: number;
  /** In the collection's own order. */
  objects: LaneObject[];
}

/**
 * Sub-lane assignment (see `subLanes.ts`): stored lane numbers dense-ranked, automatic objects first-fit in
 * start order. Returns the display sub-lane of every id and the count (at least 1).
 */
export function assignSubLanes(
  spans: readonly { id: string; start: Rational; end: Rational; lane?: number }[]
): {
  subLaneOf: Map<string, number>;
  count: number;
} {
  const { subLaneOf, count } = layoutSubLanes(spans);
  return { subLaneOf, count };
}

/** One lane per collection of the scene (the root first, then the Outliner's order), empty ones too. */
export function arrangerLanes(blocks: readonly StoredDataBlock[], sceneId: string): ArrangerLane[] {
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const rootId = sceneDataOf(byId.get(sceneId))?.rootCollectionRef?.id;
  const root = rootId === undefined ? undefined : byId.get(rootId);
  if (rootId === undefined || !root || !collectionDataOf(root)) {
    return [];
  }
  const rows = outlinerRows(blocks, sceneId);
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const heads = [
    { id: rootId, name: root.name, depth: 0, muted: collectionDataOf(root)?.mute ?? false },
    ...rows
      .filter((row) => row.kind === 'collection')
      .map((row) => ({ id: row.id, name: row.name, depth: row.depth + 1, muted: row.muted })),
  ];
  const taken = new Set<string>();
  return heads.map((head) => {
    const members = collectionDataOf(byId.get(head.id))?.memberRefs ?? [];
    const placed: Omit<LaneObject, 'subLane'>[] = [];
    for (const member of members) {
      const row = rowById.get(member.id);
      const data = objectDataOf(byId.get(member.id));
      const chain = data && row ? objectChain(byId, member.id) : null;
      if (!row || !data || chain === null || chain.length === 0 || taken.has(member.id)) {
        continue;
      }
      taken.add(member.id);
      const start = chainPlacement(chain).start;
      placed.push({
        id: member.id,
        name: row.name,
        muted: row.muted,
        mute: row.mute,
        start,
        end: addRational(start, data.timeSpan.duration),
        lane: data.lane,
      });
    }
    const { subLaneOf, count } = assignSubLanes(placed);
    return {
      ...head,
      subLanes: count,
      objects: placed.map((object) => ({ ...object, subLane: subLaneOf.get(object.id) ?? 0 })),
    };
  });
}

/** Pairs of objects on one sub-lane where the first ends exactly where the second starts. */
export function touchingPairs(lane: ArrangerLane): { leftId: string; rightId: string }[] {
  const pairs: { leftId: string; rightId: string }[] = [];
  for (const left of lane.objects) {
    for (const right of lane.objects) {
      if (
        left.id !== right.id &&
        left.subLane === right.subLane &&
        compareRational(left.end, right.start) === 0
      ) {
        pairs.push({ leftId: left.id, rightId: right.id });
      }
    }
  }
  return pairs;
}
