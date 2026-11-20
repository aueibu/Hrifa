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
import argparse, itertools, json, os, sys, time
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
    for name in ("exhaustive", "directsum", "estimate", "selftest"):
        p = sp.add_parser(name)
        p.add_argument("--workers", type=int, default=max(1, cpu_count() - 1))
        if name == "selftest": continue
        p.add_argument("--primes", type=int, nargs="+", required=True)
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
        if name in ("exhaustive", "directsum"):
            p.add_argument("--out", required=True)
    a = ap.parse_args()
    if getattr(a, "workdir", "x") is None:
        a.workdir = os.path.join(a.out, "work")
    {"exhaustive": exhaustive, "directsum": directsum, "estimate": estimate, "selftest": selftest}[a.cmd](a)


if __name__ == "__main__":
    main()
