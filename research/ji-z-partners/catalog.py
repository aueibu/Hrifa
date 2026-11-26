#!/usr/bin/env python3
"""catalog.py: build the Ratio Rhythm Lab's JI catalog from a proven (shape-free enumerated) list.

Decided 2026-11-23 (arcs/ratio-rhythm/ARC.md, D1 checkpoint decisions): the catalog holds every proven
family with intervallic odd limit q <= 135, 5- to 19-limit, read from the proven list e19q135_on
(research/ji-z-partners/data/proven/e19q135_on.tar.xz), which contains every lower limit's q <= 135
families. Never edit the output by hand; rerun this script.

Each entry: id ("k<notes>-<family>" from the source list), k (notes), q (intervallic odd limit: largest
odd part of any interval's numerator or denominator), p (highest prime used by either member), members
(each a list of ratio strings within the octave, as in the source). Families are sorted by k, q, id.
Self-check: counts by highest prime must equal the proven table (<=5: 18, <=7: 273, <=11: 1,209,
<=13: 2,116, <=17: 2,731, <=19: 3,735).

usage: python catalog.py [ARCHIVE] [OUT]
  defaults: data/proven/e19q135_on.tar.xz -> ../../shell/src/lib/ratio-rhythm/data/jiCatalog.json
"""
import json, os, re, sys, tarfile
from fractions import Fraction

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "data", "proven", "e19q135_on.tar.xz")
OUT = os.path.join(HERE, "..", "..", "shell", "src", "lib", "ratio-rhythm", "data", "jiCatalog.json")
QMAX = 135
EXPECT = {5: 18, 7: 273, 11: 1209, 13: 2116, 17: 2731, 19: 3735}


def odd(n):
    n = abs(n)
    while n and n % 2 == 0:
        n //= 2
    return n


def iol(f):
    return max(max(odd(Fraction(c).numerator), odd(Fraction(c).denominator)) for c in f["interval_classes"])


def top_prime(f):
    primes = f["primes"]
    used = set()
    for m in f["members"]:
        for v in m["lattice"]:
            for p, e in zip(primes, v):
                if e:
                    used.add(p)
    return max(used) if used else 2


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else SRC
    out = sys.argv[2] if len(sys.argv) > 2 else OUT
    fams = []
    with tarfile.open(src, "r:xz") as t:
        for m in t:
            mm = re.search(r"/k(\d+)/families\.jsonl$", m.name)
            if not mm or not m.isfile():
                continue
            for line in t.extractfile(m):
                if not line.strip():
                    continue
                f = json.loads(line)
                q = iol(f)
                if q > QMAX:
                    continue
                fams.append({"id": f"k{f['notes']}-{f['family']}", "k": f["notes"], "q": q, "p": top_prime(f),
                             "members": [mem["ratios"] for mem in f["members"]]})
    fams.sort(key=lambda e: (e["k"], e["q"], int(e["id"].split("-")[1])))
    got = {lim: sum(1 for e in fams if e["p"] <= lim) for lim in EXPECT}
    if got != EXPECT:
        sys.exit(f"count check FAILED: {got} != {EXPECT}")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write('{"source": "research/ji-z-partners/data/proven/e19q135_on.tar.xz (shape-free enumeration, proven complete)",\n')
        fh.write(f' "qMax": {QMAX}, "limits": [5, 7, 11, 13, 17, 19], "count": {len(fams)},\n "families": [\n')
        fh.write(",\n".join("  " + json.dumps(e, separators=(",", ":")) for e in fams))
        fh.write("\n ]}\n")
    print(f"wrote {out}: {len(fams)} families; by highest prime <= limit: {got}; {os.path.getsize(out):,} bytes")


if __name__ == "__main__":
    main()
