"""Per family: note count, intervallic odd limit q, highest prime used by any member, members.
Summary: families per (note count, highest prime) and the simplest q for each.
usage: python3 usesp.py families.jsonl ..."""
import collections, json, sys
from fractions import Fraction


def odd(n):
    while n % 2 == 0:
        n //= 2
    return n


def iol(rs):
    fs = sorted(Fraction(r) for r in rs)
    m = 1
    for i, a in enumerate(fs):
        for b in fs[i + 1:]:
            x = b / a
            m = max(m, odd(x.numerator), odd(x.denominator))
    return m


rows = []
for p in sys.argv[1:]:
    for line in open(p):
        f = json.loads(line)
        primes = f["primes"]
        top = 2
        for m in f["members"]:
            for v in m["lattice"]:
                for i, e in enumerate(v):
                    if e:
                        top = max(top, primes[i])
        q = max(iol(m["ratios"]) for m in f["members"])
        rows.append((f["notes"], q, top, " ~ ".join(" ".join(m["ratios"]) for m in f["members"])))
rows.sort()
for r in rows:
    print(f"{r[0]} q={r[1]} top={r[2]} {r[3]}")
summ = collections.defaultdict(list)
for k, q, top, _ in rows:
    summ[(k, top)].append(q)
print("# notes, highest prime: families, simplest q")
for (k, top), qs in sorted(summ.items()):
    print(f"# {k} notes, top prime {top}: {len(qs)} families, simplest q = {min(qs)}")
