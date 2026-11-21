// Chord index: which input sets produce the same chord (human, 2026-11-21: "a semi-arbitrary type of z relation").
// Reads v2 catalogs (any cardinalities) and writes one SQLite file:
//   chords(chord_id, notes, shape, note_count, rough, harm_pitch, sets, cards, producers)
//     every chord (exact notes, steps from the window's bottom C2) that two or more different input sets produce
//   producers(chord_id, n, intervals, rule, ordering, window)  every placement that lands on one of those chords
//   shapes(shape, note_count, sets, cards, chords)  the same, with transpositions counted as one chord
//   summary(scope, key, chords, multi, max_sets)  share of chords made by more than one set, overall / by n / by window
// Usage: node build-chord-index.mjs <out.sqlite> <catalog-n2.sqlite> <catalog-n3.sqlite> ...
import { DatabaseSync } from 'node:sqlite';
import { existsSync, rmSync } from 'node:fs';

const [out, ...files] = process.argv.slice(2);
for (const f of [out, out + '-wal', out + '-shm']) if (existsSync(f)) rmSync(f);
const db = new DatabaseSync(out);
db.exec(`PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF; PRAGMA temp_store = FILE;
CREATE TABLE allp (notes TEXT, shape TEXT, note_count INTEGER, n INTEGER, intervals TEXT, rule TEXT, ordering TEXT, window INTEGER, rough REAL, harm_pitch REAL);`);
const t0 = Date.now();
const lap = (what) => console.log(`${what} ${((Date.now() - t0) / 1000).toFixed(0)} s`);
const ins = db.prepare('INSERT INTO allp VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
const meta = [];
for (const f of files) {
  const src = new DatabaseSync(f, { readOnly: true });
  const m = Object.fromEntries(src.prepare('SELECT key, value FROM meta').all().map((r) => [r.key, r.value]));
  meta.push({ file: f.split(/[\\/]/).pop(), n: Number(m.n), max: Number(m.max_interval), wmax: Number(m.window_max), min_largest: m.min_largest ?? null });
  db.exec('BEGIN');
  for (const r of src.prepare(`SELECT p.notes, p.note_count, s.n, s.intervals, p.rule, o.ordering, p.window, p.rough, p.harm_pitch
      FROM placements p JOIN sets s USING (set_id) JOIN orderings o USING (set_id, ord)`).iterate()) {
    const ns = r.notes.split(' ').map(Number);
    ins.run(r.notes, ns.map((x) => x - ns[0]).join(' '), r.note_count, r.n, r.intervals, r.rule, r.ordering, r.window, r.rough, r.harm_pitch);
  }
  db.exec('COMMIT');
  src.close();
  lap(`read ${f.split(/[\\/]/).pop()}`);
}
db.exec('CREATE INDEX allp_notes ON allp (notes); CREATE INDEX allp_shape ON allp (shape);');
lap('indexed');
db.exec(`
CREATE TABLE chords (chord_id INTEGER PRIMARY KEY, notes TEXT UNIQUE, shape TEXT, note_count INTEGER, rough REAL, harm_pitch REAL,
  sets INTEGER, cards TEXT, producers INTEGER);
INSERT INTO chords (notes, shape, note_count, rough, harm_pitch, sets, cards, producers)
  SELECT notes, MIN(shape), MIN(note_count), MIN(rough), MIN(harm_pitch), COUNT(DISTINCT n || ':' || intervals),
    (SELECT GROUP_CONCAT(n, ' ') FROM (SELECT DISTINCT n FROM allp b WHERE b.notes = a.notes ORDER BY n)), COUNT(*)
  FROM allp a GROUP BY notes HAVING COUNT(DISTINCT n || ':' || intervals) > 1 ORDER BY note_count, notes;
CREATE TABLE producers (chord_id INTEGER, n INTEGER, intervals TEXT, rule TEXT, ordering TEXT, window INTEGER);
INSERT INTO producers SELECT c.chord_id, a.n, a.intervals, a.rule, a.ordering, a.window FROM allp a JOIN chords c USING (notes)
  ORDER BY c.chord_id, a.n, a.intervals, a.rule, a.ordering, a.window;
CREATE INDEX producers_chord ON producers (chord_id);
CREATE INDEX producers_set ON producers (intervals, rule, window);
CREATE INDEX chords_shape ON chords (shape);`);
lap('chords and producers');
db.exec(`
CREATE TABLE shapes (shape TEXT PRIMARY KEY, note_count INTEGER, sets INTEGER, cards TEXT, chords INTEGER) WITHOUT ROWID;
INSERT INTO shapes SELECT shape, MIN(note_count), COUNT(DISTINCT n || ':' || intervals),
    (SELECT GROUP_CONCAT(n, ' ') FROM (SELECT DISTINCT n FROM allp b WHERE b.shape = a.shape ORDER BY n)), COUNT(DISTINCT notes)
  FROM allp a GROUP BY shape HAVING COUNT(DISTINCT n || ':' || intervals) > 1;
CREATE TABLE summary (scope TEXT, key TEXT, chords INTEGER, multi INTEGER, max_sets INTEGER);
CREATE TEMP TABLE per AS SELECT notes, MIN(window) window, COUNT(DISTINCT n || ':' || intervals) sets, GROUP_CONCAT(DISTINCT n) ns FROM allp GROUP BY notes;
INSERT INTO summary SELECT 'all', '', COUNT(*), SUM(sets > 1), MAX(sets) FROM per;
INSERT INTO summary SELECT 'window', window, COUNT(*), SUM(sets > 1), MAX(sets) FROM per GROUP BY window;
INSERT INTO summary SELECT 'shape', '', COUNT(*), SUM(sets > 1), MAX(sets) FROM (SELECT shape, COUNT(DISTINCT n || ':' || intervals) sets FROM allp GROUP BY shape);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);`);
db.prepare('INSERT INTO meta VALUES (?, ?)').run('sources', JSON.stringify(meta));
db.prepare('INSERT INTO meta VALUES (?, ?)').run('built', new Date().toISOString());
db.exec('DROP TABLE allp; VACUUM;');
lap('shapes and summary');
console.log(db.prepare("SELECT * FROM summary WHERE scope <> 'window'").all());
console.log(db.prepare("SELECT COUNT(*) chords, SUM(cards LIKE '% %') cross_card, MAX(sets) max_sets FROM chords").get());
db.close();
