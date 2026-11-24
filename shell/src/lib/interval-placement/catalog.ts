/**
 * The catalog (M2c): every ordering of the essential intervals at every window width of a spacing range, placed by a
 * spacing rule, one entry per distinct pitch set, scored with `scoreVoicing`, ranked by a weighted mix and by Pareto
 * layers. Pure; `catalogChunks` is the generator a worker drives (same ordering cap semantics as `placementChunks`).
 */
import {
  EQUAL_WEIGHTS,
  SCORE_SENSE,
  SCORE_KEYS,
  combine,
  flatScores,
  paretoLayers,
  scoreVoicing,
  standardise,
  type ScoreKey,
  type ScoreOptions,
  type VoicingScores,
} from '../consonance';
import type { Voicing } from '../consonance/types';
import { checkConstraints } from './constraints';
import { isWholeSteps } from './engines';
import { centsKey, computeMeasures } from './measures';
import { DEFAULT_CHUNK_MS, DEFAULT_ORDERING_CAP, countOrderings } from './place';
import {
  DEFAULT_SPACING_RULE,
  DEFAULT_TIE_MODE,
  SPACING_RULES,
  TIE_MODES,
  placeSpaced,
  spacingWidths,
  type SpacingRange,
  type SpacingRule,
  type TieMode,
} from './spacing';
import type {
  ChunkOptions,
  Collision,
  Constraints,
  FilteredCounts,
  IntervalSpec,
  Measures,
  NotePair,
  OrderingCounts,
} from './types';

/** Weights per flat score (`SCORE_KEYS`); a missing or zero weight leaves the score out of the mix. Negative = lower is better. */
export type ScoreWeights = Partial<Record<ScoreKey, number>>;

/**
 * The default mix: interference -1, periodicity 0, **pitch-space** harmonicity (`harmonicityPitch`) +1 (human,
 * 2026-11-23, DECISIONS INTERVALPLACEMENT-4): the catalog compares placements of one interval set, which pitch-class
 * harmonicity barely tells apart (two chords with the same pitch-class shape score the same wherever their notes sit).
 * `EQUAL_WEIGHTS` keeps its meaning (its `harmonicity` is the faithful pitch-class score) and stays available.
 */
export const DEFAULT_CATALOG_WEIGHTS: Readonly<ScoreWeights> = {
  interference: EQUAL_WEIGHTS.interference,
  periodicity: EQUAL_WEIGHTS.periodicity,
  harmonicityPitch: EQUAL_WEIGHTS.harmonicity,
};

/** The default two Pareto axes: interference (lower is better) and pitch-space harmonicity (higher is better). */
export const DEFAULT_PARETO_KEYS: readonly [ScoreKey, ScoreKey] = [
  'interference',
  'harmonicityPitch',
];

/**
 * Weights as `rankCatalog` accepts them: per flat score key, or the `EQUAL_WEIGHTS` shape, whose `harmonicity` key
 * means the pitch-class harmonicity (`harmonicityPc`). Any other key throws (a silently ignored key would rank by the
 * remaining scores alone).
 */
function resolveWeights(weights: Readonly<Record<string, number | undefined>>): ScoreWeights {
  const out: ScoreWeights = {};
  for (const [key, w] of Object.entries(weights)) {
    if (w === undefined) {
      continue;
    }
    if (!Number.isFinite(w)) {
      throw new RangeError(`rankCatalog: weight for ${key} must be finite`);
    }
    const k = key === 'harmonicity' ? 'harmonicityPc' : key;
    if (!(SCORE_KEYS as readonly string[]).includes(k)) {
      throw new RangeError(
        `rankCatalog: unknown weight key ${key} (use one of ${SCORE_KEYS.join(', ')})`
      );
    }
    out[k as ScoreKey] = (out[k as ScoreKey] ?? 0) + w;
  }
  return out;
}

