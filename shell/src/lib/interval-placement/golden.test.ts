/**
 * GOLDEN TEST: verification of the M2 port only. On a fixed input set, every lib distribution must reproduce the old
 * page engine's endpoints and pitches exactly (the old engine is imported from `src/pages/interval-placement/`, which
 * the page keeps using until M4). It proves that the move into the lib and into cents changed nothing by accident.
 * It does NOT bind the redesign: it may be retired or rewritten when the M2b redesign replaces the engines (note it in
 * arcs/interval-placement/PROGRESS.md when that happens).
 */
import { describe, expect, it } from 'vitest';
import {
  computeIntervalPlacements,
  defaultIntervalPlacementParams,
  type IntervalPlacementParams,
  type OddBiasDirection,
  type PlacementMode,
  uniquePermutations,
} from '../../pages/interval-placement/engine';
import { type Distribution, placeIntervals, placeOrdering, type PlacementSpec } from './index';

const MODES: Array<[PlacementMode, Distribution]> = [
  ['v1', 'uniform'],
  ['v2', 'prefixSlack'],
  ['prefixDominance', 'prefixDominance'],
  ['repulse', 'repulsion'],
];

interface Case {
  name: string;
  steps: number[];
  bias: OddBiasDirection[];
  edo: number;
  octaves: number;
  params?: Partial<IntervalPlacementParams>;
}

const cases: Case[] = [];
const sets: Array<[string, number[], OddBiasDirection[]]> = [
  ['pair 3 4', [3, 4], ['down', 'down']],
  ['default 11 7 16', [11, 7, 16], ['down', 'down', 'down']],
  ['odd up 3 5 7', [3, 5, 7], ['up', 'up', 'up']],
  ['odd mixed 3 5 7', [3, 5, 7], ['up', 'down', 'up']],
  ['mixed parity 4 3 7 5', [4, 3, 7, 5], ['down', 'up', 'down', 'up']],
  ['repeated 4 4 3', [4, 4, 3], ['down', 'down', 'up']],
  ['single 7', [7], ['up']],
  ['four 2 9 5 12', [2, 9, 5, 12], ['down', 'up', 'down', 'down']],
];
for (const [name, steps, bias] of sets) {
  for (const octaves of [2, 3, 4]) {
    cases.push({ name: `${name} / ${octaves} oct`, steps, bias, edo: 12, octaves });
  }
}
cases.push(
  {
    name: 'non-default params',
    steps: [3, 5, 7, 4],
    bias: ['up', 'down', 'up', 'down'],
    edo: 12,
    octaves: 3,
    params: {
      anchorAlpha: 0.7,
      anchorBeta: 2.2,
      anchorRho: 0.35,
      repulseGamma: 0.6,
      repulseKappa: 40,
      repulseLambda: 0.9,
      repulseEta: 0.2,
      repulseIterations: 25,
      repulseAlpha: 0.6,
    },
  },
  {
    name: 'rho 0.7 alpha 0 beta 0.5',
    steps: [5, 9, 6],
    bias: ['up', 'up', 'down'],
    edo: 12,
    octaves: 3,
    params: { anchorRho: 0.7, anchorAlpha: 0, anchorBeta: 0.5, repulseKappa: 25, repulseAlpha: 1 },
  },
  { name: '19-EDO', steps: [6, 11, 9], bias: ['up', 'down', 'up'], edo: 19, octaves: 2 },
  {
    name: '31-EDO big repulsion',
    steps: [10, 18, 7],
    bias: ['down', 'up', 'up'],
    edo: 31,
    octaves: 2,
    params: { repulseKappa: 30, repulseIterations: 200 },
  },
  {
    name: 'drop: too wide for 2 oct',
    steps: [30, 20],
    bias: ['down', 'down'],
    edo: 12,
    octaves: 2,
  },
  {
    name: 'drop: 11 7 16 in 1 oct',
    steps: [11, 7, 16],
    bias: ['down', 'up', 'down'],
    edo: 12,
    octaves: 1,
  },
  { name: 'single wide 17', steps: [17], bias: ['up'], edo: 12, octaves: 1 },
  { name: 'tight window', steps: [11, 7, 16], bias: ['down', 'up', 'down'], edo: 12, octaves: 2 }
);

function specFor(c: Case, distribution: Distribution): PlacementSpec {
  const p = { ...defaultIntervalPlacementParams, ...c.params };
  const q = 1200 / c.edo;
  return {
    intervals: c.steps.map((s, i) => ({ cents: s * q, oddBias: c.bias[i] })),
    window: { bottomHz: 65.406, widthSteps: c.octaves * c.edo },
    distribution,
    stepCents: q,
    oddBiasSemantics: 'position',
    cap: Infinity,
    params: {
      anchorAlpha: p.anchorAlpha,
      anchorBeta: p.anchorBeta,
      anchorRho: p.anchorRho,
      repulseGamma: p.repulseGamma,
      repulseKappa: p.repulseKappa,
      repulseLambda: p.repulseLambda,
      repulseEta: p.repulseEta,
      repulseIterations: p.repulseIterations,
      repulseAlpha: p.repulseAlpha,
    },
  };
}

