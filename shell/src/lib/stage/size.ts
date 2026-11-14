/**
 * Slot size classes (STAGE-4): the named size of the room a slot gives its module, per axis, from a measured length in
 * rem. One scale on both axes in multiples of a base unit of 6 rem. Pure functions only: the measuring (a
 * ResizeObserver on the slot body) lives in the React layer, which converts pixels with `pxToRem`.
 *
 * Classification (plain, no history):   width: narrow < 30 <= regular < 42 <= wide   height: short < 30 <= regular < 42 <= tall
 *
 * Hysteresis rule (`nextWidthClass`, `nextHeightClass`, `sizeOf` with `prev`), for each boundary B (30 or 42) and H = 0.5:
 *   - a class below B moves up across B only when the value is at least B + H;
 *   - a class above B moves down across B only when the value is below B - H.
 * So inside the band [B - H, B + H) the previous class always holds, and a value that wobbles by less than H around a
 * boundary never flips the class. Several boundaries are applied together, so a jump from 12 to 45 gives the top class
 * at once. With no previous class (the first measurement) the plain rule applies.
 */
export const SIZE_UNIT_REM = 6;
/** Below this a slot is `narrow` / `short` (5U). */
export const SIZE_SMALL_MAX_REM = 30;
/** From this a slot is `wide` / `tall` (7U). */
export const SIZE_LARGE_MIN_REM = 42;
/** The smallest slot: 2U wide by 1U high (height includes the header strip). */
export const SIZE_MIN_WIDTH_REM = 12;
export const SIZE_MIN_HEIGHT_REM = 6;
/** How far past a boundary the value must go before the class changes back and forth. */
export const SIZE_HYSTERESIS_REM = 0.5;

export type WidthClass = 'narrow' | 'regular' | 'wide';
export type HeightClass = 'short' | 'regular' | 'tall';
export interface SlotSize {
  width: WidthClass;
  height: HeightClass;
}

export const WIDTH_CLASSES: readonly WidthClass[] = ['narrow', 'regular', 'wide'];
export const HEIGHT_CLASSES: readonly HeightClass[] = ['short', 'regular', 'tall'];

const BOUNDARIES = [SIZE_SMALL_MAX_REM, SIZE_LARGE_MIN_REM] as const;

/** Convert pixels to rem given the root font size in px (16 when unknown or unusable). */
export function pxToRem(px: number, rootPx = 16): number {
  return px / (rootPx > 0 && Number.isFinite(rootPx) ? rootPx : 16);
}

/** Class index 0..2 for a value; NaN and negatives are the smallest class. */
function plainIndex(rem: number): number {
  return BOUNDARIES.filter((b) => rem >= b).length;
}

function nextIndex(prev: number | undefined, rem: number): number {
  if (prev !== undefined && !Number.isFinite(rem)) {
    return prev; // a bad measurement keeps the previous class
  }
  if (prev === undefined) {
    return plainIndex(rem);
  }
  return BOUNDARIES.filter((b, i) =>
    prev > i ? rem >= b - SIZE_HYSTERESIS_REM : rem >= b + SIZE_HYSTERESIS_REM
  ).length;
}

export const classifyWidth = (rem: number): WidthClass => WIDTH_CLASSES[plainIndex(rem)];
export const classifyHeight = (rem: number): HeightClass => HEIGHT_CLASSES[plainIndex(rem)];

/** The width class after a new measurement, with hysteresis against the previous class (see the file header). */
export const nextWidthClass = (prev: WidthClass | undefined, rem: number): WidthClass =>
  WIDTH_CLASSES[nextIndex(prev === undefined ? undefined : WIDTH_CLASSES.indexOf(prev), rem)];

export const nextHeightClass = (prev: HeightClass | undefined, rem: number): HeightClass =>
  HEIGHT_CLASSES[nextIndex(prev === undefined ? undefined : HEIGHT_CLASSES.indexOf(prev), rem)];

/** Both axes at once; pass the previous size to get hysteresis. */
export function sizeOf(widthRem: number, heightRem: number, prev?: SlotSize): SlotSize {
  return {
    width: nextWidthClass(prev?.width, widthRem),
    height: nextHeightClass(prev?.height, heightRem),
  };
}

const widthIndex = (s: SlotSize) => WIDTH_CLASSES.indexOf(s.width);
const heightIndex = (s: SlotSize) => HEIGHT_CLASSES.indexOf(s.height);

export const sameSize = (a: SlotSize, b: SlotSize): boolean =>
  a.width === b.width && a.height === b.height;

/** True when `a` is at least `b` on both axes (the minSize check). */
export const sizeAtLeast = (a: SlotSize, b: SlotSize): boolean =>
  widthIndex(a) >= widthIndex(b) && heightIndex(a) >= heightIndex(b);

/**
 * The size a module is given when the slot's size is not one it supports: the largest supported size that fits inside
 * the slot's size (at most it on both axes; ranked by width class plus height class, then width), else the smallest
 * supported size. An empty `supported` returns `size` unchanged.
 */
export function nearestSupportedSize(size: SlotSize, supported: readonly SlotSize[]): SlotSize {
  if (supported.length === 0) {
    return size;
  }
  const rank = (s: SlotSize) => (widthIndex(s) + heightIndex(s)) * 10 + widthIndex(s);
  const fits = supported.filter((s) => sizeAtLeast(size, s));
  const pool = fits.length ? fits : supported;
  return pool.reduce((best, s) =>
    (fits.length ? rank(s) > rank(best) : rank(s) < rank(best)) ? s : best
  );
}

/** The `data-slot-size` attribute value: "<width>-<height>", e.g. "narrow-tall". */
export const slotSizeAttr = (size: SlotSize): string => `${size.width}-${size.height}`;
