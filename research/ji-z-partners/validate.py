"""Validate every family in families.jsonl against the lattice-homometry definition.

usage: python3 validate.py RUN_DIR      (RUN_DIR holds families.jsonl and gamut.txt)
"""
import sys, collections
from zcore import load, exps, diffs, canon, canon_T, ic_ratio, F

run = sys.argv[1]
gamut = {exps(r) for r in open(f"{run}/gamut.txt").read().split()}
errs = collections.Counter()
seen_member = {}
seen_fp = {}
lattice_is_canon = collections.Counter()
n = 0
lit = collections.Counter()
SHIFTS = [(a, b) for a in range(-12, 13) for b in range(-6, 7)]


def fits(S):
    return any({(x + a, y + b) for x, y in S} <= gamut for a, b in SHIFTS)


for fam in load(f"{run}/families.jsonl"):
    n += 1
    fid = fam["family"]
    mem = []
    for m in fam["members"]:
        S = [exps(r) for r in m["ratios"]]
        if len(set(S)) != len(S) or len(S) != fam["notes"]:
            errs["wrong size / repeated note"] += 1
        if not set(S) <= gamut:
            # output is re-rooted on 1/1; the set only has to fit the gamut up to transposition
            lit["re-rooted (not literal gamut notes)"] += 1
            if not fits(S):
                errs["no transposition fits the gamut"] += 1
        else:
            lit["literal gamut notes"] += 1
        if (0, 0) not in S:
            errs["1/1 missing"] += 1
        lat = tuple(sorted(map(tuple, m["lattice"])))
        if lat != canon_T(S):
            errs["lattice field != translated ratios"] += 1
        lattice_is_canon[lat == canon(S)] += 1
        mem.append(S)
    D = [diffs(S) for S in mem]
    if any(d != D[0] for d in D):
        errs["difference multisets differ"] += 1
    ics = sorted(ic_ratio(v) for v in D[0])
    if ics != sorted(F(x) for x in fam["interval_classes"]):
        errs["interval_classes field mismatch"] += 1
    if len(set(ics)) != fam["distinct_interval_classes"]:
        errs["distinct count mismatch"] += 1
    C = [canon(S) for S in mem]
    if len(set(C)) != len(C):
        errs["members are transposition/inversion copies"] += 1
    for c in C:
        if c in seen_member:
            errs["class appears in two families"] += 1
        seen_member[c] = fid
    if D[0] in seen_fp:
        errs["two families share a fingerprint (should be merged)"] += 1
    seen_fp[D[0]] = fid

print(f"families checked: {n}; member classes: {len(seen_member)}")
print("lattice field equals full canon (translation+inversion)?", dict(lattice_is_canon))
print("ratios field:", dict(lit))
print("errors:", dict(errs) if errs else "none")
