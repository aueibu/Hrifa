/**
 * Static numbers for the encyclopaedia mock. Everything here is computed once, at module load, from the ported core
 * for the preset "Harmonics 8–15" with one plausible subset. The mock page does no maths of its own.
 */
import {
  DEFAULT_TEMPLATES,
  PRESETS,
  analyzeSubset,
  buildField,
  closestChord,
  compareScorers,
  constantStructure,
  deviations,
  deviationsJI,
  edoTargets,
  findChords,
  fmtRatio,
  fmtSigned,
  genHarmonic,
  intervalSpectrum,
  latticeCoords,
  latticeEdges,
  mFrac,
  modeMatrix,
  oddLimit,
  parseInterval,
  primeLimit,
  propriety,
  retuneStep,
  rotateSubset,
  scoreLattice,
  scorePeriodicityFair,
  scorePeriodicityInfinitone,
  scoreRoughness,
  templateLabel,
  transpositions,
  vs12,
  vsJI,
  type FoundChord,
  type HeldNote,
  type Note,
  type RetuneResult,
  type RetunerCard,
} from '../../../lib/harmonic-field';

const PRESET = PRESETS.find((p) => p.name === 'Harmonics 8–15')!;
export const presetInfo = { name: PRESET.name, group: PRESET.group, info: PRESET.info ?? '' };

const rep = parseInterval(PRESET.rep) as Note;
export const repC = rep.c;
export const repText = fmtRatio(rep);
const mask = Array<boolean>(25).fill(true);
export const field: Note[] = buildField(genHarmonic(PRESET.h ?? 8, rep, false), rep, mask).notes;

/** The example subset: the field without 11/8 (index 3). */
export const subsetIdx = field.map((_, i) => i).filter((i) => i !== 3);
export const rel = rotateSubset(field, subsetIdx, 0, rep);
const subsetSet = new Set(subsetIdx);

export const analysis = analyzeSubset(rel, rep)!;
export const spectrum = intervalSpectrum(rel, repC);
export const prop = propriety(spectrum);
export const cs = constantStructure(rel, repC, 0.01, spectrum);
export const modes = modeMatrix(rel, repC, 32);

const TOL = 18;
export const chordTolerance = TOL;
export const chords: FoundChord[] = findChords(rel, repC, DEFAULT_TEMPLATES, TOL);
export const templateCount = DEFAULT_TEMPLATES.length;
const foundKeys = new Set(chords.map((c) => c.template));
/** Templates that did not make it at this tolerance, with the tolerance that would have admitted them. */
export const misses = DEFAULT_TEMPLATES.map((t) => ({ t, r: closestChord(rel, repC, t) }))
  .filter(({ r }) => r.chord && !foundKeys.has(r.chord.template))
  .map(({ t, r }) => ({
    name: t.name ?? t.text,
    text: t.text,
    needs: (r as { tol: number }).tol,
    members: (r.chord as FoundChord).members.map((i) => fmtRatio(field[i])),
  }))
  .sort((a, b) => a.needs - b.needs);
export const chordRows = chords.map((c) => ({
  name: c.name || c.template,
  template: c.template,
  root: fmtRatio(field[c.root]),
  members: c.members.map((i) => fmtRatio(field[i])),
  maxErr: c.maxErr,
  exact: c.exact,
}));

export const keys = transpositions(field, subsetIdx, 0, rep, TOL);
export const completeKeys = keys.filter((k) => k.complete);

const dev12 = deviations(rel, edoTargets(12, repC), repC);
export const devJI = deviationsJI(rel, 15, repC);
export const devs = rel.map((n, k) => ({
  ratio: fmtRatio(n),
  c: n.c,
  dev12: dev12[k].dev,
  label12: dev12[k].label,
}));
export const widestMiss = devs.reduce((a, b) => (Math.abs(b.dev12) > Math.abs(a.dev12) ? b : a));

