import type { ReactNode } from 'react';
import { Text } from '@mantine/core';
import { attackPositions, describeRhythmOrigin } from '../rhythmFrame';
import { formatPulses, formatRhythmStep } from '../rhythmNotation';
import { useInfoBarActive } from './hoverInfo';
import { Playhead } from './Playhead';
import classes from '../CompositionWorkbench.module.css';

export interface StripSegment {
  width: number;
  text: string;
  kind: 'attack' | 'rest' | 'tail';
  /** Index into `durations` for attack segments. */
  index?: number;
  /** Tied into the next block. */
  tie?: boolean;
}

/** One block per rhythm item, with rests and tie marks, drawn from the downbeat (no late start). */
export function stepSegments(steps: { duration: number; tie?: boolean }[]): StripSegment[] {
  return steps.map(
    (step, index): StripSegment => ({
      width: Math.abs(step.duration),
      text: formatRhythmStep(step),
      kind: step.duration < 0 ? 'rest' : 'attack',
      index,
      tie: step.tie,
    })
  );
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
    (width, index): StripSegment => ({ width, text: formatPulses(width), kind: 'attack', index })
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
const restTitle = 'Rest';

/** Roughly how wide one monospace character is in a strip block, in px. */
export const BLOCK_CHAR_PX = 8.6;

/** Whether `text` fits in a cell `widthPx` wide, with a little room either side. */
export function labelFits(widthPx: number, text: string, charPx: number): boolean {
  return widthPx >= text.length * charPx + 6;
}

/** The boundaries a strip of `total` pulses can draw: the cycle's edges count as boundaries too. */
export function visibleBoundaries(boundaries: number[] | undefined, total: number): number[] {
  return [...new Set(boundaries ?? [])].filter((boundary) => boundary >= 0 && boundary <= total);
}

/**
 * The numbered duration bar every rhythm module draws: block widths proportional to durations,
 * an optional late start, and the playhead while this strip sounds. See ARCHITECTURE.md,
 * "Adding a module with playback".
 */
export function DurationStrip({
  label,
  durations,
  steps,
  origin = 0,
  cyclic = true,
  blockTitle,
  showSum = false,
  overlay,
  boundaries,
  playhead,
  labelPlacement = 'above',
  widthShare,
  pxPerPulse,
}: {
  label: string;
  durations: number[];
  /** With rests and ties: one entry per item, in the same order as `durations`. */
  steps?: { duration: number; tie?: boolean }[];
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
  /**
   * Grouping boundaries as pulses from the strip's left edge. Each is drawn as a short tick on the
   * strip's top and bottom edges, inside it.
   */
  boundaries?: number[];
  /** Draws the playback position while this strip sounds. */
  playhead?: { sourceId: string; unitSeconds: number; visible?: boolean };
  /** Under the strip instead of above it, so a diagram can run right up to the strip's top edge. */
  labelPlacement?: 'above' | 'below';
  /** The share of the available width this strip spans (0 to 1), to draw strips on one scale. */
  widthShare?: number;
  /**
   * Draw every block at exactly its share of the strip's width, with no minimum width, so block
   * edges fall precisely where the guides, ticks and curves of a roll put them. A block too narrow
   * for its label then shows no label (its tooltip still names it). This is how many px one pulse is.
   */
  pxPerPulse?: number;
}) {
  const start = steps ? '' : describeRhythmOrigin(origin);
  const total = durations.reduce((sum, value) => sum + value, 0) + (cyclic || steps ? 0 : origin);
  const notation = steps ? steps.map((step) => formatRhythmStep(step)) : durations.map(formatPulses);
  const segments = steps ? stepSegments(steps) : stripSegments(durations, origin, cyclic);
  const ticks = visibleBoundaries(boundaries, total);
  const infoBar = useInfoBarActive();
  /** What hovering a block says: the caller's text, or a default naming the note. */
  const blockInfo = (segment: StripSegment): string | undefined => {
    if (segment.kind === 'attack') {
      return segment.index === undefined
        ? undefined
        : (blockTitle?.(segment.index, segment.width) ??
            (steps
              ? `Note ${segment.index + 1}: ${formatPulses(segment.width)} pulses${segment.tie ? ', tied into the next note' : ''}`
              : undefined));
    }
    if (steps) {
      return segment.index === undefined
        ? restTitle
        : `Note ${segment.index + 1}: rest of ${formatPulses(segment.width)} pulses`;
    }
    return segmentTitles[segment.kind];
  };
  const heading = (
    <Text
      className={classes.stickyLabel}
      fw={600}
      size="sm"
      mb={labelPlacement === 'above' ? 4 : 0}
      mt={labelPlacement === 'below' ? 4 : 0}
    >
      {label}
      {start && (
        <Text span c="dimmed" size="sm" fw={400}>
          {' '}
          · {start}
        </Text>
      )}
    </Text>
  );
  return (
    <div style={widthShare === undefined ? undefined : { width: `${widthShare * 100}%` }}>
      {labelPlacement === 'above' && heading}
      <div className={classes.stripFrame}>
      <div
        className={classes.durationTimeline}
        aria-label={`${label} ${notation.join(' ')}${start ? `, ${start}` : ''}`}
      >
        {segments.map((segment, index) => (
          <span
            className={classes.durationBlock}
            key={index}
            data-tie={segment.tie || undefined}
            data-info={blockInfo(segment)}
            title={infoBar ? undefined : blockInfo(segment)}
            style={{
              ...(pxPerPulse === undefined || !(total > 0)
                ? { flexGrow: segment.width }
                : { flex: 'none', minWidth: 0, width: `${(segment.width / total) * 100}%` }),
              ...(segment.kind === 'attack'
                ? {}
                : { opacity: 0.55, fontStyle: 'italic', background: 'transparent' }),
            }}
          >
            {pxPerPulse === undefined || labelFits(segment.width * pxPerPulse, segment.text, BLOCK_CHAR_PX)
              ? segment.text
              : ''}
          </span>
        ))}
        {/* Ticks sit inside the strip, on its top and bottom edges, at each grouping boundary. */}
        {ticks.map((boundary) =>
          (['top', 'bottom'] as const).map((edge) => (
            <span
              key={`${edge}-${boundary}`}
              className={classes.groupTick}
              data-edge={edge}
              style={{ left: `${(boundary * 100) / total}%` }}
              aria-hidden="true"
            />
          ))
        )}
        {overlay}
        {/* Last, so it doesn't shift the blocks' alternating colours. */}
        {playhead && <Playhead {...playhead} length={total} cyclic={cyclic} />}
      </div>
      </div>
      {labelPlacement === 'below' && heading}
      {showSum && (
        <Text ff="monospace" size="sm" mt={4} className={classes.durationText}>
          {steps ? notation.join(' ') : durations.map(formatPulses).join(' + ')}
        </Text>
      )}
    </div>
  );
}
