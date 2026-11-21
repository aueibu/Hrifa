#!/usr/bin/env python3
"""zprod.py: JI Z-families in a gamut, built directly as products P = U*V with a small flipped factor V.

Factor law (Rosenblatt & Seymour; see zfactor.py): a Z-partner of P = U*V is Q = U*V* (V reversed:
every exponent negated); reversing U instead gives an inversion of Q, so it is the same family. Every
5-limit family found so far has a small signed factor (plus terms and a few minus terms that cancel).

Search, for one gamut G:
  1. V: signed polynomials with vp plus terms (lowest point at 0) and vm minus terms, vectors with
     |coordinate| <= --vmax. Each minus term is a lattice point of the convex hull of the plus terms,
     not a vertex (a minus term must be cancelled; following the cancellations around U closes a cycle,
     so it is a rational average of plus terms). V must differ from its reversal (else Q = P).
  2. U: any integer polynomial (coefficients --ucoeffs; 2 = doubled note) such that P = U*V has 0/1
     coefficients on gamut points only, and Q = U*V* has 0/1 coefficients. Candidate points: u + v lies
     in the gamut's bounding box for every term v of V (Newton polytopes: hull(P) = hull(U) + hull(V)).
     Depth-first over candidates in lexicographic order: a coefficient of P or Q is final once its last
     possible contributor is decided, so bad coefficients prune at once. sum(U) = k / V(1).
  3. Keep pairs where some transposition or inversion of Q fits the gamut and Q is not a transposition
     or inversion of P; group by interval content (zgen fingerprint) into families.
Families with no factor of at most --max-terms terms are not found (compare with an exhaustive run).

usage (pypy3, on the VM):
  pypy3 zprod.py --zgen ~/zgen/zgen_v4.py --primes 3 5 --odd 123 --k 10 --workers 8 --out DIR
writes DIR/k<k>/families.jsonl (zgen format; check with verify_families.py) and DIR/summary.csv
"""
import argparse, collections, csv, importlib.util, itertools, json, os, sys, time
from fractions import Fraction
from math import gcd
from multiprocessing import Pool

Z = None
_G = _GSET = _BOX = _ARGS = None


