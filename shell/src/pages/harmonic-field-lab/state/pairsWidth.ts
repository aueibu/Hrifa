/**
 * Width of the Pairs grid's columns (M3b). Every column (row heads, subset, spacer excepted, added) gets the same width
 * in `ch` (the grid sets the monospace font and the cell font size on itself, so a `ch` there is a cell character), wide
 * enough for the longest text of the view: nothing wraps, overlaps or is cut. Pure.
 */

/**
 * Room beside the text in `ch`, both sides together, the 1px borders included (cells have no padding of their own: the
 * text is centered). Each side keeps about 0.75ch, which clears the wrap arrow: it is drawn at 0.65em in the top right
 * corner, so its ink reaches about 0.55ch from the edge, and it sits above the line of the number.
 */
export const COL_PAD_CH = 1.5;
/** The narrowest column in `ch`. */
export const COL_MIN_CH = 3.5;

/** The common column width in `ch` for these texts (cell texts, header texts, added-pitch labels). */
export function colWidthCh(texts: readonly string[]): number {
  const longest = texts.reduce((m, t) => Math.max(m, [...t].length), 0);
  return Math.max(COL_MIN_CH, longest + COL_PAD_CH);
}
