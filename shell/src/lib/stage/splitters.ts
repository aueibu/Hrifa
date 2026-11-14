/**
 * Splitter arithmetic on plain numbers: vertical stack shares (ported from the harmonic-field lab) and column widths.
 * Nothing here knows about layouts; layout.ts applies the results.
 *
 * Stack shares: one per slot top to bottom, summing to 1. Each slot keeps at least max(6 rem, 20%) of the column height.
 * Column widths: dragging the splitter between two neighbouring columns trades width between exactly those two (their
 * total stays constant); both stay within [MIN_COLUMN_REM, MAX_COLUMN_REM].
 */
import { SIZE_MIN_HEIGHT_REM, SIZE_MIN_WIDTH_REM, SIZE_UNIT_REM } from './size';

export const SPLIT_STEP = 0.05;
export const SPLIT_MIN_SHARE = 0.2;
export const SPLIT_MIN_REM = SIZE_MIN_HEIGHT_REM;

const round4 = (x: number) => Math.round(x * 10000) / 10000;

export const evenShares = (n: number): number[] => Array.from({ length: n }, () => round4(1 / n));
export const isEvenShares = (s: readonly number[]): boolean =>
  s.every((v) => Math.abs(v - 1 / s.length) < 1e-3);

/** The smallest share one slot may have in a column `heightRem` tall holding `n` slots (even when too short). */
export function minShare(heightRem: number, n: number): number {
  const m = Math.max(SPLIT_MIN_SHARE, SPLIT_MIN_REM / (heightRem > 0 ? heightRem : Infinity));
  return m * n >= 1 ? 1 / n : m;
}

/**
 * Repair shares so each is at least the minimum and they sum to 1: slots below the minimum are lifted to it, and the cost
 * is taken from the others in proportion to their room above it. A column too short for the minimums is shared evenly;
 * non-numbers repair to even.
 */
export function clampShares(shares: readonly number[], heightRem: number): number[] {
  const n = shares.length;
  const m = minShare(heightRem, n);
  if (n < 2 || !shares.every(Number.isFinite) || m * n >= 1 - 1e-9) {
    return evenShares(n);
  }
  const total = shares.reduce((a, b) => a + b, 0) || 1;
  let s = shares.map((v) => Math.max(0, v) / total);
  for (let pass = 0; pass < n; pass++) {
    const low = s.map((v) => v < m);
    if (!low.some(Boolean)) {
      break;
    }
    const room = s.reduce((a, v, i) => a + (low[i] ? 0 : v - m), 0);
    const need = s.reduce((a, v, i) => a + (low[i] ? m - v : 0), 0);
    s = s.map((v, i) => (low[i] ? m : v - (room > 0 ? ((v - m) / room) * need : 0)));
  }
  const out = s.map(round4);
  out[out.length - 1] = round4(1 - out.slice(0, -1).reduce((a, b) => a + b, 0));
  return out;
}

/** The boundary positions splitter `index` may take: between its two neighbours, each keeping its minimum. */
export function splitterRange(
  shares: readonly number[],
  index: number,
  heightRem: number
): { min: number; max: number } {
  const m = minShare(heightRem, shares.length);
  const before = shares.slice(0, index).reduce((a, b) => a + b, 0);
  const after = before + shares[index] + shares[index + 1];
  return { min: round4(before + m), max: round4(after - m) };
}

/** Where splitter `index` (between slot `index` and `index + 1`) sits: the share above it. */
export const splitterAt = (shares: readonly number[], index: number): number =>
  round4(shares.slice(0, index + 1).reduce((a, b) => a + b, 0));

/** Drag splitter `index` to `boundary` (a fraction of the column height from the top); only its two neighbours trade. */
export function dragSplitter(
  shares: readonly number[],
  index: number,
  boundary: number,
  heightRem: number
): number[] {
  const base = clampShares(shares, heightRem);
  if (index < 0 || index >= base.length - 1) {
    return base;
  }
  const { min, max } = splitterRange(base, index, heightRem);
  const b = Math.min(
    max,
    Math.max(min, Number.isFinite(boundary) ? boundary : splitterAt(base, index))
  );
  const before = base.slice(0, index).reduce((a, v) => a + v, 0);
  const next = [...base];
  next[index] = round4(b - before);
  next[index + 1] = round4(base[index] + base[index + 1] - next[index]);
  return next;
}

/** Keyboard on one stack splitter: Up and Down move it 5%, Home and End jump to its limits. */
export function nudgeSplitter(
  shares: readonly number[],
  index: number,
  key: 'ArrowUp' | 'ArrowDown' | 'Home' | 'End',
  heightRem: number
): number[] {
  const base = clampShares(shares, heightRem);
  if (index < 0 || index >= base.length - 1) {
    return base;
  }
  const { min, max } = splitterRange(base, index, heightRem);
  const at = splitterAt(base, index);
  const to =
    key === 'ArrowUp'
      ? at - SPLIT_STEP
      : key === 'ArrowDown'
        ? at + SPLIT_STEP
        : key === 'Home'
          ? min
          : max;
  return dragSplitter(base, index, to, heightRem);
}

/* ------------------------------------------------------------------------------------------------ column widths */
/** Six units (36 rem), the regular nominal size. */
export const DEFAULT_COLUMN_REM = 6 * SIZE_UNIT_REM;
export const MIN_COLUMN_REM = SIZE_MIN_WIDTH_REM;
/** The widest a column may be (8U x 2); a documented cap so a stored value cannot be absurd. */
export const MAX_COLUMN_REM = 96;
/** Keyboard step on a column splitter, in rem. */
export const COLUMN_STEP_REM = 1;

export const clampColumnWidth = (rem: number): number =>
  Number.isFinite(rem)
    ? Math.min(MAX_COLUMN_REM, Math.max(MIN_COLUMN_REM, round4(rem)))
    : DEFAULT_COLUMN_REM;

/** The range of widths the left column of a pair may take (the pair's total is fixed, both stay within the limits). */
export function columnSplitterRange(
  leftRem: number,
  rightRem: number
): { min: number; max: number } {
  const total = leftRem + rightRem;
  return {
    min: Math.max(MIN_COLUMN_REM, total - MAX_COLUMN_REM),
    max: Math.min(MAX_COLUMN_REM, total - MIN_COLUMN_REM),
  };
}

/** Drag the splitter between two columns to give the left one `leftRem`; returns [left, right] with the same total. */
export function dragColumnWidths(
  leftRem: number,
  rightRem: number,
  newLeftRem: number
): [number, number] {
  const l0 = clampColumnWidth(leftRem);
  const r0 = clampColumnWidth(rightRem);
  const total = round4(l0 + r0);
  const { min, max } = columnSplitterRange(l0, r0);
  const left = round4(Math.min(max, Math.max(min, Number.isFinite(newLeftRem) ? newLeftRem : l0)));
  return [left, round4(total - left)];
}

/** Keyboard on a column splitter: Left and Right move it 1 rem, Home and End jump to the limits. */
export function nudgeColumnWidths(
  leftRem: number,
  rightRem: number,
  key: 'ArrowLeft' | 'ArrowRight' | 'Home' | 'End'
): [number, number] {
  const { min, max } = columnSplitterRange(clampColumnWidth(leftRem), clampColumnWidth(rightRem));
  const at = clampColumnWidth(leftRem);
  const to =
    key === 'ArrowLeft'
      ? at - COLUMN_STEP_REM
      : key === 'ArrowRight'
        ? at + COLUMN_STEP_REM
        : key === 'Home'
          ? min
          : max;
  return dragColumnWidths(leftRem, rightRem, to);
}
