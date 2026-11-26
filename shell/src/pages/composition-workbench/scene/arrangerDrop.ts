import type { StoredDataBlock } from '../dataBlocks/registry';
import type { Rational } from '../musicalTime';
import { placeObjectNearest, type SceneOpResult } from './sceneOps';
import { chainPlacement, objectChain } from './sceneTypes';
import { moveObjectToTrack } from './trackOps';

/**
 * A body drag released (workbench TK2, W-82), pure. The block lands at the snapped RELATIVE start
 * `relativeStart` on the Track row under the pointer. On another Track the object first moves there
 * (`moveObjectToTrack`, which keeps its start) and is then placed. Objects may overlap on a Track, so
 * nothing slides to a free slot. One result, so the caller applies it as ONE undo step.
 */
export function applyDrop(
  blocks: readonly StoredDataBlock[],
  id: string,
  fromTrackId: string,
  toTrackId: string,
  relativeStart: Rational
): SceneOpResult {
  if (toTrackId === fromTrackId) {
    return placeObjectNearest(blocks, id, relativeStart);
  }
  const moved = moveObjectToTrack(blocks, id, toTrackId);
  return moved.ok ? placeObjectNearest(moved.blocks, id, relativeStart) : moved;
}

/** Where a drop would land (world start), or null when it would be refused. Used for the faint outline. */
export function dropLanding(
  blocks: readonly StoredDataBlock[],
  id: string,
  fromTrackId: string,
  toTrackId: string,
  relativeStart: Rational
): Rational | null {
  const result = applyDrop(blocks, id, fromTrackId, toTrackId, relativeStart);
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
