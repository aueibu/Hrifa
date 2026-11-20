"""Shared helpers for the JI Z-family analysis (5-limit lattice reading).

A pitch is an exponent vector (a, b) meaning 3^a * 5^b, octave-reduced.
Transposition = translation in Z^2, inversion (otonal/utonal mirror) = negation.
Two sets are homometric when their multisets of +/- difference vectors agree.
"""
from fractions import Fraction as F
from math import gcd
import json

PRIMES = (3, 5)


def exps(r):
    """'27/20' -> (3, -1). Ignores powers of 2."""
    r = F(r)
    n, d = r.numerator, r.denominator
    out = []
    for p in PRIMES:
        k = 0
        while n % p == 0:
            n //= p; k += 1
        while d % p == 0:
            d //= p; k -= 1
        out.append(k)
    assert n & (n - 1) == 0 and d & (d - 1) == 0, f"{r} is not {PRIMES}-smooth"
    return tuple(out)


def ratio(v):
    """(a, b) -> octave-reduced Fraction in [1, 2)."""
    r = F(1)
    for p, e in zip(PRIMES, v):
        r *= F(p) ** e
    while r >= 2:
        r /= 2
    while r < 1:
        r *= 2
    return r


def ic_ratio(v):
    """Interval class of difference vector v: min(r, 2/r), in [1, sqrt 2]."""
    r = ratio(v)
    return min(r, 2 / r)


def diffs(S):
    """Sorted multiset of difference vectors, sign-normalised so v ~ -v."""
    out = []
    S = list(S)
    for i in range(len(S)):
        for j in range(i + 1, len(S)):
            v = (S[j][0] - S[i][0], S[j][1] - S[i][1])
            if v < (0, 0):
                v = (-v[0], -v[1])
            out.append(v)
    return tuple(sorted(out))


def _norm(S):
    m = min(S)
    return tuple(sorted((x - m[0], y - m[1]) for x, y in S))


def canon(S):
    """Canonical form up to translation and negation (transposition + inversion)."""
    return min(_norm(S), _norm([(-x, -y) for x, y in S]))


def canon_T(S):
    """Canonical form up to translation only."""
    return _norm(S)


# --- the 12 symmetries of the triangular 5-limit lattice (axes 3, 5, 5/3) ---
def _rot(v):            # 60-degree rotation: e3 -> e3 - e5, e5 -> e3
    a, b = v
    return (a + b, -a)


def _ref(v):            # reflection fixing the 3-axis: e5 -> e3 - e5
    a, b = v
    return (a + b, -b)


def hex_group():
    gs = []
    for r in range(6):
        for f in (False, True):
            def g(v, r=r, f=f):
                if f:
                    v = _ref(v)
                for _ in range(r):
                    v = _rot(v)
                return v
            gs.append(((r, f), g))
    return gs


HEX = hex_group()


def canon_hex(S):
    """Canonical form up to translation and the full 12-element lattice symmetry group."""
    return min(_norm([g(v) for v in S]) for _, g in HEX)


def tenney(v):
    """Tenney height log2(n*d) of the octave-reduced ratio."""
    from math import log2
    r = ratio(v)
    return log2(r.numerator * r.denominator)


def unit_links(S):
    """Edges between notes differing by exactly one step of 3 or of 5."""
    S = list(S)
    idx = {p: i for i, p in enumerate(S)}
    E = []
    for i, (a, b) in enumerate(S):
        for d in ((1, 0), (0, 1)):
            j = idx.get((a + d[0], b + d[1]))
            if j is not None:
                E.append((i, j))
    return E


def load(path):
    with open(path) as fh:
        for line in fh:
            yield json.loads(line)


# --- ring ("linear") reading from the handoff ---
def lcm(a, b):
    return a * b // gcd(a, b)


def ring(S):
    """Exponent set -> (L, sorted slots) under slot = (n-d)*L/d."""
    rs = [ratio(v) for v in S]
    L = 1
    for r in rs:
        L = lcm(L, r.denominator)
    return L, sorted((r.numerator - r.denominator) * L // r.denominator for r in rs)


def ring_iv(A, L):
    c = [0] * (L // 2 + 1)
    for i in range(len(A)):
        for j in range(i + 1, len(A)):
            d = abs(A[i] - A[j])
            c[min(d, L - d)] += 1
    return c


def ring_canon(S, L):
    best = None
    for sg in (1, -1):
        s = [(sg * x) % L for x in S]
        for a in s:
            t = tuple(sorted((x - a) % L for x in s))
            if best is None or t < best:
                best = t
    return best
