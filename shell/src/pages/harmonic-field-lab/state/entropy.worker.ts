/**
 * M9: builds one harmonic entropy curve off the main thread. One message in `{ id, s, limit }`, one out
 * `{ id, curve, cents, weights, ratios, ms }` (the buffers are transferred; the candidates come back so the main thread does not rebuild
 * them for the exact single values). Imports the lib file directly, not the barrel, so the worker stays small.
 */
import { heCandidates, heCurve } from '../../../lib/harmonic-field/harmonicEntropy';

interface Req {
  id: number;
  s: number;
  limit: number;
}

const scope = self as unknown as {
  onmessage: ((e: { data: Req }) => void) | null;
  postMessage: (msg: unknown, transfer: Transferable[]) => void;
};

scope.onmessage = (e) => {
  const { id, s, limit } = e.data;
  const t0 = performance.now();
  const cands = heCandidates(limit);
  const curve = heCurve(cands, s);
  scope.postMessage(
    {
      id,
      curve,
      cents: cands.cents,
      weights: cands.weights,
      ratios: cands.cents.length,
      ms: performance.now() - t0,
    },
    [curve.buffer, cands.cents.buffer, cands.weights.buffer]
  );
};
