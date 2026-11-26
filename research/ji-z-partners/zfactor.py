#!/usr/bin/env python3
"""zfactor.py: every Z-partner of a JI set, by polynomial factorization (Rosenblatt & Seymour 1982).

Theorem (Rosenblatt & Seymour, "The Structure of Homometric Sets", SIAM J. Alg. Disc. Meth. 3 (1982),
Thms 2.3, 2.4 and Section 3): write a set of lattice points as a polynomial A(x) = sum of x^v. Two sets
have the same interval content (multiset of differences) exactly when their polynomials are products of
the same prime factors, with some factors replaced by their reversal f(x^-1), up to a monomial and a sign.
So all Z-partners of a set, anywhere in the infinite lattice, are found by factoring its polynomial once
and reversing every choice of factors; the results whose coefficients are all 0 or 1 are the partners.
Factors equal to their own reversal (semi-symmetric) never need reversing. This holds in Z^n (our prime
lattice, octave-equivalent pitch classes), not in cyclic groups Z_n (rhythm rings, EDOs).

Needs sympy (python3 -m pip install --user sympy).

Usage:
  python3 zfactor.py ratios "1 6/5 100/81 81/64 45/32 64/45 16/9 50/27 15/8 160/81"
  python3 zfactor.py lattice "[[0],[1],[2],[5],[7],[9],[12]]"
  python3 zfactor.py check path/to/families.jsonl     # every member must recover every other member
"""
import itertools, json, sys, time
from fractions import Fraction

import sympy as sp

ODD_PRIMES = [3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97]


# ----------------------------------------------------------------------------- ratios <-> lattice points
def ratio_vec(text):
    f = Fraction(text)
    n, d = f.numerator, f.denominator
    v = {}
    for p in ODD_PRIMES:
        while n % p == 0: n //= p; v[p] = v.get(p, 0) + 1
        while d % p == 0: d //= p; v[p] = v.get(p, 0) - 1
    while n % 2 == 0: n //= 2
    while d % 2 == 0: d //= 2
    if n != 1 or d != 1:
        raise ValueError(f"{text}: prime above {ODD_PRIMES[-1]}")
    return v


def ratios_to_points(texts):
    vecs = [ratio_vec(t) for t in texts]
    primes = sorted({p for v in vecs for p in v}) or [3]
    return primes, [tuple(v.get(p, 0) for p in primes) for v in vecs]


def point_ratio(pt, primes):
    x = Fraction(1)
    for e, p in zip(pt, primes):
        x *= Fraction(p) ** e
    while x >= 2: x /= 2
    while x < 1: x *= 2
    return x


# ----------------------------------------------------------------------------- set helpers
def norm(S):
    m = tuple(min(c) for c in zip(*S))
    return tuple(sorted(tuple(a - b for a, b in zip(p, m)) for p in S))


def canon(S):
    """up to transposition and inversion (the trivial relations)"""
    return min(norm(S), norm([tuple(-a for a in p) for p in S]))


def differences(S):
    out = []
    for i, a in enumerate(S):
        for b in S[i + 1:]:
            d = tuple(x - y for x, y in zip(a, b))
            out.append(max(d, tuple(-x for x in d)))
    return sorted(out)


# ----------------------------------------------------------------------------- polynomials
def to_poly(S, X):
    m = [min(c) for c in zip(*S)]
    return sp.Add(*[sp.Mul(*[x ** (a - b) for x, a, b in zip(X, p, m)]) for p in S])


def reverse(f, X):
    """f(x^-1) times the monomial that makes it a polynomial again"""
    P = sp.Poly(f, *X)
    deg = [P.degree(x) for x in X]
    return sp.Add(*[c * sp.Mul(*[x ** (d - e) for x, d, e in zip(X, deg, mon)]) for mon, c in P.terms()])


def poly_set(expr, X):
    """the set a polynomial stands for, if all its coefficients are 1 (or all -1); else None"""
    P = sp.Poly(sp.expand(expr), *X)
    terms = P.terms()
    if not terms:
        return None
    coeffs = {c for _, c in terms}
    if coeffs not in ({1}, {-1}):
        return None
    return [tuple(int(e) for e in mon) for mon, _ in terms]


