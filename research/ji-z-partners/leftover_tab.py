#!/usr/bin/env python3
"""leftover_tab.py: sort the families that are NOT chord sums (chordsum_fs.py tables) into groups.

Groups, from the best valid split P = V·U, Q = V*·U (V = the flipped part, U = the kept part):
  G1 chord · signed U   V is a plain chord (all coefficients 1), U has -1 coefficients
  G2 signed V · plain U V has -1 coefficients (e.g. 3,1 = three +1 and one -1), U plain
  G3 both signed        V and U both have -1 coefficients
  G4 other              no valid split recorded
Prints counts by list, group and number of notes, and the share of each list by q band.

usage: python leftover_tab.py TSV [TSV ...]
"""
import collections, re, sys

BANDS = [(1, 135), (136, 243), (244, 405), (406, 729), (730, 1215), (1216, 2187), (2188, 3645)]


def group(best):
    m = re.match(r"V (\d+),(\d+) U (\d+) terms min (-?\d+) \| V min (-?\d+)", best)
    if not m:
        return "G4 other", ""
    vp, vn, ut, umin, vmin = map(int, m.groups())
    vsh = f"V {vp},{vn}"
    if vn == 0 and umin < 0:
        return "G1 chord · signed U", f"{vp}-note chord, U {ut} terms"
    if vn > 0 and umin > 0:
        return "G2 signed V · plain U", f"V {vp},{vn}, U {ut} notes"
    return "G3 both signed", f"{vsh}, U {ut} terms"


for fn in sys.argv[1:]:
    rows = [l.rstrip("\n").split("\t") for l in open(fn) if not l.startswith("list")]
    lab = rows[0][0]
    left = [r for r in rows if r[6] == "0"]
    print(f"\n### {lab}: {len(left):,} of {len(rows):,} families are not chord sums")
    g = collections.Counter()
    gk = collections.defaultdict(collections.Counter)
    sub = collections.defaultdict(collections.Counter)
    for r in left:
        name, detail = group(r[10])
        g[name] += 1
        gk[name][int(r[2])] += 1
        sub[name][detail] += 1
    for name, c in sorted(g.items()):
        ks = ", ".join(f"{k}: {n}" for k, n in sorted(gk[name].items()))
        top = "; ".join(f"{d} x{n}" for d, n in sub[name].most_common(4))
        print(f"- {name}: {c:,}  (by notes {ks})  most common: {top}")
    by = collections.defaultdict(lambda: [0, 0])
    for r in rows:
        q = int(r[3])
        b = next(f"{lo}-{hi}" for lo, hi in BANDS if lo <= q <= hi)
        by[b][0] += 1
        by[b][1] += r[6] == "0"
    print("  leftover share by q band: " + ", ".join(f"{b} {l}/{t} ({l / t:.1%})" for b, (t, l) in by.items()))
