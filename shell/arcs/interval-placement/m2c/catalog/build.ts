// Interval Placement catalog builder (M2c data study). For every multiset of n essential intervals with sizes 1..max
// steps (12-EDO steps above a base note), every distinct ordering, every window size from the largest interval up to
// wmax, and both spacing rules ('equal' centers, 'shared' center range), it builds the chord, measures its structure,
// scores every distinct chord once, and writes one SQLite file. See README.md for the schema and example queries.
//
// Efficiency: (1) one pass builds all placements into typed-array columns and collects distinct chords keyed by a
// 49-bit note mask; (2) scores are split by what they depend on: roughness per distinct absolute chord, pitch-space
// harmonicity and periodicity per distinct shape (transposition-invariant), pitch-class harmonicity per distinct
// pitch-class set up to rotation (at most 352); each list is scored once, in parallel worker threads; (3) per-group
// ranks and Pareto layers are computed in memory; (4) rows go to SQLite in one transaction with prepared statements.
//
// Usage (bundle with esbuild, see README.md): node build.mjs --n 3 --max 24 --wmax 48 --out <file.sqlite> [--workers k]
//   [--base 36] [--verify 200]
import { Worker } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, rmSync } from 'node:fs';
import { scoreVoicing, midiToHz } from '../../../../src/lib/consonance/index';

// ---------- arguments ----------
const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const N = Number(arg('n', '3'));
const MAX = Number(arg('max', '24'));
const WMAX = Number(arg('wmax', '48'));
const OUT = arg('out', `catalog-n${N}.sqlite`);
// roots for roughness (MIDI); the first is the main one (chords.rough, ranks, Pareto layers); all go to rough_by_base
const BASES = arg('bases', arg('base', '36')).split(',').map(Number);
const BASE_MIDI = BASES[0];
const WORKERS = Number(arg('workers', String(Math.max(1, availableParallelism() - 1))));
const VERIFY = Number(arg('verify', '200'));
const STEP_CENTS = 100;
if (WMAX > 52) throw new Error('wmax must be <= 52 (note masks must stay below 2^53)');
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

const POW2: number[] = Array.from({ length: 54 }, (_, k) => 2 ** k);
const RULES = ['equal', 'shared'] as const;

// ---------- enumeration ----------
function multisets(n: number, max: number): number[][] {
  const out: number[][] = [];
  const rec = (start: number, acc: number[]) => {
    if (acc.length === n) return void out.push(acc.slice());
    for (let v = start; v <= max; v++) rec(v, [...acc, v]);
  };
  rec(1, []);
  return out;
}
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

// ---------- the two spacing rules (exact centres, then one rounding per interval) ----------
const centresEqual = (order: number[], W: number, out: Float64Array) => {
  const n = order.length;
  let D = Infinity;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) D = Math.min(D, (W - (order[i] + order[j]) / 2) / (j - i));
  let c0 = -Infinity;
  for (let k = 0; k < n; k++) c0 = Math.max(c0, order[k] / 2 - k * D);
  for (let k = 0; k < n; k++) out[k] = c0 + k * D;
};
const centresShared = (order: number[], W: number, out: Float64Array) => {
  const n = order.length;
  const h = Math.max(...order) / 2;
  for (let k = 0; k < n; k++) out[k] = h + (k * (W - 2 * h)) / (n - 1);
};
/**
 * Bottom note of an interval of size d centred at c in a window of W: the nearest step to c − d/2. A tie (exact half
 * step) is broken by `tie`: 0 = toward the middle of the window (the main rule: it keeps reversed orderings exact
 * mirror images; an interval centred exactly on the middle rounds down), 1 = down, 2 = up (the comparison variants).
 */
const TIE_EPS = 1e-9;
let tiesHit = 0;
function lowOf(c: number, d: number, W: number, tie: number) {
  const x = c - d / 2;
  const f = Math.floor(x + TIE_EPS);
  const frac = x - f;
  if (Math.abs(frac - 0.5) > TIE_EPS) return Math.round(x);
  tiesHit++;
  if (tie === 1) return f;
  if (tie === 2) return f + 1;
  return c < W / 2 - TIE_EPS ? f + 1 : f;
}

