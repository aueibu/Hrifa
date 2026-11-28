#!/usr/bin/env python3
"""new5.py (2026-11-27): prime form, smallest q found, and factor structure of the new 9-note 2-D shapes from the
stopped k 9 min-dim 2 run (typeflats_k9d2_partial.json, classes found #35, #54, #56, #57, #80).

1. integral form (type_integral) of each class, then prime form with the shapes page rule (shapes_catalog.prime_form,
   copied: unimodular maps with entries |x| <= 10, translation/mirror per set, P/Q swap; least total width).
2. smallest q of a JI realization FOUND by a bounded search (an upper bound on the first q, not a proof): every
   realization is an integral linear image of the integral form, so the two basis vectors go to exponent vectors a, b
   over the primes 3, 5, 7, 11, 13; q = max over the interval vectors (x, y) of the odd limit of a^x b^y. Searched:
   bases of the integral lattice changed by every unimodular 2 x 2 matrix with entries |x| <= 1; a = every vector with
   odd limit <= 45; b in the box 3^[-24, 24] 5^[-3, 3] 7^[-2, 2] 11^[-1, 1] 13^[-1, 1]. Candidates are taken in
   increasing q and kept only if all notes are distinct, Q is not +-P + t, and a, b are independent (then the map is
   one-to-one on the plane, so the realization is exactly this shape).
3. factor structure of the shape itself (one variable per lattice axis): factor_struct.analyse (P = U V, Q = U V*).

usage (VM, ~/zruns/p9 with type_image.py, type_integral.py, factor_struct.py):
    PYTHONPATH=~/pylib python3 new5.py typeflats_k9d2_partial.json 35,54,56,57,80 > new5.json
"""
import itertools, json, math, sys
from fractions import Fraction as F
from multiprocessing import Pool

import numpy as np

from type_image import image
from type_integral import integral_form
import factor_struct

PR = [3, 5, 7, 11, 13]
LP = np.log(PR)


# ---- prime form: copied from shapes_catalog.py (that file runs its job at import time) ----
def det(M):
    return M[0][0] * M[1][1] - M[0][1] * M[1][0]


def unimodular(R):
    for e in itertools.product(range(-R, R + 1), repeat=4):
        M = [e[0:2], e[2:4]]
        if abs(det(M)) == 1:
            yield M


def width(S):
    return sum(max(p[i] for p in S) - min(p[i] for p in S) for i in range(len(S[0])))


def norm(S):
    m = [min(p[i] for p in S) for i in range(len(S[0]))]
    return tuple(sorted(tuple(x - m[i] for i, x in enumerate(p)) for p in S))


def apply(M, S):
    return [[sum(M[r][c] * p[c] for c in range(2)) for r in range(2)] for p in S]


def prime_form(P, Q):
    best = None
    for M in unimodular(10):
        P2, Q2 = apply(M, P), apply(M, Q)
        w = width(P2) + width(Q2)
        if best is not None and w > best[0]:
            continue
        mir = lambda S: [[-x for x in p] for p in S]
        for A, B in ((P2, Q2), (Q2, P2)):
            for A1 in (norm(A), norm(mir(A))):
                for B1 in (norm(B), norm(mir(B))):
                    key = (w, A1, B1)
                    if best is None or key < best:
                        best = key
    return {"P": [list(p) for p in best[1]], "Q": [list(p) for p in best[2]], "width": best[0],
            "rule": "unimodular maps, entries |x| <= 10"}


# ---- smallest q found ----
def oddlimit_vec(e):
    n = d = 1
    for p, x in zip(PR, e):
        if x > 0:
            n *= p ** x
        elif x < 0:
            d *= p ** (-x)
    return max(n, d)


def vectors(P, Q):
    V = set()
    for S in (P, Q):
        for u, v in itertools.combinations(S, 2):
            dv = (u[0] - v[0], u[1] - v[1])
            if dv < (0, 0):
                dv = (-dv[0], -dv[1])
            V.add(dv)
    return sorted(V)


A_SET = np.array([e for e in itertools.product(range(-3, 4), range(-2, 3), range(-1, 2), range(-1, 2), range(-1, 2))
                  if any(e) and oddlimit_vec(e) <= 45], dtype=np.int64)
B_BOX = np.array([e for e in itertools.product(range(-24, 25), range(-3, 4), range(-2, 3), range(-1, 2), range(-1, 2))
                  if any(e)], dtype=np.int64)


def best_for_basis(args):
    """for one basis change: the 40 smallest (logq, a index, b index) over the box"""
    V = args
    out = []
    for ai, a in enumerate(A_SET):
        logq = np.zeros(len(B_BOX))
        ok = np.ones(len(B_BOX), dtype=bool)
        for x, y in V:
            E = x * a[None, :] + y * B_BOX
            logq = np.maximum(logq, np.maximum((np.maximum(E, 0) * LP).sum(-1), (np.maximum(-E, 0) * LP).sum(-1)))
            ok &= (E != 0).any(-1)
        # a, b dependent (the plane collapses to a line): ruled out BEFORE ranking, or they crowd out valid maps
        dep = np.ones(len(B_BOX), dtype=bool)
        for i in range(len(PR)):
            for j in range(i + 1, len(PR)):
                dep &= a[i] * B_BOX[:, j] - a[j] * B_BOX[:, i] == 0
        logq[~ok | dep] = np.inf
        idx = np.argsort(logq)[:40]
        out += [(float(logq[i]), ai, int(i)) for i in idx if np.isfinite(logq[i])]
    out.sort()
    return out[:200]


