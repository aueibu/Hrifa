"""Rosenblatt-Seymour factor classification of every family.

Each member P is read as a Laurent polynomial sum x^a y^b over its lattice points.
Homometric P, Q satisfy P(x,y)P(1/x,1/y) = Q(x,y)Q(1/x,1/y), so Q is obtained from P
by flipping (negating) some of P's irreducible factors. We record which factors flip
and whether the kept part U and flipped part V have only non-negative coefficients.

usage: python3 factor.py   (reads tables/families.csv, writes tables/factors.csv)
"""
import json, sys
import pandas as pd
from multiprocessing import Pool
from sympy import symbols, factor_list, Poly

x, y = symbols("x y")


def to_poly(S):
    ma = min(a for a, b in S); mb = min(b for a, b in S)
    return Poly(sum(x ** (a - ma) * y ** (b - mb) for a, b in S), x, y)


def flip(f):
    """f*(x,y) = x^dx y^dy f(1/x, 1/y), normalised to a polynomial."""
    terms = f.terms()
    dx = max(m[0] for m, _ in terms); dy = max(m[1] for m, _ in terms)
    return Poly.from_dict({(dx - m[0], dy - m[1]): c for m, c in terms}, x, y)


def normalise(f):
    """strip monomial content so polynomials compare up to x^i y^j"""
    terms = f.terms()
    mx = min(m[0] for m, _ in terms); my = min(m[1] for m, _ in terms)
    return Poly.from_dict({(m[0] - mx, m[1] - my): c for m, c in terms}, x, y)


def classify(row):
    fam, Ps, Qs = row
    P, Q = to_poly(json.loads(Ps)), to_poly(json.loads(Qs))
    _, fl = factor_list(P.as_expr(), x, y)
    facs = []
    for g, e in fl:
        facs += [Poly(g, x, y)] * e
    kept, flipped = [], []
    Qrem = Q
    for f in facs:
        q, r = Qrem.div(f)
        if r.is_zero:
            kept.append(f); Qrem = q
        else:
            fs = flip(f)
            q, r = Qrem.div(fs)
            assert r.is_zero, f"family {fam}: factor {f} not found in Q either way"
            flipped.append(f); Qrem = q
    assert Qrem.is_ground and abs(Qrem.LC()) == 1
    one = Poly(1, x, y)
    U = one
    for f in kept: U = U * f
    V = one
    for f in flipped: V = V * f
    nonneg = lambda p: all(c >= 0 for c in p.coeffs())
    selfrec = sum(1 for f in facs if normalise(flip(f)) in (normalise(f), normalise(-f)))
    signed = [str(f.as_expr()) for f in facs if not nonneg(f)]
    return {"family": fam, "n_factors": len(facs), "n_flipped": len(flipped),
            "n_selfreciprocal": selfrec, "U_nonneg": nonneg(U), "V_nonneg": nonneg(V),
            "U_terms": len(U.terms()), "V_terms": len(V.terms()),
            "signed_factors": " ; ".join(signed),
            "U": str(U.as_expr()), "V": str(V.as_expr())}


if __name__ == "__main__":
    df = pd.read_csv("tables/families.csv")
    jobs = list(zip(df.family, df.P, df.Q))
    with Pool(int(sys.argv[1]) if len(sys.argv) > 1 else 2) as pool:
        out = pool.map(classify, jobs, chunksize=50)
    pd.DataFrame(out).to_csv("tables/factors.csv", index=False)
    print("wrote tables/factors.csv", len(out))
