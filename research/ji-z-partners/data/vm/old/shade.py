"""How different do the two members of a Z-pair sound? For each family (first two members), line the partner
up with the first set as well as possible (any transposition in cents, with or without inversion), matching
notes in circular order, and report the shift: the largest relative move between matched notes, in cents
(max minus min of the matched differences). Four notes moved by 81/80 against the rest gives 21.5 cents;
genuinely different sets (like 0 1 3 7 vs 0 1 4 6 in 12-EDO) give 100 cents or more.
usage: python3 shade.py families.jsonl [more.jsonl ...]
prints families per shift band for each intervallic odd limit band, then the simplest families whose shift is
at least 70 cents (sets that stay different when the commas are ignored)."""
import collections, json, math, sys
from fractions import Fraction

BANDS = [(10, "<10c"), (22, "<22c (syntonic 21.5)"), (42, "<42c (diesis 41)"), (70, "<70c"), (1e9, ">=70c")]
QBANDS = [125, 243, 405, 729, 2187, 6561, 10**9]


def odd(n):
    while n % 2 == 0:
        n //= 2
    return n


def cents(r):
    return 1200 * math.log2(float(r)) % 1200


def shift(A, B):
    k = len(A)
    a = sorted(A)
    best = 1e9
    for Bo in (B, [(-c) % 1200 for c in B]):
        b = sorted(Bo)
        for j in range(k):
            d = [b[(i + j) % k] - a[i] + (1200 if i + j >= k else 0) for i in range(k)]
            best = min(best, max(d) - min(d))
    return best


rows = []
for path in sys.argv[1:]:
    for line in open(path):
        f = json.loads(line)
        q = max(max(odd(Fraction(c).numerator), odd(Fraction(c).denominator)) for c in f["interval_classes"])
        m = f["members"]
        A = [cents(Fraction(x)) for x in m[0]["ratios"]]
        B = [cents(Fraction(x)) for x in m[1]["ratios"]]
        rows.append((q, f["notes"], shift(A, B), " ".join(m[0]["ratios"]), " ".join(m[1]["ratios"])))

print(f"{len(rows)} families")
print(f"{'odd limit':>12} {'families':>9} " + " ".join(f"{name:>22}" for _, name in BANDS))
lo = 0
for hi in QBANDS:
    sel = [r for r in rows if lo < r[0] <= hi]
    if sel:
        counts = []
        prev = -1
        for b, _ in BANDS:
            counts.append(sum(1 for r in sel if prev <= r[2] < b))
            prev = b
        label = f"{lo + 1}-{hi}" if hi < 10**9 else f">{lo}"
        print(f"{label:>12} {len(sel):9d} " + " ".join(f"{c:22d}" for c in counts))
    lo = hi
print("\nsimplest families per size whose shift is >= 70 cents (different sets even with commas ignored):")
by_k = collections.defaultdict(list)
for r in rows:
    if r[2] >= 70:
        by_k[r[1]].append(r)
for k in sorted(by_k):
    q, _, s, a, b = min(by_k[k])
    print(f"  {k} notes: {len(by_k[k])} families, simplest q = {q}, shift {s:.0f}c:  {a}  ~  {b}")
print("\nsizes with no family at >= 70 cents:", sorted({r[1] for r in rows} - set(by_k)))
