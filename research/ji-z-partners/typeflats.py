#!/usr/bin/env python3
"""typeflats.py (2026-11-25): the complete list of k-note Z-pair patterns ("universal types"), any lattice.

Theory (PROGRESS "Theory: universal types"): a Z-pair (P, Q), k notes each, has a bijection between the
k(k-1)/2 intervals of P and those of Q with p_j - p_i = s (q_b - q_a), s = +-1. For a fixed bijection these
are linear equations, the same on every prime axis, so the pairs satisfying it form (solution space S over Q)
tensor Z^r: every such pair, at every limit and q, is an integral linear image of S's generic pair. Finitely
many bijections -> finitely many patterns per k.

Search: flats of the arrangement of the k(k-1)/2 x k(k-1)/2 x 2 hyperplanes "interval u of P = s * interval v
of Q" in coordinates (p_1..p_{k-1}, q_1..q_{k-1}) (p_0 = q_0 = 0 fixes the two translations). Root: the flat
p_1 - p_0 = q_1 - q_0 (any pair is relabeled/mirrored to contain it). A flat is BAD if it forces two notes of P
(or of Q) to coincide, or forces Q = +-P + t as sets (trivial pair); badness is inherited by every subflat, so
bad flats are pruned. A flat is a TYPE if the edges it contains (hyperplanes containing it) have a perfect
matching between P-intervals and Q-intervals. Descent from a flat without one: a Hall violator X (P side, or
the Q side if smaller) with |N(X)| < |X|; any type inside the flat must use an edge from X to outside N(X), so
only those edges are branched on. This reaches every maximal type flat (proof in PROGRESS). Exact arithmetic.

usage: python typeflats.py K [--max-nodes N] [--out FILE.json]
"""
import argparse, collections, hashlib, itertools, json, multiprocessing as mp, os, sys, time
from fractions import Fraction as F


def rref_rows(rows):
    """reduced row echelon form of a list of Fraction rows; returns the nonzero rows as tuples"""
    m = [list(r) for r in rows]
    piv_r = 0
    ncol = len(m[0]) if m else 0
    for c in range(ncol):
        pr = next((r for r in range(piv_r, len(m)) if m[r][c] != 0), None)
        if pr is None:
            continue
        m[piv_r], m[pr] = m[pr], m[piv_r]
        pv = m[piv_r][c]
        m[piv_r] = [x / pv for x in m[piv_r]]
        for r in range(len(m)):
            if r != piv_r and m[r][c] != 0:
                f = m[r][c]
                m[r] = [a - f * b for a, b in zip(m[r], m[piv_r])]
        piv_r += 1
        if piv_r == len(m):
            break
    return tuple(tuple(r) for r in m[:piv_r])


