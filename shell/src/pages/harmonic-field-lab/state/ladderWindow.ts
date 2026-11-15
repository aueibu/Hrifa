/** M8g: the window of the Chords panel's tolerance ladder. */

/** Tiles shown at once (the selected one centred, 3 each side). */
export const LADDER_WINDOW = 7;

export interface LadderWindow {
  /** First shown index (inclusive). */
  start: number;
  /** One past the last shown index. */
  end: number;
  /** Tolerances hidden before / after the window (the `+n` tiles; 0 = no tile). */
  before: number;
  after: number;
}

/**
 * The window of `total` ladder rungs around `selected` (an index; -1 or out of range counts as 0): 7 tiles with the
 * selection centred; near an end the window slides so it still shows 7 (the selection is then off-centre). With 7 or fewer
 * rungs all show and there is no `+n`.
 */
export function ladderWindow(total: number, selected: number, size = LADDER_WINDOW): LadderWindow {
  if (total <= size) {
    return { start: 0, end: Math.max(0, total), before: 0, after: 0 };
  }
  const at = Math.min(Math.max(selected, 0), total - 1);
  const half = Math.floor(size / 2);
  const start = Math.min(Math.max(at - half, 0), total - size);
  return { start, end: start + size, before: start, after: total - start - size };
}

/** The index a click on the `+n` tile selects: the nearest hidden rung in that direction. */
export const nearestHidden = (w: LadderWindow, dir: 'before' | 'after'): number =>
  dir === 'before' ? w.start - 1 : w.end;
