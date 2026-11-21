/**
 * The Z-finder (Canon 6): the cheapest change to a rhythm that gives it a Z-partner, by total
 * movement of its onsets (slot 0, the root, stays), optionally also adding one onset.
 *
 * It is a generator so the page can run it in slices without freezing: call `next()` until a
 * deadline passes, show the last `progress` event, call it again later, or just stop (or call
 * `return()`) to cancel. The deadline is injected by the caller (`sliceFinder`'s `shouldYield`)
 * and a step budget (`maxCandidates`) lives in the options, so tests never wait on real time.
 *
 * Pitch-domain counterpart: nudging a scale (retuning one or two notes) until a set-class
 * relation such as a Z-relation appears.
 */
import { alignTo, canonKey, zPartners } from './zring';

export interface FinderOptions {
  /** Most total slots of movement to try. */
  maxMove: number;
  /** Also add one onset (movement 0 upward) instead of only moving. */
  addOne?: boolean;
  /** Stop after this many candidate rhythms (a step budget). Default unlimited. */
  maxCandidates?: number;
  /** Step budget of each partner search. Default 300,000 (the lab's). */
  partnerCap?: number;
  /** Most results kept at the cheapest level. Default 24. */
  maxResults?: number;
  /** Emit a progress event every this many candidates (untested ones included). Default 50. A progress event also follows every tested candidate. */
  progressEvery?: number;
  /**
   * The page's per-frame deadline, called inside each partner search (every 1,024 steps). When it
   * fires mid-search the search is dropped, the finder yields a progress event (so `sliceFinder`
   * returns) and the same candidate is searched again from the start on the next slice. After
   * `MAX_INTERRUPTS` cuts of one candidate it is searched without this check (the step budget
   * `partnerCap` still bounds it), so a search longer than one slice still finishes. Pass the
   * same deadline function to `sliceFinder`.
   */
  shouldStop?: () => boolean;
}

/** Times one candidate's search may be cut by `shouldStop` before it runs to its step budget. */
export const MAX_INTERRUPTS = 3;

export interface FinderResult {
  /** Total slots of movement (the level). */
  cost: number;
  /** The changed rhythm, sorted. */
  slots: number[];
  /** Movement of each original onset (same order as the input), 0 for the root. */
  delta: number[];
  /** The added onset, or null. */
  added: number | null;
  /** One partner of it (canonical form). */
  partner: number[];
  /** The partner placed to share the most onsets with the changed rhythm. */
  aligned: number[];
  /** How many onsets they share. */
  shared: number;
  mirrored: boolean;
}

export type FinderEvent =
  | { type: 'progress'; level: number; candidates: number; tested: number }
  | { type: 'result'; result: FinderResult }
  | { type: 'level'; level: number; found: number }
  | {
      type: 'done';
      reason: 'found' | 'exhausted' | 'budget';
      /** The cheapest level with results (null when none). */
      cost: number | null;
      candidates: number;
      tested: number;
      /**
       * Partner searches that hit their step budget (`partnerCap`) and were counted as "no
       * partner". Nonzero means "cheapest" is NOT proven: a skipped candidate may have had one.
       */
      abortedSearches: number;
    };

interface Candidate {
  P: number[];
  delta: number[];
  x: number | null;
}

/** Candidates at exactly `total` slots of movement (root fixed), optionally with one added onset. */
function* candidatesAt(
  A: number[],
  L: number,
  total: number,
  addOne: boolean
): Generator<Candidate> {
  const k = A.length;
  const delta: number[] = new Array(k).fill(0);
  function* rec(i: number, rem: number, x: number | null): Generator<Candidate> {
    if (i === k) {
      if (rem === 0) {
        const P = A.map((a, j) => (((a + delta[j]) % L) + L) % L);
        if (x !== null) {
          P.push(x);
        }
        yield { P, delta: delta.slice(), x };
      }
      return;
    }
    if (i === 0) {
      yield* rec(1, rem, x);
      return;
    }
    if (i === k - 1) {
      // the last note takes whatever movement is left
      const options = rem === 0 ? [0] : [-rem, rem];
      for (const v of options) {
        delta[i] = v;
        yield* rec(i + 1, 0, x);
      }
      delta[i] = 0;
      return;
    }
    for (let v = -rem; v <= rem; v++) {
      delta[i] = v;
      yield* rec(i + 1, rem - Math.abs(v), x);
    }
    delta[i] = 0;
  }
  if (k === 1) {
    return;
  }
  if (addOne) {
    for (let x = 1; x < L; x++) {
      if (!A.includes(x)) {
        yield* rec(0, total, x);
      }
    }
  } else {
    yield* rec(0, total, null);
  }
}

