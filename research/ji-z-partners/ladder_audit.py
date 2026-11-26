"""Ladder audit: what the ladder-only (lb 1) rows of the explorer data are, by note count, highest prime and q.
usage: python ladder_audit.py explorer_all.json"""
import sys, json, collections

j = json.load(open(sys.argv[1]))
P, K, Q, LB = j["p"], j["k"], j["q"], j["lb"]
n = j["count"]
lad = [i for i in range(n) if LB[i] == 1]
print("rows", n, "ladder-only", len(lad), "proven", j["proven"], "exact", j["exact"])
print("ladder runs:", j["ladderCoverage"])
print("\nladder-only by note count:")
c = collections.Counter(K[i] for i in lad)
for k in sorted(c):
    qs = [Q[i] for i in lad if K[i] == k]
    print(f"  k {k}: {c[k]:7d} rows, q {min(qs)} to {max(qs)}")
print("\nladder-only by highest prime p (rows, max q) and the proven reach for that p (any k):")
for p in sorted(set(P[i] for i in lad)):
    rows = [i for i in lad if P[i] == p]
    print(f"  p {p}: {len(rows):7d} rows, q {min(Q[i] for i in rows)} to {max(Q[i] for i in rows)}")
print("\nladder-only by (p, k): rows and max q")
cell = collections.defaultdict(list)
for i in lad:
    cell[(P[i], K[i])].append(Q[i])
for key in sorted(cell):
    print(f"  p {key[0]:2d} k {key[1]:2d}: {len(cell[key]):7d} rows, max q {max(cell[key])}")
print("\nproven coverage rectangles (limit, q, notes):")
for r in j["coverage"]:
    print(f"  {r['limit']}-limit q<={r['q']} notes {r['notes']}")
