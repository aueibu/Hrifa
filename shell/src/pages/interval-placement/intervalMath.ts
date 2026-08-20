export interface DissonanceParams {
  edoSteps: number;
  compoundReliefM: number;
  sigmaCents: number;
  ratioLambda: number;
  roughAlpha: number;
  roughPartialsK: number;
  ampPower: number;
  roughA: number;
  roughB: number;
  registerDampingK: number;
  useDamping: boolean;
  fRefHz: number;
}

const RATIO_TARGETS: Array<[number, number]> = [
  [1, 1],
  [9, 8],
  [16, 15],
  [5, 4],
  [6, 5],
  [4, 3],
  [3, 2],
  [8, 5],
  [5, 3],
  [16, 9],
  [15, 8],
  [2, 1],
  [45, 32],
];

export function pitchesFromEndpoints(endpoints: Array<[number, number]>): number[] {
  const s = new Set<number>();
  endpoints.forEach(([lo, hi]) => {
    s.add(lo);
    s.add(hi);
  });
  return Array.from(s).sort((a, b) => a - b);
}

export function inducedIntervals(pitches: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < pitches.length; i++) {
    for (let j = i + 1; j < pitches.length; j++) {
      out.push(pitches[j] - pitches[i]);
    }
  }
  return out.sort((a, b) => a - b);
}

export function intervalCounts(intervals: number[]): Array<[number, number]> {
  const counts = new Map<number, number>();
  intervals.forEach((d) => {
    counts.set(d, (counts.get(d) || 0) + 1);
  });
  return Array.from(counts.entries()).sort((a, b) => a[0] - b[0]);
}

export function octaveReducedIntervalVector(pitches: number[], N: number): number[] {
  const pcs = pitches.map((p) => ((p % N) + N) % N).sort((a, b) => a - b);
  if (pcs.length < 2) {
    return Array(Math.floor(N / 2)).fill(0);
  }
  const maxIc = Math.floor(N / 2);
  const vec = Array(maxIc).fill(0);
  for (let i = 0; i < pcs.length; i++) {
    for (let j = i + 1; j < pcs.length; j++) {
      const d = (pcs[j] - pcs[i]) % N;
      const ic = Math.min(d, N - d);
      if (ic > 0 && ic <= maxIc) {
        vec[ic - 1] += 1;
      }
    }
  }
  return vec;
}

function normalOrder(pcs: number[], N: number): number[] {
  const unique = Array.from(new Set(pcs.map((p) => ((p % N) + N) % N))).sort((a, b) => a - b);
  const n = unique.length;
  if (n <= 1) {
    return unique;
  }
  let best: number[] | null = null;
  let bestSpan: number | null = null;
  for (let i = 0; i < n; i++) {
    const rotated = unique.slice(i).concat(unique.slice(0, i).map((p) => p + N));
    const span = rotated[rotated.length - 1] - rotated[0];
    if (best === null || bestSpan === null || span < bestSpan) {
      best = rotated;
      bestSpan = span;
    } else if (span === bestSpan) {
      for (let k = n - 1; k > 0; k--) {
        const intBest = best[k] - best[0];
        const intRot = rotated[k] - rotated[0];
        if (intRot < intBest) {
          best = rotated;
          break;
        }
        if (intRot > intBest) {
          break;
        }
      }
    }
  }
  return best as number[];
}

function compareArrays(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] < b[i]) {
      return -1;
    }
    if (a[i] > b[i]) {
      return 1;
    }
  }
  if (a.length < b.length) {
    return -1;
  }
  if (a.length > b.length) {
    return 1;
  }
  return 0;
}

export function primeFormRahnForte(pitches: number[], N: number): number[] {
  const pcs = Array.from(new Set(pitches.map((p) => ((p % N) + N) % N))).sort((a, b) => a - b);
  if (pcs.length === 0) {
    return [];
  }
  if (pcs.length === 1) {
    return [0];
  }
  const norm = normalOrder(pcs, N);
  const normT = norm.map((p) => (p - norm[0] + N) % N);
  const inv = pcs.map((p) => (-p + N) % N);
  const invNorm = normalOrder(inv, N);
  const invT = invNorm.map((p) => (p - invNorm[0] + N) % N);
  return compareArrays(normT, invT) <= 0 ? normT : invT;
}

