import type { StoredDataBlock } from '../dataBlocks/registry';
import { addRational, compareRational, type Rational } from '../musicalTime';
import {
  chainPlacement,
  collectionDataOf,
  objectChain,
  objectDataOf,
  sceneDataOf,
  trackDataOf,
} from './sceneTypes';
import { layoutSubLanes } from './subLanes';

/**
 * The Arranger's rows (workbench TK2, W-82), pure. Each Collection but the scene's root is a thin BAND (name,
 * fold, mute); each Track is one LANE, in its Collection's `memberRefs` order, indented below the band
 * of the Collection that lists it; the objects on a lane are the ones whose `trackRef` names the Track.
 * Objects that overlap in WORLD time (a parent and its children do by design) go to different SUB-LANES,
 * laid out automatically (`subLanes.ts`: start time, then id), so a lane grows only when it has to. An
 * empty Track is a lane one sub-lane high. An object no Track holds is not drawn.
 */

/** One object on a lane: its world span and the sub-lane the layout gave it. */
export interface LaneObject {
  id: string;
  name: string;
  /** Own, Track or Collection mute. */
  muted: boolean;
  /** Its own mute flag (what the Mute menu item flips). */
  mute: boolean;
  start: Rational;
  end: Rational;
  subLane: number;
}

/** One Track's lane. */
export interface ArrangerLane {
  /** The Track's block id. */
  id: string;
  name: string;
  /** The Collection that lists the Track. */
  collectionId: string;
  collectionName: string;
  /** How many Collection bands sit above it (0 for a Track of the scene's root). */
  depth: number;
  /** The Track's own mute flag. */
  mute: boolean;
  /** Own or an enclosing Collection's mute. */
  muted: boolean;
  /** How many sub-lanes the lane needs (at least 1, also when it is empty). */
  subLanes: number;
  /** In start-time order. */
  objects: LaneObject[];
}

/** One Collection's band. */
export interface ArrangerBand {
  /** The Collection's block id. */
  id: string;
  name: string;
  /** How many bands sit above it (0 for a top-level Collection). */
  depth: number;
  mute: boolean;
  muted: boolean;
}

/** Bands and lanes in drawing order. `ancestors` are the band ids above the entry (nearest last). */
export type ArrangerEntry =
  | { kind: 'band'; band: ArrangerBand; ancestors: string[] }
  | { kind: 'track'; lane: ArrangerLane; ancestors: string[] };

/** The entries of the scene, in order: the root's Tracks, then each Collection's band, Tracks and nested bands. */
export function arrangerEntries(
  blocks: readonly StoredDataBlock[],
  sceneId: string
): ArrangerEntry[] {
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const rootId = sceneDataOf(byId.get(sceneId))?.rootCollectionRef?.id;
  if (rootId === undefined || !collectionDataOf(byId.get(rootId))) {
    return [];
  }
  // Objects per Track, from `trackRef` (the one truth), first listing of a Track wins.
  const onTrack = new Map<string, StoredDataBlock[]>();
  for (const block of blocks) {
    const trackId = objectDataOf(block)?.trackRef?.id;
    if (trackId !== undefined) {
      onTrack.set(trackId, [...(onTrack.get(trackId) ?? []), block]);
    }
  }
  const entries: ArrangerEntry[] = [];
  const seen = new Set<string>([rootId]);

  const laneOf = (
    track: StoredDataBlock,
    collection: StoredDataBlock,
    depth: number,
    inherited: boolean
  ): ArrangerLane => {
    const mute = trackDataOf(track)?.mute ?? false;
    const placed: Omit<LaneObject, 'subLane'>[] = [];
    for (const block of onTrack.get(track.id) ?? []) {
      const data = objectDataOf(block);
      const chain = data ? objectChain(byId, block.id) : null;
      if (!data || chain === null || chain.length === 0) {
        continue;
      }
      const start = chainPlacement(chain).start;
      placed.push({
        id: block.id,
        name: block.name,
        muted: data.mute || mute || inherited,
        mute: data.mute,
        start,
        end: addRational(start, data.timeSpan.duration),
      });
    }
    placed.sort((a, b) => compareRational(a.start, b.start) || (a.id < b.id ? -1 : 1));
    const { subLaneOf, count } = layoutSubLanes(placed);
    return {
      id: track.id,
      name: track.name,
      collectionId: collection.id,
      collectionName: collection.name,
      depth,
      mute,
      muted: mute || inherited,
      subLanes: count,
      objects: placed.map((object) => ({ ...object, subLane: subLaneOf.get(object.id) ?? 0 })),
    };
  };

  const listCollection = (
    collection: StoredDataBlock,
    depth: number,
    ancestors: string[],
    inherited: boolean
  ) => {
    for (const member of collectionDataOf(collection)?.memberRefs ?? []) {
      const block = byId.get(member.id);
      if (!block || seen.has(block.id)) {
        continue;
      }
      if (trackDataOf(block)) {
        seen.add(block.id);
        entries.push({
          kind: 'track',
          lane: laneOf(block, collection, depth, inherited),
          ancestors,
        });
      } else if (collectionDataOf(block)) {
        seen.add(block.id);
        const mute = collectionDataOf(block)?.mute ?? false;
        const muted = mute || inherited;
        entries.push({
          kind: 'band',
          band: { id: block.id, name: block.name, depth, mute, muted },
          ancestors,
        });
        listCollection(block, depth + 1, [...ancestors, block.id], muted);
      }
    }
  };
  const root = byId.get(rootId)!;
  listCollection(root, 0, [], collectionDataOf(root)?.mute ?? false);
  return entries;
}

/** Every Track's lane in drawing order (bands left out). */
export function arrangerLanes(blocks: readonly StoredDataBlock[], sceneId: string): ArrangerLane[] {
  return arrangerEntries(blocks, sceneId).flatMap((entry) =>
    entry.kind === 'track' ? [entry.lane] : []
  );
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