export interface FieldRow {
  i: number;
  on: boolean;
  ratio: string;
  cents: number;
  step: number;
  prime: number | null;
  odd: string;
  vs12: string;
  vsJI: string;
}
export const fieldRows: FieldRow[] = field.map((n, i) => ({
  i,
  on: subsetSet.has(i),
  ratio: fmtRatio(n),
  cents: n.c,
  step: (i < field.length - 1 ? field[i + 1].c : repC) - n.c,
  prime: primeLimit(n),
  odd: String(oddLimit(n) ?? '-'),
  vs12: vs12(n.c),
  vsJI: vsJI(n.c, 15, repC),
}));

export interface ScaleRow {
  deg: number;
  ratio: string;
  cents: number;
  step: number;
  letter: string;
}
export const scaleRows: ScaleRow[] = rel.map((n, i) => ({
  deg: i,
  ratio: fmtRatio(n),
  cents: n.c,
  step: analysis.steps[i],
  letter: analysis.stepLetters[i],
}));

/** Prime-lattice geometry, projected to a 640x300 box (same projection idea as the prototype). */
export interface LatticeView {
  pts: { i: number; x: number; y: number; on: boolean; label: string }[];
  edges: [number, number][];
  axes: string[];
  info: string;
}
function buildLattice(): LatticeView {
  const L = latticeCoords(field, rep, 'prime');
  if (!L || !L.pts.length) {
    return { pts: [], edges: [], axes: [], info: '' };
  }
  const d = L.pts[0].x.length;
  const dirs = Array.from({ length: d }, (_, i) => {
    const a = d <= 3 ? (Math.PI * i) / Math.max(d, 2) : i * 2.39996;
    const len = d <= 3 ? 1 - 0.1 * i : Math.max(0.6, 1 - 0.05 * i);
    return [len * Math.cos(a), -len * Math.sin(a)];
  });
  const proj = (x: number[]): [number, number] => {
    let u = 0;
    let v = 0;
    x.forEach((e, i) => {
      u += e * dirs[i][0];
      v += e * dirs[i][1];
    });
    return [u, v];
  };
  const P = new Map(L.pts.map((p) => [p.i, proj(p.x)]));
  const us = [...P.values()].map((p) => p[0]);
  const vs = [...P.values()].map((p) => p[1]);
  const [minU, maxU, minV, maxV] = [
    Math.min(...us),
    Math.max(...us),
    Math.min(...vs),
    Math.max(...vs),
  ];
  const W = 640;
  const H = 300;
  const pad = 40;
  const k = Math.min(150, (W - 2 * pad) / (maxU - minU || 1), (H - 2 * pad) / (maxV - minV || 1));
  const ox = W / 2 - (k * (minU + maxU)) / 2;
  const oy = H / 2 - (k * (minV + maxV)) / 2;
  return {
    pts: L.pts.map((p) => {
      const [u, v] = P.get(p.i)!;
      return {
        i: p.i,
        x: ox + k * u,
        y: oy + k * v,
        on: subsetSet.has(p.i),
        label: fmtRatio(field[p.i]),
      };
    }),
    edges: latticeEdges(L.pts, 'step').map(([a, b]) => [a, b]),
    axes: (L.axes ?? []).map(String),
    info: `${L.pts.length} notes, prime axes ${(L.axes ?? []).join(', ')}`,
  };
}
export const lattice = buildLattice();

/** Format a pitch ratio from a monzo-bearing note as "a/b", or the cents when it is irrational. */
export const fmtBase = (n: { m: Note['m']; c: number }) =>
  n.m ? fmtRatio(n as Note) : `${n.c.toFixed(2)} c`;

/* ---------------------------------------------------------------------------------------------------------------- */
/* Retuner placeholder: three 5-limit cards and the I - vi - ii - V - I progression of the M2 drift test, scored with  */
/* the default scorer (Sethares roughness).                                                                           */
/* ---------------------------------------------------------------------------------------------------------------- */
const P = (s: string) => parseInterval(s) as Note;
const mkCard = (name: string, notes: string[]): RetunerCard => ({
  name,
  notes: notes.map(P),
  rep,
  base: P('1/1'),
});
const MAJOR_9_8 = ['1/1', '9/8', '5/4', '4/3', '3/2', '5/3', '15/8'];
const PYTH = ['1/1', '9/8', '81/64', '4/3', '3/2', '27/16', '243/128'];
const MAJOR_10_9 = ['1/1', '10/9', '5/4', '4/3', '3/2', '5/3', '15/8'];
const startCards = (): RetunerCard[] => {
  const cards = [
    mkCard('Home: Ptolemy major', MAJOR_9_8),
    mkCard('Pythagorean major', PYTH),
    mkCard('Ptolemy major, 10/9 second', MAJOR_10_9),
  ];
  return cards.map((c) => ({ ...c, home: c.base }));
};

