"""Families in an enumeration file that a ladder union file lacks (by interval content of member 0).
usage: python3 missing.py ENUM.jsonl LADDER.jsonl OUT.jsonl   -> writes the missing families, prints their ratios"""
import json, sys

def key(f):
    P = [tuple(p) for p in f["members"][0]["lattice"]]
    d = []
    for i, a in enumerate(P):
        for b in P[i + 1:]:
            x = tuple(u - v for u, v in zip(a, b))
            if x < tuple(0 for _ in x):
                x = tuple(-u for u in x)
            d.append(x)
    return tuple(sorted(d))

lad = {key(json.loads(l)) for l in open(sys.argv[2]) if l.strip()}
n = 0
with open(sys.argv[3], "w") as out:
    for l in open(sys.argv[1]):
        if not l.strip():
            continue
        f = json.loads(l)
        if key(f) not in lad:
            out.write(l if l.endswith("\n") else l + "\n")
            n += 1
            print(f"family {f['family']} ({f['notes']} notes): " + "  ~  ".join(" ".join(m["ratios"]) for m in f["members"]))
print(f"{n} missing", file=sys.stderr)
