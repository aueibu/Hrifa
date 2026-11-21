// Interval Placement catalog v2: streaming, resumable, load- and memory-aware. One SQLite file per cardinality.
// Each worker builds and scores one whole interval set (worker2.ts) and returns rows; this process is the only writer
// and commits each set together with its "done" mark, so a stopped run resumes where it left off.
//
// Sharing the machine (built for the VM that also runs other jobs):
//  - start it under `nice -n 10` so other jobs keep priority (the workers inherit it);
//  - the worker count follows the load: every 30 s, target = nproc - (load not caused by us) - headroom, clamped to
//    [1, --max-workers]; extra workers retire after their current set;
//  - no new set is started while MemAvailable is below --reserve-gb; each worker's heap is capped.
//
//  - the cap can be changed during the run by writing a number to <out>/max-workers.
//
// Usage: node build2.mjs --n 2,3,4,5 --max 17 --wmax 60 --out <dir> [--max-workers 15] [--reserve-gb 6] [--min-largest 18]
//   [--headroom 1] [--worker-heap-mb 768] [--verify 200]
import { Worker } from 'node:worker_threads';
import { cpus, loadavg, freemem } from 'node:os';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { scoreVoicing, midiToHz } from '../../../../src/lib/consonance/index';
import { COLUMNS, BASES, orderingsOf } from './worker2';

const arg = (name: string, def: string) => { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : def; };
const NS = arg('n', '2,3,4,5').split(',').map(Number);
const MAX = Number(arg('max', '17'));
const WMIN = Number(arg('wmin', '1'));
// Only sets whose largest interval is at least this (an addendum run that extends --max without redoing smaller sets).
const MIN_LARGEST = Number(arg('min-largest', '1'));
const WMAX = Number(arg('wmax', '60'));
const OUT = arg('out', 'catalog-v2');
const NPROC = cpus().length;
const MAX_WORKERS = Number(arg('max-workers', String(Math.max(1, NPROC - 1))));
const RESERVE = Number(arg('reserve-gb', '6')) * 1024 ** 3;
const HEADROOM = Number(arg('headroom', '1'));
const HEAP_MB = Number(arg('worker-heap-mb', '768'));
const VERIFY = Number(arg('verify', '200'));
mkdirSync(OUT, { recursive: true });
const t0 = Date.now();
const stamp = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const log = (...a: unknown[]) => console.log(`[${stamp()} +${((Date.now() - t0) / 60000).toFixed(1)}m]`, ...a);

function memAvailable(): number {
  try {
    const m = /MemAvailable:\s+(\d+) kB/.exec(readFileSync('/proc/meminfo', 'utf8'));
    if (m) return Number(m[1]) * 1024;
  } catch { /* not Linux */ }
  return freemem();
}
function multisets(n: number, max: number): number[][] {
  const out: number[][] = [];
  const rec = (start: number, acc: number[]) => {
    if (acc.length === n) return void out.push(acc.slice());
    for (let v = start; v <= max; v++) rec(v, [...acc, v]);
  };
  rec(1, []);
  return out;
}
/** The worker cap can be changed while the run goes: write a number to <out>/max-workers (read every 30 s). */
function liveMaxWorkers(): number {
  try {
    const v = Number(readFileSync(join(OUT, 'max-workers'), 'utf8').trim());
    if (Number.isInteger(v) && v >= 1) return Math.min(v, NPROC);
  } catch { /* no control file: use --max-workers */ }
  return MAX_WORKERS;
}
const fmtDur = (ms: number) => { const m = Math.round(ms / 60000); return m >= 120 ? `${(m / 60).toFixed(1)} h` : `${m} min`; };

