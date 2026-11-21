import { checkConstraints } from './constraints';
import { DEFAULT_ENGINE_PARAMS, isWholeSteps, solveOrdering } from './engines';
/** `placeIntervals`, its chunked iterator, ordering enumeration, dedupe. Pure: no Worker code, just a generator a worker can drive. */
import { centsKey, computeMeasures } from './measures';
import type {
  ChunkOptions,
  Collision,
  EngineParams,
  FilteredCounts,
  NotePair,
  OddBias,
  OrderingCounts,
  OrderingRecord,
  PlacedVoicing,
  PlacementChunk,
  PlacementResult,
  PlacementSpec,
} from './types';

export const DEFAULT_ORDERING_CAP = 5040;
export const DEFAULT_CHUNK_MS = 16;

/** `steps * 1200 / edo`. */
export function stepsToCents(steps: number, edo: number): number {
  return (steps * 1200) / edo;
}

interface Item {
  cents: number;
  steps: number;
  bias: OddBias;
  essential: boolean;
}

interface Prepared {
  q: number;
  L: number;
  bottomHz: number;
  items: Item[];
  /** `kinds[k]` = indices of the (interchangeable) items of kind k. */
  kinds: number[][];
  params: EngineParams;
  spec: PlacementSpec;
  positional: boolean;
  cap: number;
  totalOrderings: bigint;
}

const DISTRIBUTIONS = ['uniform', 'prefixSlack', 'prefixDominance', 'repulsion'];

/** Exact number of distinct orderings (the multinomial `n! / prod(k_i!)`, as a product of binomials). */
export function countOrderings(groupSizes: readonly number[]): bigint {
  let total = 1n;
  let placed = 0;
  for (const k of groupSizes) {
    placed += k;
    // C(placed, k), computed incrementally so every intermediate is an integer
    let c = 1n;
    for (let i = 1; i <= k; i++) {
      c = (c * BigInt(placed - k + i)) / BigInt(i);
    }
    total *= c;
  }
  return total;
}

function validate(spec: PlacementSpec): void {
  if (!DISTRIBUTIONS.includes(spec.distribution)) {
    throw new RangeError(`unknown distribution: ${String(spec.distribution)}`);
  }
  for (const [k, v] of Object.entries(spec.params ?? {})) {
    if (!(k in DEFAULT_ENGINE_PARAMS)) {
      throw new RangeError(`unknown engine parameter: ${k}`);
    }
    if (v !== undefined && !Number.isFinite(v)) {
      throw new RangeError(`engine parameter ${k} must be a finite number`);
    }
  }
  if ((spec.params?.repulseIterations ?? 0) < 0) {
    throw new RangeError('repulseIterations must be >= 0');
  }
  for (const list of [spec.constraints?.mustHave, spec.constraints?.mustNotHave]) {
    for (const c of list ?? []) {
      if (!Number.isFinite(c.cents)) {
        throw new RangeError('constraint cents must be finite');
      }
      if (
        c.toleranceCents !== undefined &&
        !(c.toleranceCents >= 0 && Number.isFinite(c.toleranceCents))
      ) {
        throw new RangeError('constraint toleranceCents must be a finite number >= 0');
      }
    }
  }
}

