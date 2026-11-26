"""q formula for the rank-2 7-note type (zgen type 19): q = max over its interval vectors (x,y) of the odd limit of a^x b^y.
Compares with the explorer data (7 notes, highest prime <= 7).
usage: python q_formula_type19.py typeflats_k7.json explorer_all.json"""
import sys, json, itertools, math
import numpy as np
from type_integral import integral_form
from type_image import load

found = load(sys.argv[1])
P, Q, d = [t for t in found if t[2] == 2][0]
P2, Q2 = integral_form(P, Q)
print("P", [tuple(int(x) for x in p) for p in P2])
print("Q", [tuple(int(x) for x in q) for q in Q2])
V = set()
for S in (P2, Q2):
    for u, v in itertools.combinations(S, 2):
        dv = (int(u[0] - v[0]), int(u[1] - v[1]))
        if dv < (0, 0):
            dv = (-dv[0], -dv[1])
        V.add(dv)
V = sorted(V)
print(len(V), "distinct interval vectors", V)
primes = [3, 5, 7]
LP = np.log(primes)
QMAX = 531441
LQ = math.log(QMAX) + 1e-9
R = np.array([e for e in itertools.product(range(-12, 13), range(-7, 8), range(-6, 7))
              if max(sum(max(x, 0) * l for x, l in zip(e, LP)), sum(max(-x, 0) * l for x, l in zip(e, LP))) <= LQ],
             dtype=np.int64)
print("ratios", len(R))
best = np.zeros((len(R), len(R)))
ok = np.ones((len(R), len(R)), dtype=bool)
for x, y in V:
    E = x * R[:, None, :] + y * R[None, :, :]
    best = np.maximum(best, np.maximum((np.maximum(E, 0) * LP).sum(-1), (np.maximum(-E, 0) * LP).sum(-1)))
    ok &= (E != 0).any(-1)
qs = sorted({int(round(math.exp(v))) for v in best[ok & (best <= LQ)]})
j = json.load(open(sys.argv[2]))
data = sorted({q for q, k, p, lb in zip(j["q"], j["k"], j["p"], j["lb"]) if k == 7 and p <= 7 and lb != 1 and q <= QMAX})
print("formula distinct q:", len(qs), " data distinct q (7 notes, p<=7):", len(data))
print("in data not formula:", [q for q in data if q not in set(qs)][:30])
print("in formula not data:", [q for q in qs if q not in set(data)][:30])
print("first 20 formula:", qs[:20])
print("first 20 data:", data[:20])
