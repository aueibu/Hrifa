"""q formula for every rank-2 class of a typeflats result (any note count), checked against the explorer data.
For each class: homometric check (interval multisets of P and Q equal up to sign), the interval vectors, the smallest q it reaches.
Then the union of the classes' q sets (a, b ratios over the given primes with odd limit <= QMAX) against the data q set for that note count.
usage: python q_formula_types.py typeflats_k8d2.json explorer_all.json K "3,5,7" QMAX"""
import sys, json, itertools, math
from collections import Counter
import numpy as np
from type_integral import integral_form
from type_image import load

path, data_path, K, primes, QMAX = sys.argv[1], sys.argv[2], int(sys.argv[3]), [int(x) for x in sys.argv[4].split(",")], int(sys.argv[5])
LP = np.log(primes)
LQ = math.log(QMAX) + 1e-9
ranges = [range(-int(math.log(QMAX) / math.log(p)), int(math.log(QMAX) / math.log(p)) + 1) for p in primes]
R = np.array([e for e in itertools.product(*ranges)
              if max(sum(max(x, 0) * l for x, l in zip(e, LP)), sum(max(-x, 0) * l for x, l in zip(e, LP))) <= LQ], dtype=np.int64)
print("primes", primes, "QMAX", QMAX, "ratios", len(R))
allq = set()
for ci, (P, Q, d) in enumerate([t for t in load(path) if t[2] == 2], 1):
    P2, Q2 = integral_form(P, Q)
    ip = lambda S: Counter(tuple(sorted(((a[0] - b[0], a[1] - b[1]), (b[0] - a[0], b[1] - a[1])))[1]) for a, b in itertools.combinations(S, 2))
    homo = ip(P2) == ip(Q2)
    trivial = sorted(map(tuple, P2)) == sorted(map(tuple, Q2))
    V = set()
    for S in (P2, Q2):
        for u, v in itertools.combinations(S, 2):
            dv = (int(u[0] - v[0]), int(u[1] - v[1]))
            if dv < (0, 0):
                dv = (-dv[0], -dv[1])
            V.add(dv)
    V = sorted(V)
    best = np.zeros((len(R), len(R)))
    ok = np.ones((len(R), len(R)), dtype=bool)
    for x, y in V:
        E = x * R[:, None, :] + y * R[None, :, :]
        best = np.maximum(best, np.maximum((np.maximum(E, 0) * LP).sum(-1), (np.maximum(-E, 0) * LP).sum(-1)))
        ok &= (E != 0).any(-1)
    qs = sorted({int(round(math.exp(v))) for v in best[ok & (best <= LQ)]})
    allq |= set(qs)
    print(f"class {ci}: homometric {homo}, Q != P as point sets {not trivial}, {len(V)} vectors, q values {len(qs)}, first q {qs[:6]}")
j = json.load(open(data_path))
data = sorted({q for q, k, p, lb in zip(j["q"], j["k"], j["p"], j["lb"]) if k == K and p <= max(primes) and lb != 1 and q <= QMAX})
print("union formula q:", len(allq), " data q:", len(data))
print("in data not formula:", [q for q in data if q not in allq][:30])
print("in formula not data:", sorted(q for q in allq if q not in set(data))[:30])
