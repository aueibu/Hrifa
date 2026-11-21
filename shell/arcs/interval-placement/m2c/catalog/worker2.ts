// Catalog v2 worker: builds, measures and scores the whole catalog of ONE interval set (every distinct ordering,
// every window, both spacing rules) and returns finished rows. Memory per task is small and constant (at most
// 120 orderings x 60 windows x 2 rules for n = 5), so the run never grows with the size of the catalog.
// Rules and rounding are the same as build.ts (ties toward the window middle; down / up variants kept).
import { parentPort } from 'node:worker_threads';
import { interference, harmonicity, periodicity, DEFAULT_TIMBRE, midiToHz } from '../../../../src/lib/consonance/index';

export const BASES = [36, 48]; // C2 (main) and C3
const TIE = 1e-9;
const RULES = ['equal', 'shared'] as const;

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
export { orderingsOf };

function centres(rule: 'equal' | 'shared', order: number[], W: number): number[] {
  const n = order.length;
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
function low(c: number, d: number, W: number, tie: number): [number, boolean] {
  const x = c - d / 2;
  const f = Math.floor(x + TIE);
  if (Math.abs(x - f - 0.5) > TIE) return [Math.round(x), false];
  if (tie === 1) return [f, true];
  if (tie === 2) return [f + 1, true];
  return [c < W / 2 - TIE ? f + 1 : f, true];
}
function place(rule: 'equal' | 'shared', order: number[], W: number, tie: number) {
  const cs = centres(rule, order, W);
  let ties = 0, rMax = 0, rSum = 0;
  const lows = order.map((d, k) => {
    const [lo, t] = low(cs[k], d, W, tie);
    if (t) ties++;
    const err = Math.abs(lo - (cs[k] - d / 2));
    rMax = Math.max(rMax, err);
    rSum += err;
    return lo;
  });
  const ends: number[] = [], isLow: boolean[] = [];
  order.forEach((d, k) => { ends.push(lows[k], lows[k] + d); isLow.push(true, false); });
  const notes = [...new Set(ends)].sort((a, b) => a - b);
  for (const e of ends) if (e < 0 || e > W) throw new Error(`note outside window: ${rule} ${order} W${W}`);
  let mStack = 0, mBottom = 0, mTop = 0;
  for (let a = 0; a < ends.length; a++)
    for (let b = a + 1; b < ends.length; b++)
      if (ends[a] === ends[b]) {
        if (isLow[a] && isLow[b]) mBottom++;
        else if (!isLow[a] && !isLow[b]) mTop++;
        else mStack++;
      }
  return { notes, ties, rMax, rMean: rSum / order.length, mStack, mBottom, mTop, band: Math.max(...cs) - Math.min(...cs) };
}

// ---- scoring with caches: per task (absolute chord, shape) and per worker (pitch-class class, at most 352) ----
const pcCache = new Map<number, number>();
const rotMin = (pc: number) => {
  let best = pc;
  for (let r = 1; r < 12; r++) { const rot = ((pc >> r) | (pc << (12 - r))) & 0xfff; if (rot < best) best = rot; }
  return best;
};
const hzAt = (base: number, steps: number[]) => { const b = midiToHz(base); return steps.map((s) => b * 2 ** (s / 12)); };

type Scores = { rough: number[]; harm: number; per: number; harmPc: number; pc: number };
function scorer() {
  const chord = new Map<string, Scores>();
  const shape = new Map<string, { harm: number; per: number }>();
  return (notes: number[]): Scores => {
    const key = notes.join(' ');
    let s = chord.get(key);
    if (s) return s;
    const shKey = notes.map((x) => x - notes[0]).join(' ');
    let sh = shape.get(shKey);
    if (!sh) {
      const f = hzAt(BASES[0], notes);
      sh = { harm: harmonicity(f, { space: 'pitch' }).value, per: periodicity(f).value };
      shape.set(shKey, sh);
    }
    let pc = 0;
    for (const n of notes) pc |= 1 << ((n + BASES[0]) % 12);
    const pk = rotMin(pc);
    let hp = pcCache.get(pk);
    if (hp === undefined) {
      const pcs: number[] = [];
      for (let p = 0; p < 12; p++) if (pk & (1 << p)) pcs.push(p);
      hp = harmonicity(hzAt(60, pcs), { space: 'pitch-class' }).value;
      pcCache.set(pk, hp);
    }
    s = {
      rough: BASES.map((b) => interference(hzAt(b, notes), DEFAULT_TIMBRE, { model: 'hutchinson-knopoff', decompose: false }).total),
      harm: sh.harm, per: sh.per, harmPc: hp, pc,
    };
    chord.set(key, s);
    return s;
  };
}

// Row column order; build2.ts creates the table from this list.
export const COLUMNS = [
  'rule', 'set_id', 'ord', 'window', 'notes', 'note_count', 'merges', 'merge_stack', 'merge_bottom', 'merge_top',
  'lowest', 'highest', 'span', 'pc_mask', 'gap_min', 'gap_max', 'gaps_octave', 'distinct_intervals', 'band',
  'round_max', 'round_mean', 'ties', 'essential_extra', 'mirror_ok', 'rough', 'rough_c3', 'harm_pitch', 'harm_pc',
  'periodicity', 'down_notes', 'down_rough', 'down_harm', 'up_notes', 'up_rough', 'up_harm', 'rank_rough', 'rank_harm',
  'pareto_layer',
] as const;

export function runSet(setId: number, set: number[], wmin: number, wmax: number) {
  const n = set.length;
  const orders = orderingsOf(set);
  const ordIndex = new Map(orders.map((o, i) => [o.join(' '), i]));
  const score = scorer();
  const ess = new Map<number, number>();
  for (const d of set) ess.set(d, (ess.get(d) ?? 0) + 1);
  const rows: unknown[][] = [];
  const M = set[n - 1];
  for (let W = Math.max(M, wmin); W <= wmax; W++) {
    for (const rule of RULES) {
      const group: { row: unknown[]; rough: number; harm: number; notesKey: string; ord: number }[] = [];
      const byOrd = new Map<number, string>();
      for (let o = 0; o < orders.length; o++) {
        const order = orders[o];
        const p = place(rule, order, W, 0);
        const sc = score(p.notes);
        const notes = p.notes;
        const gaps = notes.slice(1).map((x, i) => x - notes[i]);
        const diff = new Map<number, number>();
        for (let a = 0; a < notes.length; a++) for (let b = a + 1; b < notes.length; b++) { const d = notes[b] - notes[a]; diff.set(d, (diff.get(d) ?? 0) + 1); }
        let essExtra = 0;
        for (const [d, c] of ess) essExtra += Math.max(0, (diff.get(d) ?? 0) - c);
        let dn: number[] | null = null, up: number[] | null = null, dS: Scores | null = null, uS: Scores | null = null;
        if (p.ties) {
          dn = place(rule, order, W, 1).notes; up = place(rule, order, W, 2).notes;
          dS = score(dn); uS = score(up);
        }
        const key = notes.join(' ');
        byOrd.set(o, key);
        const row = [
          rule, setId, o, W, key, notes.length, 2 * n - notes.length, p.mStack, p.mBottom, p.mTop,
          notes[0], notes[notes.length - 1], notes[notes.length - 1] - notes[0], sc.pc,
          gaps.length ? Math.min(...gaps) : 0, gaps.length ? Math.max(...gaps) : 0, gaps.filter((g) => g >= 12).length, diff.size,
          p.band, p.rMax, p.rMean, p.ties, essExtra, 0, sc.rough[0], sc.rough[1], sc.harm, sc.harmPc, sc.per,
          dn ? dn.join(' ') : null, dS ? dS.rough[0] : null, dS ? dS.harm : null,
          up ? up.join(' ') : null, uS ? uS.rough[0] : null, uS ? uS.harm : null, 0, 0, 0,
        ];
        group.push({ row, rough: sc.rough[0], harm: sc.harm, notesKey: key, ord: o });
      }
      // mirror: the reversed ordering's chord should be this chord upside down within the window
      for (const g of group) {
        const rev = ordIndex.get(orders[g.ord].slice().reverse().join(' '))!;
        const mirror = g.notesKey.split(' ').map((x) => W - Number(x)).sort((a, b) => a - b).join(' ');
        g.row[23] = byOrd.get(rev) === mirror ? 1 : 0;
      }
      // dense ranks and Pareto layers on (roughness min, pitch harmonicity max) within (rule, set, window)
      const rv = [...new Set(group.map((g) => g.rough))].sort((a, b) => a - b);
      const hv = [...new Set(group.map((g) => g.harm))].sort((a, b) => b - a);
      for (const g of group) { g.row[35] = rv.indexOf(g.rough) + 1; g.row[36] = hv.indexOf(g.harm) + 1; }
      let left = group.slice(), L = 1;
      while (left.length) {
        const front = left.filter((a) => !left.some((b) => b.rough <= a.rough && b.harm >= a.harm && (b.rough < a.rough || b.harm > a.harm)));
        for (const a of front) a.row[37] = L;
        left = left.filter((a) => !front.includes(a));
        L++;
      }
      for (const g of group) rows.push(g.row);
    }
  }
  return { orders: orders.map((o) => o.join(' ')), rows };
}

if (parentPort) {
  parentPort.on('message', (t: { setId: number; set: number[]; wmin: number; wmax: number }) => {
    try {
      const r = runSet(t.setId, t.set, t.wmin, t.wmax);
      parentPort!.postMessage({ setId: t.setId, ...r });
    } catch (e) {
      parentPort!.postMessage({ setId: t.setId, error: String((e as Error).stack ?? e) });
    }
  });
}