def load_zgen(path):
    spec = importlib.util.spec_from_file_location("zgen", path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def add(u, v): return tuple(a + b for a, b in zip(u, v))
def sub(u, v): return tuple(a - b for a, b in zip(u, v))
def neg(u): return tuple(-a for a in u)


# ----------------------------------------------------------------------------- convex hull membership
def _rank(vs):
    M = [list(map(Fraction, v)) for v in vs]
    r = 0
    n = len(M[0]) if M else 0
    for c in range(n):
        p = next((i for i in range(r, len(M)) if M[i][c] != 0), None)
        if p is None:
            continue
        M[r], M[p] = M[p], M[r]
        for i in range(len(M)):
            if i != r and M[i][c] != 0:
                f = M[i][c] / M[r][c]
                M[i] = [a - f * b for a, b in zip(M[i], M[r])]
        r += 1
    return r


def in_hull(x, pts):
    """is lattice point x in the convex hull of pts (small sets: LP-free test by barycentric search)?
    Uses: x in hull iff x is a convex combination of some affinely independent subset (Caratheodory)."""
    d = len(x)
    for r in range(1, min(len(pts), d + 1) + 1):
        for sub_pts in itertools.combinations(pts, r):
            lam = _bary(x, sub_pts)
            if lam is not None and all(l >= 0 for l in lam):
                return True
    return False


def _bary(x, pts):
    """solve x = sum l_i p_i, sum l_i = 1 exactly; None if no unique solution"""
    r = len(pts)
    d = len(x)
    # equations: d coordinates + 1 (sum)
    A = [[Fraction(p[i]) for p in pts] + [Fraction(x[i])] for i in range(d)] + [[Fraction(1)] * r + [Fraction(1)]]
    rows = len(A)
    piv = []
    rr = 0
    for c in range(r):
        p = next((i for i in range(rr, rows) if A[i][c] != 0), None)
        if p is None:
            return None
        A[rr], A[p] = A[p], A[rr]
        pv = A[rr][c]
        A[rr] = [a / pv for a in A[rr]]
        for i in range(rows):
            if i != rr and A[i][c] != 0:
                f = A[i][c]
                A[i] = [a - f * b for a, b in zip(A[i], A[rr])]
        piv.append(c)
        rr += 1
    for i in range(rr, rows):
        if A[i][r] != 0:
            return None
    return [A[i][r] for i in range(r)]


# ----------------------------------------------------------------------------- V enumeration
def lex_positive_box(bounds):
    """lexicographically positive vectors with |v_i| <= bounds[i]"""
    out = []
    for v in itertools.product(*[range(-b, b + 1) for b in bounds]):
        if v > (0,) * len(bounds):
            out.append(v)
    return out


def interior_points(plus):
    """lattice points in the convex hull of `plus` that are not plus points themselves"""
    dim = len(plus[0])
    lo = [min(p[i] for p in plus) for i in range(dim)]
    hi = [max(p[i] for p in plus) for i in range(dim)]
    ps = set(plus)
    out = []
    for x in itertools.product(*[range(lo[i], hi[i] + 1) for i in range(dim)]):
        if x not in ps and in_hull(x, plus):
            out.append(x)
    return out


def normalize(terms):
    """terms: dict point -> coeff. Shift so the lexicographically smallest point is 0; make it positive"""
    m = min(terms)
    sgn = 1 if terms[m] > 0 else -1
    return tuple(sorted((sub(p, m), sgn * c) for p, c in terms.items()))


def reversal(V):
    return normalize({neg(p): c for p, c in V})


def gen_V(bounds, shapes):
    """yield signed V (tuple of (point, coeff)), lowest point 0 with coeff +1, for each (vp, vm) shape"""
    dim = len(bounds)
    box = lex_positive_box(bounds)
    seen = set()
    for vp, vm in shapes:
        for rest in itertools.combinations(box, vp - 1):
            plus = [(0,) * dim] + list(rest)
            if vm == 0:
                cands = [()]
            else:
                inner = interior_points(plus)
                if len(inner) < vm:
                    continue
                cands = itertools.combinations(inner, vm)
            for minus in cands:
                terms = {p: 1 for p in plus}
                for p in minus:
                    terms[p] = -1
                V = normalize(terms)
                if V in seen:
                    continue
                seen.add(V)
                R = reversal(V)
                if R == V or R == normalize({p: -c for p, c in V}):
                    continue
                yield V


# ----------------------------------------------------------------------------- U search for one V
def search_U(V, ks):
    """all U with P = U*V 0/1 on gamut points and Q = U*V* 0/1; returns list of (P points, Q points)"""
    Vs = reversal(V)
    vsum = sum(c for _, c in V)
    if vsum <= 0:
        return []
    targets = sorted({k // vsum for k in ks if k % vsum == 0})
    if not targets:
        return []
    usum_max = max(targets)
    dim = len(_G[0])
    lo, hi = _BOX
    # candidate U points: u + v inside the bounding box for every term v of V
    vlo = [min(p[i] for p, _ in V) for i in range(dim)]
    vhi = [max(p[i] for p, _ in V) for i in range(dim)]
    cand = [u for u in itertools.product(*[range(lo[i] - vlo[i], hi[i] - vhi[i] + 1) for i in range(dim)])]
    cand.sort()
    if not cand:
        return []
    idx = {u: i for i, u in enumerate(cand)}
    # when is each P / Q point final? after its last (largest-index) contributor is decided
    def finals(W):
        last = {}
        for i, u in enumerate(cand):
            for v, _ in W:
                p = add(u, v)
                last[p] = i
        out = [[] for _ in cand]
        for p, i in last.items():
            out[i].append(p)
        return out
    finP, finQ = finals(V), finals(Vs)
    P = collections.defaultdict(int)
    Q = collections.defaultdict(int)
    res = []
    ucoeffs = _ARGS.ucoeffs
    # with negative U coefficients the sum alone does not bound the search: cap the negative mass
    # (--max-neg) and so the positive mass (target + negative mass)
    max_neg = _ARGS.max_neg
    pos_max = usum_max + max_neg
    state = {"usum": 0, "pos": 0, "neg": 0}

    def rec(i):
        if i == len(cand):
            if state["usum"] in targets:
                Ps = [p for p, c in P.items() if c == 1]
                Qs = [q for q, c in Q.items() if c == 1]
                if Ps:
                    res.append((Ps, Qs))
            return
        u = cand[i]
        for c in ucoeffs:
            if c > 0 and state["pos"] + c > pos_max:
                continue
            if c < 0 and state["neg"] - c > max_neg:
                continue
            if c:
                for v, a in V:
                    P[add(u, v)] += c * a
                for v, a in Vs:
                    Q[add(u, v)] += c * a
            ok = True
            for p in finP[i]:
                x = P[p]
                if x < 0 or x > 1 or (x == 1 and p not in _GSET):
                    ok = False
                    break
            if ok:
                for q in finQ[i]:
                    x = Q[q]
                    if x < 0 or x > 1:
                        ok = False
                        break
            if ok:
                state["usum"] += c
                if c > 0:
                    state["pos"] += c
                else:
                    state["neg"] -= c
                rec(i + 1)
                state["usum"] -= c
                if c > 0:
                    state["pos"] -= c
                else:
                    state["neg"] += c
            if c:
                for v, a in V:
                    P[add(u, v)] -= c * a
                for v, a in Vs:
                    Q[add(u, v)] -= c * a

    rec(0)
    return res


def _init(G, args):
    global _G, _GSET, _BOX, _ARGS, Z
    _G, _GSET, _ARGS = G, set(G), args
    dim = len(G[0])
    _BOX = ([min(p[i] for p in G) for i in range(dim)], [max(p[i] for p in G) for i in range(dim)])
    Z = load_zgen(args.zgen)


def _job(V):
    found = collections.defaultdict(set)
    n = 0
    for P, Q in search_U(V, _ARGS.k):
        n += 1
        cp, cq = Z.canon(P), Z.canon(Q)
        if cp == cq:
            continue
        if not (Z.fits(Q, _GSET, _G) or Z.fits([neg(q) for q in Q], _GSET, _G)):
            continue
        fp = Z.fingerprint(cp)
        found[(len(cp), fp)].update((cp, cq))
    return V, dict(found), n


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--zgen", required=True, help="path to zgen.py (helpers and output format)")
    ap.add_argument("--primes", type=int, nargs="+", required=True)
    ap.add_argument("--odd", type=int, required=True)
    ap.add_argument("--k", type=int, nargs="+", required=True)
    ap.add_argument("--shapes", nargs="+", default=["2,1", "3,1", "3,2", "4,1", "4,2"],
                    help="V shapes vp,vm (plus terms incl. the lowest, minus terms)")
    ap.add_argument("--vmax", type=int, default=0,
                    help="largest |coordinate| of a V vector (0 = the gamut's extent in each dimension)")
    ap.add_argument("--ucoeffs", type=int, nargs="+", default=[0, 1, 2])
    ap.add_argument("--max-neg", type=int, default=1, help="largest total of negative U coefficients (if -1 allowed)")
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    global Z
    Z = load_zgen(a.zgen)
    run = Z.Run(a.out)
    G = Z.gamut(a.primes, a.odd)
    shapes = [tuple(int(x) for x in s.split(",")) for s in a.shapes]
    dim = len(G[0])
    extent = [max(p[i] for p in G) - min(p[i] for p in G) for i in range(dim)]
    bounds = extent if a.vmax <= 0 else [min(a.vmax, e) for e in extent]
    Vs = list(gen_V(bounds, shapes))
    run.say(f"gamut {len(G)} notes ({a.primes}, odd <= {a.odd}); k {a.k}; V shapes {shapes}, |coord| <= {bounds}: "
            f"{len(Vs)} factors V; U coefficients {a.ucoeffs}")
    t0 = time.time()
    allf = collections.defaultdict(set)
    nprod = 0
    with Pool(a.workers, initializer=_init, initargs=(G, a)) as pool:
        for n, (V, found, cnt) in enumerate(pool.imap_unordered(_job, Vs, chunksize=4), 1):
            nprod += cnt
            for key, members in found.items():
                allf[key] |= members
            if n % 2000 == 0 or n == len(Vs):
                fams = sum(1 for (k, _), m in allf.items() if len(m) >= 2)
                run.say(f"  {n}/{len(Vs)} factors, {nprod:,} products, {fams} families, {time.time() - t0:.0f}s")
    rows = []
    for k in a.k:
        fams = [(k, [list(m) for m in sorted(ms)], {"mechanism": "zprod U*V, V flipped"})
                for (kk, fp), ms in sorted(allf.items()) if kk == k and len(ms) >= 2]
        sub_run = Z.Run(os.path.join(a.out, f"k{k}"))
        Z.write_families(sub_run, fams, a.primes, len(G), {})
        sizes = collections.Counter(len(f[1]) for f in fams)
        rows.append({"k": k, "families": len(fams), "family_sizes": dict(sorted(sizes.items()))})
        run.say(f"k={k}: {len(fams)} families (members per family: {dict(sorted(sizes.items()))})")
    with open(os.path.join(a.out, "summary.csv"), "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["k", "families", "family_sizes"])
        w.writeheader(); w.writerows(rows)
    run.say(f"done in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
