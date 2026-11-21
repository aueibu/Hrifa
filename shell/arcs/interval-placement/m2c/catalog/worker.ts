// Scoring worker for the placement catalog. Receives a job of keys and returns one Float64Array of results.
// Kinds (the main thread deduplicates each kind first, so every key is scored exactly once):
//  - 'rough': key = absolute note mask (bit k = k steps above the base note) -> H&K interference total (register-dependent)
//  - 'shape': key = note mask shifted so the lowest note is bit 0 -> [pitch-space harmonicity, periodicity]
//             (both are transposition-invariant on the step grid, so the shape is enough)
//  - 'pc':    key = canonical pitch-class mask (smallest rotation) -> pitch-class harmonicity (octave-blind, rotation-invariant)
import { parentPort, workerData } from 'node:worker_threads';
import { interference, harmonicity, periodicity, DEFAULT_TIMBRE, midiToHz } from '../../../../src/lib/consonance/index';

const { stepCents } = workerData as { stepCents: number };
let baseHz = midiToHz(36);

function notesOf(mask: number): number[] {
  const out: number[] = [];
  let k = 0;
  while (mask > 0) {
    if (mask % 2 === 1) out.push(k);
    mask = Math.floor(mask / 2);
    k++;
  }
  return out;
}
const hz = (steps: number[]) => steps.map((s) => baseHz * 2 ** ((s * stepCents) / 1200));

parentPort!.on('message', (job: { id: number; kind: 'rough' | 'shape' | 'pc'; keys: Float64Array; baseMidi: number }) => {
  const { kind, keys } = job;
  baseHz = midiToHz(job.baseMidi); // only roughness depends on it; shapes and pitch classes are register-free
  const width = kind === 'shape' ? 2 : 1;
  const out = new Float64Array(keys.length * width);
  for (let i = 0; i < keys.length; i++) {
    if (kind === 'pc') {
      const pcs: number[] = [];
      for (let p = 0; p < 12; p++) if (Math.floor(keys[i] / 2 ** p) % 2 === 1) pcs.push(p);
      out[i] = harmonicity(hz(pcs), { space: 'pitch-class' }).value;
      continue;
    }
    const f = hz(notesOf(keys[i]));
    if (kind === 'rough') {
      out[i] = interference(f, DEFAULT_TIMBRE, { model: 'hutchinson-knopoff', decompose: false }).total;
    } else {
      out[2 * i] = harmonicity(f, { space: 'pitch' }).value;
      out[2 * i + 1] = periodicity(f).value;
    }
  }
  parentPort!.postMessage({ id: job.id, out }, [out.buffer]);
});
