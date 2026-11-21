// Required intervals + hanging (secondary) intervals -> every pitch collection of k notes (human, 2026-11-21).
// A collection is valid when it holds each required interval as its own pair of notes (several may share notes), and
// the remaining notes are reached by secondary intervals: the secondary edges join the required structure and every
// other note into one connected whole using as few edges as possible (a spanning tree over the required structure's
// components). Read as Schillinger's directional units (Book II 8 B, Book IX ch. 8): the required notes are the
// neutral (rest) tones and each hung note is an auxiliary leading into the neutral tone it hangs from.
// Pure module: no DOM, no scoring (the worker in core.ts adds scores).

export type Opts = {
  req: number[]; // required interval sizes in steps (each needs its own pair of notes)
  sec: number[]; // secondary (hanging) interval sizes
  k: number; // notes in the collection
  chains: boolean; // may a note hang off another hung note?
  dir: 'any' | 'above' | 'below'; // hung notes sit above / below the note they hang from
  attach: boolean[]; // per required interval: may its notes take hangers?
  spanMax: number; // largest span kept (0 = no limit)
  maxChords?: number; // stop generating after this many collections (default 20000)
};

export type Edge = { a: number; b: number; size: number; req: boolean; idx?: number };
export type Unit = { neutral: number; hung: { note: number; parent: number }[] };
export type Collection = {
  notes: number[]; // steps above the lowest note
  span: number;
  gaps: number[];
  evenness: number; // standard deviation of the gaps (0 = equal gaps)
  edges: Edge[]; // one valid build (the simplest found)
  units: Unit[]; // required notes with the notes hanging from them, low to high
  builds: number; // how many valid builds were found (capped)
  chained: boolean; // the shown build needs a chain
};

const BUILD_CAP = 400;

