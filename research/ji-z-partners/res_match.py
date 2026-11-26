#!/usr/bin/env python3
"""res_match.py: which known residue families (dump_ids.py output: members as ratios) a residue run found.

usage: python res_match.py KNOWN.jsonl FOUND.jsonl [--primes 3 5]
"""
import argparse, json
from fractions import Fraction

from chordgen import canon_TI


def vec(r, primes):
    r = Fraction(r)
    n, d = r.numerator, r.denominator
    v = []
    for p in primes:
        e = 0
        while n % p == 0:
            n //= p; e += 1
        while d % p == 0:
            d //= p; e -= 1
        v.append(e)
    return tuple(v)


ap = argparse.ArgumentParser()
ap.add_argument("known")
ap.add_argument("found")
ap.add_argument("--primes", type=int, nargs="+", default=[3, 5])
a = ap.parse_args()
found = set()
for line in open(a.found):
    f = json.loads(line)
    for m in f["members"]:
        found.add(canon_TI([vec(r, a.primes) if isinstance(r, str) else tuple(r) for r in m]))
for line in open(a.known):
    f = json.loads(line)
    hit = all(canon_TI([vec(r, a.primes) for r in m]) in found for m in f["members"])
    print(f"{f['k']} notes, family {f['family']} ({f.get('description', '').strip()}): {'found' if hit else 'MISSING'}")
