#!/usr/bin/env python3
"""chordsum_tab.py: tabulate chordsum_fs.py tables by q band and list the most used chords A.

usage: python chordsum_tab.py TSV [TSV ...]   (markdown to stdout)
"""
import collections, sys

BANDS = [(1, 135), (136, 243), (244, 405), (406, 729), (730, 1215), (1216, 2187), (2188, 3645)]


def band(q):
    for lo, hi in BANDS:
        if lo <= q <= hi:
            return f"{lo}-{hi}"
    return ">3645"


for fn in sys.argv[1:]:
    rows = [l.rstrip("\n").split("\t") for l in open(fn) if not l.startswith("list")]
    lab = rows[0][0]
    print(f"\n### {lab} ({len(rows)} families)\n")
    print("| q band | families | chord sums | share | at 9/12/15/16 notes: chord sums / families |")
    print("|---|---|---|---|---|")
    by = collections.defaultdict(lambda: [0, 0, 0, 0])
    for r in rows:
        k, q, cs = int(r[2]), int(r[3]), int(r[6])
        b = by[band(q)]
        b[0] += 1
        b[1] += cs
        if k in (9, 12, 15, 16):
            b[2] += 1
            b[3] += cs
    for lo, hi in BANDS:
        key = f"{lo}-{hi}"
        if key in by:
            t, c, t4, c4 = by[key]
            print(f"| {key} | {t:,} | {c:,} | {c / t:.1%} | {c4:,} / {t4:,} ({c4 / max(1, t4):.1%}) |")
    names = collections.Counter(r[9] for r in rows if r[6] == "1" and r[9])
    print("\nchords A (a:b:c, up to transposition and mirror), families: " +
          ", ".join(f"{n} {c:,}" for n, c in names.most_common(12)) + f"; {len(names)} distinct")
