export interface PianoRollNote {
  id: string;
  start: number;
  duration: number;
  pitchMidicents: number;
  label: string;
  velocity?: number;
  /**
   * The id of what this note belongs to when that is larger than the note: a chord's pitches are
   * separate rectangles of one event. Selection reports `sourceId`s so acting on part of a chord acts
   * on the whole event. Unset means the note is its own source.
   */
  sourceId?: string;
  /** A CSS color for this note, such as `var(--mantine-color-teal-filled)`; unset uses the theme's primary color. */
  color?: string;
}

/** The shortest note a roll edit makes, in quarter notes (a drag cannot shrink a note below it). */
export const MIN_NOTE_QUARTERS = 1 / 32;

/** The loudness a note entered in the roll starts at (0 to 1), before a vertical drag changes it. */
export const DEFAULT_ENTRY_VELOCITY = 0.8;

/**
 * A note drawn in the roll, before its owner gives it an id. Pitch is a whole semitone, in
 * midicents. `velocity` (0 to 1) is set only when the entry gesture chose one.
 */
export interface PianoRollNewNote {
  start: number;
  duration: number;
  pitchMidicents: number;
  velocity?: number;
}

/** A span of time in quarter notes. */
export interface PianoRollRange {
  start: number;
  end: number;
}

export interface PianoRollGridLine {
  at: number;
  kind: 'bar' | 'beat';
  label?: string;
  /** A dotted line finer than a beat (set by sources that decide their own density). */
  subdivision?: boolean;
}

/**
 * Grid lines generated on demand for the time range the roll is about to draw (quarter notes, with
 * the zoom in pixels per quarter and the whole timeline's length), so a very long timeline never
 * builds every line. A source decides its own density (see gridDensity.ts): the roll draws exactly
 * what it returns, bar lines labelled only where a number is to be printed.
 */
export type PianoRollGridSource = (
  from: number,
  to: number,
  pixelsPerQuarter: number,
  extent: number
) => PianoRollGridLine[];

export interface PianoRollViewState {
  pixelsPerQuarter: number;
  pixelsPerSemitone: number;
  scrollLeft: number;
  scrollTop: number;
  followPlayback: boolean;
  framed: boolean;
}

export const defaultPianoRollView: PianoRollViewState = {
  pixelsPerQuarter: 64,
  pixelsPerSemitone: 22,
  scrollLeft: 0,
  scrollTop: 0,
  followPlayback: false,
  framed: false,
};

/** Width of the keyboard column left of the timeline, so a lane under the roll can line up with it. */
export const PIANO_ROLL_KEYBOARD_WIDTH = 4.5 * 16;
