#!/usr/bin/env python3
"""overlap.py: what the leftover (non-chord-sum) families look like as "products with overlaps".

For each family that is not a chord sum (THEORY_SMALL_FACTOR.md 6.3), take the valid split P = V·U,
Q = V*·U with the smallest negative mass (every grouping of the irreducible factors tried, as in
chordsum_fs.py). One factor T is plain, the other, S, is signed (G1: T is the smaller, a chord;
G2: S is the smaller; which of the two is flipped is a free choice):
S = S+ − S− with S+ and S− plain sets. Then
    P = T·S+ − T·S−    (stack: T placed on every note of S+, as a multiset; minus: T on every note of S−)
Reports, per family: group, |T|, |S+|, |S−|, the highest multiplicity in the stack T·S+, how many notes
of the stack land twice, and where the subtracted notes T·S− land: on a doubled note (2 − 1 = 1: two
copies merge into one) or on a single note (1 − 1 = 0: the note is removed). Same for Q (T·S+* − T·S−*
when S is the flipped factor, T*·S+ − T*·S− when T is).

usage: PYTHONPATH=~/pylib python3 overlap.py LABEL FAMILIES.jsonl [--workers W] > out.tsv  (summary to stderr)
"""
import argparse, collections, itertools, json, sys
from multiprocessing import Pool

from sympy import Poly, factor_list, symbols

from chordsum_fs import flip, iol, norm, to_poly


def mults(A, B):
    """multiset product of two plain sets given as lists of exponent tuples"""
    out = collections.Counter()
    for a in A:
        for b in B:
            out[tuple(x + y for x, y in zip(a, b))] += 1
    return out


def side(T, Sp, Sm):
    M = mults(T, Sp)
    R = mults(T, Sm)
    merged = sum(1 for p, r in R.items() for _ in range(r) if M.get(p, 0) >= 2)
    removed = sum(1 for p, r in R.items() if M.get(p, 0) == 1)
    outside = sum(1 for p in R if M.get(p, 0) == 0)
    ok = all(M.get(p, 0) - R.get(p, 0) in (0, 1) for p in set(M) | set(R))
    return max(M.values()), sum(1 for v in M.values() if v >= 2), merged, removed, outside, max(R.values()), ok


def analyse(args):
    label, f = args
    mem = [[tuple(p) for p in m["lattice"]] for m in f["members"]]
    d = len(mem[0][0])
    xs = symbols(f"x0:{d}")
    P = to_poly(mem[0], xs)
    _, fl = factor_list(P.as_expr(), *xs)
    facs = []
    for g, e in fl:
        facs += [Poly(g, *xs)] * e
    n = len(facs)
    one = Poly(1, *xs)
    best, chord_sum = None, False
    for Qset in (mem[1], [tuple(-c for c in p) for p in mem[1]]):
        Q = to_poly(Qset, xs)
        nQ = (norm(Q, xs), norm(-Q, xs))
        for r in range(1, n + 1):
            for S in itertools.combinations(range(n), r):
                V, Vs, U = one, one, one
                for i in range(n):
                    if i in S:
                        V, Vs = V * facs[i], Vs * flip(facs[i], xs)
                    else:
                        U = U * facs[i]
                if norm(U * Vs, xs) not in nQ:
                    continue
                if sum(U.coeffs()) < 0:
                    U, V, Vs = -U, -V, -Vs
                negs = sum(-c for c in U.coeffs() + V.coeffs() if c < 0)
                if negs == 0:
                    chord_sum = True
                if best is None or negs < best[0]:
                    best = (negs, U, V, Vs)
    row = {"list": label, "family": f["family"], "k": f["notes"], "q": iol(f), "group": ""}
    if chord_sum or best is None:
        return None
    _, U, V, Vs = best
    terms = lambda F: [(m, c) for m, c in F.terms()]
    vneg = any(c < 0 for _, c in terms(V))
    uneg = any(c < 0 for _, c in terms(U))
    if vneg and uneg:
        row["group"] = "G3"
        return row
    # which factor is flipped is a free choice (flipping the other one gives the mirror of Q), so the
    # groups go by size: G1 = small plain chord T with a larger signed S, G2 = small signed S, larger T
    if not vneg:   # T = V (plain, flipped), S = U (signed, kept)
        T, Ts, S, Ss = V, Vs, U, U
    else:          # T = U (plain, kept), S = V (signed, flipped)
        T, Ts, S, Ss = U, U, V, Vs
    row["group"] = "G1" if len(T.terms()) <= sum(1 for _, c in S.terms() if c > 0) else "G2"
    if any(c != 1 for _, c in terms(T)) or any(abs(c) != 1 for _, c in terms(S)):
        row["group"] += "x"   # plain factor not 0/1, or signed factor with |coefficient| > 1
        row["coeffs"] = f"T {sorted(set(c for _, c in terms(T)))} S {sorted(set(c for _, c in terms(S)))}"
        return row
    pts = lambda F, s: [m for m, c in terms(F) if c == s]
    row.update(T=len(terms(T)), Sp=len(pts(S, 1)), Sm=len(pts(S, -1)))
    row["P"] = side(pts(T, 1), pts(S, 1), pts(S, -1))
    row["Q"] = side(pts(Ts, 1), pts(Ss, 1), pts(Ss, -1))
    return row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("label")
    ap.add_argument("families")
    ap.add_argument("--workers", type=int, default=16)
    a = ap.parse_args()
    fams = [json.loads(l) for l in open(a.families) if l.strip()]
    with Pool(a.workers) as pool:
        rows = [r for r in pool.map(analyse, [(a.label, f) for f in fams], chunksize=8) if r]
    cols = ["list", "family", "k", "q", "group", "T", "Sp", "Sm", "P", "Q", "coeffs"]
    print("\t".join(cols))
    for r in rows:
        print("\t".join(str(r.get(c, "")) for c in cols))
    print(f"# {a.label}: {len(rows)} leftover families", file=sys.stderr)
    g = collections.Counter(r["group"] for r in rows)
    print("#   groups: " + ", ".join(f"{k} {v}" for k, v in sorted(g.items())), file=sys.stderr)
    for grp in ("G1", "G2"):
        rs = [r for r in rows if r["group"] == grp]
        if not rs:
            continue
        sh = collections.Counter((r["T"], r["Sp"], r["Sm"]) for r in rs)
        print(f"#   {grp} (|T|, |S+|, |S-|): " + ", ".join(f"{k} {v}" for k, v in sh.most_common(8)), file=sys.stderr)
        for s in ("P", "Q"):
            st = collections.Counter(r[s][:6] for r in rs)
            bad = sum(1 for r in rs if not r[s][6])
            print(f"#   {grp} {s} (max mult in stack, doubled notes, merged, removed, subtracted outside stack, "
                  f"max mult subtracted): " + ", ".join(f"{k} {v}" for k, v in st.most_common(8))
                  + f"; identity fails {bad}", file=sys.stderr)


if __name__ == "__main__":
    main()
