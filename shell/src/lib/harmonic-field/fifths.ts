/**
 * Fifths (generator chain) layout: where each note sits on a circle of generator steps. Pure geometry, no React.
 *
 * The chain has `steps` positions, step s = s generators stacked and reduced into [0, period). With `steps` = 12 the
 * steps run from -5 to +6 (F C G D A E B F# C# G# D# A# when gen = 3/2 in 12-EDO). Each note goes to the chain step
 * whose reduced pitch is nearest (circular distance), with its signed offset (note - step pitch, in cents). A note
 * further than half a chain slot (period / steps / 2) from every position is `offChain`. Notes that share a step get
 * `stack` 0, 1, 2 ... in input order, so the page can nudge them inward or outward.
 */
export interface FifthsOpts {
  /** Generator size in cents (default 3/2 = 701.955). */
  gen?: number;
  /** Period in cents (default 1200). */
  period?: number;
  /** Chain length (default 12). */
  steps?: number;
}

export interface FifthsPosition {
  step: number;
  /** Reduced pitch of the step, in cents. */
  cents: number;
  /** Position round the circle in turns, clockwise from the top: (step mod steps) / steps. */
  turn: number;
}

export interface FifthsPlacement {
  step: number;
  /** Note minus the step's pitch, cents, within +-period/2. */
  offset: number;
  turn: number;
  stack: number;
  offChain: boolean;
}

export interface FifthsLayout {
  lo: number;
  hi: number;
  positions: FifthsPosition[];
  notes: FifthsPlacement[];
}

export const FIFTH_CENTS = 1200 * Math.log2(1.5);

export function fifthsLayout(notes: { c: number }[], opts: FifthsOpts = {}): FifthsLayout {
  const gen = opts.gen ?? FIFTH_CENTS;
  const period = opts.period ?? 1200;
  const n = Math.max(1, Math.floor(opts.steps ?? 12));
  const lo = -Math.floor((n - 1) / 2);
  const hi = lo + n - 1;
  const red = (x: number) => ((x % period) + period) % period;
  const turnOf = (s: number) => (((s % n) + n) % n) / n;
  const positions: FifthsPosition[] = [];
  for (let s = lo; s <= hi; s++) {
    positions.push({ step: s, cents: red(s * gen), turn: turnOf(s) });
  }
  const used = new Map<number, number>();
  const placed = notes.map((note) => {
    let best = positions[0];
    let bestOff = Infinity;
    for (const p of positions) {
      let d = red(note.c - p.cents);
      if (d > period / 2) {
        d -= period;
      }
      if (Math.abs(d) < Math.abs(bestOff) - 1e-9) {
        bestOff = d;
        best = p;
      }
    }
    const stack = used.get(best.step) ?? 0;
    used.set(best.step, stack + 1);
    return {
      step: best.step,
      offset: bestOff,
      turn: best.turn,
      stack,
      offChain: Math.abs(bestOff) > period / n / 2 + 1e-9,
    };
  });
  return { lo, hi, positions, notes: placed };
}
