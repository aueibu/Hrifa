/**
 * M9 (H-39): the lab's harmonic entropy curve, built once per (s, N) and kept in memory (nothing is stored on disk).
 *
 * - `useHeCurve(s, N)` (the Dissonance view, the picker's Color metric when Entropy is chosen, the Near overlay) asks for the curve of
 *   the lab's s (`ui.heBlur`) and the Developer menu's N (`heLimit`) and re-renders only when a build finishes. Nothing is built until
 *   a consumer is mounted.
 * - A build whose estimate is above `WORKER_MS` runs in a module Web Worker (`entropy.worker.ts`); smaller builds, and every build
 *   where there is no `Worker` (jsdom, the page tests), run synchronously on the main thread. The estimate is the measured ms per
 *   ratio of the last build (a built-in guess before the first).
 * - The previous curve stays shown while a new one builds (`building` is true meanwhile). A request for a (s, N) that is already
 *   built shows it at once; otherwise the build starts `DEBOUNCE_MS` after the last request, so dragging the slider builds once. The
 *   very first build starts at once.
 * - Single intervals (`source.at`) are computed exactly from the candidates and remembered per (s, N), so a hover never rebuilds
 *   anything.
 */
import { useEffect, useSyncExternalStore } from 'react';
import {
  HE_MS_PER_RATIO_DEFAULT,
  estimateHeBuildMs,
  heAt,
  heCandidates,
  heCurve,
  heFixedRange,
  heLogFactor,
  type HeCandidates,
} from '../../../lib/harmonic-field/harmonicEntropy';
import type { EntropySource } from './intervalColor';

/** Builds estimated above this many ms run in the worker. */
export const WORKER_MS = 200;
/** Milliseconds after the last request (a slider drag) before a new curve is built. */
export const DEBOUNCE_MS = 150;
/** The single-value cache of one (s, N) is cleared past this many entries (like `roughCache` in intervalColor). */
const EXACT_CACHE_MAX = 20000;

interface Entry {
  s: number;
  limit: number;
  curve: Float64Array;
  source: EntropySource;
}

export interface HeSnapshot {
  /** The curve shown (the previous one while a new one builds), null before the first one is built. */
  curve: Float64Array | null;
  /** The curve's min, max and exact-value lookup, null with the curve. */
  source: EntropySource | null;
  /** A build for the requested (s, N) is waiting or running. */
  building: boolean;
  /** The s and N of the curve shown (the requested ones when none yet). */
  s: number;
  N: number;
}

const entries = new Map<string, Entry>();
const keyOf = (s: number, limit: number) => `${s}|${limit}`;
let msPerRatio: number | null = null;
let shown: Entry | null = null;
let requested: { s: number; limit: number } | null = null;
let building = false;
let snapshot: HeSnapshot = { curve: null, source: null, building: false, s: 0, N: 0 };
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let worker: Worker | null = null;
let jobId = 0;
let candsCache: HeCandidates | null = null;
/** The (s, N) a worker is building right now (null when none): a repeated request for it must not restart the build. */
let inflight: { s: number; limit: number } | null = null;

function publish() {
  snapshot = {
    curve: shown?.curve ?? null,
    source: shown?.source ?? null,
    building,
    s: shown?.s ?? requested?.s ?? 0,
    N: shown?.limit ?? requested?.limit ?? 0,
  };
  listeners.forEach((l) => l());
}

/** The candidates of a limit, for the exact single values (the last limit used is kept). */
function candsFor(limit: number): HeCandidates {
  if (!candsCache || candsCache.limit !== limit) {
    candsCache = heCandidates(limit);
  }
  return candsCache;
}

function makeEntry(s: number, limit: number, curve: Float64Array): Entry {
  // F10: the Fixed bounds leave out the unison and octave dips (see `HE_UNISON_EXCLUDE_C`)
  const { min, max } = heFixedRange(curve);
  const exact = new Map<number, number>();
  const at = (cents: number): number => {
    const key = Math.round((((cents % 1200) + 1200) % 1200) * 1000);
    let v = exact.get(key);
    if (v === undefined) {
      v = heAt(candsFor(limit), key / 1000, s);
      if (exact.size > EXACT_CACHE_MAX) {
        exact.clear();
      }
      exact.set(key, v);
    }
    return v;
  };
  return { s, limit, curve, source: { lo: min, hi: max, at } };
}

