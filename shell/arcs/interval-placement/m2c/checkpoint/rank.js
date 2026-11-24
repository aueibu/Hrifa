// The catalog ranking as the page computes it for any window range, written to match src/lib/interval-placement's
// rankCatalog exactly (z-scores with the sample sd, a constant column gives zeros; mix = sum of weight * z; stable sort,
// best first). build-checkpoint.ts checks it against the library on every preset and on the whole range.
// Plain JS (no imports) so the page can inline it (inject.mjs drops the export line).
function standardize(xs) {
  const n = xs.length;
  if (n < 2) return xs.map(() => 0);
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  return sd > 0 ? xs.map((x) => (x - mean) / sd) : xs.map(() => 0);
}
/** entries: [{rough, harmP, harmPc, per, ...}], weights: {rough, harmP, harmPc, per} -> [{...entry, mix}] best first. */
function rankEntries(entries, weights) {
  const keys = Object.keys(weights).filter((k) => weights[k]);
  const z = keys.map((k) => standardize(entries.map((e) => e[k])));
  return entries
    .map((e, i) => ({ ...e, mix: keys.reduce((s, k, j) => s + weights[k] * z[j][i], 0) }))
    .sort((a, b) => b.mix - a.mix);
}
/** Pareto layers over two keys with senses ('min' | 'max'); returns layer index per entry (same order as input). */
function paretoLayerOf(entries, kx, sx, ky, sy) {
  const sgn = (s) => (s === 'max' ? -1 : 1);
  const pts = entries.map((e) => [sgn(sx) * e[kx], sgn(sy) * e[ky]]);
  const layer = new Array(entries.length).fill(-1);
  let left = pts.map((_, i) => i);
  for (let l = 0; left.length; l++) {
    const front = left.filter((i) => !left.some((j) => j !== i && pts[j][0] <= pts[i][0] && pts[j][1] <= pts[i][1] && (pts[j][0] < pts[i][0] || pts[j][1] < pts[i][1])));
    for (const i of front) layer[i] = l;
    left = left.filter((i) => layer[i] < 0);
  }
  return layer;
}
/** Rows for one set and rule (one row per width and pitch set) -> one entry per pitch set over [wmin, wmax]. */
function mergeRange(rows, wmin, wmax) {
  const byId = new Map();
  for (const r of rows) {
    if (r.width < wmin || r.width > wmax) continue;
    const hit = byId.get(r.id);
    if (hit) hit.occ.push(...r.occ);
    else byId.set(r.id, { ...r, occ: r.occ.slice() });
  }
  return [...byId.values()];
}
export { standardize, rankEntries, paretoLayerOf, mergeRange }; // the page inliner drops this line
