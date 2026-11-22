// Aggregates for the findings page from the v2 catalogs, plus provenance, field descriptions and the chord index
// summary, so the JSON also stands on its own as a reference (human, 2026-11-21).
// Usage: node extract-findings2.mjs <out.json> [--index chord-index.sqlite] [--zpairs zpairs.json] <catalog-n2.sqlite> ...
// A cardinality may come in several files (the main run and the 18-19 addendum, which holds only the sets whose
// largest interval is 18 or 19). Their sets are disjoint, so counts add, averages are weighted by their group sizes,
// per-set tables are joined, distinct chords are counted across the files, and compound mixes pair across files.
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const indexFile = opt('--index'), zpairsFile = opt('--zpairs');
const [out, ...files] = args;
const base = (f) => f.split(/[\\/]/).pop();
const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');
const r3 = (x) => (x === null || x === undefined ? null : +x.toFixed(3));
const t0 = Date.now();
const lap = (what) => console.log(`${what} ${((Date.now() - t0) / 1000).toFixed(0)} s`);

// ---- open every catalog, group by cardinality (main run first, then addenda by their lower bound) ----
const byN = new Map();
for (const f of files) {
  const db = new DatabaseSync(f, { readOnly: true });
  const meta = Object.fromEntries(db.prepare('SELECT key, value FROM meta').all().map((r) => [r.key, r.value]));
  const n = Number(meta.n);
  (byN.get(n) || byN.set(n, []).get(n)).push({ file: f, db, meta });
}
for (const g of byN.values()) g.sort((a, b) => Number(a.meta.min_largest || 0) - Number(b.meta.min_largest || 0));

// Rows from several files with the same key: weighted averages and sums.
const cmp = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b)));
function combine(lists, keys, weight, avgs, sums = []) {
  const m = new Map();
  for (const rows of lists)
    for (const row of rows) {
      const k = keys.map((c) => row[c]).join('|');
      let g = m.get(k);
      if (!g) m.set(k, (g = { row: Object.fromEntries(keys.map((c) => [c, row[c]])), w: 0, a: {}, aw: {}, s: {} }));
      const w = row[weight] ?? 0;
      g.w += w;
      for (const c of avgs)
        if (row[c] !== null && row[c] !== undefined) {
          g.a[c] = (g.a[c] || 0) + row[c] * w;
          g.aw[c] = (g.aw[c] || 0) + w;
        }
      for (const c of sums) g.s[c] = (g.s[c] || 0) + (row[c] ?? 0);
    }
  return [...m.values()]
    .sort((x, y) => { for (const c of keys) { const d = cmp(x.row[c], y.row[c]); if (d) return d; } return 0; })
    .map((g) => ({ ...g.row, [weight]: g.w, ...Object.fromEntries(avgs.map((c) => [c, g.aw[c] ? g.a[c] / g.aw[c] : null])), ...g.s }));
}