// ---------- columns (typed arrays, grown in chunks) ----------
class Col<T extends Float64Array | Float32Array | Uint32Array | Uint16Array | Uint8Array> {
  data: T;
  len = 0;
  constructor(private readonly make: (n: number) => T, cap = 1 << 20) {
    this.data = make(cap);
  }
  push(v: number) {
    if (this.len === this.data.length) {
      const next = this.make(this.data.length * 2);
      next.set(this.data as never);
      this.data = next;
    }
    this.data[this.len++] = v;
  }
}
const f64 = () => new Col((n) => new Float64Array(n));
const f32 = () => new Col((n) => new Float32Array(n));
const u32 = () => new Col((n) => new Uint32Array(n));
const u16 = () => new Col((n) => new Uint16Array(n));
const u8 = () => new Col((n) => new Uint8Array(n));
const P = {
  rule: u8(), set: u32(), ord: u16(), window: u8(), chord: u32(),
  merges: u8(), mStack: u8(), mBottom: u8(), mTop: u8(),
  roundMax: f32(), roundMean: f32(), band: f32(), essExtra: u8(), mirrorOk: u8(),
  ties: u8(), chordDown: u32(), chordUp: u32(),
};

// ---------- pass 1: placements ----------
const sets = multisets(N, MAX);
const setOrders: number[][][] = sets.map(orderingsOf);
const chordIndex = new Map<number, number>(); // note mask -> chord id
const chordMask = f64();
log(`n=${N}, sizes 1..${MAX}, windows up to ${WMAX}: ${sets.length} sets, ${setOrders.reduce((s, o) => s + o.length, 0)} orderings`);

const centres = new Float64Array(N);
const lows = new Int32Array(N);
const ends: number[] = [];
const noteCount = new Int32Array(WMAX + 1);
const isLow = new Uint8Array(2 * N);
const notes = new Int32Array(2 * N);
const diffCount = new Int32Array(WMAX + 1);

function place(rule: number, order: number[], W: number, tie = 0) {
  (rule === 0 ? centresEqual : centresShared)(order, W, centres);
  let mask = 0;
  ends.length = 0;
  noteCount.fill(0);
  let rMax = 0, rSum = 0;
  tiesHit = 0;
  for (let k = 0; k < N; k++) {
    const lo = lowOf(centres[k], order[k], W, tie);
    lows[k] = lo;
    const err = Math.abs(lo - (centres[k] - order[k] / 2));
    rMax = Math.max(rMax, err);
    rSum += err;
    ends.push(lo, lo + order[k]);
    isLow[2 * k] = 1;
    isLow[2 * k + 1] = 0;
  }
  for (const e of ends) {
    if (e < 0 || e > W) throw new Error(`note outside window: rule ${rule} order ${order} W ${W}`);
    if (noteCount[e]++ === 0) mask += POW2[e];
  }
  return { mask, rMax, rMean: rSum / N, ties: tiesHit };
}
function chordId(mask: number) {
  let id = chordIndex.get(mask);
  if (id === undefined) {
    id = chordMask.len;
    chordIndex.set(mask, id);
    chordMask.push(mask);
  }
  return id;
}
function mirrorMask(mask: number, W: number) {
  let m = 0;
  for (let k = 0; k <= W; k++) if (Math.floor(mask / POW2[k]) % 2 === 1) m += POW2[W - k];
  return m;
}

