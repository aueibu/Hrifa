"""Compare brute_k*.jsonl (independent recomputation) with the reported families.

usage: python3 compare_brute.py RUN_DIR
"""
import sys, glob, json, re
from zcore import load, exps, canon

run = sys.argv[1]
rep = {}
for f in load(f"{run}/families.jsonl"):
    rep.setdefault(f["notes"], set()).add(
        frozenset(tuple(map(tuple, canon([exps(r) for r in m["ratios"]]))) for m in f["members"]))
for path in sorted(glob.glob("brute_k*.jsonl"), key=lambda p: int(re.findall(r"\d+", p)[0])):
    k = int(re.findall(r"\d+", path)[0])
    mine = {frozenset(tuple(map(tuple, m)) for m in json.loads(l)) for l in open(path)}
    r = rep.get(k, set())
    print(f"k={k}: brute {len(mine)}, reported {len(r)}, identical={mine == r}, "
          f"only-brute {len(mine - r)}, only-reported {len(r - mine)}")
