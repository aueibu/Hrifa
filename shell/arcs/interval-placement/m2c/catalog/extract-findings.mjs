// Aggregates for the catalog visuals page. Usage: node extract.mjs <n3.sqlite> <n4.sqlite> <out.json>
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';

const [f3, f4, out] = process.argv.slice(2);
const result = {};
for (const [n, file] of [[3, f3], [4, f4]]) {
  const db = new DatabaseSync(file, { readOnly: true });
  const q = (sql) => db.prepare(sql).all();
  const t = Date.now();
  const r = {};
  // A. merges, rounding, mirror by rule and window
  r.byWindow = q(`SELECT m.rule, m.window, m.placements, m.share_with_merge, m.avg_merges, r.share_with_tie,
      r.share_grid_robust, r.share_mirror_ok FROM summary_merges m JOIN summary_rounding r USING (rule, window) ORDER BY m.rule, m.window`);
  // B. merge kinds
  r.mergeKinds = q(`SELECT rule, SUM(stack_pairs) stack, SUM(bottom_pairs) bottom, SUM(top_pairs) top FROM summary_merges GROUP BY rule`);
  // G. note counts
  r.noteCounts = q(`SELECT rule, ${2 * n} - merges AS notes, COUNT(*) placements FROM placements GROUP BY rule, merges ORDER BY rule, notes`);
  // C. scores by window: mean over all placements, and mean of each group's best (lowest roughness / highest harmonicity)
  r.scores = q(`WITH g AS (SELECT p.rule, p.set_id, p.window, AVG(c.rough) avg_r, MIN(c.rough) best_r, AVG(c.harm_pitch) avg_h,
        MAX(c.harm_pitch) best_h FROM placements p JOIN chords c USING (chord_id) GROUP BY p.rule, p.set_id, p.window)
      SELECT rule, window, AVG(avg_r) mean_rough, AVG(best_r) mean_best_rough, AVG(avg_h) mean_harm, AVG(best_h) mean_best_harm
      FROM g GROUP BY rule, window ORDER BY rule, window`);
  console.log(`n=${n}: scores ${(Date.now() - t) / 1000}s`);
  // D. do the two rules pick the same smoothest ordering?
  r.agreement = q(`SELECT a.window, AVG(a.best_rough_orderings = b.best_rough_orderings) same FROM summary_winners a
      JOIN summary_winners b ON a.set_id = b.set_id AND a.window = b.window AND a.rule = 'equal' AND b.rule = 'shared'
      GROUP BY a.window ORDER BY a.window`);
  // E. does moving the root C2 -> C3 change the smoothest chord?
  r.rootChange = q(`WITH x AS (SELECT p.rule, p.set_id, p.window, p.chord_id,
        ROW_NUMBER() OVER (PARTITION BY p.rule, p.set_id, p.window ORDER BY c.rough, p.chord_id) k2,
        ROW_NUMBER() OVER (PARTITION BY p.rule, p.set_id, p.window ORDER BY b.rough, p.chord_id) k3
      FROM placements p JOIN chords c USING (chord_id) JOIN rough_by_base b ON b.chord_id = p.chord_id AND b.base_midi = 48)
      SELECT rule, window, AVG(k3 <> 1) changed FROM x WHERE k2 = 1 GROUP BY rule, window ORDER BY rule, window`);
  console.log(`n=${n}: root change ${(Date.now() - t) / 1000}s`);
  // F. heatmap: best roughness per (largest interval, window), averaged over sets, both rules
  r.heat = q(`WITH g AS (SELECT p.rule, s.largest, p.window, p.set_id, MIN(c.rough) best FROM placements p JOIN sets s USING (set_id)
        JOIN chords c USING (chord_id) GROUP BY p.rule, p.set_id, p.window)
      SELECT rule, largest, window, AVG(best) best FROM g GROUP BY rule, largest, window ORDER BY rule, largest, window`);
  r.totals = q(`SELECT (SELECT COUNT(*) FROM placements) placements, (SELECT COUNT(*) FROM chords) chords, (SELECT COUNT(*) FROM sets) sets`)[0];
  console.log(`n=${n}: done ${(Date.now() - t) / 1000}s`);
  result[n] = r;
}
writeFileSync(out, JSON.stringify(result));
console.log('wrote', out);