for (let s = 0; s < sets.length; s++) {
  const set = sets[s];
  const M = set[N - 1];
  const essCount = new Map<number, number>();
  for (const d of set) essCount.set(d, (essCount.get(d) ?? 0) + 1);
  const orders = setOrders[s];
  const revOrders = orders.map((o) => o.slice().reverse());
  for (let W = M; W <= WMAX; W++) {
    for (let rule = 0; rule < 2; rule++) {
      for (let o = 0; o < orders.length; o++) {
        const order = orders[o];
        const { mask, rMax, rMean, ties } = place(rule, order, W);
        // merges and their kinds (pairs of coinciding ends)
        let mStack = 0, mBottom = 0, mTop = 0;
        for (let a = 0; a < ends.length; a++)
          for (let b = a + 1; b < ends.length; b++)
            if (ends[a] === ends[b]) {
              if (isLow[a] && isLow[b]) mBottom++;
              else if (!isLow[a] && !isLow[b]) mTop++;
              else mStack++;
            }
        // distinct notes and the essential sizes that also occur between other note pairs
        let nn = 0;
        for (let k = 0; k <= W; k++) if (noteCount[k]) notes[nn++] = k;
        diffCount.fill(0);
        for (let a = 0; a < nn; a++) for (let b = a + 1; b < nn; b++) diffCount[notes[b] - notes[a]]++;
        let essExtra = 0;
        for (const [d, c] of essCount) essExtra += Math.max(0, diffCount[d] - c);
        // mirror: the reversed order should give the chord upside down
        const rev = place(rule, revOrders[o], W).mask;
        const mirrorOk = rev === mirrorMask(mask, W) ? 1 : 0;
        // rounding variants: every tie rounded down, every tie rounded up (same chord as the main one when no tie)
        const id = chordId(mask);
        const idDown = ties ? chordId(place(rule, order, W, 1).mask) : id;
        const idUp = ties ? chordId(place(rule, order, W, 2).mask) : id;
        // restore the forward placement's centres for the band (place() overwrote them)
        (rule === 0 ? centresEqual : centresShared)(order, W, centres);
        let cMin = Infinity, cMax = -Infinity;
        for (let k = 0; k < N; k++) { cMin = Math.min(cMin, centres[k]); cMax = Math.max(cMax, centres[k]); }

        P.ties.push(ties); P.chordDown.push(idDown); P.chordUp.push(idUp);
        P.rule.push(rule); P.set.push(s); P.ord.push(o); P.window.push(W); P.chord.push(id);
        P.merges.push(2 * N - nn); P.mStack.push(mStack); P.mBottom.push(mBottom); P.mTop.push(mTop);
        P.roundMax.push(rMax); P.roundMean.push(rMean); P.band.push(cMax - cMin); P.essExtra.push(essExtra); P.mirrorOk.push(mirrorOk);
      }
    }
  }
}
const NP = P.rule.len, NC = chordMask.len;
log(`pass 1: ${NP} placements, ${NC} distinct chords`);

// ---------- chord structure + score keys ----------
const notesOfMask = (mask: number) => {
  const out: number[] = [];
  for (let k = 0; mask > 0; k++, mask = Math.floor(mask / 2)) if (mask % 2 === 1) out.push(k);
  return out;
};
const rotMin = (pc: number) => {
  let best = pc;
  for (let r = 1; r < 12; r++) {
    const rot = ((pc >> r) | (pc << (12 - r))) & 0xfff;
    if (rot < best) best = rot;
  }
  return best;
};
const C = {
  noteCount: new Uint8Array(NC), lowest: new Uint8Array(NC), highest: new Uint8Array(NC), pc: new Uint16Array(NC),
  centroid: new Float32Array(NC), gapMin: new Uint8Array(NC), gapMax: new Uint8Array(NC), gapsOct: new Uint8Array(NC),
  distinctInts: new Uint8Array(NC), shapeId: new Uint32Array(NC), pcId: new Uint32Array(NC),
};
const shapeIndex = new Map<number, number>(), shapeKeys: number[] = [];
const pcIndex = new Map<number, number>(), pcKeys: number[] = [];
for (let c = 0; c < NC; c++) {
  const notes = notesOfMask(chordMask.data[c]);
  const lo = notes[0];
  C.noteCount[c] = notes.length; C.lowest[c] = lo; C.highest[c] = notes[notes.length - 1];
  let pc = 0, sum = 0, gMin = 255, gMax = 0, oct = 0, shape = 0;
  const ints = new Set<number>();
  for (let i = 0; i < notes.length; i++) {
    pc |= 1 << ((notes[i] + BASE_MIDI) % 12);
    sum += notes[i];
    shape += POW2[notes[i] - lo];
    if (i > 0) {
      const g = notes[i] - notes[i - 1];
      gMin = Math.min(gMin, g); gMax = Math.max(gMax, g); if (g >= 12) oct++;
    }
    for (let j = i + 1; j < notes.length; j++) ints.add(notes[j] - notes[i]);
  }
  C.pc[c] = pc; C.centroid[c] = sum / notes.length; C.gapMin[c] = gMin === 255 ? 0 : gMin; C.gapMax[c] = gMax; C.gapsOct[c] = oct;
  C.distinctInts[c] = ints.size;
  let sid = shapeIndex.get(shape);
  if (sid === undefined) { sid = shapeKeys.length; shapeIndex.set(shape, sid); shapeKeys.push(shape); }
  C.shapeId[c] = sid;
  const pk = rotMin(pc);
  let pid = pcIndex.get(pk);
  if (pid === undefined) { pid = pcKeys.length; pcIndex.set(pk, pid); pcKeys.push(pk); }
  C.pcId[c] = pid;
}
log(`scoring keys: ${NC} chords (roughness), ${shapeKeys.length} shapes (harmonicity + periodicity), ${pcKeys.length} pitch-class classes`);

