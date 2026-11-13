/**
 * The four placement engines of the old page (`src/pages/interval-placement/engine.ts`, `placementEngines.ts`,
 * `placementMath.ts`), ported as they are. Everything here works in grid steps (the old page's unit); the public API
 * converts cents to steps (`cents / stepCents`) and back, so the arithmetic, including its floating-point behaviour,
 * is the same as the old page's. Spans that are not whole steps (JI, arbitrary cents) are split without rounding.
 * Quirks of the originals are kept on purpose and listed in README.md ("Quirks of the old engines").
 */
import type { Distribution, EngineParams, OddBias } from './types';

export const DEFAULT_ENGINE_PARAMS: EngineParams = {
  anchorAlpha: 0.3,
  anchorBeta: 1.0,
  anchorRho: 0.5,
  repulseGamma: 1.0,
  repulseKappa: 0.4,
  repulseLambda: 0.1,
  repulseEta: 0.08,
  repulseIterations: 60,
  repulseAlpha: 1.0,
};

interface Bounds {
  min: number;
  max: number;
}

const EPS = 1e-9;

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** A span length counts as whole steps when within 1e-9 of an integer (callers snap such lengths). */
export function isWholeSteps(d: number): boolean {
  return Math.abs(d - Math.round(d)) < EPS;
}

/** Old `quantizedSplit` / `quantizedSplitLocal` (identical). Non-whole lengths: exact `rho * d` below the centre. */
export function quantizedSplit(
  length: number,
  rho: number,
  bias: OddBias
): { down: number; up: number } {
  const downIdeal = rho * length;
  let down: number;
  if (!isWholeSteps(length)) {
    down = downIdeal;
  } else if (length % 2 === 0) {
    down = Math.round(downIdeal);
  } else {
    down = bias === 'up' ? Math.floor(downIdeal + EPS) : Math.ceil(downIdeal - EPS);
  }
  down = Math.max(0, Math.min(length, down));
  return { down, up: length - down };
}

/**
 * Old `quantizeInterval`: floor the (float) centre, then split. Extension for non-whole-step spans (JI, cents): the
 * centre is not floored, because flooring would push the span's low end below the window by up to a step.
 */
function quantizeAt(centre: number, length: number, rho: number, bias: OddBias) {
  const A = isWholeSteps(length) ? Math.floor(centre) : centre;
  const { down, up } = quantizedSplit(length, rho, bias);
  return { low: A - down, high: A + up };
}

// ---- uniform (old v1) ----

function lowBiasSplit(length: number): [number, number] {
  if (!isWholeSteps(length)) {
    return [length / 2, length / 2];
  }
  const down = Math.floor((length + 1) / 2);
  return [down, length - down];
}

function biasedSplit(length: number, flipOdd: boolean): [number, number] {
  const [down, up] = lowBiasSplit(length);
  return isWholeSteps(length) && length % 2 === 1 && flipOdd ? [up, down] : [down, up];
}

function safeAnchorRange(L: number, lengths: number[]): [number, number] {
  const splits = lengths.map(lowBiasSplit);
  return [Math.max(...splits.map((s) => s[0])), L - Math.max(...splits.map((s) => s[1]))];
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
  // Extension: with a fractional range (JI/cents spans) the old integer increments would overshoot `amax`; space exactly.
  if (!isWholeSteps(span)) {
    return Array.from({ length: n }, (_v, i) => amin + (i * span) / gaps);
  }
  const base = Math.floor(span / gaps);
  const rem = span % gaps;
  const anchors = [amin];
  for (let i = 0; i < gaps; i++) {
    anchors.push(anchors[anchors.length - 1] + (i < rem ? base + 1 : base));
  }
  return anchors;
}

// ---- prefix slack (old v2) ----

function prefixSlackCentres(L: number, perm: number[], p: EngineParams, bias: OddBias[]) {
  const n = perm.length;
  const rho = p.anchorRho;
  const splits = perm.map((d, i) => quantizedSplit(d, rho, bias[i]));
  const amin = Math.max(...splits.map((s) => s.down));
  const amax = L - Math.max(...splits.map((s) => s.up));
  if (!Number.isFinite(amin) || !Number.isFinite(amax) || amin > amax) {
    return null;
  }
  if (n === 1) {
    return { centres: [amin], range: { min: amin, max: amax }, weights: [1], fractions: [0] };
  }
  const span = amax - amin;
  const weights = perm.map((d) => (L - d) ** p.anchorBeta);
  const totalWeight = weights.reduce((s, w) => s + w, 0) || 1;
  let prefix = 0;
  const fractions: number[] = [];
  const centres = perm.map((_d, i) => {
    const t = i / (n - 1);
    const u = prefix / totalWeight;
    const a = (1 - p.anchorAlpha) * (amin + t * span) + p.anchorAlpha * (amin + u * span);
    prefix += weights[i];
    fractions.push(u);
    return Math.min(amax, Math.max(amin, a));
  });
  return { centres, range: { min: amin, max: amax }, weights, fractions };
}

// ---- prefix dominance ----

