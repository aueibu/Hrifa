import { compareRational, type Rational } from '../musicalTime';

/**
 * Sub-row layout of ONE Track (workbench TK2, W-82), pure; shared by the Arranger's rows and the scene ops
 * so both agree. Nothing is stored: objects are taken in start-time order (ties by id) and each goes to the
 * first sub-row where it overlaps nothing (touching is not overlap), else to a new one. Sub-rows are
 * automatic only; no object holds a row number.
 */

export interface LaneSpan {
  id: string;
  start: Rational;
  end: Rational;
}

export interface SubLaneLayout {
  /** The sub-row of every id (0 is the top one). */
  subLaneOf: Map<string, number>;
  /** Sub-rows (at least 1, also when empty). */
  count: number;
}

const overlap = (a: LaneSpan, b: LaneSpan) =>
  compareRational(a.start, b.end) < 0 && compareRational(b.start, a.end) < 0;

export function layoutSubLanes(spans: readonly LaneSpan[]): SubLaneLayout {
  const rows: LaneSpan[][] = [];
  const subLaneOf = new Map<string, number>();
  const ordered = [...spans].sort(
    (a, b) => compareRational(a.start, b.start) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
  for (const span of ordered) {
    let row = rows.findIndex((occupants) => !occupants.some((other) => overlap(span, other)));
    if (row < 0) {
      rows.push([]);
      row = rows.length - 1;
    }
    rows[row].push(span);
    subLaneOf.set(span.id, row);
  }
  return { subLaneOf, count: Math.max(1, rows.length) };
}
