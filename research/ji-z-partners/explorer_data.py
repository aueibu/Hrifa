#!/usr/bin/env python3
"""explorer_data.py: one compact per-family table for the V1 data explorer (arcs/ratio-rhythm PROGRESS, "NEXT").

Reads every proven (shape-free enumerated) list in data/proven/*.tar.xz, merges them (a family found in several
lists is kept once), and writes a columnar JSON file:
  p      highest prime used by either member (the family's limit)
  k      notes
  q      intervallic odd limit (largest odd part of any interval's numerator or denominator)
  gmin   smallest neighboring step of either member, cents, octave wrap included (as data/vm/minstep.py)
  gmax   largest neighboring step of either member, cents, octave wrap included
  m      the two members, each a space-separated list of ratios (only with --members)
plus "coverage": the proven rectangles (highest prime <= P, q <= Q, note counts), read from data/manifest.json.
Only proven lists are read; ladder rungs (lower bounds) are left out on purpose.

Self-check: for every proven run in the manifest, the families inside its rectangle must equal its count.

usage: python explorer_data.py ARCHIVE_DIR_OR_EXTRACTED_DIR OUT.json [--members]
"""
import json, math, os, re, sys, tarfile
from fractions import Fraction

HERE = os.path.dirname(os.path.abspath(__file__))


def odd(n):
    n = abs(n)
    while n and n % 2 == 0:
        n //= 2
    return n


def iol(f):
    return max(max(odd(Fraction(c).numerator), odd(Fraction(c).denominator)) for c in f["interval_classes"])


def top_prime(f):
    used = {p for m in f["members"] for v in m["lattice"] for p, e in zip(f["primes"], v) if e}
    return max(used) if used else 2


def steps(ratios):
    c = sorted(1200 * math.log2(Fraction(r)) for r in ratios)
    return [b - a for a, b in zip(c, c[1:])] + [1200 - c[-1] + c[0]]


def read_lines(src):
    """Yield (run name, families.jsonl line) from .tar.xz archives or already extracted folders."""
    if os.path.isdir(src):
        for name in sorted(os.listdir(src)):
            path = os.path.join(src, name)
            if name.endswith(".tar.xz"):
                with tarfile.open(path, "r:xz") as t:
                    for m in t:
                        if m.isfile() and re.search(r"/k\d+/families\.jsonl$", m.name):
                            for line in t.extractfile(m):
                                yield name[:-7], line
            elif os.path.isdir(path):
                for kd in sorted(os.listdir(path)):
                    fp = os.path.join(path, kd, "families.jsonl")
                    if re.fullmatch(r"k\d+", kd) and os.path.isfile(fp):
                        with open(fp, "rb") as fh:
                            for line in fh:
                                yield name, line


def main():
    args = sys.argv[1:]
    want_members = "--members" in args
    args = [a for a in args if a != "--members"]
    src, out = args
    manifest = json.load(open(os.path.join(HERE, "data", "manifest.json")))
    proven = [r for r in manifest["runs"] if r["status"] == "proven"]

    fams = {}
    for run, line in read_lines(src):
        if not line.strip():
            continue
        f = json.loads(line)
        key = tuple(sorted(" ".join(m["ratios"]) for m in f["members"]))
        if key in fams:
            continue
        st = [steps(m["ratios"]) for m in f["members"]]
        fams[key] = (top_prime(f), f["notes"], iol(f), round(min(min(s) for s in st), 1),
                     round(max(max(s) for s in st), 1))

    def ks(r):
        a, _, b = r["note_counts"].partition("-")
        return range(int(a), int(b or a) + 1)

    bad = []
    for r in proven:
        kk = set(ks(r))
        n = sum(1 for p, k, q, _, _ in fams.values() if p <= r["limit"] and q <= r["q"] and k in kk)
        if n != r["families"]:
            bad.append(f"{r['name']}: {n} != {r['families']}")
    if bad:
        sys.exit("count check FAILED: " + "; ".join(bad))

    # coverage: drop rectangles contained in another (same note counts, smaller limit and q)
    rects = [(r["limit"], r["q"], r["note_counts"]) for r in proven]
    cover = sorted({(L, Q, nc) for L, Q, nc in rects
                    if not any((L2 >= L and Q2 >= Q and nc2 == nc and (L2, Q2) != (L, Q)) for L2, Q2, nc2 in rects)})

    rows = sorted(fams.items(), key=lambda kv: (kv[1][0], kv[1][1], kv[1][2], kv[0]))
    data = {
        "source": "research/ji-z-partners/data/proven/*.tar.xz (shape-free enumeration, proven complete); explorer_data.py",
        "coverage": [{"limit": L, "q": Q, "notes": nc} for L, Q, nc in cover],
        "count": len(rows),
        "p": [v[0] for _, v in rows], "k": [v[1] for _, v in rows], "q": [v[2] for _, v in rows],
        "gmin": [v[3] for _, v in rows], "gmax": [v[4] for _, v in rows],
    }
    if want_members:
        data["m"] = [list(key) for key, _ in rows]
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(data, fh, separators=(",", ":"))
    print(f"wrote {out}: {len(rows)} families, {os.path.getsize(out):,} bytes; checks passed for {len(proven)} proven runs")
    print("coverage:", data["coverage"])


if __name__ == "__main__":
    main()
