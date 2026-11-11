import { useEffect, useState, type RefObject } from 'react';
import { Text } from '@mantine/core';
import { formatPulses } from '../rhythmNotation';
import { InfoTooltip } from './hoverInfo';
import classes from '../CompositionWorkbench.module.css';

/** Where each note starts, plus where the last one ends: the running sum of the lengths. */
export function noteEdges(lengths: number[]): number[] {
  const edges = [0];
  for (const length of lengths) {
    edges.push(edges[edges.length - 1] + Math.abs(length));
  }
  return edges;
}

export type DiffDirection = 'still' | 'later' | 'earlier';

export interface DiffLine {
  /** Share of the width, 0 to 1, where the line leaves the input strip. */
  from: number;
  /** Share of the width where it reaches the edited strip. */
  to: number;
  moved: boolean;
  /** Whether this edge lands later or earlier in the edit than it sat in the input. */
  direction: DiffDirection;
  /**
   * How far it moved compared with where it was: the shift divided by its original position, signed
   * (+1 is twice as late, -0.5 is half as far in). An edge at the very start cannot move, so 0.
   */
  relative: number;
  /** How far it moved compared with the whole rhythm: the shift as a share of the longer total. */
  share: number;
  /**
   * How far it moved compared with the other edges of this same edit: 1 for the edge that moved
   * furthest, 0 for one that did not move, in proportion between.
   */
  weight: number;
  /** Which edge this is, counting from 0 at the start of the rhythm. */
  index: number;
  /** How far it moved, in pulses: positive is later, negative earlier. */
  shift: number;
}

/**
 * One line per note edge, from where it falls in the input to where it falls in the edit, with both
 * on a common pulse scale (`scale` is the longer of the two totals). Notes keep their order, so the
 * lines never cross; a line that leans shows how far that edge moved.
 */
export function diffLines(inputLengths: number[], editedLengths: number[]): DiffLine[] {
  const before = noteEdges(inputLengths);
  const after = noteEdges(editedLengths);
  const scale = Math.max(before.at(-1) ?? 0, after.at(-1) ?? 0) || 1;
  const count = Math.min(before.length, after.length);
  const shifts = Array.from({ length: count }, (_, index) => after[index] - before[index]);
  const furthest = Math.max(0, ...shifts.map((shift) => Math.abs(shift)));
  return Array.from({ length: count }, (_, index) => {
    const shift = shifts[index];
    const moved = Math.abs(shift) > 1e-9;
    return {
      from: before[index] / scale,
      to: after[index] / scale,
      moved,
      direction: !moved ? 'still' : shift > 0 ? 'later' : 'earlier',
      relative: moved && before[index] > 1e-9 ? shift / before[index] : 0,
      share: Math.abs(shift) / scale,
      weight: moved && furthest > 0 ? Math.abs(shift) / furthest : 0,
      index,
      shift,
    };
  });
}

/** A shift of this share of the whole rhythm, or more, draws a line at full opacity. */
const FULL_OPACITY_SHARE = 0.1;
/** A change of this much of an edge's original position, or more, draws it in the full hue. */
const FULL_COLOR_CHANGE = 1;

/** Thinnest and thickest a line is drawn, in px. */
const MIN_LINE_WIDTH = 2;
const MAX_LINE_WIDTH = 8;

/**
 * Opacity says how big the move is next to the whole rhythm. A still edge is faint; a moved edge runs
 * from clearly visible up to full opacity as its shift approaches a tenth of the rhythm's length.
 */
export function lineOpacity(line: Pick<DiffLine, 'moved' | 'share'>): number {
  if (!line.moved) {
    return 0.2;
  }
  const strength = Math.min(1, line.share / FULL_OPACITY_SHARE);
  return Math.round((0.3 + 0.7 * strength) * 1000) / 1000;
}

/**
 * Thickness is relative to this edit alone: the edge that moved furthest is drawn at the full 8px
 * and an edge that did not move at 2px, with the others in proportion, however big or small the
 * edit is overall.
 */