function prepare(spec: PlacementSpec): Prepared {
  validate(spec);
  const q = spec.stepCents ?? 100;
  if (!(q > 0) || !Number.isFinite(q)) {
    throw new RangeError('stepCents must be > 0');
  }
  if (!spec.intervals?.length) {
    throw new RangeError('placeIntervals: no intervals');
  }
  const w = spec.window;
  if (!w || !(w.bottomHz > 0) || !Number.isFinite(w.bottomHz)) {
    throw new RangeError('window.bottomHz must be a positive frequency');
  }
  if ((w.widthSteps === undefined) === (w.widthCents === undefined)) {
    throw new RangeError('window: give exactly one of widthSteps / widthCents');
  }
  const widthSteps = w.widthSteps ?? (w.widthCents as number) / q;
  if (!(widthSteps > 0) || !Number.isFinite(widthSteps)) {
    throw new RangeError('window width must be > 0');
  }
  const cap = spec.cap ?? DEFAULT_ORDERING_CAP;
  if (!(cap >= 0)) {
    throw new RangeError('cap must be >= 0');
  }
  const positional = spec.oddBiasSemantics === 'position';
  const items: Item[] = spec.intervals.map((iv) => {
    if (!(iv.cents > 0) || !Number.isFinite(iv.cents)) {
      throw new RangeError('interval cents must be > 0');
    }
    let steps = iv.cents / q;
    if (isWholeSteps(steps)) {
      steps = Math.round(steps);
    }
    const bias: OddBias = isWholeSteps(steps) && steps % 2 === 1 ? (iv.oddBias ?? 'down') : 'down';
    return { cents: iv.cents, steps, bias, essential: iv.essential !== false };
  });
  // A window that is not a whole number of steps is snapped down to whole steps when every span is whole, so that
  // the grid engines only produce grid notes; with a non-whole span it is kept exact.
  const L = isWholeSteps(widthSteps)
    ? Math.round(widthSteps)
    : items.every((it) => isWholeSteps(it.steps))
      ? Math.floor(widthSteps)
      : widthSteps;
  if (!(L > 0)) {
    throw new RangeError('window is narrower than one step');
  }
  // Group interchangeable items. Positional mode: same size only (old behaviour).
  const groups = new Map<string, number[]>();
  items.forEach((it, i) => {
    const key = positional ? `${it.steps}` : `${it.steps}|${it.bias}|${it.essential}`;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });
  const kinds = [...groups.entries()]
    .sort((a, b) => items[a[1][0]].steps - items[b[1][0]].steps || (a[0] < b[0] ? -1 : 1))
    .map(([, idx]) => idx);
  const totalOrderings = countOrderings(kinds.map((k) => k.length));
  return {
    q,
    L,
    bottomHz: w.bottomHz,
    items,
    kinds,
    params: { ...DEFAULT_ENGINE_PARAMS, ...spec.params },
    spec,
    positional,
    cap,
    totalOrderings,
  };
}

/** Lazily yield every distinct ordering as a list of item indices (kinds ascending, lexicographic, like the old page). */
function* orderings(pr: Prepared): Generator<number[]> {
  const counts = pr.kinds.map((k) => k.length);
  const used = pr.kinds.map(() => 0);
  const total = pr.items.length;
  const cur: number[] = [];
  function* rec(): Generator<number[]> {
    if (cur.length === total) {
      yield cur.slice();
      return;
    }
    for (let k = 0; k < counts.length; k++) {
      if (used[k] >= counts[k]) {
        continue;
      }
      cur.push(pr.kinds[k][used[k]]);
      used[k]++;
      yield* rec();
      used[k]--;
      cur.pop();
    }
  }
  yield* rec();
}

function biasFor(pr: Prepared, order: readonly number[]): OddBias[] {
  return order.map((itemIdx, pos) => (pr.positional ? pr.items[pos].bias : pr.items[itemIdx].bias));
}

