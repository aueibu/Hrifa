#!/usr/bin/env python3
"""check_types_k7.py (2026-11-25): sanity checks on the k-note universal type classes (typeflats-rs output).

1. each class (in its integral form, type_integral.integral_form) is a homometric pair, not Q = +-P + t;
2. integral images: for every pair of classes (B, A) list whether A = L(B) with L an INTEGER matrix (all witnesses tried);
3. 1-D check: enumerate every k-note homometric family of integer sets with span <= MAXSPAN (= the 3-limit chain of fifths, as
   enum3.py) and assign each to the classes it is an integral image of; a family with no class would contradict completeness.

usage: python check_types_k7.py tables/types/typeflats_k7.json [--maxspan 20]
"""
import argparse, itertools
from collections import Counter, defaultdict
from fractions import Fraction as F

from type_image import affine_basis, solve, tr_canon, load
from type_integral import integral_form


def diffs(S):
    return Counter(tuple(a - b for a, b in zip(p, q)) for p, q in itertools.permutations(S, 2))


def trivial(P, Q):
    return any(tr_canon([tuple(s * x for x in p) for p in P]) == tr_canon(Q) for s in (1, -1))


def witnesses(B, A):
    """every L with A = L(B) up to translation / mirror per set / swap"""
    PB, QB = B
    base, rows = affine_basis(PB)
    M = [list(col) for col in zip(*rows)]
    out = []
    for X, Y in ((A[0], A[1]), (A[1], A[0])):
        for sP in (1, -1):
            Xs = [tuple(sP * x for x in p) for p in X]
            Xset = set(Xs)
            for tgt in itertools.permutations(range(len(Xs)), len(base)):
                T = [[Xs[tgt[j]][r] - Xs[tgt[0]][r] for j in range(1, len(base))] for r in range(len(Xs[0]))]
                L = solve(M, T)
                if L is None:
                    continue
                ap = lambda p: tuple(sum(L[r][c] * p[c] for c in range(len(p))) for r in range(len(L)))
                t = tuple(a - b for a, b in zip(Xs[tgt[0]], ap(PB[base[0]])))
                if {tuple(a + b for a, b in zip(ap(p), t)) for p in PB} != Xset:
                    continue
                imgQ = [ap(q) for q in QB]
                for sQ in (1, -1):
                    Ys = [tuple(sQ * x for x in p) for p in Y]
                    if len(set(imgQ)) == len(Ys) and tr_canon(imgQ) == tr_canon(Ys):
                        out.append(L)
    return out


def integral(L):
    return all(x.denominator == 1 for r in L for x in r)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("types")
    ap.add_argument("--maxspan", type=int, default=20)
    a = ap.parse_args()
    found = load(a.types)
    k = len(found[0][0])
    ints = []
    for i, (P, Q, d) in enumerate(found):
        P2, Q2 = integral_form(P, Q)
        ok = diffs(P2) == diffs(Q2) and not trivial(P2, Q2) and len(set(P2)) == k and len(set(Q2)) == k
        span = max(max(p[0] for p in S) - min(p[0] for p in S) for S in (P2, Q2)) if d == 1 else None
        print(f"found#{i + 1} dim {d}: homometric+nontrivial {ok}" + (f", span {span}" if span is not None else ""))
        ints.append((f"found#{i + 1}", d, (P2, Q2)))

    print("\nintegral images (A = L(B), L integer):")
    img_of = defaultdict(list)
    for (na, da, A), (nb, db, B) in itertools.permutations(ints, 2):
        if db < da:
            continue
        ws = witnesses(B, A)
        if ws:
            good = [L for L in ws if integral(L)]
            img_of[na].append(f"{nb}{'' if good else ' (rational only)'}")
    for na, _, _ in ints:
        print(f"  {na}: " + (", ".join(img_of[na]) if img_of[na] else "image of no other class"))

    print(f"\n1-D families, {k} notes, span <= {a.maxspan}:")
    byspan = defaultdict(list)
    for L in range(1, a.maxspan + 1):
        groups = defaultdict(set)
        for mid in itertools.combinations(range(1, L), k - 2):
            S = (0,) + mid + (L,)
            m = tuple(sorted(L - x for x in S))
            key = tuple(sorted(Counter(abs(x - y) for x, y in itertools.combinations(S, 2)).items()))
            groups[key].add(min(S, m))
        for g in groups.values():
            if len(g) > 1:
                byspan[L].append(sorted(g))
    total = 0
    for L, fams in sorted(byspan.items()):
        for fam in fams:
            total += 1
            P = [(F(x),) for x in fam[0]]
            hits = []
            for Q in fam[1:]:
                Qp = [(F(x),) for x in Q]
                for nb, db, B in ints:
                    if any(integral(W) for W in witnesses(B, (P, Qp))):
                        hits.append(nb)
            hits = sorted(set(hits), key=lambda s: int(s.split("#")[1]))
            print(f"  span {L}: {' ~ '.join(' '.join(map(str, s)) for s in fam)}  <- {', '.join(hits) if hits else 'NO CLASS'}")
    print(f"  {total} families")


if __name__ == "__main__":
    main()