// ---------- pass 2: parallel scoring ----------
async function scoreAll(kind: 'rough' | 'shape' | 'pc', keys: ArrayLike<number>, width: number, baseMidi = BASE_MIDI): Promise<Float64Array> {
  const out = new Float64Array(keys.length * width);
  const chunk = 2000;
  const jobs: { id: number; start: number; keys: Float64Array }[] = [];
  for (let s = 0; s < keys.length; s += chunk) jobs.push({ id: jobs.length, start: s, keys: Float64Array.from(Array.prototype.slice.call(keys, s, s + chunk)) });
  const workers = Array.from({ length: Math.min(WORKERS, jobs.length || 1) }, () =>
    new Worker(new URL('./worker.mjs', import.meta.url), { workerData: { stepCents: STEP_CENTS } }));
  let next = 0, done = 0;
  await new Promise<void>((resolve, reject) => {
    if (jobs.length === 0) return resolve();
    const feed = (w: Worker) => {
      if (next >= jobs.length) return;
      const j = jobs[next++];
      w.postMessage({ id: j.id, kind, keys: j.keys, baseMidi });
    };
    for (const w of workers) {
      w.on('message', (m: { id: number; out: Float64Array }) => {
        out.set(m.out, jobs[m.id].start * width);
        if (++done === jobs.length) resolve();
        else feed(w);
        if (done % 50 === 0) log(`  ${kind}: ${done}/${jobs.length} chunks`);
      });
      w.on('error', reject);
      feed(w);
    }
  });
  await Promise.all(workers.map((w) => w.terminate()));
  return out;
}
const roughByBase: Float64Array[] = [];
for (const b of BASES) {
  roughByBase.push(await scoreAll('rough', chordMask.data.subarray(0, NC), 1, b));
  log(`roughness done (base MIDI ${b})`);
}
const rough = roughByBase[0];
const shapeScores = await scoreAll('shape', shapeKeys, 2);
log('shapes done');
const pcScores = await scoreAll('pc', pcKeys, 1);
log('pitch classes done');

// ---------- verification: cached scores equal scoreVoicing on a sample ----------
let maxDiff = 0;
for (let i = 0; i < Math.min(VERIFY, NC); i++) {
  const c = Math.floor((i * NC) / Math.min(VERIFY, NC));
  const notes = notesOfMask(chordMask.data[c]);
  const s = scoreVoicing({ refHz: midiToHz(BASE_MIDI), cents: notes.map((x) => x * STEP_CENTS) }, { decompose: false });
  maxDiff = Math.max(maxDiff,
    Math.abs(s.interference.hutchinsonKnopoff.total - rough[c]),
    Math.abs(s.harmonicity.pitch.value - shapeScores[2 * C.shapeId[c]]),
    Math.abs(s.periodicity.value - shapeScores[2 * C.shapeId[c] + 1]),
    Math.abs(s.harmonicity.pitchClass.value - pcScores[C.pcId[c]]));
  for (let b = 1; b < BASES.length; b++) {
    const sb = scoreVoicing({ refHz: midiToHz(BASES[b]), cents: notes.map((x) => x * STEP_CENTS) }, { decompose: false });
    maxDiff = Math.max(maxDiff, Math.abs(sb.interference.hutchinsonKnopoff.total - roughByBase[b][c]));
  }
}
log(`verify: largest difference vs scoreVoicing over ${Math.min(VERIFY, NC)} chords = ${maxDiff.toExponential(2)}`);
if (maxDiff > 1e-6) throw new Error('cached scores differ from scoreVoicing');

