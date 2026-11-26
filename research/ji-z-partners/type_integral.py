#!/usr/bin/env python3
"""type_integral.py (2026-11-25): integral form of each universal type flat, and unimodular matches with zgen types.

A type flat from typeflats(-rs) is given by its generic pair: every note is v_i . x for x in R^d (v_i rational, P_0 = Q_0 = 0).
Its integer points are the lattice Lam = {x : v_i . x in Z for all i}, the dual of R = Z-span of the v_i. With Bm a Z-basis of R
(rows), Lam = Bm^-1 Z^d, and the integral pattern is v_i . Bm^-1 (integer coordinates; every Z-pair of this type in any Z^r is an
integral linear image of it). A found class and a zgen type are the same shape over Z when type_image finds maps both ways that are
integer matrices with det +-1.

usage: python type_integral.py types7.json --zgen tables/shapes/k7_types.jsonl
"""
import argparse, json
from fractions import Fraction as F
from math import lcm

from type_image import image, load


def hnf_rows(rows):
    """Z-basis (rows) of the Z-span of integer rows, by integer row reduction"""
    m = [list(r) for r in rows if any(r)]
    basis = []
    ncol = len(rows[0])
    for c in range(ncol):
        while True:
            nz = [r for r in m if r[c] != 0]
            if len(nz) <= 1:
                break
            piv = min(nz, key=lambda r: abs(r[c]))
            for r in m:
                if r is not piv and r[c] != 0:
                    q = r[c] // piv[c]
                    for j in range(ncol):
                        r[j] -= q * piv[j]
            m = [r for r in m if any(r)]
        nz = [r for r in m if r[c] != 0]
        if nz:
            basis.append(nz[0])
            m = [r for r in m if r is not nz[0]]
    return basis


def inverse(M):
    b = len(M)
    A = [list(M[i]) + [F(int(i == j)) for j in range(b)] for i in range(b)]
    for c in range(b):
        p = next(r for r in range(c, b) if A[r][c] != 0)
        A[c], A[p] = A[p], A[c]
        pv = A[c][c]
        A[c] = [x / pv for x in A[c]]
        for r in range(b):
            if r != c and A[r][c] != 0:
                f = A[r][c]
                A[r] = [x - f * y for x, y in zip(A[r], A[c])]
    return [row[b:] for row in A]


def det(M):
    M = [list(r) for r in M]
    n, d = len(M), F(1)
    for c in range(n):
        p = next((r for r in range(c, n) if M[r][c] != 0), None)
        if p is None:
            return F(0)
        if p != c:
            M[c], M[p] = M[p], M[c]
            d = -d
        d *= M[c][c]
        for r in range(c + 1, n):
            f = M[r][c] / M[c][c]
            M[r] = [x - f * y for x, y in zip(M[r], M[c])]
    return d


def integral_form(P, Q):
    pts = list(P) + list(Q)
    d = len(pts[0])
    D = lcm(*[x.denominator for p in pts for x in p])
    B = hnf_rows([[int(x * D) for x in p] for p in pts])
    if len(B) != d:
        raise ValueError("notes do not span the flat")
    Binv = inverse([[F(x, D) for x in r] for r in B])
    f = lambda p: tuple(sum(p[k] * Binv[k][j] for k in range(d)) for j in range(d))
    P2, Q2 = [f(p) for p in P], [f(q) for q in Q]
    assert all(x.denominator == 1 for p in P2 + Q2 for x in p)
    return P2, Q2


def unimodular(w):
    L = [[F(x) for x in r] for r in w["L"]]
    if len(L) != len(L[0]) or any(x.denominator != 1 for r in L for x in r):
        return False
    return abs(det(L)) == 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("types")
    ap.add_argument("--zgen", required=True)
    a = ap.parse_args()
    found = load(a.types)
    zg = []
    for line in open(a.zgen):
        t = json.loads(line)
        zg.append((t["type"], ([tuple(map(F, p)) for p in t["P"]], [tuple(map(F, q)) for q in t["Q"]])))
    for i, (P, Q, d) in enumerate(found):
        P2, Q2 = integral_form(P, Q)
        fmt = lambda S: " ".join("(" + ",".join(str(x) for x in p) + ")" for p in S)
        print(f"found#{i + 1} dim {d}: integral P {fmt(P2)}  Q {fmt(Q2)}")
        hits = []
        for name, Z in zg:
            if len(Z[0][0]) != d:
                continue
            w1, w2 = image(Z, (P2, Q2)), image((P2, Q2), Z)
            if w1 and w2:
                hits.append(f"zgen type {name} (maps {w1['L']} / {w2['L']}, unimodular {unimodular(w1)}/{unimodular(w2)})")
        sub = [name for name, Z in zg if len(Z[0][0]) > d and image(Z, (P2, Q2))]
        print("  same-dim matches: " + ("; ".join(hits) if hits else "NONE"))
        print("  image of higher-dim zgen types: " + (", ".join(str(s) for s in sub) if sub else "none"))


if __name__ == "__main__":
    main()