/** Map an old value-permutation to interval indices. */
function orderOf(values: number[], steps: number[]): number[] {
  const used = new Set<number>();
  return values.map((v) => {
    const i = steps.findIndex((s, k) => s === v && !used.has(k));
    used.add(i);
    return i;
  });
}

describe('golden: lib engines reproduce the old page engines', () => {
  for (const [mode, distribution] of MODES) {
    describe(`${mode} -> ${distribution}`, () => {
      for (const c of cases) {
        it(c.name, () => {
          const q = 1200 / c.edo;
          const old = computeIntervalPlacements(
            c.steps,
            {
              ...defaultIntervalPlacementParams,
              ...c.params,
              edoSteps: c.edo,
              placementMode: mode,
            },
            c.bias,
            c.octaves
          );
          const byPerm = new Map(old.records.map((r) => [r.perm.join(','), r]));
          const spec = specFor(c, distribution);
          for (const perm of uniquePermutations(c.steps)) {
            const rec = byPerm.get(perm.join(','));
            const lib = placeOrdering(spec, orderOf(perm, c.steps));
            // the old engine dropped this ordering exactly when the lib cannot place it
            expect(lib === null).toBe(!rec);
            if (!rec || !lib) {
              continue;
            }
            const v = lib;
            expect(v.endpoints).toHaveLength(rec.endpoints.length);
            rec.endpoints.forEach(([lo, hi], i) => {
              expect(v.endpoints[i][0]).toBeCloseTo(lo * q, 9);
              expect(v.endpoints[i][1]).toBeCloseTo(hi * q, 9);
            });
            expect(v.cents).toHaveLength(rec.pitches.length);
            rec.pitches.forEach((p, i) => expect(v.cents[i]).toBeCloseTo(p * q, 9));
            expect(v.meta.centersCents).toHaveLength(rec.centers.length);
            v.meta.centersCents.forEach((m, i) => expect(m).toBeCloseTo(rec.centers[i] * q, 9));
          }
          // whole-run level: same pitch sets, every ordering accounted for
          const res = placeIntervals(spec);
          const libSets = new Set(
            res.voicings.map((v) => v.cents.map((x) => Math.round(x / q)).join(','))
          );
          const oldSets = new Set(old.records.map((r) => r.pitches.join(',')));
          expect(libSets).toEqual(oldSets);
          expect(res.voicings.reduce((n, v) => n + v.perms.length, 0)).toBe(old.records.length);
          expect(res.skipped).toBe(uniquePermutations(c.steps).length - old.records.length);
        });
      }
    });
  }
});

describe('golden: interval-attached odd bias', () => {
  it('equals the old (positional) behaviour whenever every interval is odd with one shared bias', () => {
    for (const bias of ['up', 'down'] as const) {
      for (const [mode, distribution] of MODES) {
        const c: Case = {
          name: 'x',
          steps: [3, 7, 9],
          bias: [bias, bias, bias],
          edo: 12,
          octaves: 3,
        };
        const old = computeIntervalPlacements(
          c.steps,
          { ...defaultIntervalPlacementParams, placementMode: mode },
          c.bias,
          3
        );
        const spec = { ...specFor(c, distribution), oddBiasSemantics: 'interval' as const };
        for (const rec of old.records) {
          const v = placeOrdering(spec, orderOf(rec.perm, c.steps))!;
          rec.pitches.forEach((p, i) => expect(v.cents[i]).toBeCloseTo(p * 100, 9));
        }
      }
    }
  });
});

describe('golden: drop parity is exercised', () => {
  // The old page drops an ordering when its engine returns null; the lib must skip exactly the same ones.
  const dropCases: Array<[PlacementMode, Distribution, number[], number]> = [
    ['v2', 'prefixSlack', [30, 20], 2],
    ['v2', 'prefixSlack', [11, 7, 16], 1],
    ['prefixDominance', 'prefixDominance', [30, 20], 2],
  ];
  for (const [mode, distribution, steps, octaves] of dropCases) {
    it(`${mode} ${steps.join(' ')} in ${octaves} oct drops orderings, same as the lib`, () => {
      const c: Case = {
        name: 'd',
        steps,
        bias: steps.map(() => 'down' as const),
        edo: 12,
        octaves,
      };
      const old = computeIntervalPlacements(
        steps,
        { ...defaultIntervalPlacementParams, placementMode: mode },
        c.bias,
        octaves
      );
      const all = uniquePermutations(steps).length;
      expect(old.records.length).toBeLessThan(all); // the old engine really drops some
      const res = placeIntervals(specFor(c, distribution));
      expect(res.skipped).toBe(all - old.records.length);
      expect(res.skipped).toBeGreaterThan(0);
    });
  }
});
