import {
  calibrateAlpha,
  type DissonanceParams,
  inducedIntervals,
  intervalCounts,
  octaveReducedIntervalVector,
  pitchesFromEndpoints,
  primeFormRahnForte,
  sonorityPenalty,
} from './intervalMath';
import {
  createPrefixDominanceEngine,
  createPrefixSlackEngine,
  createRepulsionCentersEngine,
  type DebugFlags,
  type PlacementEngine,
  type PlacementParams,
  type PlacementResult,
} from './placementEngines';
import { anchorRangeFromBounds, type Bounds, minPairwiseDistance } from './placementMath';
import { scoreVoicingV2, type VoicingScoreV2 } from './psychoacousticsV2';

export type OddBiasDirection = 'up' | 'down';
export type PlacementMode = 'v1' | 'v2' | 'prefixDominance' | 'repulse';

export interface IntervalPlacementParams extends DissonanceParams, PlacementParams {
  placementMode: PlacementMode;
}

export const defaultIntervalPlacementParams: IntervalPlacementParams = {
  edoSteps: 12,
  compoundReliefM: 0.55,
  sigmaCents: 20.0,
  ratioLambda: 0.2,
  roughAlpha: 0.0,
  roughPartialsK: 12,
  ampPower: 1.0,
  roughA: 3.5,
  roughB: 5.75,
  registerDampingK: 1.6,
  useDamping: true,
  fRefHz: 55.0,
  anchorAlpha: 0.3,
  anchorBeta: 1.0,
  anchorRho: 0.5,
  repulseGamma: 1.0,
  repulseKappa: 0.4,
  repulseLambda: 0.1,
  repulseEta: 0.08,
  repulseIterations: 60,
  repulseAlpha: 1.0,
  placementMode: 'v2',
};

export interface PlacementRecord {
  perm: number[];
  endpoints: Array<[number, number]>;
  endpointsFloat: Array<[number, number]>;
  centers: number[];
  anchors: number[] | null;
  anchorFloats: number[];
  anchorRange: Bounds | null;
  splits: Array<{ down: number; up: number }> | null;
  slack: number[] | null;
  weights: number[] | null;
  prefixSums: number[] | null;
  prefixFractions: number[] | null;
  totalWeight: number | null;
  centerBounds: Bounds[] | null;
  centerDiagnostics: { minDistance: number; energy: number | null; violations: unknown };
  debugFlags: DebugFlags | null;
  engine: string;
  pitches: number[];
  induced: number[];
  inducedCounts: Array<[number, number]>;
  total: number;
  perPair: number;
  /** Draft alternative scoring — see `psychoacousticsV2.ts`. Computed alongside v1 for comparison; not used for ranking (see `computeForWindow`'s sort, still by `perPair`). */
  scoreV2: VoicingScoreV2;
  iv: number[];
  primeForm: number[];
}

function lowBiasSplit(length: number): [number, number] {
  const down = Math.floor((length + 1) / 2);
  const up = length - down;
  return [down, up];
}

function biasedSplit(length: number, flipOdd: boolean): [number, number] {
  const [down, up] = lowBiasSplit(length);
  if (length % 2 === 1 && flipOdd) {
    return [up, down];
  }
  return [down, up];
}

function safeAnchorRange(L: number, intervals: number[]): [number, number] {
  const downs: number[] = [];
  const ups: number[] = [];
  intervals.forEach((l) => {
    const [down, up] = lowBiasSplit(l);
    downs.push(down);
    ups.push(up);
  });
  const amin = Math.max(...downs);
  const amax = L - Math.max(...ups);
  return [amin, amax];
}

function equalSpacedAnchors(amin: number, amax: number, n: number): number[] {
  if (n <= 0) {
    return [];
  }
  if (n === 1) {
    return [amin];
  }
  const span = amax - amin;
  const gaps = n - 1;
  const base = Math.floor(span / gaps);
  const rem = span % gaps;
  const increments: number[] = [];
  for (let i = 0; i < gaps; i++) {
    increments.push(i < rem ? base + 1 : base);
  }
  const anchors = [amin];
  increments.forEach((inc) => anchors.push(anchors[anchors.length - 1] + inc));
  return anchors;
}