// Everything that can be computed inside one file.
function part(src, n) {
  const q = (sql, ...p) => src.db.prepare(sql).all(...p);
  const name = `n=${n} ${base(src.file)}`;
  const r = {};
  r.byWindow = q(`SELECT m.rule, m.window, m.placements, m.share_with_merge, m.avg_merges, r.share_with_tie,
      r.share_grid_robust, r.share_mirror_ok FROM summary_merges m JOIN summary_rounding r USING (rule, window)`);
  r.mergeKinds = q(`SELECT rule, SUM(stack_pairs) stack, SUM(bottom_pairs) bottom, SUM(top_pairs) top FROM summary_merges GROUP BY rule`);
  r.noteCounts = q(`SELECT rule, note_count AS notes, COUNT(*) placements FROM placements GROUP BY rule, note_count`);
  lap(`${name}: counts`);
  r.scores = q(`WITH g AS (SELECT rule, set_id, window, AVG(rough) avg_r, MIN(rough) best_r, AVG(harm_pitch) avg_h, MAX(harm_pitch) best_h,
        SUM(pareto_layer = 1) front FROM placements GROUP BY rule, set_id, window)
      SELECT rule, window, COUNT(*) groups, AVG(avg_r) mean_rough, AVG(best_r) mean_best_rough, AVG(avg_h) mean_harm, AVG(best_h) mean_best_harm,
        AVG(front = 1) one_winner, AVG(front) mean_front FROM g GROUP BY rule, window`);
  lap(`${name}: scores`);
  r.agreement = q(`SELECT a.window, COUNT(*) pairs, AVG(a.best_rough_orderings = b.best_rough_orderings) same FROM summary_winners a
      JOIN summary_winners b ON a.set_id = b.set_id AND a.window = b.window AND a.rule = 'equal' AND b.rule = 'shared'
      GROUP BY a.window`);
  // does the smoothest ordering change: root C3 instead of C2; every tie rounded down; every tie rounded up
  r.winnerChange = q(`WITH x AS (SELECT rule, window, rank_rough,
        ROW_NUMBER() OVER (PARTITION BY rule, set_id, window ORDER BY rough_c3, ord) k3,
        ROW_NUMBER() OVER (PARTITION BY rule, set_id, window ORDER BY down_rough, ord) kd,
        ROW_NUMBER() OVER (PARTITION BY rule, set_id, window ORDER BY up_rough, ord) ku FROM placements)
      SELECT rule, window, SUM(k3 = 1) groups, AVG(CASE WHEN k3 = 1 THEN rank_rough <> 1 END) root,
        AVG(CASE WHEN kd = 1 THEN rank_rough <> 1 END) down, AVG(CASE WHEN ku = 1 THEN rank_rough <> 1 END) up
      FROM x GROUP BY rule, window`);
  lap(`${name}: winner changes`);
  r.heat = q(`WITH g AS (SELECT p.rule, s.largest, p.window, MIN(p.rough) best FROM placements p JOIN sets s USING (set_id)
        GROUP BY p.rule, p.set_id, p.window)
      SELECT rule, largest, window, COUNT(*) groups, AVG(best) best FROM g GROUP BY rule, largest, window`);
  // per set, per rule: the smoothest ordering and its roughness at every window (largest .. wmax), for the heatmap's
  // zoom (the page rebuilds the chord from rule, ordering and window). Ties: the lowest ordering index.
  {
    const setsAll = q('SELECT set_id, intervals, largest FROM sets ORDER BY set_id');
    const at = new Map(setsAll.map((s, i) => [s.set_id, i]));
    const ords = setsAll.map(() => []);
    for (const o of q('SELECT set_id, ord, ordering FROM orderings ORDER BY set_id, ord')) ords[at.get(o.set_id)].push(o.ordering);
    const best = { sets: setsAll.map((s) => s.intervals), ords, w0: setsAll.map((s) => Math.max(s.largest, 1)) };
    for (const rule of ['equal', 'shared']) {
      const rough = setsAll.map(() => []), ord = setsAll.map(() => []);
      for (const x of src.db.prepare('SELECT set_id, window, MIN(ord) ord, rough FROM placements WHERE rule = ? AND rank_rough = 1 GROUP BY set_id, window').iterate(rule)) {
        const i = at.get(x.set_id), j = x.window - best.w0[i];
        rough[i][j] = Math.round(x.rough * 1000);
        ord[i][j] = x.ord;
      }
      best[rule] = rough;
      best[rule + 'Ord'] = ord;
    }
    r.best = best;
  }
  r.totals = q('SELECT (SELECT COUNT(*) FROM placements) placements, (SELECT COUNT(*) FROM sets) sets, (SELECT COUNT(DISTINCT notes) FROM placements) chords')[0];
  lap(`${name}: best per set and totals`);
  return r;
}

const result = {
  provenance: {
    built: new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }) + ' Eastern',
    script: { file: 'shell/arcs/interval-placement/m2c/catalog/extract-findings2.mjs', sha256: sha(fileURLToPath(import.meta.url)) },
    node: process.version,
    sources: [],
  },
  fields: null, // filled at the end
  n: [],
  compound: {},
};

