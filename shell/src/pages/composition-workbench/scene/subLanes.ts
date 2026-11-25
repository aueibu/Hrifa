import { compareRational, type Rational } from '../musicalTime';

/**
 * Sub-lane layout of ONE collection (workbench L3, W-78), pure; shared by the Arranger's lanes and the
 * scene ops so both agree. Each object has a lane NUMBER: its stored `lane` or, when automatic, the first
 * occupied number where it overlaps nothing (touching is not overlap), else the lowest unused number from
 * 0 (when it overlaps every occupied lane it takes the lowest unused number, which can fall between two
 * lanes the human opened and push the later one down a row: logged in BACKLOG). The DISPLAY sub-lane is the dense
 * rank of the occupied numbers (gaps vanish, an emptied lane disappears).
 */

export interface LaneSpan {
  id: string;
  start: Rational;
  end: Rational;
  /** The stored lane number; absent = automatic. */
  lane?: number;
}

export interface SubLaneLayout {
  /** The lane number of every id (stored, or the one the automatic pass picked). */
  numberOf: Map<string, number>;
  /** The display sub-lane (dense rank) of every id. */
  subLaneOf: Map<string, number>;
  /** Occupied lane numbers, ascending: index = display sub-lane. */
  numbers: number[];
  /** Display sub-lanes (at least 1, also when empty). */
  count: number;
}

const overlap = (a: LaneSpan, b: LaneSpan) =>
  compareRational(a.start, b.end) < 0 && compareRational(b.start, a.end) < 0;

export function layoutSubLanes(spans: readonly LaneSpan[]): SubLaneLayout {
  const occupants = new Map<number, LaneSpan[]>();
  const numberOf = new Map<string, number>();
  const put = (span: LaneSpan, lane: number) => {
    occupants.set(lane, [...(occupants.get(lane) ?? []), span]);
    numberOf.set(span.id, lane);
  };
  spans.forEach((span) => span.lane !== undefined && put(span, span.lane));
  const automatic = spans
    .map((span, index) => ({ span, index }))
    .filter(({ span }) => span.lane === undefined)
    .sort((a, b) => compareRational(a.span.start, b.span.start) || a.index - b.index);
  for (const { span } of automatic) {
    const open = [...occupants.keys()]
      .sort((a, b) => a - b)
      .find((lane) => !(occupants.get(lane) ?? []).some((other) => overlap(span, other)));
    if (open !== undefined) {
      put(span, open);
    } else {
      let fresh = 0;
      while (occupants.has(fresh)) {
        fresh += 1;
      }
      put(span, fresh);
    }
  }
  const numbers = [...occupants.keys()].sort((a, b) => a - b);
  const subLaneOf = new Map([...numberOf].map(([id, lane]) => [id, numbers.indexOf(lane)]));
  return { numberOf, subLaneOf, numbers, count: Math.max(1, numbers.length) };
}