function buildVoicing(pr: Prepared, order: readonly number[]): PlacedVoicing | null {
  const perm = order.map((i) => pr.items[i].steps);
  const sol = solveOrdering(pr.spec.distribution, pr.L, perm, biasFor(pr, order), pr.params);
  if (!sol) {
    return null;
  }
  const q = pr.q;
  const endpoints = sol.endpoints.map(([lo, hi]): [number, number] => [lo * q, hi * q]);
  const byKey = new Map<number, number>();
  endpoints.forEach(([lo, hi]) => {
    for (const c of [lo, hi]) {
      if (!byKey.has(centsKey(c))) {
        byKey.set(centsKey(c), c);
      }
    }
  });
  const keys = [...byKey.keys()].sort((a, b) => a - b);
  const cents = keys.map((k) => byKey.get(k) as number);
  const index = new Map(keys.map((k, i) => [k, i]));
  const essentialPairs: NotePair[] = [];
  const seenPair = new Set<string>();
  const sources = new Map<number, Array<{ span: number; end: 'low' | 'high' }>>();
  const note = (c: number, span: number, end: 'low' | 'high') => {
    const k = centsKey(c);
    sources.set(k, [...(sources.get(k) ?? []), { span, end }]);
  };
  endpoints.forEach(([lo, hi], span) => {
    note(lo, span, 'low');
    note(hi, span, 'high');
    if (!pr.items[order[span]].essential) {
      return;
    }
    const a = index.get(centsKey(lo)) as number;
    const b = index.get(centsKey(hi)) as number;
    const low = Math.min(a, b);
    const high = Math.max(a, b);
    if (low === high || seenPair.has(`${low},${high}`)) {
      return;
    }
    seenPair.add(`${low},${high}`);
    essentialPairs.push({ low, high, cents: cents[high] - cents[low], span });
  });
  const inducedPairs: NotePair[] = [];
  for (let i = 0; i < cents.length; i++) {
    for (let j = i + 1; j < cents.length; j++) {
      if (!seenPair.has(`${i},${j}`)) {
        inducedPairs.push({ low: i, high: j, cents: cents[j] - cents[i] });
      }
    }
  }
  const collisions: Collision[] = [];
  keys.forEach((k, i) => {
    const s = sources.get(k) ?? [];
    if (s.length > 1) {
      collisions.push({ note: i, cents: cents[i], sources: s });
    }
  });
  const permCents = order.map((i) => pr.items[i].cents);
  const record: OrderingRecord = {
    order: order.slice(),
    perm: permCents,
    essentialPairs,
    endpoints,
  };
  const lo = Math.min(...endpoints.map((e) => e[0]));
  const hi = Math.max(...endpoints.map((e) => e[1]));
  return {
    refHz: pr.bottomHz,
    cents,
    id: keys.join(','),
    essentialPairs,
    inducedPairs,
    collisions,
    perm: permCents,
    order: order.slice(),
    perms: [record],
    essentialVaries: false,
    endpoints,
    measures: computeMeasures(pr.bottomHz, cents, inducedPairs, collisions),
    meta: {
      distribution: pr.spec.distribution,
      centersCents: sol.centres.map((c) => c * q),
      anchorRangeCents: sol.range ? { min: sol.range.min * q, max: sol.range.max * q } : null,
      weights: sol.weights,
      prefixFractions: sol.fractions,
      repulsion: sol.repulsion,
      withinWindow: lo >= -1e-9 && hi <= pr.L * q + 1e-9,
    },
  };
}

/**
 * Place one ordering of the spec's intervals (`order` = indices into `spec.intervals`, in span order). Returns null when
 * the engine cannot place it. Mostly for tests and diagnostics; no dedupe, no constraints.
 */
export function placeOrdering(spec: PlacementSpec, order: readonly number[]): PlacedVoicing | null {
  const pr = prepare(spec);
  if (order.length !== pr.items.length || new Set(order).size !== order.length) {
    throw new RangeError('placeOrdering: order must be a permutation of the interval indices');
  }
  return buildVoicing(pr, order);
}

const defaultNow = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

/**
 * The iterator a worker drives: each `next()` does at most `chunkMs` (default 16 ms) of work, then yields the voicings
 * first seen in it. Stops after the cap (`spec.cap`, default 5,040 orderings); the last chunk reports what remains.
 * Voicings are deduped across chunks by pitch set; a repeat shows up as an `extraOrderings` entry.
 */
