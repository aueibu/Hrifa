#!/usr/bin/env pypy3
"""zgen.py: JI Z-family search and generator. Pure Python, so it runs under pypy.

Two modes:

  exhaustive  every k-subset of an odd-limit gamut; finds ALL Z-families of size k.
              Each family is tagged with its geometric TYPE: its shape up to any change of lattice
              basis, so the same pattern along different interval axes (3&5, 3&7, 5&7, ...)
              gets the same type id.
  directsum   generates the "chord on roots" families directly: P = A(+)B, partner A(+)(-B),
              for chord shapes A and root shapes B taken from the gamut. Complete for that mechanism,
              and far cheaper than exhaustive search at large k.

Both write RUN_DIR/families.jsonl, RUN_DIR/summary.csv and RUN_DIR/run.log.

Examples:
  pypy3 zgen.py estimate   --primes 3 5 7 --odd 27 --k 6 7 8 9
  pypy3 zgen.py exhaustive --primes 3 5 7 --odd 27 --k 6 --out run_7lim_odd27_k6
  pypy3 zgen.py directsum  --primes 3 5 7 --odd 27 --sizes 3x3 3x4 --out run_7lim_odd27_ds
  pypy3 zgen.py selftest   # reproduces known 5-limit odd-123 results (k=6: 7 families; 3x3: 2823)
"""
import argparse, hashlib, itertools, json, os, sys, time
from concurrent.futures import ProcessPoolExecutor, as_completed
from concurrent.futures.process import BrokenProcessPool
from fractions import Fraction
from math import gcd, comb
from multiprocessing import Pool, cpu_count

# ----------------------------------------------------------------------------- gamut
def smooth_odd(n, primes):
    for p in primes:
        while n % p == 0:
            n //= p
    return n == 1


def exps(fr, primes):
    n, d = fr.numerator, fr.denominator
    v = []
    for p in primes:
        e = 0
        while n % p == 0: n //= p; e += 1
        while d % p == 0: d //= p; e -= 1
        v.append(e)
    return tuple(v)


def ratio(v, primes):
    r = Fraction(1)
    for p, e in zip(primes, v):
        r *= Fraction(p) ** e
    while r >= 2: r /= 2
    while r < 1: r *= 2
    return r


def gamut(primes, odd):
    odds = [n for n in range(1, odd + 1, 2) if smooth_odd(n, primes)]
    G = set()
    for a in odds:
        for b in odds:
            if gcd(a, b) == 1:
                G.add(exps(Fraction(a, b), primes))
    return sorted(G)

# ----------------------------------------------------------------------------- set helpers
def sub(u, v): return tuple(a - b for a, b in zip(u, v))
def add(u, v): return tuple(a + b for a, b in zip(u, v))
def neg(u): return tuple(-a for a in u)


def norm(S):
    m = min(S)
    return tuple(sorted(sub(p, m) for p in S))


def canon(S):
    """up to transposition (translation) and inversion (negation)"""
    return min(norm(S), norm([neg(p) for p in S]))


def fingerprint(S):
    out = []
    for i in range(len(S)):
        for j in range(i + 1, len(S)):
            v = sub(S[j], S[i])
            if v < neg(v): v = neg(v)
            out.append(v)
    out.sort()
    return tuple(out)


def fits(S, Gset, Glist):
    """does some transposition of S lie inside the gamut?"""
    S = norm(S)
    for g in Glist:
        if all(add(g, p) in Gset for p in S):
            return True
    return False

def enc(T):
    """exact integer encoding of a tuple of small integer vectors (Python's hash() maps -1 and -2
    to the same value, so it can't be used as a key here)"""
    x = 0
    for v in T:
        for c in v:
            x = (x << 8) | (c + 128)
    return x


# ----------------------------------------------------------------------------- geometry: type key
def rank_and_cols(D):
    """rank of integer row vectors D and a set of columns that realises it"""
    n = len(D[0])
    best = (0, ())
    for r in range(min(3, n), 0, -1):
        for cols in itertools.combinations(range(n), r):
            M = [[Fraction(row[c]) for c in cols] for row in D]
            if _rank(M) == r:
                return r, cols
    return 0, ()


def _rank(M):
    M = [row[:] for row in M]
    r = 0
    ncol = len(M[0]) if M else 0
    for c in range(ncol):
        piv = next((i for i in range(r, len(M)) if M[i][c] != 0), None)
        if piv is None: continue
        M[r], M[piv] = M[piv], M[r]
        for i in range(len(M)):
            if i != r and M[i][c] != 0:
                f = M[i][c] / M[r][c]
                M[i] = [a - f * b for a, b in zip(M[i], M[r])]
        r += 1
    return r


def _det(B):
    r = len(B)
    if r == 1: return B[0][0]
    if r == 2: return B[0][0] * B[1][1] - B[0][1] * B[1][0]
    return (B[0][0] * (B[1][1] * B[2][2] - B[1][2] * B[2][1])
            - B[0][1] * (B[1][0] * B[2][2] - B[1][2] * B[2][0])
            + B[0][2] * (B[1][0] * B[2][1] - B[1][1] * B[2][0]))


