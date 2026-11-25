import type { PlaybackRequest } from '../audio/types';

/**
 * A stand-in audio engine for the scene panel tests: it records each request, keeps one session per
 * source id (so `clock` and `subscribe` behave like the real engine's) and lets a test set when the
 * material "started". With `hold` set, `play` stays pending (the real engine's async start: Tone start,
 * sample loading) until `resolvePending` is called; the session exists only after it resolves. Test
 * helper only.
 */
interface MockSession {
  id: string;
  sourceId: string;
}

const sessions = new Map<string, MockSession>();
const listeners = new Set<() => void>();
const pending: (() => void)[] = [];
const notify = () => listeners.forEach((listener) => listener());
let counter = 0;

export const mockEngineState = {
  played: [] as PlaybackRequest[],
  stopped: 0,
  /** What `clock(sourceId).startedAtMs` returns while a session for it is open. */
  startedAtMs: 1000,
  /** While true, `play` waits for `resolvePending`. */
  hold: false,
  /** The source ids with a live session. */
  live: () => [...sessions.keys()],
  /** How many `play` calls are waiting. */
  pendingCount: () => pending.length,
  /** Lets every waiting `play` finish (it then opens its session). */
  resolvePending() {
    pending.splice(0).forEach((resolve) => resolve());
  },
  reset() {
    this.played.length = 0;
    this.stopped = 0;
    this.startedAtMs = 1000;
    this.hold = false;
    pending.length = 0;
    sessions.clear();
    listeners.clear();
  },
};

function stopSource(sourceId: string) {
  if (sessions.delete(sourceId)) {
    mockEngineState.stopped += 1;
    notify();
  }
}

export const mockEngine = {
  play: async (request: PlaybackRequest) => {
    mockEngineState.played.push(request);
    const sourceId = request.plan.sourceId;
    counter += 1;
    const id = `s${counter}`;
    if (mockEngineState.hold) {
      await new Promise<void>((resolve) => pending.push(resolve));
    }
    sessions.set(sourceId, { id, sourceId });
    notify();
    return {
      id,
      sourceId,
      active: true,
      // A session stops only itself: a late stop of a replaced start must not end a newer session.
      stop: () => {
        if (sessions.get(sourceId)?.id === id) {
          stopSource(sourceId);
        }
      },
      setBusGain: () => undefined,
    };
  },
  stopSource,
  stopAll: () => [...sessions.keys()].forEach(stopSource),
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  clock: (sourceId: string) =>
    sessions.has(sourceId) ? { startedAtMs: mockEngineState.startedAtMs } : undefined,
};
