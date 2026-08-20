import {
  accumulateRepulsionForces,
  type Bounds,
  centerBoundsForPerm,
  clamp,
  neutralCentersFromBounds,
  projectedPairwiseSolve,
  repulsionDeltasForPerm,
  repulsionDiagnostics,
  type RepulsionDiagnostics,
} from './placementMath';

export interface PlacementParams {
  anchorAlpha: number;
  anchorBeta: number;
  anchorRho: number;
  repulseGamma: number;
  repulseKappa: number;
  repulseLambda: number;
  repulseEta: number;
  repulseIterations: number;
  repulseAlpha: number;
}

export interface DebugFlags {
  showBounds: boolean;
  showSplits: boolean;
  showEndpointsFloat: boolean;
  showWeights: boolean;
}

export interface PlacementMeta {
  slack?: number[];
  weights?: number[];
  prefixSums?: number[];
  prefixFractions?: number[];
  totalWeight?: number;
}

export interface PlacementResult {
  engineId: string;
  centers: number[];
  anchors: number[] | null;
  splits: Array<{ down: number; up: number }> | null;
  anchorRange: Bounds | null;
  bounds: Bounds[] | null;
  debugFlags: DebugFlags;
  meta?: PlacementMeta;
  diagnostics?: RepulsionDiagnostics;
}

export interface PlacementEngine {
  id: string;
  label: string;
  solveCenters(L: number, perm: number[], params: PlacementParams): PlacementResult | null;
}

export interface PrefixDominanceAnchorData {
  anchorFloats: number[];
  weights: number[];
  prefixSums: number[];
  prefixFractions: number[];
  totalWeight: number;
  amin: number;
  amax: number;
}

export function computePrefixDominanceAnchors(
  L: number,
  perm: number[],
  params: PlacementParams
): PrefixDominanceAnchorData | null {
  const n = perm.length;
  const dominanceBeta = params.anchorBeta;
  const dominanceRho = params.anchorRho;
  const amin = Math.max(...perm.map((d) => dominanceRho * d));
  const amax = Math.min(...perm.map((d) => L - (1 - dominanceRho) * d));
  if (!Number.isFinite(amin) || !Number.isFinite(amax) || amin > amax) {
    return null;
  }
  if (n === 0) {
    return {
      anchorFloats: [],
      weights: [],
      prefixSums: [],
      prefixFractions: [],
      totalWeight: 0,
      amin,
      amax,
    };
  }
  let weights = perm.map((d) => d ** dominanceBeta);
  let totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (!(totalWeight > 0)) {
    weights = perm.map(() => 1);
    totalWeight = n;
  }
  const span = amax - amin;
  let prefix = 0;
  const prefixSums: number[] = [];
  const prefixFractions: number[] = [];
  const anchorFloats = perm.map((_d, idx) => {
    const u = prefix / totalWeight;
    const a = amin + u * span;
    prefixSums.push(prefix);
    prefixFractions.push(u);
    prefix += weights[idx];
    return Math.min(amax, Math.max(amin, a));
  });
  return { anchorFloats, weights, prefixSums, prefixFractions, totalWeight, amin, amax };
}

export interface PrefixSlackAnchorData {
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

export function createPrefixSlackEngine(
  anchorsForPerm: (
    L: number,
    perm: number[],
    params: PlacementParams
  ) => PrefixSlackAnchorData | null
): PlacementEngine {
  return {
    id: 'v2',
    label: 'prefix-slack',
    solveCenters(L, perm, params) {
      const anchorData = anchorsForPerm(L, perm, params);
      if (!anchorData) {
        return null;
      }
      return {
        engineId: 'v2',
        centers: anchorData.anchorFloats.slice(),
        anchors: anchorData.anchors.slice(),
        splits: anchorData.splits,
        anchorRange: { min: anchorData.amin, max: anchorData.amax },
        bounds: anchorData.anchorFloats.map(() => ({ min: anchorData.amin, max: anchorData.amax })),
        debugFlags: {
          showBounds: true,
          showSplits: true,
          showEndpointsFloat: true,
          showWeights: true,
        },
        meta: {
          slack: anchorData.slack,
          weights: anchorData.weights,
          prefixSums: anchorData.prefixSums,
          prefixFractions: anchorData.prefixFractions,
          totalWeight: anchorData.totalWeight,
        },
      };
    },
  };
}

export function createPrefixDominanceEngine(): PlacementEngine {
  return {
    id: 'prefixDominance',
    label: 'prefix-dominance',
    solveCenters(L, perm, params) {
      const anchorData = computePrefixDominanceAnchors(L, perm, params);
      if (!anchorData) {
        return null;
      }
      return {
        engineId: 'prefixDominance',
        centers: anchorData.anchorFloats.slice(),
        anchors: null,
        splits: null,
        anchorRange: { min: anchorData.amin, max: anchorData.amax },
        bounds: anchorData.anchorFloats.map(() => ({ min: anchorData.amin, max: anchorData.amax })),
        debugFlags: {
          showBounds: true,
          showSplits: false,
          showEndpointsFloat: true,
          showWeights: true,
        },
        meta: {
          weights: anchorData.weights,
          prefixSums: anchorData.prefixSums,
          prefixFractions: anchorData.prefixFractions,
          totalWeight: anchorData.totalWeight,
        },
      };
    },
  };
}

export function createRepulsionCentersEngine(oddBias: Array<'up' | 'down'>): PlacementEngine {
  return {
    id: 'repulse',
    label: 'repulsion-centers',
    solveCenters(L, perm, params) {
      const rho = params.anchorRho;
      const bounds = centerBoundsForPerm(L, perm, rho, oddBias);
      const neutral = neutralCentersFromBounds(bounds);
      const { deltas } = repulsionDeltasForPerm(perm, params.repulseGamma, params.repulseKappa, L);
      const repelled = projectedPairwiseSolve(
        neutral,
        bounds,
        params.repulseIterations,
        params.repulseEta,
        (centers, forces) =>
          accumulateRepulsionForces(centers, forces, deltas, params.repulseLambda)
      );
      const alpha = Number.isFinite(params.repulseAlpha) ? clamp(params.repulseAlpha, 0, 1) : 1;
      const blended = repelled.map((c, idx) => {
        const mix = (1 - alpha) * neutral[idx] + alpha * c;
        return clamp(mix, bounds[idx].min, bounds[idx].max);
      });
      return {
        engineId: 'repulse',
        centers: blended,
        anchors: null,
        splits: null,
        anchorRange: null,
        bounds,
        debugFlags: {
          showBounds: true,
          showSplits: true,
          showEndpointsFloat: true,
          showWeights: false,
        },
        diagnostics: repulsionDiagnostics(blended, deltas, params.repulseLambda),
      };
    },
  };
}