export interface CatalogSpec {
  /** The essential intervals. Sizes are cents (`stepsToCents` for EDO steps); `oddBias` does not apply to the spacing rules. */
  intervals: IntervalSpec[];
  /** Absolute frequency of the bottom of every window (the base pitch; becomes each entry's `refHz`). */
  bottomHz: number;
  /** The window widths: whole grid steps (or cents, converted with `stepCents`). `from = to` is one width. */
  spacing: SpacingRange;
  /** Default `'equal'`. */
  rule?: SpacingRule;
  /** How an exact half step rounds (default `'middle'`); a list gives the rounding twins together. */
  tieMode?: TieMode | readonly TieMode[];
  /** The grid in cents (default 100 = 12-EDO; `1200 / edo`). */
  stepCents?: number;
  constraints?: Constraints;
  /** Maximum number of orderings to process (default `DEFAULT_ORDERING_CAP`); each ordering is placed at every width. */
  cap?: number;
  /** Options for `scoreVoicing` (default `{decompose: false}`: the per-note marginals are skipped, they are expensive). */
  score?: ScoreOptions;
}

/** One way a pitch set was made. Note indices (in `essentialPairs`, `collisions`) refer to the entry's `cents`. */
export interface CatalogOccurrence {
  widthSteps: number;
  widthCents: number;
  rule: SpacingRule;
  tieMode: TieMode;
  /** Number of bottom notes that were an exact half step under this occurrence's rounding. */
  ties: number;
  /** Indices into `spec.intervals`, in span order. */
  order: number[];
  /** The interval sizes in span order (cents). */
  perm: number[];
  /** `[low, high]` of each span, cents above the base. */
  endpoints: Array<[number, number]>;
  essentialPairs: NotePair[];
  /** Span endpoints that landed on the same pitch (a shared note), reported, never silently merged. */
  collisions: Collision[];
}

export interface CatalogEntry extends Voicing {
  /** The pitch set (1e-6 cent resolution); equal ids = identical notes above the same base. */
  id: string;
  /** Sorted ascending, no repeats, from the base (a note at 0 is the base itself). */
  cents: number[];
  /** Every (width, ordering, rule, tie mode) that produced this pitch set, the first one first. */
  occurrences: CatalogOccurrence[];
  /** The first occurrence's collisions (see each occurrence for the others). */
  collisions: Collision[];
  measures: Measures;
  scores: VoicingScores;
  flat: Record<ScoreKey, number>;
}

export interface RankedEntry extends CatalogEntry {
  /** The weighted mix of standardized scores (higher is better); the list is sorted by it. */
  mix: number;
  /** 0-based Pareto layer over the two chosen score keys (0 = the front). */
  layer: number;
}

export interface CannotFit {
  /** Window width in steps. */
  widthSteps: number;
  /** Orderings that could not be placed at this width because the window is narrower than the largest interval. */
  orderings: number;
}

export interface CatalogCounts {
  orderings: OrderingCounts;
  /** (ordering, width, tie mode) placements made so far. */
  placements: number;
  /** Per width, how many orderings could not fit (counted, never dropped silently), ascending by width. */
  cannotFit: CannotFit[];
  filtered: FilteredCounts;
}

export interface CatalogChunk extends CatalogCounts {
  /** New pitch sets (passing the constraints), already scored, in first-seen order. */
  entries: CatalogEntry[];
  /** Later occurrences of already yielded pitch sets (add with `appendOccurrence`). */
  extraOccurrences: Array<{ id: string; occurrence: CatalogOccurrence }>;
  elapsedMs: number;
  done: boolean;
}

export interface RankOptions {
  /** Per flat score key; the `EQUAL_WEIGHTS` shape is accepted too (`harmonicity` = `harmonicityPc`). Unknown keys throw. */
  weights?: ScoreWeights | Readonly<Partial<Record<keyof typeof EQUAL_WEIGHTS, number>>>;
  /** The two score keys of the Pareto layers (default `DEFAULT_PARETO_KEYS`); each key's min/max sense is respected. */
  paretoKeys?: readonly [ScoreKey, ScoreKey];
}

export interface CatalogResult extends CatalogCounts {
  /** Ranked by `mix`, best first (ties keep first-seen order). */
  entries: RankedEntry[];
}

