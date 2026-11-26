#!/usr/bin/env python3
"""chordsum_fs.py: exact chord-sum test from the irreducible factors (sympy; any number of primes).

A family is a "chord sum" when its two members are P = A·U and Q = A⁻¹·U (up to transposition and
mirror), with A and U plain sets (all coefficients 1) and no product landing twice (THEORY_SMALL_FACTOR.md
section 6). Notation: A⁻¹ = {1/r : r in A} (for A = a:b:c, the mirror 1/(a:b:c)); A·U = product set.

Method: factor P (member 0) into irreducibles f_1..f_n (with multiplicity). For member 1 as given and
mirrored, try EVERY subset S of the factors: V = prod_{i in S} f_i, U = the rest; S is a valid split
when U·V* = Q up to shift and sign. The family is a chord sum when some valid split has V and U both
plain (after fixing the sign so U(1) > 0). Unlike factor_struct.py (one greedy split), every grouping
is tried, so families with three or more factors are judged correctly.

Output (stdout, TSV, one row per family): list label, family, k, q, n_factors, factor term counts,
chord_sum (1/0), A terms, U terms, A name (a:b:c, smallest form over roots and mirror; chords <= 6
notes), and for non-chord sums the best valid split (V plus/minus terms, U min coefficient).
Summary to stderr.

usage: PYTHONPATH=~/pylib python3 chordsum_fs.py LABEL FAMILIES.jsonl [--workers W] > out.tsv
"""
import argparse, collections, itertools, json, sys
from fractions import Fraction
from functools import reduce
from math import gcd
from multiprocessing import Pool

from sympy import Poly, factor_list, symbols


def odd(n):
    n = abs(n)
    while n and n % 2 == 0:
        n //= 2
    return n


def iol(f):
    return max(max(odd(Fraction(c).numerator), odd(Fraction(c).denominator)) for c in f["interval_classes"])


def shift0(S):
    d = len(S[0])
    m = [min(p[i] for p in S) for i in range(d)]
    return [tuple(p[i] - m[i] for i in range(d)) for p in S]


def to_poly(S, xs):
    return Poly.from_dict({p: 1 for p in shift0(S)}, *xs)


def flip(f, xs):
    t = f.terms()
    d = len(xs)
    top = [max(m[i] for m, _ in t) for i in range(d)]
    return Poly.from_dict({tuple(top[i] - m[i] for i in range(d)): c for m, c in t}, *xs)


def norm(f, xs):
    t = f.terms()
    d = len(xs)
    lo = [min(m[i] for m, _ in t) for i in range(d)]
    return Poly.from_dict({tuple(m[i] - lo[i] for i in range(d)): c for m, c in t}, *xs)


def red(r):
    while r >= 2:
        r /= 2
    while r < 1:
        r *= 2
    return r


def chord_name(monos, primes):
    """smallest a:b:c (largest number minimal) over roots and mirror, notes within one octave of the root"""
    R = []
    for m in monos:
        r = Fraction(1)
        for p, e in zip(primes, m):
            r *= Fraction(p) ** e
        R.append(r)
    best = None
    for S in (R, [1 / r for r in R]):
        for root in S:
            rel = sorted(red(x / root) for x in S)
            L = reduce(lambda a, b: a * b // gcd(a, b), [x.denominator for x in rel], 1)
            ints = [int(x * L) for x in rel]
            g = reduce(gcd, ints)
            ints = [i // g for i in ints]
            key = (max(ints), ints)
            if best is None or key < best:
                best = key
    return ":".join(map(str, best[1]))


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
    row = {"list": label, "family": f["family"], "k": f["notes"], "q": iol(f), "n_factors": n,
           "factors": "+".join(str(len(g.terms())) for g in facs), "chord_sum": 0,
           "A_terms": "", "U_terms": "", "A": "", "best_other": ""}
    best_cs, best_other = None, None
    seen = set()
    for Qset in (mem[1], [tuple(-c for c in p) for p in mem[1]]):
        Q = to_poly(Qset, xs)
        nQ = (norm(Q, xs), norm(-Q, xs))
        for r in range(1, n + 1):
            for S in itertools.combinations(range(n), r):
                if S in seen:
                    continue
                V, Vs, U = one, one, one
                for i in range(n):
                    if i in S:
                        V = V * facs[i]
                        Vs = Vs * flip(facs[i], xs)
                    else:
                        U = U * facs[i]
                if norm(U * Vs, xs) not in nQ:
                    continue
                seen.add(S)
                if sum(U.coeffs()) < 0:
                    U, V = -U, -V
                uc, vc = U.coeffs(), V.coeffs()
                if min(uc) == max(uc) == 1 and min(vc) == max(vc) == 1:
                    A, B = (V, U) if len(vc) <= len(uc) else (U, V)
                    cand = (len(A.terms()), len(B.terms()), A)
                    if best_cs is None or cand[:2] < best_cs[:2]:
                        best_cs = cand
                else:
                    desc = (sum(-c for c in uc if c < 0) + sum(-c for c in vc if c < 0),
                            f"V {sum(1 for c in vc if c > 0)},{sum(1 for c in vc if c < 0)} "
                            f"U {len(uc)} terms min {min(uc)} | V min {min(vc)}")
                    if best_other is None or desc < best_other:
                        best_other = desc
    if best_cs:
        a, b, A = best_cs
        row.update(chord_sum=1, A_terms=a, U_terms=b,
                   A=chord_name([m for m, _ in A.terms()], f["primes"]) if a <= 6 else "")
    elif best_other:
        row["best_other"] = best_other[1]
    else:
        row["best_other"] = "no split"
    return row


COLS = ["list", "family", "k", "q", "n_factors", "factors", "chord_sum", "A_terms", "U_terms", "A", "best_other"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("label")
    ap.add_argument("families")
    ap.add_argument("--workers", type=int, default=16)
    a = ap.parse_args()
    fams = [json.loads(l) for l in open(a.families) if l.strip()]
    with Pool(a.workers) as pool:
        rows = pool.map(analyse, [(a.label, f) for f in fams], chunksize=8)
    print("\t".join(COLS))
    for r in rows:
        print("\t".join(str(r[c]) for c in COLS))
    cs = sum(r["chord_sum"] for r in rows)
    print(f"# {a.label}: {len(rows)} families, chord sums {cs} ({cs / max(1, len(rows)):.2%})", file=sys.stderr)
    byk = collections.defaultdict(lambda: [0, 0])
    for r in rows:
        byk[r["k"]][0] += r["chord_sum"]
        byk[r["k"]][1] += 1
    print("#   by notes (chord sums / all): " + ", ".join(f"{k}: {c}/{t}" for k, (c, t) in sorted(byk.items())),
          file=sys.stderr)
    shp = collections.Counter((r["A_terms"], r["U_terms"]) for r in rows if r["chord_sum"])
    print("#   (A, U) sizes: " + ", ".join(f"{a}x{b}: {c}" for (a, b), c in sorted(shp.items())), file=sys.stderr)
    oth = collections.Counter(r["best_other"] for r in rows if not r["chord_sum"])
    for k, c in oth.most_common(12):
        print(f"#   not chord sum: {c}  {k}", file=sys.stderr)


if __name__ == "__main__":
    main()