// ---------- pass 3: per-group ranks and Pareto layers (group = rule, set, window) ----------
const rankRough = new Uint8Array(NP), rankHarm = new Uint8Array(NP), layer = new Uint8Array(NP);
{
  let g = 0;
  while (g < NP) {
    let e = g;
    while (e < NP && P.rule.data[e] === P.rule.data[g] && P.set.data[e] === P.set.data[g] && P.window.data[e] === P.window.data[g]) e++;
    const idx = Array.from({ length: e - g }, (_, i) => g + i);
    const r = (i: number) => rough[P.chord.data[i]];
    const h = (i: number) => shapeScores[2 * C.shapeId[P.chord.data[i]]];
    // dense ranks (equal chords share a rank)
    const rankBy = (val: (i: number) => number, dir: 1 | -1, out: Uint8Array) => {
      const vals = [...new Set(idx.map(val))].sort((a, b) => dir * (a - b));
      for (const i of idx) out[i] = vals.indexOf(val(i)) + 1;
    };
    rankBy(r, 1, rankRough);
    rankBy(h, -1, rankHarm);
    // Pareto layers on (roughness min, pitch harmonicity max)
    let left = idx.slice(), L = 1;
    while (left.length) {
      const front = left.filter((a) => !left.some((b) => (r(b) <= r(a) && h(b) >= h(a)) && (r(b) < r(a) || h(b) > h(a))));
      for (const a of front) layer[a] = L;
      left = left.filter((a) => !front.includes(a));
      L++;
    }
    g = e;
  }
}
log('ranks and Pareto layers done');

// ---------- write SQLite ----------
if (existsSync(OUT)) rmSync(OUT);
const db = new DatabaseSync(OUT);
db.exec(`PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF; PRAGMA page_size = 8192;
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE sets (set_id INTEGER PRIMARY KEY, n INTEGER, intervals TEXT, largest INTEGER);
CREATE TABLE orderings (set_id INTEGER, ord INTEGER, ordering TEXT, PRIMARY KEY (set_id, ord)) WITHOUT ROWID;
CREATE TABLE chords (chord_id INTEGER PRIMARY KEY, mask INTEGER, notes TEXT, note_count INTEGER, lowest INTEGER,
  highest INTEGER, span INTEGER, pc_mask INTEGER, pc_count INTEGER, centroid REAL, gap_min INTEGER, gap_max INTEGER,
  gaps_octave INTEGER, distinct_intervals INTEGER, rough REAL, harm_pitch REAL, harm_pc REAL, periodicity REAL);
CREATE TABLE placements (rule TEXT, set_id INTEGER, ord INTEGER, window INTEGER, chord_id INTEGER, merges INTEGER,
  merge_stack INTEGER, merge_bottom INTEGER, merge_top INTEGER, round_max REAL, round_mean REAL, band REAL,
  essential_extra INTEGER, mirror_ok INTEGER, rank_rough INTEGER, rank_harm INTEGER, pareto_layer INTEGER,
  ties INTEGER, chord_down INTEGER, chord_up INTEGER);
CREATE TABLE rough_by_base (chord_id INTEGER, base_midi INTEGER, rough REAL, PRIMARY KEY (chord_id, base_midi)) WITHOUT ROWID;`);
const ins = (sql: string) => db.prepare(sql);
db.exec('BEGIN');
const meta = ins('INSERT INTO meta VALUES (?, ?)');
for (const [k, v] of Object.entries({ n: N, max_interval: MAX, window_max: WMAX, base_midi: BASE_MIDI, step_cents: STEP_CENTS,
  rules: 'equal = equal centers (chord fills the window); shared = shared center range [M/2, W-M/2], centers equally spaced',
  rounding: "each interval's bottom note = nearest step to (center - size/2); a tie (exact half step) rounds toward the middle of the window (an interval centred exactly on the middle rounds down); chord_down / chord_up = the same placement with every tie rounded down / up",
  bases_midi: BASES.join(','),
  scores: 'rough = Hutchinson-Knopoff interference total (lower smoother); harm_pitch = pitch-space harmonicity (higher more fused); harm_pc = pitch-class harmonicity; periodicity = Stolzenburg smoothed log periodicity (lower simpler)',
  built: new Date().toISOString() })) meta.run(k, String(v));
