#!/usr/bin/env python3
"""merge_cmp.py: compare a factor-search run (small signed factor times a plain set) with a proven list.

The run (zprod_rs.py --shapes 3,1 4,1 4,2 --ucoeffs 0 1 --max-neg 0 --max-nodes 0) builds P = T·S,
Q = T·S* with S a small signed factor (one or two minus points) and T plain: the "merge" construction
of THEORY_SMALL_FACTOR.md 6.4 (and the holes whose signed factor is the small one).
Checks: every generated family is in the list; every list family that overlap.py describes with a small
signed factor of one of these shapes (S+, S-) = (3,1), (4,1), (4,2) and the plain factor the larger is
generated.

usage: python3 merge_cmp.py RUN_DIR LIST_DIR OVERLAP_TSV
"""
import collections, glob, json, os, sys

from chordgen import canon_TI

run, lst, ov = sys.argv[1:4]
member_fam = {}
for fn in glob.glob(os.path.join(lst, "k*", "families.jsonl")):
    for line in open(fn):
        f = json.loads(line)
        fid = (f["notes"], f["family"])
        for m in f["members"]:
            member_fam[canon_TI([tuple(p) for p in m["lattice"]])] = fid
got, stray = set(), collections.Counter()
for fn in glob.glob(os.path.join(run, "k*", "families.jsonl")):
    for line in open(fn):
        f = json.loads(line)
        ids = {member_fam.get(canon_TI([tuple(p) for p in m["lattice"]])) for m in f["members"]}
        if len(ids) == 1 and None not in ids:
            got |= ids
        else:
            stray[f["notes"]] += 1
want = collections.defaultdict(set)
for line in open(ov):
    c = line.rstrip("\n").split("\t")
    if c[0] == "list" or not c[5]:
        continue
    if c[4] == "G2" and (c[6], c[7]) in (("3", "1"), ("4", "1"), ("4", "2")):
        kind = "hole" if eval(c[8])[0] == 1 else "merge"
        want[f"{kind} S {c[6]},{c[7]}"].add((int(c[2]), int(c[1])))
allw = set().union(*want.values()) if want else set()
miss = allw - got
print(f"{os.path.basename(run.rstrip('/'))}: generated families in the list {len(got)}, not in the list "
      f"{dict(sorted(stray.items()))}; targets {len(allw)} "
      f"({', '.join(f'{k} {len(v)}' for k, v in sorted(want.items()))}); generated {len(allw & got)}; "
      f"missed {len(miss)} by notes {dict(sorted(collections.Counter(k for k, _ in miss).items()))}; "
      f"generated families of other descriptions {len(got - allw)}")
if miss:
    print("  missed (k, id): " + " ".join(map(str, sorted(miss)[:20])))