class Search:
    def __init__(self, k):
        self.k = k
        self.n = 2 * (k - 1)  # coordinates p_1..p_{k-1}, q_1..q_{k-1}
        self.pairs = list(itertools.combinations(range(k), 2))
        self.np = len(self.pairs)

    # a flat is stored as `basis`: tuple of m spanning vectors in Q^n (RREF rows, canonical); point coordinate
    # forms are read from it: the value of coordinate x on the flat's parameter t is sum_t basis[t][x] * t
    def point(self, basis, side, i):
        """the m-vector of note i of P (side 0) or Q (side 1) as a linear form on the flat's parameters"""
        if i == 0:
            return (F(0),) * len(basis)
        x = side * (self.k - 1) + (i - 1)
        return tuple(b[x] for b in basis)

    def analyse(self, basis):
        k, m = self.k, len(basis)
        P = [self.point(basis, 0, i) for i in range(k)]
        Q = [self.point(basis, 1, i) for i in range(k)]
        if len(set(P)) < k or len(set(Q)) < k:
            return "bad", None
        Qs = set(Q)
        for s in (1, -1):
            for t in Q:
                if {tuple(s * a + b for a, b in zip(p, t)) for p in P} == Qs:
                    return "bad", None
        dP = [tuple(b - a for a, b in zip(P[i], P[j])) for i, j in self.pairs]
        dQ = [tuple(b - a for a, b in zip(Q[i], Q[j])) for i, j in self.pairs]
        adj = [[] for _ in range(self.np)]  # adj[u] = list of (v, s) edges contained in the flat
        idx = {}
        for v, d in enumerate(dQ):
            idx.setdefault(d, []).append((v, 1))
            idx.setdefault(tuple(-x for x in d), []).append((v, -1))
        for u, d in enumerate(dP):
            adj[u] = idx.get(d, [])
        return "ok", (P, Q, adj)

    def matching(self, adj):
        """max bipartite matching P-intervals -> Q-intervals; returns (matchP, matchQ)"""
        mP, mQ = [-1] * self.np, [-1] * self.np

        def aug(u, seen):
            for v, _ in adj[u]:
                if v in seen:
                    continue
                seen.add(v)
                if mQ[v] == -1 or aug(mQ[v], seen):
                    mP[u], mQ[v] = v, u
                    return True
            return False

        for u in range(self.np):
            aug(u, set())
        return mP, mQ

    def violator(self, adj, mP, mQ):
        """Hall violator on the P side from an unmatched P-interval: (X, N(X)) with |N(X)| = |X| - 1"""
        u0 = mP.index(-1)
        X, N, stack = {u0}, set(), [u0]
        while stack:
            u = stack.pop()
            for v, _ in adj[u]:
                if v not in N:
                    N.add(v)
                    w = mQ[v]
                    if w != -1 and w not in X:
                        X.add(w)
                        stack.append(w)
        return X, N

    def edge_form(self, u, v, s):
        """the linear form (in Q^n) of the hyperplane  p_j - p_i - s (q_b - q_a) = 0"""
        f = [F(0)] * self.n
        (i, j), (a, b) = self.pairs[u], self.pairs[v]
        for side, idx_, c in ((0, j, 1), (0, i, -1), (1, b, -s), (1, a, s)):
            if idx_ > 0:
                f[side * (self.k - 1) + idx_ - 1] += c
        return f

    def cut(self, basis, form):
        """basis of {x in span(basis): form . x = 0}, canonical (RREF)"""
        vals = [sum(fx * bx for fx, bx in zip(form, b)) for b in basis]
        piv = next(t for t, x in enumerate(vals) if x != 0)
        new = []
        for t, b in enumerate(basis):
            if t == piv:
                continue
            c = vals[t] / vals[piv]
            new.append([x - c * y for x, y in zip(b, basis[piv])])
        return rref_rows(new) if new else ()

    def canon(self, P, Q):
        """a complete invariant of the flat up to relabeling notes of P and of Q, mirroring either set and
        swapping P and Q. The flat is the intersection of the edge hyperplanes it contains, and those are read
        off the equality classes of the ordered intervals, so the colored graph (notes, ordered intervals with
        a tail marker, equality classes) determines the flat up to these symmetries. Canonical labeling by
        bliss (igraph); the smallest key over the 8 mirror/swap variants."""
        from igraph._igraph import GraphBase
        from math import lcm
        k = self.k
        # only equalities of intervals matter: scale to integers once (Fractions are slow)
        den = lcm(*(x.denominator for p in P + Q for x in p))
        P = [tuple(int(x * den) for x in p) for p in P]
        Q = [tuple(int(x * den) for x in q) for q in Q]
        arcs = [(i, j) for i in range(k) for j in range(k) if i != j]
        na = len(arcs)
        best = None
        for sP in (1, -1):
            for sQ in (1, -1):
                A = [tuple(sP * x for x in p) for p in P]
                B = [tuple(sQ * x for x in q) for q in Q]
                for A_, B_ in ((A, B), (B, A)):
                    cls, edges = {}, []
                    # vertices: A notes 0..k-1, B notes k..2k-1, arcs 2k.., tails 2k+2na.., classes after
                    for side, pts in ((0, A_), (1, B_)):
                        for t, (i, j) in enumerate(arcs):
                            a = 2 * k + side * na + t
                            tl = 2 * k + 2 * na + side * na + t
                            edges += [(a, tl), (tl, side * k + i), (a, side * k + j)]
                            d = tuple(y - x for x, y in zip(pts[i], pts[j]))
                            c = cls.setdefault(d, len(cls))
                            edges.append((a, 2 * k + 4 * na + c))
                    nv = 2 * k + 4 * na + len(cls)
                    colors = [0] * k + [1] * k + [2] * (2 * na) + [3] * (2 * na) + [4] * len(cls)
                    # the C-level GraphBase: igraph.Graph() costs ~0.5 ms per build in Python overhead
                    g = GraphBase(nv, edges)
                    lab = g.canonical_permutation(color=colors)  # lab[i] = old vertex placed at new index i
                    perm = [0] * nv  # perm[v] = new index of old vertex v
                    for i, v in enumerate(lab):
                        perm[v] = i
                    newc = [0] * nv
                    for v, c in enumerate(colors):
                        newc[perm[v]] = c
                    ce = sorted((min(perm[u], perm[v]), max(perm[u], perm[v])) for u, v in edges)
                    key = hashlib.blake2b(repr((nv, len(cls), newc, ce)).encode(), digest_size=16).digest()
                    if best is None or key < best:
                        best = key
        return best

    def root(self):
        n = self.n
        full = tuple(tuple(F(int(r == c)) for c in range(n)) for r in range(n))
        return self.cut(full, self.edge_form(0, 0, 1))

    def run(self, max_nodes, log=sys.stderr, use_canon=False, starts=None, frontier=0):
        """depth-first search from `starts` (default: the root). Dedup sets live on the object, so a worker
        process keeps them across its tasks. With frontier > 0: breadth-first until that many flats wait,
        then return them unexpanded (5th value) for parallel workers."""
        if not hasattr(self, "seen"):
            self.seen = set()  # 16-byte hashes of exact flats already pushed
            self.canon_seen = set()
        seen, canon_seen = self.seen, self.canon_seen
        stack = collections.deque(starts if starts else [self.root()])
        types, nodes, bad, dup = [], 0, 0, 0
        t0 = time.time()
        while stack:
            if frontier and len(stack) >= frontier:
                return types, nodes, bad, False, list(stack)
            basis = stack.popleft() if frontier else stack.pop()
            nodes += 1
            if nodes % 1000 == 0 and getattr(self, "ctr", None) is not None:
                with self.ctr.get_lock():
                    self.ctr.value += 1000
                if self.freeze.value and not getattr(self, "frozen", False):
                    # low memory (set by the main process): stop growing the dedup tables. Dedup is only a
                    # speed-up, so the result stays complete; some flats may be expanded twice.
                    self.frozen = True
                    seen.clear()
                    canon_seen.clear()
            if nodes > max_nodes:
                log.write(f"node budget {max_nodes} reached; INCOMPLETE\n")
                return types, nodes, bad, False, []
            st, data = self.analyse(basis)
            if st == "bad":
                bad += 1
                continue
            P, Q, adj = data
            if use_canon:
                key = self.canon(P, Q)
                if key in canon_seen:
                    dup += 1
                    continue
                shared = getattr(self, "shared", None)
                if shared is not None:
                    shared = shared[key[0] % len(shared)]  # one of several Manager dicts (sharded by key byte)
                if getattr(self, "frozen", False):
                    if shared is not None and key in shared:
                        dup += 1  # claimed before the freeze: its subtree is (being) searched
                        continue
                else:
                    canon_seen.add(key)
                    if shared is not None and shared.setdefault(key, self.wid) != self.wid:
                        dup += 1  # another worker already expands this class (setdefault is one atomic call)
                        continue
            mP, mQ = self.matching(adj)
            if -1 not in mP:
                types.append(basis)
                log.write(f"  TYPE FLAT #{len(types)} at node {nodes}: dim {len(basis)}, P {[tuple(map(str, p)) for p in P]}, "
                          f"Q {[tuple(map(str, q)) for q in Q]}\n")
                log.flush()
                continue
            X, N = self.violator(adj, mP, mQ)
            # the same on the Q side (transpose); branch on the smaller edge set
            adjQ = [[] for _ in range(self.np)]
            for u in range(self.np):
                for v, s in adj[u]:
                    adjQ[v].append((u, s))
            XQ, NQ = self.violator(adjQ, mQ, mP)
            optP = [(u, v, s) for u in X for v in range(self.np) if v not in N for s in (1, -1)]
            optQ = [(u, v, s) for v in XQ for u in range(self.np) if u not in NQ for s in (1, -1)]
            for u, v, s in (optP if len(optP) <= len(optQ) else optQ):
                if len(basis) <= 1:
                    break  # a 1-dim flat cut again is 0-dim: all notes coincide
                child = self.cut(basis, self.edge_form(u, v, s))
                if not child:
                    continue
                h = hashlib.blake2b(repr(child).encode(), digest_size=16).digest()
                if h not in seen:
                    if not getattr(self, "frozen", False):
                        seen.add(h)
                    stack.append(child)
            if nodes % 20000 == 0:
                log.write(f"  {nodes} nodes, {len(seen)} flats seen, {bad} bad, {dup} symmetric dups, "
                          f"{len(canon_seen)} classes, {len(types)} type flats, "
                          f"stack {len(stack)}, {time.time() - t0:.0f} s\n")
                log.flush()
        return types, nodes, bad, True, []


