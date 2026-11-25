"""Intervallic odd limit of every family in a zgen families.jsonl: the largest odd number in any interval
inside the set (the interval classes are already listed per family). Prints a table: families per note
count whose intervallic odd limit is <= q, for several q, plus the simplest family per note count.
usage: python3 interval_odd.py families.jsonl [more.jsonl ...]"""
import collections, json, sys
from fractions import Fraction

QS = [9, 15, 25, 27, 45, 75, 81, 125, 135, 225, 243, 405, 625, 729, 2025]


def odd(n):
    while n % 2 == 0:
        n //= 2
    return n


def ol(r):
    return max(odd(r.numerator), odd(r.denominator))


def member_iol(lat, primes):
    def ratio(v):
        r = Fraction(1)
        for p, e in zip(primes, v):
            r *= Fraction(p) ** e
        return r
    pts = [ratio(v) for v in lat]
    return max(ol(a / b) for i, a in enumerate(pts) for b in pts[i + 1:])


by_k = collections.defaultdict(list)
simplest = {}
mismatch = 0
for path in sys.argv[1:]:
    for line in open(path):
        f = json.loads(line)
        q = max(ol(Fraction(c)) for c in f["interval_classes"])
        qs = {member_iol(m["lattice"], f["primes"]) for m in f["members"]}
        if qs != {q}:
            mismatch += 1
        k = f["notes"]
        by_k[k].append(q)
        if k not in simplest or q < simplest[k][0]:
            simplest[k] = (q, [" ".join(m["ratios"]) for m in f["members"]])

print(f"members disagreeing with the family's interval list: {mismatch}")
print("notes  families  " + "".join(f"{'<=' + str(q):>8}" for q in QS) + "   min      max")
for k in sorted(by_k):
    v = by_k[k]
    print(f"{k:5d} {len(v):9d}  " + "".join(f"{sum(1 for x in v if x <= q):8d}" for q in QS) + f" {min(v):5d} {max(v):8d}")
print()
for k in sorted(simplest):
    q, ms = simplest[k]
    print(f"{k} notes, simplest (intervallic odd limit {q}): {ms[0]}  ~  {ms[1]}")
