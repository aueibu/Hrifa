/**
 * Ghost marks: a sounding pitch that matches no field note of the tab (a Sketch outsider, hold 4 on an off-field root, a
 * retuned note off the field) is drawn as a dashed, unfilled mark at its true position. Pure: the audio side counts them
 * by pitch (`ghostKey`), the lab state holds the cents, and `ghostsOf` turns them into what the ring and strip draw.
 */
import { mod, type Note } from '../../../lib/harmonic-field';

/** A ghost's identity in the reference counter: its cents to 0.01 c, as an integer. */
export const ghostKey = (cents: number): number => Math.round(cents * 100);
/** The cents a counter key stands for. */
export const ghostCents = (key: number): number => key / 100;

export interface Ghost {
  /** Cents above 1/1 reduced into the repeat: where the ghost sits on the ring and the strip. */
  c: number;
  /** Position round the ring as a fraction of a turn. */
  turn: number;
  /** Signed cents from this pitch to the nearest field note (positive: that note is above it); NaN with no field. */
  dist: number;
  /** Plain-words description for a tooltip or aria-label. */
  text: string;
}

/** Wrapped signed distance from `c` to the nearest field note, in cents. */
function nearestDist(fieldCents: readonly number[], repC: number, c: number): number {
  let best = Infinity;
  for (const f of fieldCents) {
    for (const d of [f - c, f - c + repC, f - c - repC]) {
      if (Math.abs(d) < Math.abs(best)) {
        best = d;
      }
    }
  }
  return fieldCents.length ? best : NaN;
}

/** The ghosts for these sounding cents: reduced into the repeat, de-duplicated (two octaves apart is one place), sorted. */
export function ghostsOf(field: readonly Note[], repC: number, cents: readonly number[]): Ghost[] {
  if (!(repC > 0)) {
    return [];
  }
  const fieldCents = field.map((n) => n.c);
  const seen = new Set<number>();
  const out: Ghost[] = [];
  for (const raw of cents) {
    if (!Number.isFinite(raw)) {
      continue;
    }
    const c = mod(raw, repC);
    const k = ghostKey(c);
    if (seen.has(k)) {
      continue;
    }
    seen.add(k);
    const dist = nearestDist(fieldCents, repC, c);
    const near = Number.isFinite(dist)
      ? `, nearest field note ${Math.abs(dist).toFixed(1)} c ${dist >= 0 ? 'above' : 'below'}`
      : '';
    out.push({
      c,
      turn: c / repC,
      dist,
      text: `${c.toFixed(1)} c, sounding outside the field${near}`,
    });
  }
  return out.sort((a, b) => a.c - b.c);
}
