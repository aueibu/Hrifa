"""Compose tables/shapes/k8_rank2.jsonl: the four rank-2 8-note classes of typeflats_k8d2.json as shapes.
zgen types 91, 94 and s1 are the classes 1, 2, 4 (unimodular both ways, type_integral.py); class 3 is new (c3, integral form from type_integral.py).
usage: python mk_k8_rank2.py   (run from tables/shapes)"""
import json

out = []
for fn, keep in (("k8_types.jsonl", {91, 94}), ("k8_s1.jsonl", {"s1"})):
    for line in open(fn):
        t = json.loads(line)
        if t["type"] in keep:
            out.append(t)
out.append({"type": "c3", "k": 8, "rank": 2,
            "P": [[0, 0], [1, 0], [0, 1], [4, -4], [-1, 1], [9, -8], [13, -12], [7, -6]],
            "Q": [[0, 0], [1, 0], [0, 1], [4, -4], [-8, 8], [5, -4], [-2, 2], [-9, 9]]})
with open("k8_rank2.jsonl", "w") as f:
    for t in out:
        f.write(json.dumps(t) + "\n")
print([t["type"] for t in out])
