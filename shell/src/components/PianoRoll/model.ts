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
}

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
