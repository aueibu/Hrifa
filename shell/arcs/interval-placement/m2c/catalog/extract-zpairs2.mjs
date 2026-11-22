// Pitch-space Z-relation at catalog scale (n = 5): the same result as extract-zpairs.mjs, but the chord classes live in
// a SQLite work file instead of a JavaScript Set, so memory stays flat however many classes there are (n = 3-4 had
// 1.9 million; n = 5 has many more). Chords: the same multiset of all pairwise distances in steps (no octave
// reduction), not a transposition or mirror of each other (homometric sets; 6+ notes).
// Usage: node extract-zpairs2.mjs <out.json> <work.sqlite> [--max-members N] <catalog-n3.sqlite> <catalog-n4.sqlite> ...
//   Writes the page JSON and, in the work file, tables zpairs / zproducers (copy them into the chord index with
//   ATTACH once that file is finished). Stops after pass 1 if the groups have more than N members (default 200000),
//   so a surprise does not fill memory in pass 2.
import { DatabaseSync } from 'node:sqlite';
import { existsSync, rmSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const out = args.shift(), work = args.shift();
let maxMembers = 200000;
if (args[0] === '--max-members') { args.shift(); maxMembers = Number(args.shift()); }
const files = args;
const t0 = Date.now();
const lap = (w) => console.log(`${w} ${((Date.now() - t0) / 1000).toFixed(0)} s`);
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

for (const f of [work, work + '-wal', work + '-shm', work + '-journal']) if (existsSync(f)) rmSync(f);
const W = new DatabaseSync(work);
W.exec(`PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF; PRAGMA temp_store = FILE; PRAGMA cache_size = -2000000;
  CREATE TABLE cls (class TEXT PRIMARY KEY) WITHOUT ROWID;`);

// pass 1: every distinct chord class with 6+ notes, deduplicated by the primary key (no DISTINCT sort on the catalog)
const addCls = W.prepare('INSERT OR IGNORE INTO cls VALUES (?)');
for (const f of files) {
  const db = new DatabaseSync(f, { readOnly: true });
  let k = 0;
  W.exec('BEGIN');
  for (const r of db.prepare('SELECT notes FROM placements WHERE note_count >= 6').iterate()) {
    addCls.run(classOf(r.notes.split(' ').map(Number))[0]);
    if (++k % 1000000 === 0) { W.exec('COMMIT; BEGIN'); if (k % 20000000 === 0) lap(`  ${f.split(/[\\/]/).pop()}: ${k / 1e6} M rows`); }
  }
  W.exec('COMMIT');
  db.close();
  lap(`pass 1 ${f.split(/[\\/]/).pop()} (${k.toLocaleString()} rows)`);
}
const nCls = W.prepare('SELECT COUNT(*) c FROM cls').get().c;
lap(`${nCls.toLocaleString()} classes`);

// contents: one row per class, then the contents shared by two or more classes
W.exec('CREATE TABLE cc (content TEXT, class TEXT)');
const addCc = W.prepare('INSERT INTO cc VALUES (?, ?)');
W.exec('BEGIN');
let k = 0;
for (const r of W.prepare('SELECT class FROM cls').iterate()) { addCc.run(contentOf(r.class), r.class); if (++k % 1000000 === 0) W.exec('COMMIT; BEGIN'); }
W.exec('COMMIT; CREATE INDEX cc_content ON cc (content);');
lap('contents indexed');
const groups = [];
let members = 0;
for (const r of W.prepare(`SELECT content, GROUP_CONCAT(class, '|') ks FROM cc GROUP BY content HAVING COUNT(*) > 1`).iterate()) {
  const chords = r.ks.split('|').sort();
  groups.push({ content: r.content, chords });
  members += chords.length;
  if (members > maxMembers) { console.log(`more than ${maxMembers} group members: stopping before pass 2 (raise --max-members)`); process.exit(2); }
}
groups.sort((x, y) => x.chords[0].split(' ').length - y.chords[0].split(' ').length || +x.chords[0].split(' ').pop() - +y.chords[0].split(' ').pop() || (x.content < y.content ? -1 : 1));
const want = new Map();
groups.forEach((g, gi) => g.chords.forEach((c, ci) => want.set(c, [gi, ci])));
const bySize = {};
for (const g of groups) { const n = g.chords[0].split(' ').length; bySize[n] = (bySize[n] || 0) + 1; }
lap(`${groups.length} groups, ${members} chords; by note count ${JSON.stringify(bySize)}`);

// pass 2: every placement that lands on one of those chords; producer rows go straight to the work file
W.exec(`CREATE TABLE zproducers (group_id INTEGER, member INTEGER, n INTEGER, intervals TEXT, rule TEXT, ordering TEXT, window INTEGER, notes TEXT, mirrored INTEGER, merges INTEGER);`);
const addP = W.prepare('INSERT INTO zproducers VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
const prod = groups.map((g) => g.chords.map(() => new Map()));
for (const f of files) {
  const db = new DatabaseSync(f, { readOnly: true });
  W.exec('BEGIN');
  let hits = 0;
  for (const r of db.prepare(`SELECT p.notes, s.n, s.intervals, p.rule, o.ordering, p.window, p.merges, p.rough FROM placements p
      JOIN sets s USING (set_id) JOIN orderings o USING (set_id, ord) WHERE p.note_count >= 6`).iterate()) {
    const [key, mirrored] = classOf(r.notes.split(' ').map(Number));
    const hit = want.get(key);
    if (!hit) continue;
    const m = prod[hit[0]][hit[1]], sk = `${r.n}:${r.intervals}`;
    let e = m.get(sk);
    if (!e) m.set(sk, (e = { n: r.n, set: r.intervals, merges: r.merges, placements: 0, rules: {} }));
    e.placements++;
    if (!e.rules[r.rule]) e.rules[r.rule] = [r.ordering, r.window, r.notes, mirrored, +r.rough.toFixed(3)];
    addP.run(hit[0], hit[1], r.n, r.intervals, r.rule, r.ordering, r.window, r.notes, mirrored ? 1 : 0, r.merges);
    if (++hits % 1000000 === 0) W.exec('COMMIT; BEGIN');
  }
  W.exec('COMMIT');
  db.close();
  lap(`pass 2 ${f.split(/[\\/]/).pop()} (${hits.toLocaleString()} producer placements)`);
}
const result = {
  sources: files.map((f) => f.split(/[\\/]/).pop()),
  classes: nCls,
  groups: groups.map((g, gi) => ({
    content: g.content,
    chords: g.chords.map((c, ci) => ({ shape: c, producers: [...prod[gi][ci].values()].sort((a, b) => a.n - b.n || a.set.localeCompare(b.set, undefined, { numeric: true })) })),
  })),
};
let bad = 0;
for (const g of result.groups) for (const c of g.chords) for (const p of c.producers) if (p.merges !== 2 * p.n - c.shape.split(' ').length) bad++;
console.log('merges = 2n - notes violated:', bad);
writeFileSync(out, JSON.stringify(result));
W.exec(`CREATE TABLE zpairs (group_id INTEGER, member INTEGER, shape TEXT, note_count INTEGER, content TEXT, sets INTEGER, cards TEXT, PRIMARY KEY (group_id, member)) WITHOUT ROWID;`);
const addZ = W.prepare('INSERT INTO zpairs VALUES (?, ?, ?, ?, ?, ?, ?)');
W.exec('BEGIN');
result.groups.forEach((g, gi) => g.chords.forEach((c, ci) => addZ.run(gi, ci, c.shape, c.shape.split(' ').length, g.content, c.producers.length, [...new Set(c.producers.map((p) => p.n))].join(' '))));
W.exec('COMMIT; CREATE INDEX zproducers_group ON zproducers (group_id, member); DROP TABLE cc; DROP TABLE cls;');
W.close();
lap(`wrote ${out} and zpairs / zproducers in ${work}`);
