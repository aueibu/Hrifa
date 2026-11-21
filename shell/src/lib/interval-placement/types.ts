/** Types of the interval-placement library. Pure TypeScript: no React, no DOM, no fs, no Worker code. */
import type { Voicing } from '../consonance/types';

export type OddBias = 'up' | 'down';

/** The four ported engines. `uniform` = old `v1`, `prefixSlack` = old `v2`, `repulsion` = old `repulse`. */
export type Distribution = 'uniform' | 'prefixSlack' | 'prefixDominance' | 'repulsion';

/** How `oddBias` is attached when the intervals are reordered. See README ("odd bias"). */
export type OddBiasSemantics = 'interval' | 'position';

/** One interval to place, a span of `cents`. */
export interface IntervalSpec {
  /** Size in cents (EDO steps are `steps * 1200 / edo`; see `stepsToCents`). */
  cents: number;
  /** True (default) when the interval is one the user named. Non-essential spans are still placed but their pair is reported as induced. */
  essential?: boolean;
  /** Which way an odd-step interval's extra step falls around its centre (default `'down'`). Only odd integer-step spans use it. */
  oddBias?: OddBias;
}

/** The engine parameters of the old page (same names and defaults). */
export interface EngineParams {
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

/**
 * The window: an absolute bottom pitch and a width. Give exactly one of `widthSteps` / `widthCents`. A width that is
 * not a whole number of steps is snapped down to whole steps when every span is a whole number of steps (so 2450 c in
 * 12-EDO is a 24-step window); when some span is not whole (JI, cents) the width is used exactly.
 */
export interface WindowSpec {
  /** Absolute frequency of the bottom of the window (becomes the voicings' `refHz`). */
  bottomHz: number;
  /** Width in grid steps (`stepCents` each); e.g. `octaves * edo`. */
  widthSteps?: number;
  /** Width in cents. */
  widthCents?: number;
}

/** A must-have / must-not-have interval. A voicing "contains" it when any pair of its notes (essential or induced) has that size. */
export interface IntervalConstraint {
  cents: number;
  /** Compare sizes modulo 1200 cents (a 10th counts as a 3rd). Default false (exact size). */
  octaveEquivalent?: boolean;
  /** Match tolerance in cents (default 1e-6). */
  toleranceCents?: number;
}

export interface Constraints {
  mustHave?: IntervalConstraint[];
  mustNotHave?: IntervalConstraint[];
}

export interface PlacementSpec {
  intervals: IntervalSpec[];
  window: WindowSpec;
  distribution: Distribution;
  /**
   * The grid the engines quantise on, in cents (default 100 = 12-EDO; `1200 / edo` for another EDO). Spans that are whole
   * multiples of it behave exactly like the old page's step arithmetic; other spans (JI, cents) are split without rounding.
   */
  stepCents?: number;
  /** Overrides of `DEFAULT_ENGINE_PARAMS`. */
  params?: Partial<EngineParams>;
  /**
   * Default `'interval'`; `'position'` reproduces the old page (see README). In `'position'` mode intervals of equal size
   * are interchangeable: the k-th span of a size in an ordering takes the k-th such interval of `spec.intervals`
   * (lowest index first) for its `essential` flag.
   */
  oddBiasSemantics?: OddBiasSemantics;
  constraints?: Constraints;
  /** Maximum number of orderings to process (default `DEFAULT_ORDERING_CAP` = 5,040). `Infinity` removes the cap. */
  cap?: number;
}

/** A pair of notes, by index into `PlacedVoicing.cents` (sorted ascending, so `low < high`). */
export interface NotePair {
  low: number;
  high: number;
  cents: number;
  /** For essential pairs: the position of the span in `endpoints`. */
  span?: number;
}

/** Two or more span endpoints that landed on the same pitch (merged into one note, but reported). */
export interface Collision {
  /** The note's index in `cents`. */
  note: number;
  cents: number;
  /** Which span endpoints coincide (span position in the first ordering, `end` of the span). */
  sources: Array<{ span: number; end: 'low' | 'high' }>;
}

/** Cheap exact facts about a voicing (not consonance; never mixed into the scores). */
export interface Measures {
  spanCents: number;
  noteCount: number;
  /** Mean log-frequency, as cents above `refHz` (the mean of `cents`). */
  centroidCents: number;
  /** The same in Hz (geometric mean of the notes). */
  centroidHz: number;
  lowestCents: number;
  lowestHz: number;
  /** Number of distinct interval sizes among the induced pairs. */
  distinctInduced: number;
  /** Number of notes that two or more span endpoints coincided on. */
  collisions: number;
}

export interface PlacementMeta {
  distribution: Distribution;
  /** The engine's span centres for the first ordering, in cents above the bottom. */
  centersCents: number[];
  /** Centre bounds (or anchor range) in cents, when the engine has one. */
  anchorRangeCents: { min: number; max: number } | null;
  weights?: number[];
  prefixFractions?: number[];
  /** Repulsion only: smallest centre distance (steps) and energy after the solve. */
  repulsion?: { minDistanceSteps: number; energy: number };
  /**
   * False when a span end falls outside the window `[0, width]`. Computed for every engine from the first ordering's
   * endpoints. Any engine can do it: `uniform` never checks fit, `prefixDominance` uses an unquantised range and floors
   * its centre (a single 700 c span in 24 steps gives `[-100, 600]`), and `repulsion` never returns null but falls back
   * to out-of-window bounds (2000 c + 400 c in 12 steps gives notes at -800, 0, 400, 1200).
   */
  withinWindow: boolean;
}

/** One ordering that produced a voicing's pitch set. Note indices refer to the voicing's (shared) `cents`. */
export interface OrderingRecord {
  /** Indices into `spec.intervals`, in span order. */
  order: number[];
  /** The interval sizes in span order (cents). */
  perm: number[];
  essentialPairs: NotePair[];
  endpoints: Array<[number, number]>;
}

export interface PlacedVoicing extends Voicing {
  /** Identity: the pitch set, as `sortedCents` joined (1e-6 cent resolution). Equal ids = identical pitch sets. */
  id: string;
  /** `cents` is sorted ascending and has no repeated note. */
  cents: number[];
  /** Pairs that are the placed spans **of the first ordering** (see `perms[i].essentialPairs` and `essentialVaries`). */
  essentialPairs: NotePair[];
  /** Every other pair of notes (the complement of `essentialPairs`, i.e. also relative to the first ordering). */
  inducedPairs: NotePair[];
  collisions: Collision[];
  /** The first ordering that produced this pitch set: interval sizes in span order (`perms[0].perm`). */
  perm: number[];
  /** The same ordering as indices into `spec.intervals` (tells apart equal sizes with different bias / essential flag). */
  order: number[];
  /** Every ordering that produced this pitch set, the first one first, each with its own essential pairs and endpoints. */
  perms: OrderingRecord[];
  /** True when the orderings in `perms` disagree about which pairs are essential. */
  essentialVaries: boolean;
  /** `[low, high]` of each span of the first ordering, cents above `refHz`. */
  endpoints: Array<[number, number]>;
  measures: Measures;
  meta: PlacementMeta;
}

export interface FilteredCounts {
  mustNotHave: number;
  mustHave: number;
  total: number;
}

export interface OrderingCounts {
  /** All distinct orderings of the intervals (a double: exact up to 2^53, approximate beyond; see `totalExact`). */
  total: number;
  /** False when `total` exceeded 2^53 and is approximate; `totalText` is always exact. */
  totalExact: boolean;
  /** The exact count as a decimal string. */
  totalText: string;
  /** Orderings looked at (at most the cap). */
  processed: number;
  /** Orderings not looked at because of the cap. */
  remaining: number;
}

export interface PlacementResult {
  voicings: PlacedVoicing[];
  orderings: OrderingCounts;
  /** Orderings an engine could not place (the spans do not fit the window). Never silently dropped. */
  skipped: number;
  /** Voicings removed by the constraints (after dedupe). */
  filtered: FilteredCounts;
}

/** One slice of work from `placementChunks`. */
export interface PlacementChunk {
  /** Voicings first seen in this chunk that pass the constraints. */
  voicings: PlacedVoicing[];
  /** Orderings that reproduced an already yielded voicing (append `ordering` to its `perms`, see `appendOrdering`). */
  extraOrderings: Array<{ id: string; ordering: OrderingRecord }>;
  /** Cumulative counters. */
  orderings: OrderingCounts;
  skipped: number;
  filtered: FilteredCounts;
  /** Wall time spent in this chunk, ms. */
  elapsedMs: number;
  done: boolean;
}

export interface ChunkOptions {
  /** Work budget per chunk in ms (default `DEFAULT_CHUNK_MS` = 16). */
  chunkMs?: number;
  /** Clock in ms (default `performance.now`, else `Date.now`); injectable for tests. */
  now?: () => number;
}
