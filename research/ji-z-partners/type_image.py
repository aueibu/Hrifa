#!/usr/bin/env python3
"""type_image.py (2026-11-25): is Z-pair pattern A a linear image of pattern B? (exact, rational maps)

A copy of B is L(P_B) + t_P, L(Q_B) + t_Q for a linear L (any rank, may flatten). A Z-pair is the same pair
after translating either set, mirroring either set (P ~ Q => P ~ -Q) or swapping them, so A counts as an image
when L(P_B) + t_P = s_P * X and L(Q_B) + t_Q = s_Q * Y for {X, Y} = {P_A, Q_A}. L is solved from an affine basis
of P_B mapped onto every ordered choice of points of s_P * X, then checked on all points.

usage: python type_image.py types6.json [--zgen tables/shapes/k6_types.jsonl]
"""
import argparse, itertools, json
from fractions import Fraction as F


def solve(M, T):
    """L with L @ M = T (M b x b invertible, T a x b), rationals; None if M singular"""
    b = len(M)
    # invert M by Gauss-Jordan
    A = [list(M[i]) + [F(int(i == j)) for j in range(b)] for i in range(b)]
    for c in range(b):
        p = next((r for r in range(c, b) if A[r][c] != 0), None)
        if p is None:
            return None
        A[c], A[p] = A[p], A[c]
        pv = A[c][c]
        A[c] = [x / pv for x in A[c]]
        for r in range(b):
            if r != c and A[r][c] != 0:
                f = A[r][c]
                A[r] = [x - f * y for x, y in zip(A[r], A[c])]
    Minv = [row[b:] for row in A]
    return [[sum(T[i][k] * Minv[k][j] for k in range(b)) for j in range(b)] for i in range(len(T))]


def affine_basis(P):
    """indices i0, i1.. of P whose differences from P[i0] are linearly independent and span (greedy)"""
    d = len(P[0])
    base = [0]
    rows = []
    for i in range(1, len(P)):
        v = [P[i][c] - P[0][c] for c in range(d)]
        test = rows + [v]
        if rank(test) == len(test):
            rows.append(v)
            base.append(i)
        if len(rows) == d:
            break
    return base, rows


def rank(rows):
    m = [list(r) for r in rows]
    rk, ncol = 0, len(m[0]) if m else 0
    for c in range(ncol):
        p = next((r for r in range(rk, len(m)) if m[r][c] != 0), None)
        if p is None:
            continue
        m[rk], m[p] = m[p], m[rk]
        for r in range(len(m)):
            if r != rk and m[r][c] != 0:
                f = m[r][c] / m[rk][c]
                m[r] = [x - f * y for x, y in zip(m[r], m[rk])]
        rk += 1
    return rk


def tr_canon(S):
    m = min(S)
    return tuple(sorted(tuple(a - b for a, b in zip(p, m)) for p in S))


def image(B, A):
    """a witness (L, roles) if pattern A = (P_A, Q_A) is a linear image of pattern B, else None"""
    PB, QB = B
    base, rows = affine_basis(PB)
    if len(rows) < len(PB[0]):
        raise ValueError("P_B does not span its space")
    M = [list(col) for col in zip(*rows)]  # b x b, columns = basis differences
    for X, Y in ((A[0], A[1]), (A[1], A[0])):
        for sP in (1, -1):
            Xs = [tuple(sP * x for x in p) for p in X]
            Xset = set(Xs)
            for tgt in itertools.permutations(range(len(Xs)), len(base)):
                T = [[Xs[tgt[j]][r] - Xs[tgt[0]][r] for j in range(1, len(base))] for r in range(len(Xs[0]))]
                L = solve(M, T)
                if L is None:
                    continue
                apply = lambda p: tuple(sum(L[r][c] * p[c] for c in range(len(p))) for r in range(len(L)))
                t = tuple(a - b for a, b in zip(Xs[tgt[0]], apply(PB[base[0]])))
                imgP = {tuple(a + b for a, b in zip(apply(p), t)) for p in PB}
                if imgP != Xset:
                    continue
                imgQ = [apply(q) for q in QB]
                for sQ in (1, -1):
                    Ys = [tuple(sQ * x for x in p) for p in Y]
                    if len(set(imgQ)) == len(Ys) and tr_canon(imgQ) == tr_canon(Ys):
                        return {"L": [[str(x) for x in r] for r in L], "swap": X is A[1], "sP": sP, "sQ": sQ}
    return None


def load(path):
    d = json.load(open(path))
    return [([tuple(F(x) for x in p) for p in t["P"]], [tuple(F(x) for x in q) for q in t["Q"]], t["dim"]) for t in d["types"]]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("types")
    ap.add_argument("--zgen")
    a = ap.parse_args()
    found = load(a.types)
    named = [(f"found#{i + 1} (dim {d})", (P, Q)) for i, (P, Q, d) in enumerate(found)]
    if a.zgen:
        for line in open(a.zgen):
            t = json.loads(line)
            named.append((f"zgen type {t['type']}", ([tuple(map(F, p)) for p in t["P"]], [tuple(map(F, q)) for q in t["Q"]])))
    for (na, A), (nb, B) in itertools.product(named, named):
        if na == nb:
            continue
        w = image(B, A)
        if w:
            print(f"{na} IS an image of {nb}: L {w['L']}, swap {w['swap']}, signs {w['sP']},{w['sQ']}")
    print("pairs not listed are not images")


if __name__ == "__main__":
    main()