function finish(
  s: number,
  limit: number,
  curve: Float64Array,
  ratios: number,
  ms: number,
  cands?: HeCandidates
) {
  if (ratios > 0 && ms > 0) {
    // normalized by the N ln N growth of candidate generation, so it is comparable between limits
    msPerRatio = ms / (ratios * heLogFactor(limit));
  }
  if (cands) {
    candsCache = cands;
  }
  if (inflight && inflight.s === s && inflight.limit === limit) {
    inflight = null;
  }
  const entry = makeEntry(s, limit, curve);
  entries.set(keyOf(s, limit), entry);
  if (requested && requested.s === s && requested.limit === limit) {
    shown = entry;
    building = false;
  }
  publish();
}

/** Synchronous build (small estimates, and every environment without a Worker: jsdom). */
function buildSync(s: number, limit: number) {
  const t0 = performance.now();
  const cands = heCandidates(limit);
  candsCache = cands;
  const curve = heCurve(cands, s);
  finish(s, limit, curve, cands.cents.length, performance.now() - t0);
}

type WorkerReply = {
  id: number;
  curve: Float64Array;
  cents: Float64Array;
  weights: Float64Array;
  ratios: number;
  ms: number;
};

function startWorker(s: number, limit: number): boolean {
  // jsdom and old browsers have no Worker: the caller falls back to the synchronous build
  if (typeof Worker === 'undefined') {
    return false;
  }
  try {
    worker?.terminate(); // a newer request supersedes the running build
    const w = new Worker(new URL('./entropy.worker.ts', import.meta.url), { type: 'module' });
    worker = w;
    const id = ++jobId;
    inflight = { s, limit };
    w.onmessage = (e: MessageEvent<WorkerReply>) => {
      if (e.data.id === jobId) {
        w.terminate();
        if (worker === w) {
          worker = null;
        }
        const { curve, cents, weights, ratios, ms } = e.data;
        finish(s, limit, curve, ratios, ms, { cents, weights, limit });
      }
    };
    w.onerror = () => {
      if (id === jobId) {
        worker = null;
        inflight = null;
        buildSync(s, limit);
      }
    };
    w.postMessage({ id, s, limit });
    return true;
  } catch {
    worker = null;
    inflight = null;
    return false;
  }
}

function startBuild(s: number, limit: number) {
  timer = null;
  if (!requested || requested.s !== s || requested.limit !== limit) {
    return;
  }
  if (entries.has(keyOf(s, limit)) || (inflight && inflight.s === s && inflight.limit === limit)) {
    return; // built meanwhile, or its worker is already running
  }
  const big = estimateHeBuildMs(limit, msPerRatio ?? HE_MS_PER_RATIO_DEFAULT) > WORKER_MS;
  if (big && startWorker(s, limit)) {
    return;
  }
  buildSync(s, limit);
}

/** Ask for the curve of (s, N): shown at once when built, else built after the debounce (at once for the very first one). */
export function requestHe(s: number, limit: number) {
  if (requested && requested.s === s && requested.limit === limit) {
    return; // already shown, or already on its way
  }
  requested = { s, limit };
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const hit = entries.get(keyOf(s, limit));
  if (hit) {
    // a build still running for another (s, N) is dropped; its result is not wanted
    jobId++;
    worker?.terminate();
    worker = null;
    inflight = null;
    shown = hit;
    building = false;
    publish();
    return;
  }
  building = true;
  publish();
  if (inflight && inflight.s === s && inflight.limit === limit) {
    return; // its build is already running: leave it alone
  }
  if (!shown && !inflight) {
    startBuild(s, limit);
  } else {
    timer = setTimeout(() => startBuild(s, limit), DEBOUNCE_MS);
  }
}

/** The measured ms per ratio of the last build (null before the first). */
export const heMsPerRatio = (): number | null => msPerRatio;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const getSnapshot = () => snapshot;
/** The current snapshot without a hook (tests). */
export const getHeSnapshot = getSnapshot;

/** The status alone (the Developer menu): no build is asked for. */
export function useHeStatus(): HeSnapshot & { msPerRatio: number | null } {
  const snap = useSyncExternalStore(subscribe, getSnapshot);
  return { ...snap, msPerRatio };
}

/** The curve of the lab's s and N (asks for it while the component is mounted and `enabled`). */
export function useHeCurve(s: number, limit: number, enabled = true): HeSnapshot {
  useEffect(() => {
    if (enabled) {
      requestHe(s, limit);
    }
  }, [s, limit, enabled]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Tests: forget everything. */
export function resetHeForTests() {
  entries.clear();
  shown = null;
  requested = null;
  building = false;
  msPerRatio = null;
  candsCache = null;
  jobId++;
  worker?.terminate();
  worker = null;
  inflight = null;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  snapshot = { curve: null, source: null, building: false, s: 0, N: 0 };
}