def _solve(B, p):
    """p = sum x_i B_i with B given as list of r basis vectors; Cramer, exact. None if not integral."""
    r = len(B)
    M = [list(col) for col in zip(*B)]          # r x r, columns are basis vectors
    det = _det(M)
    out = []
    for i in range(r):
        Mi = [row[:] for row in M]
        for j in range(r): Mi[j][i] = p[j]
        num = _det(Mi)
        if num % det: return None
        out.append(num // det)
    return tuple(out)


def gl_canon(S):
    """shape of S up to translation, negation and ANY change of basis of the lattice its
    differences span. Same pattern along different axes -> same key. Returns (rank, key)."""
    o = S[0]
    D = [sub(p, o) for p in S]
    r, cols = rank_and_cols(D)
    D = [tuple(p[c] for c in cols) for p in D]
    diffs = sorted({sub(p, q) for p in D for q in D if p != q})
    g = 0
    for t in itertools.combinations(diffs, r):
        g = gcd(g, abs(_det([list(v) for v in zip(*t)]) if r > 1 else t[0][0]))
    best = None
    for B in itertools.permutations(diffs, r):
        det = _det([list(v) for v in zip(*B)]) if r > 1 else B[0][0]
        if abs(det) != g: continue
        pts = []
        for p in D:
            x = _solve(B, p) if r > 1 else ((p[0] // det,) if p[0] % det == 0 else None)
            if x is None: break
            pts.append(x)
        else:
            for sg in (1, -1):
                key = norm([tuple(sg * a for a in q) for q in pts])
                if best is None or key < best: best = key
    return r, best


def pair_type(P, Q):
    (rp, kp), (rq, kq) = gl_canon(P), gl_canon(Q)
    return max(rp, rq), tuple(sorted([kp, kq]))

# ----------------------------------------------------------------------------- logging / output
class Run:
    def __init__(self, out):
        os.makedirs(out, exist_ok=True)
        self.out = out
        self.log = open(os.path.join(out, "run.log"), "a")

    def say(self, *a):
        msg = " ".join(str(x) for x in a)
        print(msg, flush=True)
        self.log.write(msg + "\n"); self.log.flush()


def member_record(S, primes):
    # re-root on the member's simplest note (smallest Tenney height of the whole set)
    def th(v):
        r = ratio(v, primes); return r.numerator * r.denominator
    root = min(S, key=lambda c: sum(th(sub(p, c)) for p in S))
    R = sorted((sub(p, root) for p in S), key=lambda v: ratio(v, primes))
    return {"ratios": [str(ratio(v, primes)) for v in R], "lattice": [list(v) for v in canon(S)]}


def write_families(run, fams, primes, Gsize, extra):
    """fams: list of (k, [P, Q, ...], dict extra)"""
    types = {}
    path = os.path.join(run.out, "families.jsonl")
    with open(path, "w") as fh:
        for i, (k, members, ex) in enumerate(fams, 1):
            P, Q = members[0], members[1]
            rk, key = pair_type(P, Q)
            tid = types.setdefault(key, len(types) + 1)
            fp = fingerprint(P)
            rec = {"family": i, "notes": k, "primes": list(primes), "gamut_size": Gsize,
                   "type": tid, "type_rank": rk,
                   "members": [member_record(M, primes) for M in members],
                   "interval_classes": [str(min(ratio(v, primes), 2 / ratio(v, primes))) for v in fp],
                   "distinct_interval_classes": len(set(fp))}
            rec.update(ex)
            fh.write(json.dumps(rec) + "\n")
    with open(os.path.join(run.out, "types.jsonl"), "w") as fh:
        for key, tid in types.items():
            fh.write(json.dumps({"type": tid, "shape_P": [list(p) for p in key[0]],
                                 "shape_Q": [list(p) for p in key[1]]}) + "\n")
    return types

# ----------------------------------------------------------------------------- exhaustive mode (disk-backed)
#
# Pass 1  every k-subset is enumerated, but only ONE representative per set class is kept: the
#         subset is emitted only if it is the canonical orientation (not the inverted copy) and its
#         lowest note is the lowest place in the gamut where that shape fits. Each emitted class
#         writes one 8-byte fingerprint hash to bucket file  hash % B . Jobs are (first, second note)
#         pairs, so they are small and evenly sized; finished jobs are logged so a run can resume.
# Pass 2  each bucket is loaded, sorted and scanned; a fingerprint hash seen twice is a candidate.
# Pass 3  candidates are recomputed exactly (fingerprint + class), which removes hash collisions.
#
# Disk per k ~ 8 bytes x set classes. RAM in pass 2 ~ 8-16 bytes x (classes / buckets) per merge worker.
from array import array

_G = None
_GSET = None
_FLAG = None


def _init(G, flagged=None):
    global _G, _GSET, _FLAG
    _G, _GSET, _FLAG = G, set(G), flagged


def _emit(S, G, Gset):
    """S sorted by gamut order. True if S is its class's unique representative."""
    m = S[0]
    N = [sub(p, m) for p in S]
    Nn = norm([neg(p) for p in S])
    if Nn < tuple(N):
        return False                       # the inverted copy represents this class
    for g in G:                            # first place (in gamut order) where the shape fits
        if g >= m:
            return True
        if all(add(g, p) in Gset for p in N):
            return False
    return True


from hashlib import blake2b


def _fp_hash(fp):
    """64-bit blake2b of the exact fingerprint (Python's own int/tuple hashes collide systematically)"""
    return int.from_bytes(blake2b(bytes(c + 128 for v in fp for c in v), digest_size=8).digest(), "little")


def _p1_job(args):
    i0, i1, k, nb, wdir = args
    G, Gset = _G, _GSET
    bufs = {}
    n = 0
    head = [G[i0], G[i1]]
    for rest in itertools.combinations(range(i1 + 1, len(G)), k - 2):
        S = head + [G[j] for j in rest]
        if not _emit(S, G, Gset):
            continue
        h = _fp_hash(fingerprint(S))
        b = h % nb
        a = bufs.get(b)
        if a is None:
            a = bufs[b] = array("Q")
        a.append(h)
        n += 1
    for b, a in bufs.items():                 # one file per (job, bucket), written atomically: resume stays exact
        d = os.path.join(wdir, f"b{b:04d}")
        fn = os.path.join(d, f"j{i0}_{i1}.bin")
        with open(fn + ".tmp", "wb") as fh:
            a.tofile(fh)
        os.replace(fn + ".tmp", fn)
    return (i0, i1), n


def _p2_bucket(args):
    wdir, b = args
    vals = array("Q")
    d = os.path.join(wdir, f"b{b:04d}")
    for f in os.listdir(d):
        if f.endswith(".bin"):
            with open(os.path.join(d, f), "rb") as fh:
                vals.frombytes(fh.read())
    lst = sorted(vals)
    del vals
    flagged = []
    for i in range(1, len(lst)):
        if lst[i] == lst[i - 1] and (i == 1 or lst[i - 1] != lst[i - 2]):
            flagged.append(lst[i])
    return b, len(lst), flagged


def _p3_job(args):
    i0, i1, k = args
    G, Gset, flagged = _G, _GSET, _FLAG
    res = {}
    head = [G[i0], G[i1]]
    for rest in itertools.combinations(range(i1 + 1, len(G)), k - 2):
        S = head + [G[j] for j in rest]
        if not _emit(S, G, Gset):
            continue
        fp = fingerprint(S)
        if _fp_hash(fp) in flagged:
            res.setdefault(fp, set()).add(canon(S))
    return res


def exhaustive(a):
    primes = tuple(a.primes); G = gamut(primes, a.odd)
    assert set(G) == {neg(p) for p in G}, "gamut must be inversion-symmetric (odd-limit gamuts are)"
    run = Run(a.out)
    run.say(f"exhaustive: primes {primes}, odd limit {a.odd}, gamut {len(G)} notes, k = {a.k}, "
            f"{a.workers} workers, {a.buckets} buckets, work dir {a.workdir}")
    fams_all, summary = [], []
    for k in a.k:
        assert k >= 3
        t0 = time.time()
        wdir = os.path.join(a.workdir, f"k{k}")
        for b in range(a.buckets):
            os.makedirs(os.path.join(wdir, f"b{b:04d}"), exist_ok=True)
        meta = os.path.join(wdir, "meta.json")
        if os.path.exists(meta):
            m = json.load(open(meta))
            assert m == {"primes": list(primes), "odd": a.odd, "buckets": a.buckets}, \
                f"{wdir} holds a different run ({m}); delete it or use another --workdir"
        else:
            json.dump({"primes": list(primes), "odd": a.odd, "buckets": a.buckets}, open(meta, "w"))
        donef = os.path.join(wdir, "pass1_done.txt")
        done = set()
        if os.path.exists(donef):
            done = {tuple(map(int, l.split())) for l in open(donef) if l.strip()}
        jobs = [(i0, i1) for i0 in range(len(G)) for i1 in range(i0 + 1, len(G)) if len(G) - i1 - 1 >= k - 2]
        weight = {j: comb(len(G) - j[1] - 1, k - 2) for j in jobs}
        jobs.sort(key=lambda j: -weight[j])                    # big jobs first: better load balance
        todo = [j for j in jobs if j not in done]
        total_w = sum(weight.values()); done_w = sum(weight[j] for j in done)
        run.say(f"  k={k}: {comb(len(G), k):,} subsets in {len(jobs)} jobs ({len(done)} already done)")
        # ---- pass 1
        if todo:
            with Pool(a.workers, initializer=_init, initargs=(G,)) as pool, open(donef, "a") as dfh:
                last = 0
                for j, n in pool.imap_unordered(_p1_job, [(i0, i1, k, a.buckets, wdir) for i0, i1 in todo]):
                    dfh.write(f"{j[0]} {j[1]}\n"); dfh.flush()
                    done_w += weight[j]
                    el = time.time() - t0
                    if el - last > 60 or done_w == total_w:
                        last = el
                        frac = done_w / total_w
                        run.say(f"    pass 1: {100*frac:5.1f}% of subsets, {el/60:.1f} min elapsed")
        # ---- pass 2
        run.say(f"    pass 2: counting fingerprints in {a.buckets} buckets ({a.merge_workers} at a time)")
        n_classes, flagged = 0, set()
        with Pool(a.merge_workers) as pool:
            for b, n, fl in pool.imap_unordered(_p2_bucket, [(wdir, b) for b in range(a.buckets)]):
                n_classes += n; flagged.update(fl)
        run.say(f"    {n_classes:,} set classes, {len(flagged):,} candidate fingerprints; pass 3 (exact)")
        # ---- pass 3
        exact = {}
        with Pool(a.workers, initializer=_init, initargs=(G, flagged)) as pool:
            for part in pool.imap_unordered(_p3_job, [(i0, i1, k) for i0, i1 in jobs]):
                for fp, cs in part.items():
                    exact.setdefault(fp, set()).update(cs)
        fams = [sorted(cs) for fp, cs in sorted(exact.items()) if len(cs) >= 2]
        run.say(f"  k={k}: {len(fams)} Z-families ({(time.time()-t0)/60:.1f} min)")
        summary.append((k, comb(len(G), k), n_classes, len(fams)))
        for m in fams:
            fams_all.append((k, [list(x) for x in m], {"mechanism": "exhaustive"}))
        with open(os.path.join(run.out, f"families_k{k}.json"), "w") as fh:   # checkpoint per k
            json.dump([[list(map(list, x)) for x in m] for m in fams], fh)
        if not a.keep_work:
            import shutil; shutil.rmtree(wdir)
    types = write_families(run, fams_all, primes, len(G), {})
    with open(os.path.join(run.out, "summary.csv"), "w") as fh:
        fh.write("notes,subsets,set_classes,z_families,gamut_size\n")
        for k, n, c, f in summary: fh.write(f"{k},{n},{c},{f},{len(G)}\n")
    run.say(f"done: {len(fams_all)} families, {len(types)} geometric types -> {run.out}")
    return summary

# ----------------------------------------------------------------------------- direct-sum mode
def shapes(G, Gset, n):
    """all n-note shapes (up to transposition and inversion) that fit the gamut"""
    out = set()
    for S in itertools.combinations(G, n):
        out.add(canon(list(S)))
    return sorted(out)


def _span(S):
    return tuple(max(p[i] for p in S) - min(p[i] for p in S) for i in range(len(S[0])))


_DS = None


def _ds_init(G, A_list, B_list, same):
    global _DS
    _DS = (G, set(G), A_list, B_list, same)


def _ds_job(ia):
    G, Gset, A_list, B_list, same = _DS
    gspan = _span(G)
    A = A_list[ia]
    sa = _span(A)
    out = []
    for ib, B in enumerate(B_list):
        if same and ib < ia: continue          # A(+)B = B(+)A: count each unordered pair once
        sb = _span(B)
        if any(x + y > z for x, y, z in zip(sa, sb, gspan)): continue
        k = len(A) * len(B)
        P = {add(x, y) for x in A for y in B}
        if len(P) != k: continue
        Q = {sub(x, y) for x in A for y in B}
        if len(Q) != k: continue
        P = list(P); Q = list(Q)
        cp, cq = canon(P), canon(Q)
        if cp == cq: continue
        if not (fits(P, Gset, G) and fits(Q, Gset, G)): continue
        out.append((tuple(sorted([cp, cq])), A, B))
    return out


def directsum(a):
    primes = tuple(a.primes); G = gamut(primes, a.odd); Gset = set(G)
    run = Run(a.out)
    run.say(f"directsum: primes {primes}, odd limit {a.odd}, gamut {len(G)} notes, sizes {a.sizes}")
    cache = {}
    def sh(n):
        if n not in cache:
            t = time.time(); cache[n] = shapes(G, Gset, n)
            run.say(f"  {len(cache[n]):,} {n}-note shapes ({time.time()-t:.0f}s)")
        return cache[n]
    fams, seen, summary = [], set(), []
    for spec in a.sizes:
        na, nb = map(int, spec.lower().split("x"))
        na, nb = min(na, nb), max(na, nb)
        A_list, B_list = sh(na), sh(nb)
        t0 = time.time()
        run.say(f"  {na}x{nb}: {len(A_list):,} x {len(B_list):,} shape pairs")
        found = 0
        with Pool(a.workers, initializer=_ds_init, initargs=(G, A_list, B_list, na == nb)) as pool:
            for i, part in enumerate(pool.imap_unordered(_ds_job, range(len(A_list)), chunksize=4)):
                for key, A, B in part:
                    if key in seen: continue
                    seen.add(key); found += 1
                    fams.append((na * nb, [list(key[0]), list(key[1])],
                                 {"mechanism": f"directsum {na}x{nb}",
                                  "A": [str(ratio(v, primes)) for v in sorted(A, key=lambda v: ratio(v, primes))],
                                  "B": [str(ratio(v, primes)) for v in sorted(B, key=lambda v: ratio(v, primes))]}))
                if (i + 1) % max(1, len(A_list) // 10) == 0:
                    run.say(f"    {i+1}/{len(A_list)} chord shapes, {found} families, {time.time()-t0:.0f}s")
        run.say(f"  {na}x{nb}: {found} new families ({time.time()-t0:.0f}s)")
        summary.append((spec, found))
    types = write_families(run, fams, primes, len(G), {})
    by_k = {}
    for k, _, _ in fams: by_k[k] = by_k.get(k, 0) + 1
    with open(os.path.join(run.out, "summary.csv"), "w") as fh:
        fh.write("notes,directsum_families,gamut_size\n")
        for k in sorted(by_k): fh.write(f"{k},{by_k[k]},{len(G)}\n")
    run.say(f"done: {len(fams)} families by size {by_k}, {len(types)} geometric types -> {run.out}")
    return by_k

# ----------------------------------------------------------------------------- U.V generator: types + place
#
# A family is P = U.V and Q = U*.V or U.V* (a mirrored factor), with P and Q both plain note sets.
# U = {0, u1, ..} is a note set; V = {0, v1, ..} minus {w1, ..} may carry minus terms.
# `types` works symbolically: every minus term of P (and of Q) must cancel a plus term, which is a
# linear equation between the unknown intervals u, v, w. A depth-first search over which plus term
# each minus term cancels gives every possible cancellation pattern; solving its equations generically
# gives the most general family of that pattern (a TYPE), as points in an abstract lattice Z^r.
# `place` then lays each type into a real gamut: it maps the type's r basis intervals to intervals of
# the gamut in every way, and keeps the placements where both P and Q fit and stay distinct.

def _nullspace(rows, n):
    """integer basis of {x in Q^n : rows . x = 0}"""
    M = [[Fraction(c) for c in r] for r in rows]
    piv_cols, r = [], 0
    for c in range(n):
        p = next((i for i in range(r, len(M)) if M[i][c] != 0), None)
        if p is None: continue
        M[r], M[p] = M[p], M[r]
        pv = M[r][c]
        M[r] = [x / pv for x in M[r]]
        for i in range(len(M)):
            if i != r and M[i][c] != 0:
                f = M[i][c]
                M[i] = [x - f * y for x, y in zip(M[i], M[r])]
        piv_cols.append(c); r += 1
    free = [c for c in range(n) if c not in piv_cols]
    basis = []
    for fc in free:
        x = [Fraction(0)] * n
        x[fc] = Fraction(1)
        for i, pc in enumerate(piv_cols):
            x[pc] = -M[i][fc]
        den = 1
        for v in x: den = den * v.denominator // gcd(den, v.denominator)
        basis.append([int(v * den) for v in x])
    return basis


class _Sym:
    """symbolic setup for U (nu notes) times V (vp plus terms incl. 0, vm minus terms)"""
    def __init__(self, nu, vp, vm):
        self.n = (nu - 1) + (vp - 1) + vm
        e = lambda i: tuple(1 if j == i else 0 for j in range(self.n))
        z = (0,) * self.n
        self.U = [z] + [e(i) for i in range(nu - 1)]
        self.Vp = [z] + [e(nu - 1 + i) for i in range(vp - 1)]
        self.Vm = [e(nu - 1 + vp - 1 + i) for i in range(vm)]
        # groups of interchangeable labels (used to skip relabelled duplicates in the search)
        self.groups = [list(range(0, nu - 1)), list(range(nu - 1, nu - 1 + vp - 1))]

    @staticmethod
    def terms(U, Vp, Vm):
        return [(add(u, v), 1) for u in U for v in Vp] + [(add(u, w), -1) for u in U for w in Vm]

    def P(self):
        return self.terms(self.U, self.Vp, self.Vm)

    def Q(self, flip):
        if flip == "U":
            return self.terms([neg(u) for u in self.U], self.Vp, self.Vm)
        return self.terms(self.U, [neg(v) for v in self.Vp], [neg(w) for w in self.Vm])


def _realise(rows, n):
    B = _nullspace(rows, n) if rows else [[1 if i == j else 0 for i in range(n)] for j in range(n)]
    return B   # unknown j  ->  (B[0][j], ..., B[r-1][j])


def _place_terms(terms, B):
    r = len(B)
    out = {}
    for sym, c in terms:
        pt = tuple(sum(B[s][j] * sym[j] for j in range(len(sym))) for s in range(r))
        out[pt] = out.get(pt, 0) + c
    return out


def _nondegenerate(sym, B):
    def distinct(L):
        pts = [tuple(sum(B[s][j] * x[j] for j in range(len(x))) for s in range(len(B))) for x in L]
        return len(set(pts)) == len(pts)
    return distinct(sym.U) and distinct(sym.Vp + sym.Vm)


def _rref_key(rows, n):
    """canonical form of the equation system (reduced row echelon form, primitive integer rows).
    Systems with the same key have the same solutions, so the search below them is identical."""
    M = [[Fraction(c) for c in r] for r in rows]
    r = 0
    for c in range(n):
        p = next((i for i in range(r, len(M)) if M[i][c] != 0), None)
        if p is None: continue
        M[r], M[p] = M[p], M[r]
        pv = M[r][c]
        M[r] = [x / pv for x in M[r]]
        for i in range(len(M)):
            if i != r and M[i][c] != 0:
                f = M[i][c]
                M[i] = [x - f * y for x, y in zip(M[i], M[r])]
        r += 1
    out = []
    for row in M[:r]:
        den = 1
        for x in row: den = den * x.denominator // gcd(den, x.denominator)
        ints = [int(x * den) for x in row]
        g = 0
        for x in ints: g = gcd(g, abs(x))
        out.append(tuple(x // g for x in ints))
    return tuple(out)


def _dfs(sym, rows, stage, flip, out, stats):
    """stage 'P': cancel P's minus terms; stage 'Q': then cancel Q's.
    Pruning: (1) a system already explored (same solutions, reached in another order) is skipped;
    (2) labels that no equation mentions yet are interchangeable, so only the lowest-numbered one
    of each group is tried as a new cancellation partner."""
    # a 16-byte digest of the canonical system, not the system itself: the set of explored systems
    # can hold millions of entries (collision chance ~ n^2 / 2^129, negligible)
    key = hashlib.blake2b(repr((stage, _rref_key(rows, sym.n))).encode(), digest_size=16).digest()
    if key in stats["seen"]:
        stats["skipped"] += 1
        return
    if len(stats["seen"]) >= stats.get("seen_max", 1 << 62):
        # the set only prunes repeated work, so clearing it keeps results exact (some work repeats)
        stats["seen"].clear()
        stats["cleared"] = stats.get("cleared", 0) + 1
    stats["seen"].add(key)
    stats["nodes"] += 1
    if stats.get("report") and time.time() - stats["t_last"] > 60:
        stats["t_last"] = time.time()
        stats["report"](stats)
    B = _realise(rows, sym.n)
    if not B or not _nondegenerate(sym, B):
        return
    for which in ("P", "Q") if stage == "Q" else ("P",):
        terms = sym.P() if which == "P" else sym.Q(flip)
        val = _place_terms(terms, B)
        bad = [(pt, c) for pt, c in val.items() if c < 0]
        if bad:
            # first uncancelled minus term: try every plus term to cancel it
            pt0 = min(bad)[0]
            minus_syms = [s for s, c in terms if c < 0 and _place_terms([(s, 1)], B).popitem()[0] == pt0]
            plus_syms = [s for s, c in terms if c > 0]
            ms = minus_syms[0]
            touched = {j for rw in rows for j, c in enumerate(rw) if c} | {j for j, c in enumerate(ms) if c}
            first_free = []
            for g in sym.groups:
                free = [j for j in g if j not in touched]
                first_free.append((set(free), free[0] if free else None))
            tried = set()
            for ps in plus_syms:
                if any(any(ps[j] != 0 and j in free and j != f0 for j in free) for free, f0 in first_free):
                    stats["sym_skipped"] += 1
                    continue
                row = tuple(a - b for a, b in zip(ms, ps))
                if row in tried or not any(row): continue
                tried.add(row)
                q = _place_terms([(ps, 1)], B).popitem()[0]
                if q == pt0: continue
                _dfs(sym, rows + [list(row)], stage, flip, out, stats)
            return
        if any(c > 1 for c in val.values()):
            return
    if stage == "P":
        _dfs(sym, rows, "Q", flip, out, stats)
        return
    P = [pt for pt, c in _place_terms(sym.P(), B).items() if c == 1]
    Q = [pt for pt, c in _place_terms(sym.Q(flip), B).items() if c == 1]
    if len(P) != len(Q) or canon(P) == canon(Q):
        return
    out(P, Q, flip, len(B))


def _joint_basis_coords(P, Q):
    """express P and Q in a basis of the lattice spanned by all their differences; the basis vectors
    are themselves differences, so any placement maps them to intervals of the target lattice.
    Returns (r, P coords, Q coords) canonical up to basis change, translation, negation and P<->Q."""
    pts = [(p, 0) for p in P] + [(q, 1) for q in Q]
    o = P[0]
    D = [sub(p, o) for p, _ in pts]
    r, cols = rank_and_cols(D)
    if r == 0 or r > 3:
        return None
    D = [tuple(p[c] for c in cols) for p in D]
    diffs = sorted({sub(p, q) for p in D for q in D if p != q})
    g = 0
    for t in itertools.combinations(diffs, r):
        g = gcd(g, abs(_det([list(v) for v in zip(*t)]) if r > 1 else t[0][0]))
    if g == 0:
        return None
    best = None
    for Bv in itertools.permutations(diffs, r):
        det = _det([list(v) for v in zip(*Bv)]) if r > 1 else Bv[0][0]
        if abs(det) != g: continue
        cs = []
        for p in D:
            x = _solve(Bv, p) if r > 1 else ((p[0] // det,) if p[0] % det == 0 else None)
            if x is None: break
            cs.append(x)
        else:
            for sg in (1, -1):
                X = [tuple(sg * a for a in x) for x in cs]
                m = min(X)
                X = [sub(x, m) for x in X]
                A = tuple(sorted(X[:len(P)])); Bq = tuple(sorted(X[len(P):]))
                key = min((A, Bq), (Bq, A))
                if best is None or key < best: best = key
    return r, best


def _types_job(job):
    """one independent search: one shape, one flip. Each search has its own pruning state (as it
    always had), so running them in parallel loses no pruning."""
    i, nu, vp, vm, flip, seen_max = job
    t = time.time()
    sym = _Sym(nu, vp, vm)
    # patterns are reduced to their type as soon as they are found (first occurrence kept, in order),
    # so memory holds one entry per type instead of every raw pattern
    pats = {}
    count = [0]

    def found(P, Q, fl, r):
        count[0] += 1
        jb = _joint_basis_coords(P, Q)
        if jb is None: return
        rk, key = jb
        if key not in pats:
            pats[key] = (key, rk, len(P), fl)

    def report(st):
        print(f"    U {nu} x V {vp}+/{vm}-, flip {flip}: {st['nodes']:,} nodes, {len(st['seen']):,} systems kept, "
              f"{count[0]:,} patterns, {len(pats)} types, {_rss_mb()} MB, "
              f"{st.get('cleared', 0)} clears, {time.time()-t:.0f}s", flush=True)

    stats = {"nodes": 0, "skipped": 0, "sym_skipped": 0, "seen": set(), "report": report, "t_last": time.time(),
             "seen_max": seen_max}
    _dfs(sym, [], "P", flip, found, stats)
    return i, (stats["nodes"], stats["skipped"], stats["sym_skipped"]), count[0], list(pats.values()), time.time() - t


def _rss_mb():
    try:
        with open("/proc/self/status") as fh:
            for line in fh:
                if line.startswith("VmRSS:"):
                    return int(line.split()[1]) // 1024
    except OSError:
        pass
    return "?"


def types_mode(a):
    out_path = a.out
    os.makedirs(out_path, exist_ok=True)
    results = {}
    t0 = time.time()
    jobs = [(i, nu, vp, vm, flip, a.seen_max) for i, ((nu, vp, vm), flip)
            in enumerate((sh, f) for sh in a.shape for f in ("U", "V"))]
    w = max(1, min(a.workers, len(jobs)))
    print(f"{len(jobs)} independent searches (each shape x flip U/V) on {w} worker(s)", flush=True)
    done = {}

    def finished(res):
        done[res[0]] = res
        _, nu, vp, vm, flip, _ = jobs[res[0]]
        print(f"  finished U {nu} x V {vp}+/{vm}-, flip {flip}: {res[1][0]:,} nodes in {res[4]:.0f}s "
              f"({len(done)}/{len(jobs)} done, {time.time()-t0:.0f}s elapsed)", flush=True)

    if w == 1:
        for job in jobs:
            finished(_types_job(job))
    else:
        # ProcessPoolExecutor, not Pool: if a worker is killed (for example by the out-of-memory killer)
        # the run stops with an error instead of waiting forever for the lost search
        with ProcessPoolExecutor(max_workers=w) as ex:
            futs = [ex.submit(_types_job, job) for job in jobs]
            try:
                for f in as_completed(futs):
                    finished(f.result())
            except BrokenProcessPool:
                print("ERROR: a search process died (out of memory? check `sudo dmesg | tail`); "
                      "the types run is incomplete and nothing was written", flush=True)
                sys.exit(3)
    # merge in the fixed job order, so the output is identical to a one-worker run
    for i, nu, vp, vm, flip, _ in jobs:
        _, (nodes, skipped, sym_skipped), nfound, pats, secs = done[i]
        k = nu * vp - nu * vm
        new = 0
        for key, rk, kp, fl in pats:
            if key not in results:
                results[key] = {"k": kp, "rank": rk, "U_notes": nu, "V_plus": vp, "V_minus": vm,
                                "flip": fl, "P": [list(x) for x in key[0]], "Q": [list(x) for x in key[1]]}
                new += 1
        print(f"U {nu} notes x V {vp}+/{vm}- (k={k}), flip {flip}: {nodes:,} search nodes "
              f"({skipped:,} repeats and {sym_skipped:,} relabellings pruned), "
              f"{nfound} patterns, {new} new types ({secs:.0f}s)", flush=True)
    with open(os.path.join(out_path, "uv_types.jsonl"), "w") as fh:
        for i, t in enumerate(sorted(results.values(), key=lambda t: (t["k"], t["rank"], t["P"])), 1):
            t["type"] = i
            fh.write(json.dumps(t) + "\n")
            print(f"  type {i}: k={t['k']} rank {t['rank']}  P={t['P']}  Q={t['Q']}")
    print(f"{len(results)} types -> {os.path.join(out_path, 'uv_types.jsonl')}")
    return list(results.values())


_PL = None


def _pl_init(G, D, types):
    global _PL
    _PL = (G, set(G), D, set(D), types)


def _pl_job(args):
    ti, i1 = args
    G, Gset, D, Dset, types = _PL
    t = types[ti]
    P0 = [tuple(x) for x in t["P"]]; Q0 = [tuple(x) for x in t["Q"]]
    r = t["rank"]
    allp = P0 + Q0
    out = []
    g1 = D[i1]
    for rest in itertools.product(D, repeat=r - 1):
        gs = (g1,) + rest
        img = lambda x: tuple(sum(x[s] * gs[s][d] for s in range(r)) for d in range(len(g1)))
        # quick reject: every point of P and of Q, relative to the first, must be an interval of the gamut
        P = [img(x) for x in P0]
        p0 = P[0]
        if any(sub(p, p0) not in Dset for p in P[1:]): continue
        Q = [img(x) for x in Q0]
        q0 = Q[0]
        if any(sub(q, q0) not in Dset for q in Q[1:]): continue
        if len(set(P)) != len(P) or len(set(Q)) != len(Q): continue
        cp, cq = canon(P), canon(Q)
        if cp == cq: continue
        if not (fits(P, Gset, G) and fits(Q, Gset, G)): continue
        out.append(tuple(sorted([cp, cq])))
    return ti, out


def place_mode(a):
    primes = tuple(a.primes); G = gamut(primes, a.odd)
    run = Run(a.out)
    types = [json.loads(l) for l in open(a.types)]
    types = [t for t in types if (not a.k or t["k"] in a.k)]
    D = sorted({sub(p, q) for p in G for q in G if p != q})
    run.say(f"place: primes {primes}, odd limit {a.odd}, gamut {len(G)} notes, {len(D):,} intervals, "
            f"{len(types)} types, {a.workers} workers")
    for t in types:
        if t["rank"] > 2:
            run.say(f"  type {t['type']} (k={t['k']}) has rank {t['rank']}: |intervals|^{t['rank']} placements, "
                    f"~{len(D)**t['rank']:.1e}; skipped unless --allow-rank3")
    types = [t for t in types if t["rank"] <= 2 or a.allow_rank3]
    seen, fams = set(), []
    t0 = time.time()
    jobs = [(ti, i1) for ti in range(len(types)) for i1 in range(len(D))]
    per_type = {}
    with Pool(a.workers, initializer=_pl_init, initargs=(G, D, types)) as pool:
        done = 0; last = 0
        for ti, part in pool.imap_unordered(_pl_job, jobs, chunksize=16):
            for key in part:
                if key in seen: continue
                seen.add(key)
                t = types[ti]
                per_type[t["type"]] = per_type.get(t["type"], 0) + 1
                fams.append((t["k"], [list(key[0]), list(key[1])],
                             {"mechanism": f"uv type {t['type']}", "uv_type": t["type"]}))
            done += 1
            if time.time() - t0 - last > 60:
                last = time.time() - t0
                run.say(f"    {100*done/len(jobs):5.1f}% of placements, {len(fams)} families, {last/60:.1f} min")
    fams.sort(key=lambda f: (f[0], f[1]))
    write_families(run, fams, primes, len(G), {})
    by_k = {}
    for k, _, _ in fams: by_k[k] = by_k.get(k, 0) + 1
    with open(os.path.join(run.out, "summary.csv"), "w") as fh:
        fh.write("notes,families,gamut_size\n")
        for k in sorted(by_k): fh.write(f"{k},{by_k[k]},{len(G)}\n")
    run.say(f"done: {len(fams)} families {by_k}; per uv type {per_type} ({(time.time()-t0)/60:.1f} min) -> {run.out}")
    return by_k

# ----------------------------------------------------------------------------- estimate / selftest
def estimate(a):
    primes = tuple(a.primes); G = gamut(primes, a.odd); Gset = set(G)
    print(f"gamut: primes {primes}, odd limit {a.odd}: {len(G)} notes; {sys.implementation.name}, {a.workers} workers")
    for k in a.k:
        # time the real pass-1 work on a spread of jobs, and measure the share of subsets that are class representatives
        jobs = [(i0, i0 + 1 + d) for i0 in range(0, len(G) // 2, max(1, len(G) // 12)) for d in (0, 3)]
        n = emitted = 0; t = time.time()
        for i0, i1 in jobs:
            if len(G) - i1 - 1 < k - 2: continue
            head = [G[i0], G[i1]]
            for rest in itertools.islice(itertools.combinations(range(i1 + 1, len(G)), k - 2), 4000):
                S = head + [G[j] for j in rest]; n += 1
                if _emit(S, G, Gset):
                    emitted += 1; _fp_hash(fingerprint(S))
        rate = n / (time.time() - t)
        total = comb(len(G), k)
        classes = total * emitted / max(n, 1)
        hours = 2 * total / rate / a.workers / 3600            # pass 1 + pass 3
        disk = classes * 8 / 1e9
        buckets = max(1, int(classes * 24 / (a.mem_gb * 1e9 / 2)) + 1)   # ~24 B/class while sorting (pypy), 2 merge workers
        print(f"  k={k}: {total:,} subsets, ~{classes:,.0f} classes; ~{hours*60:,.1f} min on {a.workers} workers "
              f"({rate:,.0f} subsets/s/core); disk ~{disk:,.1f} GB; suggest --buckets {buckets} with --merge-workers 2")


def selftest(a):
    import tempfile
    d = tempfile.mkdtemp(prefix="zgen_selftest_")
    ns = argparse.Namespace(primes=[3, 5], odd=123, k=[6, 7], workers=a.workers, buckets=4, merge_workers=2,
                            workdir=os.path.join(d, "work"), keep_work=False, out=os.path.join(d, "exh"))
    s = exhaustive(ns)
    assert [x[3] for x in s] == [7, 8], s
    assert [x[2] for x in s] == [415386, 2017653], s
    ns = argparse.Namespace(primes=[3, 5], odd=123, sizes=["3x3"], workers=a.workers, out=os.path.join(d, "ds"))
    by_k = directsum(ns)
    assert by_k == {9: 2823}, by_k
    print("SELFTEST PASSED (k=6,7 exhaustive and 3x3 direct sums match the odd-123 run)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = ap.add_subparsers(dest="cmd", required=True)
    for name in ("exhaustive", "directsum", "estimate", "selftest", "types", "place"):
        p = sp.add_parser(name)
        p.add_argument("--workers", type=int, default=max(1, cpu_count() - 1))
        if name == "selftest": continue
        if name == "types":
            p.add_argument("--shape", nargs="+", required=True, metavar="U,V+,V-",
                           help="factor sizes, e.g. 3,3,1 = 3-note U times V with 3 plus terms (incl. 0) and 1 minus term")
            p.add_argument("--out", required=True)
            p.add_argument("--seen-max", type=int, default=10_000_000,
                           help="explored systems remembered per search (~100 bytes each) before the memory is "
                                "cleared; only pruning, so results are exact at any value (default 10,000,000)")
            continue
        p.add_argument("--primes", type=int, nargs="+", required=True)
        if name == "place":
            p.add_argument("--types", required=True, help="uv_types.jsonl from the types mode")
            p.add_argument("--k", type=int, nargs="*", default=None, help="only types with these note counts")
            p.add_argument("--allow-rank3", action="store_true")
        p.add_argument("--odd", type=int, required=True, help="odd limit of the gamut")
        if name in ("exhaustive", "estimate"):
            p.add_argument("--k", type=int, nargs="+", required=True)
        if name == "exhaustive":
            p.add_argument("--buckets", type=int, default=16, help="disk buckets; more buckets = less RAM in pass 2")
            p.add_argument("--merge-workers", type=int, default=2, help="buckets merged in parallel in pass 2")
            p.add_argument("--workdir", default=None, help="scratch dir for bucket files (default OUT/work); "
                           "re-running with the same OUT resumes pass 1")
            p.add_argument("--keep-work", action="store_true", help="keep bucket files after each k")
        if name == "estimate":
            p.add_argument("--mem-gb", type=float, default=8.0)
        if name == "directsum":
            p.add_argument("--sizes", nargs="+", default=["3x3", "3x4", "3x5", "4x4"])
        if name in ("exhaustive", "directsum", "place"):
            p.add_argument("--out", required=True)
    a = ap.parse_args()
    if getattr(a, "workdir", "x") is None:
        a.workdir = os.path.join(a.out, "work")
    if a.cmd == "types":
        a.shape = [tuple(int(x) for x in sh.split(",")) for sh in a.shape]
    {"exhaustive": exhaustive, "directsum": directsum, "estimate": estimate, "selftest": selftest,
     "types": types_mode, "place": place_mode}[a.cmd](a)


if __name__ == "__main__":
    main()
