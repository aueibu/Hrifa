"""Z-families whose members have no tiny steps: smallest step (cents) between neighboring notes, octave wrap
included, for each member; a family passes threshold T when both members' smallest steps are >= T.
usage: python3 minstep.py [--min T] [--show N] families.jsonl ...   (default T = 20 cents, N = 5 per size)
Prints per note count: families passing at several thresholds, the most even family (largest smallest step),
and the N simplest families (by intervallic odd limit q) passing T."""
import collections, json, math, sys
from fractions import Fraction

args = sys.argv[1:]
T, SHOW = 20.0, 5
if "--min" in args:
    i = args.index("--min"); T = float(args[i + 1]); del args[i:i + 2]
if "--show" in args:
    i = args.index("--show"); SHOW = int(args[i + 1]); del args[i:i + 2]
LEVELS = [10, 15, 20, 25, 30, 40, 50, 70]


def odd(n):
    while n % 2 == 0:
        n //= 2
    return n


def iol(fs):
    m = 1
    for i, a in enumerate(fs):
        for b in fs[i + 1:]:
            x = b / a if b > a else a / b
            m = max(m, odd(x.numerator), odd(x.denominator))
    return m


def min_step(ratios):
    c = sorted(1200 * math.log2(Fraction(r)) for r in ratios)
    steps = [b - a for a, b in zip(c, c[1:])] + [1200 - c[-1] + c[0]]
    return min(steps)


fams = {}
for path in args:
    for line in open(path):
        f = json.loads(line)
        ms = tuple(sorted(" ".join(m["ratios"]) for m in f["members"]))
        if ms in fams:
            continue
        top = max((f["primes"][i] for m in f["members"] for v in m["lattice"] for i, e in enumerate(v) if e), default=2)
        q = max(iol([Fraction(r) for r in m["ratios"]]) for m in f["members"])
        s = min(min_step(m["ratios"]) for m in f["members"])
        fams[ms] = (f["notes"], q, top, s, [m["ratios"] for m in f["members"]])

by = collections.defaultdict(list)
for k, q, top, s, members in fams.values():
    by[k].append((q, top, s, members))
print(f"smallest step = min over both members of the smallest neighboring step (cents, octave wrap included)")
print("notes  families  " + "  ".join(f">={t:<3d}" for t in LEVELS) + "   most even (smallest step)")
for k in sorted(by):
    rows = by[k]
    best = max(rows, key=lambda r: r[2])
    print(f"{k:5d}  {len(rows):8d}  " + "  ".join(f"{sum(1 for r in rows if r[2] >= t):5d}" for t in LEVELS)
          + f"   {best[2]:.1f} c at q={best[0]}")
print()
for k in sorted(by):
    ok = sorted((r for r in by[k] if r[2] >= T), key=lambda r: (r[0], -r[2]))
    print(f"== {k} notes: {len(ok)} families with smallest step >= {T:g} c; simplest:")
    for q, top, s, members in ok[:SHOW]:
        print(f"   q={q} ({top}-limit), smallest step {s:.1f} c: " + "  ~  ".join(" ".join(m) for m in members))
