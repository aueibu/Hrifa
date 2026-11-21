// M2c listening-page data: the SCENARIOS.M2c.md examples as JSON (candidate rules as in scen.ts; scores from the real lib).
// Run from shell/: npx esbuild arcs/interval-placement/m2c/examples.ts --bundle --platform=node --format=esm --outfile=/tmp/e.mjs && node /tmp/e.mjs > examples.json
import { scoreVoicing, standardise, midiToHz } from '../../../src/lib/consonance/index';

const BASE_MIDI = 36; // C2
type Span = { low: number; size: number };

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
  const notes = [...new Set(all)].sort((a, b) => a - b);
  const sharedAt = notes.filter((x) => all.filter((y) => y === x).length > 1);
  return { notes, sharedAt };
}

function rough(notes: number[]) {
  const v = { refHz: midiToHz(BASE_MIDI), cents: notes.map((s) => s * 100) };
  const s = scoreVoicing(v, { decompose: false });
  return { rough: s.interference.hutchinsonKnopoff.total, harmP: s.harmonicity.pitch.value, harmPc: s.harmonicity.pitchClass.value };
}

function ex(label: string, spans: Span[] | null, note = '') {
  if (!spans) return { label, fits: false, note };
  const { notes, sharedAt } = notesOf(spans);
  const g = notes.slice(1).map((x, i) => Math.floor((x - notes[i]) / 12));
  return {
    label,
    fits: true,
    note,
    spans,
    midi: notes.map((x) => x + BASE_MIDI),
    sharedMidi: sharedAt.map((x) => x + BASE_MIDI),
    span: notes[notes.length - 1] - notes[0],
    gaps: g.filter((x) => x >= 1).length,
    ...rough(notes),
  };
}

// plain notes (no spans), e.g. the explorer's shapes
function exNotes(label: string, midis: number[], note = '') {
  const steps = midis.map((m) => m - BASE_MIDI);
  const g = steps.slice(1).map((x, i) => Math.floor((x - steps[i]) / 12));
  return { label, fits: true, note, spans: [], midi: midis, sharedMidi: [], span: steps[steps.length - 1] - steps[0], gaps: g.filter((x) => x >= 1).length, ...rough(steps) };
}

const typed = [11, 7, 16];
const wide = shape(typed, 30, 0, 'equal')!;

// neighborhood k=2 of the Wide voicing
const cands: { spans: Span[]; notes: number[] }[] = [];
const seen = new Set<string>();
for (let a = -2; a <= 2; a++)
  for (let b = -2; b <= 2; b++)
    for (let c = -2; c <= 2; c++) {
      const spans = wide.map((s, i) => ({ ...s, low: s.low + [a, b, c][i] }));
      if (spans.some((s) => s.low < 0 || s.low + s.size > 36)) continue;
      const { notes } = notesOf(spans);
      const key = notes.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      cands.push({ spans, notes });
    }
function top(set: typeof cands, w: { harmP?: number; harmPc?: number }, n = 3) {
  const sc = set.map((c) => rough(c.notes));
  const zr = standardise(sc.map((s) => s.rough));
  const zp = standardise(sc.map((s) => s.harmP));
  const zpc = standardise(sc.map((s) => s.harmPc));
  const val = set.map((_, i) => -zr[i] + (w.harmP ?? 0) * zp[i] + (w.harmPc ?? 0) * zpc[i]);
  return val.map((_, i) => i).sort((x, y) => val[y] - val[x]).slice(0, n).map((i) => set[i]);
}
const free = cands;
const fixed = cands.filter((c) => c.notes[0] === 0);
const fixed6 = fixed.filter((c) => c.notes.length === 6);
const leanA = { harmP: 2 };
const leanB = { harmPc: 2 };

const out = {
  q1: [
    ex('Close (up to 12 steps)', shape(typed, 12, 0, 'equal'), 'Does not fit: the major 10th (16 steps) is wider than an octave.'),
    ex('Close, option (b): narrowest that fits, 16 steps', shape(typed, 16, 0, 'equal')),
    ex('Open, 18 steps', shape(typed, 18, 0, 'equal')),
    ex('Wide, 30 steps', wide),
    ex('Vast, 42 steps', shape(typed, 42, 0, 'equal')),
  ],
  q2A: [-1, 0, 1].map((l) => ex(['Lean low', 'Centered', 'Lean high'][l + 1], shape(typed, 30, l, 'equal'))),
  q2B: [
    ex('Lean low: biggest interval at the bottom (16 11 7)', shape([16, 11, 7], 30, 0, 'equal')),
    ex('Centered: your order (11 7 16)', wide),
    ex('Lean high: biggest interval at the top (7 11 16)', shape([7, 11, 16], 30, 0, 'equal')),
  ],
  q3: [[11, 7, 16], [11, 16, 7], [7, 11, 16], [7, 16, 11], [16, 11, 7], [16, 7, 11]].map((p, i) =>
    ex(`${p.join(' ')}${i === 0 ? ' (as typed)' : ''}`, shape(p, 30, 0, 'equal'))
  ),
  q4: [
    ex('Equal: starting points evenly spaced', shape([11, 7, 16, 4], 30, 0, 'equal')),
    ex('By size: room in proportion to the sizes before it', shape([11, 7, 16, 4], 30, 0, 'size')),
  ],
  q5: [-1, 0, 1, 2].map((d) =>
    ex(d === 0 ? 'Start' : `Move the 7 ${d > 0 ? 'up' : 'down'} ${Math.abs(d)}`, wide.map((s, i) => (i === 1 ? { ...s, low: s.low + d } : s)))
  ),
  q6a: {
    free: top(free, leanA).map((c, i) => ex(`Free #${i + 1}`, c.spans)),
    fixed: top(fixed6, leanA).map((c, i) => ex(`Bottom kept #${i + 1}`, c.spans)),
  },
  q6b: {
    any: top(fixed, leanA, 1).map((c) => ex('Any note count: best', c.spans)),
    same: top(fixed6, leanA, 1).map((c) => ex('Same note count (6): best', c.spans)),
  },
  q7: {
    A: top(fixed6, leanA).map((c, i) => ex(`#${i + 1}`, c.spans)),
    B: top(fixed6, leanB).map((c, i) => ex(`#${i + 1}`, c.spans)),
  },
  q8: [
    exNotes('One gap (G3 to G4)', [36, 47, 48, 51, 55, 67]),
    exNotes('Cmaj7, close', [48, 52, 55, 59], 'shape: close, 0 gaps'),
    exNotes('Cmaj7, drop 2', [48, 55, 59, 64], 'shape: drop 2, 0 gaps'),
    exNotes('Cmaj7, octave between bass and the rest', [36, 52, 55, 59], '1 gap (C2 to E3)'),
  ],
};
console.log(JSON.stringify(out));