export function lineWidth(line: Pick<DiffLine, 'weight'>): number {
  return Math.round((MIN_LINE_WIDTH + (MAX_LINE_WIDTH - MIN_LINE_WIDTH) * line.weight) * 100) / 100;
}

/**
 * Color says which way an edge moved and how big the move is next to where it was: gray for a still
 * edge, cyan for earlier and orange for later, deepening toward the full hue as the change nears
 * doubling or halving its original position. The mix is made in CSS from theme variables, so it
 * follows light and dark mode.
 */
/** What hovering an edge's curve says. */
export function edgeInfo(line: Pick<DiffLine, 'index' | 'direction' | 'shift' | 'relative'>): string {
  if (line.direction === 'still') {
    return `Edge ${line.index + 1}: does not move`;
  }
  const percent = Math.round(Math.abs(line.relative) * 100);
  return `Edge ${line.index + 1}: moves ${formatPulses(Math.abs(line.shift))} pulses ${line.direction}${percent ? ` (${percent}% of where it was)` : ''}`;
}

export function lineColor(line: Pick<DiffLine, 'direction' | 'relative'>): string {
  if (line.direction === 'still') {
    return 'var(--text-muted)';
  }
  const hue = line.direction === 'later' ? 'orange' : 'cyan';
  const depth = Math.round(20 + 80 * Math.min(1, Math.abs(line.relative) / FULL_COLOR_CHANGE));
  return `color-mix(in srgb, var(--mark-${hue}) ${depth}%, var(--text-muted))`;
}

/** An S-curve from (x1, 0) down to (x2, height), in px. It leaves and arrives straight down. */
export function curvePath(x1: number, x2: number, height: number): string {
  const round = (value: number) => Math.round(value * 100) / 100;
  const middle = height / 2;
  return `M ${round(x1)} 0 C ${round(x1)} ${middle}, ${round(x2)} ${middle}, ${round(x2)} ${height}`;
}

export interface DiffLinePx extends DiffLine {
  /** Where the edge sits along the input strip, and along the result strip, in px from the left. */
  x1: number;
  x2: number;
}

/** A strip's blocks lie inside its 1px border, so an edge at a fraction f of the strip is at 1 + f * (width - 2). */
const STRIP_BORDER = 1;

/**
 * The lines placed in real px. The input strip is `inputWidth` wide and the result strip
 * `editedWidth`, both from the same left edge, so an edge sits where its block edge does.
 */
export function diffLinesPx(
  inputLengths: number[],
  editedLengths: number[],
  inputWidth: number,
  editedWidth: number
): DiffLinePx[] {
  const before = noteEdges(inputLengths);
  const after = noteEdges(editedLengths);
  const inputTotal = before.at(-1) || 1;
  const editedTotal = after.at(-1) || 1;
  const place = (position: number, total: number, width: number) =>
    STRIP_BORDER + (position / total) * Math.max(0, width - 2 * STRIP_BORDER);
  return diffLines(inputLengths, editedLengths).map((line, index) => ({
    ...line,
    x1: place(before[index], inputTotal, inputWidth),
    x2: place(after[index], editedTotal, editedWidth),
  }));
}

/** The lines that touch the horizontal range [left, right] in px: only these need drawing. */
export function linesInRange(lines: DiffLinePx[], left: number, right: number): DiffLinePx[] {
  return lines.filter((line) => Math.max(line.x1, line.x2) >= left && Math.min(line.x1, line.x2) <= right);
}

/** How far beyond the visible part to draw, in px, so a scroll shows curves already in place. */
const DRAW_MARGIN = 600;
/** The drawn window moves in steps of this many px, so scrolling redraws only now and then. */
const DRAW_STEP = 600;

interface DrawWindow {
  /** The part of the roll drawn, in px from its left, and the roll's whole width. */
  left: number;
  right: number;
  content: number;
}