export function* placementChunks(
  spec: PlacementSpec,
  opts: ChunkOptions = {}
): Generator<PlacementChunk, void, undefined> {
  const pr = prepare(spec);
  const now = opts.now ?? defaultNow;
  const budget = opts.chunkMs ?? DEFAULT_CHUNK_MS;
  const accepted = new Set<string>();
  const rejected = new Set<string>();
  let processed = 0;
  let skipped = 0;
  const filtered: FilteredCounts = { mustNotHave: 0, mustHave: 0, total: 0 };
  const counts = (): OrderingCounts => ({
    total: Number(pr.totalOrderings),
    totalExact: pr.totalOrderings <= BigInt(Number.MAX_SAFE_INTEGER),
    totalText: pr.totalOrderings.toString(),
    processed,
    remaining: Number(pr.totalOrderings - BigInt(processed)),
  });
  let chunkStart = now();
  let voicings: PlacedVoicing[] = [];
  let extra: Array<{ id: string; ordering: OrderingRecord }> = [];
  const flush = (done: boolean): PlacementChunk => {
    const chunk: PlacementChunk = {
      voicings,
      extraOrderings: extra,
      orderings: counts(),
      skipped,
      filtered: { ...filtered },
      elapsedMs: now() - chunkStart,
      done,
    };
    voicings = [];
    extra = [];
    chunkStart = now();
    return chunk;
  };
  for (const order of orderings(pr)) {
    if (processed >= pr.cap) {
      break;
    }
    processed++;
    const v = buildVoicing(pr, order);
    if (!v) {
      skipped++;
    } else if (accepted.has(v.id)) {
      extra.push({ id: v.id, ordering: v.perms[0] });
    } else if (!rejected.has(v.id)) {
      const verdict = checkConstraints([...v.essentialPairs, ...v.inducedPairs], spec.constraints);
      if (verdict === 'ok') {
        accepted.add(v.id);
        voicings.push(v);
      } else {
        rejected.add(v.id);
        filtered[verdict]++;
        filtered.total++;
      }
    }
    if (now() - chunkStart >= budget) {
      yield flush(false);
      // time the consumer spends between pulls is not our work
      chunkStart = now();
    }
  }
  yield flush(true);
}

const pairSignature = (pairs: readonly NotePair[]): string =>
  pairs
    .map((p) => `${p.low},${p.high}`)
    .sort()
    .join(';');

/**
 * Add another ordering that produced the same pitch set to `voicing.perms` (skipped if that ordering is already listed)
 * and update `essentialVaries`. Use it for `PlacementChunk.extraOrderings`.
 */
export function appendOrdering(voicing: PlacedVoicing, ordering: OrderingRecord): void {
  const key = ordering.order.join();
  if (voicing.perms.some((r) => r.order.join() === key)) {
    return;
  }
  voicing.perms.push(ordering);
  if (pairSignature(ordering.essentialPairs) !== pairSignature(voicing.essentialPairs)) {
    voicing.essentialVaries = true;
  }
}

/**
 * Merge voicings with identical pitch sets into one listing every ordering (`perms`). Distinct orderings are never
 * collapsed (they are told apart by `order`, so equal sizes with different bias or essential flags stay separate);
 * only the very same ordering appearing twice is listed once. The inputs are not modified.
 */
export function dedupe(voicings: readonly PlacedVoicing[]): PlacedVoicing[] {
  const byId = new Map<string, PlacedVoicing>();
  for (const v of voicings) {
    const have = byId.get(v.id);
    if (!have) {
      const copy = { ...v, perms: [] as OrderingRecord[], essentialVaries: false };
      v.perms.forEach((r, i) => (i === 0 ? copy.perms.push(r) : appendOrdering(copy, r)));
      byId.set(v.id, copy);
    } else {
      v.perms.forEach((r) => appendOrdering(have, r));
    }
  }
  return [...byId.values()];
}

/** Place everything synchronously (use `placementChunks` off the main thread for big spaces). */
export function placeIntervals(spec: PlacementSpec): PlacementResult {
  const byId = new Map<string, PlacedVoicing>();
  const voicings: PlacedVoicing[] = [];
  let last: PlacementChunk | null = null;
  for (const chunk of placementChunks(spec, { chunkMs: Number.POSITIVE_INFINITY })) {
    for (const v of chunk.voicings) {
      byId.set(v.id, v);
      voicings.push(v);
    }
    for (const e of chunk.extraOrderings) {
      const have = byId.get(e.id);
      if (have) {
        appendOrdering(have, e.ordering);
      }
    }
    last = chunk;
  }
  const l = last as PlacementChunk;
  return { voicings, orderings: l.orderings, skipped: l.skipped, filtered: l.filtered };
}
