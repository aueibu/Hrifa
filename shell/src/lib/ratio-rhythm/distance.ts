/**
 * Distances between rhythms (Canon 5): Hamming on a common grid, swap distance (total movement),
 * chronotonic distance (area between IOI step graphs). Positions are integer slots or, for the
 * time-based measures, milliseconds (plain numbers; the caller converts at the edge).
 *
 * Pitch-domain counterpart: comparing two tunings, a comma merged or a note shifted by tempering;
 * the geometric measures see a real change where listeners may hear none (merge vs shift).
 */

/** Hamming distance: positions occupied in one rhythm and not in the other (grid positions as integers). */
export function hamming(a: number[], b: number[]): number {
  const A = new Set(a);
  const B = new Set(b);
  let d = 0;
  for (const x of A) {
    if (!B.has(x)) {
      d++;
    }
  }
  for (const x of B) {
    if (!A.has(x)) {
      d++;
    }
  }
  return d;
}

/**
 * Put slots of a ring of L onto a ring of M (M a multiple of L), exactly. Use a common grid
 * (`lcm` of the two rings) so both rhythms are compared on integer positions.
 */
export function rescaleSlots(slots: number[], L: number, M: number): number[] {
  if (M % L !== 0) {
    throw new Error(`grid ${M} is not a multiple of ring ${L}`);
  }
  const f = M / L;
  return slots.map((s) => s * f);
}

export interface SwapMatch {
  /** Total movement. */
  cost: number;
  /** For each onset of A (in order), the position of B it was matched to (mod L). */
  match: number[];
}

/**
 * Swap distance between two rhythms of the same number of onsets on a cycle of length L (slots
 * or milliseconds): the least total movement to carry each onset of A to a distinct onset of B,
 * trying every cyclic matching. Coincident onsets (a merge) are fine: B may repeat a position.
 */
export function swapDistance(A: number[], B: number[], L: number): SwapMatch | null {
  if (A.length !== B.length || !A.length) {
    return null;
  }
  const a = [...A].sort((x, y) => x - y);
  const b = [...B].sort((x, y) => x - y);
  return bestMatch(a, b, L);
}

function bestMatch(a: number[], b: number[], L: number): SwapMatch {
  const k = a.length;
  let best: SwapMatch | null = null;
  for (let j = 0; j < k; j++) {
    for (const sh of [-L, 0, L]) {
      let c = 0;
      const m: number[] = [];
      for (let i = 0; i < k; i++) {
        const idx = (i + j) % k;
        const x = b[idx] + (i + j >= k ? L : 0) + sh;
        c += Math.abs(a[i] - x);
        m.push(x);
      }
      if (!best || c < best.cost) {
        best = { cost: c, match: m.map((x) => ((x % L) + L) % L) };
      }
    }
  }
  return best as SwapMatch;
}

/**
 * Swap distance from the rhythm A to a reference E (such as the maximally even rhythm or k equal
 * steps) that may itself be rotated to fit: the lab's `align`. Slots on a ring of L.
 */
export function alignToReference(A: number[], E: number[], L: number): SwapMatch | null {
  if (A.length !== E.length || !A.length) {
    return null;
  }
  const a = [...A].sort((x, y) => x - y);
  const cands = new Set<number>();
  for (const x of a) {
    for (const e of E) {
      cands.add((((x - e) % L) + L) % L);
    }
  }
  let best: SwapMatch | null = null;
  for (const s of cands) {
    const B = E.map((e) => (e + s) % L).sort((x, y) => x - y);
    const m = bestMatch(a, B, L);
    if (!best || m.cost < best.cost) {
      best = m;
    }
  }
  return best;
}

/** Onset times in the same units as `cycle` for slots on a ring of L. */
export function slotTimes(slots: number[], L: number, cycle: number): number[] {
  return slots.map((s) => (s * cycle) / L);
}

/** One piece of the IOI step graph: over [from, to) the height is the IOI containing it. */
interface Step {
  from: number;
  to: number;
  h: number;
}

/**
 * The IOI step graph of a cycle: each interval between consecutive onsets (the last wraps to the
 * first onset of the next cycle, starting from time 0 as given) is a step as high as it is long.
 * Coincident onsets leave no step. Onsets are times in [0, cycle).
 */
function ioiSteps(times: number[], cycle: number): Step[] {
  const t = [...times].sort((a, b) => a - b);
  const out: Step[] = [];
  for (let i = 0; i < t.length; i++) {
    const from = t[i];
    const to = i + 1 < t.length ? t[i + 1] : cycle + t[0];
    if (to > from) {
      out.push({ from, to, h: to - from });
    }
  }
  return out;
}

function heightAt(steps: Step[], x: number, cycle: number): number {
  for (const s of steps) {
    if ((x >= s.from && x < s.to) || (x + cycle >= s.from && x + cycle < s.to)) {
      return s.h;
    }
  }
  return 0;
}

/**
 * Chronotonic distance (Gustafson): the area between the two rhythms' IOI step graphs over one
 * cycle. Units are time squared (ms^2 for times in ms). A collapsed short interval is penalized
 * more than a small shift.
 */
export function chronotonicDistance(a: number[], b: number[], cycle: number): number {
  const sa = ioiSteps(a, cycle);
  const sb = ioiSteps(b, cycle);
  const cuts = new Set<number>([0, cycle]);
  for (const s of [...sa, ...sb]) {
    for (const x of [s.from, s.to]) {
      const y = ((x % cycle) + cycle) % cycle;
      cuts.add(y);
    }
  }
  const xs = [...cuts].sort((p, q) => p - q);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const w = xs[i + 1] - xs[i];
    if (w <= 0) {
      continue;
    }
    const mid = xs[i] + w / 2;
    area += w * Math.abs(heightAt(sa, mid, cycle) - heightAt(sb, mid, cycle));
  }
  return area;
}