def realize(P, Q, a, b):
    f = lambda p: tuple(int(p[0] * a[i] + p[1] * b[i]) for i in range(len(PR)))
    return [f(p) for p in P], [f(q) for q in Q]


def trivial(P, Q):
    Qs = set(Q)
    for s in (1, -1):
        for q in Q:
            t = tuple(qq - s * pp for qq, pp in zip(q, P[0]))
            if set(tuple(s * x + y for x, y in zip(p, t)) for p in P) == Qs:
                return True
    return False


def same_shape(P, Q, RP, RQ):
    fr = lambda S: [tuple(F(x) for x in p) for p in S]
    A, B = (fr(P), fr(Q)), (fr(RP), fr(RQ))

    def img(X, Y):
        try:
            return image(X, Y) is not None
        except ValueError:
            return image((X[1], X[0]), Y) is not None
    return img(A, B) and img(B, A)


def first_q(P, Q, pool):
    bases = [M for M in unimodular(1)]
    jobs = [vectors(apply(M, P), apply(M, Q)) for M in bases]
    res = pool.map(best_for_basis, jobs)
    cands = sorted((lq, bi, ai, b) for bi, r in enumerate(res) for lq, ai, b in r)
    # lower bound for ANY realization: an interval vector m * u (u primitive) maps to m * (image of u), odd limit >= 3^m
    low = 3 ** max(math.gcd(x, y) for x, y in vectors(P, Q))
    best = None  # smallest q found; among those, the fewest primes (cleaner picture)
    for lq, bi, ai, b in cands:
        if best is not None and lq > math.log(best[0]) + 1e-9:
            break
        M = bases[bi]
        P2, Q2 = apply(M, P), apply(M, Q)
        RP, RQ = realize(P2, Q2, A_SET[ai], B_BOX[b])
        if len(set(RP)) < 9 or len(set(RQ)) < 9 or trivial(RP, RQ):
            continue
        a, bb = A_SET[ai], B_BOX[b]
        if all(int(a[i]) * int(bb[j]) == int(a[j]) * int(bb[i]) for i in range(len(PR)) for j in range(len(PR))):
            continue  # a, b dependent: the plane collapses to a line (another shape)
        # a, b independent: the map is one-to-one on the plane, so the realization is exactly this shape
        # (type_image is not needed and cannot be used: the realization does not span its prime space)
        q = max(oddlimit_vec([u - v for u, v in zip(x, y)]) for S in (RP, RQ) for x in S for y in S)
        cols = [i for i in range(len(PR)) if any(p[i] for p in RP + RQ)]
        rec = {"q": q, "q_low": low, "proven": q == low, "primes": [PR[i] for i in cols],
               "P": [[p[i] for i in cols] for p in RP], "Q": [[p[i] for i in cols] for p in RQ],
               "a": [int(x) for x in A_SET[ai]], "b": [int(x) for x in B_BOX[b]],
               "search": "q = smallest found by a bounded map search (see new5.py); q_low = 3^m lower bound; "
                         "first q proven when they are equal"}
        if best is None or (q, len(cols)) < (best[0], len(best[1]["primes"])):
            best = (q, rec)
    return best and best[1]


def main():
    found = json.load(open(sys.argv[1]))["types"]
    ids = [int(x) for x in sys.argv[2].split(",")]
    out = []
    with Pool(48) as pool:
        for i in ids:
            t = found[i]
            P0 = [tuple(F(x) for x in p) for p in t["P"]]
            Q0 = [tuple(F(x) for x in p) for p in t["Q"]]
            P2, Q2 = integral_form(P0, Q0)
            P = [tuple(int(x) for x in p) for p in P2]
            Q = [tuple(int(x) for x in p) for p in Q2]
            pf = prime_form(P, Q)
            fam = {"family": f"found#{i}", "notes": 9, "interval_classes": ["1"],
                   "members": [{"lattice": pf["P"]}, {"lattice": pf["Q"]}]}
            fs = factor_struct.analyse(fam)
            fs.pop("q", None)
            # search from the prime form (compact, rows horizontal); the integral form can be skewed (found #57)
            fq = first_q([tuple(p) for p in pf["P"]], [tuple(p) for p in pf["Q"]], pool)
            rec = {"found": i, "count": t["count"], "integral": {"P": [list(p) for p in P], "Q": [list(p) for p in Q]},
                   "prime": pf, "factor": fs, "first": fq}
            out.append(rec)
            print(f"found#{i}: width {pf['width']}, factors {fs.get('factors')} flipped {fs.get('flipped_terms')} "
                  f"V {fs.get('V_shape')} {fs.get('V')} U_terms {fs.get('U_terms')} check {fs.get('check')}; "
                  f"q found {fq and fq['q']} (low {fq and fq['q_low']}, proven {fq and fq['proven']}) primes {fq and fq['primes']}", file=sys.stderr, flush=True)
    json.dump(out, sys.stdout, default=str)


if __name__ == "__main__":
    main()