const sIns = ins('INSERT INTO sets VALUES (?, ?, ?, ?)');
const oIns = ins('INSERT INTO orderings VALUES (?, ?, ?)');
sets.forEach((set, s) => {
  sIns.run(s, N, set.join(' '), set[N - 1]);
  setOrders[s].forEach((o, i) => oIns.run(s, i, o.join(' ')));
});
const cIns = ins('INSERT INTO chords VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
for (let c = 0; c < NC; c++) {
  const mask = chordMask.data[c];
  let pcCount = 0;
  for (let p = 0; p < 12; p++) if (C.pc[c] & (1 << p)) pcCount++;
  cIns.run(c, mask, notesOfMask(mask).join(' '), C.noteCount[c], C.lowest[c], C.highest[c], C.highest[c] - C.lowest[c],
    C.pc[c], pcCount, C.centroid[c], C.gapMin[c], C.gapMax[c], C.gapsOct[c], C.distinctInts[c],
    rough[c], shapeScores[2 * C.shapeId[c]], pcScores[C.pcId[c]], shapeScores[2 * C.shapeId[c] + 1]);
}
const rbIns = ins('INSERT INTO rough_by_base VALUES (?, ?, ?)');
for (let b = 0; b < BASES.length; b++) for (let c = 0; c < NC; c++) rbIns.run(c, BASES[b], roughByBase[b][c]);
const pIns = ins('INSERT INTO placements VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
for (let i = 0; i < NP; i++) {
  pIns.run(RULES[P.rule.data[i]], P.set.data[i], P.ord.data[i], P.window.data[i], P.chord.data[i], P.merges.data[i],
    P.mStack.data[i], P.mBottom.data[i], P.mTop.data[i], P.roundMax.data[i], P.roundMean.data[i], P.band.data[i],
    P.essExtra.data[i], P.mirrorOk.data[i], rankRough[i], rankHarm[i], layer[i],
    P.ties.data[i], P.chordDown.data[i], P.chordUp.data[i]);
  if (i % 2_000_000 === 0 && i) log(`  wrote ${i}/${NP} placements`);
}
db.exec('COMMIT');
log('rows written; building indexes and summaries');
db.exec(`
CREATE INDEX placements_lookup ON placements (set_id, window, rule);
CREATE INDEX placements_chord ON placements (chord_id);
CREATE INDEX chords_mask ON chords (mask);
CREATE VIEW placement_view AS
  SELECT p.rule, s.intervals AS "set", o.ordering, p.window, c.notes, c.note_count, p.merges, p.merge_stack, p.merge_bottom,
    p.merge_top, c.span, c.pc_mask, c.gap_min, c.gap_max, c.gaps_octave, c.distinct_intervals, p.round_max, p.round_mean,
    p.band, p.essential_extra, p.mirror_ok, c.rough, c.harm_pitch, c.harm_pc, c.periodicity, p.rank_rough, p.rank_harm,
    p.pareto_layer, p.ties, (p.chord_down = p.chord_id AND p.chord_up = p.chord_id) AS grid_robust, p.chord_down, p.chord_up,
    p.set_id, p.ord, p.chord_id
  FROM placements p JOIN sets s USING (set_id) JOIN orderings o USING (set_id, ord) JOIN chords c USING (chord_id);
CREATE TABLE summary_rounding AS
  SELECT rule, window, COUNT(*) AS placements, AVG(ties > 0) AS share_with_tie,
    AVG(chord_down = chord_id AND chord_up = chord_id) AS share_grid_robust, AVG(mirror_ok) AS share_mirror_ok
  FROM placements GROUP BY rule, window;
CREATE TABLE summary_merges AS
  SELECT rule, window, COUNT(*) AS placements, AVG(merges) AS avg_merges, AVG(merges > 0) AS share_with_merge,
    SUM(merge_stack) AS stack_pairs, SUM(merge_bottom) AS bottom_pairs, SUM(merge_top) AS top_pairs,
    AVG(round_max) AS avg_round_max
  FROM placements GROUP BY rule, window;
CREATE TABLE summary_winners AS
  SELECT p.rule, p.set_id, p.window, GROUP_CONCAT(o.ordering, ' / ') AS best_rough_orderings
  FROM placements p JOIN orderings o USING (set_id, ord) WHERE p.rank_rough = 1 GROUP BY p.rule, p.set_id, p.window;
ANALYZE;`);
db.close();
log(`done: ${OUT}`);