for (const n of [...byN.keys()].sort((a, b) => a - b)) {
  const group = byN.get(n);
  const parts = group.map((src) => part(src, n));
  const r = {
    meta: {
      max: Math.max(...group.map((s) => Number(s.meta.max_interval))),
      wmax: Math.max(...group.map((s) => Number(s.meta.window_max))),
      files: group.map((s) => base(s.file)),
    },
  };
  r.byWindow = combine(parts.map((p) => p.byWindow), ['rule', 'window'], 'placements', ['share_with_merge', 'avg_merges', 'share_with_tie', 'share_grid_robust', 'share_mirror_ok']);
  r.mergeKinds = combine(parts.map((p) => p.mergeKinds), ['rule'], 'none', [], ['stack', 'bottom', 'top']).map(({ none, ...x }) => x);
  r.noteCounts = combine(parts.map((p) => p.noteCounts), ['rule', 'notes'], 'placements', []);
  r.scores = combine(parts.map((p) => p.scores), ['rule', 'window'], 'groups', ['mean_rough', 'mean_best_rough', 'mean_harm', 'mean_best_harm', 'one_winner', 'mean_front']);
  r.agreement = combine(parts.map((p) => p.agreement), ['window'], 'pairs', ['same']);
  r.winnerChange = combine(parts.map((p) => p.winnerChange), ['rule', 'window'], 'groups', ['root', 'down', 'up']);
  r.heat = combine(parts.map((p) => p.heat), ['rule', 'largest', 'window'], 'groups', ['best']);
  r.best = {};
  for (const k of ['sets', 'ords', 'w0', 'equal', 'shared', 'equalOrd', 'sharedOrd']) r.best[k] = parts.flatMap((p) => p.best[k]);

  // distinct chords across the files: each later file adds only the chords no earlier file has (notes index lookups)
  let chords = parts[0].totals.chords;
  group.forEach((src, i) => {
    if (i === 0) return;
    group.slice(0, i).forEach((e, j) => src.db.exec(`ATTACH '${e.file.replace(/'/g, "''")}' AS e${j}`));
    const notIn = group.slice(0, i).map((_, j) => `NOT EXISTS (SELECT 1 FROM e${j}.placements p WHERE p.notes = x.notes)`).join(' AND ');
    chords += src.db.prepare(`SELECT COUNT(*) c FROM (SELECT DISTINCT notes FROM main.placements) x WHERE ${notIn}`).get().c;
    group.slice(0, i).forEach((_, j) => src.db.exec(`DETACH e${j}`));
  });
  r.totals = { placements: parts.reduce((s, p) => s + p.totals.placements, 0), chords, sets: parts.reduce((s, p) => s + p.totals.sets, 0) };
  lap(`n=${n}: combined (${r.totals.chords.toLocaleString()} distinct chords)`);
  group.forEach((src, i) => result.provenance.sources.push({
    file: base(src.file), n, placements: parts[i].totals.placements, sets: parts[i].totals.sets, distinct_chords: parts[i].totals.chords, meta: src.meta,
  }));

  // ---- simple sets against their compound mixes (human, 2026-11-21) ----
  // A simple set is one whose intervals can all go up an octave and stay in range (largest <= max - 12). A mix raises
  // some of its intervals by 12 (k of n compound; for 2 4 5: 14 4 5, 2 16 5, ... 14 16 17). Each mixed placement is
  // paired with the simple placement of the same ordering (compound values reduced by 12), in the same window W and in
  // W + 12. Measures: same pitch-class set as the simple chord; "exact": the simple chord with the compounded
  // intervals' top notes raised 12 and everything else unmoved; roughness, harmonicity; same smoothest ordering.
  // The mixes may sit in another file than the simple set (largest 18-19 in the addendum).
  const sets = group.flatMap((src) => src.db.prepare('SELECT set_id, intervals, largest FROM sets').all().map((s) => ({ src, ...s })));
  const byIv = new Map(sets.map((s) => [s.intervals, s]));
  const stmts = new Map(group.map((src) => [src, {
    ordsOf: src.db.prepare('SELECT ord, ordering FROM orderings WHERE set_id = ?'),
    rowsOf: src.db.prepare('SELECT rule, ord, window, notes, rough, harm_pitch, rank_rough FROM placements WHERE set_id = ?'),
  }]));
  const pcs = (notes) => [...new Set(notes.split(' ').map((x) => Number(x) % 12))].sort((a, b) => a - b).join(' ');
  const SIMPLE_MAX = r.meta.max - 12;
  const agg = new Map(); // k|rule|offset|W -> sums
  const explorer = [];
  for (const s of sets) {
    if (s.largest > SIMPLE_MAX) continue;
    const iv = s.intervals.split(' ').map(Number);
    const st = stmts.get(s.src);
    const sOrd = new Map(st.ordsOf.all(s.set_id).map((o) => [o.ord, o.ordering]));
    const simple = new Map(); // rule|ordering|window -> row
    for (const a of st.rowsOf.all(s.set_id)) simple.set(`${a.rule}|${sOrd.get(a.ord)}|${a.window}`, a);
    const variants = new Map(); // sorted intervals -> k
    for (let mask = 0; mask < 1 << n; mask++) {
      const v = iv.map((x, i) => ((mask >> i) & 1 ? x + 12 : x)).sort((a, b) => a - b).join(' ');
      variants.set(v, iv.reduce((c, _, i) => c + ((mask >> i) & 1), 0));
    }
    const exp = n <= 3 ? { set: s.intervals, variants: [] } : null;
    for (const [v, k] of variants) {
      const vs = byIv.get(v);
      if (vs === undefined) continue;
      const vst = stmts.get(vs.src);
      const vOrd = new Map(vst.ordsOf.all(vs.set_id).map((o) => [o.ord, o.ordering]));
      const vRows = vst.rowsOf.all(vs.set_id);
      const ex = exp ? { set: v, k, rows: [] } : null;
      const winners = new Map(); // rule|offset|W -> {s:Set, v:Set}
      for (const b of vRows) {
        const vOrdering = vOrd.get(b.ord).split(' ').map(Number);
        const reduced = vOrdering.map((x) => (x > SIMPLE_MAX ? x - 12 : x)).join(' ');
        if (ex && b.window <= 36) ex.rows.push([b.rule === 'equal' ? 0 : 1, vOrd.get(b.ord), b.window, b.notes, +b.rough.toFixed(3), +b.harm_pitch.toFixed(3)]);
        if (k === 0) continue;
        for (const off of [0, 12]) {
          const a = simple.get(`${b.rule}|${reduced}|${b.window - off}`);
          if (!a) continue;
          // exact: simple chord with the compounded intervals' tops +12 (try every bottom assignment of the simple chord)
          const sn = a.notes.split(' ').map(Number), sset = new Set(sn);
          const red = reduced.split(' ').map(Number);
          let exact = false;
          const rec = (i, bs) => {
            if (exact) return;
            if (i === red.length) {
              const u = new Set(), w = new Set();
              bs.forEach((x, j) => { u.add(x); u.add(x + red[j]); w.add(x); w.add(x + vOrdering[j]); });
              if (u.size === sset.size && [...w].sort((p, q2) => p - q2).join(' ') === b.notes) exact = true;
              return;
            }
            for (const x of sn) if (sset.has(x + red[i])) rec(i + 1, [...bs, x]);
          };
          rec(0, []);
          const key = `${k}|${b.rule}|${off}|${a.window}`;
          const g = agg.get(key) || { k, rule: b.rule, offset: off, window: a.window, pairs: 0, pc: 0, exact: 0, rs: 0, rv: 0, hs: 0, hv: 0 };
          g.pairs++; g.pc += pcs(a.notes) === pcs(b.notes); g.exact += exact; g.rs += a.rough; g.rv += b.rough; g.hs += a.harm_pitch; g.hv += b.harm_pitch;
          agg.set(key, g);
          const wk = `${b.rule}|${off}|${a.window}`;
          const wn = winners.get(wk) || { s: new Set(), v: new Set() };
          if (a.rank_rough === 1) wn.s.add(reduced);
          if (b.rank_rough === 1) wn.v.add(reduced);
          winners.set(wk, wn);
        }
      }
      for (const [wk, wn] of winners) {
        const [rule, off, w] = wk.split('|');
        const g = agg.get(`${k}|${rule}|${off}|${w}`);
        g.groups = (g.groups || 0) + 1;
        g.same = (g.same || 0) + ([...wn.s].sort().join('/') === [...wn.v].sort().join('/'));
      }
      if (ex) exp.variants.push(ex);
    }
    if (exp) explorer.push(exp);
  }
  result.compound[n] = {
    simple_max: SIMPLE_MAX,
    rows: [...agg.values()].sort((x, y) => x.k - y.k || (x.rule < y.rule ? -1 : x.rule > y.rule ? 1 : 0) || x.offset - y.offset || x.window - y.window)
      .map((g) => ({ k: g.k, rule: g.rule, offset: g.offset, window: g.window, pairs: g.pairs, pc_same: g.pc / g.pairs, exact: g.exact / g.pairs,
        rough_s: g.rs / g.pairs, rough_v: g.rv / g.pairs, harm_s: g.hs / g.pairs, harm_v: g.hv / g.pairs, same_winner: g.same / g.groups })),
    explorer,
  };
  lap(`n=${n}: simple vs compound`);
  result.n.push(n);
  result[n] = r;
  for (const src of group) src.db.close();
}

