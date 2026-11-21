// Catalog of the equal-centers band, band(W) = (n-1) * min over pairs i<j of (W - (d_i + d_j)/2) / (j - i), for every
// ordered tuple of n intervals with sizes 1..15 (n = 3: 3,375 tuples; n = 4: 50,625). Exact: the band is the lower
// envelope of straight lines (one per pair), walked from W = M (the largest interval, where the chord first fits).
// Shared center range and old prefix-slack need no catalog: their band is W - M for every ordering.
// Run from shell/: node arcs/interval-placement/m2c/bandCatalog.mjs <outDir>
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2] ?? '.';
const EPS = 1e-9;

function envelope(order) {
  const n = order.length;
  const M = Math.max(...order);
  const lines = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const a = (order[i] + order[j]) / 2;
      const k = j - i;
      lines.push({ i, j, slope: (n - 1) / k, at: (W) => ((n - 1) * (W - a)) / k });
    }
  // start: the lowest line at W = M (ties: the flattest, which stays lowest afterwards)
  const pick = (W) =>
    lines.reduce((best, l) => {
      const v = l.at(W), bv = best.at(W);
      return v < bv - EPS || (Math.abs(v - bv) <= EPS && l.slope < best.slope) ? l : best;
    });
  const regimes = [];
  let W = M;
  let cur = pick(W);
  for (;;) {
    // next crossing with a flatter line
    let next = null;
    for (const l of lines) {
      if (l.slope >= cur.slope - EPS) continue;
      const Wc = (cur.at(0) - l.at(0)) / (l.slope - cur.slope); // cur.at(W) = l.at(W)
      if (Wc > W + EPS && (!next || Wc < next.W - EPS)) next = { W: Wc, l };
    }
    regimes.push({ from: W, pair: [cur.i, cur.j], slope: cur.slope });
    if (!next) break;
    W = next.W;
    cur = next.l;
  }
  return { M, startBand: lines.reduce((m, l) => Math.min(m, l.at(M)), Infinity), regimes };
}

const fmt = (x) => (Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : x.toFixed(3).replace(/0+$/, ''));

function run(n) {
  const rows = [];
  const tuple = Array(n).fill(1);
  for (;;) {
    const order = tuple.slice();
    const e = envelope(order);
    const last = e.regimes[e.regimes.length - 1];
    const finalOffset = (order[0] + order[n - 1]) / 2;
    rows.push({
      order: order.join(' '),
      set: order.slice().sort((a, b) => a - b).join(' '),
      M: e.M,
      startBand: e.startBand,
      bends: e.regimes.length - 1,
      settlesAt: last.from, // window from which band = W - (first + last)/2
      steepSteps: last.from - e.M, // how many window steps before the 1:1 line
      finalOffset,
      gainOverShared: e.M - finalOffset, // band(equal) - band(shared) once settled
      regimes: e.regimes.map((r) => `W>=${fmt(r.from)}: pair ${r.pair[0] + 1}-${r.pair[1] + 1} slope ${fmt(r.slope)}`).join(' | '),
    });
    let p = n - 1;
    while (p >= 0 && tuple[p] === 15) tuple[p--] = 1;
    if (p < 0) break;
    tuple[p]++;
  }
  const head = Object.keys(rows[0]);
  const csv = [head.join(','), ...rows.map((r) => head.map((h) => (typeof r[h] === 'number' ? fmt(r[h]) : `"${r[h]}"`)).join(','))].join('\n');
  writeFileSync(join(outDir, `band-catalog-${n}.csv`), csv);

  // ---- summary ----
  const count = (f) => rows.filter(f).length;
  const hist = (key) => {
    const h = new Map();
    for (const r of rows) h.set(r[key], (h.get(r[key]) ?? 0) + 1);
    return [...h.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${fmt(k)}:${v}`).join('  ');
  };
  const slopes = new Map();
  for (const r of rows) for (const m of r.regimes.matchAll(/slope ([\d.]+)/g)) slopes.set(m[1], (slopes.get(m[1]) ?? 0) + 1);
  const pairStarts = new Map();
  for (const r of rows) { const m = r.regimes.match(/pair (\d-\d)/); pairStarts.set(m[1], (pairStarts.get(m[1]) ?? 0) + 1); }
  console.log(`\n=== n = ${n}: ${rows.length} ordered tuples ===`);
  console.log('bends per ordering:', hist('bends'));
  console.log('starts on the outer pair (no bend):', count((r) => r.bends === 0));
  console.log('first limiting pair at W = M:', [...pairStarts.entries()].sort().map(([k, v]) => `${k}:${v}`).join('  '));
  console.log('slopes seen in any regime:', [...slopes.entries()].sort().map(([k, v]) => `${k}:${v}`).join('  '));
  console.log('band = 0 at W = M (all centers together):', count((r) => r.startBand < 1e-9));
  console.log('steep window steps before settling (steepSteps):', hist('steepSteps'));
  console.log('gain over shared once settled:', hist('gainOverShared'));
  // check of the claimed rule: settled band = W - (first + last)/2, and settlesAt formula
  const bad = rows.filter((r) => {
    const o = r.order.split(' ').map(Number);
    let D = Infinity;
    const W = r.settlesAt + 7;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) D = Math.min(D, (W - (o[i] + o[j]) / 2) / (j - i));
    return Math.abs((n - 1) * D - (W - r.finalOffset)) > 1e-9;
  });
  console.log('check settled band = W - (first+last)/2:', bad.length === 0 ? 'holds for all' : `FAILS for ${bad.length}`);
  return rows;
}

run(3);
run(4);
