#!/usr/bin/env python3
"""union_cov.py: which proven families are built by chord sums, holes or the small-signed-factor
(merge) search, family by family, and what is left (with overlap.py's description).

usage: python3 union_cov.py LIST_DIR PRIMES CHORDSUM_TSV HOLE_JSONL RUN_DIRS OVERLAP_TSV [--left OUT.tsv]
       (PRIMES comma-separated, e.g. 3,5,7; RUN_DIRS: one or more factor-search run dirs, comma-separated;
       "small signed factor" below counts every family found in any of them)
"""
import collections, glob, json, os, sys
from fractions import Fraction

from chordgen import canon_TI

lst, primes, cs_tsv, hole_js, merge_dir, ov_tsv = sys.argv[1:7]
left_out = sys.argv[sys.argv.index("--left") + 1] if "--left" in sys.argv else None
primes = [int(p) for p in primes.split(",")]


def vec(r):
    r = Fraction(r)
    v = []
    for p in primes:
        e = 0
        n, d = r.numerator, r.denominator
        while n % p == 0:
            n //= p; e += 1
        while d % p == 0:
            d //= p; e -= 1
        r = Fraction(n, d)
        v.append(e)
    return tuple(v)


member_fam, allf = {}, set()
for fn in glob.glob(os.path.join(lst, "k*", "families.jsonl")):
    for line in open(fn):
        f = json.loads(line)
        fid = (f["notes"], f["family"])
        allf.add(fid)
        for m in f["members"]:
            member_fam[canon_TI([tuple(p) for p in m["lattice"]])] = fid


def ids_of(members):
    ids = {member_fam.get(canon_TI(m)) for m in members}
    return ids.pop() if len(ids) == 1 and None not in ids else None


cs = set()
for line in open(cs_tsv):
    c = line.rstrip("\n").split("\t")
    if c[0] != "list" and c[6] == "1":
        cs.add((int(c[2]), int(c[1])))
holes = set()
for line in open(hole_js):
    f = json.loads(line)
    i = ids_of([[vec(r) for r in m] for m in f["members"]])
    if i:
        holes.add(i)
merges = set()
for fn in [g for md in merge_dir.split(",") for g in glob.glob(os.path.join(md, "k*", "families.jsonl"))]:
    for line in open(fn):
        f = json.loads(line)
        i = ids_of([[tuple(p) for p in m["lattice"]] for m in f["members"]])
        if i:
            merges.add(i)
desc = {}
for line in open(ov_tsv):
    c = line.rstrip("\n").split("\t")
    if c[0] == "list":
        continue
    d = f"{c[4]} " + (f"|T| {c[5]}, |S+| {c[6]}, |S-| {c[7]}, stack {c[8]}" if c[5] else c[10])
    desc[(int(c[2]), int(c[1]))] = d
u = cs | holes | merges
left = sorted(allf - u)
lab = os.path.basename(lst.rstrip("/"))
print(f"{lab}: {len(allf):,} families; chord sums {len(cs):,}, holes {len(holes):,}, small signed factor "
      f"{len(merges):,} (overlaps: holes&merges {len(holes & merges)}, cs&others {len(cs & (holes | merges))}); "
      f"union {len(u):,} ({len(u) / len(allf):.2%}); left {len(left)} by notes "
      f"{dict(sorted(collections.Counter(k for k, _ in left).items()))}")
cnt = collections.Counter(desc.get(i, "?") for i in left)
for d, n in cnt.most_common(12):
    print(f"   {n:5}  {d}")
if left_out:
    with open(left_out, "w") as fo:
        for i in left:
            fo.write(f"{i[0]}\t{i[1]}\t{desc.get(i, '?')}\n")
