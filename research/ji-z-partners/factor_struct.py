#!/usr/bin/env python3
"""factor_struct.py: exact Rosenblatt-Seymour factor structure of Z-families (any number of primes).

Each member is a Laurent polynomial P = sum of x^v over its lattice points v (one variable per odd prime).
Two sets have the same interval content exactly when Q = (unit) * prod f_i or f_i* over the irreducible
factors f_i of P, with some factors reversed (f*(x) = x^deg f(1/x)). So factoring P once gives the
family's true flipped part V (product of the reversed factors) and kept part U (the rest), with no
assumption on their shapes. A factor equal to its own reversal never needs to flip and is kept.

For each family: member 0 is P, member 1 is Q (tried as given and inverted). Reports the irreducible
factors (term counts), which flip, V's shape (plus,minus terms), U's terms, smallest and largest
coefficient and negative mass (sum of |negative coefficients|), and checks that U*V and U*V* give the
two members back (up to shift).

usage: PYTHONPATH=~/pylib python3 factor_struct.py FAMILIES.jsonl [--sample N] [--seed S] [--workers W]
       > table.tsv   (one row per family; a summary goes to stderr)
"""
import argparse, collections, json, random, sys
from fractions import Fraction
from multiprocessing import Pool

from sympy import Poly, factor_list, symbols

XS = None


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


def split(P, Q, facs, xs):
    """assign each factor to kept (divides what is left of Q) or flipped (its reversal does)"""
    kept, flipped, Qrem = [], [], Q
    for f in facs:
        q, r = Qrem.div(f)
        if r.is_zero:
            kept.append(f); Qrem = q; continue
        q, r = Qrem.div(flip(f, xs))
        if not r.is_zero:
            return None
        flipped.append(f); Qrem = q
    if not (Qrem.is_ground and abs(Qrem.LC()) == 1):
        return None
    return kept, flipped


def analyse(f):
    mem = [[tuple(p) for p in m["lattice"]] for m in f["members"]]
    d = len(mem[0][0])
    xs = symbols(f"x0:{d}")
    P = to_poly(mem[0], xs)
    _, fl = factor_list(P.as_expr(), *xs)
    facs = []
    for g, e in fl:
        facs += [Poly(g, *xs)] * e
    res, Q = None, None
    for Qset in (mem[1], [tuple(-c for c in p) for p in mem[1]]):
        Q = to_poly(Qset, xs)
        res = split(P, Q, facs, xs)
        if res:
            break
    if res is None:
        return {"family": f["family"], "k": f["notes"], "q": iol(f), "error": "no split"}
    kept, flipped = res
    one = Poly(1, *xs)
    U, V = one, one
    for g in kept:
        U = U * g
    for g in flipped:
        V = V * g
    if sum(U.coeffs()) < 0:  # sign is free (U V = (-U)(-V)); fix U(1) > 0, so V(1) > 0 as P(1) = k
        U, V = -U, -V
    # check: U*V = P and U*V* = Q up to shift (V* of the product = product of reversals)
    Vs = one
    for g in flipped:
        Vs = Vs * flip(g, xs)
    ok = (norm(U * V, xs) in (norm(P, xs), norm(-P, xs))) and (norm(U * Vs, xs) in (norm(Q, xs), norm(-Q, xs)))
    uc = [c for c in U.coeffs()]
    vc = [c for c in V.coeffs()]
    selfrec = sum(1 for g in facs if norm(flip(g, xs), xs) in (norm(g, xs), norm(-g, xs)))
    return {
        "family": f["family"], "k": f["notes"], "q": iol(f), "dim": d,
        "factors": "+".join(str(len(g.terms())) for g in facs),
        "n_factors": len(facs), "n_flipped": len(flipped), "n_selfrec": selfrec,
        "flipped_terms": "+".join(str(len(g.terms())) for g in flipped),
        "V_shape": f"{sum(1 for c in vc if c > 0)},{sum(1 for c in vc if c < 0)}",
        "V_coeffs": f"{min(vc)}..{max(vc)}",
        "U_terms": len(uc), "U_min": min(uc), "U_max": max(uc), "U_negmass": -sum(c for c in uc if c < 0),
        "check": "ok" if ok else "FAIL",
        "V": str(V.as_expr()) if len(vc) <= 8 else f"({len(vc)} terms)",
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("families")
    ap.add_argument("--sample", type=int, default=0)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--workers", type=int, default=8)
    a = ap.parse_args()
    fams = [json.loads(l) for l in open(a.families) if l.strip()]
    if a.sample and len(fams) > a.sample:
        random.Random(a.seed).shuffle(fams)
        fams = fams[: a.sample]
    with Pool(a.workers) as pool:
        rows = pool.map(analyse, fams, chunksize=4)
    cols = ["family", "k", "q", "dim", "factors", "n_factors", "n_flipped", "n_selfrec", "flipped_terms",
            "V_shape", "V_coeffs", "U_terms", "U_min", "U_max", "U_negmass", "check", "V"]
    print("\t".join(cols))
    for r in rows:
        print("\t".join(str(r.get(c, r.get("error", ""))) for c in cols))
    s = collections.Counter()
    for r in rows:
        if "error" in r:
            s["error"] += 1; continue
        s[f"flipped factors {r['n_flipped']}"] += 1
        s[f"V {r['V_shape']} coeffs {r['V_coeffs']}"] += 1
        s[f"U negmass {r['U_negmass']}"] += 1
        s[f"check {r['check']}"] += 1
    print(f"# {len(rows)} families", file=sys.stderr)
    for kk, v in sorted(s.items()):
        print(f"#   {kk}: {v}", file=sys.stderr)


if __name__ == "__main__":
    main()