function endpointsForPerm(
  anchors: number[],
  perm: number[],
  oddBias: OddBiasDirection[]
): Array<[number, number]> {
  return anchors.map((a, idx) => {
    const l = perm[idx];
    const flipOdd = oddBias[idx] === 'up';
    const [down, up] = biasedSplit(l, flipOdd);
    return [a - down, a + up];
  });
}

function quantizedSplitLocal(length: number, rho: number, oddBias: OddBiasDirection) {
  const eps = 1e-9;
  const downIdeal = rho * length;
  let down: number;
  if (length % 2 === 0) {
    down = Math.round(downIdeal);
  } else {
    down = oddBias === 'up' ? Math.floor(downIdeal + eps) : Math.ceil(downIdeal - eps);
  }
  down = Math.max(0, Math.min(length, down));
  return { down, up: length - down };
}

export function quantizeInterval(
  anchor: number,
  length: number,
  rho: number,
  oddBias: OddBiasDirection
): { A: number; low: number; high: number; down: number; up: number } {
  const A = Math.floor(anchor);
  const { down, up } = quantizedSplitLocal(length, rho, oddBias);
  const low = A - down;
  const high = A + up;
  return { A, low, high, down, up };
}

interface AnchorsForPermResult {
  anchorFloats: number[];
  anchors: number[];
  splits: Array<{ down: number; up: number }>;
  slack: number[];
  weights: number[];
  prefixSums: number[];
  prefixFractions: number[];
  totalWeight: number;
  amin: number;
  amax: number;
}

export function anchorsForPerm(
  L: number,
  perm: number[],
  params: IntervalPlacementParams,
  oddBias: OddBiasDirection[]
): AnchorsForPermResult | null {
  const n = perm.length;
  const rho = params.anchorRho;
  const alpha = params.anchorAlpha;
  const beta = params.anchorBeta;
  const splits = perm.map((d, idx) => quantizedSplitLocal(d, rho, oddBias[idx]));
  const amin = Math.max(...splits.map((s) => s.down));
  const amax = L - Math.max(...splits.map((s) => s.up));
  if (!Number.isFinite(amin) || !Number.isFinite(amax) || amin > amax) {
    return null;
  }
  if (n === 1) {
    const a = amin;
    return {
      anchorFloats: [a],
      anchors: [Math.floor(a)],
      splits,
      slack: [L - perm[0]],
      weights: [1],
      prefixSums: [0],
      prefixFractions: [0],
      totalWeight: 1,
      amin,
      amax,
    };
  }
  const span = amax - amin;
  const slack = perm.map((d) => L - d);
  const weights = slack.map((s) => s ** beta);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1;
  let prefix = 0;
  const eps = 1e-9;
  const prefixFractions: number[] = [];
  const prefixSums: number[] = [];
  const anchorFloats = perm.map((_d, idx) => {
    const t = idx / (n - 1);
    const u = prefix / totalWeight;
    const a0 = amin + t * span;
    const a1 = amin + u * span;
    const a = (1 - alpha) * a0 + alpha * a1;
    prefix += weights[idx];
    prefixSums.push(prefix - weights[idx]);
    prefixFractions.push(u);
    return Math.min(amax, Math.max(amin, a));
  });
  const anchors = anchorFloats.map((a) => Math.max(amin, Math.min(amax, Math.floor(a + eps))));
  return {
    anchorFloats,
    anchors,
    splits,
    slack,
    weights,
    prefixSums,
    prefixFractions,
    totalWeight,
    amin,
    amax,
  };
}

function createPlacementEngines(oddBias: OddBiasDirection[]): Record<string, PlacementEngine> {
  return {
    prefixSlack: createPrefixSlackEngine((L, perm, params) =>
      anchorsForPerm(L, perm, params as IntervalPlacementParams, oddBias)
    ),
    prefixDominance: createPrefixDominanceEngine(),
    repulsion: createRepulsionCentersEngine(oddBias),
  };
}

function resolvePlacementEngine(
  mode: PlacementMode,
  engines: Record<string, PlacementEngine>
): PlacementEngine {
  if (mode === 'repulse') {
    return engines.repulsion;
  }
  if (mode === 'prefixDominance') {
    return engines.prefixDominance;
  }
  return engines.prefixSlack;
}

