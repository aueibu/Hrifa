import { placeIntervals, transpositionScan } from '../../../src/lib/interval-placement/index';
import { interference, harmonicity, periodicity, paretoFront, DEFAULT_TIMBRE } from '../../../src/lib/consonance/index';
const C2 = 65.406;
const hz = (ref: number, cents: number[]) => cents.map((c) => ref * 2 ** (c / 1200));
const sc = (ref: number, cents: number[]) => {
  const f = hz(ref, cents);
  return { hk: interference(f, DEFAULT_TIMBRE).total, worst: interference(f, DEFAULT_TIMBRE).worst, hpc: harmonicity(f, { space: 'pitch-class' }).value, hp: harmonicity(f, { space: 'pitch' }).value, per: periodicity(f).value };
};
const iv = [11, 7, 16].map((s) => ({ cents: s * 100 }));
const f3 = (x: number) => x.toFixed(3);
// A. window coupling
console.log('A. same ordering (11,16,7) prefixSlack, window width vs result');
for (const w of [2, 3, 4, 5]) {
  const r = placeIntervals({ intervals: iv, window: { bottomHz: C2, widthSteps: w * 12 }, distribution: 'prefixSlack', stepCents: 100 });
  const v = r.voicings.find((x) => x.perms.some((p) => p.perm.join() === '1100,1600,700'));
  if (!v) { console.log(w, 'none'); continue; }
  const s = sc(v.refHz, v.cents);
  console.log(`  ${w} oct: steps [${v.cents.map((c) => c / 100).join(',')}] span ${v.measures.spanCents / 100} st, H&K ${f3(s.hk)}, harm pc ${f3(s.hpc)}`);
}
// B. register scan of the default best voicing
const r3 = placeIntervals({ intervals: iv, window: { bottomHz: C2, widthSteps: 36 }, distribution: 'prefixSlack', stepCents: 100 });
const v0 = r3.voicings[0];
console.log(`B. register scan of [${v0.cents.map((c) => c / 100).join(',')}] (steps above bottom)`);
for (const row of transpositionScan(v0, { fromCents: -1200, toCents: 3600, stepCents: 600 })) {
  const s = sc(row.voicing.refHz, row.voicing.cents);
  const note = ['C1', 'F#1', 'C2', 'F#2', 'C3', 'F#3', 'C4', 'F#4', 'C5'][(row.shiftCents + 1200) / 600];
  console.log(`  bottom ${note.padEnd(4)} H&K ${f3(s.hk)} worst ${f3(s.worst)} harm pc ${f3(s.hpc)} harm pitch ${f3(s.hp)} period ${f3(s.per)}`);
}
// C. exhaustive search over span positions vs the engines
const L = 36, d = [11, 7, 16];
const seen = new Map<string, { cents: number[]; shared: boolean }>();
for (let a = 0; a + d[0] <= L; a++) for (let b = 0; b + d[1] <= L; b++) for (let c = 0; c + d[2] <= L; c++) {
  const pts = [a, a + d[0], b, b + d[1], c, c + d[2]];
  const set = [...new Set(pts)].sort((x, y) => x - y);
  const key = set.join(',');
  if (!seen.has(key)) seen.set(key, { cents: set.map((x) => x * 100), shared: set.length < 6 });
}
const cands = [...seen.values()];
const t0 = Date.now();
const scored = cands.map((v) => ({ ...v, ...sc(C2, v.cents) }));
console.log(`C. exhaustive: ${cands.length} distinct pitch sets (${cands.filter((c) => c.shared).length} with shared notes), scored in ${Date.now() - t0} ms`);
const pts = scored.map((s) => [s.hk, -s.hpc]);
const front = paretoFront(pts as any);
console.log('  paretoFront returned', Array.isArray(front) ? front.length : typeof front, JSON.stringify(front).slice(0, 120));
const engineSets: Record<string, string[]> = {};
for (const dist of ['uniform', 'prefixSlack', 'prefixDominance', 'repulsion'] as const) {
  const r = placeIntervals({ intervals: iv, window: { bottomHz: C2, widthSteps: 36 }, distribution: dist, stepCents: 100 });
  engineSets[dist] = r.voicings.filter((v) => v.meta.withinWindow !== false).map((v) => v.cents.map((c) => c / 100).join(','));
}
const rankHK = [...scored].sort((x, y) => x.hk - y.hk).map((s) => s.cents.map((c) => c / 100).join(','));
const rankH = [...scored].sort((x, y) => y.hpc - x.hpc).map((s) => s.cents.map((c) => c / 100).join(','));
for (const [k, sets] of Object.entries(engineSets)) {
  const pr = sets.map((s) => rankHK.indexOf(s)).sort((a, b) => a - b);
  const ph = sets.map((s) => rankH.indexOf(s)).sort((a, b) => a - b);
  console.log(`  ${k}: ${sets.length} voicings; H&K ranks among ${cands.length}: ${pr.join(' ')}; harmonicity ranks: ${ph.join(' ')}`);
}
const top = [...scored].sort((x, y) => x.hk - y.hk).slice(0, 5);
console.log('  top 5 by H&K:', top.map((s) => `[${s.cents.map((c) => c / 100)}] ${f3(s.hk)} hpc ${f3(s.hpc)}`).join(' | '));
const topH = [...scored].sort((x, y) => y.hpc - x.hpc).slice(0, 5);
console.log('  top 5 by harm pc:', topH.map((s) => `[${s.cents.map((c) => c / 100)}] hk ${f3(s.hk)} hpc ${f3(s.hpc)}`).join(' | '));
const spans = scored.map((s) => s.cents[s.cents.length - 1] - s.cents[0]);
console.log('  span range of candidates (st):', Math.min(...spans) / 100, '-', Math.max(...spans) / 100);
