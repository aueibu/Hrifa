#!/usr/bin/env python3
"""shapes_catalog.py (2026-11-26): every known maximal k-note shape (6-9 notes) in one JSON file for the shapes page.

Sources: zgen types (tables/shapes/k6_types.jsonl type 1, k7_types.jsonl type 19 and the rank-1 type 1, k8_types.jsonl
91 and 94, k8_s1.jsonl), the four new 7-note rank-1 shapes (PROGRESS "k 7 RESULT"), the k 8 min-dim 2 search
(typeflats_k8d2b.json: the 4th class, c3, is the one no zgen shape matches), the k 9 min-dim 3 search (3 x 3 product,
#23) and the step-(a) maximal 2-D 9-note patterns (#37, #68, #69, #70; smallest known example).

usage: python shapes_catalog.py OUT.json K8_TYPES.json  (run where tables/ and the k 8 json are)
"""
import json, sys
from fractions import Fraction as F

from type_image import image


def fr(S):
    return [tuple(F(x) for x in p) for p in S]


def img(B, A):
    try:
        return image(B, A) is not None
    except ValueError:
        return image((B[1], B[0]), A) is not None


def same(A, B):
    return img(A, B) and img(B, A)


def zgen(path, t):
    for l in open(path):
        d = json.loads(l)
        if d["type"] == t:
            return d["P"], d["Q"]
    raise KeyError(t)


def intify(S):
    """rational generic coordinates -> integers (scale by the lcm of denominators)"""
    from math import lcm
    den = lcm(*(F(x).denominator for p in S for x in p))
    return [[int(F(x) * den) for x in p] for p in S]


out = []


def add(k, name, dim, P, Q, first_q, note, families=None):
    out.append({"k": k, "name": name, "dim": dim, "P": P, "Q": Q, "first_q": first_q, "note": note, "families": families})


# 6 notes
P, Q = zgen("tables/shapes/k6_types.jsonl", 1)
add(6, "type 1", 2, P, Q, 125, "the only 6-note shape (proven)")
# 7 notes
P, Q = zgen("tables/shapes/k7_types.jsonl", 19)
add(7, "type 19", 2, P, Q, 1215, "the only 2-D 7-note shape (proven)")
P, Q = zgen("tables/shapes/k7_types.jsonl", 1)
add(7, "line A (zgen type 1)", 1, P, Q, 3 ** 12, "1-D, on the chain of fifths")
for name, p, q, span in [("line B (#7)", [0, 2, 3, 7, 9, 10, 15], [0, 2, 7, 8, 9, 12, 15], 15),
                         ("line C (#11)", [0, 1, 3, 4, 9, 11, 15], [0, 1, 7, 9, 11, 12, 15], 15),
                         ("line D (#13)", [0, 1, 4, 5, 11, 13, 16], [0, 1, 5, 10, 12, 13, 16], 16),
                         ("line E (#6)", [0, 2, 4, 7, 11, 12, 17], [0, 2, 7, 9, 12, 13, 17], 17)]:
    add(7, name, 1, [[x] for x in p], [[x] for x in q], 3 ** span, "1-D, found by the 7-note pattern search")
# 8 notes: zgen 91, 94, s1, then the k 8 search's 4 classes (the unmatched one is c3)
k8 = {"type 91": zgen("tables/shapes/k8_types.jsonl", 91), "type 94": zgen("tables/shapes/k8_types.jsonl", 94),
      "s1": zgen("tables/shapes/k8_s1.jsonl", "s1")}
cl8 = [json.loads(l) for l in open("tables/shapes9/k8.classes.jsonl")]
first8 = {}
for name, (P, Q) in k8.items():
    qs = [c["minq"] for c in cl8 if img((fr(P), fr(Q)), (fr(c["example"]["P"]), fr(c["example"]["Q"])))]
    first8[name] = min(qs) if qs else None
found8 = json.load(open(sys.argv[2]))["types"]
matched = set()
for name, (P, Q) in k8.items():
    add(8, name, 2, P, Q, first8[name], "2-D 8-note shape (proven complete list of 4)")
    for i, t in enumerate(found8):
        if same((fr(t["P"]), fr(t["Q"])), (fr(P), fr(Q))):
            matched.add(i)
for i, t in enumerate(found8):
    if i not in matched:
        add(8, "c3", 2, intify(t["P"]), intify(t["Q"]), None, "2-D 8-note shape found only by the pattern search (first q above 531,440)")
print("k 8 classes matched to zgen:", sorted(matched), "of", len(found8), file=sys.stderr)
# 9 notes
k9 = json.load(open("tables/types/typeflats_k9d3.json"))["types"]
add(9, "3 x 3 product", 4, intify(k9[2]["P"]), intify(k9[2]["Q"]), 49, "two 3-note chords A, B: P = A + B, Q = A - B (proven: one of the two 9-note shapes of dim >= 3)", 151623)
add(9, "#23", 3, intify(k9[3]["P"]), intify(k9[3]["Q"]), 125, "the other 9-note shape of dim >= 3 (proven)", 2340)
cl = {json.loads(l)["idx"]: json.loads(l) for l in open("tables/shapes9/k9.classes.jsonl")}
for idx in (37, 68, 69, 70):
    c = cl[idx]
    P = [p[:2] for p in c["example"]["P"]]
    Q = [q[:2] for q in c["example"]["Q"]]
    assert all(not any(p[2:]) for p in c["example"]["P"] + c["example"]["Q"])
    add(9, f"#{idx}", 2, P, Q, c["minq"], "2-D 9-note shape from the known families (list not yet proven complete)", c["count"])