const SCORER = (f: number[]) => scoreRoughness(f);
export const SCORERS = [
  { id: 'roughness', name: 'Roughness (Sethares)', run: SCORER },
  { id: 'lattice', name: 'Lattice distance', run: (f: number[]) => scoreLattice(f) },
  { id: 'fair', name: 'Pitch-fair periodicity', run: (f: number[]) => scorePeriodicityFair(f) },
  {
    id: 'infinitone',
    name: 'Infinitone parity',
    run: (f: number[]) => scorePeriodicityInfinitone(f),
  },
] as const;

const held = (...xs: [number, number, number][]): HeldNote[] =>
  xs.map(([key, deg, oct], i) => ({ key, deg, oct, t: i }));
const PROGRESSION: { label: string; h: [number, number, number][]; pivot: number }[] = [
  {
    label: 'I  C E G',
    h: [
      [60, 0, 0],
      [64, 2, 0],
      [67, 4, 0],
    ],
    pivot: 60,
  },
  {
    label: 'vi  A C E',
    h: [
      [69, 5, 0],
      [72, 0, 1],
      [76, 2, 1],
    ],
    pivot: 69,
  },
  {
    label: 'ii  D F A',
    h: [
      [62, 1, 0],
      [65, 3, 0],
      [69, 5, 0],
    ],
    pivot: 69,
  },
  {
    label: 'V  G B D',
    h: [
      [67, 4, 0],
      [71, 6, 0],
      [74, 1, 1],
    ],
    pivot: 74,
  },
  {
    label: 'I  C E G',
    h: [
      [60, 0, 0],
      [64, 2, 0],
      [67, 4, 0],
    ],
    pivot: 67,
  },
];

export interface DriftStep {
  chord: string;
  chosen: string;
  driftCents: number;
  driftRatio: string;
  result: RetuneResult;
}
function runProgression(anchor: 'freestyle' | 'fixed'): {
  steps: DriftStep[];
  cards: RetunerCard[];
} {
  let cards = startCards();
  let active = 0;
  const steps: DriftStep[] = [];
  for (const st of PROGRESSION) {
    const r = retuneStep(
      { cards, active, held: held(...st.h) },
      { pivotMode: 'manual', manualKey: st.pivot, anchor, scorer: SCORER }
    );
    const ratio = r.drift.m ? fmtRatio(r.drift as Note) : 'none';
    steps.push({
      chord: st.label,
      chosen: cards[r.chosen].name,
      driftCents: r.drift.c,
      driftRatio: ratio,
      result: r,
    });
    cards = cards.map((c, i) => ({ ...c, base: r.bases[i] }));
    active = r.chosen;
  }
  return { steps, cards };
}
const run = runProgression('freestyle');
const runFixed = runProgression('fixed');
export const driftSteps = run.steps;
export const retunerCards = run.cards;
export const retunerHome = startCards();
/** The step the "why this card won" table shows: the ii chord, where the cards actually differ. */
export const whyStepIndex = 2;
export const why = run.steps[whyStepIndex].result.why;
export const finalDrift = run.steps[run.steps.length - 1];
export const fixedSteps = runFixed.steps;
export const fixedFinal = runFixed.steps[runFixed.steps.length - 1];

/** The same held chord scored by all four scorers, ranked per scorer (M3's compareScorers). */
export const scorerTable = compareScorers(
  why.entries.filter((e) => e.predicted.length).map((e) => ({ name: e.name, freqs: e.predicted })),
  SCORERS.map((s) => ({ name: s.name, score: (f: number[]) => s.run(f) }))
);

export const fmtFrac = (m: Note['m']) => {
  if (!m) {
    return '';
  }
  const [a, b] = mFrac(m);
  return `${a}/${b}`;
};
export { fmtSigned, templateLabel };