interface Prepared {
  q: number;
  bottomHz: number;
  items: Array<{ cents: number; steps: number; essential: boolean }>;
  kinds: number[][];
  widths: number[];
  rule: SpacingRule;
  tieModes: TieMode[];
  total: bigint;
  cap: number;
  spec: CatalogSpec;
}

function prepare(spec: CatalogSpec): Prepared {
  const q = spec.stepCents ?? 100;
  if (!(q > 0) || !Number.isFinite(q)) {
    throw new RangeError('stepCents must be > 0');
  }
  if (!spec.intervals?.length) {
    throw new RangeError('catalog: no intervals');
  }
  if (!(spec.bottomHz > 0) || !Number.isFinite(spec.bottomHz)) {
    throw new RangeError('bottomHz must be a positive frequency');
  }
  const rule = spec.rule ?? DEFAULT_SPACING_RULE;
  if (!SPACING_RULES.includes(rule)) {
    throw new RangeError(`unknown spacing rule: ${String(rule)}`);
  }
  const tieModes = [
    ...new Set(Array.isArray(spec.tieMode) ? spec.tieMode : [spec.tieMode ?? DEFAULT_TIE_MODE]),
  ] as TieMode[];
  if (tieModes.length === 0 || tieModes.some((t) => !TIE_MODES.includes(t))) {
    throw new RangeError('unknown tieMode');
  }
  const cap = spec.cap ?? DEFAULT_ORDERING_CAP;
  if (!(cap >= 0)) {
    throw new RangeError('cap must be >= 0');
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
  const items = spec.intervals.map((iv) => {
    if (!(iv.cents > 0) || !Number.isFinite(iv.cents)) {
      throw new RangeError('interval cents must be > 0');
    }
    let steps = iv.cents / q;
    if (isWholeSteps(steps)) {
      steps = Math.round(steps);
    }
    return { cents: iv.cents, steps, essential: iv.essential !== false };
  });
  // interchangeable intervals (same size and essential flag) are not counted as different orderings
  const groups = new Map<string, number[]>();
  items.forEach((it, i) => {
    const key = `${centsKey(it.cents)}|${it.essential}`;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });
  const kinds = [...groups.values()].sort(
    (a, b) => items[a[0]].steps - items[b[0]].steps || a[0] - b[0]
  );
  return {
    q,
    bottomHz: spec.bottomHz,
    items,
    kinds,
    widths: spacingWidths(spec.spacing, q),
    rule,
    tieModes,
    total: countOrderings(kinds.map((k) => k.length)),
    cap,
    spec,
  };
}

function* orderings(pr: Prepared): Generator<number[]> {
  const counts = pr.kinds.map((k) => k.length);
  const used = pr.kinds.map(() => 0);
  const cur: number[] = [];
  function* rec(): Generator<number[]> {
    if (cur.length === pr.items.length) {
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

/** Every pair of notes, as `NotePair`s (for the constraints and the induced/essential split). */
function allPairs(cents: readonly number[]): NotePair[] {
  const out: NotePair[] = [];
  for (let i = 0; i < cents.length; i++) {
    for (let j = i + 1; j < cents.length; j++) {
      out.push({ low: i, high: j, cents: cents[j] - cents[i] });
    }
  }
  return out;
}

const occurrenceKey = (o: CatalogOccurrence): string =>
  `${o.widthSteps}|${o.order.join(',')}|${o.rule}|${o.tieMode}`;

/** Add a later occurrence to an entry (skipped when the same width/ordering/rule/tie mode is already listed). */
export function appendOccurrence(entry: CatalogEntry, occurrence: CatalogOccurrence): void {
  const key = occurrenceKey(occurrence);
  if (!entry.occurrences.some((o) => occurrenceKey(o) === key)) {
    entry.occurrences.push(occurrence);
  }
}

const defaultNow = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

/**
 * The iterator a worker drives. Each `next()` places orderings (each at every width and tie mode) until `chunkMs` has
 * passed (checked after each ordering), then yields the new entries (scored), later occurrences of earlier entries, and
 * cumulative counters. Stops after the cap. Rank at the end with `rankCatalog`.
 */
export function* catalogChunks(
  spec: CatalogSpec,
  opts: ChunkOptions = {}
): Generator<CatalogChunk, void, undefined> {
  const pr = prepare(spec);
  const now = opts.now ?? defaultNow;
  const budget = opts.chunkMs ?? DEFAULT_CHUNK_MS;
  const scoreOpts: ScoreOptions = spec.score ?? { decompose: false };
  const maxSize = Math.max(...pr.items.map((i) => i.steps));
  const accepted = new Map<string, CatalogEntry>();
  const rejected = new Set<string>();
  const cannotFit = new Map<number, number>();
  const filtered: FilteredCounts = { mustNotHave: 0, mustHave: 0, total: 0 };
  let processed = 0;
  let placements = 0;
  let chunkStart = now();
  let entries: CatalogEntry[] = [];
  let extra: Array<{ id: string; occurrence: CatalogOccurrence }> = [];
  const counts = (): CatalogCounts => ({
    orderings: {
      total: Number(pr.total),
      totalExact: pr.total <= BigInt(Number.MAX_SAFE_INTEGER),
      totalText: pr.total.toString(),
      processed,
      remaining: Number(pr.total - BigInt(processed)),
    },
    placements,
    cannotFit: [...cannotFit.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([widthSteps, n]) => ({ widthSteps, orderings: n })),
    filtered: { ...filtered },
  });
  const flush = (done: boolean): CatalogChunk => {
    const chunk: CatalogChunk = {
      entries,
      extraOccurrences: extra,
      ...counts(),
      elapsedMs: now() - chunkStart,
      done,
    };
    entries = [];
    extra = [];
    inChunk.clear();
    chunkStart = now();
    return chunk;
  };
  // ids of the entries yielded in the current chunk: their later occurrences are already inside them, so they are not
  // repeated in `extraOccurrences` (which only carries occurrences of entries yielded in an EARLIER chunk).
  const inChunk = new Set<string>();
  for (const order of orderings(pr)) {
    if (processed >= pr.cap) {
      break;
    }
    processed++;
    const sizes = order.map((i) => pr.items[i].steps);
    for (const width of pr.widths) {
      if (maxSize > width + 1e-9) {
        cannotFit.set(width, (cannotFit.get(width) ?? 0) + 1);
        continue;
      }
      for (const tieMode of pr.tieModes) {
        const p = placeSpaced(pr.rule, sizes, width, tieMode);
        if (!p) {
          cannotFit.set(width, (cannotFit.get(width) ?? 0) + 1);
          continue;
        }
        placements++;
        const endpoints = p.endpoints.map(([lo, hi]): [number, number] => [lo * pr.q, hi * pr.q]);
        const byKey = new Map<number, number>();
        for (const [lo, hi] of endpoints) {
          for (const c of [lo, hi]) {
            if (!byKey.has(centsKey(c))) {
              byKey.set(centsKey(c), c);
            }
          }
        }
        const keys = [...byKey.keys()].sort((a, b) => a - b);
        const cents = keys.map((k) => byKey.get(k) as number);
        const index = new Map(keys.map((k, i) => [k, i]));
        const sources = new Map<number, Array<{ span: number; end: 'low' | 'high' }>>();
        const essentialPairs: NotePair[] = [];
        const seenPair = new Set<string>();
        endpoints.forEach(([lo, hi], span) => {
          for (const [c, end] of [
            [lo, 'low'],
            [hi, 'high'],
          ] as const) {
            const k = centsKey(c);
            sources.set(k, [...(sources.get(k) ?? []), { span, end }]);
          }
          if (!pr.items[order[span]].essential) {
            return;
          }
          const a = index.get(centsKey(lo)) as number;
          const b = index.get(centsKey(hi)) as number;
          if (a !== b && !seenPair.has(`${a},${b}`)) {
            seenPair.add(`${a},${b}`);
            essentialPairs.push({ low: a, high: b, cents: cents[b] - cents[a], span });
          }
        });
        const collisions: Collision[] = [];
        keys.forEach((k, i) => {
          const s = sources.get(k) ?? [];
          if (s.length > 1) {
            collisions.push({ note: i, cents: cents[i], sources: s });
          }
        });
        const occurrence: CatalogOccurrence = {
          widthSteps: width,
          widthCents: width * pr.q,
          rule: pr.rule,
          tieMode,
          ties: p.ties,
          order: order.slice(),
          perm: order.map((i) => pr.items[i].cents),
          endpoints,
          essentialPairs,
          collisions,
        };
        const id = keys.join(',');
        const have = accepted.get(id);
        if (have) {
          if (!inChunk.has(id)) {
            extra.push({ id, occurrence });
          }
          appendOccurrence(have, occurrence);
          continue;
        }
        if (rejected.has(id)) {
          continue;
        }
        const pairs = allPairs(cents);
        const verdict = checkConstraints(pairs, spec.constraints);
        if (verdict !== 'ok') {
          rejected.add(id);
          filtered[verdict]++;
          filtered.total++;
          continue;
        }
        const voicing: Voicing = { refHz: pr.bottomHz, cents };
        const scores = scoreVoicing(voicing, scoreOpts);
        const entry: CatalogEntry = {
          refHz: pr.bottomHz,
          cents,
          id,
          occurrences: [occurrence],
          collisions,
          measures: computeMeasures(
            pr.bottomHz,
            cents,
            pairs.filter((x) => !seenPair.has(`${x.low},${x.high}`)),
            collisions
          ),
          scores,
          flat: flatScores(scores),
        };
        accepted.set(id, entry);
        entries.push(entry);
        inChunk.add(id);
      }
    }
    if (now() - chunkStart >= budget) {
      yield flush(false);
      chunkStart = now();
    }
  }
  yield flush(true);
}

/**
 * Rank entries: `mix` = `combine` of the standardized score columns (within this list) with `weights`
 * (default `DEFAULT_CATALOG_WEIGHTS`), and Pareto `layer` over two score keys (`paretoLayers`, each key's min/max sense
 * from `SCORE_SENSE`). Returns new objects sorted by `mix` descending (stable). Rank after constraints, on the whole list.
 */
export function rankCatalog(
  entries: readonly CatalogEntry[],
  opts: RankOptions = {}
): RankedEntry[] {
  const weights = resolveWeights(opts.weights ?? DEFAULT_CATALOG_WEIGHTS);
  const [kx, ky] = opts.paretoKeys ?? DEFAULT_PARETO_KEYS;
  const keys = SCORE_KEYS.filter((k) => (weights[k] ?? 0) !== 0);
  const mix = combine(
    keys.map((k) => standardise(entries.map((e) => e.flat[k]))),
    keys.map((k) => weights[k] as number)
  );
  const layer = new Array<number>(entries.length).fill(Number.POSITIVE_INFINITY);
  paretoLayers(
    entries.map((e) => [e.flat[kx], e.flat[ky]]),
    [SCORE_SENSE[kx], SCORE_SENSE[ky]]
  ).forEach((members, l) => members.forEach((i) => (layer[i] = l)));
  return entries
    .map((e, i): RankedEntry => ({ ...e, mix: mix[i] ?? 0, layer: layer[i] }))
    .sort((a, b) => b.mix - a.mix);
}

/** The whole catalog at once (the iterator run to the end, then ranked). Use `catalogChunks` off the main thread. */
export function buildCatalog(spec: CatalogSpec, rank: RankOptions = {}): CatalogResult {
  const all: CatalogEntry[] = [];
  let last: CatalogChunk | null = null;
  for (const chunk of catalogChunks(spec, { chunkMs: Number.POSITIVE_INFINITY })) {
    all.push(...chunk.entries);
    last = chunk;
  }
  const { orderings: o, placements, cannotFit, filtered } = last as CatalogChunk;
  return { entries: rankCatalog(all, rank), orderings: o, placements, cannotFit, filtered };
}
