import type { StoredDataBlock } from '../dataBlocks/registry';
import type { Rational } from '../musicalTime';
import {
  moveToCollection,
  placeObjectNearest,
  type DropLane,
  type SceneOpResult,
} from './sceneOps';
import { chainPlacement, objectChain } from './sceneTypes';

/**
 * A body drag released (workbench L1a, W-77; sub-lanes L3, W-78), pure. The block lands at the snapped
 * RELATIVE start `relativeStart` in the lane under the pointer. `lane` is the SUB-LANE under the pointer
 * (its display index) or `'new'` for the new-lane strip; absent keeps the object on its own sub-lane. In
 * its own collection `placeObjectNearest` stores that sub-lane's number and lands at the nearest free slot
 * IN THAT sub-lane (where dropped when free). In another collection the object first moves there
 * (`moveToCollection`, which keeps its lane number when free at that time, else uses the dropped
 * sub-lane) and is then placed the same way. One result, so the caller applies it as ONE undo step.
 */
export function applyDrop(
  blocks: readonly StoredDataBlock[],
  id: string,
  fromLaneId: string,
  toLaneId: string,
  relativeStart: Rational,
  lane?: DropLane
): SceneOpResult {
  if (toLaneId === fromLaneId) {
    return placeObjectNearest(blocks, id, relativeStart, lane);
  }
  const moved = moveToCollection(blocks, id, toLaneId, lane);
  return moved.ok ? placeObjectNearest(moved.blocks, id, relativeStart) : moved;
}

/** Where a drop would land (world start), or null when it would be refused. Used for the faint outline. */
export function dropLanding(
  blocks: readonly StoredDataBlock[],
  id: string,
  fromLaneId: string,
  toLaneId: string,
  relativeStart: Rational,
  lane?: DropLane
): Rational | null {
  const result = applyDrop(blocks, id, fromLaneId, toLaneId, relativeStart, lane);
  if (!result.ok) {
    return null;
  }
  const chain = objectChain(new Map(result.blocks.map((block) => [block.id, block])), id);
  return chain === null || chain.length === 0 ? null : chainPlacement(chain).start;
}

/** The lane under a pointer height, from each lane's top and bottom, or null (off the lanes). */
export function laneAtY(
  y: number,
  rects: readonly { id: string; top: number; bottom: number }[]
): string | null {
  return rects.find((rect) => y >= rect.top && y < rect.bottom)?.id ?? null;
}

/**
 * The drop target inside a lane for a pointer height: the sub-lane under it (index from the lane's
 * top), or `'new'` when it is over the new-lane strip below the last sub-lane. `subHeight` is one
 * sub-lane's height, `top` the lane's top, `subLanes` how many it has and `strip` the height of the
 * new-lane strip that overlays the bottom of the lane; null above the lane.
 */
export function subLaneAtY(
  y: number,
  top: number,
  subHeight: number,
  subLanes: number,
  strip: number
): DropLane | null {
  if (y < top || subHeight <= 0) {
    return null;
  }
  if (y >= top + subHeight * subLanes - strip) {
    return 'new';
  }
  return Math.min(subLanes - 1, Math.floor((y - top) / subHeight));
}
