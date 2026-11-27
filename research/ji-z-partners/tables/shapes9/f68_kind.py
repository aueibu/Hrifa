"""f68_kind.py (VM, ~/zgen/theory): recorded kind (CLASSIFICATION.md) of the #37/#68/#69/#70 families with q <= 3,645.
Matches each family's members (translation + mirror) to the proven list e5q3645_on/k9 and reads class_5q3645.tsv."""
import json, os, sys
from fractions import Fraction
sys.path.insert(0, os.path.expanduser("~/zgen/theory"))
from shapes_k import vec, canon_any, odd

Z = os.path.expanduser("~/zruns/zprod")
ident = lambda f: tuple(sorted(canon_any([vec(r) for r in m["ratios"]]) for m in f["members"]))
proven = {}
for l in open(f"{Z}/e5q3645_on/k9/families.jsonl"):
    f = json.loads(l)
    proven[ident(f)] = f["family"]
kind = {}
for l in open(f"{Z}/chordsum/class_5q3645.tsv"):
    c = l.rstrip("\n").split("\t")
    if c[0] == "9":
        kind[int(c[1])] = (c[2], c[3])
for l in open(os.path.expanduser("~/zruns/f68/fams.jsonl")):
    f = json.loads(l)
    q = max(max(odd(Fraction(c).numerator), odd(Fraction(c).denominator)) for c in f["interval_classes"])
    if q > 3645:
        continue
    pid = proven.get(ident(f))
    print(f["shape_idx"], "q", q, f["source_list"], f["family"], "-> proven id", pid, "kind", kind.get(pid))
