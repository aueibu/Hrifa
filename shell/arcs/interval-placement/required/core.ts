// Worker for the required-intervals explorer: builds every collection (required.ts) and scores each one with the
// app's consonance library (Hutchinson & Knopoff roughness at the chosen root, pitch-space harmonicity). Bundled to an
// IIFE and started from a blob URL by required-page.template.html.
import { interference, harmonicity, DEFAULT_TIMBRE, midiToHz } from '../../../src/lib/consonance/index';
import { collections, type Opts } from './required';

type Job = { id: number; opts: Opts; base: number };
// scores kept across jobs: changing a filter re-runs the search but never re-scores a collection
const HARM = new Map<string, number>();
const ROUGH = new Map<string, number>();

self.onmessage = (ev: MessageEvent<Job>) => {
  const { id, opts, base } = ev.data;
  const post = (m: unknown) => (self as unknown as Worker).postMessage(m);
  const t0 = Date.now();
  const res = collections(opts);
  post({ id, type: 'progress', done: 0, total: res.list.length, built: Date.now() - t0 });
  const baseHz = midiToHz(base);
  let last = 0;
  res.list.forEach((c, i) => {
    const hz = c.notes.map((s) => baseHz * 2 ** (s / 12));
    const key = c.notes.join(' ');
    let h = HARM.get(key);
    if (h === undefined) { h = harmonicity(hz, { space: 'pitch' }).value; HARM.set(key, h); }
    let r = ROUGH.get(`${base}|${key}`);
    if (r === undefined) { r = interference(hz, DEFAULT_TIMBRE, { model: 'hutchinson-knopoff', decompose: false }).total; ROUGH.set(`${base}|${key}`, r); }
    (c as unknown as { rough: number; harm: number }).rough = r;
    (c as unknown as { rough: number; harm: number }).harm = h;
    const now = Date.now();
    if (now - last > 150) { last = now; post({ id, type: 'progress', done: i + 1, total: res.list.length }); }
  });
  post({ id, type: 'done', ...res });
};
