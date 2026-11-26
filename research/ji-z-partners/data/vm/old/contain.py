"""Z-families in which some member contains a given chord (up to transposition and inversion).
usage: python3 contain.py "1 9/8 5/4 3/2" families.jsonl [more.jsonl ...]
prints per note count: families found and the smallest intervallic odd limit, then the simplest few pairs
(each with the transposition that holds the chord, shown as the chord's 1/1 in that member)."""
import collections, json, sys
from fractions import Fraction


def odd(n):
    while n % 2 == 0:
        n //= 2
    return n


def vec(r, primes):
    n, d = r.numerator, r.denominator
    v = []
    for p in primes:
        e = 0
        while n % p == 0: n //= p; e += 1
        while d % p == 0: d //= p; e -= 1
        v.append(e)
    return tuple(v)


chord = [Fraction(x) for x in sys.argv[1].split()]
hits = collections.defaultdict(list)
for path in sys.argv[2:]:
    for line in open(path):
        f = json.loads(line)
        primes = f["primes"]
        C = [vec(r, primes) for r in chord]
        q = max(max(odd(Fraction(c).numerator), odd(Fraction(c).denominator)) for c in f["interval_classes"])
        for m in f["members"]:
            # points from the ratio strings (the stored lattice is shifted against them)
            M = {vec(Fraction(x), primes) for x in m["ratios"]}
            found = None
            for sign in (1, -1):
                Cs = [tuple(sign * a for a in c) for c in C]
                for base in M:
                    t = tuple(b - a for a, b in zip(Cs[0], base))
                    if all(tuple(a + b for a, b in zip(c, t)) in M for c in Cs):
                        found = (sign, base)
                        break
                if found:
                    break
            if found:
                # lattice points and ratio strings are stored in different orders: compute the ratio
                r = Fraction(1)
                for p, e in zip(primes, found[1]):
                    r *= Fraction(p) ** e
                while r >= 2: r /= 2
                while r < 1: r *= 2
                where = str(r) + (" (inverted)" if found[0] < 0 else "")
                others = [" ".join(x["ratios"]) for x in f["members"] if x is not m]
                hits[f["notes"]].append((q, where, [" ".join(m["ratios"])] + others))
                break
print(f"chord {sys.argv[1]}: families with a member containing it (transposed or inverted)")
for k in sorted(hits):
    hs = sorted(hits[k])
    print(f"  {k} notes: {len(hs)} families, simplest intervallic odd limit {hs[0][0]}")
for k in sorted(hits):
    for q, where, ms in sorted(hits[k])[:2]:
        print(f"\n{k} notes, q = {q}, chord's 1/1 on {where}:\n   {ms[0]}\n ~ {ms[1]}")
