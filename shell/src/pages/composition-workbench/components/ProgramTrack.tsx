import { Text } from '@mantine/core';
import type { TrackNote } from '../rhythmEdit';
import { labelFits } from './DurationStrip';
import { useInfoBarActive } from './hoverInfo';

/** Roughly how wide one monospace character is in a track cell, in px. */
const TRACK_CHAR_PX = 7;
import classes from '../CompositionWorkbench.module.css';

export interface TrackBlock {
  /** The block's number as the program counted them. */
  block: number;
  /** Pulses from the left edge to the start of its first tick and the end of its last. */
  start: number;
  end: number;
  /** How many ticks it covered. */
  ticks: number;
}

/**
 * Where each block of ticks falls along the notes. A block spans from its first tick's note to its
 * last tick's note, so with a rate above 1 it also covers the notes the program skipped in between.
 */
export function trackBlocks(lengths: number[], notes: TrackNote<string>[]): TrackBlock[] {
  const blocks = new Map<number, TrackBlock>();
  let position = 0;
  lengths.forEach((length, index) => {
    const note = notes[index];
    const start = position;
    position += Math.abs(length);
    if (note?.state !== 'tick' || note.block === undefined) {
      return;
    }
    const existing = blocks.get(note.block);
    if (existing) {
      existing.end = position;
      existing.ticks += 1;
    } else {
      blocks.set(note.block, { block: note.block, start, end: position, ticks: 1 });
    }
  });
  return [...blocks.values()];
}

/**
 * A hairline at every note edge, running the height of whatever it is placed over: behind the
 * program tracks and the rhythm strip, so the notes of each can be followed down to the others.
 * Positions are inside the strip's 1px border, where its blocks are.
 */
export function NoteGuides({ lengths }: { lengths: number[] }) {
  const total = lengths.reduce((sum, length) => sum + Math.abs(length), 0);
  if (!(total > 0)) {
    return null;
  }
  let edge = 0;
  const edges = [0, ...lengths.map((length) => (edge += Math.abs(length)))];
  return (
    <div className={classes.noteGuides} aria-hidden="true">
      {edges.map((position, index) => (
        <span
          key={index}
          className={classes.noteGuide}
          style={{ left: `calc(1px + (100% - 2px) * ${position / total})` }}
        />
      ))}
    </div>
  );
}

/**
 * One program laid out note by note under the same widths as the rhythm strip: an action where the
 * program ticks, a faint dot where it skips a note, a shaded cell while it waits for its phase, and
 * a bracket under each block of ticks.
 */
export function ProgramTrack({
  label,
  detail,
  lengths,
  notes,
  widthShare,
  pxPerPulse,
}: {
  label: string;
  /** Phase and rate, for the caption. */
  detail?: string;
  lengths: number[];
  notes: TrackNote<string>[];
  widthShare?: number;
  /** How many px one pulse is; cells are then exactly proportional, and a label that will not fit is left out. */
  pxPerPulse?: number;
}) {
  const total = lengths.reduce((sum, length) => sum + Math.abs(length), 0) || 1;
  const blocks = trackBlocks(lengths, notes);
  const infoBar = useInfoBarActive();
  const noteInfo = (note: TrackNote<string>, index: number) =>
    note.state === 'tick'
      ? `${label} · note ${index + 1}: ${note.action}`
      : note.state === 'waiting'
        ? `${label} · note ${index + 1}: before the program starts (phase)`
        : `${label} · note ${index + 1}: skipped (rate)`;
  return (
    <div style={widthShare === undefined ? undefined : { width: `${widthShare * 100}%` }}>
      <Text className={classes.stickyLabel} size="xs" c="dimmed" mb={2}>
        {label}
        {detail && ` · ${detail}`}
      </Text>
      <div
        className={classes.programTrack}
        aria-label={`${label}: ${notes.map((note) => (note.state === 'tick' ? note.action : '·')).join(' ')}`}
      >
        {notes.map((note, index) => (
          <span
            key={index}
            className={classes.programTrackCell}
            data-state={note.state}
            style={
              pxPerPulse === undefined
                ? { flexBasis: 0, flexGrow: Math.abs(lengths[index] ?? 0) }
                : { flex: 'none', width: `${(Math.abs(lengths[index] ?? 0) / total) * 100}%` }
            }
            data-info={noteInfo(note, index)}
            title={infoBar ? undefined : noteInfo(note, index)}
          >
            {note.state === 'tick'
              ? pxPerPulse === undefined ||
                labelFits(Math.abs(lengths[index] ?? 0) * pxPerPulse, note.action ?? '', TRACK_CHAR_PX)
                ? note.action
                : ''
              : note.state === 'skipped'
                ? '·'
                : ''}
          </span>
        ))}
        {blocks.map((block) => (
          <span
            key={block.block}
            className={classes.programTrackBlock}
            data-parity={block.block % 2}
            style={{
              left: `calc(1px + (100% - 2px) * ${block.start / total})`,
              width: `calc((100% - 2px) * ${(block.end - block.start) / total})`,
            }}
            data-info={`${label} · block ${block.block + 1}: ${block.ticks} ${block.ticks === 1 ? 'tick' : 'ticks'}`}
            title={
              infoBar
                ? undefined
                : `Block ${block.block + 1}: ${block.ticks} ${block.ticks === 1 ? 'tick' : 'ticks'}`
            }
          />
        ))}
      </div>
    </div>
  );
}
