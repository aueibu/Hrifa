/**
 * Live roughness: the Sethares roughness of the pitches sounding now, as one total, one number per pair of notes, and
 * the "next note" curve (what the total would be if one more tone were added at each interval above the lowest note).
 * Pure math on top of `scoreRoughness` (no formulas copied): the page's Live roughness view draws it.
 */
import { scoreRoughness, type RoughnessOpts } from './scorersMore';
import { dissonanceAt } from './visual';

export interface LiveRoughness {
  /** Total roughness of all the tones, each tone's own partial-partial term included (`scoreRoughness`'s score). */
  total: number;
  /** Each tone's own partial-partial roughness, in input order (before sorting). */
  self: number[];
  /** One entry per pair of tones (i < j, indices into the cents list as given): the pair's roughness. */
  pairs: { i: number; j: number; roughness: number }[];
  /**
   * The chord plus one more tone `cents[k]` above the lowest tone: the total roughness then. Empty when no tone sounds.
   * The identity: `values[k] === scoreRoughness([...chord Hz, lowest * 2 ** (cents[k] / 1200)]).score` (to rounding).
   */
  curve: { cents: number[]; values: number[] };
  /** Hz of each tone, in input order. */
  hz: number[];
}

/**
 * Curve step in cents for `n` tones: 1 c while it is cheap, coarser as notes are added so one update stays near 8 ms
 * (measured: about 4.7 us per tone per curve point, so 8 notes at 1 c took 38 ms and at 6 c 6.5 ms).
 */
export const liveCurveStep = (n: number): number => Math.max(1, Math.ceil(n * 0.7));

export interface LiveOpts extends RoughnessOpts {
  /** Curve step in cents (default `liveCurveStep(number of tones)`). */
  step?: number;
  /** Span of the curve above the lowest tone in cents (default 1200). */
  repC?: number;
}

/**
 * `centsList`: pitches in cents above 1/1; `baseHz`: the Hz of 1/1 (a tone at c cents sounds at baseHz * 2^(c/1200)).
 * Non-finite cents are ignored.
 */
export function liveRoughness(
  centsList: readonly number[],
  baseHz: number,
  opts: LiveOpts = {}
): LiveRoughness {
  const { step: stepIn, repC = 1200, ...rough } = opts;
  const hz = centsList.filter(Number.isFinite).map((c) => baseHz * 2 ** (c / 1200));
  if (!hz.length || !(baseHz > 0)) {
    return { total: 0, self: [], pairs: [], curve: { cents: [], values: [] }, hz: [] };
  }
  const base = scoreRoughness(hz, rough);
  const detail = base.detail as {
    self: number[];
    pairs: { i: number; j: number; roughness: number }[];
  };
  const low = Math.min(...hz);
  const want = stepIn ?? liveCurveStep(hz.length);
  const st = Number.isFinite(want) && want > 0 ? Math.max(want, repC / 20000) : 1;
  const cents: number[] = [];
  const values: number[] = [];
  const grid: number[] = [];
  for (let c = 0; c <= repC + 1e-9; c += st) {
    grid.push(c);
  }
  if (grid[grid.length - 1] < repC - 1e-9) {
    grid.push(repC);
  }
  for (const c of grid) {
    const f = low * 2 ** (c / 1200);
    // the chord's total plus the new tone's own term and its roughness against each chord tone
    let v = base.score + (scoreRoughness([f], rough).detail as { self: number[] }).self[0];
    for (const h of hz) {
      v += (scoreRoughness([h, f], rough).detail as { pairs: { roughness: number }[] }).pairs[0]
        .roughness;
    }
    cents.push(c);
    values.push(v);
  }
  return {
    total: base.score,
    self: detail.self,
    pairs: detail.pairs,
    curve: { cents, values },
    hz,
  };
}

export interface FieldMark {
  /** Index into the field list given. */
  idx: number;
  /** Cents above the lowest shown note, reduced into one repeat (0 for the unison; a repeat above reads as 0). */
  interval: number;
  /** Roughness of the pair (the lowest shown note, a tone at `interval` above it): `dissonanceAt`. */
  roughness: number;
}

/**
 * Where every field note falls on the curve's axis: its interval above the lowest shown note, reduced into one repeat
 * (`(c - lowest) mod repC`; 0 and repC are the same unison mark). A field note that is one of the shown notes (or the
 * same reduced interval as a shown note) is left out, since the chord's own marks already draw it; field notes at the
 * same interval are listed once. Empty when nothing is shown. `baseHz` is the Hz of 1/1.
 */
export function fieldMarks(
  fieldCents: readonly number[],
  shownCents: readonly number[],
  baseHz: number,
  repC = 1200,
  opts: RoughnessOpts = {}
): FieldMark[] {
  const shown = shownCents.filter(Number.isFinite);
  if (!shown.length || !(repC > 0) || !(baseHz > 0)) {
    return [];
  }
  const low = Math.min(...shown);
  const lowHz = baseHz * 2 ** (low / 1200);
  const reduce = (c: number) => {
    const m = (((c - low) % repC) + repC) % repC;
    return m > repC - 1e-6 ? 0 : m;
  };
  const key = (x: number) => Math.round(x * 100);
  const taken = new Set(shown.map((c) => key(reduce(c))));
  const out: FieldMark[] = [];
  fieldCents.forEach((c, idx) => {
    if (!Number.isFinite(c)) {
      return;
    }
    const interval = reduce(c);
    const k = key(interval);
    if (taken.has(k)) {
      return;
    }
    taken.add(k);
    out.push({ idx, interval, roughness: dissonanceAt(interval, lowHz, opts) });
  });
  return out;
}
