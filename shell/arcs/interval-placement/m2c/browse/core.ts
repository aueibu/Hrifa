// Browse prototype worker: the full catalog of ONE input set (every ordering, every window in a range, both spacing
// rules), built and scored in the browser with the real scoring library. Bundled to an IIFE string and started from a
// blob URL by browse-page.template.html. Rules and rounding are the catalog's (m2c/catalog/build.ts).
import { interference, harmonicity, periodicity, DEFAULT_TIMBRE, midiToHz } from '../../../../src/lib/consonance/index';

type Job = { id: number; intervals: number[]; wmin: number; wmax: number; base: number };
const TIE = 1e-9;

function orderingsOf(xs: number[]): number[][] {
  if (xs.length <= 1) return [xs.slice()];
  const out: number[][] = [];
  const seen = new Set<number>();
  xs.forEach((x, i) => {
    if (seen.has(x)) return;
    seen.add(x);
    for (const rest of orderingsOf(xs.filter((_, j) => j !== i))) out.push([x, ...rest]);
  });
  return out;
}
function centres(rule: 'equal' | 'shared', order: number[], W: number): number[] {
  const n = order.length;
  if (n === 1) return [W / 2];
  if (rule === 'shared') {
    const h = Math.max(...order) / 2;
    return order.map((_, k) => h + (k * (W - 2 * h)) / (n - 1));
  }
  let D = Infinity;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) D = Math.min(D, (W - (order[i] + order[j]) / 2) / (j - i));
  let c0 = -Infinity;
  for (let k = 0; k < n; k++) c0 = Math.max(c0, order[k] / 2 - k * D);
  return order.map((_, k) => c0 + k * D);
}
/** tie: 0 toward the middle of the window (main), 1 down, 2 up. Returns the bottom note and whether it was a tie. */
function low(c: number, d: number, W: number, tie: number): [number, boolean] {
  const x = c - d / 2;
  const f = Math.floor(x + TIE);
  if (Math.abs(x - f - 0.5) > TIE) return [Math.round(x), false];
  if (tie === 1) return [f, true];
  if (tie === 2) return [f + 1, true];
  return [c < W / 2 - TIE ? f + 1 : f, true];
}
function build(rule: 'equal' | 'shared', order: number[], W: number, tie: number) {
  const cs = centres(rule, order, W);
  let ties = 0;
  const spans = order.map((d, k) => {
    const [lo, t] = low(cs[k], d, W, tie);
    if (t) ties++;
    return { low: lo, size: d, centre: cs[k] };
  });
  const ends = spans.flatMap((s) => [s.low, s.low + s.size]);
  const notes = [...new Set(ends)].sort((a, b) => a - b);
  const shared = notes.filter((x) => ends.filter((y) => y === x).length > 1);
  return { spans, notes, shared, ties, band: Math.max(...cs) - Math.min(...cs) };
}

self.onmessage = (ev: MessageEvent<Job>) => {
  const { id, intervals, wmin, wmax, base } = ev.data;
  const baseHz = midiToHz(base);
  const M = Math.max(...intervals);
  const orders = orderingsOf(intervals.slice().sort((a, b) => a - b));
  const placements: unknown[] = [];
  const chordKeys = new Set<string>();
  for (let W = Math.max(M, wmin); W <= wmax; W++)
    for (const rule of ['equal', 'shared'] as const)
      for (const order of orders) {
        const main = build(rule, order, W, 0);
        const down = main.ties ? build(rule, order, W, 1).notes : main.notes;
        const up = main.ties ? build(rule, order, W, 2).notes : main.notes;
        const key = main.notes.join(' ');
        chordKeys.add(key);
        if (main.ties) { chordKeys.add(down.join(' ')); chordKeys.add(up.join(' ')); }
        placements.push({ rule, order: order.join(' '), W, ...main, key, down: down.join(' '), up: up.join(' ') });
      }
  // score each distinct chord once; harmonicity and periodicity once per shape (they ignore register)
  const keys = [...chordKeys];
  const scores: Record<string, { rough: number; harm: number; per: number }> = {};
  const shapeCache = new Map<string, { harm: number; per: number }>();
  let last = 0;
  keys.forEach((key, i) => {
    const notes = key.split(' ').map(Number);
    const hz = notes.map((s) => baseHz * 2 ** (s / 12));
    const shape = notes.map((x) => x - notes[0]).join(' ');
    let sh = shapeCache.get(shape);
    if (!sh) {
      sh = { harm: harmonicity(hz, { space: 'pitch' }).value, per: periodicity(hz).value };
      shapeCache.set(shape, sh);
    }
    scores[key] = { rough: interference(hz, DEFAULT_TIMBRE, { model: 'hutchinson-knopoff', decompose: false }).total, ...sh };
    const now = Date.now();
    if (now - last > 150) {
      last = now;
      (self as unknown as Worker).postMessage({ id, type: 'progress', done: i + 1, total: keys.length });
    }
  });
  (self as unknown as Worker).postMessage({ id, type: 'done', placements, scores, orderings: orders.map((o) => o.join(' ')) });
};
