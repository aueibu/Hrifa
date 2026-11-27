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
    add(9, f"#{idx}", 2, P, Q, c["minq"], "2-D 9-note shape from the known families (list not yet proven complete); drawn as its smallest example in the 3-5 lattice", c["count"])
json.dump(out, open(sys.argv[1], "w"))
print(len(out), "shapes", file=sys.stderr)