def partners(S):
    """all sets with the same interval content as S, other than S's transpositions and inversions.
    Returns (partners as point lists, factor summary)."""
    S = [tuple(p) for p in S]
    n = len(S[0])
    X = sp.symbols(f"x0:{n}")
    A = to_poly(S, X)
    content, facs = sp.factor_list(A, *X)
    groups = []   # (factor, its reversal, multiplicity, reversible)
    for f, mult in facs:
        r = reverse(f, X)
        sym = sp.expand(r - f) == 0 or sp.expand(r + f) == 0
        groups.append((f, r, mult, not sym))
    options = [range(m + 1) if rev else [0] for f, r, m, rev in groups]
    own, seen, out = canon(S), set(), []
    for choice in itertools.product(*options):
        if not any(choice):
            continue
        expr = content
        for (f, r, m, rev), k in zip(groups, choice):
            expr = expr * f ** (m - k) * r ** k
        T = poly_set(expr, X)
        if T is None:
            continue
        c = canon(T)
        if c == own or c in seen:
            continue
        if differences(T) != differences(S):
            raise AssertionError(f"theorem check failed: {T} does not share the interval content of {S}")
        seen.add(c)
        out.append(T)
    summary = {"factors": len(facs), "with_multiplicity": sum(m for _, m in facs),
               "reversible": sum(m for f, r, m, rev in groups if rev),
               "combinations": int(sp.prod([len(o) for o in options])),
               "degrees": [sp.Poly(f, *X).total_degree() for f, _ in facs]}
    return out, summary


# ----------------------------------------------------------------------------- commands
def show(S, primes=None):
    if primes:
        rs = sorted(point_ratio(p, primes) for p in S)
        return " ".join(str(r) for r in rs)
    return str(sorted(S))


def align(T, S):
    """T moved (transposed, and mirrored if that helps) to share as many notes with S as possible"""
    Sset = set(S)
    best, best_n = None, -1
    for O in (T, [tuple(-a for a in p) for p in T]):
        for s in S:
            for p in O:
                sh = tuple(a - b for a, b in zip(s, p))
                moved = [tuple(a + b for a, b in zip(q, sh)) for q in O]
                n = len(Sset.intersection(moved))
                if n > best_n:
                    best, best_n = moved, n
    return best, best_n


def cmd_ratios(text):
    primes, S = ratios_to_points(text.split())
    t = time.time()
    found, summ = partners(S)
    print(f"set ({len(S)} notes, primes {primes}): {show(S, primes)}")
    print(f"factors: {summ}  ({time.time() - t:.2f}s)")
    if not found:
        print("no Z-partner anywhere in the lattice")
    for T in found:
        moved, n = align(T, S)
        common = " ".join(str(r) for r in sorted(point_ratio(p, primes) for p in set(moved) & set(S)))
        print(f"partner: {show(moved, primes)}\n   shares {n} notes: {common}")


def cmd_lattice(text):
    S = [tuple(p) for p in json.loads(text)]
    t = time.time()
    found, summ = partners(S)
    print(f"set: {sorted(S)}\nfactors: {summ}  ({time.time() - t:.2f}s)")
    for T in found:
        print(f"partner: {sorted(norm(T))}")
    if not found:
        print("no Z-partner anywhere in the lattice")


def cmd_check(path):
    n_fam = n_ok = n_extra = 0
    t0 = time.time()
    worst = 0.0
    for line in open(path):
        rec = json.loads(line)
        members = [[tuple(p) for p in m["lattice"]] for m in rec["members"]]
        n_fam += 1
        ok = True
        for i, M in enumerate(members):
            t = time.time()
            found, _ = partners(M)
            worst = max(worst, time.time() - t)
            got = {canon(T) for T in found}
            want = {canon(O) for j, O in enumerate(members) if j != i}
            if not want <= got:
                ok = False
                print(f"MISSING family {rec['family']} member {i}: expected {len(want)}, got {len(got & want)}")
            n_extra += len(got - want)
        n_ok += ok
    print(f"{n_ok}/{n_fam} families: every member recovered every other member by factoring; "
          f"{n_extra} further partners found outside the family (they may lie outside the gamut); "
          f"{time.time() - t0:.0f}s, slowest set {worst:.2f}s")


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("ratios", "lattice", "check"):
        print(__doc__)
        sys.exit(2)
    {"ratios": cmd_ratios, "lattice": cmd_lattice, "check": cmd_check}[sys.argv[1]](sys.argv[2])
