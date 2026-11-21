// M2c scenario prototype (candidate rules, not the library). Run from shell/: npx esbuild arcs/interval-placement/m2c/scen.ts --bundle --platform=node --format=esm --outfile=/tmp/x.mjs && node /tmp/x.mjs
import { scoreVoicing, standardise, combine, midiToHz } from '../../../src/lib/consonance/index';

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const BASE_MIDI = 36; // C2
const name = (step: number) => {
  const m = BASE_MIDI + step;
  return NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
};

type Span = { low: number; size: number };
// Candidate rule: first span in the order starts at the bottom, last span ends at the top (so the chord's span = W),
// middle spans' lows at fraction f of their room; lean warps f (f^(2^-lean)); evenness: equal or by size.
function shape(sizes: number[], W: number, lean: number, evenness: 'equal' | 'size'): Span[] | null {
  const n = sizes.length;
  if (sizes.some((s) => s > W)) return null;
  const cum: number[] = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    cum.push(acc);
    acc += sizes[i];
  }
  const denom = cum[n - 1] || 1;
  return sizes.map((s, i) => {
    let f = n === 1 ? 0 : evenness === 'equal' ? i / (n - 1) : cum[i] / denom;
    f = Math.pow(f, Math.pow(2, -lean));
    return { low: Math.round(f * (W - s)), size: s };
  });
}

function notesOf(spans: Span[]) {
  const all: number[] = [];
  for (const sp of spans) all.push(sp.low, sp.low + sp.size);
  const set = [...new Set(all)].sort((a, b) => a - b);
  const shared = all.length - set.length;
  return { notes: set, shared };
}

function scores(notes: number[]) {
  const v = { refHz: midiToHz(BASE_MIDI), cents: notes.map((s) => s * 100) };
  const s = scoreVoicing(v, { decompose: false });
  return {
    rough: s.interference.hutchinsonKnopoff.total,
    harmP: s.harmonicity.pitch.value,
    harmPc: s.harmonicity.pitchClass.value,
    per: s.periodicity.value,
  };
}

function gapsOf(notes: number[]) {
  const g = notes.slice(1).map((x, i) => Math.floor((x - notes[i]) / 12));
  return { g, gaps: g.filter((x) => x >= 1).length, gSum: g.reduce((a, b) => a + b, 0) };
}

const fmt = (x: number) => x.toFixed(3);
const line = (label: string, spans: Span[] | null) => {
  if (!spans) return `${label}: does not fit`;
  const { notes, shared } = notesOf(spans);
  const sc = scores(notes);
  const gp = gapsOf(notes);
  const spansTxt = spans.map((s) => `${s.size}@${name(s.low)}-${name(s.low + s.size)}`).join(' ');
  return `${label}: spans ${spansTxt} | notes ${notes.map(name).join(' ')} (steps ${notes.join(' ')}) | span ${notes[notes.length - 1] - notes[0]} | shared ${shared} | gaps ${gp.gaps} (g ${gp.g.join('')}, sum ${gp.gSum}) | rough ${fmt(sc.rough)} harmP ${fmt(sc.harmP)} harmPc ${fmt(sc.harmPc)} per ${fmt(sc.per)}`;
};

const typed = [11, 7, 16];
console.log('## S1 min span: largest interval =', Math.max(...typed));
for (const W of [12, 18, 30, 42]) console.log(line(`S1 W=${W} lean0 equal`, shape(typed, W, 0, 'equal')));

console.log('\n## S2 lean, typed order 11 7 16');
for (const W of [18, 30]) for (const lean of [-1, 0, 1]) console.log(line(`S2 W=${W} lean${lean}`, shape(typed, W, lean, 'equal')));

console.log('\n## S3 orderings at W=30 lean0');
const perms = [[11, 7, 16], [11, 16, 7], [7, 11, 16], [7, 16, 11], [16, 11, 7], [16, 7, 11]];
for (const p of perms) console.log(line(`S3 ${p.join(' ')}`, shape(p, 30, 0, 'equal')));

console.log('\n## S4 evenness, 4 intervals 11 7 16 4 at W=30 lean0');
for (const e of ['equal', 'size'] as const) console.log(line(`S4 ${e}`, shape([11, 7, 16, 4], 30, 0, e)));

console.log('\n## S5 drag the 7-span of W=30 lean0 typed');
const base = shape(typed, 30, 0, 'equal')!;
for (const d of [-3, -2, -1, 1, 2, 3, 4, 5]) {
  const moved = base.map((s, i) => (i === 1 ? { ...s, low: s.low + d } : s));
  console.log(line(`S5 7-span ${d > 0 ? '+' : ''}${d}`, moved));
}

console.log('\n## S6 neighborhood sizes and timing');
const t0 = performance.now();
let cnt = 0;
for (let i = 0; i < 40; i++) {
  scores(notesOf(base).notes);
  cnt++;
}
const msPer = (performance.now() - t0) / cnt;
console.log(`ms per voicing ~ ${msPer.toFixed(2)}`);
for (const k of [1, 2, 3, 4]) {
  const n = Math.pow(2 * k + 1, typed.length);
  console.log(`k=${k}: ${n} candidates (each span +-${k} steps), ~${((n * msPer) / 1000).toFixed(1)} s`);
}

console.log('\n## S7 weights over the k=2 neighborhood of the W=30 lean0 voicing');
type Cand = { spans: Span[]; notes: number[]; sc: ReturnType<typeof scores> };
const cands: Cand[] = [];
const seen = new Set<string>();
const k = 2;
for (let a = -k; a <= k; a++)
  for (let b = -k; b <= k; b++)
    for (let c = -k; c <= k; c++) {
      const spans = base.map((s, i) => ({ ...s, low: s.low + [a, b, c][i] }));
      if (spans.some((s) => s.low < 0 || s.low + s.size > 36)) continue;
      const { notes } = notesOf(spans);
      const key = notes.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      cands.push({ spans, notes, sc: scores(notes) });
    }
console.log(`distinct candidates (free): ${cands.length}`);
for (const variant of ['bottom fixed', 'bottom fixed + same note count (6)'] as const) {
  const set = cands.filter(
    (c) => c.notes[0] === 0 && (variant === 'bottom fixed' || c.notes.length === 6)
  );
  console.log(`\n### ${variant}: ${set.length} candidates`);
  const zr = standardise(set.map((c) => c.sc.rough));
  const zp = standardise(set.map((c) => c.sc.harmP));
  const zpc = standardise(set.map((c) => c.sc.harmPc));
  const rank = (label: string, vals: number[]) => {
    const idx = vals.map((_, i) => i).sort((x, y) => vals[y] - vals[x]).slice(0, 3);
    console.log(label);
    for (const i of idx) console.log('  ' + line('#', set[i].spans).replace(/^#: /, ''));
  };
  rank('Equal (-1 rough, +1 pc harm) [EQUAL_WEIGHTS]', set.map((_, i) => -zr[i] + zpc[i]));
  rank('Lean A (-1 rough, +2 pitch harm)', set.map((_, i) => -zr[i] + 2 * zp[i]));
  rank('Lean B (-1 rough, +2 pc harm)', set.map((_, i) => -zr[i] + 2 * zpc[i]));
  rank('Rough only (-1)', set.map((_, i) => -zr[i]));
}
void combine;
