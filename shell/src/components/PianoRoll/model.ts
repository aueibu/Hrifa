export interface PianoRollNote {
  id: string;
  start: number;
  duration: number;
  pitchMidicents: number;
  label: string;
  velocity?: number;
  /** A CSS color for this note, such as `var(--mantine-color-teal-filled)`; unset uses the theme's primary color. */
  color?: string;
}

export interface PianoRollGridLine {
  at: number;
  kind: "bar" | "beat";
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
