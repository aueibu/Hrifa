"""Round each Z-family to 12-EDO and ask what the pair becomes there.
usage: python3 tempered_z.py families.jsonl ...
Per family whose members both round to distinct pitch classes: the 12-EDO interval vectors and prime forms.
  same class  -> the two members temper to one set class (JI splits one tempered scale into a Z-pair)
  12-EDO Z    -> equal interval vectors, different set classes: also a Z-pair in 12-EDO (Forte's Z-relation)
  different   -> rounding changes the interval content
Prime forms use the most-packed-from-the-left rule (Rahn); Forte names are given for the Z-related hexachords
and the all-interval tetrachords."""
import collections, json, math, sys
from fractions import Fraction

Z_NAMES = {  # Rahn prime forms of Forte's Z-related hexachord pairs (and 4-Z15/4-Z29)
    (0, 1, 4, 6): "4-Z15", (0, 1, 3, 7): "4-Z29",
    (0, 1, 2, 3, 5, 6): "6-Z3", (0, 1, 2, 3, 4, 7): "6-Z36",
    (0, 1, 2, 4, 5, 6): "6-Z4", (0, 1, 2, 3, 4, 8): "6-Z37",
    (0, 1, 2, 5, 6, 7): "6-Z6", (0, 1, 2, 3, 7, 8): "6-Z38",
    (0, 1, 3, 4, 5, 7): "6-Z10", (0, 2, 3, 4, 5, 8): "6-Z39",
    (0, 1, 2, 4, 5, 7): "6-Z11", (0, 1, 2, 3, 5, 8): "6-Z40",
    (0, 1, 2, 4, 6, 7): "6-Z12", (0, 1, 2, 3, 6, 8): "6-Z41",
    (0, 1, 3, 4, 6, 7): "6-Z13", (0, 1, 2, 3, 6, 9): "6-Z42",
    (0, 1, 2, 4, 7, 8): "6-Z17", (0, 1, 2, 5, 6, 8): "6-Z43",
    (0, 1, 3, 4, 7, 8): "6-Z19", (0, 1, 2, 5, 6, 9): "6-Z44",
    (0, 2, 3, 5, 6, 8): "6-Z23", (0, 2, 3, 4, 6, 9): "6-Z45",
    (0, 1, 3, 4, 6, 8): "6-Z24", (0, 1, 2, 4, 6, 9): "6-Z46",
    (0, 1, 3, 5, 6, 8): "6-Z25", (0, 1, 2, 4, 7, 9): "6-Z47",
    (0, 1, 3, 5, 7, 8): "6-Z26", (0, 1, 2, 5, 7, 9): "6-Z48",
    (0, 1, 3, 5, 6, 9): "6-Z28", (0, 1, 3, 4, 7, 9): "6-Z49",
    (0, 1, 3, 6, 8, 9): "6-Z29", (0, 1, 4, 6, 7, 9): "6-Z50",
}


def pcs_of(ratios):
    pcs = [round(1200 * math.log2(Fraction(r)) / 100) % 12 for r in ratios]
    return None if len(set(pcs)) < len(pcs) else sorted(pcs)


def ivec(pcs):
    v = [0] * 6
    for i, a in enumerate(pcs):
        for b in pcs[i + 1:]:
            d = (b - a) % 12
            v[min(d, 12 - d) - 1] += 1
    return tuple(v)


def normal(pcs):
    best = None
    n = len(pcs)
    for i in range(n):
        rot = [(p - pcs[i]) % 12 for p in pcs[i:] + pcs[:i]]
        key = [rot[-1]] + [rot[j] for j in range(n - 2, 0, -1)]  # Rahn: compare from the right
        if best is None or key < best[0]:
            best = (key, rot)
    return tuple(best[1])


def prime(pcs):
    a = normal(sorted(pcs))
    b = normal(sorted((-p) % 12 for p in pcs))
    n = len(a)
    ka = [a[-1]] + [a[j] for j in range(n - 2, 0, -1)]
    kb = [b[-1]] + [b[j] for j in range(n - 2, 0, -1)]
    return a if ka <= kb else b


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


fams = {}
for path in sys.argv[1:]:
    for line in open(path):
        f = json.loads(line)
        ms = tuple(sorted(" ".join(m["ratios"]) for m in f["members"]))
        if ms not in fams:
            q = max(iol([Fraction(r) for r in m["ratios"]]) for m in f["members"])
            fams[ms] = (f["notes"], q, [m["ratios"] for m in f["members"]])

res = collections.defaultdict(lambda: collections.defaultdict(list))
for k, q, members in fams.values():
    if len(members) != 2:
        continue
    pa, pb = pcs_of(members[0]), pcs_of(members[1])
    if pa is None or pb is None:
        res[k]["collides"].append((q, members, None))
        continue
    fa, fb = prime(pa), prime(pb)
    if fa == fb:
        kind = "same class"
    elif ivec(pa) == ivec(pb):
        kind = "12-EDO Z"
    else:
        kind = "different"
    res[k][kind].append((q, members, (fa, fb, ivec(pa), ivec(pb))))

for k in sorted(res):
    print(f"== {k} notes: " + ", ".join(f"{kind} {len(v)}" for kind, v in sorted(res[k].items())))
    for kind in ("12-EDO Z", "same class"):
        rows = sorted(res[k].get(kind, []), key=lambda r: r[0])
        names = collections.Counter()
        for q, members, info in rows:
            fa, fb = info[0], info[1]
            names[tuple(sorted([Z_NAMES.get(fa, str(fa)), Z_NAMES.get(fb, str(fb))]))] += 1
        if rows:
            print(f"   {kind}: " + "; ".join(f"{' / '.join(n)} x{c}" for n, c in names.most_common(8)))
        for q, members, info in rows[:3]:
            fa, fb, va, vb = info
            print(f"     q={q}: {' '.join(members[0])} [{Z_NAMES.get(fa, fa)}]  ~  {' '.join(members[1])} [{Z_NAMES.get(fb, fb)}]  vector {''.join(map(str, va))}")
