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

# ----------------------------------------------------------------------------- exhaustive mode
_G = None


def _init(G):
    global _G
    _G = G


def _exh_job(args):
    """all k-subsets whose smallest gamut index is i0. Returns {fp_hash: {class_hash, ...}}"""
    i0, k, shard, nshards = args
    G = _G
    out = {}
    first = G[i0]
    for rest in itertools.combinations(range(i0 + 1, len(G)), k - 1):
        S = [first] + [G[j] for j in rest]
        f = enc(fingerprint(S))
        if nshards > 1 and f % nshards != shard: continue
        c = enc(canon(S))
        s = out.get(f)
        if s is None: out[f] = c
        elif isinstance(s, set): s.add(c)
        elif s != c: out[f] = {s, c}
    return out


def _exh_exact(args):
    i0, k, flagged = args
    G = _G
    res = {}
    first = G[i0]
    for rest in itertools.combinations(range(i0 + 1, len(G)), k - 1):
        S = [first] + [G[j] for j in rest]
        fp = fingerprint(S)
        if enc(fp) in flagged:
            res.setdefault(fp, set()).add(canon(S))
    return res


def exhaustive(a):
    primes = tuple(a.primes); G = gamut(primes, a.odd)
    run = Run(a.out)
    run.say(f"exhaustive: primes {primes}, odd limit {a.odd}, gamut {len(G)} notes, k = {a.k}, {a.workers} workers")
    fams_all, summary = [], []
    with Pool(a.workers, initializer=_init, initargs=(G,)) as pool:
        for k in a.k:
            t0 = time.time()
            starts = list(range(len(G) - k + 1))
            n_sub = comb(len(G), k)
            run.say(f"  k={k}: {n_sub:,} subsets in {len(starts)} jobs x {a.shards} shard(s)")
            n_classes, flagged = 0, set()
            for shard in range(a.shards):
              jobs = [(i, k, shard, a.shards) for i in starts]
              merged = {}
              done = 0
              for part in pool.imap_unordered(_exh_job, jobs):
                for f, c in part.items():
                    s = merged.get(f)
                    cs = c if isinstance(c, set) else {c}
                    if s is None: merged[f] = cs if len(cs) > 1 else c
                    else:
                        if not isinstance(s, set): s = {s}
                        s |= cs
                        merged[f] = s if len(s) > 1 else next(iter(s))
                done += 1
                if done % max(1, len(jobs) // 10) == 0:
                    run.say(f"    pass 1 shard {shard+1}/{a.shards}: {done}/{len(jobs)} jobs, {time.time()-t0:.0f}s")
              n_classes += sum(len(s) if isinstance(s, set) else 1 for s in merged.values())
              flagged |= {f for f, s in merged.items() if isinstance(s, set)}
              del merged
            run.say(f"    {n_classes:,} set classes, {len(flagged)} candidate fingerprints; exact pass")
            exact = {}
            for part in pool.imap_unordered(_exh_exact, [(i, k, flagged) for i in starts]):
                for fp, cs in part.items():
                    exact.setdefault(fp, set()).update(cs)
            fams = [sorted(cs) for fp, cs in sorted(exact.items()) if len(cs) >= 2]
            run.say(f"  k={k}: {len(fams)} Z-families ({time.time()-t0:.0f}s)")
            summary.append((k, n_sub, n_classes, len(fams)))
            for m in fams:
                fams_all.append((k, [list(x) for x in m], {"mechanism": "exhaustive"}))
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
    primes = tuple(a.primes); G = gamut(primes, a.odd)
    print(f"gamut: primes {primes}, odd limit {a.odd}: {len(G)} notes")
    k = min(a.k)
    sample = list(itertools.islice(itertools.combinations(G, k), 200000))
    t = time.time()
    for S in sample: enc(fingerprint(S)); enc(canon(list(S)))
    rate = len(sample) / (time.time() - t)
    print(f"measured {rate:,.0f} subsets/s per core at k={k} with {sys.implementation.name}")
    for k in a.k:
        n = comb(len(G), k)
        sec = 2 * n / rate * (k / min(a.k)) ** 2 / a.workers    # two passes; per-subset cost grows ~k^2
        cls = n / 3                                   # ~3 subsets per class (measured on the odd-123 run)
        gb = cls * 150 / 1e9                          # ~150 bytes per stored class in the pass-1 table
        shards = max(1, int(gb / a.mem_gb) + 1) if gb > a.mem_gb else 1
        print(f"  exhaustive k={k}: {n:,} subsets, about {sec/60*shards:,.1f} min on {a.workers} workers; "
              f"pass-1 table ~{gb:,.1f} GB -> use --shards {shards} for {a.mem_gb} GB RAM")
    for na, nb in ((3, 3), (3, 4), (3, 5), (4, 4)):
        print(f"  directsum {na}x{nb}: shapes come from {comb(len(G), na):,} and {comb(len(G), nb):,} subsets; "
              f"the run log prints the exact shape-pair count before the pair loop starts")


def selftest(a):
    import tempfile
    d = tempfile.mkdtemp(prefix="zgen_selftest_")
    ns = argparse.Namespace(primes=[3, 5], odd=123, k=[6, 7], workers=a.workers, shards=2, out=os.path.join(d, "exh"))
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
            p.add_argument("--shards", type=int, default=1, help="split pass 1 by fingerprint to cap RAM (CPU x shards)")
        if name == "estimate":
            p.add_argument("--mem-gb", type=float, default=8.0)
        if name == "directsum":
            p.add_argument("--sizes", nargs="+", default=["3x3", "3x4", "3x5", "4x4"])
        if name in ("exhaustive", "directsum"):
            p.add_argument("--out", required=True)
    a = ap.parse_args()
    {"exhaustive": exhaustive, "directsum": directsum, "estimate": estimate, "selftest": selftest}[a.cmd](a)


if __name__ == "__main__":
    main()
