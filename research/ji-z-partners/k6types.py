"""Classify every 6-note JI Z-pair built as (3-note chord T) x (4-term pattern F with one minus).

T = {0, a, b},  F = {0, c, d} - {e}.  P = T*F expands to 9 plus-terms and 3 minus-terms;
each minus-term must cancel a plus-term (an equation between the vectors a..e).
For every possible cancellation pattern we solve the equations generically, giving the
most general ("free") realisation. The partner flips either T or F. Surviving patterns,
deduplicated up to change of lattice basis, are the TYPES. Any 6-note pair of this kind in
any lattice (5-limit, 7-limit, ...) is a linear image of one type.

usage: python3 k6types.py            writes tables/k6_types.json
"""
import itertools, json
from fractions import Fraction
from sympy import Matrix, ilcm


def nullspace_int(rows, nvar):
    M = Matrix(rows) if rows else Matrix.zeros(1, nvar)
    basis = M.nullspace()
    out = []
    for v in basis:
        den = ilcm(*[Fraction(str(t)).denominator for t in v])
        out.append([int(t * den) for t in v])
    return out                                   # list of r vectors of length nvar


def poly(terms):
    d = {}
    for p, c in terms:
        d[p] = d.get(p, 0) + c
    return {p: c for p, c in d.items() if c}


def add(u, v): return tuple(x + y for x, y in zip(u, v))
def neg(u): return tuple(-x for x in u)


def product(T, F):
    return poly([(add(t, f), ct * cf) for t, ct in T for f, cf in F])


def is_set(P, k=6):
    return len(P) == k and all(c == 1 for c in P.values())


# ---------- canonical form up to translation, negation and change of lattice basis ----------
from math import gcd


def gl_canon(S):
    """Canonical form of a point set (any embedding) up to translation, negation and any change of
    basis of the lattice spanned by its differences. Works for rank 1-3."""
    import numpy as np
    S = [tuple(p) for p in S]
    o = S[0]
    D = np.array([[x - y for x, y in zip(p, o)] for p in S], dtype=np.int64)
    r = int(np.linalg.matrix_rank(D.astype(float)))
    # project onto r coordinates that stay independent (injective on the span)
    for cols in itertools.combinations(range(D.shape[1]), r):
        if np.linalg.matrix_rank(D[:, cols].astype(float)) == r:
            D = D[:, cols]; break
    diffs = sorted({tuple(p - q) for p in D for q in D if tuple(p) != tuple(q)})
    dets = [round(np.linalg.det(np.array(t, dtype=float))) for t in itertools.combinations(diffs, r)]
    g = 0
    for x in dets: g = gcd(g, abs(int(x)))
    best = None
    for B in itertools.permutations(diffs, r):
        Bm = np.array(B, dtype=float).T
        det = round(np.linalg.det(Bm))
        if abs(det) != g:
            continue
        C = np.linalg.solve(Bm, D.T.astype(float)).T
        Ci = np.rint(C)
        if np.abs(C - Ci).max() > 1e-6:
            continue
        pts = [tuple(int(v) for v in row) for row in Ci]
        for sg in (1, -1):
            Q = [tuple(sg * v for v in p) for p in pts]
            m = min(Q)
            key = tuple(sorted(tuple(v - mm for v, mm in zip(p, m)) for p in Q))
            if best is None or key < best:
                best = key
    return best


def pair_key(P, Q):
    return tuple(sorted([gl_canon(list(P)), gl_canon(list(Q))]))


def main():
    names = "abcde"
    T_idx = [None, 0, 1]            # t0 = 0, t1 = a, t2 = b
    F_idx = [None, 2, 3]            # f0 = 0, f1 = c, f2 = d ; e = 4
    pos = [(i, j) for i in range(3) for j in range(3)]
    types = {}
    tried = 0
    for match in itertools.permutations(pos, 3):
        tried += 1
        rows = []
        for i, (p, q) in enumerate(match):
            row = [0] * 5
            row[4] += 1                               # + e
            if T_idx[i] is not None: row[T_idx[i]] += 1
            if T_idx[p] is not None: row[T_idx[p]] -= 1
            if F_idx[q] is not None: row[F_idx[q]] -= 1
            rows.append(row)
        N = nullspace_int(rows, 5)
        r = len(N)
        if r == 0:
            continue
        vec = [tuple(N[s][v] for s in range(r)) for v in range(5)]   # generic image of a..e in Z^r
        z = (0,) * r
        a, b, c, d, e = vec
        T = [(z, 1), (a, 1), (b, 1)]
        F = [(z, 1), (c, 1), (d, 1), (e, -1)]
        P = product(T, F)
        if not is_set(P):
            continue
        for which, Q in (("T", product([(z, 1), (neg(a), 1), (neg(b), 1)], F)),
                         ("F", product(T, [(z, 1), (neg(c), 1), (neg(d), 1), (neg(e), -1)]))):
            if not is_set(Q):
                continue
            key = pair_key(P.keys(), Q.keys())
            if key[0] == key[1]:
                continue                                # partner is a symmetry image in the free lattice
            # is Q a translate/negation of P in the free lattice? (then trivial)
            def tn(S):
                S = list(S); m = min(S); A = tuple(sorted(tuple(x - y for x, y in zip(p, m)) for p in S))
                Sn = [neg(p) for p in S]; m = min(Sn); B = tuple(sorted(tuple(x - y for x, y in zip(p, m)) for p in Sn))
                return min(A, B)
            if tn(P.keys()) == tn(Q.keys()):
                continue
            if key not in types:
                types[key] = {"rank": r, "flip": which, "P": sorted(P.keys()), "Q": sorted(Q.keys()),
                              "T": [a, b], "F_plus": [c, d], "F_minus": e}
    print(f"cancellation patterns tried: {tried}; distinct types: {len(types)}")
    out = []
    for i, (key, t) in enumerate(sorted(types.items(), key=lambda kv: (kv[1]["rank"], kv[0]))):
        t["type"] = i + 1
        t["key"] = [list(map(list, k)) for k in key]
        out.append(t)
        print(f"type {i+1}: rank {t['rank']}, flip {t['flip']}, P={key[0]}  Q={key[1]}")
    json.dump(out, open("tables/k6_types.json", "w"), default=list, indent=1)


if __name__ == "__main__":
    main()
