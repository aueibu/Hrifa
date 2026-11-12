import type { PianoRollNote, PianoRollViewState } from './model';

export interface PixelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Where a note is drawn inside the roll, in pixels. The render and the hit test share this. */
export function noteRect(
  note: PianoRollNote,
  view: Pick<PianoRollViewState, 'pixelsPerQuarter' | 'pixelsPerSemitone'>
): PixelRect {
  const pitch = note.pitchMidicents / 100;
  const height = Math.max(5, view.pixelsPerSemitone * 0.72);
  return {
    left: note.start * view.pixelsPerQuarter,
    top: (127 - pitch) * view.pixelsPerSemitone + (view.pixelsPerSemitone - height) / 2,
    width: Math.max(3, note.duration * view.pixelsPerQuarter),
    height,
  };
}

/** A rectangle from two corners dragged in any direction. */
export function rectFromCorners(ax: number, ay: number, bx: number, by: number): PixelRect {
  return {
    left: Math.min(ax, bx),
    top: Math.min(ay, by),
    width: Math.abs(bx - ax),
    height: Math.abs(by - ay),
  };
}

function overlaps(a: PixelRect, b: PixelRect) {
  return (
    a.left < b.left + b.width &&
    a.left + a.width > b.left &&
    a.top < b.top + b.height &&
    a.top + a.height > b.top
  );
}

/** What selecting a note selects: its source (a whole chord) when it has one, otherwise itself. */
export function selectionId(note: PianoRollNote): string {
  return note.sourceId ?? note.id;
}

/**
 * The selection ids of every note the rectangle touches, in the order the notes were given. A chord
 * the rectangle only partly covers is selected whole, and appears once.
 */
export function notesInRect(
  notes: PianoRollNote[],
  view: Pick<PianoRollViewState, 'pixelsPerQuarter' | 'pixelsPerSemitone'>,
  rect: PixelRect
): string[] {
  const ids = notes.filter((note) => overlaps(noteRect(note, view), rect)).map(selectionId);
  return ids.filter((id, index) => ids.indexOf(id) === index);
}

/**
 * The selection after clicking a note. A plain click selects only that note; with `toggle` (shift or
 * ctrl/cmd) it adds the note or removes it, and leaves the rest alone.
 */
export function clickSelection(current: string[], id: string, toggle: boolean): string[] {
  if (!toggle) {
    return [id];
  }
  return current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id];
}

/** The selection after a marquee. With `additive` the marquee's notes join the current selection. */
export function marqueeSelection(current: string[], hit: string[], additive: boolean): string[] {
  if (!additive) {
    return hit;
  }
  return [...current, ...hit.filter((id) => !current.includes(id))];
}
