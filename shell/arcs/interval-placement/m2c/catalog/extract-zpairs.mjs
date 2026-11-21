// Pitch-space Z-relation (human, 2026-11-21: "a meta level z-relation where the entire structure is considered"):
// chords with the same multiset of all pairwise distances in steps (no octave reduction) that are not a transposition
// or mirror of each other (homometric sets). Reads v2 catalogs, writes a JSON for the findings page and, optionally,
// tables zpairs / zproducers into the chord index.
// Usage: node extract-zpairs.mjs <out.json> [--index chord-index.sqlite] <catalog-n3.sqlite> <catalog-n4.sqlite> ...
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const out = args.shift();
let indexFile = null;
if (args[0] === '--index') { args.shift(); indexFile = args.shift(); }
const files = args;
const t0 = Date.now();
const lap = (w) => console.log(`${w} ${((Date.now() - t0) / 1000).toFixed(0)} s`);
// one name for a chord, its transpositions and its mirror; mirrored = the placed chord is the mirror of that name
const classOf = (ns) => {
  const top = ns[ns.length - 1] - ns[0];
  const a = ns.map((x) => x - ns[0]).join(' ');
  const b = ns.map((x) => top - (x - ns[0])).reverse().join(' ');
  return a <= b ? [a, false] : [b, true];
};
const contentOf = (key) => {
  const ns = key.split(' ').map(Number), d = [];
  for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) d.push(ns[j] - ns[i]);
  return d.sort((x, y) => x - y).join(' ');
};

// pass 1: every chord class with 6+ notes (fewer cannot be homometric without being congruent)
const classes = new Set();
for (const f of files) {
  const db = new DatabaseSync(f, { readOnly: true });
  for (const r of db.prepare('SELECT DISTINCT notes FROM placements WHERE note_count >= 6').iterate()) classes.add(classOf(r.notes.split(' ').map(Number))[0]);
  db.close();
  lap(`pass 1 ${f.split(/[\\/]/).pop()} (${classes.size} classes)`);
}
const byContent = new Map();
for (const key of classes) { const c = contentOf(key); (byContent.get(c) || byContent.set(c, []).get(c)).push(key); }
const groups = [...byContent].filter(([, ks]) => ks.length > 1).map(([content, ks]) => ({ content, chords: ks.sort() }));
groups.sort((x, y) => x.chords[0].split(' ').length - y.chords[0].split(' ').length || +x.chords[0].split(' ').pop() - +y.chords[0].split(' ').pop() || (x.content < y.content ? -1 : 1));
const want = new Map(); // class -> [group index, chord index]
groups.forEach((g, gi) => g.chords.forEach((k, ci) => want.set(k, [gi, ci])));
lap(`${groups.length} groups`);

// pass 2: every placement that lands on one of those chords (any transposition or mirror)
const prod = groups.map((g) => g.chords.map(() => new Map())); // set key -> { n, set, merges, placements, rules: {rule: [ordering, W, notes, mirrored]} }
const rows = [];
for (const f of files) {
  const db = new DatabaseSync(f, { readOnly: true });
  for (const r of db.prepare(`SELECT p.notes, s.n, s.intervals, p.rule, o.ordering, p.window, p.merges, p.rough FROM placements p
      JOIN sets s USING (set_id) JOIN orderings o USING (set_id, ord) WHERE p.note_count >= 6`).iterate()) {
    const ns = r.notes.split(' ').map(Number);
    const [key, mirrored] = classOf(ns);
    const hit = want.get(key);
    if (!hit) continue;
    const m = prod[hit[0]][hit[1]];
    const sk = `${r.n}:${r.intervals}`;
    let e = m.get(sk);
    if (!e) m.set(sk, (e = { n: r.n, set: r.intervals, merges: r.merges, placements: 0, rules: {} }));
    e.placements++;
    if (!e.rules[r.rule]) e.rules[r.rule] = [r.ordering, r.window, r.notes, mirrored, +r.rough.toFixed(3)];
    rows.push([hit[0], hit[1], r.n, r.intervals, r.rule, r.ordering, r.window, r.notes, mirrored ? 1 : 0, r.merges]);
  }
  db.close();
  lap(`pass 2 ${f.split(/[\\/]/).pop()}`);
}
const result = {
  sources: files.map((f) => f.split(/[\\/]/).pop()),
  classes: classes.size,
  groups: groups.map((g, gi) => ({
    content: g.content,
    chords: g.chords.map((k, ci) => ({ shape: k, producers: [...prod[gi][ci].values()].sort((a, b) => a.n - b.n || a.set.localeCompare(b.set, undefined, { numeric: true })) })),
  })),
};
// the arithmetic check: a k-note chord from n intervals has 2n - k merged notes
let bad = 0;
for (const g of result.groups) for (const c of g.chords) for (const p of c.producers) if (p.merges !== 2 * p.n - c.shape.split(' ').length) bad++;
console.log('merges = 2n - notes violated:', bad);
writeFileSync(out, JSON.stringify(result));
lap(`wrote ${out}`);
if (indexFile) {
  const db = new DatabaseSync(indexFile);
  db.exec(`DROP TABLE IF EXISTS zpairs; DROP TABLE IF EXISTS zproducers;
    CREATE TABLE zpairs (group_id INTEGER, member INTEGER, shape TEXT, note_count INTEGER, content TEXT, sets INTEGER, cards TEXT, PRIMARY KEY (group_id, member)) WITHOUT ROWID;
    CREATE TABLE zproducers (group_id INTEGER, member INTEGER, n INTEGER, intervals TEXT, rule TEXT, ordering TEXT, window INTEGER, notes TEXT, mirrored INTEGER, merges INTEGER);`);
  db.exec('BEGIN');
  const a = db.prepare('INSERT INTO zpairs VALUES (?, ?, ?, ?, ?, ?, ?)');
  result.groups.forEach((g, gi) => g.chords.forEach((c, ci) => a.run(gi, ci, c.shape, c.shape.split(' ').length, g.content, c.producers.length, [...new Set(c.producers.map((p) => p.n))].join(' '))));
  const b = db.prepare('INSERT INTO zproducers VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const r of rows) b.run(...r);
  db.exec('COMMIT; CREATE INDEX zproducers_group ON zproducers (group_id, member);');
  db.close();
  lap(`tables zpairs / zproducers in ${indexFile}`);
}
