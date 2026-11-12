import type { Rational } from './musicalTime';
import type { NoteItem } from './noteClipEdits';

/**
 * A rotation session (K5b-2b): what lets "rotate in time" behave circularly across repeated presses
 * even though a note that crosses the span's edge, or is cut at the span's edges, is stored as
 * several notes. It is editor-side
 * transient state, like the velocity ramp: never in the packet, never in the history, no schema.
 *
 * The first press records the ORIGINAL (uncut) target notes (outside parts included), the span, the grid step and the
 * cumulative shift. While the packet still holds exactly what the last press committed and the
 * selection is the one it left, each further press re-applies the rotation from the originals with
 * the new cumulative shift, so when the inside part is back in place the note is ONE note again (outside
 * parts re-merged), rotating back by the same total restores the original packet (same ids), and a
 * full cycle returns to the start. Any
 * other edit, a different span or selection, or an undo/redo ends the session; the pieces then stay
 * separate notes.
 */
export interface RotationSessionCore {
  /** The target notes as they were before the first press (unsplit). */
  originals: NoteItem[];
  /** The span's start and end in quarter notes. */
  from: Rational;
  to: Rational;
  /** The grid step the session rotates by, in quarter notes (a different grid starts a new session). */
  gridQuarters: number;
  /** The cumulative shift in quarter notes. */
  shift: Rational;
  /** The stable ids of each original's wrapped pieces, by the original's id. */
  pieceIds: Record<string, string[]>;
}

/** A comparable key for a selection: its ids (order-free), range and kind. */
export function selectionKeyOf(selection: {
  ids: readonly string[];
  range: { start: number; end: number } | null;
  kind?: 'time';
}): string {
  return JSON.stringify([[...selection.ids].sort(), selection.range, selection.kind ?? null]);
}
