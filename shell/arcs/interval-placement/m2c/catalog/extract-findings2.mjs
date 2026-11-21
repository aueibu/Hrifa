// Aggregates for the findings page from the v2 catalogs (one file per cardinality).
// Usage: node extract-findings2.mjs <out.json> <catalog-n2.sqlite> <catalog-n3.sqlite> ...
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';

const [out, ...files] = process.argv.slice(2);

const result = { n: [], compound: {} };
for (const file of files) {
  const db = new DatabaseSync(file, { readOnly: true });
  const q = (sql) => db.prepare(sql).all();
  const meta = Object.fromEntries(q('SELECT key, value FROM meta').map((r) => [r.key, r.value]));
  const n = Number(meta.n);
  const t = Date.now();
  const lap = (what) => console.log(`n=${n}: ${what} ${((Date.now() - t) / 1000).toFixed(0)} s`);
  const r = { meta: { max: Number(meta.max_interval), wmax: Number(meta.window_max) } };
  r.byWindow = q(`SELECT m.rule, m.window, m.placements, m.share_with_merge, m.avg_merges, r.share_with_tie,
      r.share_grid_robust, r.share_mirror_ok FROM summary_merges m JOIN summary_rounding r USING (rule, window) ORDER BY m.rule, m.window`);
  r.mergeKinds = q(`SELECT rule, SUM(stack_pairs) stack, SUM(bottom_pairs) bottom, SUM(top_pairs) top FROM summary_merges GROUP BY rule`);
  r.noteCounts = q(`SELECT rule, note_count AS notes, COUNT(*) placements FROM placements GROUP BY rule, note_count ORDER BY rule, notes`);
  lap('counts');
  r.scores = q(`WITH g AS (SELECT rule, set_id, window, AVG(rough) avg_r, MIN(rough) best_r, AVG(harm_pitch) avg_h, MAX(harm_pitch) best_h,
        SUM(pareto_layer = 1) front FROM placements GROUP BY rule, set_id, window)
      SELECT rule, window, AVG(avg_r) mean_rough, AVG(best_r) mean_best_rough, AVG(avg_h) mean_harm, AVG(best_h) mean_best_harm,
        AVG(front = 1) one_winner, AVG(front) mean_front FROM g GROUP BY rule, window ORDER BY rule, window`);
  lap('scores');
  r.agreement = q(`SELECT a.window, AVG(a.best_rough_orderings = b.best_rough_orderings) same FROM summary_winners a
      JOIN summary_winners b ON a.set_id = b.set_id AND a.window = b.window AND a.rule = 'equal' AND b.rule = 'shared'
      GROUP BY a.window ORDER BY a.window`);
  // does the smoothest ordering change: root C3 instead of C2; every tie rounded down; every tie rounded up
  r.winnerChange = q(`WITH x AS (SELECT rule, window, rank_rough,
        ROW_NUMBER() OVER (PARTITION BY rule, set_id, window ORDER BY rough_c3, ord) k3,
        ROW_NUMBER() OVER (PARTITION BY rule, set_id, window ORDER BY down_rough, ord) kd,
        ROW_NUMBER() OVER (PARTITION BY rule, set_id, window ORDER BY up_rough, ord) ku FROM placements)
      SELECT rule, window, AVG(CASE WHEN k3 = 1 THEN rank_rough <> 1 END) root,
        AVG(CASE WHEN kd = 1 THEN rank_rough <> 1 END) down, AVG(CASE WHEN ku = 1 THEN rank_rough <> 1 END) up
      FROM x GROUP BY rule, window ORDER BY rule, window`);
  lap('winner changes');
  r.heat = q(`WITH g AS (SELECT p.rule, s.largest, p.window, MIN(p.rough) best FROM placements p JOIN sets s USING (set_id)
        GROUP BY p.rule, p.set_id, p.window)
      SELECT rule, largest, window, AVG(best) best FROM g GROUP BY rule, largest, window ORDER BY rule, largest, window`);
  r.totals = q(`SELECT (SELECT COUNT(*) FROM placements) placements, (SELECT COUNT(DISTINCT notes) FROM placements) chords, (SELECT COUNT(*) FROM sets) sets`)[0];
  lap('heat and totals');

  // ---- simple sets against their compound mixes (human, 2026-11-21) ----
  // A simple set is one whose intervals can all go up an octave and stay in range (largest <= max - 12). A mix raises
  // some of its intervals by 12 (k of n compound; for 2 4 5: 14 4 5, 2 16 5, ... 14 16 17). Each mixed placement is
  // paired with the simple placement of the same ordering (compound values reduced by 12), in the same window W and in
  // W + 12. Measures: same pitch-class set as the simple chord; "exact": the simple chord with the compounded
  // intervals' top notes raised 12 and everything else unmoved; roughness, harmonicity; same smoothest ordering.
  const sets = q('SELECT set_id, intervals, largest FROM sets');
  const byIv = new Map(sets.map((s) => [s.intervals, s.set_id]));
  const ordsOf = db.prepare('SELECT ord, ordering FROM orderings WHERE set_id = ?');
  const rowsOf = db.prepare('SELECT rule, ord, window, notes, rough, harm_pitch, rank_rough FROM placements WHERE set_id = ?');
  const pcs = (notes) => [...new Set(notes.split(' ').map((x) => Number(x) % 12))].sort((a, b) => a - b).join(' ');
  const SIMPLE_MAX = r.meta.max - 12;
  const agg = new Map(); // k|rule|offset|W -> sums
  const explorer = [];
  for (const s of sets) {
    if (s.largest > SIMPLE_MAX) continue;
    const iv = s.intervals.split(' ').map(Number);
    const sOrd = new Map(ordsOf.all(s.set_id).map((o) => [o.ord, o.ordering]));
    const simple = new Map(); // rule|ordering|window -> row
    for (const a of rowsOf.all(s.set_id)) simple.set(`${a.rule}|${sOrd.get(a.ord)}|${a.window}`, a);
    const variants = new Map(); // sorted intervals -> k
    for (let mask = 0; mask < 1 << n; mask++) {
      const v = iv.map((x, i) => (mask >> i) & 1 ? x + 12 : x).sort((a, b) => a - b).join(' ');
      variants.set(v, iv.reduce((c, _, i) => c + ((mask >> i) & 1), 0));
    }
    const exp = n <= 3 ? { set: s.intervals, variants: [] } : null;
    for (const [v, k] of variants) {
      const vid = byIv.get(v);
      if (vid === undefined) continue;
      const vOrd = new Map(ordsOf.all(vid).map((o) => [o.ord, o.ordering]));
      const vRows = rowsOf.all(vid);
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
    rows: [...agg.values()].sort((x, y) => x.k - y.k || (x.rule < y.rule ? -1 : x.rule > y.rule ? 1 : 0) || x.offset - y.offset || x.window - y.window)
      .map((g) => ({ k: g.k, rule: g.rule, offset: g.offset, window: g.window, pairs: g.pairs, pc_same: g.pc / g.pairs, exact: g.exact / g.pairs,
        rough_s: g.rs / g.pairs, rough_v: g.rv / g.pairs, harm_s: g.hs / g.pairs, harm_v: g.hv / g.pairs, same_winner: g.same / g.groups })),
    explorer,
  };
  lap('simple vs compound');
  result.n.push(n);
  result[n] = r;
  db.close();
}
writeFileSync(out, JSON.stringify(result));
console.log('wrote', out);
