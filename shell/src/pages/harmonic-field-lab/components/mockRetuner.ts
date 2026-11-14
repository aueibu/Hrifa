/**
 * Static retuner content for the Retuner panel until M7 makes it live: three 5-limit cards and the I - vi - ii - V - I
 * progression of the M2 drift test, scored with the default scorer. Computed once at module load (the retuner panel is
 * a placeholder; it does not depend on the lab state).
 */
import {
  compareScorers,
  fmtRatio,
  fmtSigned,
  mFrac,
  parseInterval,
  retuneStep,
  scoreLattice,
  scorePeriodicityFair,
  scorePeriodicityInfinitone,
  scoreRoughness,
  templateLabel,
  type HeldNote,
  type Note,
  type RetuneResult,
  type RetunerCard,
} from '../../../lib/harmonic-field';

const rep = parseInterval('2/1') as Note;

/** Format a pitch ratio from a monzo-bearing note as "a/b", or the cents when it is irrational. */
export const fmtBase = (n: { m: Note['m']; c: number }) =>
  n.m ? fmtRatio(n as Note) : `${n.c.toFixed(2)} c`;

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
