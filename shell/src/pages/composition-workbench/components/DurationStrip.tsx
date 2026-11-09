import type { ReactNode } from 'react';
import { Text } from '@mantine/core';
import { attackPositions, describeRhythmOrigin } from '../rhythmFrame';
import { Playhead } from './Playhead';
import classes from '../CompositionWorkbench.module.css';

export interface StripSegment {
  width: number;
  text: string;
  kind: 'attack' | 'rest' | 'tail';
  /** Index into `durations` for attack segments. */
  index?: number;
}

/**
 * One frame of the rhythm, drawn from the downbeat. A later start shows as a rest in a linear
 * frame; in a loop it shows as the tail of the last note wrapping around from the previous cycle.
 */
export function stripSegments(
  durations: number[],
  origin: number,
  cyclic: boolean
): StripSegment[] {
  const attacks = durations.map(
    (width, index): StripSegment => ({ width, text: String(width), kind: 'attack', index })
  );
  if (origin <= 0) {
    return attacks;
  }
  if (!cyclic) {
    return [{ width: origin, text: `rest ${origin}`, kind: 'rest' }, ...attacks];
  }
  const cycle = durations.reduce((sum, value) => sum + value, 0);
  const positions = attackPositions(durations, origin)
    .map((position) => position % cycle)
    .sort((left, right) => left - right);
  const segments: StripSegment[] = [
    { width: positions[0], text: `↺ ${positions[0]}`, kind: 'tail' },
  ];
  positions.forEach((position, index) => {
    const end = positions[index + 1] ?? cycle;
    segments.push({ width: end - position, text: String(end - position), kind: 'attack' });
  });
  return segments.filter((segment) => segment.width > 0);
}

const segmentTitles = {
  tail: 'Last note carrying over from the previous cycle',
  rest: 'Rest before the first attack',
};

/**
 * The numbered duration bar every rhythm module draws: block widths proportional to durations,
 * an optional late start, and the playhead while this strip sounds. See ARCHITECTURE.md,
 * "Adding a module with playback".
 */
export function DurationStrip({
  label,
  durations,
  origin = 0,
  cyclic = true,
  blockTitle,
  showSum = false,
  overlay,
  playhead,
}: {
  label: string;
  durations: number[];
  /** Units from the downbeat to the first attack. */
  origin?: number;
  /** A loop wraps a late start's tail to the front; a linear frame shows a leading rest. */
  cyclic?: boolean;
  /** Tooltip for the block of `durations[index]`. */
  blockTitle?(index: number, duration: number): string;
  /** Also print the durations as "a + b + c" under the strip. */
  showSum?: boolean;
  /** Extra absolutely-positioned marks (e.g. grouping boundaries), drawn over the blocks. */
  overlay?: ReactNode;
  /** Draws the playback position while this strip sounds. */
  playhead?: { sourceId: string; unitSeconds: number; visible?: boolean };
}) {
  const start = describeRhythmOrigin(origin);
  const total = durations.reduce((sum, value) => sum + value, 0) + (cyclic ? 0 : origin);
  return (
    <div>
      <Text fw={600} size="sm" mb={4}>
        {label}
        {start && (
          <Text span c="dimmed" size="sm" fw={400}>
            {' '}
            · {start}
          </Text>
        )}
      </Text>
      <div
        className={classes.durationTimeline}
        aria-label={`${label} ${durations.join(' ')}${start ? `, ${start}` : ''}`}
      >
        {stripSegments(durations, origin, cyclic).map((segment, index) => (
          <span
            className={classes.durationBlock}
            key={index}
            title={
              segment.kind === 'attack'
                ? segment.index !== undefined
                  ? blockTitle?.(segment.index, segment.width)
                  : undefined
                : segmentTitles[segment.kind]
            }
            style={{
              flexGrow: segment.width,
              ...(segment.kind === 'attack'
                ? {}
                : { opacity: 0.55, fontStyle: 'italic', background: 'transparent' }),
            }}
          >
            {segment.text}
          </span>
        ))}
        {overlay}
        {/* Last, so it doesn't shift the blocks' alternating colours. */}
        {playhead && <Playhead {...playhead} length={total} cyclic={cyclic} />}
      </div>
      {showSum && (
        <Text ff="monospace" size="sm" mt={4} className={classes.durationText}>
          {durations.join(' + ')}
        </Text>
      )}
    </div>
  );
}