# ---- prime form (2026-11-26 evening): deterministic drawing of each shape ----
# Over unimodular maps M (1-D: +-1; 2-D: entries |x| <= 10; 3-D: |x| <= 1; 4-D: kept as the A + B coordinates),
# translation per set, mirror per set and P/Q swap: minimize total width (sum of the bounding-box widths of P and Q),
# ties broken by the lexicographically smallest (sorted P, sorted Q) after moving each set's box corner to 0.
import itertools

PRIMES = [3, 5, 7, 11, 13, 17, 19, 23, 29, 31]


def det(M):
    d = len(M)
    if d == 1:
        return M[0][0]
    if d == 2:
        return M[0][0] * M[1][1] - M[0][1] * M[1][0]
    a, b, c = M
    return a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])


def unimodular(d):
    R = {1: 1, 2: 10, 3: 1}[d]
    vals = range(-R, R + 1)
    for e in itertools.product(vals, repeat=d * d):
        M = [e[i * d:(i + 1) * d] for i in range(d)]
        if abs(det(M)) == 1:
            yield M


def width(S):
    return sum(max(p[i] for p in S) - min(p[i] for p in S) for i in range(len(S[0])))


def norm(S):
    m = [min(p[i] for p in S) for i in range(len(S[0]))]
    return tuple(sorted(tuple(x - m[i] for i, x in enumerate(p)) for p in S))


def prime_form(P, Q):
    d = len(P[0])
    if d > 3:
        return {"P": [list(p) for p in norm(P)], "Q": [list(p) for p in norm(Q)], "rule": "A + B coordinates (4-D not searched)"}
    best = None
    for M in unimodular(d):
        P2 = [[sum(M[r][c] * p[c] for c in range(d)) for r in range(d)] for p in P]
        Q2 = [[sum(M[r][c] * p[c] for c in range(d)) for r in range(d)] for p in Q]
        w = width(P2) + width(Q2)
        if best is not None and w > best[0]:
            continue
        mir = lambda S: [[-x for x in p] for p in S]
        for A, B in ((P2, Q2), (Q2, P2)):
            for A1 in (norm(A), norm(mir(A))):
                for B1 in (norm(B), norm(mir(B))):
                    key = (w, A1, B1)
                    if best is None or key < best:
                        best = key
    return {"P": [list(p) for p in best[1]], "Q": [list(p) for p in best[2]], "width": best[0],
            "rule": {1: "maps +-1", 2: "unimodular maps, entries |x| <= 10", 3: "unimodular maps, entries |x| <= 1"}[d]}


def first_view(ex):
    """a real example on the JI lattice: keep the prime columns it uses; each set's box corner moved to 0"""
    cols = [i for i in range(len(ex["P"][0])) if any(p[i] for p in ex["P"] + ex["Q"])]
    P = [[p[i] for i in cols] for p in ex["P"]]
    Q = [[p[i] for i in cols] for p in ex["Q"]]
    return {"P": [list(p) for p in norm(P)], "Q": [list(p) for p in norm(Q)], "primes": [PRIMES[i] for i in cols],
            "q": ex["q"], "list": ex.get("list")}


cls = {k: [json.loads(l) for l in open(f"tables/shapes9/k{k}.classes.jsonl")] for k in (6, 7, 8)}
for s in out:
    s["prime"] = prime_form(s["P"], s["Q"])
    if s["dim"] == 1:  # lines: smallest on the chain of fifths (3-axis), q = 3^span
        s["first"] = {"P": s["P"], "Q": s["Q"], "primes": [3], "q": s["first_q"], "list": None}
    elif s["k"] < 9:
        best = None
        for c in cls[s["k"]]:
            if img((fr(s["P"]), fr(s["Q"])), (fr(c["example"]["P"]), fr(c["example"]["Q"]))):
                if best is None or c["minq"] < best["minq"]:
                    best = c
        s["first"] = first_view(best["example"]) if best else None
        if best:
            assert best["minq"] == s["first_q"], (s["name"], best["minq"], s["first_q"])
    else:
        idx = {"3 x 3 product": 31, "#23": 23}.get(s["name"]) or int(s["name"][1:])
        c = cl[idx]
        assert c["minq"] == s["first_q"], (s["name"], c["minq"], s["first_q"])
        s["first"] = first_view(c["example"])
    print(s["k"], s["name"], "width", s["prime"].get("width"), "first", s["first"] and (s["first"]["q"], s["first"]["primes"]), file=sys.stderr)

json.dump(out, open(sys.argv[1], "w"))
print(len(out), "shapes", file=sys.stderr)
