/** Per-module measured size classes with hysteresis (pure; the Stage keeps the record in React state). */
import { sameSize, sizeOf, type SlotSize } from '../../lib/stage';

export type SlotSizes = Readonly<Record<string, SlotSize>>;

/** Until a slot has been measured its module is given this size. */
export const INITIAL_SIZE: SlotSize = { width: 'regular', height: 'regular' };

/** Fold a measurement (rem) for module `id` into the record; returns the same object when the class is unchanged. */
export function withMeasure(
  sizes: SlotSizes,
  id: string,
  widthRem: number,
  heightRem: number
): SlotSizes {
  const prev = sizes[id];
  const next = sizeOf(widthRem, heightRem, prev);
  return prev && sameSize(prev, next) ? sizes : { ...sizes, [id]: next };
}
