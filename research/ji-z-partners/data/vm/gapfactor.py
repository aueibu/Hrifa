"""Why did zprod miss a family? Factor each missing family (reference families with intervallic odd limit <= Q
that are not in the run) and show the split P = U*V, Q = U*V* that links its first two members: V = product of
the reversed factors (or, swapping roles, U), with term counts, minus terms and coefficients, so the zprod
shape and U coefficients that would reach it can be read off.
usage: pypy3 gapfactor.py ZFACTOR_DIR REF.jsonl Q RUN.jsonl [RUN2.jsonl ...]"""
import collections, itertools, json, sys
from fractions import Fraction

sys.path.insert(0, sys.argv[1])
import sympy as sp
import zfactor as zf


def odd(n):
    while n % 2 == 0:
        n //= 2
    return n


def iol(f):
    return max(max(odd(Fraction(c).numerator), odd(Fraction(c).denominator)) for c in f["interval_classes"])


def desc(expr, X):
    P = sp.Poly(sp.expand(expr), *X)
    cs = [int(c) for _, c in P.terms()]
    return f"{len(cs)} terms ({sum(1 for c in cs if c > 0)} plus, {sum(1 for c in cs if c < 0)} minus), coeffs {sorted(set(cs))}"


ref, q, runs = sys.argv[2], int(sys.argv[3]), sys.argv[4:]
have = set()
for p in runs:
    for line in open(p):
        have.add(tuple(sorted(json.loads(line)["interval_classes"])))
shapes = collections.Counter()
for line in open(ref):
    f = json.loads(line)
    if iol(f) > q or tuple(sorted(f["interval_classes"])) in have:
        continue
    S = [tuple(p) for p in f["members"][0]["lattice"]]
    T = [tuple(p) for p in f["members"][1]["lattice"]]
    n = len(S[0])
    X = sp.symbols(f"x0:{n}")
    A = zf.to_poly(S, X)
    content, facs = sp.factor_list(A, *X)
    groups = []
    for fac, mult in facs:
        r = zf.reverse(fac, X)
        sym = sp.expand(r - fac) == 0 or sp.expand(r + fac) == 0
        groups.append((fac, r, mult, not sym))
    options = [range(m + 1) if rev else [0] for fac, r, m, rev in groups]
    target = zf.canon(T)
    found = None
    for choice in itertools.product(*options):
        if not any(choice):
            continue
        expr = content
        for (fac, r, m, rev), k in zip(groups, choice):
            expr = expr * fac ** (m - k) * r ** k
        Tset = zf.poly_set(expr, X)
        if Tset is not None and zf.canon(Tset) == target:
            found = choice
            break
    print(f"\n{f['notes']} notes, q = {iol(f)}: {' '.join(f['members'][0]['ratios'])}")
    if found is None:
        print("   partner not reached by reversing factors (unexpected)")
        continue
    V = sp.Mul(*[fac ** k for (fac, r, m, rev), k in zip(groups, found)])
    U = content * sp.Mul(*[fac ** (m - k) for (fac, r, m, rev), k in zip(groups, found)])
    print(f"   factors: {len(facs)}, degrees {[sp.Poly(fac, *X).total_degree() for fac, _ in facs]}")
    print(f"   V (reversed part): {desc(V, X)}")
    print(f"   U (kept part):     {desc(U, X)}")
    dv, du = desc(V, X), desc(U, X)
    shapes[(dv.split(',')[0], du.split(',')[0])] += 1
print("\nsummary (V terms, U terms):")
for k, c in shapes.most_common():
    print(f"  {c} x  V {k[0]} / U {k[1]}")