function ratioCost(
  cents: number,
  sigma: number,
  ratioLambda: number
): { cost: number; ratio: [number, number]; height: number } {
  let best = Number.POSITIVE_INFINITY;
  let bestRatio: [number, number] = [1, 1];
  let bestHeight = 0;
  for (const [n, d] of RATIO_TARGETS) {
    const target = 1200 * Math.log2(n / d);
    const height = Math.log2(n * d);
    const cost = (Math.abs(cents - target) / sigma) ** 2 + ratioLambda * height;
    if (cost < best) {
      best = cost;
      bestRatio = [n, d];
      bestHeight = height;
    }
  }
  return { cost: best, ratio: bestRatio, height: bestHeight };
}

function registerDamping(lo: number, L: number, k: number, useDamping: boolean): number {
  if (useDamping) {
    return Math.exp(-k * (lo / L));
  }
  return 1;
}

function compoundRelief(dSteps: number, N: number, m: number): number {
  return Math.exp(-m * Math.floor(dSteps / N));
}

function f0FromLo(lo: number, N: number, fRefHz: number): number {
  return fRefHz * 2 ** (lo / N);
}

const roughCache = new Map<string, number>();

function roughnessKharm(
  cents: number,
  f0Hz: number,
  K: number,
  ampPower: number,
  a: number,
  b: number
): number {
  const key = `${cents.toFixed(3)}|${f0Hz.toFixed(3)}|${K}|${ampPower}|${a}|${b}`;
  const cached = roughCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const r = 2 ** (cents / 1200);
  let total = 0;
  for (let i = 1; i <= K; i++) {
    const fi = i * f0Hz;
    const ai = 1 / i ** ampPower;
    for (let j = 1; j <= K; j++) {
      const gj = j * (r * f0Hz);
      const aj = 1 / j ** ampPower;
      const df = Math.abs(fi - gj);
      const fbar = 0.5 * (fi + gj);
      const bandwidth = 1.72 * fbar ** 0.65;
      const x = bandwidth > 0 ? df / bandwidth : 0;
      const phi = Math.exp(-a * x) - Math.exp(-b * x);
      total += ai * aj * phi;
    }
  }
  roughCache.set(key, total);
  return total;
}

function median(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return 0.5 * (sorted[mid - 1] + sorted[mid]);
  }
  return sorted[mid];
}

export function calibrateAlpha(params: DissonanceParams, gamma: number): number {
  const L = params.edoSteps * 3;
  const lo = Math.floor(L / 4);
  const f0Hz = f0FromLo(lo, params.edoSteps, params.fRefHz);
  const ratioVals: number[] = [];
  const roughVals: number[] = [];
  for (let dMod = 1; dMod < params.edoSteps; dMod++) {
    const cents = 1200 * (dMod / params.edoSteps);
    const { cost } = ratioCost(cents, params.sigmaCents, params.ratioLambda);
    const rough = roughnessKharm(
      cents,
      f0Hz,
      params.roughPartialsK,
      params.ampPower,
      params.roughA,
      params.roughB
    );
    ratioVals.push(cost);
    roughVals.push(rough);
  }
  const medRatio = median(ratioVals);
  const medRough = median(roughVals);
  if (medRough === 0) {
    return 0;
  }
  return gamma * (medRatio / medRough);
}

export function dyadPenaltyDetails(
  lo: number,
  hi: number,
  params: DissonanceParams,
  L: number
): { g: number; dSteps: number } {
  const dSteps = hi - lo;
  const dMod = dSteps % params.edoSteps;
  const cents = 1200 * (dMod / params.edoSteps);
  const { cost } = ratioCost(cents, params.sigmaCents, params.ratioLambda);
  const f0Hz = f0FromLo(lo, params.edoSteps, params.fRefHz);
  const rough = roughnessKharm(
    cents,
    f0Hz,
    params.roughPartialsK,
    params.ampPower,
    params.roughA,
    params.roughB
  );
  const r = registerDamping(lo, L, params.registerDampingK, params.useDamping);
  const c = compoundRelief(dSteps, params.edoSteps, params.compoundReliefM);
  const g = (cost + params.roughAlpha * rough) * r * c;
  return { g, dSteps };
}

function dyadPenalty(lo: number, hi: number, params: DissonanceParams, L: number): number {
  return dyadPenaltyDetails(lo, hi, params, L).g;
}

export function computeReferenceG(params: DissonanceParams): number {
  const LRef = 36;
  const loRef = Math.floor(LRef / 2);
  const hiRef = loRef + 1;
  return dyadPenaltyDetails(loRef, hiRef, params, LRef).g;
}

export function sonorityPenalty(pitches: number[], params: DissonanceParams, L: number): number {
  let total = 0;
  for (let i = 0; i < pitches.length; i++) {
    for (let j = i + 1; j < pitches.length; j++) {
      total += dyadPenalty(pitches[i], pitches[j], params, L);
    }
  }
  return total;
}
