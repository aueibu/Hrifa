/**
 * Keyboard navigation of the chord picker's list, as data (no DOM): the one implementation behind
 * the picker's own arrow keys and the editor's key map (which also works with focus on the roll).
 */
import type { SpreadStyle } from './voicing';

/** The spread styles in the order Alt+Left (previous) and Alt+Right (next) step through. */
export const SPREAD_ORDER: readonly SpreadStyle[] = ['close', 'open', 'drop2', 'drop3'];

/** The next spread style; it cycles (after the last comes the first, and the other way round). */
export function stepSpread(current: SpreadStyle, delta: number): SpreadStyle {
  const at = Math.max(0, SPREAD_ORDER.indexOf(current));
  return SPREAD_ORDER[cycle(at + delta, SPREAD_ORDER.length)]!;
}

/** `value` wrapped into 0..size-1 (size at least 1). */
export function cycle(value: number, size: number): number {
  return ((value % size) + size) % size || 0;
}

/**
 * The key reached by an arrow press. `columns` is one list (root mode: the wrapping grid, where
 * any arrow steps one chord, Down/Right forward) or one list per role (common-tone mode: Up/Down
 * within a column, Left/Right to the neighbour column keeping the row). Clamped, never wraps.
 * Null when there is nothing to move to.
 */
export function stepChordKey(
  columns: readonly (readonly string[])[],
  mode: 'root' | 'common',
  current: string | null,
  dx: number,
  dy: number
): string | null {
  if (mode === 'root') {
    const keys = columns.flat();
    if (keys.length === 0) {
      return null;
    }
    const at = current === null ? -1 : keys.indexOf(current);
    if (at < 0) {
      return keys[0]!;
    }
    return keys[Math.max(0, Math.min(keys.length - 1, at + (dy || dx)))]!;
  }
  const colAt = columns.findIndex((column) => current !== null && column.includes(current));
  if (colAt < 0) {
    return columns.find((column) => column.length > 0)?.[0] ?? null;
  }
  const rowAt = columns[colAt]!.indexOf(current!);
  const column = columns[Math.max(0, Math.min(columns.length - 1, colAt + dx))]!;
  return column[Math.max(0, Math.min(column.length - 1, rowAt + dy))] ?? null;
}