function prefixDominanceCentres(L: number, perm: number[], p: EngineParams) {
  const n = perm.length;
  const rho = p.anchorRho;
  const amin = Math.max(...perm.map((d) => rho * d));
  const amax = Math.min(...perm.map((d) => L - (1 - rho) * d));
  if (!Number.isFinite(amin) || !Number.isFinite(amax) || amin > amax) {
    return null;
  }
  let weights = perm.map((d) => d ** p.anchorBeta);
  let totalWeight = weights.reduce((s, w) => s + w, 0);
  if (!(totalWeight > 0)) {
    weights = perm.map(() => 1);
    totalWeight = n;
  }
  const span = amax - amin;
  let prefix = 0;
  const fractions: number[] = [];
  const centres = perm.map((_d, i) => {
    const u = prefix / totalWeight;
    const a = amin + u * span;
    fractions.push(u);
    prefix += weights[i];
    return Math.min(amax, Math.max(amin, a));
  });
  return { centres, range: { min: amin, max: amax }, weights, fractions };
}

// ---- repulsion ----

function centreBounds(L: number, perm: number[], rho: number, bias: OddBias[]): Bounds[] {
  return perm.map((d, i) => {
    const cmin = rho * d;
    const cmax = L - (1 - rho) * d;
    const split = quantizedSplit(d, rho, bias[i] || 'down');
    const min = Math.max(cmin, split.down);
    const max = Math.min(cmax, L - split.up);
    return min > max ? { min: cmin, max: cmax } : { min, max };
  });
}

function neutralCentres(bounds: Bounds[]): number[] {
  const n = bounds.length;
  return bounds.map((b, i) => b.min + (n === 1 ? 0.5 : i / (n - 1)) * (b.max - b.min));
}

function repulsionCentres(L: number, perm: number[], p: EngineParams, bias: OddBias[]) {
  const n = perm.length;
  const bounds = centreBounds(L, perm, p.anchorRho, bias);
  const neutral = neutralCentres(bounds);
  const denom = Math.max(1e-9, L);
  const radii = perm.map((d) => (d / denom) ** p.repulseGamma);
  const deltas: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = p.repulseKappa * (radii[i] + radii[j]);
      deltas[i][j] = d;
      deltas[j][i] = d;
    }
  }
  const centres = neutral.slice();
  const forces = new Array(n).fill(0);
  for (let iter = 0; iter < p.repulseIterations; iter++) {
    forces.fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dist = centres[i] - centres[j];
        const v = deltas[i][j] - Math.abs(dist);
        if (v > 0) {
          const F = 2 * p.repulseLambda * v * (dist >= 0 ? 1 : -1);
          forces[i] += F;
          forces[j] -= F;
        }
      }
    }
    for (let i = 0; i < n; i++) {
      centres[i] = clamp(centres[i] + p.repulseEta * forces[i], bounds[i].min, bounds[i].max);
    }
  }
  const alpha = Number.isFinite(p.repulseAlpha) ? clamp(p.repulseAlpha, 0, 1) : 1;
  const blended = centres.map((c, i) =>
    clamp((1 - alpha) * neutral[i] + alpha * c, bounds[i].min, bounds[i].max)
  );
  let minDistance = Number.POSITIVE_INFINITY;
  let energy = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dist = Math.abs(blended[i] - blended[j]);
      minDistance = Math.min(minDistance, dist);
      const v = deltas[i][j] - dist;
      if (v > 0) {
        energy += p.repulseLambda * v * v;
      }
    }
  }
  if (!Number.isFinite(minDistance)) {
    minDistance = 0;
  }
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  bounds.forEach((b) => {
    lo = Math.min(lo, b.min);
    hi = Math.max(hi, b.max);
  });
  return {
    centres: blended,
    range: Number.isFinite(lo) ? { min: lo, max: hi } : null,
    repulsion: { minDistanceSteps: minDistance, energy },
  };
}

/** What `solveOrdering` returns, in steps above the window bottom. */
export interface OrderingSolution {
  endpoints: Array<[number, number]>;
  centres: number[];
  range: Bounds | null;
  weights?: number[];
  fractions?: number[];
  repulsion?: { minDistanceSteps: number; energy: number };
}

/**
 * Place one ordering. `perm` = span lengths in steps, `bias` = the odd bias of each span position (already normalised:
 * `'down'` unless the span is an odd whole-step length), `L` = window width in steps. Returns null when the engine finds
 * the spans do not fit (old behaviour: the ordering was dropped).
 */
export function solveOrdering(
  distribution: Distribution,
  L: number,
  perm: number[],
  bias: OddBias[],
  p: EngineParams
): OrderingSolution | null {
  if (distribution === 'uniform') {
    const [amin, amax] = safeAnchorRange(L, perm);
    const anchors = equalSpacedAnchors(amin, amax, perm.length);
    const endpoints = anchors.map((a, i): [number, number] => {
      const [down, up] = biasedSplit(perm[i], bias[i] === 'up');
      return [a - down, a + up];
    });
    return { endpoints, centres: anchors, range: { min: amin, max: amax } };
  }
  const r =
    distribution === 'prefixSlack'
      ? prefixSlackCentres(L, perm, p, bias)
      : distribution === 'prefixDominance'
        ? prefixDominanceCentres(L, perm, p)
        : repulsionCentres(L, perm, p, bias);
  if (!r) {
    return null;
  }
  const endpoints = r.centres.map((c, i): [number, number] => {
    const q = quantizeAt(c, perm[i], p.anchorRho, bias[i]);
    return [q.low, q.high];
  });
  return {
    endpoints,
    centres: r.centres,
    range: r.range,
    weights: 'weights' in r ? r.weights : undefined,
    fractions: 'fractions' in r ? r.fractions : undefined,
    repulsion: 'repulsion' in r ? r.repulsion : undefined,
  };
}