async function runCardinality(n: number) {
  const file = join(OUT, `catalog-n${n}.sqlite`);
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA cache_size = -262144;
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS sets (set_id INTEGER PRIMARY KEY, n INTEGER, intervals TEXT, largest INTEGER);
CREATE TABLE IF NOT EXISTS orderings (set_id INTEGER, ord INTEGER, ordering TEXT, PRIMARY KEY (set_id, ord)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS done_sets (set_id INTEGER PRIMARY KEY, rows INTEGER, finished TEXT);
CREATE TABLE IF NOT EXISTS placements (${COLUMNS.map((c) => `${c} ${['rule', 'notes', 'down_notes', 'up_notes'].includes(c) ? 'TEXT' : ['band', 'round_max', 'round_mean', 'rough', 'rough_c3', 'harm_pitch', 'harm_pc', 'periodicity', 'down_rough', 'down_harm', 'up_rough', 'up_harm'].includes(c) ? 'REAL' : 'INTEGER'}`).join(', ')});`);
  const sets = multisets(n, MAX).filter((s) => s[n - 1] >= MIN_LARGEST);
  const metaGet = db.prepare('SELECT value FROM meta WHERE key = ?');
  const params = JSON.stringify({ n, max: MAX, wmin: WMIN, wmax: WMAX, bases: BASES, ...(MIN_LARGEST > 1 ? { minLargest: MIN_LARGEST } : {}) });
  const prev = metaGet.get('params') as { value: string } | undefined;
  if (prev && prev.value !== params) throw new Error(`${file} was built with other parameters: ${prev.value}`);
  if ((metaGet.get('finalized') as { value: string } | undefined)?.value === '1') { log(`n=${n}: already finished, skipping`); db.close(); return; }
  if (!prev) {
    db.exec('BEGIN');
    const meta = db.prepare('INSERT INTO meta VALUES (?, ?)');
    for (const [k, v] of Object.entries({
      params, n, max_interval: MAX, min_largest: MIN_LARGEST, window_min: WMIN, window_max: WMAX, bases_midi: BASES.join(','),
      rules: 'equal = equal centers (chord fills the window); shared = shared center range [M/2, W-M/2], centers equally spaced',
      rounding: "bottom note = nearest step to (center - size/2); ties round toward the middle of the window (centred exactly on the middle: down); down_* / up_* = every tie rounded down / up",
      scores: 'rough = Hutchinson-Knopoff interference total from C2 (lower smoother); rough_c3 = the same from C3; harm_pitch = pitch-space harmonicity (higher more fused); harm_pc = pitch-class harmonicity; periodicity = Stolzenburg (lower simpler)',
      started: new Date().toISOString(),
    })) meta.run(k, String(v));
    const sIns = db.prepare('INSERT INTO sets VALUES (?, ?, ?, ?)');
    const oIns = db.prepare('INSERT INTO orderings VALUES (?, ?, ?)');
    sets.forEach((s, i) => { sIns.run(i, n, s.join(' '), s[n - 1]); orderingsOf(s).forEach((o, k) => oIns.run(i, k, o.join(' '))); });
    db.exec('COMMIT');
  }
  const done = new Set((db.prepare('SELECT set_id FROM done_sets').all() as { set_id: number }[]).map((r) => r.set_id));
  // work weight of a set ~ orderings x windows (for progress and time estimates)
  const weight = (s: number[]) => orderingsOf(s).length * Math.max(0, WMAX - Math.max(s[n - 1], WMIN) + 1);
  const todo = sets.map((s, i) => ({ s, i, w: weight(s) })).filter((x) => !done.has(x.i)).sort((a, b) => b.w - a.w); // big sets first
  const totalW = sets.reduce((t, s) => t + weight(s), 0);
  let doneW = totalW - todo.reduce((t, x) => t + x.w, 0);
  log(`n=${n}: ${sets.length} sets, ${todo.length} to do (${done.size} already done), file ${file}`);
  if (todo.length) {
    const ins = db.prepare(`INSERT INTO placements VALUES (${COLUMNS.map(() => '?').join(',')})`);
    const mark = db.prepare('INSERT INTO done_sets VALUES (?, ?, ?)');
    const pool: { w: Worker; busy: boolean; retire: boolean }[] = [];
    let next = 0, finished = 0, rowsWritten = 0, failed: string | null = null;
    const runStart = Date.now(), wAtStart = doneW;
    let target = 1;
    await new Promise<void>((resolve, reject) => {
      const spawn = () => {
        const w = new Worker(new URL('./worker2.mjs', import.meta.url), { resourceLimits: { maxOldGenerationSizeMb: HEAP_MB } });
        const slot = { w, busy: false, retire: false };
        w.on('message', (m: { setId: number; rows?: unknown[][]; error?: string }) => {
          slot.busy = false;
          if (m.error) { failed = `set ${m.setId}: ${m.error}`; return reject(new Error(failed)); }
          db.exec('BEGIN');
          for (const r of m.rows!) ins.run(...(r as never[]));
          mark.run(m.setId, m.rows!.length, new Date().toISOString());
          db.exec('COMMIT');
          rowsWritten += m.rows!.length;
          finished++;
          doneW += weight(sets[m.setId]);
          if (finished === todo.length) return resolve();
          feed(slot);
        });
        w.on('error', (e) => reject(e));
        pool.push(slot);
        return slot;
      };
      const feed = (slot: { w: Worker; busy: boolean; retire: boolean }) => {
        if (slot.retire) { slot.w.terminate(); pool.splice(pool.indexOf(slot), 1); return; }
        if (next >= todo.length || slot.busy) return;
        if (memAvailable() < RESERVE) return; // the 30 s tick retries
        const t = todo[next++];
        slot.busy = true;
        slot.w.postMessage({ setId: t.i, set: t.s, wmin: WMIN, wmax: WMAX });
      };
      const tick = () => {
        const ours = pool.filter((p) => p.busy).length;
        const others = Math.max(0, loadavg()[0] - ours);
        target = Math.max(1, Math.min(liveMaxWorkers(), Math.floor(NPROC - others - HEADROOM)));
        const live = pool.filter((p) => !p.retire);
        if (live.length < target) for (let k = live.length; k < target; k++) feed(spawn());
        else if (live.length > target) live.slice(target).forEach((p) => { p.retire = true; if (!p.busy) feed(p); });
        for (const p of pool) if (!p.busy && !p.retire) feed(p);
      };
      tick();
      const timer = setInterval(tick, 30_000);
      const report = setInterval(() => {
        const frac = doneW / totalW, rate = (doneW - wAtStart) / (Date.now() - runStart);
        const eta = rate > 0 ? (totalW - doneW) / rate : NaN;
        log(`n=${n}: ${(100 * frac).toFixed(1)}% (${finished}/${todo.length} sets this run, ${rowsWritten.toLocaleString()} rows), workers ${pool.filter((p) => !p.retire).length} (target ${target}), load ${loadavg()[0].toFixed(1)}, mem free ${(memAvailable() / 1024 ** 3).toFixed(1)} GB, left ~${Number.isNaN(eta) ? '?' : fmtDur(eta)}`);
      }, 60_000);
      const stop = () => { clearInterval(timer); clearInterval(report); };
      const res = resolve, rej = reject;
      resolve = (() => { stop(); res(); }) as typeof resolve;
      reject = ((e: unknown) => { stop(); rej(e); }) as typeof reject;
    });
    await Promise.all(pool.map((p) => p.w.terminate()));
    log(`n=${n}: all sets done, ${rowsWritten.toLocaleString()} rows this run`);
  }
  // ---- verify a sample against scoreVoicing, then index and summarize ----
  const maxRow = (db.prepare('SELECT MAX(rowid) AS m FROM placements').get() as { m: number }).m;
  const one = db.prepare('SELECT notes, rough, rough_c3, harm_pitch, harm_pc, periodicity FROM placements WHERE rowid = ?');
  const sample = Array.from({ length: VERIFY }, () => one.get(1 + Math.floor(Math.random() * maxRow))).filter(Boolean) as
    { notes: string; rough: number; rough_c3: number; harm_pitch: number; harm_pc: number; periodicity: number }[];
  let maxDiff = 0;
  for (const r of sample) {
    const cents = r.notes.split(' ').map((x) => Number(x) * 100);
    const a = scoreVoicing({ refHz: midiToHz(BASES[0]), cents }, { decompose: false });
    const b = scoreVoicing({ refHz: midiToHz(BASES[1]), cents }, { decompose: false });
    maxDiff = Math.max(maxDiff, Math.abs(a.interference.hutchinsonKnopoff.total - r.rough), Math.abs(b.interference.hutchinsonKnopoff.total - r.rough_c3),
      Math.abs(a.harmonicity.pitch.value - r.harm_pitch), Math.abs(a.harmonicity.pitchClass.value - r.harm_pc), Math.abs(a.periodicity.value - r.periodicity));
  }
  log(`n=${n}: verify ${sample.length} rows vs scoreVoicing: largest difference ${maxDiff.toExponential(2)}`);
  if (maxDiff > 1e-6) throw new Error('stored scores differ from scoreVoicing');
  log(`n=${n}: building indexes and summaries`);
  db.exec(`
CREATE INDEX IF NOT EXISTS placements_lookup ON placements (set_id, window, rule);
CREATE INDEX IF NOT EXISTS placements_notes ON placements (notes);
CREATE VIEW IF NOT EXISTS placement_view AS
  SELECT p.*, s.intervals AS "set", o.ordering FROM placements p JOIN sets s USING (set_id) JOIN orderings o USING (set_id, ord);
DROP TABLE IF EXISTS summary_merges;
CREATE TABLE summary_merges AS
  SELECT rule, window, COUNT(*) AS placements, AVG(merges) AS avg_merges, AVG(merges > 0) AS share_with_merge,
    SUM(merge_stack) AS stack_pairs, SUM(merge_bottom) AS bottom_pairs, SUM(merge_top) AS top_pairs, AVG(round_max) AS avg_round_max
  FROM placements GROUP BY rule, window;
DROP TABLE IF EXISTS summary_rounding;
CREATE TABLE summary_rounding AS
  SELECT rule, window, COUNT(*) AS placements, AVG(ties > 0) AS share_with_tie, AVG(ties = 0 OR (down_notes = notes AND up_notes = notes)) AS share_grid_robust,
    AVG(mirror_ok) AS share_mirror_ok FROM placements GROUP BY rule, window;
DROP TABLE IF EXISTS summary_winners;
CREATE TABLE summary_winners AS
  SELECT p.rule, p.set_id, p.window, GROUP_CONCAT(o.ordering, ' / ') AS best_rough_orderings
  FROM placements p JOIN orderings o USING (set_id, ord) WHERE p.rank_rough = 1 GROUP BY p.rule, p.set_id, p.window;
ANALYZE;`);
  db.prepare('INSERT OR REPLACE INTO meta VALUES (?, ?)').run('finalized', '1');
  db.prepare('INSERT OR REPLACE INTO meta VALUES (?, ?)').run('finished', new Date().toISOString());
  db.close();
  log(`n=${n}: finished ${file}`);
}

log(`catalog v2: n=${NS.join(',')}, sizes 1..${MAX}, windows ${WMIN}..${WMAX}, roots ${BASES.join(',')}; ${NPROC} CPUs, max workers ${MAX_WORKERS}, memory reserve ${(RESERVE / 1024 ** 3).toFixed(0)} GB, mem free ${(memAvailable() / 1024 ** 3).toFixed(1)} GB`);
for (const n of NS) await runCardinality(n);
log('all done');
