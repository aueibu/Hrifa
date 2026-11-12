import { adaptiveSubdivision, type PianoRollDrawnGridLine } from './gridDensity';
import type { PianoRollGridLine, PianoRollGridSource } from './model';

/** The time range (quarter notes) lines are wanted for. */
export interface PianoRollGridWindow {
  from: number;
  to: number;
}

/** Least pixels between two subdivision lines of an owner's array for them to be drawn at all. */
const MIN_SUBDIVISION_SPACING = 6;
/** The width assumed for a view that has not been measured yet. */
const UNMEASURED_WIDTH = 1200;

/**
 * The range to draw lines for: what the view shows (`scrollLeft`, `viewWidth` in pixels) plus a
 * view of margin on each side, kept within `0..limit` quarter notes. Its size depends on the zoom
 * and the view, never on the length of the timeline.
 */
export function gridWindow(
  scrollLeft: number,
  viewWidth: number,
  pixelsPerQuarter: number,
  limit: number
): PianoRollGridWindow {
  const width = (viewWidth > 0 ? viewWidth : UNMEASURED_WIDTH) / pixelsPerQuarter;
  const start = Math.max(0, scrollLeft) / pixelsPerQuarter;
  return {
    from: Math.max(0, start - width),
    to: Math.min(Math.max(0, limit), start + width * 2),
  };
}

/**
 * The vertical lines the roll and the velocity lane draw, out to `visibleQuarters`.
 *
 * An owner's `gridLines` is either a SOURCE function, asked for just the `window` and trusted to
 * decide its own density (see gridDensity.ts: this is how the note editor's lines, thinned by zoom,
 * reach any length), or an ARRAY (Mixer, Melodicization), drawn whole whatever the window: every
 * line as given plus the subdivision (the owner's `gridUnit` while its lines are far enough apart to
 * read, otherwise the zoom's own), out to `visibleQuarters`. The window never trims an array, so a
 * roll that scrolls natively with a fixed `scrollLeft` keeps all its lines.
 */
export function rollGridLines(
  gridLines: PianoRollGridLine[] | PianoRollGridSource,
  gridUnit: number | undefined,
  visibleQuarters: number,
  pixelsPerQuarter: number,
  window?: PianoRollGridWindow
): PianoRollDrawnGridLine[] {
  if (typeof gridLines === 'function') {
    const from = Math.max(0, window?.from ?? 0);
    const to = Math.min(visibleQuarters, window?.to ?? visibleQuarters);
    return gridLines(from, to, pixelsPerQuarter, visibleQuarters)
      .filter((line) => line.at >= from && line.at <= to)
      .map((line) => ({ ...line, subdivision: line.subdivision ?? false }))
      .sort((left, right) => left.at - right.at);
  }
  const byPosition = new Map<number, PianoRollDrawnGridLine>();
  gridLines.forEach((line) => {
    byPosition.set(Math.round(line.at * 1_000_000), { ...line, subdivision: false });
  });
  const subdivision =
    gridUnit !== undefined && gridUnit * pixelsPerQuarter >= MIN_SUBDIVISION_SPACING
      ? gridUnit
      : adaptiveSubdivision(pixelsPerQuarter);
  if (subdivision * pixelsPerQuarter >= MIN_SUBDIVISION_SPACING) {
    const lastStep = Math.floor((visibleQuarters + subdivision / 2) / subdivision);
    for (let step = 0; step <= lastStep; step += 1) {
      const at = step * subdivision;
      const key = Math.round(at * 1_000_000);
      if (!byPosition.has(key)) {
        byPosition.set(key, { at, kind: 'beat', subdivision: true });
      }
    }
  }
  return [...byPosition.values()].sort((left, right) => left.at - right.at);
}