// ---- chord index: different input sets, same chord (build-chord-index.mjs) ----
if (indexFile) {
  const ix = new DatabaseSync(indexFile, { readOnly: true });
  const q = (sql, ...p) => ix.prepare(sql).all(...p);
  const TOP = 50;
  result.provenance.index = { file: base(indexFile), bytes: statSync(indexFile).size, meta: Object.fromEntries(q('SELECT key, value FROM meta').map((r) => [r.key, r.value])) };
  const ci = {};
  ci.summary = q("SELECT scope, key, chords, multi, max_sets FROM summary ORDER BY scope, CAST(key AS INTEGER)");
  ci.setsPerChord = q('SELECT note_count notes, sets, COUNT(*) chords FROM chords GROUP BY note_count, sets ORDER BY notes, sets');
  ci.setsPerShape = q('SELECT note_count notes, sets, COUNT(*) shapes FROM shapes GROUP BY note_count, sets ORDER BY notes, sets');
  ci.cards = q('SELECT cards, COUNT(*) chords FROM chords GROUP BY cards ORDER BY chords DESC');
  ci.shapeCards = q('SELECT cards, COUNT(*) shapes FROM shapes GROUP BY cards ORDER BY shapes DESC');
  lap('chord index: summary and histograms');
  const prodOf = ix.prepare('SELECT n, intervals, rule, ordering, window FROM producers WHERE chord_id = ? ORDER BY n, intervals, rule, window, ordering');
  ci.topChords = q(`SELECT chord_id, notes, shape, note_count, rough, harm_pitch, sets, cards, producers FROM (SELECT *,
      ROW_NUMBER() OVER (PARTITION BY note_count ORDER BY sets DESC, producers DESC, notes) rk FROM chords) WHERE rk <= ${TOP} ORDER BY note_count, rk`)
    .map((c) => {
      const g = new Map();
      for (const p of prodOf.iterate(c.chord_id)) {
        const k = `${p.n}|${p.intervals}`;
        let e = g.get(k);
        if (!e) g.set(k, (e = { n: p.n, set: p.intervals, placements: 0, rules: [], windows: [], example: [p.rule, p.ordering, p.window] }));
        e.placements++;
        if (!e.rules.includes(p.rule)) e.rules.push(p.rule);
        if (!e.windows.includes(p.window)) e.windows.push(p.window);
      }
      return { notes: c.notes, shape: c.shape, note_count: c.note_count, rough: r3(c.rough), harm_pitch: r3(c.harm_pitch), sets: c.sets, cards: c.cards,
        placements: c.producers, producers: [...g.values()] };
    });
  lap('chord index: top chords');
  ci.topShapes = q(`SELECT shape, note_count, sets, cards, chords FROM (SELECT *,
      ROW_NUMBER() OVER (PARTITION BY note_count ORDER BY sets DESC, chords DESC, shape) rk FROM shapes) WHERE rk <= ${TOP} ORDER BY note_count, rk`);
  lap('chord index: top shapes');
  result.chordIndex = ci;
  ix.close();
}
if (zpairsFile) result.provenance.zpairs = { file: base(zpairsFile), bytes: statSync(zpairsFile).size, sha256: sha(zpairsFile), from: 'extract-zpairs2.mjs' };