/** The part of a roll of `content` px worth drawing for the view at `scrollLeft`, in whole steps. */
export function drawWindow(scrollLeft: number, viewWidth: number, content: number): DrawWindow {
  const left = Math.max(0, Math.floor((scrollLeft - DRAW_MARGIN) / DRAW_STEP) * DRAW_STEP);
  const right = Math.min(content, Math.ceil((scrollLeft + viewWidth + DRAW_MARGIN) / DRAW_STEP) * DRAW_STEP);
  return { left, right, content };
}

/**
 * The lines between two strips drawn one above the other, from the input strip's lower edge to the
 * result strip's upper edge. They are drawn in real px and only for the part of the roll near the
 * view (`scroller` says which), so the drawing is never wider than the screen. A drawing as wide as
 * a long rhythm (tens of thousands of px) is past what the GPU draws at full resolution, and comes
 * out blurry; this one stays sharp at any length.
 */
export function RhythmDiff({
  inputLengths,
  editedLengths,
  inputShare,
  editedShare,
  scroller,
  height = 36,
}: {
  inputLengths: number[];
  editedLengths: number[];
  /** Each strip's share of the roll's width, 0 to 1. */
  inputShare: number;
  editedShare: number;
  scroller: RefObject<HTMLElement | null>;
  height?: number;
}) {
  const [drawn, setDrawn] = useState<DrawWindow>({ left: 0, right: 0, content: 0 });

  useEffect(() => {
    const element = scroller.current;
    if (!element) {
      return undefined;
    }
    let frame = 0;
    const measure = () => {
      frame = 0;
      const next = drawWindow(element.scrollLeft, element.clientWidth, element.scrollWidth);
      setDrawn((current) =>
        current.left === next.left && current.right === next.right && current.content === next.content
          ? current
          : next
      );
    };
    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(measure);
      }
    };
    measure();
    element.addEventListener('scroll', schedule, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(schedule);
    observer?.observe(element);
    return () => {
      element.removeEventListener('scroll', schedule);
      observer?.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [scroller, inputShare, editedShare, inputLengths, editedLengths]);

  const width = drawn.right - drawn.left;
  const lines =
    drawn.content > 0
      ? linesInRange(
          diffLinesPx(inputLengths, editedLengths, inputShare * drawn.content, editedShare * drawn.content),
          drawn.left,
          drawn.right
        )
      : [];
  return (
    <div className={classes.rhythmDiff} style={{ height }}>
      {width > 0 && (
        <svg
          className={classes.rhythmDiffSvg}
          width={width}
          height={height}
          viewBox={`${drawn.left} 0 ${width} ${height}`}
          style={{ left: drawn.left }}
          role="img"
          aria-label={`${diffLines(inputLengths, editedLengths).filter((line) => line.moved).length} note edges moved by the edit`}
        >
          {lines.map((line, index) => (
            <g key={index} data-info={edgeInfo(line)}>
              <path
                className={classes.rhythmDiffLine}
                data-direction={line.direction}
                style={{
                  stroke: lineColor(line),
                  strokeOpacity: lineOpacity(line),
                  strokeWidth: lineWidth(line),
                }}
                d={curvePath(line.x1, line.x2, height)}
              />
              {/* A wide invisible stroke on top, so a thin curve is easy to point at. */}
              <path className={classes.rhythmDiffHit} d={curvePath(line.x1, line.x2, height)} />
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

/** What the lines mean, compactly: the two directions, with the full explanation on hover. */
export function RhythmDiffLegend() {
  return (
    <InfoTooltip
      help="Color: which way an edge moved (cyan earlier, orange later), deeper for a bigger change from where it was. Brightness: its share of the whole rhythm. Thickness: how far it moved compared with the other edges in this edit."
      className={classes.rhythmDiffLegend}
    >
      <Text size="xs" c="dimmed">
        <span className={classes.rhythmDiffSwatch} data-direction="earlier" />
        earlier
      </Text>
      <Text size="xs" c="dimmed">
        <span className={classes.rhythmDiffSwatch} data-direction="later" />
        later
      </Text>
    </InfoTooltip>
  );
}