/** Every collection reachable by placing the required intervals and hanging secondaries, up to transposition. */
export function generate(req: number[], sec: number[], k: number, cap = 20000, spanMax = 0): { chords: number[][]; truncated: boolean } {
  const seen = new Set<string>();
  const out = new Map<string, number[]>();
  let truncated = false;
  const reqSorted = req.slice().sort((a, b) => a - b);
  const stack: { notes: number[]; left: number[] }[] = [{ notes: [0], left: reqSorted }];
  while (stack.length) {
    const st = stack.pop()!;
    const lo = Math.min(...st.notes);
    const notes = st.notes.map((x) => x - lo).sort((a, b) => a - b);
    if (spanMax && notes[notes.length - 1] > spanMax) continue;
    const key = `${notes.join(' ')}|${st.left.join(' ')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (notes.length === k) {
      if (!st.left.length) {
        const ck = notes.join(' ');
        if (!out.has(ck)) out.set(ck, notes);
        if (out.size >= cap) { truncated = true; break; }
      }
      // a required interval may still fit between two notes already there
      if (st.left.length) for (const e of new Set(st.left)) if (hasPair(notes, e)) stack.push({ notes, left: drop(st.left, e) });
      continue;
    }
    const has = new Set(notes);
    for (const e of new Set(st.left)) {
      const left = drop(st.left, e);
      if (hasPair(notes, e)) stack.push({ notes, left });
      for (const n of notes) for (const x of [n + e, n - e]) if (!has.has(x) && notes.length + 1 <= k) stack.push({ notes: [...notes, x], left });
    }
    if (notes.length < k) for (const e of new Set(sec)) for (const n of notes) for (const x of [n + e, n - e]) if (!has.has(x)) stack.push({ notes: [...notes, x], left: st.left });
  }
  return { chords: [...out.values()], truncated };
}

function hasPair(notes: number[], d: number) {
  const s = new Set(notes);
  return notes.some((n) => s.has(n + d));
}
function drop(xs: number[], v: number) {
  const i = xs.indexOf(v);
  return xs.slice(0, i).concat(xs.slice(i + 1));
}

/** Valid builds of one collection under the options; returns the simplest one and a count. */
export function analyze(notes: number[], o: Opts): { edges: Edge[]; units: Unit[]; builds: number; chained: boolean } | null {
  const k = notes.length;
  const idx = new Map(notes.map((n, i) => [n, i]));
  const pairsOf = (d: number) => notes.flatMap((n, i) => (idx.has(n + d) ? [[i, idx.get(n + d)!]] : []));
  const reqOrder = o.req.map((size, i) => ({ size, i })).sort((a, b) => a.size - b.size);
  const secPairs = [...new Set(o.sec)].flatMap((d) => pairsOf(d).map(([a, b]) => ({ a, b, size: d })));
  let best: { edges: Edge[]; units: Unit[]; cost: number; chained: boolean } | null = null;
  let builds = 0;

  const chooseReq = (j: number, used: Set<string>, chosen: Edge[]) => {
    if (builds >= BUILD_CAP) return;
    if (j === reqOrder.length) return chooseSec(chosen);
    const { size, i } = reqOrder[j];
    for (const [a, b] of pairsOf(size)) {
      const key = `${a},${b}`;
      if (used.has(key)) continue;
      // same size twice: keep pair order increasing to avoid counting swaps
      if (j > 0 && reqOrder[j - 1].size === size) { const prev = chosen[chosen.length - 1]; if (`${prev.a},${prev.b}` > key) continue; }
      used.add(key);
      chosen.push({ a, b, size, req: true, idx: i });
      chooseReq(j + 1, used, chosen);
      chosen.pop();
      used.delete(key);
    }
  };

  const chooseSec = (reqEdges: Edge[]) => {
    const parent = notes.map((_, i) => i);
    const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    for (const e of reqEdges) parent[find(e.a)] = find(e.b);
    const comps = new Set(notes.map((_, i) => find(i))).size;
    const need = comps - 1;
    const R = new Set(reqEdges.flatMap((e) => [e.a, e.b]));
    const pick: Edge[] = [];
    const rec = (start: number, par: number[]) => {
      if (builds >= BUILD_CAP) return;
      if (pick.length === need) return check(reqEdges, pick.slice(), R);
      for (let s = start; s < secPairs.length; s++) {
        const p = secPairs[s];
        const f = (x: number): number => (par[x] === x ? x : f(par[x]));
        const ra = f(p.a), rb = f(p.b);
        if (ra === rb) continue;
        const np = par.slice();
        np[ra] = rb;
        pick.push({ a: p.a, b: p.b, size: p.size, req: false });
        rec(s + 1, np);
        pick.pop();
      }
    };
    rec(0, notes.map((_, i) => find(i)));
  };

  const check = (reqEdges: Edge[], secEdges: Edge[], R: Set<number>) => {
    // root every hung note at the required notes: breadth first along the build's edges
    const adj = notes.map(() => [] as number[]);
    for (const e of [...reqEdges, ...secEdges]) { adj[e.a].push(e.b); adj[e.b].push(e.a); }
    const depth = notes.map((_, i) => (R.has(i) ? 0 : -1));
    const queue = [...R];
    while (queue.length) {
      const x = queue.shift()!;
      for (const y of adj[x]) if (depth[y] < 0) { depth[y] = depth[x] + 1; queue.push(y); }
    }
    if (depth.some((d) => d < 0)) return; // a secondary-only island never reaches a required note (k with no required notes)
    const chained = depth.some((d) => d > 1);
    if (chained && !o.chains) return;
    // each hung note's possible parents: build neighbours one step nearer the required notes
    const parents = notes.map((_, i) => (depth[i] > 0 ? adj[i].filter((y) => depth[y] === depth[i] - 1) : []));
    const okDir = (i: number, p: number) => o.dir === 'any' || (o.dir === 'above' ? notes[i] > notes[p] : notes[i] < notes[p]);
    // which required note each hung note leads to (its unit), honouring attach
    const allowedR = new Set<number>();
    for (const e of reqEdges) if (o.attach[e.idx!] !== false) { allowedR.add(e.a); allowedR.add(e.b); }
    const chosenParent = notes.map(() => -1);
    const root = notes.map((_, i) => (R.has(i) ? i : -1));
    const order = notes.map((_, i) => i).filter((i) => depth[i] > 0).sort((a, b) => depth[a] - depth[b]);
    for (const i of order) {
      const p = parents[i].find((q) => okDir(i, q) && (depth[q] > 0 || allowedR.has(q)));
      if (p === undefined) return;
      chosenParent[i] = p;
      root[i] = root[p];
    }
    builds++;
    const edges = [...reqEdges, ...secEdges].map((e) => ({ ...e, a: notes[e.a], b: notes[e.b] }));
    const units: Unit[] = [...R].sort((a, b) => notes[a] - notes[b]).map((r) => ({
      neutral: notes[r],
      hung: order.filter((i) => root[i] === r).map((i) => ({ note: notes[i], parent: notes[chosenParent[i]] })),
    }));
    // simplest build: no chain first, then fewest secondary edges, then most required notes
    const cost = (chained ? 1000 : 0) + secEdges.length * 10 - R.size;
    if (!best || cost < best.cost) best = { edges, units, cost, chained };
  };

  chooseReq(0, new Set(), []);
  if (!best) return null;
  const b = best as { edges: Edge[]; units: Unit[]; chained: boolean };
  return { edges: b.edges, units: b.units, builds, chained: b.chained };
}

/** Generate, analyze, filter and fold mirror images (a collection and its upside-down form count once). */
export function collections(o: Opts): { list: Collection[]; truncated: boolean; generated: number } {
  if (o.k < 2 || !o.req.length) return { list: [], truncated: false, generated: 0 };
  const { chords, truncated } = generate(o.req, o.sec, o.k, o.maxChords ?? 20000, o.spanMax);
  const list: Collection[] = [];
  const kept = new Set<string>();
  for (const notes of chords) {
    const span = notes[notes.length - 1];
    if (o.spanMax && span > o.spanMax) continue;
    const key = notes.join(' ');
    const mirror = notes.map((x) => span - x).reverse().join(' ');
    const canon = key < mirror ? key : mirror;
    if (kept.has(canon)) continue;
    // try the canonical form first, then its mirror (filters such as "above" are not mirror-symmetric)
    const forms = key === mirror ? [notes] : key === canon ? [notes, mirror.split(' ').map(Number)] : [mirror.split(' ').map(Number), notes];
    for (const f of forms) {
      const a = analyze(f, o);
      if (!a) continue;
      kept.add(canon);
      const gaps = f.slice(1).map((x, i) => x - f[i]);
      const mean = gaps.reduce((p, q) => p + q, 0) / gaps.length;
      const evenness = Math.sqrt(gaps.reduce((p, g) => p + (g - mean) ** 2, 0) / gaps.length);
      list.push({ notes: f, span, gaps, evenness, ...a });
      break;
    }
  }
  return { list, truncated, generated: chords.length };
}
