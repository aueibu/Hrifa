/** The entropy store in plain Node: no Worker exists there, so every build takes the synchronous path (the jsdom fallback). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { heAt, heCandidates } from '../../../lib/harmonic-field/harmonicEntropy';
import { DEBOUNCE_MS, getHeSnapshot, heMsPerRatio, requestHe, resetHeForTests } from './entropy';

beforeEach(() => {
  // performance.now stays real: the build time is measured with it
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  resetHeForTests();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('entropy store', () => {
  it('the first request builds at once (sync without a Worker) and records the ms per ratio', () => {
    expect(typeof Worker).toBe('undefined');
    requestHe(17, 10000);
    const snap = getHeSnapshot();
    expect(snap.curve).not.toBeNull();
    expect(snap.curve!.length).toBe(1201);
    expect(snap.building).toBe(false);
    expect(snap.s).toBe(17);
    expect(snap.N).toBe(10000);
    expect(heMsPerRatio()).toBeGreaterThan(0);
  });

  it('a new s keeps the old curve while building, builds once after the debounce, and going back is instant', () => {
    requestHe(17, 10000);
    const c17 = getHeSnapshot().curve;
    requestHe(15, 10000);
    requestHe(14, 10000);
    requestHe(12, 10000);
    let snap = getHeSnapshot();
    expect(snap.building).toBe(true);
    expect(snap.curve).toBe(c17);
    vi.advanceTimersByTime(DEBOUNCE_MS + 1);
    snap = getHeSnapshot();
    expect(snap.building).toBe(false);
    expect(snap.s).toBe(12);
    expect(snap.curve).not.toBe(c17);
    requestHe(17, 10000);
    expect(getHeSnapshot().curve).toBe(c17);
    expect(getHeSnapshot().building).toBe(false);
  });

  it('requesting the (s, N) of a running worker build again does not start another build', () => {
    const made: { terminated: boolean }[] = [];
    class FakeWorker {
      onmessage: unknown = null;
      onerror: unknown = null;
      terminated = false;
      constructor() {
        made.push(this);
      }
      postMessage() {}
      terminate() {
        this.terminated = true;
      }
    }
    vi.stubGlobal('Worker', FakeWorker);
    try {
      requestHe(17, 500000); // first request: builds at once, in the (fake) worker
      expect(made).toHaveLength(1);
      requestHe(15, 500000); // another s: waits for the debounce
      requestHe(17, 500000); // back to the running one: its timer is dropped, the build is left alone
      vi.advanceTimersByTime(DEBOUNCE_MS * 3);
      expect(made).toHaveLength(1);
      expect(made[0].terminated).toBe(false);
      expect(getHeSnapshot().building).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('single values are exact, octave-folded and remembered', () => {
    requestHe(17, 10000);
    const src = getHeSnapshot().source!;
    const c = 1200 * Math.log2(1.5);
    expect(src.at(c)).toBeCloseTo(heAt(heCandidates(10000), c, 17), 3);
    expect(src.at(c + 1200)).toBeCloseTo(src.at(c), 9);
    expect(src.lo).toBeLessThan(src.hi);
  });
});
