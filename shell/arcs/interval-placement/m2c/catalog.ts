// M2c thin slice: the even-spacing catalog for the human to browse and hear, over a range of spans, scored with the new
// models. Two engines:
//  - 'equal' (default, 2026-11-20): the centres of the intervals are equally spaced in pitch, as far apart as the span
//    allows; each interval's bottom note is rounded once to the nearest step (halves round down). With 2+ intervals the
//    chord always reaches both the bottom and the top of the span (the binding pair has one interval at each edge).
//  - 'prefix-slack': the old page's default (alpha 0.3, beta 1, rho 0.5), for comparison; matches the human's screenshot
//    (7 11 16 in 24 steps = 4 5 7 11 16 23).
// Not the library change; that follows the human's look.
// Run from shell/: npx esbuild arcs/interval-placement/m2c/catalog.ts --bundle --platform=node --format=esm --outfile=/tmp/c.mjs && node /tmp/c.mjs > catalog.json
import { placeIntervals } from '../../../src/lib/interval-placement/index';
import { scoreVoicing, midiToHz } from '../../../src/lib/consonance/index';

const BASE_MIDI = 36; // C2
const SETS = [
  [11, 7, 16],
  [7, 5, 11],
];
const WIDTHS = Array.from({ length: 48 - 6 + 1 }, (_, i) => 6 + i); // one window size per catalog, 6..48 steps

type Span = { low: number; size: number; centre: number };

/** Every distinct ordering of `xs` (as values). */
function orderings(xs: number[]): number[][] {
  if (xs.length <= 1) return [xs.slice()];
  const out: number[][] = [];
  const seen = new Set<number>();
  xs.forEach((x, i) => {
    if (seen.has(x)) return;
    seen.add(x);
    for (const rest of orderings(xs.filter((_, j) => j !== i))) out.push([x, ...rest]);
  });
  return out;
}

/**
 * Equal centres: c_k = c0 + k*D with every interval inside [0, L]. D is the largest spacing that fits:
 * D = min over i<j of (L - (d_i + d_j)/2) / (j - i); then c0 = max_k (d_k/2 - k*D) (the only start that fits at that D).
 * Returns null when an interval is wider than the span.
 */
function equalCentres(order: number[], L: number): Span[] | null {
  const n = order.length;
  if (order.some((d) => d > L)) return null;
  let D = 0;
  let c0: number;
  if (n === 1) {
    c0 = L / 2;
  } else {
    D = Infinity;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) D = Math.min(D, (L - (order[i] + order[j]) / 2) / (j - i));
    c0 = Math.max(...order.map((d, k) => d / 2 - k * D));
  }
  return order.map((d, k) => {
    const centre = c0 + k * D;
    const low = Math.ceil(centre - d / 2 - 0.5 - 1e-9); // nearest step, halves round down
    return { low, size: d, centre };
  });
}

function score(steps: number[]) {
  const s = scoreVoicing({ refHz: midiToHz(BASE_MIDI), cents: steps.map((x) => x * 100) }, { decompose: false });
  return { rough: s.interference.hutchinsonKnopoff.total, harmP: s.harmonicity.pitch.value, per: s.periodicity.value };
}

const out: unknown[] = [];
for (const set of SETS) {
  for (const W of WIDTHS) {
    // ---- equal centres (default) ----
    const byKey = new Map<string, { spans: Span[]; orders: string[]; steps: number[]; shared: number[] }>();
    let skipped = 0;
    const ords = orderings(set);
    for (const order of ords) {
      const spans = equalCentres(order, W);
      if (!spans) {
        skipped++;
        continue;
      }
      const ends = spans.flatMap((s) => [s.low, s.low + s.size]);
      const steps = [...new Set(ends)].sort((a, b) => a - b);
      const shared = steps.filter((x) => ends.filter((y) => y === x).length > 1);
      const key = steps.join(',');
      const hit = byKey.get(key);
      if (hit) hit.orders.push(order.join(' '));
      else byKey.set(key, { spans, orders: [order.join(' ')], steps, shared });
    }
    out.push({ engine: 'equal', set: set.join(' '), width: W, skipped, orderings: ords.length, summary: true });
    for (const v of byKey.values()) {
      out.push({
        engine: 'equal',
        set: set.join(' '),
        width: W,
        orders: v.orders,
        spans: v.spans,
        midi: v.steps.map((x) => x + BASE_MIDI),
        sharedMidi: v.shared.map((x) => x + BASE_MIDI),
        fits: v.steps[0] >= 0 && v.steps[v.steps.length - 1] <= W,
        ...score(v.steps),
      });
    }

    // ---- prefix-slack (old default) ----
    const res = placeIntervals({
      intervals: set.map((s) => ({ cents: s * 100 })),
      window: { bottomHz: midiToHz(BASE_MIDI), widthSteps: W },
      distribution: 'prefixSlack',
      stepCents: 100,
    });
    out.push({ engine: 'prefix', set: set.join(' '), width: W, skipped: res.skipped, orderings: res.orderings.total, summary: true });
    for (const v of res.voicings) {
      const steps = v.cents.map((c) => Math.round(c / 100));
      out.push({
        engine: 'prefix',
        set: set.join(' '),
        width: W,
        orders: v.perms.map((p) => p.perm.map((c) => Math.round(c / 100)).join(' ')),
        spans: v.perms[0].endpoints.map(([lo, hi], i) => ({
          low: Math.round(lo / 100),
          size: Math.round((hi - lo) / 100),
          centre: v.meta.centersCents[i] / 100, // the engine's exact centre; its anchor is the floor
        })),
        midi: steps.map((x) => x + BASE_MIDI),
        sharedMidi: v.collisions.map((c) => Math.round(c.cents / 100) + BASE_MIDI),
        fits: steps[0] >= 0 && steps[steps.length - 1] <= W,
        ...score(steps),
      });
    }
  }
}
console.log(JSON.stringify(out));
