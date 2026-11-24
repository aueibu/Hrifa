#!/usr/bin/env python3
"""residue.py: exact factor structure of the residue families (THEORY_SMALL_FACTOR.md 6.6).

Input: a jsonl with members as ratio strings (dump_ids.py output). For each family: factor P (member 0)
into irreducibles over the integers, list every valid split (factors kept / flipped giving member 1 or its
mirror), and print each factor as ratio:coefficient terms (relative to its lowest point), its term count,
coefficient range, weight F(1), and whether it is its own reversal (self-reciprocal).

usage: PYTHONPATH=<sympy> python residue.py RESIDUE.jsonl --primes 3 5
"""
import argparse, itertools, json
from fractions import Fraction

from sympy import Poly, factor_list, symbols


def vec(r, primes):
    r = Fraction(r)
    n, d = r.numerator, r.denominator
    v = []
    for p in primes:
        e = 0
        while n % p == 0:
            n //= p; e += 1
        while d % p == 0:
            d //= p; e -= 1
        v.append(e)
    return tuple(v)


def ratio(v, primes):
    r = Fraction(1)
    for p, e in zip(primes, v):
        r *= Fraction(p) ** e
    while r >= 2:
        r /= 2
    while r < 1:
        r *= 2
    return r


def poly(S, xs):
    d = len(xs)
    m = [min(p[i] for p in S) for i in range(d)]
    return Poly.from_dict({tuple(p[i] - m[i] for i in range(d)): 1 for p in S}, *xs)


def flip(f, xs):
    t = f.terms()
    top = [max(m[i] for m, _ in t) for i in range(len(xs))]
    return Poly.from_dict({tuple(top[i] - m[i] for i in range(len(xs))): c for m, c in t}, *xs)


def norm(f, xs):
    t = f.terms()
    lo = [min(m[i] for m, _ in t) for i in range(len(xs))]
    return Poly.from_dict({tuple(m[i] - lo[i] for i in range(len(xs))): c for m, c in t}, *xs)


def show(f, primes):
    t = sorted(f.terms(), key=lambda mc: ratio(mc[0], primes))
    lo = [min(m[i] for m, _ in f.terms()) for i in range(len(primes))]
    parts = []
    for m, c in t:
        r = ratio(tuple(m[i] - lo[i] for i in range(len(primes))), primes)
        c = int(c)
        parts.append(f"{r}" if c == 1 else f"{c:+d}·{r}")
    return "{" + ", ".join(parts) + "}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("residue")
    ap.add_argument("--primes", type=int, nargs="+", default=[3, 5])
    a = ap.parse_args()
    xs = symbols(f"x0:{len(a.primes)}")
    for line in open(a.residue):
        f = json.loads(line)
        M = [[vec(r, a.primes) for r in m] for m in f["members"]]
        P = poly(M[0], xs)
        _, fl = factor_list(P.as_expr(), *xs)
        facs = []
        for g, e in fl:
            facs += [Poly(g, *xs)] * e
        print(f"\n== {f['k']} notes, q {f.get('q', '?')}, family {f.get('family', '-')} ({f.get('description', '').strip()}); "
              f"members: {', '.join(f['members'][0])}  |  {', '.join(f['members'][1])}")
        for i, g in enumerate(facs):
            cs = [int(c) for _, c in g.terms()]
            selfrec = norm(flip(g, xs), xs) in (norm(g, xs), norm(-g, xs))
            pl, mi, tw = sum(c > 0 for c in cs), sum(c < 0 for c in cs), sum(abs(c) == 2 for c in cs)
            print(f"   f{i}: {len(cs)} terms ({pl} plus, {mi} minus, {tw} with |c| = 2), weight {sum(cs)}"
                  f"{', self-reciprocal' if selfrec else ''}: {show(g, a.primes)}")
        n = len(facs)
        for which, Qset in (("as given", M[1]), ("mirrored", [tuple(-c for c in p) for p in M[1]])):
            Q = poly(Qset, xs)
            for r in range(1, n + 1):
                for S in itertools.combinations(range(n), r):
                    prod = Poly(1, *xs)
                    for i in range(n):
                        prod = prod * (flip(facs[i], xs) if i in S else facs[i])
                    if norm(prod, xs) in (norm(Q, xs), norm(-Q, xs)):
                        print(f"   partner ({which}) = flip of {', '.join(f'f{i}' for i in S)}")


if __name__ == "__main__":
    main()