export function placementEngineLabel(id: string | null | undefined): string {
  if (id === 'v1') {
    return 'uniform-centers';
  }
  if (id === 'repulse') {
    return 'repulsion-centers';
  }
  if (id === 'prefixDominance') {
    return 'prefix-dominance';
  }
  if (id === 'v2') {
    return 'prefix-slack';
  }
  return id || '';
}

export function uniquePermutations(values: number[]): number[][] {
  const counts = new Map<number, number>();
  values.forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
  const uniq = Array.from(counts.keys()).sort((a, b) => a - b);
  const total = values.length;
  const results: number[][] = [];
  const current: number[] = [];

  function backtrack() {
    if (current.length === total) {
      results.push(current.slice());
      return;
    }
    for (const v of uniq) {
      const c = counts.get(v) || 0;
      if (c === 0) {
        continue;
      }
      counts.set(v, c - 1);
      current.push(v);
      backtrack();
      current.pop();
      counts.set(v, c);
    }
  }

  backtrack();
  return results;
}

export function normalizeOddBias(
  intervals: number[],
  oddBias: OddBiasDirection[]
): OddBiasDirection[] {
  const fallback: OddBiasDirection[] = intervals.map(() => 'down');
  if (!Array.isArray(oddBias)) {
    return fallback;
  }
  if (oddBias.length !== intervals.length) {
    return fallback;
  }
  return oddBias.map((bias, idx) => (intervals[idx] % 2 === 1 ? bias : 'down'));
}