/**
 * Search for the cheapest fix. `A` is the sorted onset slots with the root at slot 0. Levels are
 * total movement 1, 2, ... (0, 1, 2, ... when adding an onset); the search stops after the first
 * level that has results, so every result costs the same and is the cheapest.
 */
export function* findZFixes(
  A: number[],
  L: number,
  opts: FinderOptions
): Generator<FinderEvent, void> {
  const addOne = opts.addOne ?? false;
  const budget = opts.maxCandidates ?? Infinity;
  const partnerCap = opts.partnerCap ?? 300_000;
  const maxResults = opts.maxResults ?? 24;
  const every = opts.progressEvery ?? 50;
  const sorted = [...A].sort((a, b) => a - b);
  const me = canonKey(sorted, L);
  const memo = new Map<string, number[] | null>();
  let candidates = 0;
  let tested = 0;
  let abortedSearches = 0;
  let cost: number | null = null;
  for (let level = addOne ? 0 : 1; level <= opts.maxMove; level++) {
    const seen = new Set<string>();
    let found = 0;
    for (const c of candidatesAt(sorted, L, level, addOne)) {
      if (found >= maxResults) {
        break; // the level is full: stop testing its remaining candidates
      }
      if (candidates >= budget) {
        yield { type: 'done', reason: 'budget', cost, candidates, tested, abortedSearches };
        return;
      }
      candidates++;
      if (candidates % every === 0) {
        yield { type: 'progress', level, candidates, tested };
      }
      if (new Set(c.P).size < c.P.length) {
        continue;
      }
      const key = canonKey(c.P, L);
      if (key === me || seen.has(key)) {
        continue;
      }
      seen.add(key);
      let z = memo.get(key);
      if (z === undefined) {
        const P = [...c.P].sort((a, b) => a - b);
        let zz = zPartners(P, L, { cap: partnerCap, shouldStop: opts.shouldStop });
        for (let cuts = 1; zz.aborted && zz.steps <= partnerCap; cuts++) {
          // cut short by the deadline (not by the step budget): hand control back, then redo it
          yield { type: 'progress', level, candidates, tested };
          zz = zPartners(P, L, {
            cap: partnerCap,
            shouldStop: cuts < MAX_INTERRUPTS ? opts.shouldStop : undefined,
          });
        }
        if (zz.aborted) {
          abortedSearches++;
        }
        z = zz.partners.length ? zz.partners[0] : null;
        memo.set(key, z);
        tested++;
        yield { type: 'progress', level, candidates, tested };
      }
      if (z && found < maxResults) {
        const slots = [...c.P].sort((a, b) => a - b);
        const al = alignTo(slots, z, L);
        found++;
        yield {
          type: 'result',
          result: {
            cost: level,
            slots,
            delta: c.delta,
            added: c.x,
            partner: z,
            aligned: al.Q,
            shared: al.shared,
            mirrored: al.mirrored,
          },
        };
      }
    }
    yield { type: 'level', level, found };
    if (found > 0) {
      cost = level;
      break;
    }
  }
  yield {
    type: 'done',
    reason: cost === null ? 'exhausted' : 'found',
    cost,
    candidates,
    tested,
    abortedSearches,
  };
}

export interface FinderState {
  results: FinderResult[];
  /** Latest progress event, for a status line. */
  progress: { level: number; candidates: number; tested: number } | null;
  /** The final event once the generator finished. */
  done: Extract<FinderEvent, { type: 'done' }> | null;
}

export function newFinderState(): FinderState {
  return { results: [], progress: null, done: null };
}

/**
 * Run a finder generator for one slice: pull events into `state` until `shouldYield()` is true
 * (a deadline or a time slice the caller checks) or the generator ends. Returns true when finished.
 * The injected `shouldYield` is called before each event, so a test passes a counter instead of a clock.
 */
export function sliceFinder(
  gen: Generator<FinderEvent, void>,
  state: FinderState,
  shouldYield: () => boolean
): boolean {
  while (!state.done) {
    if (shouldYield()) {
      return false;
    }
    const n = gen.next();
    if (n.done) {
      return true;
    }
    const e = n.value;
    if (e.type === 'result') {
      state.results.push(e.result);
    } else if (e.type === 'progress') {
      state.progress = { level: e.level, candidates: e.candidates, tested: e.tested };
    } else if (e.type === 'done') {
      state.done = e;
      return true;
    }
  }
  return true;
}

/** Run a finder to the end (or its candidate budget) and return the state. For tests and small rings. */
export function runFinder(A: number[], L: number, opts: FinderOptions): FinderState {
  const state = newFinderState();
  sliceFinder(findZFixes(A, L, opts), state, () => false);
  return state;
}
