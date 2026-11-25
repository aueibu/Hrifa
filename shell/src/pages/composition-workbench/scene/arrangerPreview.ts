import type { MusicalPerformanceEvent } from '../audio/types';
import { rationalToNumber } from '../musicalTime';

/**
 * The note preview inside an Arranger block (workbench O2c), pure: the evaluated events of one object
 * become thin bars (Bitwig's clip preview). Time is plain quarter-note numbers and the output is in the
 * block's own pixels; nothing here is stored.
 */

/** The preview's drawing height in its own units (the SVG stretches it to the block's inner height). */
export const PREVIEW_HEIGHT = 16;
/** A note bar's height in those units. */
export const BAR_HEIGHT = 2;
/** Space kept above and below the bars (the margin of the auto range). */
const PADDING = 1.5;
/** The narrowest pitch range the vertical scale spreads over (midicents), so a two-note melody is not stretched. */
export const MIN_RANGE_MIDICENTS = 600;
/** Narrowest bar and a tick's width, in pixels. */
const MIN_WIDTH = 1;

/** Instruments that sound without a pitch (clicks, wood blocks, drums): drawn as ticks, not bars. */
const UNPITCHED = new Set<string>([
  'preview.click',
  'preview.click-accent',
  'sound.click',
  'sound.woodblock',
  'sound.drum',
]);

export interface PreviewNote {
  /** Start and end in quarter notes from the block's start. */
  start: number;
  end: number;
  midicents: number;
  unpitched: boolean;
}

export interface PreviewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The scene's events grouped by the object that made them (the last provenance step names it). */
export function groupEventsByObject(
  events: readonly MusicalPerformanceEvent[]
): Map<string, MusicalPerformanceEvent[]> {
  const groups = new Map<string, MusicalPerformanceEvent[]>();
  for (const event of events) {
    const id = event.provenance[event.provenance.length - 1]?.sourceNodeInstance;
    if (id === undefined) {
      continue;
    }
    const list = groups.get(id);
    if (list) {
      list.push(event);
    } else {
      groups.set(id, [event]);
    }
  }
  return groups;
}

/** Events as notes relative to the block's world start (`originQuarters`). */
export function toPreviewNotes(
  events: readonly MusicalPerformanceEvent[],
  originQuarters: number
): PreviewNote[] {
  return events.map((event) => {
    const start = rationalToNumber(event.at.quarterNotes) - originQuarters;
    return {
      start,
      end: start + rationalToNumber(event.duration.quarterNotes),
      midicents: event.pitchMidicents,
      unpitched: UNPITCHED.has(event.instrumentId),
    };
  });
}

/**
 * The bars for a block `visibleQuarters` long. A pitched note is a bar whose y comes from its pitch,
 * scaled to the pitch range of the block's own pitched notes (at least `MIN_RANGE_MIDICENTS`, centered;
 * a single pitch sits in the middle; the highest pitch is the top). An unpitched note is a full-height
 * tick. Notes are clipped to the block; one outside it is dropped.
 */
export function previewRects(
  notes: readonly PreviewNote[],
  visibleQuarters: number,
  pxPerQuarter: number
): PreviewRect[] {
  const pitched = notes.filter((note) => !note.unpitched);
  let low = Infinity;
  let high = -Infinity;
  for (const note of pitched) {
    low = Math.min(low, note.midicents);
    high = Math.max(high, note.midicents);
  }
  const middle = (low + high) / 2;
  const range = Math.max(high - low, MIN_RANGE_MIDICENTS);
  const top = PADDING;
  const travel = PREVIEW_HEIGHT - 2 * PADDING - BAR_HEIGHT;
  const rects: PreviewRect[] = [];
  for (const note of notes) {
    if (note.end <= 0 || note.start >= visibleQuarters) {
      continue;
    }
    const left = Math.max(note.start, 0) * pxPerQuarter;
    const right = Math.min(note.end, visibleQuarters) * pxPerQuarter;
    if (note.unpitched) {
      rects.push({ x: left, y: 0, width: MIN_WIDTH, height: PREVIEW_HEIGHT });
      continue;
    }
    const fraction = (note.midicents - (middle - range / 2)) / range;
    rects.push({
      x: left,
      y: top + (1 - fraction) * travel,
      width: Math.max(right - left, MIN_WIDTH),
      height: BAR_HEIGHT,
    });
  }
  return rects;
}

const round = (value: number) => Math.round(value * 100) / 100;

/** All rectangles as one SVG path (one DOM node however many notes). */
export function rectsToPath(rects: readonly PreviewRect[]): string {
  return rects
    .map(
      (r) => `M${round(r.x)} ${round(r.y)}h${round(r.width)}v${round(r.height)}h${-round(r.width)}z`
    )
    .join('');
}
