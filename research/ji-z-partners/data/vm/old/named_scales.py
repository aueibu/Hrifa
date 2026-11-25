"""Which Z-family members round (to 12-EDO pitch classes) onto named scales?
usage: python3 named_scales.py families.jsonl ...   (families from several runs are merged; duplicates dropped)

Each member's notes are rounded to the nearest semitone of its own 1/1. A member "matches" a named scale when
those pitch classes are exactly one mode of it (with the member's 1/1 as the mode's root); "rotation" means
it matches some mode with another note as root. Members whose notes collide on one semitone are skipped."""
import collections, json, math, sys
from fractions import Fraction

SCALES = {
    # 6 notes
    "whole tone": [0, 2, 4, 6, 8, 10],
    "augmented (hexatonic)": [0, 3, 4, 7, 8, 11],
    "Prometheus (Scriabin)": [0, 2, 4, 6, 9, 10],
    "blues hexatonic": [0, 3, 5, 6, 7, 10],
    "major hexatonic": [0, 2, 4, 5, 7, 9],
    "minor hexatonic": [0, 2, 3, 5, 7, 10],
    "tritone (Petrushka)": [0, 1, 4, 6, 7, 10],
    "Messiaen mode 5": [0, 1, 5, 6, 7, 11],
    "Istrian": [0, 1, 3, 4, 6, 7],
    # 7 notes
    "diatonic (major)": [0, 2, 4, 5, 7, 9, 11],
    "melodic minor": [0, 2, 3, 5, 7, 9, 11],
    "harmonic minor": [0, 2, 3, 5, 7, 8, 11],
    "harmonic major": [0, 2, 4, 5, 7, 8, 11],
    "double harmonic": [0, 1, 4, 5, 7, 8, 11],
    "Neapolitan major": [0, 1, 3, 5, 7, 9, 11],
    "Neapolitan minor": [0, 1, 3, 5, 7, 8, 11],
    "enigmatic": [0, 1, 4, 6, 8, 10, 11],
    "Persian": [0, 1, 4, 5, 6, 8, 11],
    # 8 notes
    "octatonic (diminished)": [0, 1, 3, 4, 6, 7, 9, 10],
    "bebop dominant": [0, 2, 4, 5, 7, 9, 10, 11],
    "bebop major": [0, 2, 4, 5, 7, 8, 9, 11],
    "bebop Dorian": [0, 2, 3, 4, 5, 7, 9, 10],
    "bebop melodic minor": [0, 2, 3, 5, 7, 8, 9, 11],
    "Spanish 8-tone": [0, 1, 3, 4, 5, 6, 8, 10],
    "Messiaen mode 4": [0, 1, 2, 5, 6, 7, 8, 11],
    "Messiaen mode 6": [0, 2, 4, 5, 6, 8, 10, 11],
    # 9 notes
    "Messiaen mode 3": [0, 2, 3, 4, 6, 7, 8, 10, 11],
    "blues nonatonic": [0, 2, 3, 4, 5, 7, 9, 10, 11],
    # 10 notes
    "Messiaen mode 7": [0, 1, 2, 3, 5, 6, 7, 8, 9, 11],
    # 12 notes
    "chromatic": list(range(12)),
}
MODE_NAMES = {"diatonic (major)": ["Ionian", "Dorian", "Phrygian", "Lydian", "Mixolydian", "Aeolian", "Locrian"]}


def modes(pcs):
    out = []
    for i, r in enumerate(pcs):
        out.append((i, tuple(sorted((p - r) % 12 for p in pcs))))
    return out


EXACT, ROT = {}, {}
for name, pcs in SCALES.items():
    for i, m in modes(pcs):
        label = MODE_NAMES[name][i] if name in MODE_NAMES else (name if i == 0 else f"{name}, mode {i + 1}")
        EXACT.setdefault(m, label)
    ROT[frozenset(min(m for _, m in modes(pcs)))] = name


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


def pcs_of(ratios):
    fs = [Fraction(r) for r in ratios]
    pcs = [round(1200 * math.log2(f) / 100) % 12 for f in fs]
    return None if len(set(pcs)) < len(pcs) else tuple(sorted(pcs)), fs


def classify(ratios):
    pcs, fs = pcs_of(ratios)
    if pcs is None:
        return "collides", None
    if pcs in EXACT:
        return "exact", EXACT[pcs]
    key = frozenset(min(m for _, m in modes(pcs)))
    if key in ROT:
        return "rotation", ROT[key]
    return "none", None


fams = {}
for path in sys.argv[1:]:
    for line in open(path):
        f = json.loads(line)
        ms = tuple(sorted(" ".join(m["ratios"]) for m in f["members"]))
        if ms in fams:
            continue
        top = max((f["primes"][i] for m in f["members"] for v in m["lattice"] for i, e in enumerate(v) if e), default=2)
        q = max(iol([Fraction(r) for r in m["ratios"]]) for m in f["members"])
        fams[ms] = (f["notes"], q, top, [m["ratios"] for m in f["members"]])

by_size = collections.defaultdict(list)
for k, q, top, members in fams.values():
    by_size[k].append((q, top, members))
for k in sorted(by_size):
    rows = sorted(by_size[k], key=lambda r: r[0])
    tally = collections.Counter()
    both = []
    for q, top, members in rows:
        cls = [classify(m) for m in members]
        for kind, name in cls:
            tally[(kind, name)] += 1
        if all(kind in ("exact", "rotation") for kind, _ in cls):
            both.append((q, top, members, cls))
    print(f"== {k} notes: {len(rows)} families")
    for (kind, name), n in sorted(tally.items(), key=lambda x: (-x[1])):
        if kind in ("exact", "rotation"):
            print(f"   {n:5d} members  {kind:8s} {name}")
    print(f"   {sum(n for (kind, _), n in tally.items() if kind == 'collides')} members collide on a semitone; "
          f"{sum(n for (kind, _), n in tally.items() if kind == 'none')} match no listed scale")
    for q, top, members, cls in both[:6]:
        print(f"   both named, q={q}, {top}-limit: " + "  ~  ".join(
            f"{' '.join(m)} [{c[1]}{'' if c[0] == 'exact' else ' (another root)'}]" for m, c in zip(members, cls)))
    # simplest family with at least one named member
    for q, top, members in rows:
        cls = [classify(m) for m in members]
        if any(kind in ("exact", "rotation") for kind, _ in cls):
            print(f"   simplest with a named member, q={q}: " + "  ~  ".join(
                f"{' '.join(m)} [{c[1] or c[0]}]" for m, c in zip(members, cls)))
            break
