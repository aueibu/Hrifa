/**
 * A comma list that fits a character budget (M7c, the chord ring's merged octave notes): all of it when it fits; otherwise
 * the most items that fit with ` +N` after them (at least one item), the way the Check line says `+3 more`. `full` is the
 * whole list, for a tooltip. Pure.
 */
export interface FittedList {
  /** What to draw: `1, 2, 4`, or `1, 2 +2` when it did not fit. */
  text: string;
  /** The whole list, `1, 2, 4, 8`. */
  full: string;
  /** True when items were left out (`text` ends in `+N`). */
  cut: boolean;
}

export function fitList(items: readonly string[], max: number): FittedList {
  const full = items.join(', ');
  if (full.length <= max || items.length <= 1) {
    return { text: full, full, cut: false };
  }
  for (let k = items.length - 1; k >= 1; k--) {
    const text = `${items.slice(0, k).join(', ')} +${items.length - k}`;
    if (text.length <= max || k === 1) {
      return { text, full, cut: true };
    }
  }
  return { text: full, full, cut: false };
}