_W = None


def _winit(k, use_canon, shared, ctr, freeze):
    global _W
    _W = Search(k)
    _W.use_canon = use_canon
    _W.shared = shared  # Manager dict: canonical keys claimed by any worker
    _W.ctr = ctr  # shared node counter (progress)
    _W.freeze = freeze  # set by the main process when memory runs low
    _W.wid = os.getpid()
    _W.devnull = open(os.devnull, "w")


def _wtask(item):
    i, basis = item
    t, n, b, _, _ = _W.run(10 ** 15, log=_W.devnull, use_canon=_W.use_canon, starts=[basis])
    return i, t, n, b


def mem_available_gb():
    try:
        for line in open("/proc/meminfo"):
            if line.startswith("MemAvailable:"):
                return int(line.split()[1]) / 2 ** 20
    except OSError:
        pass
    return None


def b2s(b):
    return [[str(x) for x in r] for r in b]


def s2b(s):
    return tuple(tuple(F(x) for x in r) for r in s)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("k", type=int)
    ap.add_argument("--max-nodes", type=int, default=2_000_000)
    ap.add_argument("--out")
    ap.add_argument("--canon", action="store_true", help="merge flats equal up to relabeling/mirror/swap (needs igraph)")
    ap.add_argument("--workers", type=int, default=1, help="> 1: breadth-first frontier, then one DFS per frontier flat in a pool "
                    "(each worker dedups within itself only; no node budget)")
    ap.add_argument("--frontier", type=int, default=3000)
    ap.add_argument("--types-log", help="append each type flat found (JSON line) as it arrives")
    ap.add_argument("--state", help="parallel runs: folder for the saved frontier and the finished-task log; a rerun "
                    "with the same folder skips finished frontier flats")
    ap.add_argument("--min-free-gb", type=float, default=4.0, help="freeze the dedup tables below this much free memory")
    a = ap.parse_args()
    S = Search(a.k)
    t0 = time.time()
    tlog = open(a.types_log, "a") if a.types_log else None

    def record(ts):
        for b in ts:
            if tlog:
                tlog.write(json.dumps([[str(x) for x in r] for r in b]) + "\n")
                tlog.flush()

    if a.workers > 1:
        fpath = os.path.join(a.state, "frontier.json") if a.state else None
        dpath = os.path.join(a.state, "done.jsonl") if a.state else None
        if fpath and os.path.exists(fpath):
            fr = json.load(open(fpath))
            types, nodes, bad = [s2b(b) for b in fr["types"]], fr["nodes"], fr["bad"]
            front = [s2b(b) for b in fr["front"]]
            print(f"frontier loaded: {len(front)} flats", flush=True)
        else:
            types, nodes, bad, _, front = S.run(10 ** 15, use_canon=a.canon, frontier=a.frontier)
            record(types)
            if fpath:
                os.makedirs(a.state, exist_ok=True)
                json.dump({"types": [b2s(b) for b in types], "nodes": nodes, "bad": bad,
                           "front": [b2s(b) for b in front]}, open(fpath + ".tmp", "w"))
                os.replace(fpath + ".tmp", fpath)
        print(f"frontier: {len(front)} flats after {nodes} nodes, {len(types)} type flats, {time.time() - t0:.0f} s", flush=True)
        done = set()
        if dpath and os.path.exists(dpath):
            for line in open(dpath):
                try:
                    r = json.loads(line)
                except ValueError:
                    continue  # a line cut by a kill
                done.add(r["i"])
                types += [s2b(b) for b in r["types"]]
                nodes += r["nodes"]
                bad += r["bad"]
            print(f"resume: {len(done)} frontier flats already done, {nodes} nodes, {len(types)} type flats", flush=True)
        dlog = open(dpath, "a") if dpath else None
        todo = [(i, b) for i, b in enumerate(front) if i not in done]
        complete = True
        # several Manager processes: one alone tops out near a few 10^4 lookups/s
        mgrs = [mp.Manager() for _ in range(max(1, min(8, a.workers // 8)))]
        shared = [m.dict() for m in mgrs]
        ctr = mp.Value("q", 0)
        freeze = mp.Value("b", 1 if a.min_free_gb >= 1e6 else 0)  # test hook: --min-free-gb 1e6 freezes at once
        last = time.time()
        with mp.Pool(a.workers, _winit, (a.k, a.canon, shared, ctr, freeze)) as pool:
            it = pool.imap_unordered(_wtask, todo, chunksize=1)
            ndone = len(done)
            while ndone < len(front):
                try:
                    i, t, n, b = it.next(timeout=60)
                except mp.TimeoutError:
                    i = None
                if i is not None:
                    ndone += 1
                    types += t
                    nodes += n
                    bad += b
                    record(t)
                    if dlog:
                        dlog.write(json.dumps({"i": i, "types": [b2s(x) for x in t], "nodes": n, "bad": b}) + "\n")
                        dlog.flush()
                    if t:
                        print(f"  +{len(t)} type flats from frontier flat {i} ({len(types)} total)", flush=True)
                if time.time() - last >= 60 or ndone == len(front):
                    last = time.time()
                    free = mem_available_gb()
                    if free is not None and free < a.min_free_gb and not freeze.value:
                        freeze.value = 1
                        print(f"  MEMORY LOW ({free:.1f} GB free): dedup tables frozen (result stays complete)", flush=True)
                    print(f"  {ndone}/{len(front)} frontier flats done, {nodes} nodes in done flats, {ctr.value} nodes "
                          f"this session, {len(types)} type flats, free {free if free is None else round(free, 1)} GB"
                          f"{', FROZEN' if freeze.value else ''}, {time.time() - t0:.0f} s", flush=True)
    else:
        types, nodes, bad, complete, _ = S.run(a.max_nodes, use_canon=a.canon)
        record(types)
    # keep maximal flats only (a type flat inside another is a specialization of it)
    spans = [(len(b), b) for b in types]
    def inside(small, big):
        return len(rref_rows(list(big) + list(small))) == len(big)
    maximal = [b for d, b in spans if not any(d2 > d and inside(b, b2) for d2, b2 in spans)]
    if a.canon:  # one representative per symmetry class
        reps = {}
        for b in maximal:
            P = [S.point(b, 0, i) for i in range(a.k)]
            Q = [S.point(b, 1, i) for i in range(a.k)]
            reps.setdefault(S.canon(P, Q), b)
        maximal = list(reps.values())
    print(f"k {a.k}: {nodes} nodes, {bad} bad, {len(types)} type flats, {len(maximal)} maximal, "
          f"{'COMPLETE' if complete else 'INCOMPLETE'}, {time.time() - t0:.1f} s")
    out = []
    for b in maximal:
        P = [S.point(b, 0, i) for i in range(a.k)]
        Q = [S.point(b, 1, i) for i in range(a.k)]
        out.append({"dim": len(b), "P": [[str(x) for x in p] for p in P], "Q": [[str(x) for x in q] for q in Q]})
        print(f"  dim {len(b)}: P {[tuple(str(x) for x in p) for p in P]}")
        print(f"          Q {[tuple(str(x) for x in q) for q in Q]}")
    if a.out:
        json.dump({"k": a.k, "complete": complete, "nodes": nodes, "types": out}, open(a.out, "w"), indent=1)


if __name__ == "__main__":
    main()