function computeForWindow(
  intervals: number[],
  params: IntervalPlacementParams,
  oddBias: OddBiasDirection[],
  windowOctaves: number
): { L: number; records: PlacementRecord[] } {
  const L = windowOctaves * params.edoSteps;
  const mode = params.placementMode;
  const isLegacy = mode === 'v1';
  const placementEngines = createPlacementEngines(oddBias);
  const engine = isLegacy ? null : resolvePlacementEngine(mode, placementEngines);
  let legacyAnchors: number[] | null = null;
  let legacyRange: Bounds | null = null;
  if (isLegacy) {
    const [amin, amax] = safeAnchorRange(L, intervals);
    legacyAnchors = equalSpacedAnchors(amin, amax, intervals.length);
    legacyRange = { min: amin, max: amax };
  }
  const perms = uniquePermutations(intervals);
  const records = perms
    .map((perm): PlacementRecord | null => {
      let endpoints: Array<[number, number]>;
      let endpointsFloat: Array<[number, number]>;
      let anchors: number[] | null = null;
      let anchorFloats: number[];
      let anchorRange: Bounds | null = null;
      let splits: Array<{ down: number; up: number }> | null = null;
      let slack: number[] | null = null;
      let weights: number[] | null = null;
      let prefixSums: number[] | null = null;
      let prefixFractions: number[] | null = null;
      let totalWeight: number | null = null;
      let centerBounds: Bounds[] | null = null;
      let centerDiagnostics: {
        minDistance: number;
        energy: number | null;
        violations: unknown;
      } | null = null;
      let debugFlags: DebugFlags | null = null;
      let engineId: string = isLegacy ? 'v1' : (engine as PlacementEngine).id;

      if (isLegacy) {
        endpoints = endpointsForPerm(legacyAnchors as number[], perm, oddBias);
        endpointsFloat = endpoints.map(([lo, hi]) => [lo, hi]);
        const splitsLegacy = perm.map((d, idx) => {
          const flipOdd = oddBias[idx] === 'up';
          const [down, up] = biasedSplit(d, flipOdd);
          return { down, up };
        });
        anchors = legacyAnchors;
        anchorFloats = (legacyAnchors as number[]).map((a) => a);
        debugFlags = {
          showBounds: true,
          showSplits: true,
          showEndpointsFloat: false,
          showWeights: false,
        };
        splits = splitsLegacy;
        anchorRange = legacyRange;
        if (legacyRange) {
          centerBounds = perm.map(() => ({ min: legacyRange!.min, max: legacyRange!.max }));
        }
      } else {
        const placement: PlacementResult | null = (engine as PlacementEngine).solveCenters(
          L,
          perm,
          params
        );
        if (!placement) {
          return null;
        }
        engineId = placement.engineId;
        anchorFloats = placement.centers;
        centerBounds = placement.bounds || null;
        debugFlags = placement.debugFlags || null;
        const rho = params.anchorRho;
        endpointsFloat = anchorFloats.map((c, idx) => {
          const lowStar = c - rho * perm[idx];
          const highStar = c + (1 - rho) * perm[idx];
          return [lowStar, highStar];
        });
        const anchorsList: number[] = [];
        const splitsList: Array<{ down: number; up: number }> = [];
        endpoints = anchorFloats.map((c, idx) => {
          const d = perm[idx];
          const bias = oddBias[idx];
          const { A, low, high, down, up } = quantizeInterval(c, d, rho, bias);
          anchorsList.push(A);
          splitsList.push({ down, up });
          return [low, high];
        });
        if (placement.engineId === 'v2') {
          anchors = placement.anchors;
          splits = placement.splits;
          anchorRange = placement.anchorRange;
        } else {
          anchors = anchorsList;
          splits = splitsList;
          anchorRange = placement.anchorRange;
        }
        if (placement.meta) {
          slack = placement.meta.slack ?? slack;
          weights = placement.meta.weights ?? weights;
          prefixSums = placement.meta.prefixSums ?? prefixSums;
          prefixFractions = placement.meta.prefixFractions ?? prefixFractions;
          totalWeight = placement.meta.totalWeight ?? totalWeight;
        }
        if (!anchorRange && centerBounds) {
          anchorRange = anchorRangeFromBounds(centerBounds);
        }
        centerDiagnostics = placement.diagnostics
          ? {
              minDistance: placement.diagnostics.minDistance,
              energy: placement.diagnostics.energy,
              violations: placement.diagnostics.violations,
            }
          : null;
      }

      const centersForDiag = anchorFloats || anchors || [];
      if (!centerDiagnostics) {
        centerDiagnostics = {
          minDistance: minPairwiseDistance(centersForDiag),
          energy: null,
          violations: null,
        };
      } else if (!Number.isFinite(centerDiagnostics.minDistance)) {
        centerDiagnostics.minDistance = minPairwiseDistance(centersForDiag);
      }

      const pitches = pitchesFromEndpoints(endpoints);
      const induced = inducedIntervals(pitches);
      const total = sonorityPenalty(pitches, params, L);
      const pairCount = (pitches.length * (pitches.length - 1)) / 2;

      return {
        perm,
        endpoints,
        endpointsFloat,
        centers: anchorFloats,
        anchors,
        anchorFloats,
        anchorRange,
        splits,
        slack,
        weights,
        prefixSums,
        prefixFractions,
        totalWeight,
        centerBounds,
        centerDiagnostics,
        debugFlags,
        engine: engineId,
        pitches,
        induced,
        inducedCounts: intervalCounts(induced),
        total,
        perPair: pairCount ? total / pairCount : 0,
        scoreV2: scoreVoicingV2(pitches, params),
        iv: octaveReducedIntervalVector(pitches, params.edoSteps),
        primeForm: primeFormRahnForte(pitches, params.edoSteps),
      };
    })
    .filter((r): r is PlacementRecord => r !== null);
  records.sort((a, b) => a.perPair - b.perPair);
  return { L, records };
}

export interface ComputeResult {
  L: number;
  records: PlacementRecord[];
  oddBias: OddBiasDirection[];
}

export function getBaseMidi(baseNote: number, baseOctave: number): number {
  return (baseOctave + 1) * 12 + baseNote;
}

export function computeIntervalPlacements(
  intervals: number[],
  params: IntervalPlacementParams,
  rawOddBias: OddBiasDirection[],
  windowOctaves: number
): ComputeResult {
  const calibratedParams: IntervalPlacementParams = {
    ...params,
    useDamping: params.useDamping !== false,
    roughAlpha: calibrateAlpha(params, 0.5),
  };
  const oddBias = normalizeOddBias(intervals, rawOddBias);
  const { L, records } = computeForWindow(intervals, calibratedParams, oddBias, windowOctaves);
  return { L, records, oddBias };
}