result.fields = {
  _: 'Steps are semitones. Chord notes are steps above the window bottom (C2 = MIDI 36 unless a source meta says otherwise). n = number of intervals in an input set. rule: equal = equal centers (the chord fills the window); shared = shared center range [M/2, W - M/2], centers equally spaced. Each source file meta (provenance.sources[].meta) keeps the run parameters and score definitions verbatim.',
  provenance: 'built (Eastern time), script hash, node version; sources: every catalog read with its own placements, sets, distinct chords and full meta table; index: the chord index file and its meta; zpairs: the Z-pair JSON this page pairs with.',
  n: 'cardinalities present; each has an entry result[n].',
  'result[n].meta': 'max = largest interval over all files of this n; wmax = largest window; files = catalogs combined (main run first).',
  'result[n].byWindow': 'per rule and window: placements; share_with_merge = share with at least one interval end on an existing note; avg_merges; share_with_tie = share with a bottom note exactly half a step off the grid; share_grid_robust = no tie or both tie roundings give the same chord; share_mirror_ok = mirroring the ordering mirrors the chord. Averages weighted by placements across files.',
  'result[n].mergeKinds': 'per rule: coinciding interval-end pairs that are top-on-bottom (stack), two bottoms (bottom), two tops (top).',
  'result[n].noteCounts': 'per rule: placements by number of distinct notes.',
  'result[n].scores': 'per rule and window, over (set, window) groups (groups = count): mean of the average and of the best roughness (Hutchinson-Knopoff from C2, lower smoother) and pitch harmonicity (higher more fused); one_winner = share of groups with a single Pareto-front placement; mean_front = average Pareto-front size.',
  'result[n].agreement': 'per window: pairs = (set, window) pairs; same = share where both rules pick the same smoothest orderings.',
  'result[n].winnerChange': 'per rule and window: share of (set, window) groups whose smoothest ordering changes when the root moves to C3 (root), every tie rounds down (down), or up (up).',
  'result[n].heat': 'per rule, largest interval and window: average over sets of the best roughness; groups = sets averaged.',
  'result[n].best': 'per set (index i; sets[i] = intervals, ords[i] = orderings by index, w0[i] = first window): equal[i][w - w0[i]] / shared[...] = best roughness x 1000 (integer) at window w; equalOrd / sharedOrd = index into ords[i] of that smoothest ordering (ties: lowest index). Rebuild the chord from rule, ordering and window.',
  'result[n].totals': 'placements, sets, distinct chords (exact notes) across all files of this n.',
  compound: 'per n: simple_max = largest interval of a simple set (max - 12); rows per k (compounded intervals), rule, offset (0 = same window, 12 = window + 12), window: pairs, pc_same (same pitch-class set), exact (simple chord with the compounded tops raised 12), rough_s / rough_v and harm_s / harm_v (simple / mix means), same_winner; explorer (n <= 3): each simple set with its variants and rows [rule 0 equal / 1 shared, ordering, window <= 36, notes, rough, harm_pitch].',
  'chordIndex.summary': 'scope all / shape / window (key = window): chords = distinct chords (exact notes; shape = transpositions as one), multi = how many are made by two or more different input sets, max_sets = most sets making one chord. Over all cardinalities together.',
  'chordIndex.setsPerChord': 'histogram over chords made by 2+ sets: notes, sets (how many different input sets make it), chords. setsPerShape: the same for shapes.',
  'chordIndex.cards': 'chords made by 2+ sets, by which cardinalities make them (e.g. "3 4"). shapeCards: the same for shapes.',
  'chordIndex.topChords': 'per note count, the 50 chords made by the most different input sets (ties: most placements, then notes): notes, shape, rough, harm_pitch, sets, cards, placements, producers = one entry per input set: n, set, placements, rules, windows, example [rule, ordering, window].',
  'chordIndex.topShapes': 'per note count, the 50 shapes made by the most different input sets: shape, sets, cards, chords (distinct transpositions made).',
};

writeFileSync(out, JSON.stringify(result));
lap(`wrote ${out}`);
